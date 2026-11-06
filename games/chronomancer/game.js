(() => {
'use strict';
const $=id=>document.getElementById(id),KEY='chronoguard-v2',LEGACY_KEY='chronoguard-v1';
const city=[{id:'archer',name:'Обучить лучника',glyph:'➶',desc:'Лучник · 12 урона одной цели',base:45,building:'barracks'},{id:'mage',name:'Обучить хрономанта',glyph:'✦',desc:'Маг · 30 урона + небольшой взрыв',base:110,building:'academy'},{id:'clock',name:'Расширить казну',glyph:'◷',desc:'+10 хронов за каждую победу',base:60,building:'mint'},{id:'loot',name:'Сбор трофеев',glyph:'◇',desc:'+1 хрон за монстра · с босса в 5 раз больше',base:55,building:'mint'},{id:'wall',name:'Укрепить стены',glyph:'▥',desc:'+150 максимальной и текущей прочности',base:70,building:'bastion'}];
const eternal=[{id:'academy',name:'Чертёж академии',glyph:'✦',desc:'Построить академию. Открывает найм магов.',base:4,unlock:true},{id:'mint',name:'Чертёж казны',glyph:'◷',desc:'Построить казну. Улучшает награды за волны.',base:3,unlock:true},{id:'bastion',name:'Чертёж бастиона',glyph:'▥',desc:'Построить бастион. Укрепление и ремонт стен.',base:3,unlock:true},{id:'memory',name:'Память о рассвете',glyph:'◈',desc:'+80 хронов в начале следующей петли',base:3},{id:'power',name:'Урон отряда',glyph:'✧',desc:'+5% к урону всех бойцов за уровень в следующей петле. Каждый уровень стоит 1 осколок.',base:1},{id:'foundation',name:'Вечный фундамент',glyph:'▤',desc:'+100 прочности стен в следующей петле',base:3},{id:'flow',name:'Трофеи времени',glyph:'∞',desc:'+10 хронов за победу в следующей петле',base:5}];
const buildings=[{id:'barracks',name:'Казарма',sub:'Обучение бойцов',up:'archer',x:.28,y:.37,roof:'#a87779'},{id:'academy',name:'Академия',sub:'Обучение магов',up:'mage',x:.71,y:.30,roof:'#9a7ac4'},{id:'mint',name:'Казна',sub:'Награды за волны',up:'clock',x:.70,y:.69,roof:'#b39a64'},{id:'bastion',name:'Бастион',sub:'Прочность и ремонт',up:'wall',x:.27,y:.76,roof:'#7794a3'}];
city.push(
 {id:'farm',name:'Возделать поле',glyph:'♧',desc:'+2 еды после каждой победы',base:35,building:'farm'},
 {id:'house',name:'Построить жильё',glyph:'⌂',desc:'+2 жителя · +2 еды в день на содержание',base:45,building:'house'}
);
buildings.push(
 {id:'farm',name:'Фермы',sub:'Урожай в конце дня',roof:'#a5aa62'},
 {id:'house',name:'Дома',sub:'Расширение жилья',roof:'#c69668'}
);
buildings.forEach((building,index)=>{
 building.x=[.18,.50,.82][index%3];
 building.y=index<3?.31:.67;
});
buildings.push({id:'workshop',name:'Мастерская',sub:'Инженеры и ловушки',y:.67,roof:'#ae8b69'});
buildings.slice(3).forEach((building,index)=>{building.x=[.14,.38,.62,.86][index];});
eternal.unshift(
 {id:'archerTraining',name:'Школа лучников',glyph:'➶',desc:'Открывает обучение крестьян на лучников в казарме.',base:2,unlock:true},
 {id:'warriorTraining',name:'Школа воинов',glyph:'⚔',desc:'Открывает обучение крестьян на воинов в казарме.',base:3,unlock:true}
);
city.push(
 {id:'warrior',name:'Обучить воина',glyph:'⚔',desc:'Один крестьянин становится воином · 120 здоровья · 10 урона',base:65,building:'barracks'},
 {id:'warriorDamage',name:'Острые клинки',glyph:'⚔',desc:'+25% к базовому урону воинов',base:55,building:'barracks'},
 {id:'warriorSpeed',name:'Боевые упражнения',glyph:'»',desc:'+15% к базовой скорости атаки воинов',base:65,building:'barracks'},
 {id:'warriorArmor',name:'Крепкие доспехи',glyph:'▣',desc:'+20% к базовому здоровью воинов',base:60,building:'barracks'}
);
eternal.push({id:'scout',name:'Разведка перед волной',glyph:'⌖',desc:'При расстановке показывает входы орды, число врагов и место появления босса.',base:2,unlock:true});
eternal.push(
 {id:'foodStock',name:'Зимние запасы',glyph:'▣',desc:'+6 еды в начале петли.',base:2,unlock:true,choice:'supply'},
 {id:'farmYield',name:'Плодородная земля',glyph:'♧',desc:'+1 еда с каждой фермы за день.',base:2,unlock:true,choice:'supply'},
 {id:'extraSlot',name:'Башенный пост',glyph:'▥',desc:'Четвёртое место для бойца на каменной стене.',base:2,unlock:true,choice:'wall'},
 {id:'cheapRepair',name:'Артель каменщиков',glyph:'✚',desc:'Ремонт укрепления стоит 18 хронов вместо 30.',base:2,unlock:true,choice:'wall'}
);
eternal.push(
 {id:'heroPower',name:'Сила мага времени',glyph:'✦',desc:'+25% базового урона главного мага за уровень.',base:2},
 {id:'heroSpeed',name:'Ускорение времени',glyph:'»',desc:'+15% базовой скорости атаки главного мага за уровень.',base:2},
 {id:'heroHealth',name:'Временной щит',glyph:'▣',desc:'+32 здоровья главного мага за уровень.',base:2},
 {id:'heroShards',name:'Осколки за волны',glyph:'◇',desc:'+50% к очкам за пройденные волны за уровень. Начисляется в конце каждой петли, округляется вниз.',base:3}
);
eternal.push({id:'battleReport',name:'Разбор сражений',glyph:'▤',desc:'После волны открывает отчёт об уроне и прорывах.',base:2,unlock:true},{id:'heroSpells',name:'Управление временем',glyph:'✧',desc:'Перед волной позволяет выбрать стазис, восстановление или ускорение.',base:3,unlock:true});
const eternityBranches=[
 {name:'Войско',nodes:['archerTraining','warriorTraining'],dx:0,dy:-82},
 {name:'Снабжение',nodes:['memory','mint','flow'],dx:-102,dy:0},
 {name:'Цитадель',nodes:['bastion','foundation','academy'],dx:102,dy:0},
 {name:'Разведка',nodes:['scout'],dx:0,dy:103},
 {nodes:['battleReport'],parent:'scout',dx:-74,dy:35},
 {nodes:['heroSpells'],parent:'heroSpeed',dx:56,dy:-38},
 {name:'Маг времени',nodes:['heroPower','heroSpeed','heroHealth','heroShards'],dx:48,dy:40},
 {nodes:['foodStock'],parent:'mint',dx:-21,dy:-100},
 {nodes:['farmYield'],parent:'mint',dx:-21,dy:100},
 {nodes:['extraSlot'],parent:'foundation',dx:21,dy:-100},
 {nodes:['cheapRepair'],parent:'foundation',dx:23,dy:105}
];
const treeSize={width:720,height:410};
const treeCenter={x:360,y:210};
function previousNode(id){
 if(id==='power')return null;
 const branch=eternityBranches.find(entry=>entry.nodes.includes(id));
 const index=branch.nodes.indexOf(id);
 return index===0?(branch.parent||'power'):branch.nodes[index-1];
}
const trainingUnlock={archer:'archerTraining',warrior:'warriorTraining'};
const professions={archer:'Лучник',warrior:'Воин',mage:'Хрономант'};
const retrainFee=5;
const trainingKind=id=>Object.keys(trainingUnlock).find(kind=>id.startsWith(kind));
const initialUp=()=>({foodStock:0,farmYield:0,extraSlot:0,cheapRepair:0,scout:0,archerTraining:0,warriorTraining:0,memory:0,power:0,foundation:0,flow:0,academy:0,mint:0,bastion:0,heroPower:0,heroSpeed:0,heroHealth:0,heroShards:0,battleReport:0,heroSpells:0});
const initialCityUp=()=>({clock:0,archer:0,mage:0,wall:0,loot:0,warrior:0,farm:0,house:0,archerDamage:0,archerSpeed:0,mageDamage:0,mageSpeed:0,mageRadius:0,warriorDamage:0,warriorSpeed:0,warriorArmor:0});
city.push({id:'archerDamage',name:'Закалённые стрелы',glyph:'➶',desc:'+25% базового урона всех лучников',base:50,building:'barracks'},{id:'archerSpeed',name:'Быстрая тетива',glyph:'»',desc:'+15% скорости атаки всех лучников',base:60,building:'barracks'},{id:'mageDamage',name:'Сила заклинаний',glyph:'✦',desc:'+25% базового урона всех магов, включая героя',base:75,building:'academy'},{id:'mageSpeed',name:'Поток заклинаний',glyph:'»',desc:'+15% скорости атаки всех магов, включая героя',base:85,building:'academy'},{id:'mageRadius',name:'Расширение разрыва',glyph:'◎',desc:'+15% базового радиуса взрыва всех магов',base:90,building:'academy'});
let meta={loop:1,shards:0,best:0,eternityRecord:0,up:initialUp()},run,logs=[],speed=1,paused=false,freeze=0,cooldown=0,t=0,particles=[],last=performance.now(),saveTimer=0,uiTimer=0,openedBuilding=null,loopPlan=null,saveEpoch=Date.now();
function fresh(mode='normal'){return {mode,workers:{farm:0,build:0},vacancies:0,defenses:[],spell:'stasis',time:120+meta.up.memory*80,hp:250+meta.up.foundation*100,wave:0,kills:0,up:initialCityUp(),bonus:{...meta.up},active:false,planning:false,dead:false,defeated:false,enemies:[],units:[],formation:{},projectiles:[],spawned:0,spawnTimer:0,enemySerial:0,elapsed:0,stasisUsed:false,freezeTime:0,combatVersion:6,food:meta.up.foodStock?6:0,unfed:0,garrison:Array(meta.up.extraSlot?4:3).fill(null),lastReward:0,waveLoot:0};}
try{const s=JSON.parse(localStorage.getItem(KEY)??localStorage.getItem(LEGACY_KEY));if(s?.meta){saveEpoch=s.epoch||saveEpoch;meta=s.meta;meta.up={...initialUp(),...meta.up};logs=s.logs||[];run=s.schema===2?s.run:fresh();}if(!run||!Number.isFinite(run.time)||!run.up||!Array.isArray(run.enemies))run=fresh();}catch(e){run=fresh();logs=[];}if(!run)run=fresh();
if((run.combatVersion||0)<4){if(run.up.mage)meta.up.academy=1;if(run.up.clock)meta.up.mint=1;if(run.up.wall)meta.up.bastion=1;run.combatVersion=4;run.active=false;run.enemies=[];run.units=[];run.projectiles=[];run.spawned=0;run.enemySerial=0;run.freezeTime=0;run.stasisUsed=false;}
run.up={...initialCityUp(),...run.up};
if(run.combatVersion!==6){
 // Preserve recruits and the current wave while converting the formation.
 run.up.house=Math.max(run.up.house,Math.ceil((run.up.archer+run.up.mage+run.up.warrior-2)/2));
 run.units=[];
 run.projectiles=[];
 run.combatVersion=6;
}
run.formation=run.formation??{};
run.food=run.food??0;
run.unfed=run.unfed??0;
run.garrison=Array.from({length:(run.bonus??meta.up).extraSlot?4:3},(_,index)=>run.up.wall?(run.garrison?.[index]??null):null);
const modes={
 normal:{name:'Обычная петля',desc:'Стандартные правила.'},
 winter:{name:'Вечная зима',desc:'На каждой волне мороз. Урожай вдвое меньше.'},
 noMagic:{name:'Без магии',desc:'Маг времени, академия и заклинания недоступны.'},
 twins:{name:'Двойной дозор',desc:'На каждой пятой волне одновременно выходят два босса.'}
};
run.mode=Object.hasOwn(modes,run.mode)?run.mode:'normal';
run.workers??={farm:0,build:0};
run.defenses??=[];
const housing=()=>2+2*run.up.house;
const population=()=>housing()-(run.vacancies||0);
const employed=()=>recruits()+run.workers.farm+run.workers.build;
const freeResidents=()=>population()-employed();
const weatherTypes=[
 {name:'Ясно',desc:'Обычные условия.'},
 {name:'Туман',desc:'Дальность стрельбы ниже на 25%.'},
 {name:'Дождь',desc:'Враги и наземные бойцы движутся на 20% медленнее.'},
 {name:'Мороз',desc:'Урожай вдвое меньше.'}
];
const weather=()=>run.mode==='winter'?3:[0,0,1,2,0,3][run.wave%6];
const movement=()=>weather()===2?.8:1;
const recruits=()=>run.up.archer+run.up.mage+run.up.warrior;
const harvest=()=>Math.floor(((run.bonus.farmYield?3:2)*run.up.farm+2*run.workers.farm)*(weather()===3?.5:1));
const repairCost=()=>run.bonus.cheapRepair?18:30;
const dailyFood=()=>population();
const projectedShortage=()=>Math.max(0,dailyFood()-run.food-harvest());
const hungerPenalty=()=>Math.round(50*Math.min(1,run.unfed/Math.max(1,population())));
function settleFood(yieldFood=harvest()){
 const supply=run.food+yieldFood;
 const eaten=Math.min(dailyFood(),supply);
 run.food=supply-eaten;
 run.unfed=dailyFood()-eaten;
 return eaten;
}
function foodSummary(){
 const shortage=projectedShortage();
 return '<p>Запас <b>'+run.food+' еды</b></p><p>Урожай <b>+'+harvest()+
  ' еды</b></p><p>Содержание <b>−'+dailyFood()+' еды в день</b></p>'+
  (shortage?'<p>Ожидаемый дефицит <b>'+shortage+' еды</b></p>':'')+
  (run.unfed?'<p>Голод после прошлого дня <b>−'+hungerPenalty()+'% здоровья жителей в следующем бою</b></p>':'');
}
const fortName=()=>run.up.wall?'Каменная стена':'Частокол';
const isRanged=unit=>unit.kind==='archer'||unit.kind==='mage';
const attackRange=unit=>isRanged(unit)?(unit.onWall?.48:.40)*(weather()===1?.75:1):.028;
const wallPositions=()=>run.bonus.extraSlot?[.18,.39,.61,.82]:[.22,.50,.78];
function canBuyCity(item){
 if(run.active||run.planning||run.dead||!unlocked(item.building)||run.time<price(item))return false;
 const requirement=trainingUnlock[trainingKind(item.id)];
 if(requirement&&!meta.up[requirement])return false;
 return !['archer','mage','warrior'].includes(item.id)||freeResidents()>0;
}
function assignWall(slot,id){
 if(run.active||run.planning||run.dead||!run.up.wall||!Number.isInteger(slot)||slot<0||slot>=wallPositions().length)return;
 if(id!==null&&!defenders().some(unit=>unit.key===id&&isRanged(unit)))return;
 run.garrison=run.garrison.map((key,index)=>index===slot?id:(key===id?null:key));
 run.units=[];
 save();
 update();
}run.waveLoot=run.waveLoot||0;run.bonus=run.bonus||{...meta.up};run.enemySerial=run.enemySerial||0;freeze=run.bonus.heroSpells&&run.mode!=='noMagic'?run.freezeTime||0:0;cooldown=run.stasisUsed?1:0;
const warriorHealth=()=>120+24*run.up.warriorArmor;
function unitStats(kind,hero=false){
 if(kind==='peasant')return {damage:5,attackRate:1,radius:0};
 if(kind==='warrior')return {damage:10*(1+.25*run.up.warriorDamage),attackRate:1+.15*run.up.warriorSpeed,radius:0};
 if(hero)return {
  damage:12*(1+.25*(run.up.mageDamage+(run.bonus.heroPower||0))),
  attackRate:1+.15*(run.up.mageSpeed+(run.bonus.heroSpeed||0)),radius:0
 };
 const mage=kind==='mage';
 return {damage:(mage?30:12)*(1+.25*run.up[mage?'mageDamage':'archerDamage']),attackRate:1+.15*run.up[mage?'mageSpeed':'archerSpeed'],radius:mage?.055*(1+.15*run.up.mageRadius):0};
}
const actualDamage=stats=>stats.damage*(1+.05*run.bonus.power);
run.hp=Math.min(run.hp,250+run.bonus.foundation*100+run.up.wall*150);
const monsterLoot=e=>(1+run.up.loot)*(e.boss?5:1);
const unlocked=id=>!(run.mode==='noMagic'&&id==='academy')&&(['barracks','farm','house','workshop'].includes(id)||meta.up[id]>0),maxHP=()=>250+run.bonus.foundation*100+run.up.wall*150,dps=()=>defenders().reduce((sum,u)=>sum+actualDamage(u)*u.attackRate,0),count=()=>18+run.wave*6,waveReward=()=>60+(run.wave+1)*10+run.up.clock*10+run.bonus.flow*10,reward=()=>Math.floor(run.wave/2)+Math.floor(run.kills/12)+Math.floor(Object.values(run.up).reduce((a,b)=>a+b,0)/4),price=(item,level=run.up[item.id]||0)=>Math.ceil(item.base*Math.pow(1.52,level)),distance=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*300/448);
let staleTab=false;
function reloadLatest(){if(staleTab)return;staleTab=true;window.location?.reload();}
function save(){if(staleTab)return;try{let latest;try{latest=JSON.parse(localStorage.getItem(KEY));}catch(e){}if((latest?.epoch||0)>saveEpoch){reloadLatest();return;}localStorage.setItem(KEY,JSON.stringify({schema:2,epoch:saveEpoch,meta,run,logs}));}catch(e){$('saveLabel').textContent='Сохранение недоступно в этом браузере';}}
function log(text){logs.unshift({text,time:new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})});logs=logs.slice(0,25);renderLog();}
function renderLog(){$('log').replaceChildren(...logs.map(l=>{const d=document.createElement('div'),time=document.createElement('time'),s=document.createElement('span');d.className='log-row';time.textContent=l.time;s.textContent=l.text;d.append(time,s);return d;}));}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2400);}
function show(html){$('modal').classList.toggle('loop-planner',Boolean(loopPlan));$('modalContent').innerHTML=html;if(!$('modal').open)$('modal').showModal();}
// Refund exactly the integer prices originally paid for every purchased level.
const eternalPrice=(item,level)=>item.id==='power'?1:Math.ceil(item.base*Math.pow(1.8,level));
function invested(up=meta.up){return eternal.reduce((sum,item)=>{for(let level=0;level<(up[item.id]||0);level++)sum+=eternalPrice(item,level);return sum;},0);}
// Preserve the entire old allocation when migrating cumulative-reward saves.
const allocatedShards=invested();
meta.eternityRecord=Math.max(meta.eternityRecord||0,meta.shards+allocatedShards);
// Restore the difference when an owned upgrade becomes cheaper.
meta.shards=meta.eternityRecord-allocatedShards;
const bestScore=()=>run.mode==='normal'?(meta.scoreRecord??meta.eternityRecord):(meta.challengeRecords?.[run.mode]||0);
const scoreGain=()=>Math.max(0,reward()-bestScore());
const shardBonus=()=>Math.floor(Math.floor(run.wave/2)*.5*(run.bonus.heroShards||0));
const recordGain=()=>scoreGain()+shardBonus();
function pruneTree(up){
 for(const branch of eternityBranches){
  for(const id of branch.nodes){
   if(!up[previousNode(id)])up[id]=0;
  }
 }
}
function excludedBy(item,up){
 return item.choice?eternal.find(other=>other.id!==item.id&&other.choice===item.choice&&up[other.id]):null;
}
function challengePicker(){
 return '<h3>Режим следующей петли</h3><p>У каждого режима свой рекорд. Осколки поступают в общий пул.</p>'+
 Object.entries(modes).map(([id,mode])=>{
  const record=id==='normal'?(meta.scoreRecord??meta.eternityRecord):(meta.challengeRecords?.[id]||0);
  return '<button class="speed" data-mode="'+id+'" aria-pressed="'+(loopPlan.mode===id)+'">'+mode.name+' · '+record+' ✧</button>';
 }).join('')+'<p>'+modes[loopPlan.mode].desc+'</p>';
}
function openLoopPlanner(){
 if(!run.dead)return;
 const up={...meta.up};
 pruneTree(up);
 const refunded=invested()-invested(up);
 loopPlan={up,shards:meta.eternityRecord-invested(up),total:meta.eternityRecord,refunded,node:'power',mode:run.mode,view:{scale:1,x:0,y:0}};
 renderLoopPlanner();
}
function treeNodePosition(id){
 if(id==='power')return treeCenter;
 const branch=eternityBranches.find(entry=>entry.nodes.includes(id));
 const rank=branch.nodes.indexOf(id)+1;
 const origin=branch.parent?treeNodePosition(branch.parent):treeCenter;
 return {x:origin.x+branch.dx*rank,y:origin.y+branch.dy*rank};
}
function treeGoalRoute(){
 const goal=meta.treeGoal;
 const target=eternal.find(item=>item.id===goal?.id);
 if(!target)return null;
 const path=[];
 let cost=0,targetCost=0,blocked=null;
 for(let id=target.id;id;id=previousNode(id)){
  const item=eternal.find(entry=>entry.id===id);
  path.unshift(id);
  const required=id===target.id?goal.level:1;
  const owned=loopPlan.up[id]||0;
  if(owned>=required)continue;
  blocked??=excludedBy(item,loopPlan.up);
  for(let level=owned;level<required;level++){
   const price=eternalPrice(item,level);
   cost+=price;
   if(id===target.id)targetCost+=price;
  }
 }
 return {path,cost,targetCost,blocked,target};
}
function treeGoalSummary(){
 const route=treeGoalRoute();
 if(!route)return '';
 const {cost,targetCost,blocked,target}=route;
 const balance=Math.max(0,cost-loopPlan.shards);
 let message='Цель достигнута в этом плане.';
 if(cost)message='Осталось вложить '+cost+' ✧. '+(balance?'Не хватает '+balance+' ✧.':'Осколков хватает.');
 if(blocked)message='Чтобы открыть путь, снимите «'+blocked.name+'». Стоимость оставшихся уровней — '+cost+' ✧.';
 const breakdown=cost>targetCost?'<br>Сам узел '+targetCost+' ✧ · Предшественники '+(cost-targetCost)+' ✧':'';
 return '<div class="tree-goal-summary"><p><b>Цель — '+target.name+' · ур. '+meta.treeGoal.level+'</b><br>'+message+breakdown+'</p>'+
  '<button class="speed" data-tree-goal="clear">Снять отметку</button></div>';
}
function renderTreeMap(){
 const ids=['power',...eternityBranches.flatMap(branch=>branch.nodes)];
 const route=treeGoalRoute();
 const marked=new Set(route?.path);
 const edges=ids.slice(1).map(id=>{
  const parent=previousNode(id);
  const from=treeNodePosition(parent),to=treeNodePosition(id);
  return '<line x1="'+from.x+'" y1="'+from.y+'" x2="'+to.x+'" y2="'+to.y+'" class="'+(loopPlan.up[parent]?'open-edge ':'')+(marked.has(id)?'goal-edge':'')+'"/>';
 }).join('');
 const nodes=ids.map(id=>{
  const item=eternal.find(entry=>entry.id===id);
  const level=loopPlan.up[id]||0;
  const parent=previousNode(id);
  const excluded=excludedBy(item,loopPlan.up);
  const state=excluded?'excluded':level?'invested':parent&&!loopPlan.up[parent]?'locked':'ready';
  const shape=item.choice?'radial-choice':item.unlock?'radial-square':'radial-round';
  const pos=treeNodePosition(id);
  const complete=item.unlock&&level>0;
  const goalClass=id===route?.target.id?'goal-node':marked.has(id)?'goal-path':'';
  return `<button class="radial-node ${state} ${shape} ${id==='power'?'radial-core':''} ${goalClass}" data-tree-node="${id}" aria-pressed="${loopPlan.node===id}" aria-label="${item.name}, уровень ${level}${complete?", изучено полностью":""}${excluded?", исключено выбором "+excluded.name:""}" title="${item.name}" style="left:${pos.x*100/treeSize.width}%;top:${pos.y*100/treeSize.height}%"><span aria-hidden="true">${item.glyph}</span><b class="${complete?'tree-complete':''}" aria-hidden="true">${complete?'✓':level}</b></button>`;
 }).join('');
 return '<div class="tree-map"><div class="tree-toolbar"><button class="speed" data-tree-zoom="out" aria-label="Отдалить">−</button><output id="treeZoomLabel">100%</output><button class="speed" data-tree-zoom="in" aria-label="Приблизить">+</button><button class="speed" data-tree-zoom="reset">Сбросить вид</button></div><small class="tree-nav-hint">Колесо меняет масштаб. Потяните за фон, чтобы сдвинуть карту.</small>'+
  '<div class="radial-tree" id="treeViewport" tabindex="0" aria-label="Дерево вечности. Стрелки перемещают карту, плюс и минус меняют масштаб"><div class="tree-stage" id="treeStage"><svg viewBox="0 0 '+treeSize.width+' '+treeSize.height+'" aria-hidden="true">'+edges+'</svg>'+
  '<span class="tree-theme theme-army">Войско</span><span class="tree-theme theme-supply">Снабжение</span><span class="tree-theme theme-wall">Цитадель</span><span class="tree-theme theme-scout">Разведка</span><span class="tree-theme theme-hero">Маг времени</span>'+nodes+'</div></div></div>';
}
function bindTreeNavigation(){
 const viewport=$('treeViewport'),stage=$('treeStage'),view=loopPlan.view;
 function paint(){
  const panLimit=Math.max(0,(view.scale-1)/2)+.15;
  const maxX=(viewport.clientWidth||0)*panLimit,maxY=(viewport.clientHeight||0)*panLimit;
  view.x=Math.max(-maxX,Math.min(maxX,view.x));
  view.y=Math.max(-maxY,Math.min(maxY,view.y));
  stage.style.transform='translate('+view.x+'px,'+view.y+'px) scale('+view.scale+')';
  $('treeZoomLabel').textContent=Math.round(view.scale*100)+'%';
 }
 function zoom(factor,x=0,y=0){
  const scale=Math.max(.65,Math.min(3,view.scale*factor));
  const ratio=scale/view.scale;
  view.x=x+(view.x-x)*ratio;
  view.y=y+(view.y-y)*ratio;
  view.scale=scale;
  paint();
 }
 $('treeZoomLabel').parentElement?.addEventListener('click',event=>{
  const action=event.target.closest('[data-tree-zoom]')?.dataset.treeZoom;
  if(action==='reset'){Object.assign(view,{scale:1,x:0,y:0});paint();}
  if(action==='in'||action==='out')zoom(action==='in'?1.25:.8);
 });
 viewport.addEventListener('wheel',event=>{
  event.preventDefault();
  const rect=viewport.getBoundingClientRect();
  zoom(event.deltaY<0?1.12:1/1.12,event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2);
 },{passive:false});
 let drag=null;
 viewport.addEventListener('pointerdown',event=>{
  if(drag||event.button!==0||event.target.closest('button'))return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  viewport.setPointerCapture(event.pointerId);
 });
 viewport.addEventListener('pointermove',event=>{
  if(drag?.id!==event.pointerId)return;
  if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
  drag.moved=true;
  view.x+=event.clientX-drag.x;
  view.y+=event.clientY-drag.y;
  drag.x=event.clientX;drag.y=event.clientY;
  paint();
 });
 viewport.addEventListener('lostpointercapture',()=>{drag=null;});
 viewport.addEventListener('keydown',event=>{
  if(event.target!==viewport)return;
  const offset={ArrowLeft:[-30,0],ArrowRight:[30,0],ArrowUp:[0,-30],ArrowDown:[0,30]}[event.key];
  if(offset){view.x+=offset[0];view.y+=offset[1];paint();}
  else if(event.key==='+'||event.key==='=')zoom(1.25);
  else if(event.key==='-')zoom(.8);
  else return;
  event.preventDefault();
 });
 paint();
}
function treeInspector(){
 const id=loopPlan.node;
 const item=eternal.find(entry=>entry.id===id);
 const level=loopPlan.up[id]||0;
 const parent=previousNode(id);
 const locked=parent&&!loopPlan.up[parent];
 const capped=item.unlock&&level>0;
 const excluded=excludedBy(item,loopPlan.up);
 const price=eternalPrice(item,level);
 const parentName=parent?eternal.find(entry=>entry.id===parent).name:'';
 return `
  <div class="tree-node-heading"><span aria-hidden="true">${item.glyph}</span><h3>${item.name}</h3></div>
  <p>${item.desc}</p>
  <small>${excluded?'Зачёркнуто: выбрано «'+excluded.name+'»':locked?'Требуется: '+parentName+' · ур. 1':item.choice?'Выберите один из двух вариантов':item.unlock?'Один уровень':'Несколько уровней'}</small>
  <div class="tree-node-controls">
   <button data-plan="remove" data-id="${id}" ${level?'':'disabled'} aria-label="Уменьшить ${item.name}">−</button>
   <b>${level}${item.unlock?' / 1':''}</b>
   <button data-plan="add" data-id="${id}" ${excluded||locked||capped||loopPlan.shards<price?'disabled':''} aria-label="Увеличить ${item.name}">+</button>
   <span>${capped?'Освоено':price+' ✧'}</span>
  </div>
  ${capped?'':'<button class="speed tree-goal-button" data-tree-goal="set">Отметить как цель</button>'}
 `;
}
function renderLoopPlanner(){
 if(!loopPlan)return;
 const modal=$('modal');
 const scroll=modal.open?modal.scrollTop:0;
 show(`<div class="eyebrow">ПЕРЕД НОВЫМ РАССВЕТОМ</div><h2>Дерево вечности</h2>
 <p>Начните с урона в центре. Первый уровень открывает путь дальше. Круги можно улучшать повторно, квадраты — один раз. В каждой жёлтой паре доступен один выбор.</p>
 <div class="plan-budget"><span>Свободно <b>${loopPlan.shards} ✧</b></span><span>Общий пул <b>${loopPlan.total} ✧</b></span></div>
 ${loopPlan.refunded?'<p>Возвращено '+loopPlan.refunded+' ✧ за прежние улучшения без обязательных предшественников.</p>':''}
 <div class="challenge-list">${challengePicker()}</div>${treeGoalSummary()}<div class="tree-layout">${renderTreeMap()}
 <article class="tree-node tree-inspector" id="treeInspector">${treeInspector()}</article></div>
 <p class="plan-note">Снятие последнего уровня узла возвращает очки всех следующих узлов.</p>
 <button class="refund-button" id="refundAll" ${invested(loopPlan.up)===0?'disabled':''}>Вернуть все очки</button>
 <button class="primary" id="confirmLoopPlan">Начать петлю ${meta.loop+1} →</button><button class="cancel" id="closeModal">Отмена</button>`);
 bindTreeNavigation();
 modal.scrollTop=scroll;
}
function adjustLoopPlan(id,action){
 if(!loopPlan||!run.dead)return;
 const item=eternal.find(node=>node.id===id);
 if(!item)return;
 const level=loopPlan.up[id]||0;
 if(action==='add'){
  const parent=previousNode(id);
  const price=eternalPrice(item,level);
  if((parent&&!loopPlan.up[parent])||(item.unlock&&level)||excludedBy(item,loopPlan.up)||loopPlan.shards<price)return;
  loopPlan.up[id]=level+1;
 }else if(action==='remove'&&level){
  loopPlan.up[id]=level-1;
  if(level===1)pruneTree(loopPlan.up);
 }else return;
 loopPlan.shards=loopPlan.total-invested(loopPlan.up);
 renderLoopPlanner();
}
function refundLoopPlan(){if(!loopPlan||!run.dead)return;loopPlan.up=initialUp();loopPlan.shards=loopPlan.total;renderLoopPlanner();}
function commitLoopPlan(){if(!loopPlan||!run.dead)return;meta.up={...loopPlan.up};meta.shards=loopPlan.shards;const mode=loopPlan.mode;loopPlan=null;newLoop(mode);}
function resetProgress(){
 saveEpoch=Math.max(Date.now(),saveEpoch+1);meta={loop:1,shards:0,best:0,eternityRecord:0,up:initialUp()};run=fresh();logs=[];particles=[];loopPlan=null;openedBuilding=null;freeze=0;cooldown=0;paused=false;speed=1;t=0;$('speed').textContent='1×';$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Пауза');$('modal').close();log('Новая история. Крестьяне и маг времени готовы к первому дню.');shop();save();toast('Прогресс сброшен. Начинается первая петля.');
}
function cityDescription(item){
 if(item.id==='farm')return '+'+(run.bonus.farmYield?3:2)+' еды после каждой победы';
 const requirement=trainingUnlock[trainingKind(item.id)];
 if(requirement&&!meta.up[requirement])return 'Откройте школу за осколки вечности.';
 if(['archer','mage','warrior'].includes(item.id)&&freeResidents()<=0)return 'Нет свободных крестьян. Постройте или улучшите дома.';
if(item.id==='wall')return run.up.wall?'Укрепить каменную стену · +150 прочности':'Заменить частокол каменной стеной · +150 прочности';if(item.id==='archer'||item.id==='mage'){const st=unitStats(item.id==='archer'?'archer':'mage');return Math.round(actualDamage(st))+' урона · '+st.attackRate.toFixed(2)+' атак/с'+(item.id==='mage'?' · взрыв ×'+(st.radius/.055).toFixed(2):' · одна цель');}return item.desc;}
function trainingSummary(kind){
 const st=unitStats(kind);
 const extra=kind==='mage'?'<span>Радиус <b>×'+(st.radius/.055).toFixed(2)+'</b></span>':kind==='warrior'?'<span>Здоровье <b>'+Math.round(warriorHealth())+'</b></span>':'';
 return '<div class="unit-training"><strong>Боевые параметры</strong><div><span>Урон <b>'+Math.round(actualDamage(st))+'</b></span><span>Атак/с <b>'+st.attackRate.toFixed(2)+'</b></span>'+extra+'</div>'+(kind==='mage'?'<small>Герой получает урон и скорость атаки: '+Math.round(actualDamage(unitStats('mage',true)))+' урона за удар по одной цели.</small>':'')+'</div>';
}
function canTrainProfession(kind){
 const course=city.find(item=>item.id===kind);
 const requirement=trainingUnlock[kind];
 return unlocked(course.building)&&(!requirement||meta.up[requirement]>0);
}
function retrainPrice(from,to){
 if(to==='civilian')return retrainFee;
 const source=city.find(item=>item.id===from);
 const target=city.find(item=>item.id===to);
 const sourcePrice=price(source,run.up[from]-1);
 return retrainFee+Math.max(0,price(target)-sourcePrice);
}
function professionControls(kind){
 if(!run.up[kind])return '';
 const options=['civilian',...Object.keys(professions).filter(target=>target!==kind&&canTrainProfession(target))];
 const buttons=options.map(target=>{
  const label=target==='civilian'?'Вернуть к мирной работе':'Переобучить: '+professions[target];
  const cost=retrainPrice(kind,target);
  return '<button class="speed" data-town-action="retrain-'+kind+'-'+target+'" '+(run.time<cost?'disabled':'')+'>'+label+' · '+cost+' ◷</button>';
 });
 return '<div class="patch-actions">'+buttons.join('')+'</div>';
}
function buildingUpgrades(id,items){
 if(id==='barracks')return '<div class="barracks-grid">'+[['warrior','Воины'],['archer','Лучники']].map(([kind,name])=>'<section><h3>'+name+'</h3>'+trainingSummary(kind)+items.filter(item=>trainingKind(item.id)===kind).map(upgradeCard).join('')+professionControls(kind)+'</section>').join('')+'</div>';
 return (id==='academy'?trainingSummary('mage'):'')+items.map(upgradeCard).join('')+(id==='academy'?professionControls('mage'):'');
}
function upgradeCard(item){
 const title=item.id==='wall'&&!run.up.wall?'Построить каменную стену':item.name;
 const cost=price(item)+' ◷';
 return '<button class="upgrade" data-city="'+item.id+'" '+(canBuyCity(item)?'':'disabled')+
  '><span class="glyph">'+item.glyph+'</span><span class="upgrade-copy"><span class="name">'+
  title+' <small>ур. '+run.up[item.id]+'</small></span><small class="desc">'+cityDescription(item)+
  '</small></span><span class="cost">'+cost+'</span></button>';
}
function cityMarkers(){$('cityMarkers').innerHTML=buildings.map(b=>`<button class="building-marker ${unlocked(b.id)?'available':'locked'}" style="left:${b.x*100}%;top:${b.y*100+10}%" data-building="${b.id}" ${!unlocked(b.id)||run.dead?'disabled':''}><span>${unlocked(b.id)?(b.id==='farm'&&!run.up.farm?'Участок ферм':b.id==='house'&&!run.up.house?'Участок домов':b.name):'▧ Участок'}</span><small>${unlocked(b.id)?b.sub:'Нужен чертёж вечности'}</small></button>`).join('');}
function shop(){
 hoveredFormation=null;
 $('shopTitle').textContent=run.active?'Защитники города':run.planning?'Расстановка отряда':'Подготовка деревни';
 $('shopIntro').innerHTML=run.active
  ?'<h2>Защитники в бою</h2><p>Крестьяне и воины сражаются в ближнем бою. Лучники и маг времени поражают одну цель. Хрономанты бьют по области.</p>'
  :run.planning?'<h2>Займите позиции</h2><p>Выберите бойца, чтобы увидеть дальность атаки, затем нажмите на свободную точку. Лучников и магов можно поставить на свободное место каменной стены.</p>'
  :'<h2>Решения на сегодня</h2><p>Открывайте здания на карте, чтобы строить, улучшать и обучать жителей.</p>';
 $('shop').innerHTML=run.active||run.planning
  ?scoutReport()+(run.planning?planningTools():'')+'<div id="unitRoster"></div>'
  :(run.bonus.battleReport&&run.lastReport?reportMarkup():'')+'<div class="village-summary"><p>Крестьяне в отряде <b>'+Math.max(0,freeResidents())+'</b></p><p>Обученные бойцы <b>'+recruits()+'</b></p>'+foodSummary()+'<p>Укрепление <b>'+fortName()+'</b></p></div>';
 $('shopNote').textContent=run.active?'⚔ Павшие возвращаются после победы.':run.dead?'Распределите осколки в дереве вечности перед новой петлёй.':'Каждый житель съедает 1 еду после сбора урожая. Нехватка снижает здоровье отряда на следующий день.';
 $('forecast').textContent=modes[run.mode].name+' · '+weatherTypes[weather()].name+'. '+weatherTypes[weather()].desc;
 cityMarkers();
 update();
 renderRoster();
}
function renderRoster(){
 if(!run.active&&!run.planning)return;
 $('unitRoster').innerHTML=defenders().map(unit=>{
  const name=unit.hero?'Маг времени':({mage:'Хрономант',archer:'Лучник',peasant:'Крестьянин',warrior:'Воин'})[unit.kind];
  const status=unit.hp<=0?'Пал · вернётся после победы':unit.onWall?'На укреплении · защищён':Math.ceil(unit.hp)+' / '+unit.maxHp+' здоровья';
  return '<div class="roster-unit"><span class="unit-icon">'+({mage:'✦',archer:'➶',peasant:'⚒',warrior:'⚔'})[unit.kind]+'</span><span><b>'+name+'</b><small>'+status+'</small></span><span class="roster-damage">'+Math.round(actualDamage(unit))+'</span></div>';
 }).join('');
}
function openArmy(){
 if(run.active||run.planning||run.dead)return;
 const units=defenders();
 const rows=[];
 for(const kind of ['hero','peasant','warrior','archer','mage']){
  const group=units.filter(unit=>(unit.hero?'hero':unit.kind)===kind);
  if(!group.length)continue;
  const unit=group[0];
  const onWall=group.filter(member=>member.onWall).length;
  const stats=[
   'Здоровье '+unit.maxHp,
   'Урон за удар '+formatArmyStat(actualDamage(unit)),
   'Атак/с '+formatArmyStat(unit.attackRate)
  ];
  if(unit.radius)stats.push('Радиус взрыва ×'+formatArmyStat(unit.radius/.055));
  if(onWall)stats.push('На стене '+onWall);
  rows.push('<li><strong>'+unitNames[kind]+' · '+group.length+'</strong><span>'+stats.join(' · ')+'</span></li>');
 }
 const hunger=hungerPenalty();
 show('<div class="eyebrow">ГОРОД / ЗАЩИТНИКИ</div><h2>Армия</h2><p>Всего бойцов: <b>'+units.length+'</b></p>'+
  (rows.length?'<ul class="army-stats">'+rows.join('')+'</ul>':'<p>Сейчас в отряде нет бойцов.</p>')+
  (hunger&&units.some(unit=>!unit.hero)?'<p>Нехватка еды: жители начнут следующую волну с запасом здоровья на '+hunger+'% меньше.</p>':'')+
  '<button class="cancel" id="closeModal">Вернуться в город</button>');
}
function formatArmyStat(value){
 return Number(value.toFixed(2)).toLocaleString('ru-RU');
}
function update(){
 $('time').textContent=Math.floor(run.time);$('shards').textContent=meta.shards;$('recordTotal').textContent=`Общий пул: ${meta.eternityRecord} ✧`;$('income').textContent=`Победа: +${waveReward()} ◷`;$('lootEarned').textContent=`Добыча: +${run.waveLoot} ◷`;$('loop').textContent=String(meta.loop).padStart(2,'0');$('best').textContent=meta.best;$('hpText').textContent=`${Math.ceil(Math.max(0,run.hp))} / ${maxHP()}`;$('hpBar').style.width=`${Math.max(0,run.hp/maxHP()*100)}%`;$('hpBar').style.background=run.hp/maxHP()<.3?'#d2878c':'#a4dfb0';
 $('army').textContent=defenders().filter(unit=>unit.hp>0).length;
 $('provisions').textContent=run.food;
 $('population').textContent=population();
 $('fortLabel').textContent=fortName();
 $('garrisonButton').hidden=run.active||run.dead||run.planning;
 $('armyButton').hidden=run.active||run.dead||run.planning;
 $('garrisonButton').textContent=run.up.wall?'Гарнизон стены · '+run.garrison.filter(Boolean).length+'/'+wallPositions().length:'Частокол';$('damage').textContent=Math.round(dps());$('waveLabel').textContent=run.active?`Волна ${run.wave+1}${(run.wave+1)%5===0?' · БОСС':''}`:`Перед волной ${run.wave+1}`;$('fieldTitle').textContent=run.active?'Защитите южный рубеж':'Ваш город вне времени';$('phaseLabel').textContent=run.active?'ЭТАП 02 / ОБОРОНА':'ЭТАП 01 / ПОДГОТОВКА';
 $('field').classList.toggle('in-battle',run.active||run.planning);
 $('field').classList.toggle('in-planning',Boolean(run.planning));
 $('field').classList.toggle('fallen-city',Boolean(run.defeated));
 $('cityMarkers').hidden=run.active||run.planning||run.defeated;
 $('restoreFormation').hidden=!run.planning;$('cancelPlanning').hidden=!run.planning;$('start').hidden=run.active;$('start').textContent=run.dead?'Дерево вечности ↶':run.planning?'В бой':`Начать волну ${run.wave+1} ↓`;$('freeze').hidden=!run.active||!spellUnlocked();$('speed').hidden=!run.active;$('pause').hidden=!run.active;$('freeze').disabled=run.dead||cooldown>0;$('freezeName').textContent=spells[currentSpell()].name;$('freezeLabel').textContent=cooldown>0?'Использовано в этой волне':'Бесплатно · 1 раз за волну';
 $('sceneMessage').hidden=run.active||run.planning;$('sceneMessage').innerHTML=run.dead?(run.defeated?'Город пал':'Петля завершена')+'<span>Распределите осколки перед новой петлёй</span>':run.lastReward?`Волна ${run.wave} отражена · +${run.lastReward} ◷<span>Посетите здания и подготовьте отряд</span>`:'Первый день новой истории<span>Постройте ферму, чтобы собрать первый урожай</span>';$('enemyCount').textContent=run.active?`Монстров: ${run.enemies.length+count()-run.spawned}`:`Урожай: +${harvest()} еды / день`;$('phaseHint').textContent=run.active?'Враги наступают с севера. Крестьяне встречают орду перед укреплением.':run.dead?'Город вернётся с новой петлёй. Открытые здания сохранятся.':'Дома стоят хроны. В конце дня каждый житель съедает 1 еду из урожая и запасов.';$('battleLegend').hidden=!run.active;if(run.planning){$('fieldTitle').textContent='Расстановка перед волной';$('phaseLabel').textContent='ЭТАП 02 / РАССТАНОВКА';$('phaseHint').textContent='Выберите бойца и нажмите на точку. «В бой» запустит волну.';}else if(run.active){$('phaseLabel').textContent='ЭТАП 03 / ОБОРОНА';
  if(run.mode!=='noMagic')$('phaseHint').textContent='Нажмите на мага времени, затем на поле, чтобы переместить его. Он продолжит атаковать на ходу.';
 }
}
function buy(id){
 const item=city.find(upgrade=>upgrade.id===id);
 if(!item||!canBuyCity(item))return;
 run.time-=price(item);
 run.up[id]++;
 if(id==='wall')run.hp=Math.min(maxHP(),run.hp+150);
 run.units=[];
 log(item.name+': уровень '+run.up[id]+'.');
 shop();
 save();
}
function repair(){if(run.active||run.planning||run.dead||!unlocked('bastion')||run.time<repairCost()||run.hp>=maxHP())return;run.time-=repairCost();run.hp=Math.min(maxHP(),run.hp+100);toast('Укрепление восстановлено: +100');save();update();}
const defenseTypes={
 stakes:{name:'Колья',cost:35,hp:65,desc:'Ранят врагов, пока те ломают колья.'},
 trap:{name:'Ловушка',cost:30,hp:1,desc:'Один раз наносит урон и замедляет врага.'},
 barricade:{name:'Баррикада',cost:50,hp:180,desc:'Задерживает врагов, пока они её ломают.'}
};
function defenseRepairCost(item){
 const type=defenseTypes[item.kind];
 return Math.ceil(type.cost*(1-item.hp/type.hp)/5);
}
function defenseShop(button){
 const total=run.defenses.reduce((sum,item)=>sum+defenseRepairCost(item),0);
 const bulk=total?'<div class="patch-actions">'+button('fix-all','Починить всё за '+total+' ◷',run.time<total)+'</div>':'';
 return bulk+Object.entries(defenseTypes).map(([id,type])=>{
  const count=run.defenses.filter(item=>item.kind===id).length;
  const repairs=run.defenses.map((item,index)=>{
   if(item.kind!==id||item.hp>=type.hp)return '';
   const cost=defenseRepairCost(item);
   return '<div class="patch-actions"><span>№'+(index+1)+' · '+(item.hp>0?Math.ceil(item.hp)+' / '+type.hp:'сломано или израсходовано')+'</span>'+
    button('fix-'+index,'Восстановить за '+cost+' ◷',run.time<cost)+'</div>';
  }).join('');
  return '<p><b>'+type.name+' · '+count+'</b> — '+type.desc+'</p>'+button('buy-'+id,'Купить за '+type.cost+' ◷',run.time<type.cost||run.defenses.length>=9)+repairs;
 }).join('')+'<p>До 9 сооружений. Расставьте их перед волной.</p>';
}
function repairDefenses(selection){
 if(openedBuilding!=='workshop')return false;
 const items=selection==='all'?run.defenses:[run.defenses[Number(selection)]];
 const damaged=items.filter(item=>item&&item.hp<defenseTypes[item.kind].hp);
 const cost=damaged.reduce((sum,item)=>sum+defenseRepairCost(item),0);
 if(!damaged.length||run.time<cost)return false;
 run.time-=cost;
 for(const item of damaged)item.hp=defenseTypes[item.kind].hp;
 return true;
}
function retrainProfession(from,to){
 if(!Object.hasOwn(professions,from)||!run.up[from])return false;
 const course=city.find(item=>item.id===from);
 if(openedBuilding!==course.building||!unlocked(course.building)||from===to)return false;
 if(to!=='civilian'&&(!Object.hasOwn(professions,to)||!canTrainProfession(to)))return false;
 const cost=retrainPrice(from,to);
 if(run.time<cost)return false;
 const formerKey=from+'-'+(--run.up[from]);
 delete run.formation[formerKey];
 run.garrison=run.garrison.map(key=>key===formerKey?null:key);
 if(to!=='civilian')run.up[to]++;
 run.time-=cost;
 return true;
}
function buyDefense(action){
 const kind=action.slice(4);
 if(openedBuilding!=='workshop'||!action.startsWith('buy-')||!Object.hasOwn(defenseTypes,kind)||run.defenses.length>=9)return false;
 const type=defenseTypes[kind];
 if(run.time<type.cost)return false;
 run.time-=type.cost;
 run.defenses.push({kind,hp:type.hp});
 return true;
}
function townControls(id){
 const button=(action,label,disabled)=>'<button class="speed" data-town-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
 if(id==='house')return '<p>Жители: '+population()+' / '+housing()+'. Занято: '+employed()+'. Свободно: '+freeResidents()+'. Каждый житель расходует 1 еду в день.</p><div class="patch-actions">'+
  button('resident+','Принять жителя',population()>=housing())+button('resident-','Убрать жителя',freeResidents()<=0)+'</div>';
 if(id==='farm')return '<p>Урожай: '+harvest()+' еды. Расход: '+dailyFood()+'.</p>'+jobControls('farm','Фермеры',run.up.farm,'+2 еды за фермера до поправки на погоду. Одно место на уровень фермы.',button);
 if(id==='workshop')return jobControls('build','Строители',Infinity,'+20 прочности после победы за строителя.',button)+defenseShop(button);
 return '';
}
function jobControls(job,name,limit,desc,button){
 const count=run.workers[job];
 return '<p>'+name+': '+count+'. '+desc+'</p><div class="patch-actions">'+
  button(job+'+','Назначить',freeResidents()<=0||count>=limit)+button(job+'-','Освободить',!count)+'</div>';
}
function townAction(action){
 if(run.active||run.planning||run.dead)return;
 if(action==='resident+'&&openedBuilding==='house'&&population()<housing())run.vacancies--;
 else if(action==='resident-'&&openedBuilding==='house'&&freeResidents()>0)run.vacancies=(run.vacancies||0)+1;
 else if(action==='farm+'&&openedBuilding==='farm'&&freeResidents()>0&&run.workers.farm<run.up.farm)run.workers.farm++;
 else if(action==='farm-'&&openedBuilding==='farm'&&run.workers.farm>0)run.workers.farm--;
 else if(action==='build+'&&openedBuilding==='workshop'&&freeResidents()>0)run.workers.build++;
 else if(action==='build-'&&openedBuilding==='workshop'&&run.workers.build>0)run.workers.build--;
 else if(action.startsWith('fix-')){if(!repairDefenses(action.slice(4)))return;}
 else if(action.startsWith('retrain-')){if(!retrainProfession(...action.split('-').slice(1)))return;}
 else if(!buyDefense(action))return;
 run.units=[];
 shop();save();openBuilding(openedBuilding);
}
function openBuilding(id){const b=buildings.find(b=>b.id===id);if(!b||!unlocked(id)||run.active||run.planning||run.dead)return;openedBuilding=id;const items=city.filter(i=>i.building===id);show(`<div class="eyebrow">ГОРОД / ${b.sub.toUpperCase()}</div><h2>${b.name}</h2><p>Бюджет подготовки: <b>${Math.floor(run.time)} ◷</b>. Улучшения действуют до конца петли.</p>${townControls(id)}${id==='barracks'||id==='academy'?'<p>Лучники, воины и хрономанты обучаются из крестьян. Обучено жителей: '+recruits()+' / '+population()+'. Свободно: '+freeResidents()+'.</p>':''}${buildingUpgrades(id,items)}${id==='bastion'?`<button class="upgrade" data-repair="yes" ${run.time<repairCost()||run.hp>=maxHP()?'disabled':''}><span class="glyph">✚</span><span class="upgrade-copy"><span class="name">Починить укрепление</span><small class="desc">+100 прочности · ${Math.ceil(run.hp)} / ${maxHP()}</small></span><span class="cost">${repairCost()} ◷</span></button>`:''}<button class="cancel" id="closeModal">Вернуться в город</button>`);}
const spells={
 stasis:{name:'Стазис',desc:'Останавливает врагов на 5 секунд.'},
 mend:{name:'Восстановление',desc:'Возвращает выжившим бойцам до 40% максимального здоровья.'},
 haste:{name:'Ускорение',desc:'Удваивает скорость атак отряда на 6 секунд.'}
};
const spellUnlocked=()=>run.mode!=='noMagic'&&run.bonus.heroSpells;
const currentSpell=()=>spellUnlocked()&&Object.hasOwn(spells,run.spell)?run.spell:'stasis';
function planningTools(){
 const buttons=Array.from({length:3},(_,index)=>{
  const stored=meta.formations?.[index];
  return '<div class="patch-actions" data-formation-row="'+index+'"><span>Строй '+(index+1)+'</span><button class="speed" data-save-formation="'+index+'">Сохранить</button><button class="speed" data-preview-formation="'+index+'" aria-pressed="'+(pinnedFormation===index)+'" '+(stored?'':'disabled')+'>Просмотр</button><button class="speed" data-load-formation="'+index+'" '+(stored?'':'disabled')+'>Применить</button></div>';
 }).join('');
 const spell=spellUnlocked()?'<h3>Заклинание на волну</h3><div class="patch-actions">'+Object.entries(spells).map(([id,item])=>'<button class="speed" data-spell="'+id+'" aria-pressed="'+(currentSpell()===id)+'">'+item.name+'</button>').join('')+'</div><p>'+spells[currentSpell()].desc+'</p>':'';
 const defenses=run.defenses.length?'<h3>Сооружения</h3><div class="patch-actions">'+run.defenses.map((item,index)=>'<button class="speed" data-defense="'+index+'" '+(item.hp<=0?'disabled ':'')+'aria-pressed="'+(selectedDefense===index)+'">'+defenseTypes[item.kind].name+' '+(index+1)+(item.hp<=0?' · ремонт':Number.isFinite(item.x)?' ✓':'')+'</button>').join('')+'</div><p>Выберите сооружение и нажмите на поле перед укреплением.</p>':'';
 return '<div class="patch-panel"><h3>Шаблоны расстановки</h3><p>Наведите на строй или нажмите «Просмотр», чтобы увидеть позиции на поле.</p>'+buttons+spell+defenses+'</div>';
}
function saveFormationSlot(index){
 if(!run.planning||index<0||index>=3)return;
 meta.formations??=[];
 meta.formations[index]=Object.fromEntries(defenders().map(unit=>[unit.key,{x:unit.x,y:unit.y,onWall:unit.onWall}]));
 shop();save();toast('Шаблон сохранён.');
}
function formationPositions(index){
 const stored=meta.formations?.[index];
 if(!run.planning||!stored)return [];
 const units=defenders(),occupied=[];
 const nextUnits=[...units.filter(unit=>stored[unit.key]),...units.filter(unit=>!stored[unit.key])];
 for(const unit of nextUnits){
  let point=stored[unit.key]||unit;
  const wall=Boolean(point.onWall&&run.up.wall&&isRanged(unit)&&wallPositions().includes(point.x)&&!occupied.some(other=>other.onWall&&other.x===point.x));
  if(!wall){
   point={x:point.x,y:Math.min(point.y,.79)};
   if(occupied.some(other=>distance(other,point)<.028)){
    outer:for(let row=0;row<17;row++)for(let col=0;col<21;col++){
     const candidate={x:.06+col*.044,y:.77-row*.04};
     if(occupied.every(other=>distance(other,candidate)>=.028)){point=candidate;break outer;}
    }
   }
  }
  occupied.push({unit,x:point.x,y:point.y,onWall:wall});
 }
 return occupied;
}
function loadFormationSlot(index){
 if(!run.planning||!meta.formations?.[index])return;
 for(const {unit,x,y,onWall} of formationPositions(index))Object.assign(unit,{x,y,onWall});
 pinnedFormation=null;
 selectedUnit=null;selectedDefense=null;
 shop();save();toast('Шаблон применён.');
}
function rememberFormation(){
 const units=defenders();
 const positions=wallPositions();
 run.formation=Object.fromEntries(units.filter(unit=>!unit.onWall).map(unit=>[unit.key,{x:unit.x,y:unit.y}]));
 run.garrison=positions.map(x=>units.find(unit=>unit.onWall&&unit.x===x)?.key??null);
}
function start(){if(run.active||run.dead)return;const fromPlanning=run.planning;if(fromPlanning)rememberFormation();run.planning=false;selectedUnit=null;run.active=true;selectedDefense=null;run.haste=0;run.report={damage:{},breaches:{},gates:{}};paused=false;cooldown=0;freeze=0;particles=[];run.stasisUsed=false;run.freezeTime=0;run.projectiles=[];run.spawned=0;run.spawnTimer=.15;run.enemies=[];run.lastReward=0;run.waveLoot=0;if(!fromPlanning)run.units=[];defenders().forEach((u,i)=>{u.cool=i*.12;u.target=null;if(!u.hero)u.hp=Math.round(u.maxHp*(1-hungerPenalty()/100));});$('pause').textContent='Ⅱ';log(`Волна ${run.wave+1}: орда наступает с севера.`);shop();save();}
function finishLoop(defeated=false){
 if(!run.dead){
  const score=reward(),bonus=shardBonus(),record=scoreGain(),added=record+bonus;
  run.result={score,added,bonus,record};
  run.defeated=defeated;run.planning=false;selectedUnit=null;run.dead=true;run.active=false;run.hp=0;run.projectiles=[];
  if(added)meta.scoreRecord??=meta.eternityRecord;
  if(record){
   if(run.mode==='normal')meta.scoreRecord=score;
   else{meta.challengeRecords??={};meta.challengeRecords[run.mode]=score;}
  }
  meta.shards+=added;
  meta.eternityRecord+=added;
  meta.best=Math.max(meta.best,run.wave);
  log('Петля завершена. За рекорд +'+record+' ✧, бонус за волны +'+bonus+' ✧.');
  save();
 }
 const result=run.result||{score:reward(),added:0};
 const record=result.record??result.added-(result.bonus||0);
 shop();
 show('<div class="modal-icon">↶</div><div class="eyebrow">ИТОГ ПЕТЛИ</div><h2>'+
  (record?'Вы переписали рекорд.':'Петля завершена.')+'</h2><div class="reward">+'+result.added+' ✧</div>'+
  '<div class="plan-budget"><span>Оценка попытки<b>'+result.score+' ✧</b></span><span>Общий пул<b>'+meta.eternityRecord+' ✧</b></span></div>'+
  '<p>Прирост рекорда +'+record+' ✧ · Бонус за волны +'+(result.bonus||0)+' ✧.</p>'+
  '<p>Волн: '+run.wave+' · Монстров: '+run.kills+'<br>Оценка: ⌊волны / 2⌋ + ⌊враги / 12⌋ + ⌊улучшения / 4⌋</p>'+
  '<button class="primary" id="betweenLoops">Открыть дерево вечности →</button>');
}
function newLoop(mode=run.mode){if(!run.dead)return;saveEpoch=Math.max(Date.now(),saveEpoch+1);loopPlan=null;meta.loop++;run=fresh(mode);particles=[];freeze=0;cooldown=0;paused=false;openedBuilding=null;$('modal').close();log('Новый рассвет. Открытые здания снова ждут вас.');shop();save();}
function defenders(){
 if(!run.units.length){
  const units=run.mode==='noMagic'?[]:[{kind:'mage',hero:true,key:'hero'}];
  for(const kind of ['archer','mage','warrior']){
   for(let index=0;index<run.up[kind];index++)units.push({kind,key:kind+'-'+index});
  }
  for(let index=0;index<freeResidents();index++)units.push({kind:'peasant',key:'peasant-'+index});
  run.units=units.map((unit,index)=>{
   const slot=run.up.wall&&isRanged(unit)?run.garrison.indexOf(unit.key):-1;
   const maxHp=unit.hero?160+32*(run.bonus.heroHealth||0):unit.kind==='warrior'?warriorHealth():unit.kind==='peasant'?64:55;
   const saved=run.formation[unit.key];
   let defaultX=.15+((index%8)+.5)*.7/Math.min(8,units.length);
   if(!unit.hero&&isRanged(unit)&&index<8&&Math.abs(defaultX-.5)<.035)defaultX+=.075;
   return {...unit,id:index,maxHp,hp:maxHp,onWall:slot!==-1,
    x:slot!==-1?wallPositions()[slot]:(saved?.x??(unit.hero?.5:defaultX)),
    y:slot!==-1?.84:(saved?.y??(!isRanged(unit)?.58-Math.floor(index/8)*.04:.725-Math.floor(index/8)*.052)),
    cool:index*.12,target:null,flash:0};
  });
 }
 for(const unit of run.units)Object.assign(unit,unitStats(unit.kind,unit.hero));
 return run.units;
}
function march(actor,target,travel){
 const gap=distance(actor,target);
 if(gap===0)return;
 const part=Math.min(1,travel/gap);
 actor.x+=(target.x-actor.x)*part;
 actor.y+=(target.y-actor.y)*part;
}
function moveHero(dt){
 const hero=defenders().find(unit=>unit.hero&&unit.hp>0);
 if(!hero?.destination)return;
 hero.onWall=false;
 march(hero,hero.destination,dt*.15*movement());
 if(distance(hero,hero.destination)<.001)delete hero.destination;
}
const unitNames={hero:'Маг времени',peasant:'Крестьяне',warrior:'Воины',archer:'Лучники',mage:'Хрономанты',stakes:'Колья',trap:'Ловушки'};
function reportMarkup(){
 const report=run.lastReport;
 const damage=Object.entries(report.damage).sort((a,b)=>b[1]-a[1]).map(([source,value])=>{
  const [kind,index]=source.split('-');
  return '<p>'+unitNames[kind]+(index===undefined?'':' №'+(Number(index)+1))+' <b>'+Math.round(value)+'</b></p>';
 }).join('');
 const breaches=Object.entries(report.breaches).sort((a,b)=>b[1]-a[1]).map(([kind,value])=>'<p>'+enemyLabel(kind)+' <b>'+value+'</b></p>').join('');
 const gates=Object.entries(report.gates).sort((a,b)=>b[1]-a[1]).map(([gate,value])=>gateNames[gate]+' — '+value).join(', ');
 return '<div class="scout-report"><strong>Разбор последней волны</strong><p><b>Урон бойцов и сооружений</b></p>'+(damage||'<p>Урон не нанесён.</p>')+'<p><b>Враги у укрепления</b></p>'+(breaches||'<p>Прорывов нет.</p>')+(gates?'<p>Входы прорыва: '+gates+'.</p>':'')+'</div>';
}
function hurtEnemy(enemy,damage,physical=false,source){
 const dealt=damage*(physical?(enemy.kind==='armored'?.65:1)*(enemy.covered?.7:1):1);
 if(source&&run.report)run.report.damage[source]=(run.report.damage[source]||0)+Math.min(enemy.hp,dealt);
 enemy.hp-=dealt;
 enemy.hurt=.18;
}
function impact(p){const primary=run.enemies.find(e=>e.id===p.target&&e.hp>0);if(primary)hurtEnemy(primary,p.damage,p.kind==='archer',p.source||p.kind);if(p.kind==='mage'){const radius=p.radius??.055;for(const e of run.enemies)if(e!==primary&&e.hp>0&&distance(e,p)<=radius)hurtEnemy(e,p.damage*.45,false,p.source||'mage');particles.push({kind:'blast',x:p.x,y:p.y,life:.38,max:.38,radius});}else particles.push({kind:'hit',x:p.x,y:p.y,life:.15,max:.15});}
function advanceArcher(unit,dt){
 let closest=null,gap=Infinity;
 for(const enemy of run.enemies){
  if(enemy.hp<=0||enemy.y<=0)continue;
  const distanceToEnemy=distance(unit,enemy);
  if(distanceToEnemy<gap){closest=enemy;gap=distanceToEnemy;}
 }
 if(closest)march(unit,closest,dt*.026*movement());
}
function combat(dt){
 const claimed=new Set();run.projectiles=run.projectiles||[];
 for(const u of defenders()){
  if(u.hp<=0)continue;
  u.flash=Math.max(0,(u.flash||0)-dt);u.cool-=dt*(run.haste>0?2:1);
  const ranged=isRanged(u),range=attackRange(u);
  const available=run.enemies.filter(e=>e.hp>0&&e.y>0&&(!ranged||distance(u,e)<=range));
  let target=available.find(e=>e.id===u.target&&!claimed.has(e.id));
  if(!target)target=available.filter(e=>!claimed.has(e.id)).sort((a,b)=>distance(u,a)-distance(u,b))[0]||available.sort((a,b)=>distance(u,a)-distance(u,b))[0];
  u.target=target?.id??null;
  if(!target){
   if(u.kind==='archer'&&!u.onWall)advanceArcher(u,dt);
   u.cool=Math.max(0,u.cool);
   continue;
  }
  claimed.add(target.id);
  if(!ranged&&distance(u,target)>.025)march(u,target,dt*.065*movement());
  if(distance(u,target)>range){u.cool=Math.max(0,u.cool);continue;}
  while(u.cool<=0&&target.hp>0){
   if(!isRanged(u)){
    hurtEnemy(target,actualDamage(u),true,u.key);
   }else run.projectiles.push({kind:u.radius?'mage':u.hero?'hero':'archer',source:u.key,x:u.x,y:u.y-.014,tx:target.x,ty:target.y,target:target.id,damage:actualDamage(u),radius:u.radius,travel:0});u.cool+=1/u.attackRate;u.flash=.2;}
 }
 const flying=[];for(const p of run.projectiles){const target=run.enemies.find(e=>e.id===p.target&&e.hp>0);if(target){p.tx=target.x;p.ty=target.y;}const d=distance(p,{x:p.tx,y:p.ty}),move=dt*(p.kind==='archer'?1.4:.9);p.travel+=dt;if(d<=move||p.travel>2){p.x=p.tx;p.y=p.ty;impact(p);}else{p.x+=(p.tx-p.x)*move/d;p.y+=(p.ty-p.y)*move/d;flying.push(p);}}run.projectiles=flying;
}
const gateNames=['левый','центральный','правый'];
const gatePositions=[.18,.49,.80];
function waveGates(){
 return [[0,1,2],[0,2],[1],[1,2]][run.wave%4];
}
function gateFor(index){
 const gates=waveGates();
 return gates[index%gates.length];
}
const enemyTypes={
 runner:{name:'Бегуны',hint:'проскакивают мимо ближнего строя — прикройте фланги стрелками',hp:.75,speed:1.65},
 armored:{name:'Бронированные',hint:'снижают физический урон на 35% — используйте магию',hp:1.55,speed:.75},
 siege:{name:'Осадные',hint:'бьют по стене издалека — выставьте бойцов вперёд',hp:1.15,speed:.8},
 shaman:{name:'Шаманы',hint:'лечат соседей',hp:.85,speed:.85},
 banner:{name:'Знаменосцы',hint:'ускоряют соседей',hp:.95,speed:.9},
 shield:{name:'Щитоносцы',hint:'прикрывают соседей от физического урона',hp:1.2,speed:.9}
};
const enemyLabel=kind=>enemyTypes[kind]?.name||(kind==='boss'?'Боссы':'Обычные монстры');
function enemyKind(index){
 const wave=run.wave+1;
 if(wave%5===0&&index>=count()-(run.mode==='twins'?2:1))return 'boss';
 if(wave>=7&&index%24===9)return 'shaman';
 if(wave>=8&&index%24===17)return 'banner';
 if(wave>=9&&index%24===1)return 'shield';
 if(wave>=3&&index%8===2)return 'runner';
 if(wave>=4&&index%8===4)return 'armored';
 if(wave>=6&&index%8===6)return 'siege';
 return 'mob';
}
function scoutReport(){
 if(!run.planning||!run.bonus.scout)return '';
 const entries=waveGates().map(gate=>gateNames[gate]);
 const bossGates=[];
 for(let index=count()-2;index<count();index++)if(enemyKind(index)==='boss')bossGates.push(gateNames[gateFor(index)]);
 const boss=bossGates.length===1?' Босс: '+bossGates[0]+' вход.':bossGates.length?' Два босса: '+bossGates.join(', ')+'.':'';
 const reports=Object.entries(enemyTypes).map(([kind,type])=>{
  let amount=0;
  const gates=new Set();
  for(let index=0;index<count();index++){
   if(enemyKind(index)!==kind)continue;
   amount++;
   gates.add(gateNames[gateFor(index)]);
  }
  return amount?'<p><b>'+type.name+': '+amount+'</b> · '+[...gates].join(', ')+' · '+type.hint+'.</p>':'';
 }).join('');
 return '<div class="scout-report"><strong>Разведка</strong><p>Врагов: '+count()+'. Входы: '+entries.join(', ')+'.'+boss+'</p>'+reports+'</div>';
}
function step(dt){
 if(paused||run.dead||$('modal').open)return;run.elapsed+=dt;freeze=Math.max(0,freeze-dt);run.freezeTime=freeze;particles.forEach(p=>p.life-=dt);particles=particles.filter(p=>p.life>0);if(!run.active)return;run.spawnTimer-=dt;
 if(run.spawned<count()&&run.spawnTimer<=0){
  const remaining=count()-run.spawned;
  let pack=Math.min(4+Math.floor(run.wave/3),remaining);
  if(run.mode==='twins'&&(run.wave+1)%5===0&&remaining-pack===1)pack++;
  for(let i=0;i<pack;i++){
   const kind=enemyKind(run.spawned),boss=kind==='boss',gate=gateFor(run.spawned);
   const hp=12*Math.pow(1.25,run.wave)*(boss?12:(enemyTypes[kind]?.hp??1));
   const goalX=kind==='runner'?(gate===0?.14:gate===2?.86:run.spawned%16===2?.14:.86):.14+Math.random()*.72;
   run.enemies.push({id:++run.enemySerial,kind,gate,x:gatePositions[gate]+(Math.random()-.5)*.16,y:-.03-Math.random()*.12,goalX,hp,max:hp,boss,phase:Math.random()*6,hurt:0});
   run.spawned++;
  }
  run.spawnTimer=.8;
 }
 moveHero(dt);
 const exposed=defenders().filter(unit=>!unit.onWall);
 const supports=run.enemies.filter(enemy=>enemy.hp>0&&enemy.y>0&&['shaman','banner','shield'].includes(enemy.kind));
 const deployed=run.defenses.filter(item=>item.hp>0&&Number.isFinite(item.x));
 for(const enemy of run.enemies){
  enemy.hurt=Math.max(0,(enemy.hurt||0)-dt);
  if(enemy.hp<=0||freeze>0)continue;
  enemy.slow=Math.max(0,(enemy.slow||0)-dt);
  let boosted=false,healed=false;
  enemy.covered=false;
  for(const ally of supports){
   if(ally===enemy||ally.hp<=0||distance(enemy,ally)>.085)continue;
   if(ally.kind==='banner')boosted=true;
   if(ally.kind==='shaman')healed=true;
   if(ally.kind==='shield')enemy.covered=true;
  }
  if(healed&&enemy.max)enemy.hp=Math.min(enemy.max,enemy.hp+enemy.max*.09*dt);
  const target=exposed.reduce((closest,unit)=>{
   if(unit.hp<=0||distance(enemy,unit)>(enemy.kind==='runner'?.035:.085))return closest;
   return !closest||distance(enemy,unit)<distance(enemy,closest)?unit:closest;
  },null);
  const speed=(enemy.boss?.024:.036+run.wave*.001)*(enemyTypes[enemy.kind]?.speed??1)*movement()*(boosted?1.35:1)*(enemy.slow>0?.5:1);
  const damage=(enemy.boss?15:1.6)*Math.pow(1.16,run.wave);
  const defense=deployed.find(item=>item.hp>0&&distance(enemy,item)<.027);
  if(defense){
   if(defense.kind==='trap'){
    defense.hp=0;enemy.slow=4;hurtEnemy(enemy,24,false,'trap');
    if(enemy.hp<=0)continue;
   }else{
    defense.hp=Math.max(0,defense.hp-damage*dt*3);
    if(defense.kind==='stakes')hurtEnemy(enemy,14*dt,true,'stakes');
    continue;
   }
  }
  if(target){
   if(distance(enemy,target)>.025)march(enemy,target,speed*dt);
   else target.hp=Math.max(0,target.hp-damage*dt);
  }else{
   const siege=enemy.kind==='siege';
   const barrier={x:enemy.goalX,y:siege?.59:.794};
   if(enemy.y<barrier.y-.001)march(enemy,barrier,speed*dt);
   else{
    run.hp-=damage*dt*(siege?1.4:.45);
    if(run.report&&!enemy.breached){
     enemy.breached=true;
     const kind=enemy.kind||(enemy.boss?'boss':'mob');
     run.report.breaches[kind]=(run.report.breaches[kind]||0)+1;
     if(Number.isInteger(enemy.gate))run.report.gates[enemy.gate]=(run.report.gates[enemy.gate]||0)+1;
    }
   }
  }
 }
 combat(dt);run.haste=Math.max(0,(run.haste||0)-dt);run.enemies=run.enemies.filter(e=>{if(e.hp<=0){const drop=monsterLoot(e);run.kills++;run.time+=drop;run.waveLoot+=drop;particles.push({kind:'loot',x:e.x,y:e.y,life:.65,max:.65});return false;}return true;});if(run.hp<=0){run.lastReport=run.report;finishLoop(true);return;}if(run.spawned>=count()&&!run.enemies.length){const bonus=waveReward(),yieldFood=harvest();run.lastReport=run.report;run.active=false;run.wave++;run.lastReward=bonus;run.projectiles=[];run.units=[];const eaten=settleFood(yieldFood);meta.best=Math.max(meta.best,run.wave);run.time+=bonus;run.hp=Math.min(maxHP(),run.hp+25+20*run.workers.build);log(`Волна ${run.wave} отражена. +${bonus} хронов. Урожай: +${yieldFood} еды. Съедено: ${eaten}/${dailyFood()}. ${run.unfed?'Дефицит: '+run.unfed+'. ':''}Павшие вернулись.`);shop();save();}
}
function openGarrison(){
 if(run.active||run.dead)return;
 if(!run.up.wall){
  show('<h2>Частокол</h2><p>Для назначения лучников и магов нужна каменная стена. Постройте её в бастионе. На стене будет '+wallPositions().length+' защищённых места.</p><button class="cancel" id="closeModal">Вернуться в город</button>');
  return;
 }
 const units=defenders().filter(isRanged);
 const rows=wallPositions().map((_,slot)=>'<label class="garrison-slot">Место '+(slot+1)+
  '<select data-wall-slot="'+slot+'"><option value="">Свободно</option>'+
  units.map(unit=>'<option value="'+unit.key+'" '+(run.garrison[slot]===unit.key?'selected':'')+'>'+
   (unit.hero?'Маг времени':unit.kind==='archer'?'Лучник '+(unit.id):'Хрономант '+(unit.id))+
   '</option>').join('')+'</select></label>').join('');
 show('<div class="eyebrow">РАССТАНОВКА В ГОРОДЕ</div><h2>'+fortName()+'</h2><p>Лучники и маги на укреплении продолжают стрелять, пока орда атакует стену. На земле защитников могут ранить.</p>'+rows+'<button class="cancel" id="closeModal">Вернуться в город</button>');
}
$('garrisonButton').onclick=openGarrison;
$('armyButton').onclick=openArmy;
$('modalContent').onchange=event=>{
 if(event.target.dataset.wallSlot===undefined)return;
 assignWall(Number(event.target.dataset.wallSlot),event.target.value||null);
 openGarrison();
};
let selectedUnit=null,selectedDefense=null,hoveredFormation=null,pinnedFormation=null;
function beginPlanning(){
 if(run.active||run.dead||run.planning)return;
 run.planning=true;
 pinnedFormation=null;
 selectedUnit=null;selectedDefense=null;
 run.units=[];
 shop();
 save();
}
function cancelPlanning(){
 if(!run.planning)return;
 run.planning=false;
 selectedUnit=null;selectedDefense=null;
 run.units=[];
 shop();
 save();
}
function restoreFormation(){
 if(!run.planning)return;
 run.units=[];
 selectedUnit=null;selectedDefense=null;
 shop();
 save();
 toast('Исходная расстановка восстановлена.');
}
function orderHero(x,y){
 const hero=defenders().find(unit=>unit.hero&&unit.hp>0);
 if(!hero)return;
 if(distance(hero,{x,y})<.027){
  selectedUnit=selectedUnit==='hero'?null:'hero';
  return;
 }
 if(selectedUnit!=='hero')return;
 if(y>.81){toast('Укажите точку перед укреплением.');return;}
 hero.destination={x:Math.max(.06,Math.min(.94,x)),y:Math.max(.08,Math.min(.79,y))};
 save();
}
function placeUnit(x,y){
 if(!run.planning)return;
 const point={x,y};
 if(selectedDefense!==null){
  const item=run.defenses[selectedDefense];
  if(y<.08||y>.79||x<.06||x>.94||run.defenses.some(other=>other!==item&&Number.isFinite(other.x)&&distance(other,point)<.035)){
   toast('Выберите свободное место перед укреплением.');return;
  }
  Object.assign(item,point);
  selectedDefense=null;shop();save();return;
 }
 const units=defenders();
 const clicked=units.reduce((nearest,unit)=>{
  if(distance(unit,point)>.027)return nearest;
  return !nearest||distance(unit,point)<distance(nearest,point)?unit:nearest;
 },null);
 if(clicked){
  selectedUnit=selectedUnit===clicked.key?null:clicked.key;
  return;
 }
 const unit=units.find(unit=>unit.key===selectedUnit);
 if(!unit)return;
 if(y>=.81){
  if(!run.up.wall||!isRanged(unit)||y>.91){toast('Выберите точку перед укреплением.');return;}
  const slot=wallPositions().find(position=>Math.abs(position-x)<.05);
  if(slot===undefined||units.some(other=>other!==unit&&other.onWall&&other.x===slot)){
   toast('Выберите свободное место на стене.');return;
  }
  unit.x=slot;
  unit.y=.84;
  unit.onWall=true;
 }else{
  unit.x=Math.max(.06,Math.min(.94,x));
  unit.y=Math.max(.08,Math.min(.79,y));
  unit.onWall=false;
 }
 selectedUnit=null;
 save();
}
$('shop').onclick=event=>{
 if(!run.planning)return;
 const button=event.target.closest('button');
 if(!button)return;
 const data=button.dataset;
 if(data.saveFormation!==undefined)saveFormationSlot(Number(data.saveFormation));
 if(data.previewFormation!==undefined){
  const index=Number(data.previewFormation);
  if(!meta.formations?.[index])return;
  pinnedFormation=pinnedFormation===index?null:index;
  hoveredFormation=null;
  for(const preview of $('shop').querySelectorAll('[data-preview-formation]')){
   preview.setAttribute('aria-pressed',String(Number(preview.dataset.previewFormation)===pinnedFormation));
  }
 }
 if(data.loadFormation!==undefined)loadFormationSlot(Number(data.loadFormation));
 if(Object.hasOwn(spells,data.spell)&&spellUnlocked()){run.spell=data.spell;shop();save();}
 if(data.defense!==undefined&&run.defenses[Number(data.defense)]?.hp>0){
  const index=Number(data.defense);
  selectedDefense=selectedDefense===index?null:index;selectedUnit=null;shop();
 }
};
$('shop').onpointerover=event=>{
 if(!run.planning||event.pointerType!=='mouse')return;
 const row=event.target.closest('[data-formation-row]');
 const index=Number(row?.dataset.formationRow);
 hoveredFormation=meta.formations?.[index]?index:null;
};
$('shop').onpointerout=event=>{
 const row=event.target.closest('[data-formation-row]');
 if(row&&!row.contains(event.relatedTarget))hoveredFormation=null;
};
$('start').onclick=()=>{
 if(run.dead)openLoopPlanner();
 else if(run.planning)start();
 else beginPlanning();
};
$('restoreFormation').onclick=restoreFormation;$('cancelPlanning').onclick=cancelPlanning;$('speed').onclick=()=>{speed=speed===1?2:speed===2?3:1;$('speed').textContent=speed+'×';};$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'Продолжить':'Пауза');};$('freeze').onclick=()=>{if(cooldown>0||!run.active||run.dead||!spellUnlocked())return;
 const spell=currentSpell();cooldown=1;run.stasisUsed=true;
 if(spell==='stasis'){freeze=5;run.freezeTime=5;}
 if(spell==='haste')run.haste=6;
 if(spell==='mend')for(const unit of defenders())if(unit.hp>0)unit.hp=Math.min(unit.maxHp,unit.hp+unit.maxHp*.4);
 log(spells[spell].name+': '+spells[spell].desc);update();save();};
$('cityMarkers').onclick=e=>{const b=e.target.closest('[data-building]');if(b)openBuilding(b.dataset.building);};
$('modalContent').onclick=e=>{
 const mode=e.target.closest('[data-mode]');
 if(mode&&loopPlan&&Object.hasOwn(modes,mode.dataset.mode)){loopPlan.mode=mode.dataset.mode;renderLoopPlanner();return;}
 const action=e.target.closest('[data-town-action]');
 if(action){townAction(action.dataset.townAction);return;}
 const goalButton=e.target.closest('[data-tree-goal]');
 if(goalButton&&loopPlan){
  if(goalButton.dataset.treeGoal==='clear')delete meta.treeGoal;
  else{
   const id=loopPlan.node;
   const level=(loopPlan.up[id]||0)+1;
   meta.treeGoal={id,level};
  }
  save();
  renderLoopPlanner();
  return;
 }
 const node=e.target.closest('[data-tree-node]');
 if(node&&loopPlan){
  loopPlan.node=node.dataset.treeNode;
  for(const button of $('treeStage').querySelectorAll('[data-tree-node]')){
   button.setAttribute('aria-pressed',String(button===node));
  }
  $('treeInspector').innerHTML=treeInspector();
  return;
 }
 const planButton=e.target.closest('[data-plan]');if(planButton){adjustLoopPlan(planButton.dataset.id,planButton.dataset.plan);return;}if(e.target.id==='refundAll'){refundLoopPlan();return;}if(e.target.id==='confirmLoopPlan'){commitLoopPlan();return;}if(e.target.id==='confirmReset'){resetProgress();return;}const b=e.target.closest('[data-city]');if(b){buy(b.dataset.city);openBuilding(openedBuilding);return;}if(e.target.closest('[data-repair]')){repair();openBuilding('bastion');return;}if(e.target.id==='betweenLoops'){openLoopPlanner();$('modal').scrollTop=0;return;}if(e.target.id==='closeModal'){$('modal').close();openedBuilding=null;loopPlan=null;}if(e.target.id==='confirmRewind')finishLoop();};
$('rewind').onclick=()=>{if(run.dead){finishLoop();return;}show(`<div class="modal-icon">↶</div><h2>Завершить эту петлю?</h2><p>Оценка сейчас: ${reward()} ✧. Рекорд оценки: ${bestScore()} ✧. Новых очков: +${recordGain()} ✧. Армия и улучшения зданий вернутся к началу; чертежи и улучшения вечности останутся.</p><button class="primary" id="confirmRewind">Завершить петлю</button><button class="cancel" id="closeModal">Продолжить</button>`);};
$('resetProgress').onclick=()=>{loopPlan=null;show('<div class="eyebrow">ПОЛНОЕ ОБНУЛЕНИЕ</div><h2>Начать всё сначала?</h2><p>Будут удалены текущая попытка, рекорд, осколки, все улучшения вечности и чертежи зданий в этом браузере. Вернуть их после сброса нельзя.</p><button class="primary danger-button" id="confirmReset">Сбросить весь прогресс</button><button class="cancel" id="closeModal">Отмена — сохранить прогресс</button>');};
$('help').onclick=()=>show('<div class="eyebrow">ГОРОД → ОБОРОНА → НОВАЯ ПЕТЛЯ</div><h2>Перепишите судьбу.</h2><p>В начале попытки вы получаете 120 хронов. Лучники и воины обучаются в казарме из крестьян после открытия соответствующих школ за осколки вечности. Хрономанты обучаются из крестьян в академии. Валюта не накапливается со временем. Каждый обычный монстр даёт 1 хрон, босс — 5. В казне «Сбор трофеев» повышает добычу на 1 за уровень (для босса — на 5).</p><p>Перед новой петлёй открывайте академию, казну, бастион и школы бойцов за осколки. Нажимайте на них для прокачки внутри попытки. В казарме можно улучшить урон (+25% базового за уровень) и скорость атак (+15%) лучников. В академии — урон и скорость всех магов, а также радиус взрыва хрономантов. Маг времени поражает одну цель.</p><p>Монстры бегут сверху вниз к южной стене. Каждый защитник выбирает цель. Стрелы и маг времени поражают одного врага. Хрономанты задевают соседей (45% урона). Крестьяне дерутся в ближнем бою. Павшие возвращаются после победы. Перед боем нажмите «Начать волну», выберите бойца и точку на поле, затем нажмите «В бой». Стазис доступен после улучшения «Управление временем» и применяется один раз за волну.</p><p>За победу: 60 + 10 × номер волны, плюс бонусы казны и вечности. После победы вы вернётесь в город. Ремонт в бастионе восстанавливает 100 прочности. В бою покупки закрыты. После победы фермы дают урожай, затем каждый житель съедает 1 еду. Остаток сохраняется. При дефиците жители начинают следующий бой с меньшим здоровьем (до −50%). Дома стоят хроны и добавляют по два жителя. Бастион заменяет частокол каменной стеной. Только на каменной стене есть защищённые места для лучников и магов.</p><p>В конце петли очки вечности начисляются за прирост рекорда текущего режима. Улучшение мага отдельно даёт бонус за пройденные волны каждой петли. Все осколки идут в общий пул. Выбранные улучшения вечности применяются в начале новой петли. Перед началом новой петли можно бесплатно перераспределить все очки вечности, включая чертежи. Прогресс сохраняется в браузере; кнопка внизу позволяет полностью его сбросить.</p><button class="primary" id="closeModal">К своему городу →</button>');$('modal').addEventListener('cancel',()=>{openedBuilding=null;loopPlan=null;});
// Native 448 × 300 pixel maps: city planning and north-to-south defence.
const canvas=$('scene'),ctx=canvas.getContext('2d'),W=448,H=300;canvas.width=W;canvas.height=H;ctx.imageSmoothingEnabled=false;
canvas.onclick=event=>{
 if(!run.planning&&!run.active)return;
 const bounds=canvas.getBoundingClientRect();
 const x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;
 if(run.active)orderHero(x,y);
 else placeUnit(x,y);
};
const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.floor(x),Math.floor(y),Math.ceil(w),Math.ceil(h));};
function sprite(rows,x,y,p,s=1){rows.forEach((row,iy)=>[...row].forEach((c,ix)=>{if(p[c])rect(x+ix*s,y+iy*s,s,s,p[c]);}));}
const mageArt=['....hh.....','...hhhh....','..hhhhhh...','.hhhhhhhh..','...shs...g.','..lhhhl..g.','..lhhhl..g.','...lll...g.','..dd.dd....'],bowArt=['...hhhh....','..hhhhhh...','..hssshh.g.','...sssh..g.','..lhlhl...g','..lhlhl...g','...lll...g.','..dd.dd..g.'],mobArt=['.h....h..','.hh..hh..','..hhhh...','.hseehh..','.hssshh..','..llll...','..lddl...','.dd..dd..'];
const magePal={h:'#ad91e8',l:'#69529f',s:'#edc9a0',g:'#a5efe0',d:'#293347'},bowPal={h:'#a7ca8d',l:'#477865',s:'#edc9a0',g:'#d3af7a',d:'#293347'};
function line(x1,y1,x2,y2,c){const n=Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1);for(let i=0;i<=n;i++)rect(x1+(x2-x1)*i/n,y1+(y2-y1)*i/n,1,1,c);}
function ring(x,y,r,c){for(let i=0;i<36;i++){const a=i/36*Math.PI*2;rect(x+Math.cos(a)*r,y+Math.sin(a)*r,2,2,c);}}
function tree(x,y,s=1){rect(x+3*s,y+5*s,9*s,8*s,'#203c3d');rect(x+4*s,y,6*s,3*s,'#66815b');rect(x+1*s,y+3*s,12*s,5*s,'#4c6f50');rect(x,y+7*s,14*s,4*s,'#365845');rect(x+5*s,y+11*s,4*s,2*s,'#29413c');}
function ground(){rect(0,0,W,H,'#334f46');for(let y=0;y<H;y+=8)for(let x=0;x<W;x+=8){const n=(x*17+y*31)%29;if(n<7)rect(x,y,8,8,n<3?'#3c5b4c':'#365348');}for(let i=0;i<200;i++){const x=(i*73+21)%W,y=(i*41+17)%H;rect(x,y,2,1,i%5?'#5d7c56':'#91a36b');if(i%13===0){rect(x,y-2,1,3,'#9fae72');rect(x+1,y-2,1,1,'#e3c48d');}}}
function roof(x,y,w,h,c){rect(x-3,y-3,w+6,h+9,'#243542');rect(x,y,w,h,c);rect(x+w*.5,y,2,h,'#e0ba9d');for(let yy=3;yy<h;yy+=5){rect(x,y+yy,w,1,'#35425466');for(let xx=3;xx<w;xx+=7)rect(x+xx+(yy%2)*2,y+yy-3,1,3,'#d9bdab66');}rect(x+2,y+h,w-4,5,'#bcc0a6');rect(x+w/2-3,y+h,6,4,'#d8b77e');}
const enemyPalettes={shaman:{h:'#78bd9d',l:'#447c62',s:'#aff0b6',e:'#eaffc1',d:'#334b44'},banner:{h:'#cc797c',l:'#924a62',s:'#efaaa3',e:'#ffeb99',d:'#4e304b'},shield:{h:'#7c9cc8',l:'#4d638f',s:'#b9d1ec',e:'#f4e9a1',d:'#384358'},runner:{h:'#eeb575',l:'#a66a48',s:'#f5d290',e:'#fff4ad',d:'#664b46'},armored:{h:'#a6bacb',l:'#597586',s:'#c1d0d9',e:'#ffe39d',d:'#334c5d'},siege:{h:'#b69ae2',l:'#72588d',s:'#d1bdeb',e:'#f3ddff',d:'#504161'}};
const warriorPal={...bowPal,h:'#b1bdcd',l:'#657694',g:'#e5deb2'};
const peasantPal={...bowPal,h:'#d4af6b',l:'#a17a54',g:'#cdd3b0'};
function town(){
 ground();rect(48,142,354,17,'#9b9273');for(const x of [.18,.50,.82])rect(x*W-8,70,16,170,'#9b9273');for(let i=0;i<65;i++)rect(53+(i*47)%343,145+(i*3)%11,3,1,'#c1b38d');
 for(const b of buildings){const x=b.x*W,y=b.y*H;if(unlocked(b.id)&&(!['farm','house'].includes(b.id)||run.up[b.id]>0)){rect(x-39,y-32,79,64,'#647563');rect(x-35,y-28,70,56,'#79826d');if(b.id==='farm'){
 rect(x-31,y-25,62,42,'#725739');
 for(let row=0;row<4;row++)for(let col=0;col<8;col++){
  rect(x-28+col*7,y-22+row*10,4,7,'#bd994f');
  rect(x-27+col*7,y-23+row*10,2,3,'#e0c478');
 }
 }if(b.id==='house'){
 roof(x-28,y-25,24,31,b.roof);
 roof(x+5,y-19,24,29,b.roof);
 }if(b.id==='barracks'){roof(x-29,y-24,57,37,b.roof);rect(x-35,y+20,8,6,'#d4bc82');rect(x+27,y+20,8,6,'#d4bc82');line(x-30,y-17,x-30,y-36,'#e4cf9b');rect(x-29,y-36,12,7,'#9dd2a4');sprite(bowArt,x+32,y-4,bowPal);}if(b.id==='academy'){roof(x-24,y-23,48,39,b.roof);rect(x-7,y-31,14,16,'#bc9cd5');ring(x,y-22,5,'#d8c8f1');sprite(mageArt,x+30,y+8,magePal);}if(b.id==='mint'){roof(x-28,y-23,56,35,b.roof);for(let i=0;i<3;i++){rect(x-25+i*20,y+21,12,8,'#a68b5c');rect(x-22+i*20,y+23,4,3,'#f0d68b');}}if(b.id==='workshop'){roof(x-25,y-20,50,26,b.roof);rect(x+13,y-24,6,15,'#544a48');}
 if(b.id==='bastion'){rect(x-29,y-24,59,42,'#526b7b');rect(x-25,y-20,50,34,'#9faeaa');rect(x-18,y-13,36,20,'#607985');for(let i=0;i<7;i++)rect(x-29+i*9,y-27,5,7,'#c7cdb2');rect(x-4,y-5,8,10,'#dec386');}}
 else{for(let xx=-32;xx<33;xx+=7){rect(x+xx,y-25,3,1,'#80947b');rect(x+xx,y+25,3,1,'#80947b');}for(let yy=-25;yy<26;yy+=7){rect(x-32,y+yy,1,3,'#80947b');rect(x+32,y+yy,1,3,'#80947b');}rect(x-7,y-5,14,10,'#607763');rect(x-4,y-10,8,5,'#607763');rect(x-2,y-3,4,5,'#344c43');}}
 for(let i=0;i<18;i++){tree(i*26-5,5+(i%3)*3,1.2);tree(i*27-6,280+(i%2)*3,1.2);}for(let i=0;i<8;i++){tree(4,28+i*31,1.1);tree(427,27+i*31,1.1);}for(const unit of defenders()){
  const x=150+(unit.id%10)*15,y=143+Math.floor(unit.id/10)*12;
  sprite(unit.kind==='mage'?mageArt:bowArt,x,y,unit.kind==='mage'?magePal:unit.kind==='peasant'?peasantPal:unit.kind==='warrior'?warriorPal:bowPal);
 }
}
function battlefield(){
 ground();for(let y=0;y<246;y+=4){const edge=9*Math.sin(y*.027);rect(115+edge,y,218,4,'#77765b');rect(120+edge,y,208,4,'#858064');}for(let i=0;i<120;i++)rect(119+(i*47)%207,(i*31)%243,3,1,'#aaa17d');
 for(const x of gatePositions.map(gate=>gate*W)){rect(x-10,2,20,7,'#3d3156');rect(x-14,4,4,7,'#8a6bb7');rect(x+10,4,4,7,'#8a6bb7');rect(x-8,9,16,5,'#6b5294');rect(x-4,8,8,3,'#c29ce8');}
 if(!run.up.wall){
  rect(32,248,386,18,'#614932');
  rect(32,254,386,4,'#493726');
  for(let x=32;x<418;x+=9){
   rect(x+1,242,5,3,'#c4a579');
   rect(x,245,7,17,'#92704c');
   rect(x+1,245,2,17,'#b08a5f');
  }
 }else{
 rect(32,247,386,21,'#27394b');rect(32,247,386,16,'#96a69a');rect(32,260,386,6,'#596f77');for(let x=32;x<418;x+=12){rect(x,243,7,7,'#c6cbb0');rect(x,249,1,12,'#617b81');}for(let y=251;y<263;y+=6)rect(32,y,386,1,'#71878a');for(const x of [30,401]){rect(x,239,19,32,'#435d70');rect(x+2,240,15,27,'#b5bca7');rect(x+5,246,9,15,'#68828a');}if(run.up.wall)for(let x=72;x<389;x+=52){rect(x,240,12,9,'#c6cbb0');rect(x+3,243,6,5,'#7d9293');} }
 for(const slot of run.up.wall?wallPositions():[]){
  rect(slot*W-10,247,20,15,run.up.wall?'#65777d':'#75573c');
  rect(slot*W-9,247,18,2,'#cfbb81');
 }
 rect(60,269,324,31,'#596c69');for(let x=63;x<385;x+=15){rect(x,273,12,8,'#76847b');rect(x+7,284,12,9,'#74827b');}for(let i=0;i<10;i++){tree(3,i*28+13,1.1);tree(427,i*29+9,1.2);}
 for(const u of defenders()){if(u.hp<=0)continue;rect(u.x*W-5,u.y*H+5,11,3,'#233d3c');rect(u.x*W-3,u.y*H+8,7,1,u.hero?'#e0c789':'#85b39b');}
 if(run.planning&&run.bonus.scout){
  for(const gate of waveGates()){
   const x=gatePositions[gate]*W;
   const boss=(run.wave+1)%5===0&&gateFor(count()-1)===gate;
   const color=boss?'#ffae84':'#f5dc89';
   line(x,20,x,47,color);
   line(x-6,40,x,47,color);
   line(x+6,40,x,47,color);
  }
 }
 if(run.planning||run.active){
  const picked=defenders().find(unit=>unit.key===selectedUnit&&unit.hp>0);
  if(picked){
   const radius=attackRange(picked)*W;
   ctx.beginPath();ctx.arc(picked.x*W,picked.y*H,radius,0,Math.PI*2);ctx.fillStyle='#ffe49b20';ctx.fill();ctx.strokeStyle='#d1b875';ctx.stroke();
   ring(picked.x*W,picked.y*H,9,'#fff0ab');
   if(run.active&&picked.destination)ring(picked.destination.x*W,picked.destination.y*H,5,'#fff0ab');
  }
 }
 const preview=hoveredFormation??pinnedFormation;
 if(run.planning&&preview!==null){
  for(const {unit,x,y} of formationPositions(preview)){
   const color=unit.hero?'#ffe3a1':'#9ce9ef';
   if(distance(unit,{x,y})>.008)line(unit.x*W,unit.y*H,x*W,y*H,'#6996a0');
   ring(x*W,y*H,8,color);
   rect(x*W-1,y*H-1,3,3,color);
  }
 }
 for(const item of run.defenses){
  if(item.hp<=0||!Number.isFinite(item.x))continue;
  const x=item.x*W,y=item.y*H;
  const kind=item.kind;
  rect(x-6,y-3,12,6,kind==='trap'?'#caaa72':kind==='stakes'?'#b67e56':'#7b9ba0');
  if(kind==='stakes')for(let i=-5;i<=5;i+=5)line(x+i,y-5,x+i+2,y+3,'#efcc89');
  if(kind==='trap')rect(x-2,y-2,4,4,'#574447');
  if(kind==='barricade')line(x-5,y+2,x+5,y-2,'#d0c6a4');
 }
 const actors=[...defenders().filter(u=>u.hp>0).map(u=>({u,y:u.y})),...run.enemies.map(e=>({e,y:e.y}))].sort((a,b)=>a.y-b.y);for(const a of actors){if(a.u){const u=a.u,x=u.x*W-5,y=u.y*H-6;sprite(u.kind==='mage'?mageArt:bowArt,x,y,u.kind==='mage'?magePal:u.kind==='peasant'?peasantPal:u.kind==='warrior'?warriorPal:bowPal);if(!u.onWall&&u.hp<u.maxHp){rect(x,y-3,10,1,'#302e30');rect(x,y-3,10*u.hp/u.maxHp,1,'#a9d09b');}if(u.hero)rect(x+3,y-4,4,1,'#ebcf8b');if(u.flash>0)rect(x+4,y-3,3,3,u.kind==='mage'?'#e1c7f9':'#f4e0a5');}else{const e=a.e,s=e.boss?2:1,x=e.x*W-4*s,y=e.y*H-4*s,bob=freeze>0?0:Math.floor(Math.sin(t*12+e.phase));const p=freeze>0?{h:'#96e1e4',l:'#619bb6',s:'#c4f0eb',e:'#f2ffff',d:'#365e74'}:e.hurt>0?{h:'#eee8d2',l:'#e4bbc0',s:'#fff4db',e:'#fff',d:'#716478'}:e.boss?{h:'#c779a9',l:'#81557f',s:'#e6b3bc',e:'#ffe39d',d:'#372f4b'}:enemyPalettes[e.kind]||{h:'#acc078',l:'#697e55',s:'#c2d591',e:'#ffdd92',d:'#2f4341'};rect(x-1,y+6*s,10*s,3,'#203a37');sprite(mobArt,x,y+bob,p,s);if(e.hp<e.max||e.boss){rect(x-1,y-4,10*s,2,'#253044');rect(x-1,y-4,Math.max(0,10*s*e.hp/e.max),1,e.boss?'#e9a8c9':'#c4db95');}}}
 for(const p of run.projectiles){const x=p.x*W,y=p.y*H;if(p.kind==='archer'){const a=Math.atan2((p.ty-p.y)*H,(p.tx-p.x)*W),dx=Math.cos(a)*5,dy=Math.sin(a)*5;line(x-dx,y-dy,x+dx*.5,y+dy*.5,'#f2e3b5');rect(x+dx*.5-1,y+dy*.5-1,2,2,'#fff2d2');}else{rect(x-2,y-2,5,5,'#bd9ce8');rect(x-1,y-1,3,3,'#f4e7fd');rect(x-1,y+5,2,3,'#8e6fc2');}}
 for(const p of particles){const x=p.x*W,y=p.y*H;if(p.kind==='blast'){const r=(1-p.life/p.max)*p.radius*W;ring(x,y,r,'#cba8ed');ring(x,y,r*.6,'#9b82cd');rect(x-2,y-2,4,4,'#f0dffb');}else if(p.kind==='loot'){const lift=(1-p.life/p.max)*10;rect(x-2,y-lift-3,5,6,'#e9c378');rect(x-1,y-lift-2,2,4,'#fff0b4');}else{rect(x-2,y,5,1,'#ffe8b7');rect(x,y-2,1,5,'#ffe8b7');}}if(freeze>0)for(let i=0;i<30;i++)rect(40+(i*73)%370,(i*37+Math.floor(t*10))%245,2,2,'#b1edf1');
}
function cityFire(){
 rect(0,0,W,H,'#210f1bbb');
 for(let index=0;index<16;index++){
  const building=buildings[index%buildings.length];
  const x=building.x*W+(index*17%37)-18;
  const y=building.y*H+(index*11%29)-12;
  const flicker=Math.sin(t*11+index)*4;
  rect(x-12,y-10,24,18,'#ec521637');
  for(let spark=0;spark<4;spark++){
   const lift=(t*14+index*7+spark*11)%48;
   rect(x+(spark*9%19)-10+lift*.25,y-lift,3+lift*.10,3+lift*.08,'#21192577');
  }
  rect(x-4,y-11-flicker,9,15+flicker,'#ef642b');
  rect(x-2,y-7-flicker*.6,5,10+flicker*.6,'#ffb347');
  rect(x-1,y-3,3,6,'#ffe5a0');
 }
}
function draw(){
 if(run.active||run.planning)battlefield();
 else{
  town();
  if(run.defeated)cityFire();
 }
}
function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;if(!paused)t+=dt;step(dt*speed);draw();uiTimer+=dt;if(uiTimer>.12){update();renderRoster();uiTimer=0;}saveTimer+=dt;if(saveTimer>3){save();saveTimer=0;}requestAnimationFrame(frame);}
// A stale tab cannot restore progress from before a full reset or a new loop.
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{const incoming=JSON.parse(e.newValue),epoch=incoming.epoch||0;if(epoch>saveEpoch)reloadLatest();else if(epoch<saveEpoch)save();}catch(err){}});
window.addEventListener('beforeunload',save);document.addEventListener('visibilitychange',()=>{last=performance.now();save();});if(!logs.length)log('Два крестьянина и маг времени готовятся защищать частокол.');renderLog();shop();save();requestAnimationFrame(frame);if(run.dead)finishLoop();
})();
