/** DungeonPlugin v8.3 — Boss关终于可见 */
(function(){var A=window.AGE;A.DungeonPlugin={name:'dungeon',label:'地牢Boss',
preset:{meta:{game_type:'dungeon',title:'暗黑地牢'},rules:{win_condition:'boss_kill',win_value:1},player:{hp:8,jump_power:-12,speed:3,size:28,max_jump_multiplier:1.5},skills:[{name:'fireball',cooldown:30,damage:25,speed:10},{name:'dash',cooldown:45,distance:90},{name:'shield',cooldown:80}],world:{gravity:1.0,scroll_speed:3,ground_y:330},enemies:[{type:'spike',speed:1.5,spawn_rate:40,size:22,hp:2}],levels:[{id:1,name:'暗黑森林',difficulty:1,map:{type:'forest',rooms:[{type:'normal',name:'入口'},{type:'enemy',name:'哥布林营地'}]},boss:null},{id:2,name:'亡灵地宫',difficulty:2,map:{type:'dungeon',rooms:[{type:'enemy',name:'骷髅大厅'},{type:'treasure',name:'金库'}]},boss:null},{id:3,name:'Boss大厅',difficulty:3,map:{type:'dungeon',rooms:[{type:'boss',name:'黑暗王座'}]},boss:{name:'亡灵法师',hp:400,phase:3,theme:'dark',skills:[{name:'亡魂弹',type:'projectile',damage:1,cooldown:70,speed:7},{name:'亡灵召唤',type:'summon',cooldown:200,count:2,summonHp:2},{name:'骨牢',type:'aoe',damage:1,cooldown:160}]}}]},
onLoad:function(e,d){e.levelMgr=null;e.mapSystem=null;e.bossSystem=null;e._bossActive=false;e._bossDefeated=false;e._projectiles=[];e._aoeFlash=0;e._bossShield=null;e._onBossDefeated=null;e._keysPressed={a:false,d:false,arrowleft:false,arrowright:false};e._enemiesPerLevel=4;e._enemiesSpawned=0;e._flLevelComplete=0;e._spawnTimer=0;e._noDefaultSpawn=true;e._levelSwitchLock=false;e._inBossFight=false;e._listenerCount=e._listenerCount||0;
if(!e._listenerCount){document.addEventListener('keydown',function(ev){var k=(ev.key||ev.code||'').toLowerCase();if(k==='a'||k==='d'||k==='arrowleft'||k==='arrowright')e._keysPressed[k]=true;});document.addEventListener('keyup',function(ev){var k=(ev.key||ev.code||'').toLowerCase();if(k==='a'||k==='d'||k==='arrowleft'||k==='arrowright')e._keysPressed[k]=false;});}e._listenerCount++;
var lvls=d.levels||[];if(lvls.length===0){lvls=[{id:1,name:'区域1',difficulty:1,map:{type:'dungeon',rooms:[{type:'enemy',name:'敌区'}]},boss:null},{id:2,name:'Boss房',difficulty:2,map:{type:'dungeon',rooms:[{type:'boss',name:'王座'}]},boss:{name:'Boss',hp:400,phase:3,theme:'dark',skills:[{name:'暗弹',type:'projectile',damage:1,cooldown:70}]}}];}e.levelMgr=new A.LevelManager(lvls);e.mapSystem=new A.MapSystem(lvls[0]);e._applyLevel(e);},
_applyLevel:function(e){var diff=e.levelMgr.getDifficulty();e._spawnTimer=0;e._enemiesSpawned=0;e.enemyMgr.enemies=[];e._projectiles=[];e.player.hp=8;e._bossActive=false;e._bossDefeated=false;e.bossSystem=null;e._bossShield=null;e._onBossDefeated=null;e._levelSwitchLock=false;e._inBossFight=false;e.spawner.setEnemyCfg({speed:1.2+diff*0.6,spawnRate:35,size:18+diff*4,type:'spike',hp:1+Math.floor(diff/2)});e._noDefaultSpawn=true;},
onUpdate:function(e){
  if(e._flLevelComplete>0){e._flLevelComplete--;return;}
  if(e.levelMgr.isTransitioning()){e.levelMgr.update();return;}
  if(e.levelMgr.isComplete())return;
  if(e._bossDefeated)return;
  if(e._keysPressed&&e._keysPressed.a||e._keysPressed&&e._keysPressed.arrowleft){e.player.x-=(e.player.speed||3)*1.2;if(e.player.x<5)e.player.x=5;}
  if(e._keysPressed&&e._keysPressed.d||e._keysPressed&&e._keysPressed.arrowright){e.player.x+=(e.player.speed||3)*1.2;if(e.player.x>740)e.player.x=740;}
  // 火球 vs 小怪 + Boss(如果激活)
  var projs=e._projectiles||[];
  for(var pi=0;pi<projs.length;pi++){var proj=projs[pi];if(!proj.fromBoss&&proj.hp>0){proj.x+=proj.speed;if(proj.x>900){proj.hp=0;continue;}
    // 打小怪
    for(var ei=0;ei<e.enemyMgr.enemies.length;ei++){var en=e.enemyMgr.enemies[ei];if(en.hp>0&&A.hit(proj,en)){en.hp-=(proj.damage||25);proj.hp=0;e.particleSys.spawnHit(en.x+en.w/2,en.y+en.h/2,20);break;}}
    // 打Boss
    if(proj.hp>0&&e.bossSystem&&e.bossSystem.hp>0){try{if(A.hit(proj,{x:e.bossSystem.x,y:e.bossSystem.y,w:e.bossSystem.w,h:e.bossSystem.h})){e.bossSystem.takeDamage(proj.damage||25,e);proj.hp=0;}}catch(x){}}}}
  e._projectiles=projs.filter(function(x){return x.hp>0;});

  // ★ Boss战斗锁: 一旦进入Boss战,绝不允许nextLevel
  if(e._inBossFight){
    if(e.bossSystem&&e.bossSystem.hp<=0&&!e._bossDefeated){e._bossDefeated=true;try{if(e.rules)e.rules.onBossKilled();}catch(x){}e._win=true;e._noDefaultSpawn=true;e.enemyMgr.enemies=[];e._projectiles=[];A.setGameState(A.STATE.WIN);try{A.setStatus('Boss击败!','success');}catch(x){}}
    return;
  }

  var curr=e.levelMgr.getCurrent();var hasBoss=!!(curr&&curr.boss);
  if(!hasBoss){
    // 普通关
    var lim=e._enemiesPerLevel+(e.levelMgr.getDifficulty()-1)*2;
    e._spawnTimer++;if(e._spawnTimer%35===0&&e._enemiesSpawned<lim){e.enemyMgr.spawnGround(e.spawner.enemyCfg,e.groundY);e._enemiesSpawned++;}
    if(e._enemiesSpawned>=lim&&e.enemyMgr.enemies.filter(function(x){return x.hp>0;}).length===0&&!e._levelSwitchLock){
      e._levelSwitchLock=true;var nxt=e.levelMgr.nextLevel();if(nxt&&!e.levelMgr.isComplete()){
        e._projectiles=[];e.enemyMgr.enemies=[];e._enemiesSpawned=0;e._spawnTimer=0;e.player.hp=8;e._bossActive=false;e._bossDefeated=false;e.bossSystem=null;e._bossShield=null;e._onBossDefeated=null;e._noDefaultSpawn=true;e._inBossFight=false;
        var diff=e.levelMgr.getDifficulty();e.spawner.setEnemyCfg({speed:1.2+diff*0.6,spawnRate:35,size:18+diff*4,type:'spike',hp:1+Math.floor(diff/2)});e.mapSystem=new A.MapSystem(nxt);e._flLevelComplete=30;
        try{A.setStatus('进入 '+e.levelMgr.getLevelName(),'success');}catch(x){}}
      e._levelSwitchLock=false;
    }
  } else {
    // Boss关: 热身怪 → Boss激活 → Boss战
    if(!e._bossActive){
      e._spawnTimer++;if(e._spawnTimer%30===0&&e._enemiesSpawned<6){e.enemyMgr.spawnGround(e.spawner.enemyCfg,e.groundY);e._enemiesSpawned++;}
      if(e._enemiesSpawned>=6&&e.enemyMgr.enemies.filter(function(x){return x.hp>0;}).length===0){
        e.player.hp=8;e._bossActive=true;e._inBossFight=true;e._noDefaultSpawn=true;e._projectiles=[];
        var bc=curr.boss;if(!bc||!bc.name)bc={name:'亡灵法师',hp:400,phase:3,theme:'dark',skills:[{name:'亡魂弹',type:'projectile',damage:1,cooldown:70,speed:7},{name:'亡灵召唤',type:'summon',cooldown:200,count:2,summonHp:2}]};
        try{e.bossSystem=new A.BossSystem({boss:bc});}catch(x){return;}
        e.enemyMgr.enemies=[];e.spawner.setEnemyCfg({speed:0,spawnRate:9999,size:0,type:'spike',hp:999});
        try{A.setStatus(bc.name+' 登场! HP:'+e.bossSystem.maxHp,'error');}catch(x){}
      }
    }
  }
},
onRender:function(e){if(e.bossSystem&&e.bossSystem.hp>0)try{e.bossSystem.render(e.renderer.ctx,e);}catch(x){}if(e._flLevelComplete>0){e.renderer.ctx.fillStyle='rgba(0,0,0,0.4)';e.renderer.ctx.fillRect(0,0,800,400);e.renderer.ctx.font='bold 28px sans-serif';e.renderer.ctx.fillStyle='#00ff88';e.renderer.ctx.textAlign='center';e.renderer.ctx.fillText(e.levelMgr.getLevelName(),400,200);e.renderer.ctx.textAlign='left';}},
onAllKeys:function(){},
onPluginKey:function(e,k){
  if(!e.skillSystem)return;
  var ss=e.skillSystem;
  // 按名字查找技能, 不依赖数组顺序, 保证AI返回任何顺序都正确
  if(k==='j'||k==='q'||k==='1'){ss.use('fireball',e);}
  else if(k==='r'||k==='3'){ss.use('dash',e);}
  else if(k==='e'||k==='2'){ss.use('shield',e);}
},
getStatsText:function(e){var p=[];p.push(' 第'+(e.levelMgr?e.levelMgr.getLevelIndex()+1:1)+'/'+(e.levelMgr?e.levelMgr.getTotalLevels():1)+'关');if(e._inBossFight&&e.bossSystem&&e.bossSystem.hp>0)p.push(' BossHP:'+Math.ceil(e.bossSystem.hp));else if(e._inBossFight)p.push(' Boss已死');else p.push(' 敌:'+e.enemyMgr.enemies.length+'/'+(e._enemiesSpawned||0));return p.join('');},
getHint:function(){return'A/D=左右移动 空格=跳跃 J/Q=火球(25) R=闪现 E=护盾';}};})();
