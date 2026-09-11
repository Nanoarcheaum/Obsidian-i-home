const assert=require('node:assert/strict');
require('../ui/future-planner.js');
const F=globalThis.FuturePlanner;

assert.deepEqual(F.parseTimes('周四第3,4,5节'),[{day:4,start:3,end:5,raw:'周四第3,4,5节'}]);
assert.equal(F.empty().schemaVersion,2);
assert.equal(F.normalizeState(null).terms.length,11);

const curriculum={kind:'academic-curriculum-map',schemaVersion:1,metadata:{title:'测试'},courses:[{code:'MATH1',name:'数学',recommendedTerms:['y1-fall'],tags:['必修']}]};
assert.equal(F.validateCurriculum(curriculum),curriculum);
assert.throws(()=>F.validateCurriculum({...curriculum,schemaVersion:2}));

const course={id:'MATH1',code:'MATH1',name:'数学',credits:3,offerings:[{id:'A',rawTime:'周四第3,4节',times:[{day:4,start:3,end:4}]}]};
const merged=F.mergeCourses([course,{...course,offerings:[...course.offerings,{id:'B',rawTime:'周五第1节',times:[{day:5,start:1,end:1}]}]}]);
assert.equal(merged.length,1);
assert.equal(merged[0].offerings.length,2);

console.log('PASS: CourseCraft terms, timetable parsing, curriculum validation, and course merging.');
