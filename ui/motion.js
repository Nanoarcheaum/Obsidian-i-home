(function (root) {
  'use strict';
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.22,.78,.18,1)';
  const duration = 620;
  let active = null, painting = false;
  const rect = r => ({left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom});
  const borderKeys = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor'];
  const radiusKeys = ['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'];
  const intersect = (a,b) => ({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});

  function frozen(node) {
    const copy = node.cloneNode(true), originals = [node,...node.querySelectorAll('*')], copies = [copy,...copy.querySelectorAll('*')];
    originals.forEach((original,index) => {
      const target = copies[index], style = getComputedStyle(original);
      for (const property of style) target.style.setProperty(property,style.getPropertyValue(property));
      for (const attr of [...target.attributes]) if (attr.name==='id'||attr.name.startsWith('data-')||attr.name.startsWith('aria-')) target.removeAttribute(attr.name);
      Object.assign(target.style,{animation:'none',transition:'none',pointerEvents:'none',visibility:'visible'});
      target.classList.remove('ihome-morph-hidden');
      target.removeAttribute('autofocus');target.removeAttribute('draggable');target.tabIndex=-1;
    });
    return copy;
  }
  function appearance(style, r) {
    const result = {backgroundColor:style.backgroundColor,boxShadow:style.boxShadow};
    for (const key of borderKeys) result[key]=style[key];
    for (const key of radiusKeys) result[key]=style[key].includes('%')?Math.min(r.width,r.height)*parseFloat(style[key])/100+'px':style[key];
    return result;
  }
  function snapshot(node,host) {
    if (!node.getClientRects().length) return null;
    let r=rect(node.getBoundingClientRect()), style=getComputedStyle(node),kind='block';
    if (node.classList.contains('task-dot')) {
      kind='dot';style=getComputedStyle(node,'::before');
      const left=parseFloat(style.left)||6,top=parseFloat(style.top)||6;
      r={left:r.left+left,top:r.top+top,width:parseFloat(style.width)||8,height:parseFloat(style.height)||8};r.right=r.left+r.width;r.bottom=r.top+r.height;
    } else if (node.classList.contains('mini-task-dot')) kind='dot';
    let visible=intersect(r,{left:0,top:0,right:innerWidth,bottom:innerHeight});
    for(let parent=node.parentElement;parent;parent=parent.parentElement){
      const css=getComputedStyle(parent);
      if(/auto|scroll|hidden|clip/.test(css.overflowX+' '+css.overflowY))visible=intersect(visible,parent.getBoundingClientRect());
      if(parent===host)break;
    }
    if(r.width<.2||r.height<.2||visible.right-visible.left<.2||visible.bottom-visible.top<.2)return null;
    let content=null;
    if(kind==='block'){
      content=frozen(node);Object.assign(content.style,{position:'absolute',left:'0px',top:'0px',right:'auto',bottom:'auto',margin:'0px',width:r.width+'px',height:r.height+'px',minWidth:'0px',minHeight:'0px',maxWidth:'none',maxHeight:'none',transform:'none',opacity:'1',background:'transparent',boxShadow:'none',borderColor:'transparent'});
    }
    return {id:node.dataset.taskId,node,r,kind,content,appearance:appearance(style,r),clip:[Math.max(0,visible.top-r.top),Math.max(0,r.right-visible.right),Math.max(0,r.bottom-visible.bottom),Math.max(0,visible.left-r.left)]};
  }
  function capture(host) {
    const found=new Map();
    for(const node of host.querySelectorAll('[data-task-id]')){
      if(node.classList.contains('ihome-morph-hidden'))continue;
      const shot=snapshot(node,host);if(shot&&!found.has(shot.id))found.set(shot.id,shot);
    }
    return found;
  }
  function inFlight(run) {
    const found=new Map();
    for(const entry of run.movers){
      if(!entry.element.isConnected||+getComputedStyle(entry.element).opacity<.02)continue;
      const r=rect(entry.element.getBoundingClientRect()), content=document.createElement('div');
      for(const child of entry.element.querySelectorAll(':scope > .ihome-morph-content')) content.append(frozen(child));
      Object.assign(content.style,{position:'absolute',inset:'0',width:r.width+'px',height:r.height+'px'});
      found.set(entry.id,{id:entry.id,r,kind:entry.to?.kind||entry.from.kind,content,appearance:appearance(getComputedStyle(entry.surface),r),clip:[0,0,0,0]});
    }
    return found;
  }
  function backdrop(host) {
    const ghost=host.cloneNode(true),all=[ghost,...ghost.querySelectorAll('*')],source=[host,...host.querySelectorAll('*')],positions=[];
    all.forEach((node,index)=>{
      if(node.dataset.taskId)node.style.visibility='hidden';
      for(const attr of [...node.attributes])if(attr.name==='id'||attr.name.startsWith('data-'))node.removeAttribute(attr.name);
      if(source[index].scrollTop||source[index].scrollLeft)positions.push([node,source[index].scrollTop,source[index].scrollLeft]);
    });
    const r=host.getBoundingClientRect();ghost.classList.add('ihome-view-ghost');ghost.inert=true;ghost.setAttribute('aria-hidden','true');
    Object.assign(ghost.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    document.body.append(ghost);positions.forEach(([node,top,left])=>{node.scrollTop=top;node.scrollLeft=left;});return ghost;
  }
  function animate(run,node,frames,options={}) {
    const animation=node.animate(frames,{duration,easing:ease,fill:'both',...options});run.animations.push(animation);return animation;
  }
  function contentLayer(run,parent,shot,incoming,delay) {
    if(!shot?.content)return;
    const layer=document.createElement('div');layer.className='ihome-morph-content';layer.append(shot.content);parent.append(layer);
    animate(run,layer,incoming?[{opacity:0,offset:0},{opacity:0,offset:.35},{opacity:1,offset:1}]:[{opacity:1,offset:0},{opacity:0,offset:.52},{opacity:0,offset:1}],{delay,easing:'linear'});
  }
  function move(run,from,to,index) {
    const start=from||to,end=to||from,element=document.createElement('div'),surface=document.createElement('div');
    element.className='ihome-task-morph';element.dataset.morphTaskId=start.id;element.dataset.fromKind=from?.kind||'absent';element.dataset.toKind=to?.kind||'absent';
    surface.className='ihome-morph-surface';element.append(surface);run.layer.append(element);
    const delay=Math.min(index*8,56),entry={id:start.id,element,surface,from,to};run.movers.push(entry);
    const frame=shot=>({transform:`translate3d(${shot.r.left}px,${shot.r.top}px,0)`,width:shot.r.width+'px',height:shot.r.height+'px',clipPath:`inset(${shot.clip.map(n=>(n||-6)+'px').join(' ')})`,...Object.fromEntries(radiusKeys.map(key=>[key,shot.appearance[key]]))});
    Object.assign(surface.style,{borderStyle:'solid'});
    if(from&&to){
      animate(run,element,[frame(from),frame(to)],{delay});
      animate(run,surface,[from.appearance,to.appearance],{delay});
      contentLayer(run,element,from,false,delay);contentLayer(run,element,to,true,delay);
    }else{
      Object.assign(element.style,frame(start));Object.assign(surface.style,start.appearance);
      if(start.content){const content=document.createElement('div');content.className='ihome-morph-content';content.append(start.content);element.append(content);}
      animate(run,element,from?[{opacity:1},{opacity:0}]:[{opacity:0},{opacity:1}],{duration:from?210:340,delay:from?0:140});
    }
  }
  function reset() { if(active)active.finish(); }
  function transition(host,update,options={}) {
    if(media.matches||typeof Element.prototype.animate!=='function'){
      reset();update();return Promise.resolve();
    }
    const previous=active;
    const before=capture(host);
    if(previous)for(const [id,shot]of inFlight(previous))before.set(id,shot);
    reset();
    const ghost=backdrop(host);
    painting=true;
    try{update();}catch(error){ghost.remove();throw error;}finally{painting=false;}
    const after=capture(host),layer=document.createElement('div');layer.className='ihome-morph-layer';layer.inert=true;layer.setAttribute('aria-hidden','true');
    const hostBounds=rect(host.getBoundingClientRect());
    layer.style.clipPath=`inset(${Math.max(0,hostBounds.top)}px ${Math.max(0,innerWidth-hostBounds.right)}px ${Math.max(0,innerHeight-hostBounds.bottom)}px ${Math.max(0,hostBounds.left)}px)`;
    document.body.append(layer);
    let resolve;const finished=new Promise(done=>resolve=done),run={layer,ghost,movers:[],animations:[],finish:null};
    const hidden=[...after.values()].map(s=>s.node);hidden.forEach(node=>node.classList.add('ihome-morph-hidden'));
    const ancestors=[];for(let parent=host.parentElement;parent;parent=parent.parentElement)ancestors.push(parent);
    const scrollPositions=new Map([host,...host.querySelectorAll('*'),...ancestors].filter(node=>node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth).map(node=>[node,[node.scrollTop,node.scrollLeft]]));
    const onScroll=e=>{const pos=scrollPositions.get(e.target);if(pos&&(pos[0]!==e.target.scrollTop||pos[1]!==e.target.scrollLeft))run.finish();};
    const observer=new ResizeObserver(()=>{const r=host.getBoundingClientRect();if(['left','top','width','height'].some(key=>Math.abs(r[key]-hostBounds[key])>1))run.finish();});
    let completed=false;
    run.finish=()=>{if(completed)return;completed=true;run.animations.forEach(a=>a.cancel());hidden.forEach(n=>n.classList.remove('ihome-morph-hidden'));ghost.remove();layer.remove();observer.disconnect();document.removeEventListener('scroll',onScroll,true);if(active===run)active=null;resolve();};
    active=run;observer.observe(host);document.addEventListener('scroll',onScroll,true);
    const direction=options.direction||0;
    animate(run,ghost,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*10}px)`}],{duration:260});
    animate(run,host,[{opacity:0},{opacity:1}],{duration:400,delay:70});
    let index=0;
    for(const [id,from]of before)move(run,from,after.get(id),index++);
    for(const [id,to]of after)if(!before.has(id))move(run,null,to,index++);
    Promise.allSettled(run.animations.map(a=>a.finished)).then(run.finish);
    return finished;
  }
  media.addEventListener('change',()=>{if(media.matches)reset();});
  addEventListener('resize',reset);addEventListener('pagehide',reset);addEventListener('scroll',reset);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')reset();});
  new MutationObserver(reset).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-look']});
  new MutationObserver(records=>{if(records.some(record=>record.target.tagName==='DIALOG'))reset();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  root.IHomeMotion={transition,reset,beforeRender(){if(!painting)reset();}};
})(window);
