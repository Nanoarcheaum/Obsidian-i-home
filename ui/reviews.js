(function(root){
  'use strict';
  const intervals=Object.freeze([1,3,7,15,31]);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const date=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12);};
  const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&iso(date(s))===s;
  const add=(s,n)=>{const d=date(s);d.setDate(d.getDate()+n);return iso(d);};
  const days=(a,b)=>Math.round((Date.UTC(...a.split('-').map((v,i)=>Number(v)-(i===1?1:0)))-Date.UTC(...b.split('-').map((v,i)=>Number(v)-(i===1?1:0))))/86400000);
  const uid=()=>root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const name=path=>path.split('/').pop().replace(/\.md$/i,'');
  function apply(records,action,day=iso(new Date())){
    const result=clone(records||[]);
    const no=reason=>({records:result,changed:false,reason});
    if(!validDay(day))return no('日期无效');
    if(action.type==='join'){
      if(typeof action.path!=='string'||!action.path.trim()||!(/\.md$/i.test(action.path)))return no('请选择 Markdown 笔记');
      const existing=result.find(r=>r.path===action.path);
      if(existing?.status==='active')return no('这篇笔记已在复习循环中');
      const next={id:uid(),path:action.path,stage:0,due:add(day,intervals[0]),joined:day,history:[],status:'active'};
      if(existing)result.splice(result.indexOf(existing),1,next);else result.push(next);
      return {records:result,changed:true,reason:'已加入复习，明天开始第一轮'};
    }
    const record=result.find(r=>r.id===action.id);
    if(!record||record.status!=='active')return no('这项复习已更新');
    if(action.type==='exit'){record.status='exited';record.due=null;return {records:result,changed:true,reason:'已退出复习循环，笔记保留'};}
    if(action.type!=='complete')return no('无法识别的复习操作');
    // The stage and due date are an operation token: double-clicks and stale views cannot advance twice.
    if(record.stage!==action.stage||record.due!==action.due)return no('这项复习已更新');
    if(record.due>day)return no('这篇笔记还未到复习日');
    record.history.push(day);record.stage++;
    record.status=record.stage===intervals.length?'completed':'active';
    record.due=record.status==='active'?add(day,intervals[record.stage]):null;
    return {records:result,changed:true,reason:record.status==='completed'?'五轮复习完成，已收入完成记录':`已复习，下次 ${record.due.slice(5).replace('-','/')}`};
  }
  function queue(records,day=iso(new Date())){
    const active=(records||[]).filter(r=>r.status==='active').sort((a,b)=>a.due.localeCompare(b.due)||a.path.localeCompare(b.path));
    return {overdue:active.filter(r=>r.due<day),today:active.filter(r=>r.due===day),upcoming:active.filter(r=>r.due>day),completed:(records||[]).filter(r=>r.status==='completed'),exited:(records||[]).filter(r=>r.status==='exited')};
  }
  function rename(records,oldPath,newPath){return (records||[]).map(r=>({...clone(r),path:r.path===oldPath?newPath:r.path.startsWith(oldPath+'/')?newPath+r.path.slice(oldPath.length):r.path})).filter(r=>/\.md$/i.test(r.path));}
  function remove(records,path){return (records||[]).filter(r=>r.path!==path&&!r.path.startsWith(path+'/'));}
  function init(options){
    const {getData,mutate,chooseNote,openNote,toast,host}=options;
    const today=options.today||(()=>iso(new Date()));
    let container=null,tab='due',busy=false,disposed=false,lastDay=today(),pendingFocus=null;
    const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
    const button=(text,cls,action,label)=>{const b=el('button',cls,text);b.type='button';b.dataset.focusKey='review-'+(label||text);if(label)b.setAttribute('aria-label',label);b.disabled=busy;b.addEventListener('click',action);return b;};
    function sync(snapshot){
      if(!snapshot||!Array.isArray(snapshot.reviews))return;
      const data=getData();if((snapshot.reviewRevision||0)<(data.reviewRevision||0))return;
      data.reviews=clone(snapshot.reviews);data.reviewRevision=snapshot.reviewRevision||0;
      if(container?.isConnected)render(container);
    }
    async function dispatch(action){
      if(busy||disposed)return;
      pendingFocus=document.activeElement?.dataset.focusKey||null;busy=true;if(container?.isConnected)render(container);
      try{
        if(host?.reviewAction){const snapshot=await host.reviewAction(action);sync(snapshot);if(snapshot.message)toast(snapshot.message);}
        else{
          const result=apply(getData().reviews||[],action,today());
          if(result.changed)mutate(()=>{getData().reviews=result.records;getData().reviewRevision=(getData().reviewRevision||0)+1;},result.reason);
          else toast(result.reason);
        }
      }catch(error){toast(error?.message||'复习进度未能保存，请重试');}
      finally{busy=false;if(container?.isConnected)render(container);pendingFocus=null;}
    }
    async function addNote(){try{const path=await chooseNote();if(path)await dispatch({type:'join',path});}catch(error){toast(error?.message||'未能选择笔记');}}
    function render(target){
      container=target;const oldScroll=target.querySelector('.review-list')?.scrollTop||0,dragHandle=target.querySelector('.widget-drag-handle'),activeKey=(target.contains(document.activeElement)?document.activeElement?.dataset.focusKey:null)||pendingFocus;
      const data=getData(),day=today(),group=queue(data.reviews,day),dueCount=group.overdue.length+group.today.length;
      target.replaceChildren();target.classList.add('review-widget');target.dataset.reviewCount=String(dueCount);
      const head=el('div','section-head review-head'),title=el('div','review-title');title.append(el('span','eyebrow','SPACED REPETITION'),el('h3','','Ebbinghaus'));
      const addButton=button('＋ 加入','text-button',addNote,'加入笔记到 Ebbinghaus');head.append(title,addButton);if(dragHandle)head.append(dragHandle);target.append(head);
      const rhythm=el('div','review-rhythm');rhythm.setAttribute('aria-label','复习间隔：1、3、7、15、31 天');rhythm.title='首次在加入后 1 天复习，之后从每次实际完成日期起，依次间隔 3、7、15、31 天。';intervals.forEach((n,i)=>{const step=el('span','review-rhythm-step');step.append(el('b','',String(n)),el('small','','天'));step.dataset.stage=String(i+1);rhythm.append(step);});target.append(rhythm);
      const summary=el('p','review-summary',dueCount?`${dueCount} 篇等待重温${group.overdue.length?` · ${group.overdue.length} 篇逾期`:''}`:'今天的记忆，已妥善安放');summary.setAttribute('aria-live','polite');target.append(summary);
      const tabs=el('div','review-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','复习队列');
      for(const [id,label,count] of [['due','待复习',dueCount],['upcoming','后续',group.upcoming.length],['archive','记录',group.completed.length+group.exited.length]]){const b=button(`${label} ${count}`,'review-tab'+(tab===id?' active':''),()=>{tab=id;render(target);});b.dataset.focusKey='review-tab-'+id;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===id));b.tabIndex=tab===id?0:-1;b.id='review-tab-'+id;b.setAttribute('aria-controls','review-panel');b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const order=['due','upcoming','archive'],index=order.indexOf(tab);tab=event.key==='Home'?'due':event.key==='End'?'archive':order[(index+(event.key==='ArrowRight'?1:2))%3];render(target);target.querySelector('#review-tab-'+tab)?.focus();});tabs.append(b);}target.append(tabs);
      const list=el('div','review-list');list.id='review-panel';list.setAttribute('role','tabpanel');list.setAttribute('aria-labelledby','review-tab-'+tab);target.append(list);
      const rows=tab==='due'?[...group.overdue,...group.today]:tab==='upcoming'?group.upcoming:[...group.completed,...group.exited];
      if(!rows.length){const empty=el('div','review-empty');empty.append(el('span','review-empty-mark',tab==='archive'?'∞':'✦'),el('strong','',tab==='due'?'给记忆一点时间':tab==='upcoming'?'下一次相遇，从一篇笔记开始':'每一轮重温，都在这里留下足迹'),el('p','muted small',tab==='due'?(group.upcoming[0]?`下次复习 ${group.upcoming[0].due.slice(5).replace('-','/')} · ${name(group.upcoming[0].path)}`:'加入一篇笔记，明天开始第一轮复习。'):tab==='upcoming'?'新建笔记会按设置自动加入，也可手动选择。':'完成或退出复习后，可随时重新加入。'));list.append(empty);}
      for(const record of rows){
        const row=el('article','review-row'+(record.due&&record.due<day?' overdue':''));row.dataset.reviewId=record.id;
        const identity=el('div','review-identity'),link=button(name(record.path),'review-note',()=>Promise.resolve(openNote(record.path)).catch(error=>toast(error?.message||'笔记无法打开')),`打开笔记：${record.path}`);link.title=record.path;identity.append(link);
        const status=record.status==='completed'?'五轮完成':record.status==='exited'?'已退出':record.due<day?`逾期 ${days(day,record.due)} 天`:record.due===day?'今天':`${record.due.slice(5).replace('-','/')} · ${days(record.due,day)} 天后`;
        identity.append(el('span','review-meta',`${status} · ${record.stage} / 5 已完成`));row.append(identity);
        const stages=el('div','review-stages');stages.setAttribute('aria-label',`已完成 ${record.stage} 轮，共 5 轮`);intervals.forEach((n,i)=>{const dot=el('span',(i<record.stage?'done':i===record.stage&&record.status==='active'?'current':''));dot.title=`第 ${i+1} 轮 · 间隔 ${n} 天`;stages.append(dot);});row.append(stages);
        const actions=el('div','review-actions');if(record.status==='active'){
          if(record.due<=day)actions.append(button('✓ 已复习','review-complete',()=>dispatch({type:'complete',id:record.id,stage:record.stage,due:record.due}),`已复习：${name(record.path)}`));
          actions.append(button('退出','review-exit',()=>dispatch({type:'exit',id:record.id}),`退出复习：${name(record.path)}`));
        }else actions.append(button('重新加入','text-button',()=>dispatch({type:'join',path:record.path})));row.append(actions);list.append(row);
      }
      list.scrollTop=oldScroll;
      const note=el('p','review-footnote','每次完成后，按下一段间隔安排。错过的复习会保留。');target.append(note);
      if(activeKey&&!busy){const next=[...target.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===activeKey);(next||target.querySelector('.review-complete')||addButton).focus({preventScroll:true});}
    }
    const wake=()=>{if(disposed||today()===lastDay)return;lastDay=today();if(container?.isConnected)render(container);};
    const timer=setInterval(wake,30000);root.addEventListener?.('focus',wake);root.document?.addEventListener('visibilitychange',wake);
    return {render,sync,add:addNote,dispatch,dispose(){disposed=true;clearInterval(timer);root.removeEventListener?.('focus',wake);root.document?.removeEventListener('visibilitychange',wake);}};
  }
  const api={intervals,iso,date,validDay,add,days,apply,queue,rename,remove,init};
  if(typeof module!=='undefined')module.exports=api;else root.IHomeReviews=api;
})(typeof window!=='undefined'?window:globalThis);
