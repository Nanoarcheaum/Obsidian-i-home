(function (root) {
  'use strict';
  const periods=['08:00–08:45','08:50–09:35','10:00–10:45','10:50–11:35','11:40–12:25','13:25–14:10','14:15–15:00','15:05–15:50','16:15–17:00','17:05–17:50','18:50–19:35','19:40–20:25','20:30–21:15'];
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const date=s=>{const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);};
  const add=(s,n)=>{const d=date(s);d.setDate(d.getDate()+n);return iso(d);};
  const monday=s=>add(s,-((date(s).getDay()+6)%7));
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&iso(date(s))===s;
  const tone=x=>x.importance>=50?(x.urgency>=50?'do':'plan'):(x.urgency>=50?'delegate':'later');
  const progress=t=>t.nodes.length?Math.round(t.nodes.filter(n=>n.done).length/t.nodes.length*100):(t.done?100:0);
  const uid=()=>root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function schedule(task,start,duration){task.schedule=start===null?null:{start:Math.max(1,Math.min(13,Number(start))),duration:Math.max(1,Math.min(14-Number(start),Number(duration)))};}
  function initial(seed,today){const year=date(today).getFullYear();return {version:1,tasks:seed.tasks.map((t,i)=>({id:uid(),title:t.title,date:add(today,[0,0,2,4,7,12,19][i]),note:'',importance:t.importance,urgency:t.urgency,done:false,nodes:t.nodes.map(n=>({id:uid(),text:n.text,done:n.done})),schedule:null,planId:''})),plans:seed.plans.map(p=>({id:uid(),title:p.title,start:`${year}-${String(p.start).padStart(2,'0')}-01`,end:iso(new Date(year,p.end,0)),importance:p.importance,urgency:p.urgency})),courses:seed.courses.map(c=>({...c,id:uid(),importance:70,urgency:30})),unscheduled:[{name:'交叉科研轮转 1',code:'FUTR2003MZ'},{name:'交叉科研轮转 2',code:'FUTR2004MZ'}],files:[],reviews:[],reviewRevision:0,courseSource:'示例课表 · 可导入替换',theme:'auto'};}
  function validateReviews(records){
    if(!Array.isArray(records)||new Set(records.map(r=>r?.id)).size!==records.length||new Set(records.map(r=>r?.path)).size!==records.length)return false;
    return records.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&typeof r.path==='string'&&/\.md$/i.test(r.path)&&Number.isInteger(r.stage)&&r.stage>=0&&r.stage<=5&&validDate(r.joined)&&Array.isArray(r.history)&&r.history.length===r.stage&&r.history.every((d,i)=>validDate(d)&&d>=(i?r.history[i-1]:r.joined))&&((r.status==='active'&&r.stage<5&&validDate(r.due)&&r.due>(r.history.at(-1)||r.joined))||(r.status==='completed'&&r.stage===5&&r.due===null)||(r.status==='exited'&&r.stage<5&&r.due===null)));
  }
  function validate(d){
    const text=x=>typeof x==='string',priority=x=>Number.isFinite(x.importance)&&x.importance>=0&&x.importance<=100&&Number.isFinite(x.urgency)&&x.urgency>=0&&x.urgency<=100;
    const slot=s=>s===null||(s&&Number.isInteger(s.start)&&s.start>=1&&s.start<=13&&Number.isInteger(s.duration)&&s.duration>=1&&s.start+s.duration<=14);
    if(!d||d.version!==1||!['tasks','plans','courses','unscheduled','files'].every(k=>Array.isArray(d[k])))return false;
    if(d.reviews!==undefined&&!validateReviews(d.reviews))return false;
    if(d.reviewRevision!==undefined&&(!Number.isSafeInteger(d.reviewRevision)||d.reviewRevision<0))return false;
    if(!d.tasks.every(t=>text(t.id)&&text(t.title)&&validDate(t.date)&&text(t.note)&&text(t.planId)&&typeof t.done==='boolean'&&priority(t)&&slot(t.schedule)&&Array.isArray(t.nodes)&&t.nodes.every(n=>text(n.id)&&text(n.text)&&typeof n.done==='boolean')))return false;
    if(!d.plans.every(p=>text(p.id)&&text(p.title)&&validDate(p.start)&&validDate(p.end)&&p.start<=p.end&&priority(p)))return false;
    if(!d.courses.every(c=>text(c.id)&&text(c.name)&&text(c.place)&&text(c.code)&&text(c.teacher)&&Number.isInteger(c.day)&&c.day>=1&&c.day<=7&&Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.start>=1&&c.end<=13&&c.start<=c.end&&priority(c)))return false;
    if(!d.unscheduled.every(c=>text(c.name)&&text(c.code))||!d.files.every(f=>text(f.name)&&Number.isFinite(f.modified)&&Number.isFinite(f.opened)))return false;
    return ['tasks','plans','courses'].every(k=>new Set(d[k].map(x=>x.id)).size===d[k].length)&&['auto','light','dark'].includes(d.theme)&&text(d.courseSource);
  }
  const api={periods,iso,date,add,monday,validDate,tone,progress,uid,schedule,initial,validate,validateReviews};if(typeof module!=='undefined')module.exports=api;else root.IHome=api;
})(typeof window!=='undefined'?window:globalThis);
