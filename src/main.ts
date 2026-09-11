import {App, FuzzySuggestModal, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf} from 'obsidian';
import {Data, FileRecord, HomeStore, Preferences, ReviewAction, ReviewSnapshot, STYLES, Style} from './store';
import html from '../ui/index.html?text';
import css from '../ui/styles.css?text';
import motionCss from '../ui/motion.css?text';
import reviewCss from '../ui/reviews.css?text';
import zipScript from '../ui/vendor/jszip.min.js?text';
import modelScript from '../ui/model.js?text';
import reviewScript from '../ui/reviews.js?text';
import motionScript from '../ui/motion.js?text';
import importScript from '../ui/xlsx-import.js?text';
import appScript from '../ui/app.js?text';

const VIEW='i-home-view';
interface Rename {oldPath:string;path:string}
interface UI {newTask:(note?:string)=>void;syncFiles:(files:FileRecord[],rename?:Rename)=>void;syncTheme:(theme:string)=>void;syncPreferences:(preferences:Preferences)=>void;syncReviews?:(snapshot:ReviewSnapshot)=>void}
interface Host {
  initialData:Data;version:string;theme:string;
  save:(data:unknown)=>Promise<void>;pickMarkdown:()=>Promise<string|null>;openMarkdown:(path:string)=>Promise<void>;
  reviewAction:(action:ReviewAction)=>Promise<ReviewSnapshot>;restore:(data:unknown)=>Promise<ReviewSnapshot>;
  files:()=>FileRecord[];
  preferences:Preferences;setWidgets:(widgets:string[])=>Promise<void>;setStyle:(style:Style)=>Promise<void>;
}
type FrameWindow=Window&{IHomeHost?:Host;IHomeUI?:UI};

class MarkdownPicker extends FuzzySuggestModal<TFile> {
  private settled=false;
  constructor(app:App,private resolve:(path:string|null)=>void){super(app);this.setPlaceholder('搜索 Markdown 标题或完整路径…');}
  getItems():TFile[]{return this.app.vault.getMarkdownFiles();}
  getItemText(file:TFile):string{return file.path;}
  onChooseItem(file:TFile):void{this.settled=true;this.resolve(file.path);}
  onClose():void{super.onClose();setTimeout(()=>{if(!this.settled){this.settled=true;this.resolve(null);}},0);}
}

export default class IHomePlugin extends Plugin {
  store!:HomeStore;
  activeHome:HomeView|null=null;
  private catalogTimer:number|null=null;
  private alive=false;
  private vaultReady=false;
  private opening:Promise<HomeView|null>|null=null;
  async onload():Promise<void>{
    this.store=new HomeStore(snapshot=>this.saveData(snapshot));
    try{this.store.load(await this.loadData());}catch(error){new Notice(String(error),10000);throw error;}
    this.alive=true;
    this.registerView(VIEW,leaf=>new HomeView(leaf,this));
    this.addSettingTab(new HomeSettings(this.app,this));
    this.app.workspace.onLayoutReady(()=>{if(!this.alive)return;this.vaultReady=true;void this.store.reconcileReviews(this.files().map(f=>f.name)).then(()=>this.syncReviews()).catch(()=>this.saveError());if(this.store.settings.openOnStartup)void this.openHome().catch(()=>new Notice('i-home 未能自动打开，可从命令面板重试。'));});
    this.addRibbonIcon('house','打开 i-home',()=>{void this.openHome();});
    this.addCommand({id:'open-home',name:'打开主页',callback:()=>{void this.openHome();}});
    this.addCommand({id:'new-task',name:'新建任务',callback:()=>{void this.openHome().then(v=>v?.ui?.newTask());}});
    this.addCommand({id:'task-for-note',name:'为当前笔记创建关联任务',checkCallback:checking=>{
      const file=this.app.workspace.getActiveFile();if(!file||file.extension!=='md')return false;
      if(!checking)void this.openHome().then(v=>v?.ui?.newTask(file.path));return true;
    }});
    for(const type of ['join','exit'] as const)this.addCommand({id:type==='join'?'review-current-note':'exit-review-current-note',name:type==='join'?'将当前笔记加入 Ebbinghaus 复习':'将当前笔记退出 Ebbinghaus 复习',checkCallback:checking=>{
      const file=this.app.workspace.getActiveFile();if(!file||file.extension!=='md'||(type==='exit'&&!this.store.data.reviews?.some(r=>r.path===file.path&&r.status==='active')))return false;
      if(!checking)void this.reviewNote(file.path,type);return true;
    }});
    this.registerEvent(this.app.workspace.on('file-menu',(menu,file)=>{
      if(!(file instanceof TFile)||file.extension!=='md')return;
      const active=this.store.data.reviews?.some(r=>r.path===file.path&&r.status==='active');
      menu.addItem(item=>item.setTitle(active?'退出 Ebbinghaus 复习':'加入 Ebbinghaus 复习').setIcon('brain').onClick(()=>{void this.reviewNote(file.path,active?'exit':'join');}));
    }));
    this.registerEvent(this.app.workspace.on('file-open',file=>{if(file?.extension==='md'){void this.store.opened(file.path).catch(()=>this.saveError());this.queueCatalog();}}));
    this.registerEvent(this.app.vault.on('create',file=>{if(this.vaultReady&&file instanceof TFile&&file.extension==='md')void this.store.created(file.path).then(()=>this.syncReviews()).catch(()=>{this.syncReviews();this.saveError();});this.queueCatalog();}));
    this.registerEvent(this.app.vault.on('modify',()=>this.queueCatalog()));
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
      void this.store.rename(oldPath,file.path).catch(()=>this.saveError());this.updateCatalog({oldPath,path:file.path});
    }));
    this.registerEvent(this.app.vault.on('delete',file=>{void this.store.deleted(file.path).catch(()=>this.saveError());this.updateCatalog();}));
    this.registerEvent(this.app.workspace.on('css-change',()=>this.activeHome?.ui?.syncTheme(this.theme())));
    this.register(()=>{if(this.catalogTimer!==null)window.clearTimeout(this.catalogTimer);});
  }
  private saveError():void{new Notice('i-home 保存失败。请在主页导出备份；当前数据仍保留在内存中。');}
  private syncReviews():void{this.activeHome?.ui?.syncReviews?.(this.store.reviews());}
  async reviewAction(action:ReviewAction):Promise<ReviewSnapshot>{
    if(action.type==='join'){const file=this.app.vault.getAbstractFileByPath(action.path||'');if(!(file instanceof TFile)||file.extension!=='md')throw new Error('笔记已移除，请重新选择。');}
    try{const snapshot=await this.store.reviewAction(action);this.syncReviews();return snapshot;}catch(error){this.syncReviews();throw error;}
  }
  private async reviewNote(path:string,type:'join'|'exit'):Promise<void>{
    const record=this.store.data.reviews?.find(r=>r.path===path&&r.status==='active');
    try{const result=await this.reviewAction(type==='join'?{type,path}:{type,id:record?.id});if(result.message)new Notice(result.message);}catch{this.saveError();}
  }
  theme():string{return document.body.classList.contains('theme-dark')?'dark':'light';}
  files():FileRecord[]{return this.app.vault.getMarkdownFiles().map(f=>({name:f.path,modified:f.stat.mtime,opened:this.store.recent[f.path]||0}));}
  private queueCatalog():void{if(this.catalogTimer!==null)window.clearTimeout(this.catalogTimer);this.catalogTimer=window.setTimeout(()=>{this.catalogTimer=null;this.updateCatalog();},150);}
  private updateCatalog(rename?:Rename):void{this.activeHome?.ui?.syncFiles(this.files(),rename);this.syncReviews();}
  async restore(data:unknown):Promise<ReviewSnapshot>{await this.store.restoreUI(data);await this.store.reconcileReviews(this.files().map(f=>f.name));this.updateCatalog();return this.store.reviews();}
  async openMarkdown(path:string):Promise<void>{
    const file=this.app.vault.getAbstractFileByPath(path);
    if(!(file instanceof TFile)||file.extension!=='md')throw new Error('笔记已移除或路径已失效，请更换关联。');
    // Reuse an existing note tab. Keep the home leaf intact when opening a new one.
    const existing=this.app.workspace.getLeavesOfType('markdown').find(leaf=>leaf.view.getState().file===file.path);
    if(existing){await this.app.workspace.revealLeaf(existing);return;}
    await this.app.workspace.getLeaf('tab').openFile(file,{active:true});
  }
  pickMarkdown():Promise<string|null>{return new Promise(resolve=>new MarkdownPicker(this.app,resolve).open());}
  async updatePreferences(patch:Partial<Preferences>):Promise<void>{
    try{await this.store.setPreferences(patch);this.activeHome?.ui?.syncPreferences(this.store.settings);}catch(error){this.activeHome?.ui?.syncPreferences(this.store.settings);this.saveError();throw error;}
  }
  openHome():Promise<HomeView|null>{
    if(this.opening)return this.opening;
    this.opening=this.activateHome().finally(()=>{this.opening=null;});return this.opening;
  }
  private async activateHome():Promise<HomeView|null>{
    let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];
    if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}
    await this.app.workspace.revealLeaf(leaf);
    const view=leaf.view;if(!(view instanceof HomeView))return null;
    await view.ready;return this.activeHome||view;
  }
  onunload():void{this.alive=false;this.vaultReady=false;this.app.workspace.detachLeavesOfType(VIEW);}
}

class HomeSettings extends PluginSettingTab {
  constructor(app:App,private plugin:IHomePlugin){super(app,plugin);}
  display():void{
    this.containerEl.empty();this.containerEl.createEl('h2',{text:'i-home'});
    new Setting(this.containerEl).setName('启动时打开 i-home').setDesc('笔记库布局载入后进入主页；关闭后不再自动切换，保留 Obsidian 自身的会话恢复。').addToggle(toggle=>toggle.setValue(this.plugin.store.settings.openOnStartup).onChange(async value=>{try{await this.plugin.updatePreferences({openOnStartup:value});}catch{}}));
    new Setting(this.containerEl).setName('界面风格').setDesc('所有风格均适配明暗主题，也可在主页右上角即时切换。').addDropdown(drop=>drop.addOptions(STYLES).setValue(this.plugin.store.settings.style).onChange(async value=>{try{await this.plugin.updatePreferences({style:value as Style});}catch{}}));
    new Setting(this.containerEl).setName('新建笔记自动加入 Ebbinghaus').setDesc('启用后新建的 Markdown 笔记自动进入复习。已有笔记需手动加入；间隔为每次完成后的 1、3、7、15、31 天。').addToggle(toggle=>toggle.setValue(this.plugin.store.settings.reviewNewNotes!==false).onChange(async value=>{try{await this.plugin.updatePreferences({reviewNewNotes:value});}catch{}}));
  }
}

export class HomeView extends ItemView {
  private frame:HTMLIFrameElement|null=null;
  private resolveReady:()=>void=()=>{};
  ready:Promise<void>=new Promise(resolve=>{this.resolveReady=resolve;});
  get ui():UI|undefined{return (this.frame?.contentWindow as FrameWindow|null)?.IHomeUI;}
  constructor(leaf:WorkspaceLeaf,private plugin:IHomePlugin){super(leaf);}
  getViewType():string{return VIEW;}
  getDisplayText():string{return 'i-home';}
  getIcon():string{return 'house';}
  async onOpen():Promise<void>{
    this.contentEl.empty();this.contentEl.addClass('i-home-view');
    if(this.plugin.activeHome&&this.plugin.activeHome!==this){
      const button=this.contentEl.createEl('button',{text:'i-home 已在另一标签页打开，前往主页'});button.onclick=()=>{if(this.plugin.activeHome)void this.app.workspace.revealLeaf(this.plugin.activeHome.leaf);else void this.onOpen();};this.resolveReady();return;
    }
    this.plugin.activeHome=this;
    const frame=this.contentEl.createEl('iframe',{cls:'i-home-frame',attr:{title:'i-home 时间主页'}});this.frame=frame;
    // A separate document preserves the approved layout and confines CSS/dialogs to this view.
    frame.addEventListener('load',()=>{
      if(this.frame!==frame)return;
      const win=frame.contentWindow as FrameWindow|null,doc=frame.contentDocument;if(!win||!doc){this.resolveReady();return;}
      win.IHomeHost={initialData:{...this.plugin.store.snapshot().data,files:this.plugin.files()},version:this.plugin.manifest.version,theme:this.plugin.theme(),preferences:{...this.plugin.store.settings},setStyle:style=>this.plugin.updatePreferences({style}),setWidgets:widgets=>this.plugin.updatePreferences({widgets}),files:()=>this.plugin.files(),save:async data=>{await this.plugin.store.saveUI(data);this.ui?.syncReviews?.(this.plugin.store.reviews());},reviewAction:action=>this.plugin.reviewAction(action),restore:data=>this.plugin.restore(data),pickMarkdown:()=>this.plugin.pickMarkdown(),openMarkdown:path=>this.plugin.openMarkdown(path)};
      const style=doc.createElement('style');style.textContent=[css,motionCss,reviewCss].join('\n');doc.head.append(style);
      for(const source of [zipScript,modelScript,reviewScript,importScript,motionScript,appScript]){const script=doc.createElement('script');script.textContent='(function(module,exports,define){\n'+source+'\n}).call(window,undefined,undefined,undefined);';doc.body.append(script);}
      this.resolveReady();
    },{once:true});
    frame.srcdoc=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  }
  async onClose():Promise<void>{
    if(this.plugin.activeHome===this)this.plugin.activeHome=null;
    this.frame?.remove();this.frame=null;this.contentEl.empty();this.resolveReady();
  }
}
