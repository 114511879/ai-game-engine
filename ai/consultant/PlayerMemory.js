/** PlayerMemory.js v1.0 - confirmed player preference memory */
(function(){
var A=window.AGE;
var DEFAULT_KEY='age_player_preferences_v1';
var LABELS={
  game_type:'游戏类型',combat_style:'战斗风格',difficulty:'难度',world:'世界观',camera:'视角',boss_focus:'Boss偏好',
  action_rpg:'动作RPG',horror:'恐怖游戏',puzzle:'解谜',runner:'跑酷',shooter:'射击',story:'剧情冒险',rpg:'角色扮演',strategy:'策略',tower_defense:'塔防',card:'卡牌',simulation:'模拟经营',sandbox:'沙盒',racing:'竞速',
  souls_like:'魂系战斗',power_fantasy:'爽快战斗',combo:'技能连招',turn_strategy:'策略回合',survival_action:'追逐生存',escape_puzzle:'逃脱解谜',
  easy:'轻松',normal:'标准',medium:'标准',hard:'高难',dark_chinese_myth:'黑暗中国神话',sci_fi:'科幻未来',western_fantasy:'西方魔幻',modern_horror:'现代恐怖',
  first_person:'第一人称',third_person:'第三人称',top_down:'上帝视角',side_scroll:'横版视角',true:'偏爱Boss战'
};

function empty(){return{version:1,traits:{},updatedAt:0};}
function traitKey(category,value){return category+':'+String(value);}
function addTrait(list,category,value){if(value!==null&&value!==undefined&&value!=='')list.push({category:category,value:value});}

A.PlayerPreferenceMemory=function(storage,key,now){
  this.storage=storage||window.localStorage;
  this.key=key||DEFAULT_KEY;
  this.now=now||function(){return Date.now();};
};
A.PlayerPreferenceMemory.prototype.load=function(){
  try{
    var raw=this.storage.getItem(this.key), data=raw?JSON.parse(raw):empty();
    if(!data||data.version!==1||!data.traits)return empty();
    return data;
  }catch(e){return empty();}
};
A.PlayerPreferenceMemory.prototype.save=function(data){
  data.updatedAt=this.now();
  this.storage.setItem(this.key,JSON.stringify(data));
  return data;
};
A.PlayerPreferenceMemory.prototype.remember=function(intent){
  if(!intent)return this.load();
  var data=this.load(), now=this.now(), traits=[];
  addTrait(traits,'game_type',intent.game_type);
  addTrait(traits,'combat_style',intent.combat&&intent.combat.style);
  addTrait(traits,'difficulty',intent.combat&&intent.combat.difficulty);
  addTrait(traits,'world',intent.theme&&intent.theme.world);
  addTrait(traits,'camera',intent.camera&&intent.camera.view);
  if(intent.combat&&intent.combat.boss_focus)addTrait(traits,'boss_focus',true);
  for(var i=0;i<traits.length;i++){
    var t=traits[i], key=traitKey(t.category,t.value), item=data.traits[key];
    if(!item)item=data.traits[key]={category:t.category,value:t.value,count:0,firstUsed:now,lastUsed:now};
    item.count++;
    item.lastUsed=now;
  }
  return this.save(data);
};
A.PlayerPreferenceMemory.prototype.context=function(limit){
  var data=this.load(), groups={}, key;
  for(key in data.traits)if(data.traits.hasOwnProperty(key)){
    var item=data.traits[key];
    if(!groups[item.category])groups[item.category]=[];
    groups[item.category].push(item);
  }
  var result=[];
  for(var category in groups)if(groups.hasOwnProperty(category)){
    var items=groups[category], total=0;
    for(var i=0;i<items.length;i++)total+=items[i].count;
    items.sort(function(a,b){return b.count-a.count||b.lastUsed-a.lastUsed;});
    var top=items[0];
    result.push({
      category:top.category,value:top.value,count:top.count,
      confidence:total?(top.count+1)/(total+2):0,lastUsed:top.lastUsed,
      categoryLabel:this.label(top.category),valueLabel:this.label(String(top.value))
    });
  }
  result.sort(function(a,b){return b.count-a.count||b.lastUsed-a.lastUsed;});
  return result.slice(0,limit||6);
};
A.PlayerPreferenceMemory.prototype.all=function(){
  var data=this.load(), result=[], totals={};
  for(var key in data.traits)if(data.traits.hasOwnProperty(key)){
    var item=data.traits[key];
    result.push({category:item.category,value:item.value,count:item.count,firstUsed:item.firstUsed,lastUsed:item.lastUsed,categoryLabel:this.label(item.category),valueLabel:this.label(String(item.value))});
    totals[item.category]=(totals[item.category]||0)+item.count;
  }
  for(var i=0;i<result.length;i++)result[i].confidence=totals[result[i].category]?(result[i].count+1)/(totals[result[i].category]+2):0;
  result.sort(function(a,b){return b.count-a.count||b.lastUsed-a.lastUsed;});
  return result;
};
A.PlayerPreferenceMemory.prototype.remove=function(category,value){
  var data=this.load();
  delete data.traits[traitKey(category,value)];
  return this.save(data);
};
A.PlayerPreferenceMemory.prototype.clear=function(){
  this.storage.removeItem(this.key);
};
A.PlayerPreferenceMemory.prototype.count=function(){return this.all().length;};
A.PlayerPreferenceMemory.prototype.label=function(value){return LABELS[value]||value;};
A.PlayerPreferenceMemory.prototype.summary=function(){
  var ctx=this.context(6), parts=[];
  for(var i=0;i<ctx.length;i++)parts.push(ctx[i].categoryLabel+' '+ctx[i].valueLabel);
  return parts.join('、');
};
})();
