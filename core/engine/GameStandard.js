/**
 * GameStandard.js v1.0 — 12 大类型 + 通用 DSL Schema + 验证
 *
 * 12 Game Types:
 *   runner    / shooter / platformer / dungeon / rpg / story
 *   strategy  / tower_defense / card / simulation / sandbox / racing
 *
 * 通用 DSL (所有游戏共有的 Base) + 各类型的 Extension
 */
(function(){var A=window.AGE;

// ── 12 大类型定义 ──
A.GAME_TYPES={
  runner:{label:'跑酷',icon:'🏃',camera:'side_scroll',
    base:{controls:{move:true,jump:true}},
    extension:{obstacles:{type:'array',default:[{type:'wall'},{type:'trap'}]},trackHeight:{type:'number',default:30}}
  },
  shooter:{label:'射击',icon:'🔫',camera:'top_down',
    base:{controls:{move:true,jump:true,shoot:true}},
    extension:{weaponType:{type:'string',default:'pistol'},ammo:{type:'number',default:100}}
  },
  platformer:{label:'平台',icon:'📦',camera:'side_scroll',
    base:{controls:{move:true,jump:true}},
    extension:{platforms:{type:'array',default:[]},doubleJump:{type:'boolean',default:true}}
  },
  dungeon:{label:'地牢Boss',icon:'👑',camera:'side_scroll',
    base:{controls:{move:true,jump:true,skills:true}},
    extension:{bossRequired:{type:'boolean',default:true},multiLevel:{type:'boolean',default:true}}
  },
  rpg:{label:'RPG',icon:'⚔️',camera:'top_down',
    base:{controls:{move:true,attack:true,inventory:true}},
    extension:{expSystem:{type:'boolean',default:true},equipment:{type:'boolean',default:true},dialog:{type:'boolean',default:true}}
  },
  story:{label:'文字冒险',icon:'📖',camera:'none',
    base:{controls:{choice:true}},
    extension:{era:{type:'string',default:'fantasy'},choices:{type:'array',default:[]}}
  },
  strategy:{label:'策略',icon:'🗺️',camera:'top_down',
    base:{controls:{select:true,order:true}},
    extension:{resources:{type:'array',default:['gold','wood']},factions:{type:'array',default:[]}}
  },
  tower_defense:{label:'塔防',icon:'🏰',camera:'top_down',
    base:{controls:{place:true,upgrade:true}},
    extension:{waves:{type:'number',default:10},path:{type:'array',default:[]}}
  },
  card:{label:'卡牌',icon:'🃏',camera:'none',
    base:{controls:{play:true,draw:true}},
    extension:{deckSize:{type:'number',default:30},handSize:{type:'number',default:5}}
  },
  simulation:{label:'模拟',icon:'🏙️',camera:'top_down',
    base:{controls:{build:true,manage:true}},
    extension:{population:{type:'number',default:100},timeScale:{type:'number',default:1}}
  },
  sandbox:{label:'沙盒',icon:'🧱',camera:'free',
    base:{controls:{place:true,break:true}},
    extension:{worldSize:{type:'number',default:64},materials:{type:'array',default:['stone','wood']}}
  },
  racing:{label:'竞速',icon:'🏎️',camera:'third_person',
    base:{controls:{accelerate:true,steer:true}},
    extension:{laps:{type:'number',default:3},opponents:{type:'number',default:3}}
  }
};

// ── 通用 DSL 结构 (所有类型共有) ──
A.UNIVERSAL_DSL_BASE={
  meta:{required:['game_type','title']},
  player:{required:['hp'],optional:['speed','jump_power','size','mana']},
  world:{optional:['theme','time','weather','size','gravity','scroll_speed','ground_y']},
  rules:{required:['win_condition'],optional:['win_value','fail_condition']},
  entities:{optional:['enemies','boss','npcs','items','powerups']},
  skills:{optional:[]},  // array of {name,type[attack|defense|heal|buff|movement],damage,cooldown}
  map:{optional:['type','rooms']},
  levels:{optional:[{id:true,difficulty:true,name:true,map:true,boss:true}]},
  assets:{optional:['characters','environments','effects','weapons']},
  events:{optional:[]} // array of {type[dialog|battle|treasure|ambush],description}
};

// ── DSL 验证器 ──
A.DSLValidator={
  validate:function(dsl){
    var errors=[],warnings=[];
    if(!dsl||typeof dsl!=='object'){errors.push('DSL为空或非对象');return{valid:false,errors:errors,warnings:warnings};}
    // 1. meta 检查
    var meta=dsl.meta||{};var gt=meta.game_type||'';
    if(!gt){errors.push('缺少 meta.game_type');return{valid:false,errors:errors,warnings:warnings};}
    if(typeof gt==='string')gt=[gt];
    for(var i=0;i<gt.length;i++){if(!A.GAME_TYPES[gt[i]])errors.push('未知游戏类型: '+gt[i]);}
    if(!meta.title)warnings.push('缺少 meta.title, 将使用默认标题');
    // 2. player 检查
    var player=dsl.player||{};if(typeof player.hp!=='number'||player.hp<=0)errors.push('player.hp 必须>0');
    // 3. rules 检查
    var rules=dsl.rules||{};if(!rules.win_condition)errors.push('缺少 rules.win_condition');
    // 4. entities 检查
    if(dsl.entities){
      if(dsl.entities.enemies&&!Array.isArray(dsl.entities.enemies))warnings.push('entities.enemies 应为数组');
      if(dsl.entities.boss){var b=dsl.entities.boss;if(!b.name)warnings.push('boss缺少name');if(!b.hp)warnings.push('boss缺少hp');}
    }
    // 5. levels 检查 (dungeon必需)
    if(gt.indexOf('dungeon')>=0||gt[0]==='dungeon'){
      if(!dsl.levels||!dsl.levels.length)errors.push('dungeon类型必须提供 levels 数组(至少3关)');
      if(dsl.levels&&dsl.levels.length<2)warnings.push('建议 levels 至少3关');
      // 检查最后一关是否有boss
      if(dsl.levels&&dsl.levels.length>0){
        var last=dsl.levels[dsl.levels.length-1];
        if(!last.boss&&!dsl.entities||!dsl.entities.boss)warnings.push('最后一关缺少boss');
      }
    }
    // 6. skills 检查
    if(dsl.skills&&Array.isArray(dsl.skills)){
      for(var j=0;j<dsl.skills.length;j++){
        var sk=dsl.skills[j];if(!sk.name)warnings.push('skills['+j+']缺少name');
      }
    }
    if(errors.length===0)dsl._valid=true;else dsl._valid=false;
    return{valid:errors.length===0,errors:errors,warnings:warnings};
  },

  /** 根据game_type自动注入默认值 */
  applyDefaults:function(dsl){
    var r=JSON.parse(JSON.stringify(dsl));
    var meta=r.meta||{};var gt=meta.game_type||'runner';
    if(!r.player)r.player={};
    if(!r.player.hp)r.player.hp=gt==='dungeon'?8:3;
    if(!r.player.speed)r.player.speed=3;
    if(!r.rules)r.rules={};
    if(!r.rules.win_condition){
      if(gt==='dungeon')r.rules.win_condition='boss_kill';
      else if(gt==='shooter')r.rules.win_condition='kill_count';
      else r.rules.win_condition='survive_time';
    }
    if(!r.rules.win_value)r.rules.win_value=gt==='dungeon'?1:60;
    if(!r.world)r.world={};
    if(!r.world.gravity)r.world.gravity=1.0;
    if(!r.world.ground_y)r.world.ground_y=330;
    // 注入默认 assets
    if(!r.assets)r.assets={};
    if(!r.assets.characters)r.assets.characters=A.DEFAULTS.assets.characters.slice();
    if(!r.assets.environments)r.assets.environments=A.DEFAULTS.assets.environments.slice();
    if(!r.assets.effects)r.assets.effects=A.DEFAULTS.assets.effects.slice();
    return r;
  }
};

})();
