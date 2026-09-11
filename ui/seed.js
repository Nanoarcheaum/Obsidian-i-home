(function () {
  "use strict";
  var state = {
    now:new Date(2026,8,3), shown:new Date(2026,8,1), weekStart:new Date(2026,7,31), year:2026,
    selectedDate:"2026-09-03", currentView:"month", expandedTaskId:null, quickDate:null, quickMode:"task", draggingTaskId:null,
    tasks:[
      makeTask(1,"2026-09-03","整理生物化学第二章","课程/生物化学/第二章.md",86,42,[["整理酶动力学公式",1],["补全三张反应路径图",1],["写一页章节小结",0]]),
      makeTask(2,"2026-09-03","AI 科学计算作业","课程/人工智能与科学计算/作业-01.md",82,88,[["复现基线模型",1],["检查训练曲线",0],["撰写实验讨论",0],["整理提交文件",0]]),
      makeTask(3,"2026-09-05","植物学实验预习","课程/植物学/实验-03.md",67,31,[["阅读实验步骤",1],["画观察记录模板",0]]),
      makeTask(4,"2026-09-08","概率论习题课","课程/概率论/习题集.md",75,79,[["完成 3.1",1],["完成 3.2",1],["标记疑问",1]]),
      makeTask(5,"2026-09-11","论文组会准备","科研/组会/0911.md",91,58,[["通读论文",1],["整理方法图",0],["准备三个问题",0]]),
      makeTask(6,"2026-09-17","物理实验报告","课程/物理实验/报告-02.md",48,84,[["处理原始数据",0],["拟合误差曲线",0],["完成讨论",0]]),
      makeTask(7,"2026-09-24","月度知识整理","复盘/2026-09.md",35,28,[["清理收集箱",0],["补全双向链接",0]])
    ],
    annualPlans:[
      {id:"a1",title:"完成知识库重构",start:1,end:4,importance:88,urgency:35},
      {id:"a2",title:"交叉科研轮转",start:5,end:9,importance:92,urgency:62},
      {id:"a3",title:"秋冬课程与期末",start:9,end:12,importance:78,urgency:81}
    ],
    reviews:[
      {id:1,title:"Michaelis–Menten 动力学",path:"生物化学/酶动力学.md",stage:"第 7 天",overdue:true},
      {id:2,title:"条件概率与贝叶斯公式",path:"概率论/02-条件概率.md",stage:"第 3 天",overdue:false},
      {id:3,title:"Transformer 注意力机制",path:"AI/模型/Transformer.md",stage:"第 1 天",overdue:false}
    ],
    files:{
      opened:[["实验记录：叶片横切","植物学/实验","8m"],["Transformer","AI/模型","31m"],["周三组会","科研/会议","1h"],["概率分布速查","概率论","昨天"]],
      modified:[["生物化学第二章","生物化学","4m"],["物理实验数据","普通物理","22m"],["九月计划","复盘","2h"],["科研轮转想法","科研","昨天"]]
    }
  };
  var periods=["08:00–08:45","08:50–09:35","10:00–10:45","10:50–11:35","11:40–12:25","13:25–14:10","14:15–15:00","15:05–15:50","16:15–17:00","17:05–17:50","18:50–19:35","19:40–20:25","20:30–21:15"];
  var dayNames=["星期一","星期二","星期三","星期四","星期五","星期六","星期日"];
  var courses=[
    course("生物化学（甲）",1,1,2,"紫金港西2-301","江辉","BIO2011F","c2"),course("生物化学（甲）",5,1,2,"紫金港西2-301","江辉","BIO2011F","c2"),
    course("普通物理学Ⅱ（H）",2,1,2,"紫金港西1-402","曹超 / LIM LIH KING","PHY2001GH","c3"),course("普通物理学Ⅱ（H）",4,1,2,"紫金港西1-402","曹超 / LIM LIH KING","PHY2001GH","c3"),
    course("皮划艇（初级）",1,3,4,"紫金港水上码头","贾浩程","PPAE0029G","c4"),course("植物学及实验（甲）",2,3,5,"紫金港西2-219","赵云鹏 / 崔瑾","BIO2019F","c2"),
    course("植物学及实验（甲）",4,3,4,"生物实验中心-212","赵云鹏 / 崔瑾","BIO2019F","c2"),course("马克思主义基本原理",5,3,5,"紫金港西2-313","高永","MARX2001G","c4"),
    course("生物化学实验（甲）",3,1,4,"生物实验中心-308","应颖慧","BIO2012F","c2"),course("有机化学实验",1,6,10,"化学实验中心-537","秦敏锐","CHEM2001MZ","c4"),
    course("人工智能与科学计算",2,6,8,"紫金港西1-315","魏颖","CS2285FH","c3"),course("普通物理学实验Ⅱ",3,6,8,"紫金港东4-212","陈水桥","PHY2005GH","c3"),
    course("概率论和数理统计",4,6,8,"紫金港西1-211","黄炜","MATH2461FZ","c4"),course("双脑与心理健康",3,11,12,"紫金港北2-112","胡少华 / 王跃明 / 斯科","MED0647G1","c3"),
    course("基础交叉科学研讨课",5,11,13,"交叉研究院 101","李铁风","FUTR2001MZ","c2")
  ];
  function makeTask(id,date,title,note,importance,urgency,raw){return{id:id,date:date,title:title,note:note,importance:importance,urgency:urgency,scheduleStart:null,duration:2,nodes:raw.map(function(n){return{text:n[0],done:Boolean(n[1])};})};}
  function course(name,day,start,end,place,teacher,code,tone){return{name:name,day:day,start:start,end:end,place:place,teacher:teacher,code:code,tone:tone};}
  window.IHomeSeed = {tasks:state.tasks, plans:state.annualPlans, courses:courses};
}());
