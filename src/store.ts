import Model from '../ui/model.js';
import Reviews from '../ui/reviews.js';

export interface Task {
  id:string; title:string; date:string; note:string; importance:number; urgency:number;
  done:boolean; planId:string; schedule:{start:number;duration:number}|null;
  nodes:{id:string;text:string;done:boolean}[];
}
export interface FileRecord {name:string;modified:number;opened:number}
export interface ReviewRecord {id:string;path:string;stage:number;due:string|null;joined:string;history:string[];status:'active'|'completed'|'exited'}
export interface ReviewAction {type:'join'|'complete'|'exit';path?:string;id?:string;stage?:number;due?:string|null}
export interface ReviewSnapshot {reviews:ReviewRecord[];reviewRevision:number;message?:string}
export interface Data {
  version:1; tasks:Task[];
  plans:{id:string;title:string;start:string;end:string;importance:number;urgency:number}[];
  courses:{id:string;name:string;code:string;teacher:string;place:string;day:number;start:number;end:number;importance:number;urgency:number;semester?:string;activeFrom?:string;activeTo?:string;scheduleId?:string}[];
  unscheduled:{name:string;code:string;reason?:string}[];
  files:FileRecord[]; courseSource:string; theme:'auto'|'light'|'dark';
  reviews?:ReviewRecord[];reviewRevision?:number;
  academicPlanner?:{kind:'zju-academic-plan';schemaVersion:2;terms:unknown[];placements:unknown[];[key:string]:unknown};
}
export const STYLES={studio:'澄光 · Studio',linen:'纸间 · Linen',slate:'夜航 · Slate',garden:'森息 · Garden'};
export type Style=keyof typeof STYLES;
export interface Preferences {openOnStartup:boolean;style:Style;widgets?:string[];reviewNewNotes?:boolean}
export interface Saved {schemaVersion:1;data:Data;recent:Record<string,number>;settings?:Preferences}
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export function emptyData():Data {return {version:1,tasks:[],plans:[],courses:[],unscheduled:[],files:[],reviews:[],reviewRevision:0,courseSource:'尚未导入课表',theme:'auto'};}
export function isData(value:unknown):value is Data {return Model.validate(value);}
export function mapPath(path:string,oldPath:string,newPath:string):string {
  return path===oldPath?newPath:path.startsWith(oldPath+'/')?newPath+path.slice(oldPath.length):path;
}

/** The UI owns task edits; file history and path changes are owned by the host. */
export class HomeStore {
  data:Data=emptyData();
  recent:Record<string,number>={};
  settings:Preferences={openOnStartup:true,style:'studio'};
  private tail:Promise<void>=Promise.resolve();
  constructor(private write:(snapshot:Saved)=>Promise<void>) {}
  load(raw:unknown):void {
    if(raw==null)return;
    if(isData(raw)){this.data=copy(raw);this.recent=Object.fromEntries(raw.files.filter(f=>f.opened>0).map(f=>[f.name,f.opened]));this.data.files=[];this.migrateReviews();return;}
    const s=raw as Partial<Saved>;
    if(!s||s.schemaVersion!==1||!isData(s.data)||!s.recent||typeof s.recent!=='object'||Array.isArray(s.recent)||!Object.values(s.recent).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0))throw new Error('i-home 数据格式不受支持，原文件未改动');
    this.data=copy(s.data);this.data.files=[];this.recent=copy(s.recent);this.migrateReviews();
    if(s.settings){this.settings={openOnStartup:typeof s.settings.openOnStartup==='boolean'?s.settings.openOnStartup:true,style:Object.prototype.hasOwnProperty.call(STYLES,s.settings.style)?s.settings.style:'studio'};if(typeof s.settings.reviewNewNotes==='boolean')this.settings.reviewNewNotes=s.settings.reviewNewNotes;if(Array.isArray(s.settings.widgets))this.settings.widgets=[...new Set(s.settings.widgets.filter(id=>['today','notes','plans','ebbinghaus'].includes(id)))];}
  }
  private migrateReviews():void{this.data.reviews??=[];this.data.reviewRevision??=0;}
  reviews():ReviewSnapshot{return copy({reviews:this.data.reviews||[],reviewRevision:this.data.reviewRevision||0});}
  async reviewAction(action:ReviewAction,day=Reviews.iso(new Date())):Promise<ReviewSnapshot>{
    const result=Reviews.apply(this.data.reviews||[],action,day);
    if(result.changed){this.data.reviews=result.records;this.data.reviewRevision=(this.data.reviewRevision||0)+1;await this.flush();}
    return {...this.reviews(),message:result.reason};
  }
  async created(path:string,day=Reviews.iso(new Date())):Promise<void>{
    if(this.settings.reviewNewNotes===false||!(/\.md$/i.test(path)))return;
    await this.reviewAction({type:'join',path},day);
  }
  async reconcileReviews(paths:string[]):Promise<void>{
    const existing=new Set(paths),records=this.data.reviews||[],next=records.filter(r=>existing.has(r.path));
    if(next.length===records.length)return;
    this.data.reviews=next;this.data.reviewRevision=(this.data.reviewRevision||0)+1;await this.flush();
  }
  snapshot():Saved {return copy({schemaVersion:1,data:this.data,recent:this.recent,settings:this.settings});}
  setPreferences(patch:Partial<Preferences>):Promise<void>{this.settings={...this.settings,...patch};return this.flush();}
  flush():Promise<void>{
    const snapshot=this.snapshot();
    const pending=this.tail.catch(()=>{}).then(()=>this.write(snapshot));
    this.tail=pending;return pending;
  }
  saveUI(raw:unknown):Promise<void>{
    if(!isData(raw))return Promise.reject(new Error('任务数据校验失败'));
    const next=copy(raw);
    // The host owns review/file events. A delayed task save or undo must not resurrect a deleted review.
    next.reviews=copy(this.data.reviews||[]);next.reviewRevision=this.data.reviewRevision||0;
    next.files=[];this.data=next;return this.flush();
  }
  restoreUI(raw:unknown):Promise<void>{
    if(!isData(raw))return Promise.reject(new Error('备份数据校验失败'));
    const next=copy(raw);next.files=[];
    next.reviews=next.reviews||[];next.reviewRevision=(this.data.reviewRevision||0)+1;
    this.data=next;return this.flush();
  }
  rename(oldPath:string,path:string):Promise<void>{
    this.data.tasks.forEach(t=>t.note=mapPath(t.note,oldPath,path));
    const next=Reviews.rename(this.data.reviews||[],oldPath,path);
    if(JSON.stringify(next)!==JSON.stringify(this.data.reviews||[])){this.data.reviews=next;this.data.reviewRevision=(this.data.reviewRevision||0)+1;}
    this.recent=Object.fromEntries(Object.entries(this.recent).map(([p,time])=>[mapPath(p,oldPath,path),time]));
    return this.flush();
  }
  opened(path:string,time=Date.now()):Promise<void>{
    this.recent[path]=time;
    this.recent=Object.fromEntries(Object.entries(this.recent).sort((a,b)=>b[1]-a[1]).slice(0,100));
    return this.flush();
  }
  deleted(path:string):Promise<void>{
    for(const p of Object.keys(this.recent))if(p===path||p.startsWith(path+'/'))delete this.recent[p];
    const next=Reviews.remove(this.data.reviews||[],path);
    if(next.length!==(this.data.reviews||[]).length){this.data.reviews=next;this.data.reviewRevision=(this.data.reviewRevision||0)+1;}
    // Retain links so the UI can show a missing file and offer relinking.
    return this.flush();
  }
}
