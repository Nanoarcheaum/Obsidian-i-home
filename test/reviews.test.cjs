const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../ui/reviews.js'),M=require('../ui/model.js');
const join=(path='学习/概念.md',day='2026-01-31')=>R.apply([],{type:'join',path},day).records;
const complete=(records,day)=>R.apply(records,{type:'complete',id:records[0].id,stage:records[0].stage,due:records[0].due},day);
test('five stages use 1, 3, 7, 15, 31 day intervals from each actual completion date',()=>{
  let records=join();assert.equal(records[0].due,'2026-02-01');
  for(const [day,due] of [['2026-02-01','2026-02-04'],['2026-02-04','2026-02-11'],['2026-02-11','2026-02-26'],['2026-02-26','2026-03-29'],['2026-03-29',null]]){
    records=complete(records,day).records;assert.equal(records[0].due,due);assert.ok(M.validateReviews(records));
  }
  assert.equal(records[0].status,'completed');assert.equal(records[0].stage,5);assert.equal(records[0].history.length,5);
});
test('overdue work remains one record and the next interval starts when completed',()=>{
  const records=join('逾期.md','2026-12-30');const q=R.queue(records,'2027-01-10');assert.equal(q.overdue.length,1);assert.equal(q.today.length,0);assert.equal(records[0].stage,0);
  const next=complete(records,'2027-01-10').records;assert.equal(next[0].due,'2027-01-13');assert.deepEqual(next[0].history,['2027-01-10']);assert.equal(R.queue(next,'2027-01-10').upcoming.length,1);
});
test('double completions and future completions do not skip review stages',()=>{
  const records=join(),action={type:'complete',id:records[0].id,stage:0,due:records[0].due};
  assert.equal(R.apply(records,action,'2026-01-31').changed,false);
  const first=R.apply(records,action,'2026-02-01');assert.equal(first.changed,true);const second=R.apply(first.records,action,'2026-02-01');assert.equal(second.changed,false);assert.equal(second.records[0].stage,1);
});
test('join deduplicates, exit keeps history, rejoin creates a fresh cycle',()=>{
  const initial=join(),id=initial[0].id;assert.equal(R.apply(initial,{type:'join',path:initial[0].path},'2026-02-01').changed,false);
  const completed=complete(initial,'2026-02-01').records,exited=R.apply(completed,{type:'exit',id},'2026-02-02').records;
  assert.equal(exited[0].status,'exited');assert.equal(R.queue(exited,'2026-02-02').exited.length,1);assert.deepEqual(exited[0].history,['2026-02-01']);
  const rejoined=R.apply(exited,{type:'join',path:exited[0].path},'2026-12-31').records;
  assert.equal(rejoined.length,1);assert.notEqual(rejoined[0].id,id);assert.equal(rejoined[0].due,'2027-01-01');assert.equal(rejoined[0].stage,0);
});
test('calendar dates handle leap days, year boundaries and DST without UTC date shifts',()=>{
  assert.equal(R.add('2028-02-28',1),'2028-02-29');assert.equal(R.add('2028-02-29',1),'2028-03-01');assert.equal(R.add('2026-12-31',1),'2027-01-01');
  assert.equal(R.days('2026-03-10','2026-03-07'),3);assert.equal(R.validDay('2026-02-29'),false);
});
test('renames/moves update paths, folder deletes clean descendants only, non-markdown rename exits',()=>{
  let records=[...join('课程/概念.md'),...join('课程2/概念.md')];records=R.rename(records,'课程','资料');assert.equal(records[0].path,'资料/概念.md');assert.equal(records[1].path,'课程2/概念.md');
  assert.equal(R.remove(records,'资料').length,1);assert.equal(R.rename(records,'资料/概念.md','资料/概念.txt').length,1);
});
test('validation rejects duplicate ids/paths, broken stages, invalid dates and invalid revision',()=>{
  const records=join();assert.equal(M.validateReviews([...records,...records]),false);
  for(const patch of [{due:'2026-02-30'},{stage:2},{status:'completed'},{path:'a.txt'},{history:['2026-02-01']}])assert.equal(M.validateReviews([{...records[0],...patch}]),false);
  const base={version:1,tasks:[],plans:[],courses:[],unscheduled:[],files:[],courseSource:'',theme:'auto'};
  assert.ok(M.validate(base));assert.ok(M.validate({...base,reviews:records,reviewRevision:0}));assert.equal(M.validate({...base,reviewRevision:-1}),false);
});
