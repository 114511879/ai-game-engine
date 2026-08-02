/**
 * main.js v10.0 — AI 聊天式游戏引擎
 *
 * 新增:
 *   - 聊天式交互界面
 *   - localStorage 记忆功能（对话历史 + 游戏存档）
 *   - 「完成」按钮：生成游戏 → 新标签页打开 → 本地存储
 *   - 历史对话可回溯、可修改
 */
(function(){
var A = window.AGE;
if(!A){console.error('AGE not loaded');return;}

// ════════════════════════════════════════
// 一、引擎初始化（隐藏 canvas，供导演/测试模式使用）
// ════════════════════════════════════════
A.PluginManager = {
  _list:[],
  register:function(p){this._list.push(p);},
  get:function(n){for(var i=0;i<this._list.length;i++)if(this._list[i].name===n)return this._list[i];return null;}
};
A.PluginManager.register(A.RunnerPlugin);
A.PluginManager.register(A.ShooterPlugin);
A.PluginManager.register(A.PlatformPlugin);
A.PluginManager.register(A.DungeonPlugin);
A.PluginManager.register(A.StoryPlugin);

var cv = document.getElementById('game');
var eng = new A.GameEngine(cv);
A._currentEngine = eng;

// ════════════════════════════════════════
// 二、记忆系统 — localStorage 管理
// ════════════════════════════════════════
var STORAGE_KEY = 'age_conversations_v10';

var Memory = {
  load: function(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){return [];}
  },
  save: function(convs){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
    }catch(e){console.error('存储失败',e);}
  },
  add: function(conv){
    var all = Memory.load();
    all.unshift(conv);
    Memory.save(all);
  },
  update: function(conv){
    var all = Memory.load();
    for(var i=0;i<all.length;i++){
      if(all[i].id === conv.id){all[i] = conv;break;}
    }
    Memory.save(all);
  },
  remove: function(id){
    var all = Memory.load();
    all = all.filter(function(c){return c.id !== id;});
    Memory.save(all);
  },
  clear: function(){
    localStorage.removeItem(STORAGE_KEY);
  },
  get: function(id){
    var all = Memory.load();
    for(var i=0;i<all.length;i++){
      if(all[i].id === id) return all[i];
    }
    return null;
  },
  // 存储游戏 DSL（供 game.html 读取）
  saveGame: function(convId, dsl){
    try{
      localStorage.setItem('age_game_'+convId, JSON.stringify(dsl));
    }catch(e){console.error('游戏存储失败',e);}
  },
  getGame: function(convId){
    try{
      var raw = localStorage.getItem('age_game_'+convId);
      return raw ? JSON.parse(raw) : null;
    }catch(e){return null;}
  }
};

// ════════════════════════════════════════
// 三、聊天 UI 管理
// ════════════════════════════════════════
var ChatUI = {
  currentConv: null,  // 当前对话 {id, title, prompt, dsl, messages}
  isGenerating: false,

  init: function(){
    ChatUI.bindEvents();
    ChatUI.renderHistory();
    ChatUI.showWelcome();
  },

  bindEvents: function(){
    // 提交按钮
    document.getElementById('btnSubmit').addEventListener('click', function(){
      ChatUI.submitPrompt('generate');
    });
    // 导演按钮
    document.getElementById('btnDirector').addEventListener('click', function(){
      ChatUI.submitPrompt('director');
    });
    // 测试按钮
    document.getElementById('btnGenTest').addEventListener('click', function(){
      ChatUI.submitPrompt('gentest');
    });
    // 新对话
    document.getElementById('btnNewChat').addEventListener('click', function(){
      ChatUI.newConversation();
    });
    // 清空
    document.getElementById('btnClearAll').addEventListener('click', function(){
      if(confirm('确定清空所有对话记录吗？此操作不可撤销。')){
        Memory.clear();
        ChatUI.renderHistory();
        ChatUI.newConversation();
      }
    });
    // 输入框
    var input = document.getElementById('prompt');
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        ChatUI.submitPrompt('generate');
      }
    });
    // 自动调整高度
    input.addEventListener('input', function(){
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
    // 建议芯片
    var chips = document.querySelectorAll('.chip');
    for(var i=0;i<chips.length;i++){
      chips[i].addEventListener('click', function(){
        document.getElementById('prompt').value = this.dataset.prompt;
        document.getElementById('prompt').focus();
      });
    }
    // 预设按钮
    var presets = document.querySelectorAll('[data-preset]');
    for(var j=0;j<presets.length;j++){
      presets[j].addEventListener('click', function(){
        ChatUI.loadPreset(this.dataset.preset);
      });
    }
    // 快捷键
    document.addEventListener('keydown', function(e){
      if(e.ctrlKey && e.shiftKey && e.key === 'K'){
        e.preventDefault();
        ChatUI.newConversation();
      }
    });
  },

  // 显示欢迎页
  showWelcome: function(){
    document.getElementById('welcomePage').style.display = 'flex';
    document.getElementById('messages').innerHTML = '';
    document.getElementById('convTitle').textContent = '新对话';
  },

  // 新对话
  newConversation: function(){
    ChatUI.currentConv = null;
    ChatUI.showWelcome();
    document.getElementById('prompt').value = '';
    document.getElementById('prompt').style.height = 'auto';
    ChatUI.renderHistory();
  },

  // 提交
  submitPrompt: async function(mode){
    if(ChatUI.isGenerating)return;
    var input = document.getElementById('prompt');
    var prompt = input.value.trim();
    if(!prompt){
      ChatUI.flashInput('请输入描述');
      return;
    }

    ChatUI.isGenerating = true;
    ChatUI.hideWelcome();

    // 添加用户消息
    ChatUI.addMessage('user', prompt);

    // 清空输入框
    input.value = '';
    input.style.height = 'auto';

    // 添加 AI 加载消息
    var loadingId = ChatUI.addLoadingMessage();

    // 确定标题
    var title = prompt.length > 20 ? prompt.substring(0,20)+'...' : prompt;

    // 如果没有当前对话，创建一个
    var isNewConv = false;
    if(!ChatUI.currentConv){
      isNewConv = true;
      ChatUI.currentConv = {
        id: 'conv_' + Date.now(),
        title: title,
        messages: [],
        dsl: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    ChatUI.currentConv.messages.push({role:'user', text:prompt});
    document.getElementById('convTitle').textContent = ChatUI.currentConv.title;

    try{
      var result;
      if(mode === 'director'){
        result = await ChatUI.runDirector(prompt);
      }else if(mode === 'gentest'){
        result = await ChatUI.runGenerateAndTest(prompt);
      }else{
        result = await ChatUI.runGenerate(prompt);
      }

      ChatUI.removeMessage(loadingId);

      if(result.success){
        // 保存 DSL
        ChatUI.currentConv.dsl = result.dsl;
        ChatUI.currentConv.messages.push({
          role:'ai',
          text:result.summary,
          dsl:result.dsl,
          gameType:result.gameType
        });
        ChatUI.currentConv.updatedAt = Date.now();

        // 存储到 localStorage
        if(isNewConv){
          Memory.add(ChatUI.currentConv);
        }else{
          Memory.update(ChatUI.currentConv);
        }
        Memory.saveGame(ChatUI.currentConv.id, result.dsl);

        // 显示 AI 消息 + 游戏卡片
        ChatUI.addGameCard(result);

        // 更新侧边栏
        ChatUI.renderHistory();
      }else{
        ChatUI.addMessage('ai', '❌ ' + (result.error || '生成失败'), 'error');
      }
    }catch(e){
      ChatUI.removeMessage(loadingId);
      ChatUI.addMessage('ai', '❌ 发生错误: ' + e.message, 'error');
    }

    ChatUI.isGenerating = false;
    ChatUI.scrollBottom();
  },

  // AI 生成
  runGenerate: async function(prompt){
    var raw = await A.callAI(prompt);
    if(!raw) return {success:false, error:'AI生成失败，请检查API Key'};
    var dsl = A.DSLBinder.bind(raw, prompt);
    var gt = ((dsl.meta||{}).game_type || 'runner');
    var title = ((dsl.meta||{}).title || '未命名游戏');
    return {
      success:true,
      dsl:dsl,
      gameType:gt,
      title:title,
      summary:'已为你生成「'+title+'」(' + ChatUI.gameTypeLabel(gt) + ')，点击下方按钮在新标签页打开游戏。'
    };
  },

  // 生成+测试
  runGenerateAndTest: async function(prompt){
    var raw = await A.callAI(prompt);
    if(!raw) return {success:false, error:'AI生成失败'};
    var dsl = A.DSLBinder.bind(raw, prompt);
    var gt = ((dsl.meta||{}).game_type || 'runner');
    var plugin = A.PluginSelector.select(gt, A.PluginManager);

    var bestDSL = dsl, bestScore = -1, bestRound = 0, totalFixes = 0;

    for(var round=0; round<3; round++){
      eng.playTester = null;
      eng.load(dsl, plugin);
      A.setGameState(A.STATE.RUNNING);
      var tester = new A.PlayTestSystem(eng);
      eng.playTester = tester;
      tester.start();
      var bugDet = new A.BugDetector(eng);
      bugDet.reset();

      ChatUI.updateLoading('轮次'+(round+1)+'/3 测试+找Bug...');

      await new Promise(function(resolve){
        var check = function(){
          if(bugDet)try{bugDet.update();}catch(x){}
          if(!tester._active || tester._done || eng.gameOver || eng._win || tester.frame >= tester.maxFrames){
            tester.stop();
            eng.playTester = null;
            resolve();
          }else setTimeout(check, 80);
        };
        check();
      });

      var fixes = bugDet.generateFixes();
      if(!tester._report) tester.generateReport();
      var r = tester._report;
      var score = (r.bossDamage||0) + (r.enemiesKilled||0)*10 - (r.deathCount||0)*50 - (r.totalDamage||0)*2;
      if(fixes.length > 0){
        dsl = bugDet.applyToDSL(dsl, fixes);
        totalFixes += fixes.length;
      }
      if(score > bestScore){
        bestScore = score;
        bestDSL = JSON.parse(JSON.stringify(dsl));
        bestRound = round + 1;
      }
      if(r.status !== '通过') dsl = A.DSLFixer.fix(dsl, r);
    }

    eng.playTester = null;
    var title = ((bestDSL.meta||{}).title || '未命名游戏');
    return {
      success:true,
      dsl:bestDSL,
      gameType:gt,
      title:title,
      summary:'🔬 3轮测试完成，最佳:轮'+bestRound+'，修复Bug:'+totalFixes+'个。已生成「'+title+'」，点击下方打开游戏。'
    };
  },

  // AI 导演
  runDirector: async function(prompt){
    var director = new A.GameDirector();
    director._statusCallback = function(msg, type){
      ChatUI.updateLoading(msg);
    };
    var result = await director.runDirectorLoop(prompt);
    if(!result.success) return {success:false, error:result.error || '导演失败'};

    return {
      success:true,
      dsl:result.dsl,
      gameType:result.gameType || 'runner',
      title:((result.dsl.meta||{}).title || '未命名游戏'),
      summary:'🧠 导演完成 | 评分:'+result.score+' | 优化'+result.totalOptimizations+'次。点击下方打开游戏。'
    };
  },

  // 加载预设
  loadPreset: function(type){
    var plugin = A.PluginManager.get(type);
    if(!plugin || !plugin.preset) return;
    var dsl = A.DSLBinder.bind(plugin.preset, '');

    // 创建对话
    ChatUI.currentConv = {
      id: 'conv_' + Date.now(),
      title: plugin.label + '预设',
      messages: [],
      dsl: dsl,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    ChatUI.hideWelcome();
    ChatUI.addMessage('user', '加载' + plugin.label + '预设');
    ChatUI.currentConv.messages.push({role:'user', text:'加载'+plugin.label+'预设'});

    var title = ((dsl.meta||{}).title || plugin.label);
    ChatUI.currentConv.messages.push({
      role:'ai',
      text:'已加载'+plugin.label+'预设「'+title+'」，点击下方打开游戏。',
      dsl:dsl,
      gameType:type
    });

    Memory.add(ChatUI.currentConv);
    Memory.saveGame(ChatUI.currentConv.id, dsl);

    ChatUI.addGameCard({
      dsl:dsl,
      gameType:type,
      title:title,
      summary:'已加载'+plugin.label+'预设「'+title+'」，点击下方打开游戏。'
    });
    ChatUI.renderHistory();
    document.getElementById('convTitle').textContent = ChatUI.currentConv.title;
    ChatUI.scrollBottom();
  },

  // 加载历史对话
  loadConversation: function(convId){
    var conv = Memory.get(convId);
    if(!conv) return;
    ChatUI.currentConv = conv;
    ChatUI.hideWelcome();
    document.getElementById('messages').innerHTML = '';
    document.getElementById('convTitle').textContent = conv.title;

    // 渲染历史消息
    for(var i=0;i<conv.messages.length;i++){
      var msg = conv.messages[i];
      if(msg.role === 'user'){
        ChatUI.addMessage('user', msg.text);
      }else{
        // AI 消息，如果有 dsl 则显示游戏卡片
        if(msg.dsl){
          ChatUI.addGameCard({
            dsl:msg.dsl,
            gameType:msg.gameType || 'runner',
            title:((msg.dsl.meta||{}).title || '未命名游戏'),
            summary:msg.text
          });
        }else{
          ChatUI.addMessage('ai', msg.text);
        }
      }
    }
    ChatUI.renderHistory();
    ChatUI.scrollBottom();
  },

  // ═══ UI 辅助方法 ═══
  hideWelcome: function(){
    var w = document.getElementById('welcomePage');
    if(w) w.style.display = 'none';
  },

  flashInput: function(msg){
    var input = document.getElementById('prompt');
    input.placeholder = msg;
    input.focus();
    setTimeout(function(){
      input.placeholder = '描述你想玩的游戏...';
    }, 2000);
  },

  addMessage: function(role, text, statusClass){
    var messages = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg msg-' + role;
    var avatar = role === 'user' ? '👤' : '🤖';
    var name = role === 'user' ? '你' : 'AI';
    div.innerHTML =
      '<div class="msg-avatar">'+avatar+'</div>' +
      '<div class="msg-body">' +
        '<div class="msg-role">'+name+'</div>' +
        '<div class="msg-text '+ (statusClass||'') +'">'+ChatUI.escape(text)+'</div>' +
      '</div>';
    messages.appendChild(div);
    ChatUI.scrollBottom();
    return div;
  },

  addLoadingMessage: function(){
    var messages = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg msg-ai';
    div.id = 'loading_msg';
    div.innerHTML =
      '<div class="msg-avatar">🤖</div>' +
      '<div class="msg-body">' +
        '<div class="msg-role">AI</div>' +
        '<div class="msg-text"><div class="msg-loading"><span></span><span></span><span></span></div></div>' +
        '<div class="msg-status" id="loading_status">AI生成中...</div>' +
      '</div>';
    messages.appendChild(div);
    ChatUI.scrollBottom();
    return 'loading_msg';
  },

  updateLoading: function(msg){
    var el = document.getElementById('loading_status');
    if(el) el.textContent = msg;
  },

  removeMessage: function(id){
    var el = document.getElementById(id);
    if(el) el.remove();
  },

  addGameCard: function(result){
    var messages = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg msg-ai';
    var gt = result.gameType || 'runner';
    var title = result.title || '未命名游戏';
    var dsl = result.dsl || {};
    var player = dsl.player || {};
    var world = dsl.world || {};
    var levels = dsl.levels ? dsl.levels.length + '关' : '无限';

    div.innerHTML =
      '<div class="msg-avatar">🤖</div>' +
      '<div class="msg-body">' +
        '<div class="msg-role">AI</div>' +
        '<div class="msg-text">'+ChatUI.escape(result.summary)+'</div>' +
        '<div class="game-card">' +
          '<div class="game-card-title">🎮 '+ChatUI.escape(title)+'</div>' +
          '<div class="game-card-info">' +
            '<span>类型: '+ChatUI.gameTypeLabel(gt)+'</span>' +
            '<span>HP: '+(player.hp||3)+'</span>' +
            '<span>关卡: '+levels+'</span>' +
            '<span>主题: '+(world.theme||'default')+'</span>' +
          '</div>' +
          '<a class="game-card-btn" href="game.html?id='+ChatUI.currentConv.id+'" target="_blank" rel="noopener">' +
            '▶ 在新标签页打开游戏' +
          '</a>' +
        '</div>' +
      '</div>';
    messages.appendChild(div);
    ChatUI.scrollBottom();
  },

  gameTypeLabel: function(gt){
    var labels = {
      runner:'跑酷', shooter:'射击', platformer:'平台',
      dungeon:'地牢', story:'文字冒险', rpg:'RPG',
      strategy:'策略', tower_defense:'塔防', card:'卡牌',
      simulation:'模拟', sandbox:'沙盒', racing:'竞速'
    };
    return labels[gt] || gt;
  },

  escape: function(text){
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  scrollBottom: function(){
    var area = document.getElementById('chatArea');
    if(area) area.scrollTop = area.scrollHeight;
  },

  // 渲染侧边栏历史
  renderHistory: function(){
    var list = document.getElementById('historyList');
    var all = Memory.load();
    if(all.length === 0){
      list.innerHTML = '<div class="history-empty">暂无对话记录</div>';
      return;
    }
    var html = '';
    var currentId = ChatUI.currentConv ? ChatUI.currentConv.id : '';
    for(var i=0;i<all.length;i++){
      var conv = all[i];
      var active = conv.id === currentId ? ' active' : '';
      var icon = conv.dsl ? ChatUI.gameTypeIcon(((conv.dsl.meta||{}).game_type)||'runner') : '💬';
      html +=
        '<div class="history-item'+active+'" data-id="'+conv.id+'">' +
          '<span class="h-icon">'+icon+'</span>' +
          '<span class="h-text">'+ChatUI.escape(conv.title)+'</span>' +
          '<span class="h-del" data-id="'+conv.id+'">✕</span>' +
        '</div>';
    }
    list.innerHTML = html;

    // 绑定点击事件
    var items = list.querySelectorAll('.history-item');
    for(var j=0;j<items.length;j++){
      items[j].addEventListener('click', function(e){
        if(e.target.classList.contains('h-del')){
          e.stopPropagation();
          var id = e.target.dataset.id;
          Memory.remove(id);
          if(ChatUI.currentConv && ChatUI.currentConv.id === id){
            ChatUI.newConversation();
          }
          ChatUI.renderHistory();
        }else{
          ChatUI.loadConversation(this.dataset.id);
        }
      });
    }
  },

  gameTypeIcon: function(gt){
    var icons = {
      runner:'🏃', shooter:'🔫', platformer:'📦',
      dungeon:'👑', story:'📖', rpg:'⚔️',
      strategy:'🗺️', tower_defense:'🏰', card:'🃏',
      simulation:'🏙️', sandbox:'🧱', racing:'🏎️'
    };
    return icons[gt] || '🎮';
  }
};

// ════════════════════════════════════════
// 四、全局方法
// ════════════════════════════════════════
window.openGame = function(convId){
  window.open('game.html?id='+convId, '_blank');
};

// 初始化
ChatUI.init();

// 游戏循环（供导演/测试模式使用）
function loop(){
  eng.update();
  eng.render();
  requestAnimationFrame(loop);
}
loop();

// 暴露到全局供调试
window.ChatUI = ChatUI;
window.Memory = Memory;

})();
