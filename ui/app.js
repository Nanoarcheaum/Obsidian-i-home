(function () {
  'use strict';
  const M=IHome,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const Host=window.IHomeHost||null;
  const looks={studio:['澄光','奶白与墨青 · 轻盈的日常'],linen:['纸间','温润纸感 · 让思绪停留'],slate:['夜航','冷静秩序 · 专注于此刻'],garden:['森息','柔和绿意 · 自由地生长']};
  let look=Host?.preferences?.style||'studio';
  if(!Host)try{const saved=localStorage.getItem('i-home.preview.style');if(looks[saved])look=saved;}catch{}
  function applyLook(value){look=looks[value]?value:'studio';document.documentElement.dataset.look=look;$$('[data-look-choice]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.lookChoice===look)));}
  function lookPicker(){const dialog=modal($('#editor'),'选择一种时间的质感');dialog.append(el('p','muted small','四套风格，同一份计划。切换后立即生效。'));const grid=el('div','look-options');for(const [id,[name,description]] of Object.entries(looks)){const b=button('','look-option',async()=>{applyLook(id);try{if(Host)await Host.setStyle(id);else localStorage.setItem('i-home.preview.style',id);}catch{toast('风格未能保存，请重试');}});b.dataset.lookChoice=id;b.setAttribute('aria-pressed',String(look===id));const sample=el('span','look-sample');sample.dataset.swatch=id;sample.append(el('span','sample-heading','i-home'),el('span','sample-line'),el('span','sample-grid'));b.append(sample,el('strong','',name),el('span','muted small',description));grid.append(b);}dialog.append(grid,button('完成','primary-button',()=>dialog.close()));dialog.showModal();}
  const KEY='i-home.preview.v1',today=()=>M.iso(new Date()),dayNames=['一','二','三','四','五','六','日'];
  const names={do:'重要且紧急',plan:'重要不紧急',delegate:'紧急不重要',later:'不紧急不重要'};
  let data=Host?JSON.parse(JSON.stringify(Host.initialData)):M.initial(IHomeSeed,today()),view='month',focus=today(),expanded=null,fileSort='opened',dragged=null,undoStack=[],noteContents=new Map(),saveBlocked=false;
  let noticeTimer,returnFocus=null,saveSequence=0,detailScrollTimer;
  if(!Host)try {const raw=localStorage.getItem(KEY);if(raw){const loaded=JSON.parse(raw);if(!M.validate(loaded))throw Error('数据格式无法读取');data=loaded;}} catch(error){saveBlocked=true;}
  data.reviews??=[];data.reviewRevision??=0;
  const reviewController=window.IHomeReviews?.init({getData:()=>data,mutate:change,chooseNote,openNote,toast,today,host:Host});
  window.addEventListener('pagehide',()=>reviewController?.dispose(),{once:true});
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function button(text,cls,action,label){const b=el('button',cls,text);b.type='button';if(label)b.setAttribute('aria-label',label);if(action)b.addEventListener('click',action);return b;}
  function field(label,type,value,required=false){const l=el('label','field'),input=el('input');input.type=type;input.value=value||'';input.required=required;l.append(el('span','',label),input);return {label:l,input};}
  function selectField(label,options,value){const l=el('label','field'),s=el('select');s.setAttribute('aria-label',label);for(const [v,t] of options){const o=el('option','',t);o.value=v;s.append(o);}s.value=value;l.append(el('span','',label),s);return {label:l,input:s};}
  function toast(message,undo=false){const host=$('#toast');host.replaceChildren(el('span','',message));if(undo)host.append(button('撤销','text-button',undoLast));host.classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>host.classList.remove('show'),5500);}
  function persist(){
    if(Host){
      data.files=Host.files();
      const sequence=++saveSequence;$('#saveStatus').textContent='正在保存…';
      if(!M.validate(data)){toast('数据校验失败，未覆盖已保存内容');return;}
      Host.save(JSON.parse(JSON.stringify(data))).then(()=>{if(sequence===saveSequence)$('#saveStatus').textContent='已保存到当前笔记库';}).catch(()=>{if(sequence===saveSequence)$('#saveStatus').textContent='保存失败 · 请备份';toast('保存失败，当前编辑仍在。请导出备份后重试。');});return;
    }
    if(saveBlocked){$('#saveStatus').textContent='原数据未覆盖 · 请备份';return;}
    try{if(!M.validate(data))throw Error('数据校验失败');localStorage.setItem(KEY,JSON.stringify(data));$('#saveStatus').textContent='已保存在此浏览器';}
    catch(error){$('#saveStatus').textContent='保存失败 · 请导出备份';toast('当前更改未能保存，请导出备份');}
  }
  function change(action,message,rerender=true){undoStack.push(JSON.stringify(data));if(undoStack.length>30)undoStack.shift();action();persist();if(rerender)render();if(message)toast(message,true);}
  function undoLast(){if(!undoStack.length)return;const reviews=data.reviews,reviewRevision=data.reviewRevision;data=JSON.parse(undoStack.pop());if(Host){data.reviews=reviews;data.reviewRevision=reviewRevision;}data.reviews??=[];data.reviewRevision??=0;persist();render();toast('已撤销上一步');}
  const task=id=>data.tasks.find(t=>t.id===id);
  function applyTheme(){const mode=['auto','light','dark'].includes(data.theme)?data.theme:'auto';document.documentElement.dataset.theme=mode==='auto'?(Host?Host.theme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')):mode;$('#themeToggle').value=mode;}
  async function chooseNote(){if(Host)return Host.pickMarkdown();return new Promise(resolve=>{const picker=document.createElement('input');picker.type='file';picker.accept='.md,.markdown';picker.oncancel=()=>resolve(null);picker.onchange=async()=>{const f=picker.files[0];if(!f){resolve(null);return;}noteContents.set(f.name,await f.text());if(!data.files.some(n=>n.name===f.name))data.files.push({name:f.name,modified:f.lastModified,opened:0});resolve(f.name);};picker.click();});}
  async function linkNote(t){try{const path=await chooseNote();if(path)change(()=>t.note=path,'已关联笔记');}catch(error){toast('未能选择笔记：'+error.message);}}
  function modal(dialog,title){if(dialog.open)dialog.close();returnFocus=document.activeElement;dialog.classList.remove('command-dialog');dialog.replaceChildren();const head=el('div','dialog-head'),h=el('h2','',title);h.id=dialog.id==='priorityDialog'?'priorityTitle':dialog.id==='noteDialog'?'noteTitle':'editorTitle';head.append(h,button('×','icon-button',()=>dialog.close(),'关闭'));dialog.append(head);return dialog;}
  for(const d of $$('dialog')){d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.addEventListener('close',()=>{if(d.open)return;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else $('#quickAdd').focus({preventScroll:true});});}
  const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function syncSelection(){
    $$('.day').forEach(n=>{n.classList.toggle('selected',n.dataset.date===focus);n.classList.toggle('has-expanded',!!expanded&&n.dataset.date===task(expanded)?.date);});
    $$('.task-entry').forEach(n=>n.classList.toggle('is-expanded',n.dataset.entryId===expanded));
    $$('[data-task-id]').forEach(n=>n.setAttribute('aria-expanded',String(n.dataset.taskId===expanded)));
    $$('[data-overview-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.overviewId===expanded)));
    const shell=$('.calendar-shell'),active=task(expanded);
    if(shell){const inspect=!!active&&!matchMedia('(max-width:700px)').matches,days=[...shell.querySelectorAll('.day')];shell.classList.toggle('is-inspecting',inspect);if(inspect){const column=(M.date(active.date).getDay()+6)%7,row=Math.floor(days.findIndex(n=>n.dataset.date===active.date)/7);shell.style.setProperty('--calendar-columns',Array.from({length:7},(_,i)=>`minmax(0,${i===column?'2.5':'1'}fr)`).join(' '));shell.style.setProperty('--calendar-rows',Array.from({length:days.length/7},(_,i)=>i===row?'minmax(clamp(220px,calc(100dvh - 480px),350px),3fr)':'minmax(28px,1fr)').join(' '));}else{shell.style.setProperty('--calendar-columns',Array.from({length:7},()=> 'minmax(0,1fr)').join(' '));shell.style.setProperty('--calendar-rows',Array.from({length:days.length/7},()=> 'minmax(0,1fr)').join(' '));}}
  }
  function closeTask(){clearTimeout(detailScrollTimer);expanded=null;renderDetail();syncSelection();}
  function revealTask(id){
    clearTimeout(detailScrollTimer);
    const reveal=()=>{if(expanded!==id)return;const entry=$$('.task-entry').find(n=>n.dataset.entryId===id&&n.getClientRects().length);if(!entry)return;const day=entry.closest('.day');if(day&&day.scrollHeight>day.clientHeight){const top=entry.getBoundingClientRect().top-day.getBoundingClientRect().top+day.scrollTop;day.scrollTo({top:Math.max(0,top-36),behavior:reducedMotion()?'instant':'smooth'});}else{const host=$('#viewHost'),r=entry.getBoundingClientRect(),bounds=host.getBoundingClientRect();if(r.top<bounds.top||r.top>bounds.bottom-80)entry.scrollIntoView({block:'nearest',behavior:reducedMotion()?'instant':'smooth'});}};
    requestAnimationFrame(reveal);detailScrollTimer=setTimeout(reveal,reducedMotion()?0:310);
  }
  function focusTask(id,fromOverview=false){
    const t=task(id);if(!t)return;
    const rebuild=view!=='month'||focus.slice(0,7)!==t.date.slice(0,7)||(matchMedia('(max-width:700px)').matches&&focus!==t.date);
    expanded=expanded===id?null:id;focus=t.date;view='month';
    if(rebuild)render();else{renderDetail();syncSelection();}
    if(expanded)revealTask(id);
  }
  function contextTask(e,t){e.preventDefault();e.stopPropagation();priority(t);}
  function dragSource(node,t){node.draggable=true;node.addEventListener('dragstart',e=>{dragged=t.id;e.dataTransfer.setData('text/plain',t.id);e.dataTransfer.effectAllowed='move';node.classList.add('dragging');});node.addEventListener('dragend',()=>{dragged=null;node.classList.remove('dragging');$$('.drop-target').forEach(n=>n.classList.remove('drop-target'));});}
  const taskMeta=t=>t.schedule?`${t.schedule.duration} 节 · 已排期`:t.nodes.length?`${t.nodes.length} 个子任务`:'未排时间';
  function taskCard(t,compact=false){
    const entry=el('article',`task-entry ${M.tone(t)}`);entry.dataset.entryId=t.id;
    const b=button('',`task-card ${M.tone(t)}${M.progress(t)===100?' complete':''}`,()=>focusTask(t.id));b.title=t.title;b.dataset.taskId=t.id;b.dataset.focusKey='task-'+t.id;b.setAttribute('aria-expanded',String(expanded===t.id));b.append(el('span','task-title',t.title));
    const chevron=el('span','task-chevron','⌄');chevron.setAttribute('aria-hidden','true');b.append(chevron);
    if(!compact){const meta=el('span','task-meta');meta.append(el('span','task-schedule',taskMeta(t)),el('span','task-percent',`${M.progress(t)}%`));const p=el('span','progress-track');p.dataset.progressKey=t.id;p.style.setProperty('--progress',M.progress(t)+'%');b.append(meta,p);}
    if(t.note){const note=el('span','task-note-mark','↗');note.title='已关联 Markdown 笔记';note.setAttribute('aria-label','已关联笔记');b.append(note);}
    b.addEventListener('contextmenu',e=>contextTask(e,t));dragSource(b,t);
    const detail=el('section','inline-detail');detail.id='detail-'+M.uid();detail.setAttribute('aria-label',t.title+'的子任务');detail.setAttribute('aria-hidden','true');detail.inert=true;b.setAttribute('aria-controls',detail.id);entry.append(b,detail);return entry;
  }
  function refreshTask(t){
    const activeKey=document.activeElement?.dataset.focusKey;
    $$('[data-entry-id]').filter(n=>n.dataset.entryId===t.id).forEach(entry=>{const card=entry.querySelector('.task-card');card.classList.toggle('complete',M.progress(t)===100);entry.querySelector('.task-title').textContent=t.title;const meta=entry.querySelector('.task-schedule');if(meta)meta.textContent=taskMeta(t);const percent=entry.querySelector('.task-percent');if(percent)percent.textContent=M.progress(t)+'%';entry.querySelector('.progress-track')?.style.setProperty('--progress',M.progress(t)+'%');});
    renderDetail();renderSide();syncSelection();
    if(activeKey)$$('[data-focus-key]').find(n=>n.dataset.focusKey===activeKey&&n.getClientRects().length)?.focus({preventScroll:true});
  }
  function completeTaskStep(t,action){const before=M.progress(t);change(action,null,false);refreshTask(t);const done=M.progress(t)===100&&before<100;toast(done?'完成了，给今天留一个小小的高光。':'进度已更新',true);if(done&&!reducedMotion()){$$('[data-entry-id]').filter(n=>n.dataset.entryId===t.id&&n.getClientRects().length).forEach(n=>n.querySelector('.task-card').animate([{transform:'scale(1)'},{transform:'scale(1.025)'},{transform:'scale(1)'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'}));$('.today-orbit')?.animate([{transform:'scale(1)'},{transform:'scale(1.1)'},{transform:'scale(1)'}],{duration:550,easing:'cubic-bezier(.2,.8,.2,1)'});}}
  function render(){
    window.IHomeMotion?.beforeRender();
    const activeKey=document.activeElement?.dataset.focusKey;
    const progressBefore=new Map($$('[data-progress-key]').map(n=>[n.dataset.progressKey,n.style.getPropertyValue('--progress')]));
    document.documentElement.dataset.view=view;
    const d=M.date(focus),year=d.getFullYear(),month=d.getMonth(),start=M.monday(focus);
    $('#viewTitle').textContent=view==='year'?`${year} 年`:view==='month'?`${year} 年 ${String(month+1).padStart(2,'0')} 月`:`${start.slice(0,4)} · ${start.slice(5).replace('-','/')} — ${M.add(start,6).slice(5).replace('-','/')}`;
    $('#viewHint').textContent={month:'点击任务展开 · 右键调整优先级 · 拖动更改日期',week:'红点拖入时间格 · 点击可精确排期 · 允许与课程重叠',year:'十二个月，一眼看见 · 点击月份深入 · 跨月计划可关联任务'}[view];
    $('#addPlan').classList.toggle('hidden',view!=='year');$('#importCourses').classList.toggle('hidden',view!=='week');
    $$('button[data-view]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.view===view)));
    const host=$('#viewHost');host.replaceChildren(view==='month'?renderMonth():view==='week'?renderWeek():renderYear());
    renderDetail();renderSide();syncSelection();
    if(activeKey)$$('[data-focus-key]').find(n=>n.dataset.focusKey===activeKey&&n.getClientRects().length)?.focus({preventScroll:true});
    if(!reducedMotion())$$('[data-progress-key]').forEach(n=>{const old=progressBefore.get(n.dataset.progressKey),next=n.style.getPropertyValue('--progress');if(old&&old!==next){n.style.setProperty('--progress',old);n.getBoundingClientRect();requestAnimationFrame(()=>n.style.setProperty('--progress',next));}});
  }
  function renderMonth(){
    const shell=el('div','calendar-shell'),week=el('div','weekday-row');dayNames.forEach(n=>week.append(el('span','',`周${n}`)));const grid=el('div','calendar-grid');
    const d=M.date(focus),first=M.iso(new Date(d.getFullYear(),d.getMonth(),1)),start=M.monday(first);
    const dayCount=Math.ceil((((M.date(first).getDay()+6)%7)+new Date(d.getFullYear(),d.getMonth()+1,0).getDate())/7)*7;
    for(let i=0;i<dayCount;i++){const date=M.add(start,i),outside=M.date(date).getMonth()!==d.getMonth(),cell=el('section',`day${outside?' outside':''}${date===today()?' today':''}${date===focus?' selected':''}`);cell.dataset.date=date;
      const top=el('div','day-top'),num=button(String(M.date(date).getDate()),'day-number',()=>{focus=date;expanded=null;render();},`${date}，选择日期`);num.dataset.focusKey='day-'+date;top.append(num,button('+','add-day',()=>editTask(null,date),`${date} 添加任务`));cell.append(top);
      const dated=data.tasks.filter(t=>t.date===date);dated.forEach(t=>cell.append(taskCard(t)));if(dated.length)cell.append(el('span','day-count',`${dated.length} 项`));
      cell.addEventListener('dblclick',e=>{if(e.target===cell)editTask(null,date);});
      cell.addEventListener('dragover',e=>{if(dragged){e.preventDefault();cell.classList.add('drop-target');}});cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('drop-target');});
      cell.addEventListener('drop',e=>{e.preventDefault();const t=task(dragged||e.dataTransfer.getData('text/plain'));dragged=null;if(!t)return;if(t.date===date){cell.classList.remove('drop-target');return;}change(()=>{t.date=date;focus=date;},'已移动日期，保留原排期');});grid.append(cell);
    }shell.append(week,grid);const wrapper=el('div','month-wrapper'),agenda=el('section','mobile-agenda'),head=el('div','section-head');head.append(el('h3','',focus),button('＋ 添加','text-button',()=>editTask(null,focus)));agenda.append(head);const selected=data.tasks.filter(t=>t.date===focus);selected.forEach(t=>agenda.append(taskCard(t)));if(!selected.length)agenda.append(el('p','empty-note','这一天还没有任务。'));wrapper.append(shell,agenda);return wrapper;
  }
  function renderWeek(){
    const shell=el('div','week-shell'),scroll=el('div','week-scroll'),grid=el('div','week-grid'),start=M.monday(focus),corner=el('div','week-corner','节次 / 时间');grid.append(corner);
    for(let day=0;day<7;day++){
      const date=M.add(start,day),head=el('div',`week-head${date===today()?' today':''}`);head.append(button(`周${dayNames[day]}  ${date.slice(5).replace('-','/')}`,'week-day-title',()=>{focus=date;editTask(null,date);}));const tray=el('div','dot-tray');
      data.tasks.filter(t=>t.date===date&&!t.schedule).forEach(t=>{const dot=button('','task-dot',()=>editTask(t),`${t.title}，未排时间，点击安排`);dot.title=t.title;dot.dataset.taskId=t.id;dot.style.setProperty('--priority-color',`var(--${M.tone(t)})`);dot.addEventListener('contextmenu',e=>contextTask(e,t));dragSource(dot,t);tray.append(dot);});head.append(tray);
      head.addEventListener('dragover',e=>{if(dragged){e.preventDefault();head.classList.add('drop-target');}});head.addEventListener('dragleave',()=>head.classList.remove('drop-target'));head.addEventListener('drop',e=>{e.preventDefault();const t=task(dragged||e.dataTransfer.getData('text/plain'));dragged=null;if(t)change(()=>{t.date=date;t.schedule=null;},'已移回待排区');});grid.append(head);
    }
    const times=el('div','time-labels');M.periods.forEach((p,i)=>{const label=el('div','period-label');label.append(el('b','',String(i+1)),el('span','',p.replace('–','\n')));times.append(label);});grid.append(times);
    for(let day=0;day<7;day++){
      const date=M.add(start,day),column=el('div','week-column');column.dataset.date=date;
      for(let p=1;p<=13;p++){const cell=button('','time-cell',()=>editTask(null,date,p),`${date} 第${p}节添加任务`);cell.dataset.period=String(p);column.append(cell);}
      const courseList=data.courses.filter(c=>c.day===day+1),scheduled=data.tasks.filter(t=>t.date===date&&t.schedule);
      courseList.forEach(c=>{const b=button('',`course-block ${M.tone(c)}`,()=>courseDetail(c));b.title=`${c.name} · ${c.place}`;b.append(el('strong','',c.name),el('span','',c.place||'地点待定'),el('small','',`第 ${c.start}–${c.end} 节`));position(b,c.start,c.end-c.start+1);if(scheduled.some(t=>t.schedule.start<=c.end&&t.schedule.start+t.schedule.duration>c.start))b.style.right='56%';b.addEventListener('contextmenu',e=>{e.preventDefault();priority(c);});column.append(b);});
      // Every overlapping task gets a lane; courses retain a separate visible lane.
      const lanes=[];scheduled.sort((a,b)=>a.schedule.start-b.schedule.start).forEach(t=>{const s=t.schedule;let lane=lanes.findIndex(end=>end<=s.start);if(lane<0)lane=lanes.length;lanes[lane]=s.start+s.duration;t._lane=lane;});
      scheduled.forEach(t=>{const b=button('',`week-task ${M.tone(t)}`,()=>editTask(t));b.dataset.taskId=t.id;b.append(el('strong','',t.title),el('small','',`${t.schedule.duration} 节`));position(b,t.schedule.start,t.schedule.duration);const offset=courseList.length?46:2,width=(98-offset)/Math.max(1,lanes.length);b.style.left=`${offset+t._lane*width}%`;b.style.width=`calc(${width}% - 3px)`;delete t._lane;
        b.addEventListener('contextmenu',e=>contextTask(e,t));dragSource(b,t);const resize=el('span','resize-handle');resize.title='拖动调整节数';resize.setAttribute('aria-hidden','true');b.append(resize);
        resize.addEventListener('click',e=>e.stopPropagation());resize.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();b.draggable=false;resize.setPointerCapture(e.pointerId);const startY=e.clientY,original=t.schedule.duration;let duration=original;
          const move=ev=>{duration=Math.max(1,Math.min(14-t.schedule.start,original+Math.round((ev.clientY-startY)/60)));b.style.height=`${duration*60-6}px`;b.querySelector('small').textContent=`${duration} 节`;};
          const end=ev=>{resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',end);resize.removeEventListener('pointercancel',cancel);b.draggable=true;if(ev.type==='pointercancel'){render();return;}if(duration!==original)change(()=>t.schedule.duration=duration,'已调整时长');};const cancel=ev=>end(ev);resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',end);resize.addEventListener('pointercancel',cancel);
        });column.append(b);
      });
      column.addEventListener('dragover',e=>{if(!dragged)return;e.preventDefault();column.classList.add('drop-target');const p=Math.max(1,Math.min(13,Math.floor((e.clientY-column.getBoundingClientRect().top)/60)+1));column.style.setProperty('--drop-top',`${(p-1)*60}px`);});
      column.addEventListener('dragleave',e=>{if(!column.contains(e.relatedTarget))column.classList.remove('drop-target');});
      column.addEventListener('drop',e=>{e.preventDefault();const t=task(dragged||e.dataTransfer.getData('text/plain'));dragged=null;if(!t)return;const p=Math.max(1,Math.min(13,Math.floor((e.clientY-column.getBoundingClientRect().top)/60)+1));change(()=>{t.date=date;M.schedule(t,p,t.schedule?.duration||2);focus=date;},'已安排时间，可拖动底部调整节数');});grid.append(column);
    }
    scroll.append(grid);shell.append(scroll);const caption=el('div','course-caption');caption.append(el('span','',data.courseSource),el('span','', '每周模板 · 按课节排期，含课间跨度'));shell.append(caption);
    if(data.unscheduled.length){const pending=el('div','pending-courses');pending.append(el('b','','待排课程'));data.unscheduled.forEach(c=>{const span=el('span','',c.name);span.title=c.reason||'未提供上课时间';pending.append(span);});shell.append(pending);}return shell;
  }
  function position(node,start,duration){node.style.top=`${(start-1)*60+3}px`;node.style.height=`${duration*60-6}px`;}
  function renderYear(){
    const host=el('div','year-grid'),year=M.date(focus).getFullYear();
    for(let month=0;month<12;month++){
      const first=M.iso(new Date(year,month,1)),last=M.iso(new Date(year,month+1,0)),card=el('section','year-month'),head=el('div','year-month-head');head.append(button(`${String(month+1).padStart(2,'0')} 月`,'month-link',()=>{focus=first;switchView('month');}),el('span','muted small',`${data.tasks.filter(t=>t.date>=first&&t.date<=last).length} 项任务`));card.append(head);
      const mini=el('div','mini-calendar');dayNames.forEach(n=>mini.append(el('span','mini-label',n)));const start=M.monday(first);
      for(let i=0;i<42;i++){
        const d=M.add(start,i),outside=d<first||d>last,dated=outside?[]:data.tasks.filter(t=>t.date===d),has=dated.length>0,b=button(String(M.date(d).getDate()),`mini-day${outside?' outside':''}${has?' has-task':''}${d===today()?' is-today':''}`,()=>{focus=d;switchView('month');},`${d}${has?'，'+dated.length+' 项任务':''}`);b.dataset.date=d;
        if(has){const dots=el('span','mini-task-dots');dots.setAttribute('aria-hidden','true');dated.forEach(t=>{const dot=el('span',`mini-task-dot ${M.tone(t)}`);dot.dataset.taskId=t.id;dot.title=t.title;dots.append(dot);});b.append(dots);}mini.append(b);
      }card.append(mini);
      const ribbons=el('div','plan-ribbons');data.plans.filter(p=>p.start<=last&&p.end>=first).forEach(p=>{const linked=data.tasks.filter(t=>t.planId===p.id),count=linked.length?` · ${Math.round(linked.reduce((s,t)=>s+M.progress(t),0)/linked.length)}%`:'';const r=button(p.title+count,`plan-ribbon ${M.tone(p)}`,()=>editPlan(p));r.addEventListener('contextmenu',e=>{e.preventDefault();priority(p);});ribbons.append(r);});card.append(ribbons);host.append(card);
    }return host;
  }
  function renderDetail(){
    const activeKey=document.activeElement?.dataset.focusKey,t=task(expanded);
    const entry=$$('.task-entry').find(n=>n.dataset.entryId===expanded&&n.getClientRects().length);
    const host=entry?.querySelector('.inline-detail')||$('#taskDetail');
    $$('.inline-detail,#taskDetail').forEach(n=>{if(n!==host||!t){n.classList.remove('open');n.inert=true;n.setAttribute('aria-hidden','true');setTimeout(()=>{if(!n.classList.contains('open'))n.replaceChildren();},reducedMotion()?0:300);}});
    if(!t)return;
    host.inert=false;host.setAttribute('aria-hidden','false');
    const wasOpen=host.classList.contains('open');
    const box=el('div','detail-inner'),head=el('div','detail-head'),identity=el('div');identity.append(el('span','eyebrow','子任务'));const actions=el('div','detail-actions');actions.append(button('优先级','quiet-button',()=>priority(t)),button('编辑','quiet-button',()=>editTask(t),'编辑 / 排期'),button('×','icon-button',closeTask,'收起任务'));head.append(identity,actions);box.append(head);
    const meter=el('div','detail-meter'),bar=el('span','progress-track');bar.style.setProperty('--progress',M.progress(t)+'%');meter.append(el('b','',`${M.progress(t)}%`),bar,el('span','muted small',t.nodes.length?`${t.nodes.filter(n=>n.done).length} / ${t.nodes.length} 已完成`:'单项任务'));box.append(meter);
    const list=el('div','node-list');
    if(!t.nodes.length){const row=el('label','node-row'),check=el('input');check.type='checkbox';check.dataset.focusKey='parent-'+t.id;check.checked=t.done;check.addEventListener('change',()=>completeTaskStep(t,()=>t.done=check.checked));row.append(check,el('span','','完成这项任务'));list.append(row);}
    t.nodes.forEach(n=>{const row=el('div',`node-row${n.done?' done':''}`),check=el('input'),input=el('textarea','node-text');input.rows=1;check.type='checkbox';check.dataset.focusKey='check-'+n.id;input.dataset.focusKey='node-'+n.id;check.checked=n.done;check.setAttribute('aria-label',`完成：${n.text}`);input.value=n.text;input.setAttribute('aria-label','子任务标题');const resize=()=>{if(input.getClientRects().length){input.style.height='auto';input.style.height=input.scrollHeight+'px';}};requestAnimationFrame(resize);input.addEventListener('input',resize);input.addEventListener('change',()=>{change(()=>{n.text=input.value.trim()||n.text;input.value=n.text;},'子任务已更新',false);renderSide();});row.addEventListener('contextmenu',e=>{e.preventDefault();input.focus();input.select();});check.addEventListener('change',()=>completeTaskStep(t,()=>n.done=check.checked));const remove=button('×','remove-node',()=>{change(()=>t.nodes=t.nodes.filter(x=>x.id!==n.id),'子任务已删除',false);refreshTask(t);$$('[data-focus-key]').find(x=>x.dataset.focusKey==='add-'+t.id&&x.getClientRects().length)?.focus({preventScroll:true});},`删除：${n.text}`);row.append(check,input,remove);list.append(row);});box.append(list);
    const addForm=el('form','add-node-form'),input=el('input');input.placeholder='下一步，做什么？';input.setAttribute('aria-label','新子任务');input.dataset.focusKey='add-'+t.id;input.required=true;const add=button('＋ 添加子任务','quiet-button');add.type='submit';addForm.append(input,add);addForm.addEventListener('submit',e=>{e.preventDefault();if(!input.value.trim())return;change(()=>{t.nodes.push({id:M.uid(),text:input.value.trim(),done:false});t.done=false;},'子任务已添加',false);refreshTask(t);$$('[data-focus-key]').find(n=>n.dataset.focusKey==='add-'+t.id&&n.getClientRects().length)?.focus({preventScroll:true});revealTask(t.id);});box.append(addForm);
    const links=el('div','task-note-links');if(t.note){const missing=Host&&!data.files.some(f=>f.name===t.note);links.append(button(`${missing?'文件已移除 · ':'↗ '}${t.note}`,'note-link'+(missing?' missing-note':''),()=>openNote(t.note)),button('更换','text-button',()=>linkNote(t)),button('解除','text-button',()=>change(()=>t.note='','已解除关联，笔记保留')));}else links.append(button('↗ 关联 Markdown 笔记','text-button',()=>linkNote(t)));box.append(links);const clip=el('div','inline-clip');clip.append(box);host.replaceChildren(clip);if(!wasOpen){host.getBoundingClientRect();host.classList.add('open');}if(activeKey){const target=[...host.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===activeKey);target?.focus({preventScroll:true});}
  }
  function editTask(existing,date=focus,start=null,initialNote=''){
    const dialog=modal($('#editor'),existing?'编辑任务':'新建任务'),form=el('form','editor-form');
    const title=field('任务标题','text',existing?.title||'',true),day=field('日期','date',existing?.date||date,true),note=field('关联 Markdown 名称或路径','text',existing?.note||initialNote);
    note.input.dataset.noteInput='true';note.input.readOnly=!!Host;
    const noteActions=el('div','note-picker-actions');noteActions.append(button(Host?'搜索笔记库中的 Markdown':'选择本地 Markdown','quiet-button',async()=>{try{const path=await chooseNote();if(path){note.input.value=path;if(!title.input.value.trim())title.input.value=path.split('/').pop().replace(/\.md$/i,'');}}catch(error){toast(error.message);}}),button('解除关联','text-button',()=>note.input.value=''));note.label.append(noteActions);
    note.input.setAttribute('list','noteOptions');const suggestions=el('datalist');suggestions.id='noteOptions';data.files.forEach(f=>{const o=el('option');o.value=f.name;suggestions.append(o);});
    const plan=selectField('所属跨月计划',[['','不关联计划'],...data.plans.map(p=>[p.id,p.title])],existing?.planId||'');
    const time=selectField('开始时间',[['','暂不排期'],...M.periods.map((p,i)=>[String(i+1),`第 ${i+1} 节 · ${p.split('–')[0]}`])],String(existing?.schedule?.start||start||''));
    const duration=field('持续节数','number',String(existing?.schedule?.duration||2));duration.input.min='1';duration.input.max='13';duration.input.step='1';
    const range=el('div','field-row');range.append(time.label,duration.label);const help=el('p','muted small');
    function timeHint(){duration.input.disabled=!time.input.value;const p=Number(time.input.value);duration.input.max=String(14-p);if(Number(duration.input.value)>14-p)duration.input.value=String(14-p);help.textContent=p?`${M.periods[p-1].split('–')[0]} — ${M.periods[Math.min(12,p+Number(duration.input.value)-2)]?.split('–')[1]||''}，包含课间。可与课程重叠。`:'未排期任务会出现在周历日期右上角。';}time.input.addEventListener('change',timeHint);duration.input.addEventListener('input',timeHint);timeHint();
    const actions=el('div','dialog-actions');if(existing)actions.append(button('删除任务','danger-button',()=>{dialog.close();change(()=>{data.tasks=data.tasks.filter(t=>t.id!==existing.id);expanded=null;},'任务已删除');}));actions.append(button('取消','quiet-button',()=>dialog.close()));const save=button('保存任务','primary-button');save.type='submit';actions.append(save);
    form.append(title.label,day.label,range,help,plan.label,note.label,suggestions,actions);form.addEventListener('submit',e=>{e.preventDefault();if(!title.input.value.trim()||!M.validDate(day.input.value))return;change(()=>{const t=existing||{id:M.uid(),importance:70,urgency:30,nodes:[],done:false,note:'',schedule:null,planId:''};t.title=title.input.value.trim();t.date=day.input.value;t.note=note.input.value.trim();t.planId=plan.input.value;M.schedule(t,time.input.value?Number(time.input.value):null,Number(duration.input.value)||1);if(!existing)data.tasks.push(t);focus=t.date;expanded=t.id;},'任务已保存');dialog.close();});dialog.append(form);dialog.showModal();title.input.focus();
  }
  function editPlan(existing){
    const year=M.date(focus).getFullYear(),dialog=modal($('#editor'),existing?'编辑跨月计划':'跨月计划'),form=el('form','editor-form');const title=field('计划名称','text',existing?.title||'',true),start=field('开始日期','date',existing?.start||focus,true),end=field('结束日期','date',existing?.end||`${year}-12-31`,true);const row=el('div','field-row');row.append(start.label,end.label);const error=el('p','form-error');error.setAttribute('role','alert');
    const links=existing?data.tasks.filter(t=>t.planId===existing.id):[];const list=el('div','linked-tasks');links.forEach(t=>list.append(el('p','small',`${t.date} · ${t.title} · ${M.progress(t)}%`)));if(!links.length)list.append(el('p','muted small','在任务编辑中关联这个计划，进度会自动汇总。'));
    const actions=el('div','dialog-actions');if(existing)actions.append(button('删除计划','danger-button',()=>{dialog.close();change(()=>{data.plans=data.plans.filter(p=>p.id!==existing.id);data.tasks.forEach(t=>{if(t.planId===existing.id)t.planId='';});},'计划已删除，关联任务保留');}));actions.append(button('取消','quiet-button',()=>dialog.close()));const save=button('保存计划','primary-button');save.type='submit';actions.append(save);form.append(title.label,row,error,list,actions);form.addEventListener('submit',e=>{e.preventDefault();if(!title.input.value.trim())return;if(!M.validDate(start.input.value)||!M.validDate(end.input.value)||start.input.value>end.input.value){error.textContent='结束日期应不早于开始日期';return;}change(()=>{const p=existing||{id:M.uid(),importance:80,urgency:30};Object.assign(p,{title:title.input.value.trim(),start:start.input.value,end:end.input.value});if(!existing)data.plans.push(p);},'跨月计划已保存');dialog.close();});dialog.append(form);dialog.showModal();
  }
  function priority(item){
    const dialog=modal($('#priorityDialog'),'重要度 × 紧急度'),draft={importance:item.importance,urgency:item.urgency};dialog.append(el('p','muted small',item.title||item.name));const plane=el('div','priority-plane');plane.append(el('span','quadrant q-do','立刻做'),el('span','quadrant q-delegate','可委派'),el('span','quadrant q-plan','计划做'),el('span','quadrant q-later','以后做'),el('span','axis-y','紧急 ↑'),el('span','axis-x','重要 →'));const knob=el('span','priority-knob');plane.append(knob);const controls=el('div','priority-controls'),imp=field('重要度','range',String(draft.importance)),urg=field('紧急度','range',String(draft.urgency));[imp,urg].forEach(f=>{f.input.min=0;f.input.max=100;f.input.step=1;});controls.append(imp.label,urg.label);const readout=el('p','priority-readout');
    function refresh(){knob.style.left=draft.importance+'%';knob.style.top=(100-draft.urgency)+'%';knob.style.background=`var(--${M.tone(draft)})`;imp.input.value=draft.importance;urg.input.value=draft.urgency;readout.textContent=`重要 ${draft.importance} / 紧急 ${draft.urgency} · ${names[M.tone(draft)]}`;}
    function update(e){const r=plane.getBoundingClientRect();draft.importance=Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*100);draft.urgency=Math.round((1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)))*100);refresh();}
    plane.addEventListener('pointerdown',e=>{plane.setPointerCapture(e.pointerId);update(e);});plane.addEventListener('pointermove',e=>{if(plane.hasPointerCapture(e.pointerId))update(e);});plane.addEventListener('pointerup',e=>{if(plane.hasPointerCapture(e.pointerId))plane.releasePointerCapture(e.pointerId);});imp.input.addEventListener('input',()=>{draft.importance=Number(imp.input.value);refresh();});urg.input.addEventListener('input',()=>{draft.urgency=Number(urg.input.value);refresh();});const actions=el('div','dialog-actions');actions.append(button('取消','quiet-button',()=>dialog.close()),button('应用优先级','primary-button',()=>{change(()=>Object.assign(item,draft),'优先级已更新');dialog.close();}));dialog.append(plane,readout,controls,actions);refresh();dialog.showModal();
  }
  function courseDetail(c){const dialog=modal($('#editor'),c.name);dialog.append(el('p','course-detail-time',`周${dayNames[c.day-1]} · 第 ${c.start}–${c.end} 节`),el('p','',`${M.periods[c.start-1].split('–')[0]} — ${M.periods[c.end-1].split('–')[1]}`),el('p','muted',c.place||'地点待定'),el('p','muted',`${c.teacher} · ${c.code}`));const actions=el('div','dialog-actions');actions.append(button('调整优先级','quiet-button',()=>{dialog.close();priority(c);}),button('在此安排任务','primary-button',()=>{dialog.close();editTask(null,M.add(M.monday(focus),c.day-1),c.start);}));dialog.append(actions);dialog.showModal();}
  function renderSide(){
    const activeKey=document.activeElement?.dataset.focusKey;
    const tasks=data.tasks.filter(t=>t.date===today()),done=tasks.filter(t=>M.progress(t)===100).length,completion=tasks.length?Math.round(tasks.reduce((sum,t)=>sum+M.progress(t),0)/tasks.length):0;$('#todayLine').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
    const summary=$('#todaySummary');summary.replaceChildren();const orbit=el('div','today-orbit');orbit.style.setProperty('--completion',`${completion*3.6}deg`);orbit.setAttribute('aria-label',`今日进度 ${completion}%`);orbit.append(el('span','orbit-value',`${completion}%`));const stat=el('div','today-stat');stat.append(el('strong','',String(done)),el('span','',`/ ${tasks.length}`),el('small','','任务已完成'));summary.append(orbit,stat,el('p','today-message',!tasks.length?'今天，给自己一点新的可能。':done===tasks.length?'都完成了。接下来，享受自己的时间。':completion>=50?'已经走过一半，按自己的节奏继续。':completion>0?'每一小步，都算数。':'先从最想做的一件事开始。'));
    const list=$('#todayTasks');list.replaceChildren();tasks.forEach(t=>{const b=button('',`today-task ${M.tone(t)}${M.progress(t)===100?' complete':''}`,()=>focusTask(t.id,true));b.dataset.overviewId=t.id;b.dataset.focusKey='overview-'+t.id;b.setAttribute('aria-pressed',String(expanded===t.id));b.append(el('span','today-task-mark',M.progress(t)===100?'✓':''),el('span','today-task-title',t.title),el('small','',`${M.progress(t)}%`));list.append(b);});if(!tasks.length)list.append(button('＋ 给今天添一件事','today-empty-add',()=>editTask(null,today())));
    const files=$('#fileList');files.replaceChildren();const sorted=data.files.filter(f=>fileSort==='modified'||f.opened>0).sort((a,b)=>b[fileSort]-a[fileSort]).slice(0,6);sorted.forEach(f=>{const b=button('','file-row',()=>openNote(f.name));b.title=f.name;b.dataset.focusKey='file-'+f.name;b.append(el('span','file-icon','md'),el('span','file-name',f.name),el('span','file-status',Host||noteContents.has(f.name)?'↗':'需重选'));files.append(b);});if(!sorted.length)files.append(el('p','empty-note',fileSort==='opened'?'打开的笔记会出现在这里。':Host?'笔记库中还没有 Markdown 文件。':'选择笔记后，按文件修改时间排列。'));
    renderPlanWidget();const reviewHost=$('[data-widget=ebbinghaus]');if(reviewHost)reviewController?.render(reviewHost);
    if(activeKey)$$('[data-focus-key]').find(n=>n.dataset.focusKey===activeKey&&n.getClientRects().length)?.focus({preventScroll:true});
  }
  function renderPlanWidget(){
    const host=$('#planWidgetList');if(!host)return;host.replaceChildren();
    const plans=[...data.plans].sort((a,b)=>Number(a.end<today())-Number(b.end<today())||a.start.localeCompare(b.start));
    for(const p of plans){const linked=data.tasks.filter(t=>t.planId===p.id),progress=linked.length?Math.round(linked.reduce((sum,t)=>sum+M.progress(t),0)/linked.length):0,card=button('',`plan-widget-card ${M.tone(p)}`,()=>editPlan(p));card.dataset.planId=p.id;card.dataset.focusKey='plan-'+p.id;const title=el('span','plan-widget-title');title.append(el('strong','',p.title),el('span','',`${progress}%`));const meter=el('span','progress-track');meter.dataset.progressKey='plan-'+p.id;meter.style.setProperty('--progress',progress+'%');const meta=el('span','plan-widget-meta');meta.append(el('span','',`${p.start.slice(5).replace('-','.')} — ${p.end.slice(5).replace('-','.')}`),el('span','',linked.length?`${linked.length} 项行动`:'等待第一步'));card.append(title,meter,meta);card.addEventListener('contextmenu',e=>{e.preventDefault();priority(p);});host.append(card);}
    if(!plans.length)host.append(el('p','plan-widget-empty','给想做很久的事，留一段时间。'));host.append(button('＋ 开始一个长期计划','text-button plan-widget-add',()=>editPlan()));
  }
  function commandPalette(){
    const dialog=modal($('#editor'),'你想找哪件事？');dialog.classList.add('command-dialog');
    const input=el('input','command-search');input.type='search';input.placeholder='搜索任务、笔记或计划…';input.setAttribute('aria-label','搜索任务、笔记或计划');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','true');input.autocomplete='off';
    const results=el('div','command-results');results.id='commandResults';results.setAttribute('role','listbox');results.setAttribute('aria-label','搜索结果');input.setAttribute('aria-controls',results.id);const hint=el('p','command-hint','↑ ↓ 选择   ↵ 打开   Esc 返回');let selected=0,entries=[];
    const showTask=id=>{dialog.close();expanded=null;focusTask(id);const target=$$('.task-card').find(n=>n.dataset.taskId===id&&n.getClientRects().length);if(target){returnFocus=target;requestAnimationFrame(()=>target.focus({preventScroll:true}));}};
    function activate(){entries[selected]?.run();}
    function choose(index){selected=Math.max(0,Math.min(entries.length-1,index));[...results.querySelectorAll('.command-result')].forEach((node,i)=>{node.setAttribute('aria-selected',String(i===selected));node.classList.toggle('is-active',i===selected);if(i===selected){input.setAttribute('aria-activedescendant',node.id);node.scrollIntoView({block:'nearest'});}});if(!entries.length)input.removeAttribute('aria-activedescendant');}
    function draw(){
      const query=input.value.trim().toLocaleLowerCase();results.replaceChildren();selected=0;
      const matches=text=>!query||text.toLocaleLowerCase().includes(query);
      entries=[...data.tasks].filter(t=>matches([t.title,t.date,t.note,...t.nodes.map(n=>n.text)].join(' '))).sort((a,b)=>Number(M.progress(a)===100)-Number(M.progress(b)===100)||Math.abs(M.date(a.date)-M.date(today()))-Math.abs(M.date(b.date)-M.date(today()))).slice(0,12).map(t=>({title:t.title,meta:`任务 · ${t.date} · ${M.progress(t)}%`,tone:M.tone(t),run:()=>showTask(t.id)}));
      if(query){entries.push(...data.plans.filter(p=>matches(p.title)).slice(0,4).map(p=>({title:p.title,meta:`长期计划 · ${p.start} — ${p.end}`,tone:M.tone(p),run:()=>{dialog.close();editPlan(p);}})));entries.push(...data.files.filter(f=>matches(f.name)).slice(0,4).map(f=>({title:f.name,meta:'Markdown 笔记',run:()=>{dialog.close();openNote(f.name);}})));}
      if(!entries.length)results.append(el('p','command-empty',query?'没有找到，换个关键词试试。':'还没有任务，从一个小小的开始出发。'));
      entries.forEach((entry,i)=>{const b=button('',`command-result${entry.tone?' '+entry.tone:''}`,()=>entry.run());b.id='commandResult-'+i;b.setAttribute('role','option');b.tabIndex=-1;b.append(el('strong','',entry.title),el('span','command-result-meta',entry.meta),el('span','command-result-arrow','↗'));b.addEventListener('pointermove',()=>choose(i));results.append(b);});choose(0);
    }
    input.addEventListener('input',draw);input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();choose(selected+(e.key==='ArrowDown'?1:-1));}else if(e.key==='Enter'){e.preventDefault();activate();}});
    dialog.append(input,results,hint);draw();dialog.showModal();input.focus();
  }
  function openNote(name){if(Host){Host.openMarkdown(name).catch(error=>toast(error.message));return;}if(!noteContents.has(name)){toast('请重新选择这篇 Markdown 文件以读取内容');return;}const f=data.files.find(f=>f.name===name);if(f){f.opened=Date.now();persist();renderSide();}const dialog=modal($('#noteDialog'),name),pre=el('pre','note-content',noteContents.get(name));dialog.append(pre);dialog.showModal();}
  async function importFile(file){
    toast('正在读取课表…');try{const results=await IHomeXlsx.read(file),dialog=modal($('#editor'),'导入课表'),select=selectField('工作表',results.map((r,i)=>[String(i),r.sheet]),'0'),preview=el('div','import-preview');
      function show(){const r=results[Number(select.input.value)];preview.replaceChildren(el('p','import-summary',`${r.unique} 门课程 · ${r.courses.length} 个排课块 · ${r.unscheduled.length} 门待排`),el('p','muted small',`已合并 ${r.duplicates} 个重复排课块。确认后替换当前每周课表；任务保留。`));const list=el('div','import-list');r.courses.forEach(c=>list.append(el('p','small',`周${dayNames[c.day-1]} ${c.start}–${c.end}节 · ${c.name} · ${c.place||'地点待定'}`)));r.unscheduled.forEach(c=>list.append(el('p','small',`待排 · ${c.name} · ${c.reason}`)));preview.append(list);r.warnings.forEach(w=>preview.append(el('p','form-error',w)));preview.append(el('p','muted small','未提供周次时作为每周模板展示，不推断单双周或学期起止。'));}select.input.addEventListener('change',show);show();const actions=el('div','dialog-actions');actions.append(button('取消','quiet-button',()=>dialog.close()),button('确认替换课表','primary-button',()=>{const r=results[Number(select.input.value)];change(()=>{data.courses=r.courses;data.unscheduled=r.unscheduled;data.courseSource=file.name+' · '+r.sheet;},'课表已导入');dialog.close();}));dialog.append(select.label,preview,actions);dialog.showModal();}catch(error){toast('未导入：'+error.message);}
  }
  function transitionCalendar(update,options){if(window.IHomeMotion)void window.IHomeMotion.transition($('#viewHost'),update,options);else update();}
  function switchView(next){if(next===view)return;transitionCalendar(()=>{view=next;expanded=null;render();});}
  function navigate(delta){transitionCalendar(()=>{const d=M.date(focus);if(view==='week')focus=M.add(focus,delta*7);else if(view==='month')focus=M.iso(new Date(d.getFullYear(),d.getMonth()+delta,1));else focus=M.iso(new Date(d.getFullYear()+delta,d.getMonth(),1));expanded=null;render();},{direction:delta});}
  $('#prev').onclick=()=>navigate(-1);$('#next').onclick=()=>navigate(1);$('#today').onclick=()=>{focus=today();expanded=null;render();};$('.brand').onclick=e=>{e.preventDefault();focus=today();render();};$('#quickAdd').onclick=()=>editTask(null,focus);$('#addPlan').onclick=()=>editPlan();$$('button[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $('#themeToggle').onchange=e=>{data.theme=e.target.value;applyTheme();persist();};matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(data.theme==='auto')applyTheme();});
  $$('[data-files]').forEach(b=>b.onclick=()=>{fileSort=b.dataset.files;$$('[data-files]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));renderSide();});
  $('#importCourses').onclick=()=>$('#xlsxInput').click();$('#xlsxInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)importFile(f);};$('#loadNotes').onclick=()=>$('#notesInput').click();
  $('#notesInput').onchange=async e=>{const files=[...e.target.files];for(const f of files){if(f.size>5*1024*1024){toast(`${f.name} 超过5 MB，未读取`);continue;}noteContents.set(f.name,await f.text());const old=data.files.find(n=>n.name===f.name);if(old)old.modified=f.lastModified;else data.files.push({name:f.name,modified:f.lastModified,opened:0});}e.target.value='';persist();renderSide();};
  $('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`i-home-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('#restoreData').onclick=()=>$('#backupInput').click();
  $('#backupInput').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const restored=JSON.parse(await f.text());if(!M.validate(restored))throw Error('不是有效的 i-home 备份');restored.reviews??=[];restored.reviewRevision??=0;const d=modal($('#editor'),'恢复备份');d.append(el('p','',`${restored.tasks.length} 项任务，${restored.plans.length} 个计划，${restored.reviews.length} 篇复习记录。恢复将替换${Host?'当前笔记库中 i-home':'当前浏览器中'}的数据。`));const a=el('div','dialog-actions'),confirm=button('确认恢复','primary-button',async()=>{confirm.disabled=true;try{if(Host){const snapshot=await Host.restore(restored);data=restored;data.files=Host.files();data.reviews=snapshot.reviews;data.reviewRevision=snapshot.reviewRevision;undoStack=[];saveBlocked=false;expanded=null;applyTheme();render();$('#saveStatus').textContent='已保存到当前笔记库';toast('备份已恢复');}else{saveBlocked=false;change(()=>{data=restored;expanded=null;applyTheme();},'备份已恢复');}d.close();}catch(error){toast(error?.message||'备份未能恢复，请重试');}finally{confirm.disabled=false;}});a.append(button('取消','quiet-button',()=>d.close()),confirm);d.append(a);d.showModal();}catch(error){toast(error.message);}};
  $('#commandPalette')?.addEventListener('click',commandPalette);
  document.addEventListener('keydown',e=>{const typing=e.target.closest('input,textarea,select,[contenteditable=true]');if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!typing&&!$('dialog[open]')){e.preventDefault();commandPalette();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('dialog[open]'))editTask();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!typing&&!$('dialog[open]')){e.preventDefault();undoLast();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderSide();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('dialog[open]')&&expanded){e.preventDefault();const id=expanded;closeTask();$$('.task-card').find(n=>n.dataset.taskId===id&&n.getClientRects().length)?.focus({preventScroll:true});}});
  document.addEventListener('click',e=>{if(expanded&&e.target.isConnected&&!$('dialog[open]')&&!e.target.closest('.task-entry,.today-task,.task-detail,dialog,#toast'))closeTask();});
  matchMedia('(max-width:700px)').addEventListener('change',()=>{renderDetail();syncSelection();});
  window.IHomeUI={
    syncReviews:snapshot=>reviewController?.sync(snapshot),
    syncPreferences:preferences=>{if(Host)Host.preferences=preferences;applyLook(preferences.style);if(preferences.widgets){widgets=preferences.widgets;applyWidgets();}},
    newTask:(note='')=>editTask(null,today(),null,note),
    syncFiles:(files,rename)=>{
      data.files=files;
      if(rename){const map=p=>p===rename.oldPath?rename.path:p.startsWith(rename.oldPath+'/')?rename.path+p.slice(rename.oldPath.length):p;
        data.tasks.forEach(t=>t.note=map(t.note));undoStack=undoStack.map(raw=>{const old=JSON.parse(raw);old.tasks.forEach(t=>t.note=map(t.note));old.files=files;return JSON.stringify(old);});
        $$('[data-note-input]').forEach(n=>n.value=map(n.value));
      }
      renderSide();if(expanded&&!document.activeElement?.matches('input,textarea'))renderDetail();
    },
    syncTheme:theme=>{if(Host)Host.theme=theme;applyTheme();}
  };
  if(Host){
    $('#themeToggle option[value=auto]').textContent='明暗 · 跟随 Obsidian';$('#loadNotes').textContent='查找笔记';$('#loadNotes').onclick=async()=>{try{const path=await chooseNote();if(path)openNote(path);}catch(error){toast(error.message);}};
    $('[data-widget=notes] p').textContent='关联笔记库中的 Markdown，点击直接打开。';
    $('.rail-note p').textContent='任务、计划与课表自动保存在当前笔记库。';
    $('footer>span').textContent='i-home · '+Host.version;
  }
  const lookButton=button('◈ 外观','quiet-button',lookPicker,'切换界面风格');lookButton.id='lookPicker';$('.header-tools').prepend(lookButton);
  const widgetRegistry={today:{title:'今日概览',description:'用一个小小的圆，看见今天的进展'},notes:{title:'笔记',description:'让最近的想法，和下一步行动连在一起'},plans:{title:'长期计划',description:'汇总跨月行动，把想做的事慢慢完成'},ebbinghaus:{title:'Ebbinghaus',description:'1、3、7、15、31 天，在恰好的时刻重温'}};
  let widgets=Host?.preferences?.widgets||Object.keys(widgetRegistry);
  if(!Host)try{const saved=JSON.parse(localStorage.getItem('i-home.preview.widgets'));if(Array.isArray(saved))widgets=[...new Set(saved.filter(id=>Object.prototype.hasOwnProperty.call(widgetRegistry,id)))];}catch{}
  function applyWidgets(){const activeKey=document.activeElement?.dataset.focusKey,list=$('#widgetList'),before=new Map($$('[data-widget]').filter(n=>!n.hidden).map(n=>[n,n.getBoundingClientRect()]));for(const id of Object.keys(widgetRegistry)){const node=$(`[data-widget=${id}]`);if(node)node.hidden=!widgets.includes(id);}for(const id of widgets){const node=$(`[data-widget=${id}]`);if(node)list.append(node);}$('#widgetEmpty').hidden=widgets.length>0;list.dataset.widgetCount=String(widgets.length);if(activeKey)$$('[data-focus-key]').find(n=>n.dataset.focusKey===activeKey&&n.getClientRects().length)?.focus({preventScroll:true});if(!reducedMotion())for(const [node,rect] of before){if(node.hidden)continue;const diff=rect.top-node.getBoundingClientRect().top;if(Math.abs(diff)>1)node.animate([{transform:`translateY(${diff}px)`},{transform:'translateY(0)'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});}}
  async function saveWidgets(){applyWidgets();try{if(Host)await Host.setWidgets([...widgets]);else localStorage.setItem('i-home.preview.widgets',JSON.stringify(widgets));}catch{toast('组件布局未能保存，请重试');}}
  let widgetDrag=null;
  function resetWidgetDrag(){widgetDrag=null;$$('[data-widget]').forEach(n=>{n.classList.remove('widget-dragging','widget-drop-target');delete n.dataset.dropPlacement;});}
  for(const [id,meta] of Object.entries(widgetRegistry)){
    const card=$(`[data-widget=${id}]`);if(!card)continue;const handle=button('⠿','widget-drag-handle',null,`排序：${meta.title}，按上、下方向键移动`);handle.draggable=true;handle.dataset.focusKey='widget-'+id;handle.title='拖动排序 · 也可使用 ↑ ↓';handle.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown');card.querySelector('.section-head')?.append(handle);
    handle.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const pos=widgets.indexOf(id),next=pos+(e.key==='ArrowUp'?-1:1);if(next<0||next>=widgets.length)return;[widgets[pos],widgets[next]]=[widgets[next],widgets[pos]];void saveWidgets();toast(`${meta.title}已${next<pos?'上移':'下移'}`);});
    handle.addEventListener('dragstart',e=>{widgetDrag=id;e.stopPropagation();e.dataTransfer.setData('application/x-ihome-widget',id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setDragImage(card,Math.min(card.clientWidth-16,Math.max(0,e.clientX-card.getBoundingClientRect().left)),20);card.classList.add('widget-dragging');});handle.addEventListener('dragend',resetWidgetDrag);
    card.addEventListener('dragover',e=>{if(!widgetDrag||widgetDrag===id)return;e.preventDefault();e.dataTransfer.dropEffect='move';$$('.widget-drop-target').forEach(n=>n.classList.remove('widget-drop-target'));card.classList.add('widget-drop-target');card.dataset.dropPlacement=e.clientY<card.getBoundingClientRect().top+card.clientHeight/2?'before':'after';});
    card.addEventListener('dragleave',e=>{if(!card.contains(e.relatedTarget))card.classList.remove('widget-drop-target');});
    card.addEventListener('drop',e=>{if(!widgetDrag||widgetDrag===id)return;e.preventDefault();e.stopPropagation();const moving=widgetDrag,after=e.clientY>=card.getBoundingClientRect().top+card.clientHeight/2;widgets=widgets.filter(v=>v!==moving);widgets.splice(widgets.indexOf(id)+(after?1:0),0,moving);resetWidgetDrag();void saveWidgets();toast('组件已放在新的位置');});
  }
  $('#manageWidgets').onclick=()=>{
    const dialog=modal($('#editor'),'搭建你的组件区');dialog.append(el('p','muted small','选择想留在手边的组件，排列成自己的节奏。'));const options=el('div','widget-options');
    function draw(){const activeKey=document.activeElement?.dataset.focusKey;options.replaceChildren();for(const id of [...widgets,...Object.keys(widgetRegistry).filter(id=>!widgets.includes(id))]){const row=el('div','widget-option'),label=el('label'),check=el('input');check.type='checkbox';check.dataset.focusKey='widget-choice-'+id;check.checked=widgets.includes(id);check.onchange=()=>{widgets=check.checked?[...widgets,id]:widgets.filter(v=>v!==id);void saveWidgets();draw();};label.append(check,el('strong','',widgetRegistry[id].title),el('span','muted small',widgetRegistry[id].description));row.append(label);const pos=widgets.indexOf(id);for(const [delta,text] of [[-1,'上移'],[1,'下移']]){const b=button(text,'quiet-button',()=>{[widgets[pos],widgets[pos+delta]]=[widgets[pos+delta],widgets[pos]];void saveWidgets();draw();},widgetRegistry[id].title+text);b.dataset.focusKey='widget-order-'+id+'-'+delta;b.disabled=pos<0||pos+delta<0||pos+delta>=widgets.length;row.append(b);}options.append(row);}if(activeKey){const target=[...options.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===activeKey);if(target&&!target.disabled)target.focus({preventScroll:true});else if(target)target.closest('.widget-option').querySelector('input').focus({preventScroll:true});}}
    draw();dialog.append(options,el('p','muted small','也可以拖动卡片右上角的手柄排序，或选中手柄后按 ↑ ↓。布局会自动保存。'),button('完成','primary-button',()=>dialog.close()));dialog.showModal();
  };
  applyWidgets();
  applyLook(look);applyTheme();render();if(!Host)persist();else $('#saveStatus').textContent='已连接当前笔记库';if(saveBlocked)toast('已有数据无法读取，已保留原记录。可先导出当前数据，再恢复有效备份。');
})();


