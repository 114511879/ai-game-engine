/** GameConsultant.js v1.0 - multi-turn player intent and Intent DSL */
(function(){
var A=window.AGE;
var MAX_QUESTIONS=4;

var QUESTION_BANK={
  playstyle:{
    text:'你希望玩家主要获得哪种体验？',
    choices:[
      {label:'动作战斗',value:'action'},
      {label:'剧情探索',value:'story'},
      {label:'RPG成长',value:'rpg'},
      {label:'Boss挑战',value:'boss'},
      {label:'解谜推理',value:'puzzle'},
      {label:'策略经营',value:'strategy'},
      {label:'塔防建造',value:'tower_defense'},
      {label:'卡牌对战',value:'card'},
      {label:'模拟经营',value:'simulation'},
      {label:'沙盒建造',value:'sandbox'},
      {label:'竞速冲刺',value:'racing'}
    ]
  },
  horror_style:{
    text:'你想要哪一种恐怖体验？',
    choices:[
      {label:'心理恐怖',value:'psychological'},
      {label:'怪物追杀',value:'monster_chase'},
      {label:'密室解谜',value:'escape_puzzle'},
      {label:'生存恐怖',value:'survival_horror'}
    ]
  },
  combat:{
    text:'战斗手感更接近哪一种？',
    choices:[
      {label:'魂系高难',value:'souls_like'},
      {label:'割草爽快',value:'power_fantasy'},
      {label:'技能连招',value:'combo'},
      {label:'策略回合',value:'turn_strategy'}
    ]
  },
  difficulty:{
    text:'你希望游戏难度怎样？',
    choices:[
      {label:'轻松易上手',value:'easy'},
      {label:'标准挑战',value:'normal'},
      {label:'高难受苦',value:'hard'}
    ]
  },
  world:{
    text:'世界观和美术方向是什么？',
    choices:[
      {label:'中国神话',value:'dark_chinese_myth'},
      {label:'科幻未来',value:'sci_fi'},
      {label:'西方魔幻',value:'western_fantasy'},
      {label:'现代恐怖',value:'modern_horror'},
      {label:'自定义',value:'custom'}
    ]
  },
  camera:{
    text:'你更喜欢哪种视角？',
    choices:[
      {label:'第一人称',value:'first_person'},
      {label:'第三人称',value:'third_person'},
      {label:'上帝视角',value:'top_down'},
      {label:'横版视角',value:'side_scroll'}
    ]
  },
  runner_goal:{text:'这款跑酷最重要的体验是什么？',choices:[{label:'高速冲刺',value:'speed'},{label:'精准跳跃',value:'precision'},{label:'收集成长',value:'collection'},{label:'耐力生存',value:'survival'}]},
  shooter_mode:{text:'射击玩法以什么为核心？',choices:[{label:'弹幕躲避',value:'bullet_hell'},{label:'竞技场战斗',value:'arena'},{label:'战术射击',value:'tactical'},{label:'生存守卫',value:'survival'}]},
  platform_goal:{text:'平台游戏的关卡重点是什么？',choices:[{label:'精准跳跃',value:'precision'},{label:'探索隐藏区',value:'exploration'},{label:'机关解谜',value:'puzzle'},{label:'收集道具',value:'collection'}]},
  dungeon_goal:{text:'地牢游戏的核心重点是什么？',choices:[{label:'Boss挑战',value:'boss'},{label:'房间探索',value:'exploration'},{label:'装备掉落',value:'loot'},{label:'生存压力',value:'survival'}]},
  story_mode:{text:'文字冒险最重要的内容是什么？',choices:[{label:'多分支选择',value:'branching'},{label:'悬疑推理',value:'mystery'},{label:'历史改写',value:'history'},{label:'角色关系',value:'relationships'}]},
  rpg_growth:{text:'RPG成长主要依靠什么？',choices:[{label:'等级升级',value:'level'},{label:'装备收集',value:'equipment'},{label:'技能树',value:'skills'},{label:'剧情选择',value:'story'}]},
  strategy_mode:{text:'策略游戏的决策重点是什么？',choices:[{label:'实时调度',value:'real_time'},{label:'回合战棋',value:'turn_based'},{label:'资源运营',value:'economy'},{label:'领土占领',value:'conquest'}]},
  tower_layout:{text:'塔防地图采用哪种路线？',choices:[{label:'单线路径',value:'single_path'},{label:'多路防守',value:'multi_lane'},{label:'自由造迷宫',value:'maze'},{label:'护送移动目标',value:'escort'}]},
  card_system:{text:'卡牌玩法采用哪种构筑方式？',choices:[{label:'局外组牌',value:'deck_building'},{label:'固定牌组',value:'fixed_deck'},{label:'肉鸽构筑',value:'roguelike'},{label:'连锁组合',value:'combo'}]},
  simulation_goal:{text:'模拟经营的主要目标是什么？',choices:[{label:'城市发展',value:'city'},{label:'农场经营',value:'farm'},{label:'公司管理',value:'company'},{label:'生存管理',value:'survival'}]},
  sandbox_goal:{text:'沙盒游戏希望玩家主要做什么？',choices:[{label:'自由建造',value:'building'},{label:'采集生存',value:'survival'},{label:'机关创作',value:'creation'},{label:'开放探索',value:'exploration'}]},
  racing_mode:{text:'竞速体验更接近哪一种？',choices:[{label:'街机爽快',value:'arcade'},{label:'拟真驾驶',value:'simulation'},{label:'障碍竞速',value:'obstacle'},{label:'计时挑战',value:'time_trial'}]}
};

var TYPE_QUESTIONS={runner:'runner_goal',shooter:'shooter_mode',platformer:'platform_goal',dungeon:'dungeon_goal',story:'story_mode',rpg:'rpg_growth',strategy:'strategy_mode',tower_defense:'tower_layout',card:'card_system',simulation:'simulation_goal',sandbox:'sandbox_goal',racing:'racing_mode'};

function copy(v){return JSON.parse(JSON.stringify(v));}
function has(v){return v!==null&&v!==undefined&&v!=='';}

function questionFor(state){
  var i=state.intent;
  var typeQuestion=TYPE_QUESTIONS[i.game_type];
  if(typeQuestion&&!has(i.details[typeQuestion])&&!state.answers[typeQuestion])return typeQuestion;
  if(i.game_type==='horror'&&!i.combat.style&&!state.answers.horror_style)return'horror_style';
  if(!i.game_type&&!state.answers.playstyle)return'playstyle';
  var combatTypes={action_rpg:1,horror:1,dungeon:1,rpg:1,shooter:1};
  if(combatTypes[i.game_type]&&!i.combat.style&&!state.answers.combat)return'combat';
  if(!has(i.combat.difficulty)&&!state.answers.difficulty)return'difficulty';
  if(!has(i.theme.world)&&!state.answers.world)return'world';
  var cameraTypes={runner:1,shooter:1,platformer:1,action_rpg:1,horror:1,dungeon:1,rpg:1,racing:1};
  if(cameraTypes[i.game_type]&&!has(i.camera.view)&&!state.answers.camera)return'camera';
  return null;
}

function applyAnswer(intent,id,value){
  if(id==='playstyle'){
    if(value==='action')intent.game_type='action_rpg';
    if(value==='story')intent.game_type='story';
    if(value==='rpg'){intent.game_type='rpg';intent.progression.growth=true;}
    if(value==='boss'){intent.game_type='action_rpg';intent.combat.boss_focus=true;}
    if(value==='puzzle')intent.game_type='puzzle';
    if(value==='strategy')intent.game_type='strategy';
    if(value==='tower_defense')intent.game_type='tower_defense';
    if(value==='card')intent.game_type='card';
    if(value==='simulation')intent.game_type='simulation';
    if(value==='sandbox')intent.game_type='sandbox';
    if(value==='racing')intent.game_type='racing';
  }else if(id==='horror_style'){
    intent.game_type='horror';intent.emotion.target='horror';
    intent.combat.style=value==='monster_chase'?'survival_action':'escape_puzzle';
  }else if(id==='combat')intent.combat.style=value;
  else if(id==='difficulty')intent.combat.difficulty=value;
  else if(id==='world')intent.theme.world=value;
  else if(id==='camera')intent.camera.view=value;
  else if(QUESTION_BANK[id])intent.details[id]=value;
}

function applyMemory(intent,memory){
  memory=memory||[];
  for(var i=0;i<memory.length;i++){
    var item=memory[i], category=item.category, value=item.value;
    if(category==='game_type'&&!has(intent.game_type))intent.game_type=value;
    else if(category==='combat_style'&&!has(intent.combat.style))intent.combat.style=value;
    else if(category==='difficulty'&&!has(intent.combat.difficulty))intent.combat.difficulty=value;
    else if(category==='world'&&!has(intent.theme.world))intent.theme.world=value;
    else if(category==='camera'&&!has(intent.camera.view))intent.camera.view=value;
    else if(category==='boss_focus'&&value===true)intent.combat.boss_focus=true;
  }
  intent.memory_context=copy(memory);
  return intent;
}

A.IntentDSL.question=function(id){return QUESTION_BANK[id]?copy(QUESTION_BANK[id]):null;};

A.GameConsultant=function(options){
  options=options||{};
  this.memory=options.memory||[];
  this.seedIntent=options.seedIntent||null;
  this.parser=options.parser||new A.IntentParserAgent();
  this.state=null;
};
A.GameConsultant.prototype._localState=function(){
  var s=this.state, qid=questionFor(s);
  s.questionId=qid;
  s.question=qid?copy(QUESTION_BANK[qid]):null;
  s.ready=!qid||s.questionCount>=MAX_QUESTIONS;
  s.intent.confidence=Math.min(0.95,0.45+s.questionCount*0.14+(qid?0:0.2));
  return this.getState();
};
A.GameConsultant.prototype.begin=async function(raw){
  var initialIntent=await this.parser.parse(raw,{memory:this.memory,lockedIntent:this.seedIntent});
  if(this.seedIntent)A.IntentParserAgent.merge(initialIntent,this.seedIntent);
  this.state={raw:raw||'',intent:initialIntent,lockedIntent:this.seedIntent?copy(this.seedIntent):null,answers:{},questionId:null,question:null,questionCount:0,history:[],ready:false,confirmed:false,memoryApplied:false,summary:''};
  var ai=null;
  if(A.callStructuredAI){
    ai=await A.callStructuredAI(
      '你是AI游戏顾问，只负责选择下一个澄清问题，不负责解析或修改Intent。只输出JSON：{question:{id,text,choices},ready:boolean,summary:string}。缺少关键信息时只问一个最有价值的问题。',
      JSON.stringify({request:raw,lockedIntent:this.seedIntent,memory:this.memory,partialIntent:this.state.intent}),
      {errorStatus:'顾问暂时离线，使用本地澄清流程',max_tokens:1200}
    );
  }
  if(ai){
    this.state.summary=ai.summary||'';
    if(ai.question&&ai.question.id&&QUESTION_BANK[ai.question.id])this.state.questionId=ai.question.id;
    if(ai.ready)this.state.questionId=null;
  }
  return this._localState();
};
A.GameConsultant.prototype.answer=async function(value){
  if(!this.state)return null;
  var id=this.state.questionId;
  this.state.history.push({question:id,answer:value});
  this.state.answers[id]=value;
  this.state.questionCount++;
  applyAnswer(this.state.intent,id,value);
  if(this.seedIntent)A.IntentParserAgent.merge(this.state.intent,this.seedIntent);
  var ai=null;
  if(A.callStructuredAI){
    ai=await A.callStructuredAI(
      '你是AI游戏顾问，只负责根据当前Intent和回答选择下一个澄清问题。只输出JSON：{question:{id,text,choices},ready:boolean,summary:string}。不要修改Intent，不要生成代码。',
      JSON.stringify({request:this.state.raw,lockedIntent:this.seedIntent,memory:this.memory,answers:this.state.history,partialIntent:this.state.intent}),
      {errorStatus:'顾问响应失败，继续本地澄清',max_tokens:1200}
    );
  }
  if(ai){this.state.summary=ai.summary||this.state.summary;if(ai.ready)this.state.questionId=null;}
  return this._localState();
};
A.GameConsultant.prototype.applyMemory=function(){
  if(!this.state)return null;
  applyMemory(this.state.intent,this.memory);
  this.state.memoryApplied=true;
  this.state.summary='已应用历史偏好，当前需求中的明确选择仍然优先。';
  return this._localState();
};
A.GameConsultant.prototype.skip=function(){
  if(!this.state)return null;
  this.state.intent=A.IntentParserAgent.normalize(this.state.intent,this.state.raw,this.memory);
  this.state.questionId=null;this.state.question=null;this.state.ready=true;return this.getState();
};
A.GameConsultant.prototype.confirm=function(){
  if(!this.state)return null;
  this.state.intent=A.IntentParserAgent.normalize(this.state.intent,this.state.raw,this.memory);
  this.state.confirmed=true;this.state.ready=true;return this.getState();
};
A.GameConsultant.prototype.getState=function(){
  if(!this.state)return null;
  var out=copy(this.state);
  out.memorySuggestions=copy(this.memory||[]);
  if(out.ready||out.confirmed)out.intent=A.IntentParserAgent.normalize(out.intent,out.raw,this.memory);
  return out;
};
})();
