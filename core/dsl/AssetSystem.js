/**
 * AssetSystem.js v1.0 — AI资产生成与渲染系统
 *
 * 功能:
 *   - 加载 Asset DSL (characters/environments/effects/weapons)
 *   - 程序化渲染角色(袍/甲/武器)和环境(主题色/建筑)
 *   - 特效粒子库绑定技能
 *
 * 角色模板库:
 *   mage       → 法师(长袍+法杖)
 *   warrior    → 战士(铠甲+剑)
 *   undead     → 亡灵(暗黑袍+紫光)
 *   dragon     → 巨龙(火焰/冰霜配色)
 *   goblin     → 哥布林(小体型+绿)
 *   skeleton   → 骷髅(骨白)
 *   darkLord   → 暗黑王(紫袍+王冠)
 *
 * 环境主题:
 *   forest/dungeon/city/desert/space/castle/ruins
 *
 * 特效类型:
 *   fire/ice/lightning/dark/holy/poison
 */
(function(){var A=window.AGE;

// ── 内置角色绘制的模板 ──
var CHAR_TEMPLATES={
  mage:{robe:'#2244aa',staff:'#ccaa00',glow:'#4488ff',hood:'#1a2a5a'},
  warrior:{armor:'#888',sword:'#ddd',shield:'#aa6',glow:'#ffe0',hood:'#555'},
  undead:{robe:'#1a1a1a',staff:'#8844aa',glow:'#9944ff',hood:'#0a0a0a'},
  dragon:{body:'#ff4422',wing:'#cc2200',eye:'#ff0',glow:'#ff0',horn:'#440'},
  goblin:{skin:'#3a8',armor:'#550',glow:'#a60',weapon:'#753'},
  skeleton:{bone:'#eed',glow:'#a44',armor:'#555'},
  darkLord:{robe:'#1a0030',crown:'#ffaa00',glow:'#8800ff',staff:'#440066'},
  cyborg:{metal:'#667',glow:'#0ff',eye:'#0ff'},
  ninja:{suit:'#111',mask:'#222',glow:'#a00'},
  angel:{robe:'#ffe',glow:'#ff8',wing:'#fed'},
  demon:{body:'#800',horn:'#400',glow:'#f40',wing:'#600'},
  necromancer:{robe:'#0a1a0a',staff:'#305',glow:'#4a2',hood:'#051505'}
};

/** 绘制角色 */
function drawCharacter(ctx,x,y,w,h,asset,frame){
  var tmpl=CHAR_TEMPLATES[asset.style||asset.type||'mage']||CHAR_TEMPLATES.mage;
  var gl=tmpl.glow,sz=w||30;
  ctx.save();
  // glow
  if(gl){ctx.shadowColor=gl;ctx.shadowBlur=12;}

  if(tmpl.robe){
    // 身体(长袍)
    var bodyGrd=ctx.createLinearGradient(x,y,x+sz,y+h);
    bodyGrd.addColorStop(0,tmpl.robe);bodyGrd.addColorStop(0.3,tmpl.hood||tmpl.robe);bodyGrd.addColorStop(1,tmpl.robe);
    ctx.fillStyle=bodyGrd;ctx.fillRect(x+4,y+6,sz-8,h-10);
    // 头
    ctx.fillStyle=tmpl.hood||tmpl.robe;ctx.fillRect(x+6,y+2,sz-12,10);
    // 眼睛(发光)
    ctx.fillStyle=tmpl.glow||'#ff0';ctx.fillRect(x+8,y+5,4,3);ctx.fillRect(x+sz-12,y+5,4,3);
  }else if(tmpl.skin){
    // 皮肤(哥布林类)
    ctx.fillStyle=tmpl.skin;ctx.fillRect(x+4,y+4,sz-8,h-8);
    ctx.fillStyle=tmpl.glow;ctx.fillRect(x+8,y+6,4,4);ctx.fillRect(x+sz-12,y+6,4,4);
  }else{
    // 默认方块
    ctx.fillStyle=tmpl.glow||'#0ff';ctx.fillRect(x,y,sz,h);
    ctx.fillStyle='#fff';ctx.fillRect(x+6,y+4,4,4);ctx.fillRect(x+sz-10,y+4,4,4);
  }

  // 武器/法杖
  if(tmpl.staff){
    ctx.fillStyle=tmpl.staff;ctx.fillRect(x+sz-4,y-2,3,12);
    ctx.fillStyle=tmpl.glow||'#ff0';ctx.beginPath();ctx.arc(x+sz-2.5,y-6,5,0,Math.PI*2);ctx.fill();
  }else if(tmpl.sword){
    ctx.fillStyle=tmpl.sword;ctx.fillRect(x+sz-2,y+2,4,14);
    ctx.fillStyle='#fff';ctx.fillRect(x+sz-4,y,8,4);
  }

  ctx.shadowBlur=0;ctx.restore();
}

/** 绘制环境 */
function drawEnvironment(ctx,w,h,theme){
  var colors={forest:'#0a1a0a',dungeon:'#0e0e1a',city:'#1a1a2a',desert:'#2a2a0a',space:'#06061a',castle:'#18182a',ruins:'#1a1808'};
  ctx.fillStyle=colors[theme]||colors.dungeon;ctx.fillRect(0,0,w,h);
  // 主题装饰
  if(theme==='forest'){for(var i=0;i<8;i++){ctx.fillStyle='rgba(0,100,0,0.3)';ctx.fillRect(40+i*90,240,18,90);ctx.fillStyle='rgba(0,150,0,0.4)';ctx.beginPath();ctx.arc(49+i*90,230,22,0,Math.PI*2);ctx.fill();}}
  else if(theme==='city'){for(var i=0;i<6;i++){ctx.fillStyle='rgba(50,50,80,0.4)';ctx.fillRect(60+i*120,140,40,190);ctx.fillStyle='rgba(255,220,100,0.08)';ctx.fillRect(65+i*120,148,12,12);ctx.fillRect(85+i*120,148,12,12);}}
  else if(theme==='ruins'){for(var i=0;i<5;i++){ctx.fillStyle='rgba(80,70,40,0.3)';ctx.fillRect(30+i*150,200,70,130);ctx.fillStyle='rgba(60,50,30,0.3)';ctx.fillRect(30+i*150,190,75,15);}}
}

/** 绘制武器 */
function drawWeapon(ctx,x,y,type){
  switch(type){
    case'sword':ctx.fillStyle='#ddd';ctx.fillRect(x,y-12,4,24);ctx.fillRect(x-2,y-12,8,4);break;
    case'staff':ctx.fillStyle='#aa6';ctx.fillRect(x,y-2,3,16);ctx.fillStyle='#0ff';ctx.beginPath();ctx.arc(x+1.5,y-8,6,0,Math.PI*2);ctx.fill();break;
    case'bow':ctx.strokeStyle='#964';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,12,-0.8,0.8);ctx.stroke();break;
    case'axe':ctx.fillStyle='#888';ctx.fillRect(x-6,y-8,12,4);ctx.fillRect(x-2,y-8,4,16);break;
  }
}

// ── AssetSystem ──
A.AssetSystem=function(){
  this.characters={};this.environments={};this.effects={};this.weapons={};
  // 默认角色
  this.characters.player={type:'mage',style:'mage',name:'法师'};
  this.characters.enemy={type:'goblin',style:'goblin',name:'哥布林'};
  this.characters.boss={type:'darkLord',style:'darkLord',name:'暗黑王'};
};

/** 加载Asset DSL */
A.AssetSystem.prototype.load=function(assetDSL){
  if(!assetDSL||!assetDSL.assets)return;
  var a=assetDSL.assets;
  // characters
  if(a.characters)for(var i=0;i<a.characters.length;i++){var c=a.characters[i];if(c&&c.id)this.characters[c.id]={type:c.type||'mage',style:c.style||c.type||'mage',name:c.name||c.id,appearance:c.appearance||''};}
  // environments
  if(a.environments)for(var i=0;i<a.environments.length;i++){var e=a.environments[i];if(e&&e.id)this.environments[e.id]={type:e.type||'dungeon',theme:e.style||e.type||'dungeon'};}
  // effects
  if(a.effects)for(var i=0;i<a.effects.length;i++){var f=a.effects[i];if(f&&f.id)this.effects[f.id]={type:f.type||'magic',color:f.color||'#ff4400',particle:f.particle||'circle'};}
  // weapons
  if(a.weapons)for(var i=0;i<a.weapons.length;i++){var w=a.weapons[i];if(w&&w.id)this.weapons[w.id]={type:w.type||'staff',name:w.name||w.id,damage:w.damage||10,effect:w.effect||'fire'};}
};

/** 渲染角色 */
A.AssetSystem.prototype.renderCharacter=function(ctx,id,x,y,w,h,frame){
  var ch=this.characters[id]||this.characters.player;
  drawCharacter(ctx,x,y,w,h,ch,frame);
};

/** 渲染环境 */
A.AssetSystem.prototype.renderEnvironment=function(ctx,id,w,h){
  var env=this.environments[id];
  drawEnvironment(ctx,w||800,h||400,(env?env.theme:'dungeon'));
};

/** 获取特效颜色 */
A.AssetSystem.prototype.getEffectColor=function(id){
  var ef=this.effects[id];return ef?ef.color:'#ff4400';
};

/** 渲染武器 */
A.AssetSystem.prototype.renderWeapon=function(ctx,id,x,y){
  var wp=this.weapons[id];drawWeapon(ctx,x,y,wp?wp.type:'staff');
};

})();
