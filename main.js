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
A.PluginManager.register(A.RPGPlugin);
A.PluginManager.register(A.StrategyPlugin);
A.PluginManager.register(A.TowerDefensePlugin);
A.PluginManager.register(A.CardPlugin);
A.PluginManager.register(A.SimulationPlugin);
A.PluginManager.register(A.SandboxPlugin);
A.PluginManager.register(A.RacingPlugin);

var cv = document.getElementById('game');
var eng = new A.GameEngine(cv);
A._currentEngine = eng;

// ════════════════════════════════════════
// 二、记忆系统 — localStorage 管理
// ════════════════════════════════════════
var STORAGE_KEY = 'age_conversations_v10';
var preferenceMemory = new A.PlayerPreferenceMemory(localStorage);

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
    var found = false;
    for(var i=0;i<all.length;i++){
      if(all[i].id === conv.id){all[i] = conv;found = true;break;}
    }
    if(!found)all.unshift(conv);
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
  },
  rememberIntent: function(intent){return preferenceMemory.remember(intent);},
  preferenceContext: function(){return preferenceMemory.context(6);},
  preferenceItems: function(){return preferenceMemory.all();},
  preferenceCount: function(){return preferenceMemory.count();},
  removePreference: function(category,value){return preferenceMemory.remove(category,value);},
  clearPreferences: function(){preferenceMemory.clear();},
  preferenceLabel: function(value){return preferenceMemory.label(value);}
};

// ════════════════════════════════════════
// 三、聊天 UI 管理
// ════════════════════════════════════════
var ChatUI = {
  currentConv: null,  // 当前对话 {id, title, prompt, dsl, messages}
  isGenerating: false,
  consultant: null,
  pendingMode: 'generate',
  pendingPrompt: '',
  evolutionAbortController: null,

  init: function(){
    ChatUI.bindEvents();
    ChatUI.renderHistory();
    ChatUI.renderMemoryBadge();
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
    document.getElementById('btnEvolution').addEventListener('click', function(){
      ChatUI.submitPrompt('evolution');
    });
    document.getElementById('btnStopEvolution').addEventListener('click', function(){
      ChatUI.stopEvolution();
    });
    document.getElementById('btnConsultantSkip').addEventListener('click', function(){
      ChatUI.finishConsultation(true);
    });
    document.getElementById('btnConsultantConfirm').addEventListener('click', function(){
      ChatUI.finishConsultation(false);
    });
    document.getElementById('btnApplyMemory').addEventListener('click', function(){
      ChatUI.applyPreferenceMemory();
    });
    document.getElementById('btnMemory').addEventListener('click', function(){
      ChatUI.openMemoryDialog();
    });
    document.getElementById('btnMemoryClose').addEventListener('click', function(){
      document.getElementById('memoryDialog').close();
    });
    document.getElementById('btnMemoryClear').addEventListener('click', function(){
      if(confirm('只清空玩家偏好记忆？聊天记录和游戏不会受影响。')){
        Memory.clearPreferences();
        ChatUI.renderMemoryDialog();
        ChatUI.renderMemoryBadge();
        ChatUI.refreshConsultantMemory();
      }
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
    var presetSelect=document.getElementById('presetSelect');
    if(presetSelect)presetSelect.addEventListener('change',function(){
      if(this.value){var type=this.value;this.value='';ChatUI.startTypeConsultation(type);}
    });
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
    ChatUI.hideConsultant();
    ChatUI.hideResearch();
    ChatUI.hideEvolutionPanel();
    document.getElementById('welcomePage').style.display = 'flex';
    document.getElementById('messages').innerHTML = '';
    document.getElementById('convTitle').textContent = '新对话';
  },

  // 新对话
  newConversation: function(){
    if(ChatUI.evolutionAbortController&&!ChatUI.evolutionAbortController.signal.aborted){
      ChatUI.evolutionAbortController.abort();
    }
    ChatUI.evolutionAbortController=null;
    ChatUI.currentConv = null;
    ChatUI.consultant = null;
    ChatUI.pendingMode = 'generate';
    ChatUI.pendingPrompt = '';
    ChatUI.hideConsultant();
    ChatUI.hideEvolutionPanel();
    ChatUI.showWelcome();
    document.getElementById('prompt').value = '';
    document.getElementById('prompt').style.height = 'auto';
    ChatUI.renderHistory();
  },

  startTypeConsultation: function(type){
    var canonical=type==='platform'?'platformer':type;
    var label=ChatUI.gameTypeLabel(canonical);
    ChatUI.newConversation();
    var input=document.getElementById('prompt');
    input.value='制作一个'+label+'游戏';
    ChatUI.submitPrompt('generate',{seedIntent:{game_type:canonical}});
  },

  // 提交
  submitPrompt: async function(mode,options){
    options=options||{};
    if(ChatUI.isGenerating)return;
    var input = document.getElementById('prompt');
    var prompt = input.value.trim();
    if(!prompt){
      ChatUI.flashInput('请输入描述');
      return;
    }

    var activePanel=document.getElementById('consultantPanel');
    if(ChatUI.consultant&&activePanel&&activePanel.style.display!=='none'){
      input.value='';
      input.style.height='auto';
      ChatUI.submitConsultantAnswer(prompt,prompt);
      return;
    }

    ChatUI.isGenerating = true;
    ChatUI.hideWelcome();
    ChatUI.hideResearch();

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
    if(!ChatUI.currentConv){
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
      ChatUI.pendingMode = mode || 'generate';
      ChatUI.pendingPrompt = prompt;
      ChatUI.consultant = new A.GameConsultant({memory:Memory.preferenceContext(),seedIntent:options.seedIntent||null});
      ChatUI.updateLoading('游戏顾问正在理解需求...');
      var state = await ChatUI.consultant.begin(prompt);
      ChatUI.removeMessage(loadingId);
      ChatUI.currentConv.intentDraft = ChatUI.consultant.state;
      ChatUI.currentConv.pendingMode = ChatUI.pendingMode;
      ChatUI.currentConv.seedIntent = options.seedIntent||null;
      ChatUI.currentConv.updatedAt = Date.now();
      var consultantText = state.ready ? '我已经整理好游戏意图，请确认后再生成。' : state.question.text;
      ChatUI.currentConv.messages.push({role:'ai', text:consultantText, consultant:true});
      ChatUI.addMessage('ai', consultantText);
      Memory.update(ChatUI.currentConv);
      ChatUI.renderConsultant(state);
      ChatUI.renderHistory();
    }catch(e){
      ChatUI.removeMessage(loadingId);
      ChatUI.addMessage('ai', '顾问启动失败: ' + e.message, 'error');
    }

    ChatUI.isGenerating = false;
    ChatUI.scrollBottom();
  },

  submitConsultantAnswer: async function(value,label){
    if(ChatUI.isGenerating||!ChatUI.consultant)return;
    ChatUI.isGenerating=true;
    ChatUI.addMessage('user',label||value);
    ChatUI.currentConv.messages.push({role:'user',text:label||value,consultantAnswer:true});
    var loadingId=ChatUI.addLoadingMessage();
    ChatUI.updateLoading('顾问正在更新游戏意图...');
    try{
      var state=await ChatUI.consultant.answer(value);
      ChatUI.removeMessage(loadingId);
      ChatUI.currentConv.intentDraft=ChatUI.consultant.state;
      ChatUI.currentConv.updatedAt=Date.now();
      var text=state.ready?'需求已经足够完整，请检查设计摘要。':state.question.text;
      ChatUI.currentConv.messages.push({role:'ai',text:text,consultant:true});
      ChatUI.addMessage('ai',text);
      Memory.update(ChatUI.currentConv);
      ChatUI.renderConsultant(state);
    }catch(e){
      ChatUI.removeMessage(loadingId);
      ChatUI.addMessage('ai','顾问处理失败: '+e.message,'error');
    }
    ChatUI.isGenerating=false;
  },

  renderConsultant: function(state){
    var panel=document.getElementById('consultantPanel');
    if(!panel||!state)return;
    panel.style.display='block';
    document.getElementById('consultantStatus').textContent=state.ready?'等待确认':'需求澄清 '+(state.questionCount+1)+'/'+4;
    document.getElementById('consultantQuestion').textContent=state.ready?'这份设计是否符合你的想法？':state.question.text;
    document.getElementById('consultantIntent').textContent=ChatUI.intentSummary(state.intent);
    var memoryBox=document.getElementById('consultantMemory');
    var memoryText=document.getElementById('consultantMemoryText');
    var suggestions=state.memorySuggestions||[];
    memoryBox.style.display=suggestions.length&&!state.memoryApplied?'flex':'none';
    if(suggestions.length){
      var memoryParts=[];
      for(var mi=0;mi<suggestions.length;mi++)memoryParts.push(suggestions[mi].categoryLabel+' '+suggestions[mi].valueLabel);
      memoryText.textContent='根据过去的确认：'+memoryParts.join('、');
    }
    var options=document.getElementById('consultantOptions');
    options.innerHTML='';
    if(!state.ready&&state.question&&state.question.choices){
      for(var i=0;i<state.question.choices.length;i++){
        var choice=state.question.choices[i];
        var btn=document.createElement('button');
        btn.className='consultant-choice';
        btn.textContent=choice.label;
        btn.dataset.value=choice.value;
        btn.dataset.label=choice.label;
        btn.addEventListener('click',function(){ChatUI.submitConsultantAnswer(this.dataset.value,this.dataset.label);});
        options.appendChild(btn);
      }
    }
    var confirmBtn=document.getElementById('btnConsultantConfirm');
    confirmBtn.disabled=!state.ready;
    confirmBtn.style.display=state.ready?'inline-flex':'none';
    ChatUI.scrollBottom();
  },

  hideConsultant: function(){
    var panel=document.getElementById('consultantPanel');
    if(panel)panel.style.display='none';
  },

  applyPreferenceMemory: function(){
    if(ChatUI.isGenerating||!ChatUI.consultant)return;
    var state=ChatUI.consultant.applyMemory();
    if(!state)return;
    ChatUI.currentConv.intentDraft=ChatUI.consultant.state;
    ChatUI.currentConv.messages.push({role:'ai',text:'已把历史偏好填入缺失项，本次回答仍然优先。',consultant:true});
    ChatUI.addMessage('ai','已把历史偏好填入缺失项，本次回答仍然优先。');
    Memory.update(ChatUI.currentConv);
    ChatUI.renderConsultant(state);
  },

  intentSummary: function(intent){
    intent=intent||{};
    var labels={
      action_rpg:'动作RPG',horror:'恐怖游戏',puzzle:'解谜',runner:'跑酷',shooter:'射击',story:'剧情冒险',rpg:'角色扮演',strategy:'策略',tower_defense:'塔防',card:'卡牌',simulation:'模拟经营',sandbox:'沙盒',racing:'竞速',
      souls_like:'魂系战斗',power_fantasy:'爽快战斗',combo:'技能连招',turn_strategy:'策略回合',survival_action:'追逐生存',escape_puzzle:'逃脱解谜',
      easy:'轻松',normal:'标准',medium:'标准',hard:'高难',
      dark_chinese_myth:'黑暗中国神话',sci_fi:'科幻未来',western_fantasy:'西方魔幻',modern_horror:'现代恐怖',default:'默认世界',custom:'自定义世界',
      first_person:'第一人称',third_person:'第三人称',top_down:'上帝视角',side_scroll:'横版视角'
    };
    var detailLabels={speed:'高速冲刺',precision:'精准操作',collection:'收集成长',survival:'生存挑战',bullet_hell:'弹幕躲避',arena:'竞技场',tactical:'战术玩法',exploration:'探索',puzzle:'解谜',boss:'Boss挑战',loot:'装备掉落',branching:'多分支',mystery:'悬疑推理',history:'历史改写',relationships:'角色关系',level:'等级升级',equipment:'装备收集',skills:'技能树',story:'剧情选择',real_time:'实时调度',turn_based:'回合战棋',economy:'资源运营',conquest:'领土占领',single_path:'单线路径',multi_lane:'多路防守',maze:'自由迷宫',escort:'护送目标',deck_building:'局外组牌',fixed_deck:'固定牌组',roguelike:'肉鸽构筑',combo:'连锁组合',city:'城市发展',farm:'农场经营',company:'公司管理',building:'自由建造',creation:'机关创作',arcade:'街机竞速',simulation:'拟真驾驶',obstacle:'障碍竞速',time_trial:'计时挑战'};
    for(var detailKey in detailLabels)if(detailLabels.hasOwnProperty(detailKey))labels[detailKey]=detailLabels[detailKey];
    function label(value){return labels[value]||value;}
    var parts=[];
    if(intent.game_type)parts.push('类型 '+label(intent.game_type));
    if(intent.combat&&intent.combat.style)parts.push('战斗 '+label(intent.combat.style));
    if(intent.combat&&intent.combat.difficulty)parts.push('难度 '+label(intent.combat.difficulty));
    if(intent.theme&&intent.theme.world)parts.push('世界 '+label(intent.theme.world));
    if(intent.camera&&intent.camera.view)parts.push('视角 '+label(intent.camera.view));
    if(intent.details)for(var detail in intent.details)if(intent.details.hasOwnProperty(detail)){parts.push('玩法 '+label(intent.details[detail]));break;}
    if(intent.combat&&intent.combat.boss_focus)parts.push('Boss重点');
    return parts.join(' · ');
  },

  finishConsultation: function(skip){
    if(ChatUI.isGenerating||!ChatUI.consultant)return;
    var state=skip?ChatUI.consultant.skip():ChatUI.consultant.confirm();
    if(!state||(!skip&&!state.ready))return;
    ChatUI.hideConsultant();
    ChatUI.hideResearch();
    ChatUI.currentConv.intent=state.intent;
    ChatUI.currentConv.intentDraft=null;
    ChatUI.currentConv.messages.push({role:'ai',text:'设计已确认：'+ChatUI.intentSummary(state.intent),intent:state.intent});
    ChatUI.addMessage('ai','设计已确认：'+ChatUI.intentSummary(state.intent));
    if(!skip){
      Memory.rememberIntent(state.intent);
      ChatUI.renderMemoryBadge();
    }
    Memory.update(ChatUI.currentConv);
    ChatUI.researchAndGenerate(state.intent);
  },

  researchAndGenerate: async function(intent){
    if(ChatUI.isGenerating)return;
    ChatUI.isGenerating=true;
    var panel=document.getElementById('researchPanel');
    if(panel)panel.style.display='block';
    var status=document.getElementById('researchStatus');
    if(status)status.textContent='正在检查本地知识，必要时联网...';
    try{
      var result=await A.RAGClient.retrieve(ChatUI.pendingPrompt,intent);
      if(result&&result.available!==false){
        intent.research={plan:result.plan,documents:result.documents,coverage:result.coverage,limitations:(result.plan&&result.plan.limitations)||[],context_text:result.context_text||'',web_sources:result.web_sources||[],source_counts:result.source_counts||{}};
        ChatUI.currentConv.ragContext=result;
        ChatUI.renderResearch(result);
      }else{
        ChatUI.renderResearch({available:false,error:(result&&result.error)||'本地RAG服务未启动'});
      }
      ChatUI.currentConv.intent=intent;
      Memory.update(ChatUI.currentConv);
    }catch(e){
      ChatUI.renderResearch({available:false,error:e.message});
    }
    ChatUI.isGenerating=false;
    ChatUI.generateFromIntent(intent);
  },

  renderResearch: function(result){
    var panel=document.getElementById('researchPanel'),qEl=document.getElementById('researchQueries'),dEl=document.getElementById('researchDocuments'),lEl=document.getElementById('researchLimits'),wEl=document.getElementById('researchWebStatus');
    if(!panel)return;
    panel.style.display='block';qEl.innerHTML='';dEl.innerHTML='';lEl.innerHTML='';if(wEl)wEl.innerHTML='';
    var status=document.getElementById('researchStatus');
    if(result.available===false){status.textContent='离线模式';lEl.textContent='本地RAG未连接：'+(result.error||'将继续使用当前 Intent DSL 生成');return;}
    var counts=result.source_counts||{};
    status.textContent='命中 '+(result.documents||[]).length+' 条 · 覆盖度 '+Math.round((result.coverage||0)*100)+'% · 本地 '+(counts.local||0)+' / 联网 '+(counts.web||0);
    if(wEl){
      if(result.web_search_used)wEl.textContent='本地知识不足，已联网检索 '+(result.web_sources||[]).length+' 个来源。';
      else if(result.web_search_needed)wEl.textContent='本地知识不足，联网搜索未获得可用结果，已使用本地结果继续生成。';
      else wEl.textContent='本地知识覆盖充足，无需联网。';
    }
    var queries=(result.plan&&result.plan.rewritten_queries)||[];
    for(var i=0;i<queries.length;i++){var q=document.createElement('span');q.className='research-query';q.textContent=queries[i];qEl.appendChild(q);}
    var docs=result.documents||[];
    for(var j=0;j<docs.length;j++){
      var item=docs[j],row=document.createElement('div');row.className='research-document';
      row.innerHTML='<span class="research-document-title">'+ChatUI.escape(item.title||'未命名知识')+'</span><span class="research-document-score">'+Math.round((item.score||0)*100)+'%</span><span class="research-document-type">'+ChatUI.escape((item.metadata&&item.metadata.type)||'knowledge')+'</span>';
      var sourceUrl=item.metadata&&item.metadata.url;
      if(sourceUrl&&/^https?:\/\//i.test(sourceUrl)){
        var sourceLink=document.createElement('a');sourceLink.className='research-document-source';sourceLink.href=sourceUrl;sourceLink.target='_blank';sourceLink.rel='noopener noreferrer';sourceLink.textContent='查看网页来源';row.appendChild(sourceLink);
      }
      dEl.appendChild(row);
    }
    var limits=(result.plan&&result.plan.limitations)||[];
    if(limits.length)lEl.textContent='引擎限制：'+limits.join('；');
  },

  hideResearch: function(){var panel=document.getElementById('researchPanel');if(panel)panel.style.display='none';},

  generateFromIntent: async function(intent){
    if(ChatUI.isGenerating)return;
    ChatUI.isGenerating=true;
    var loadingId=ChatUI.addLoadingMessage();
    ChatUI.updateLoading('Intent DSL已确认，开始生成游戏...');
    try{
      var result;
      if(ChatUI.pendingMode==='director')result=await ChatUI.runDirector(ChatUI.pendingPrompt,intent);
      else if(ChatUI.pendingMode==='gentest')result=await ChatUI.runGenerateAndTest(ChatUI.pendingPrompt,intent);
      else if(ChatUI.pendingMode==='evolution')result=await ChatUI.runEvolutionMode(ChatUI.pendingPrompt,intent);
      else result=await ChatUI.runGenerate(ChatUI.pendingPrompt,intent);
      ChatUI.removeMessage(loadingId);
      if(result.success){
        ChatUI.currentConv.dsl=result.dsl;
        ChatUI.currentConv.intent=intent;
        ChatUI.currentConv.messages.push({role:'ai',text:result.summary,dsl:result.dsl,gameType:result.gameType});
        ChatUI.currentConv.updatedAt=Date.now();
        Memory.update(ChatUI.currentConv);
        Memory.saveGame(ChatUI.currentConv.id,result.dsl);
        if(result.testReport)ChatUI.addTestReportCard(result);else ChatUI.addGameCard(result);
        ChatUI.renderHistory();
      }else{
        ChatUI.addMessage('ai',result.error||'生成失败','error');
      }
    }catch(e){
      ChatUI.removeMessage(loadingId);
      ChatUI.addMessage('ai','生成失败: '+e.message,'error');
    }
    ChatUI.isGenerating=false;
    ChatUI.scrollBottom();
  },

  // AI 生成
  runGenerate: async function(prompt,intent){
    var generationPrompt = intent ? A.IntentDSL.toGenerationPrompt(intent,prompt) : prompt;
    var raw = await A.callAI(generationPrompt);
    if(!raw) return {success:false, error:A.getAIErrorMessage?A.getAIErrorMessage('AI生成失败'):'AI生成失败'};
    var dsl = A.DSLBinder.bind(raw, generationPrompt);
    if(intent)dsl.intent = intent;
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

  // 生成+测试（完整AI测试流水线）
  runGenerateAndTest: async function(prompt,intent){
    var generationPrompt = intent ? A.IntentDSL.toGenerationPrompt(intent,prompt) : prompt;
    var raw = await A.callAI(generationPrompt);
    if(!raw) return {success:false, error:A.getAIErrorMessage?A.getAIErrorMessage('AI生成失败'):'AI生成失败'};
    var dsl = A.DSLBinder.bind(raw, generationPrompt);
    if(intent)dsl.intent = intent;
    var gt = ((dsl.meta||{}).game_type || 'runner');
    var plugin = A.PluginSelector.select(gt, A.PluginManager);

    // 显示画布 + 测试面板
    ChatUI.showTestPanel();

    var bestDSL = dsl, bestScore = -1, bestRound = 0;
    var allRoundReports = [];
    var rlTrainer = new A.RLTrainer();
    var testModes = ['progress', 'explore', 'stress'];
    var testModeLabels = {progress:'通关验证', explore:'异常探索', stress:'压力测试'};

    for(var round=0; round<3; round++){
      eng.playTester = null;
      eng.load(dsl, plugin);
      A.setGameState(A.STATE.RUNNING);

      // 启动完整测试流水线
      var agent = new A.AITestAgent(eng);
      var observer = new A.GameObserver();
      var anomalyDet = new A.AnomalyDetector(eng);
      var testMode = testModes[round];

      agent.start(testMode);
      eng.playTester = agent;
      observer.start();
      anomalyDet.start();
      rlTrainer.startEpisode();

      ChatUI.updateTestPanel({
        round: round+1, totalRounds: 3,
        status: testModeLabels[testMode],
        agentMode: testMode,
        anomaliesFound: 0,
        bugsFound: 0,
        frame: 0,
        maxFrames: agent.maxFrames
      });

      // Agent挂进引擎逐帧运行；监控器低频采样，避免操作与画面状态脱节。
      await new Promise(function(resolve){
        var tick = 0;
        var check = function(){
          tick++;
          try{
            observer.update();
            anomalyDet.update();
          }catch(x){}

          // 实时更新面板（每30帧）
          if(tick % 30 === 0){
            var anoms = anomalyDet.getAnomalies();
            ChatUI.updateTestPanel({
              frame: agent.frame,
              anomaliesFound: anoms.length,
              agentMode: agent._mode,
              status: testMode === 'explore' ? '探索阶段'+(agent._exploreState.phase+1)+'/8' : testModeLabels[testMode]
            });
          }

          if(!agent._active || agent._done || eng.gameOver || eng._win || agent.frame >= agent.maxFrames){
            agent.stop();
            observer.stop();
            anomalyDet.stop();
            eng.playTester = null;
            resolve();
          }else setTimeout(check, 50);
        };
        check();
      });

      // 收集报告
      var agentRpt = agent.generateReport();
      var observerRpt = observer.generateReport();
      var anomalyRpt = anomalyDet.generateReport();

      for(var ai=0;ai<agent._actionLog.length;ai++){
        rlTrainer.recordAction(agent._actionLog[ai].type, 'executed');
      }

      // Bug分析
      var analyzer = new A.BugAnalyzer();
      var bugReport = analyzer.analyze(anomalyRpt, observerRpt, agentRpt);
      var fullBugRpt = analyzer.generateReport();

      // RL训练
      if(anomalyRpt.anomalies){
        for(var a=0; a<anomalyRpt.anomalies.length; a++){
          rlTrainer.recordBugFound(anomalyRpt.anomalies[a].type, agent._currentAction ? agent._currentAction.type : 'normal');
        }
      }
      rlTrainer.endEpisode(anomalyRpt.totalAnomalies === 0);

      // 自动修复
      var fixer = new A.AutoFixer();
      var fixResult = fixer.analyzeAndFix(bugReport, dsl, eng);
      if(fixResult.fixes.length > 0){
        dsl = fixResult.dsl;
      }

      // 评分
      var r = agentRpt;
      var progress = r.progress || {};
      var score = (anomalyRpt.totalAnomalies === 0 ? 200 : -anomalyRpt.totalAnomalies*30)
                + (r.survivalTime || 0)*2
                + (r.endState && r.endState.win ? 500 : 0)
                + (progress.maxLevel || 0)*100
                + (progress.bossSeen ? 150 : 0)
                + Math.min(progress.bossDamage || 0, 200);

      ChatUI.updateTestPanel({
        status: '轮次'+(round+1)+'完成',
        anomaliesFound: anomalyRpt.totalAnomalies,
        bugsFound: fullBugRpt.totalBugs
      });

      allRoundReports.push({
        round: round+1,
        score: score,
        agentReport: agentRpt,
        anomalyReport: anomalyRpt,
        bugReport: fullBugRpt,
        fixReport: fixResult
      });

      if(score > bestScore){
        bestScore = score;
        bestDSL = JSON.parse(JSON.stringify(dsl));
        bestRound = round + 1;
      }
    }

    // RL策略报告
    var rlReport = rlTrainer.generateReport();

    // 隐藏面板
    ChatUI.hideTestPanel();

    eng.playTester = null;
    var title = ((bestDSL.meta||{}).title || '未命名游戏');
    return {
      success:true,
      dsl:bestDSL,
      gameType:gt,
      title:title,
      testReport: {
        rounds: allRoundReports,
        bestRound: bestRound,
        bestScore: bestScore,
        rlReport: rlReport
      },
      summary:'🔬 3轮AI测试完成 | 最佳:轮'+bestRound+' | 评分:'+bestScore
        +' | 发现异常:'+allRoundReports.reduce(function(s,r){return s+r.anomalyReport.totalAnomalies;},0)+'个'
    };
  },

  // AI 导演
  runDirector: async function(prompt,intent){
    var director = new A.GameDirector();
    director._statusCallback = function(msg, type){
      ChatUI.updateLoading(msg);
    };
    var result = await director.runDirectorLoop(prompt,intent);
    if(!result.success) return {success:false, error:result.error || '导演失败'};
    var fitnessText = result.fitness && typeof result.fitness.final_fitness === 'number' ?
      'Fitness:' + Math.round(result.fitness.final_fitness * 100) + '%' : '评分:' + result.score;

    return {
      success:true,
      dsl:result.dsl,
      gameType:result.gameType || 'runner',
      title:((result.dsl.meta||{}).title || '未命名游戏'),
      directorResult:result,
      summary:'🧠 导演完成 | '+fitnessText+' | 优化'+result.totalOptimizations+'次。点击下方打开游戏。'
    };
  },

  showEvolutionPanel: function(){
    var panel=document.getElementById('evolutionPanel');
    if(panel)panel.style.display='block';
    ChatUI.updateEvolutionPanel({stage:'baseline',generation:0,candidate_id:'',progress:0});
  },

  hideEvolutionPanel: function(){
    var panel=document.getElementById('evolutionPanel');
    if(panel)panel.style.display='none';
  },

  stopEvolution: function(){
    var controller=ChatUI.evolutionAbortController;
    if(controller&&!controller.signal.aborted){
      controller.abort();
      ChatUI.updateEvolutionPanel({stage:'cancelling'});
      ChatUI.updateLoading('正在安全停止进化...');
    }
  },

  updateEvolutionPanel: function(status){
    status=status||{};
    var labels={
      baseline:'正在生成基线',baseline_complete:'基线已就绪',generation:'准备新一代',candidate:'评估候选',
      candidate_complete:'候选评估完成',cancelling:'正在安全停止',completed:'进化完成'
    };
    var statusEl=document.getElementById('evolutionStatus');
    if(statusEl&&status.stage)statusEl.textContent=labels[status.stage]||status.stage;
    var candidateEl=document.getElementById('evolutionCandidate');
    var generation=Number(status.generation)||0;
    var candidateMatch=String(status.candidate_id||'').match(/-c(\d+)$/);
    var candidateIndex=candidateMatch?Number(candidateMatch[1])+1:0;
    if(candidateEl)candidateEl.textContent='Generation '+(generation+1)+' / 3'+(candidateIndex?' · Candidate '+candidateIndex+' / 6':'');
    var progress=typeof status.progress==='number'?status.progress:Math.min(100,Math.round(((generation*6+candidateIndex)/18)*100));
    var progressEl=document.getElementById('evolutionProgressBar');
    if(progressEl)progressEl.style.width=Math.max(0,Math.min(100,progress))+'%';
    function setFitness(id,value){
      var el=document.getElementById(id);
      if(el&&typeof value==='number'&&isFinite(value))el.textContent=Math.round(value*100)+'%';
    }
    setFitness('evolutionBaselineFitness',status.baseline_fitness);
    setFitness('evolutionCurrentFitness',status.current_fitness);
    setFitness('evolutionBestFitness',status.best_fitness);
    var baseline=typeof status.baseline_fitness==='number'?status.baseline_fitness:null;
    var best=typeof status.best_fitness==='number'?status.best_fitness:null;
    var improvement=document.getElementById('evolutionImprovement');
    if(improvement&&baseline!==null&&best!==null){
      var delta=best-baseline;
      improvement.textContent=(delta>=0?'+':'')+Math.round(delta*100)+'%';
    }
  },

  createEvolutionEngineAdapter: function(){
    return{
      reset:function(){eng.reset();},
      teardown:function(){if(typeof eng.teardown==='function')eng.teardown();},
      load:function(dsl){
        var gameType=dsl&&dsl.meta&&dsl.meta.game_type||'runner';
        var plugin=A.PluginSelector.select(gameType,A.PluginManager);
        eng.load(dsl,plugin);
        A.setGameState(A.STATE.RUNNING);
        return dsl;
      },
      restoreBaseline:function(dsl){
        if(typeof eng.teardown==='function')eng.teardown();
        eng.reset();
        this.load(dsl);
      }
    };
  },

  createPromotionStore: function(){
    var simulationMemory=new A.SimulationMemory(localStorage);
    function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
    function restoreRaw(key,value){if(value===null||value===undefined)localStorage.removeItem(key);else localStorage.setItem(key,value);}
    return{
      begin:function(){
        if(!ChatUI.currentConv||!ChatUI.currentConv.id)throw new Error('promotion_conversation_required');
        return{
          conversations:localStorage.getItem(STORAGE_KEY),
          game:localStorage.getItem('age_game_'+ChatUI.currentConv.id),
          simulation:simulationMemory.snapshot(),
          current_conv:copy(ChatUI.currentConv)
        };
      },
      commit:function(data){
        if(!ChatUI.currentConv||!ChatUI.currentConv.id)throw new Error('promotion_conversation_required');
        var convId=ChatUI.currentConv.id;
        var all=Memory.load();
        var position=-1;
        for(var index=0;index<all.length;index++)if(all[index].id===convId){position=index;break;}
        var staged=copy(position>=0?all[position]:ChatUI.currentConv);
        staged.versions=Array.isArray(staged.versions)?staged.versions:[];
        staged.versions.push({
          version_id:data.promoted_version_id,parent_version:data.parent_version,candidate_id:data.candidate_id,
          source:'evolution',fitness:data.fitness&&data.fitness.final_fitness,created_at:Date.now()
        });
        staged.pending_version=data.promoted_version_id;
        if(position>=0)all[position]=staged;else all.unshift(staged);
        localStorage.setItem('age_game_'+convId,JSON.stringify(data.dsl));
        localStorage.setItem(STORAGE_KEY,JSON.stringify(all));
        simulationMemory.append({
          run_id:data.run_id||('promotion-'+data.promoted_version_id),
          game_id:data.game_id||convId,
          version_id:data.promoted_version_id,
          parent_version:data.parent_version,
          persona:data.persona||'new_player',
          changes:data.changes||[],
          evaluation:data.evaluation||{},
          fitness:data.fitness,
          status:data.evaluation&&data.evaluation.status||'completed',
          created_at:Date.now()
        });
        staged.dsl=data.dsl;
        staged.current_version=data.promoted_version_id;
        staged.updatedAt=Date.now();
        delete staged.pending_version;
        if(position>=0)all[position]=staged;else all[0]=staged;
        localStorage.setItem(STORAGE_KEY,JSON.stringify(all));
        ChatUI.currentConv=staged;
        return{promoted_version_id:data.promoted_version_id};
      },
      rollback:function(snapshot){
        restoreRaw(STORAGE_KEY,snapshot.conversations);
        restoreRaw('age_game_'+snapshot.current_conv.id,snapshot.game);
        simulationMemory.restore(snapshot.simulation);
        ChatUI.currentConv=copy(snapshot.current_conv);
      }
    };
  },

  createEvolutionRuntime: function(){
    var deterministicQA=new A.FinalQA({ai:null});
    var engineAdapter=ChatUI.createEvolutionEngineAdapter();
    var evaluator=new A.CandidateEvaluator({
      finalQA:deterministicQA,
      engine:engineAdapter,
      simulation:new A.SimulationAgent(),
      fitnessFactory:function(options){return new A.FitnessCalculator(options);}
    });
    var runner=new A.EvolutionRunner({
      optimizer:new A.GeneticOptimizer(),
      evaluator:evaluator,
      memory:new A.EvolutionMemory(localStorage),
      schemaValidator:new A.GeneSchemaValidator(),
      schemaBuilder:A.OptimizationSchemaBuilder,
      finalQA:deterministicQA,
      selection:new A.SelectionEngine(),
      engineAdapter:engineAdapter,
      onStatus:ChatUI.updateEvolutionPanel
    });
    var promoter=new A.EvolutionPromoter({
      finalQA:deterministicQA,
      engine:engineAdapter,
      store:ChatUI.createPromotionStore(),
      idFactory:function(){return'v'+Date.now();}
    });
    var director=new A.GameDirector({evolutionRunner:runner,evolutionPromoter:promoter});
    director._statusCallback=function(message){ChatUI.updateLoading(message);};
    return{director:director,runner:runner,promoter:promoter,engine:engineAdapter};
  },

  persistEvolutionBaseline: function(baseline,versionId){
    var conv=ChatUI.currentConv;
    if(!conv||!conv.id)throw new Error('baseline_conversation_required');
    conv.dsl=baseline.dsl;
    conv.current_version=versionId;
    conv.versions=Array.isArray(conv.versions)?conv.versions:[];
    if(!conv.versions.some(function(version){return version.version_id===versionId;})){
      conv.versions.push({version_id:versionId,parent_version:null,source:'director_baseline',fitness:baseline.directorResult.fitness.final_fitness,created_at:Date.now()});
    }
    conv.updatedAt=Date.now();
    Memory.update(conv);
    localStorage.setItem('age_game_'+conv.id,JSON.stringify(baseline.dsl));
  },

  runEvolutionMode: async function(prompt,intent){
    ChatUI.evolutionAbortController=new AbortController();
    var signal=ChatUI.evolutionAbortController.signal;
    ChatUI.showEvolutionPanel();
    var baseline=null;
    try{
      baseline=await ChatUI.runDirector(prompt,intent);
      if(!baseline.success)return baseline;
      var evidence=baseline.directorResult;
      if(!evidence.fitness||evidence.fitness.schema_version!=='2.0'){
        return{success:true,dsl:baseline.dsl,gameType:baseline.gameType,title:baseline.title,summary:'🧬 基线 Fitness 不可用，已保留导演版本。'};
      }
      var baselineVersion=evidence.fitness.version_id||evidence.simulationRecord&&evidence.simulationRecord.version_id||('v'+Date.now());
      ChatUI.persistEvolutionBaseline(baseline,baselineVersion);
      var schema=baseline.dsl.optimization&&Array.isArray(baseline.dsl.optimization.variables)
        ?baseline.dsl.optimization:A.OptimizationSchemaBuilder.build(baseline.dsl,{engine_capability_version:'1.0'});
      var baselineQA=JSON.parse(JSON.stringify(evidence.qa||{admitted:true,findings:[]}));
      baselineQA.semantic_qa={status:'passed',scope:'baseline',optimization_scope_hash:A.EvolutionProtocols.scopeHash(schema)};
      ChatUI.updateEvolutionPanel({
        stage:'baseline_complete',generation:0,progress:0,
        baseline_fitness:evidence.fitness.final_fitness,
        current_fitness:evidence.fitness.final_fitness,
        best_fitness:evidence.fitness.final_fitness
      });
      var runtime=ChatUI.createEvolutionRuntime();
      var metadata=A.BlueprintMetadata&&A.BlueprintMetadata.fromBlueprint
        ?A.BlueprintMetadata.fromBlueprint(evidence.blueprint||evidence.design&&evidence.design.blueprint,baseline.dsl,intent,{game_id:evidence.fitness.game_id,version_id:baselineVersion})
        :null;
      var evolution=await runtime.director.runEvolution(baseline.dsl,{
        enabled:true,
        baseline_version:baselineVersion,
        baseline_fitness:evidence.fitness,
        baseline_qa:baselineQA,
        baseline_evaluation:evidence.evaluation,
        random_seed:'ga-'+ChatUI.currentConv.id+'-'+baselineVersion,
        game_id:evidence.fitness.game_id||ChatUI.currentConv.id,
        intent:intent,
        blueprint:evidence.blueprint||evidence.design&&evidence.design.blueprint,
        blueprint_metadata:metadata,
        fitness_profile:'default_v2',
        deterministic:false,
        signal:signal
      });
      ChatUI.currentConv.last_evolution={run_id:evolution.run_id,status:evolution.status,stopped_reason:evolution.stopped_reason,promotion:evolution.promotion};
      var promoted=evolution.promotion&&evolution.promotion.status==='promoted';
      var finalDSL=promoted?evolution.dsl:baseline.dsl;
      var summary;
      if(evolution.stopped_reason==='cancelled')summary='🧬 进化已停止，已保留基线版本。';
      else if(promoted)summary='🧬 进化完成 | Fitness 提升 '+Math.round((evolution.best_candidate.fitness_delta||0)*100)+'% | 已晋升 '+evolution.promotion.promoted_version_id+'。';
      else summary='🧬 进化未晋升新版本（'+(evolution.stopped_reason||evolution.promotion&&evolution.promotion.reason||'无可用候选')+'），已保留基线。';
      ChatUI.updateEvolutionPanel({
        stage:'completed',generation:2,progress:100,
        baseline_fitness:evidence.fitness.final_fitness,
        current_fitness:evolution.best_candidate&&evolution.best_candidate.fitness,
        best_fitness:evolution.best_candidate&&evolution.best_candidate.fitness
      });
      return{
        success:true,dsl:finalDSL,gameType:finalDSL.meta&&finalDSL.meta.game_type||baseline.gameType,
        title:finalDSL.meta&&finalDSL.meta.title||baseline.title,summary:summary,evolution:evolution
      };
    }catch(error){
      if(baseline&&baseline.success){
        return{success:true,dsl:baseline.dsl,gameType:baseline.gameType,title:baseline.title,summary:'🧬 进化异常，已恢复并保留基线：'+error.message};
      }
      return{success:false,error:'进化失败: '+error.message};
    }finally{
      ChatUI.hideEvolutionPanel();
      ChatUI.evolutionAbortController=null;
    }
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
    ChatUI.hideConsultant();
    ChatUI.hideResearch();
    if(conv.ragContext)ChatUI.renderResearch(conv.ragContext);
    if(conv.intentDraft){
      ChatUI.consultant=new A.GameConsultant({memory:Memory.preferenceContext(),seedIntent:conv.seedIntent||(conv.intentDraft&&conv.intentDraft.lockedIntent)||null});
      ChatUI.consultant.state=conv.intentDraft;
      ChatUI.pendingMode=conv.pendingMode||'generate';
      ChatUI.pendingPrompt=conv.intentDraft.raw||conv.title;
      ChatUI.renderConsultant(ChatUI.consultant.getState());
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
          '</a><button class="experience-save" type="button">保存为成功范例</button>' +
        '</div>' +
      '</div>';
    messages.appendChild(div);
    var saveButton=div.querySelector('.experience-save');
    if(saveButton)saveButton.addEventListener('click',function(){ChatUI.saveCurrentExperience(saveButton);});
    ChatUI.scrollBottom();
  },

  saveCurrentExperience: async function(button){
    if(!ChatUI.currentConv||!ChatUI.currentConv.dsl||!A.RAGClient)return;
    button.disabled=true;button.textContent='正在保存...';
    var response=await A.RAGClient.saveExperience({conversation_id:ChatUI.currentConv.id,title:((ChatUI.currentConv.dsl.meta||{}).title||ChatUI.currentConv.title),request:ChatUI.pendingPrompt||ChatUI.currentConv.title,intent:ChatUI.currentConv.intent||{},game_dsl:ChatUI.currentConv.dsl});
    if(response&&response.indexed){button.textContent='已保存为成功范例';}
    else{button.disabled=false;button.textContent='保存失败，重试';if(A.setStatus)A.setStatus((response&&response.error)||'经验库未连接','error');}
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

  renderMemoryBadge: function(){
    var btn=document.getElementById('btnMemory');
    if(btn)btn.textContent='偏好记忆 · '+Memory.preferenceCount();
  },

  openMemoryDialog: function(){
    ChatUI.renderMemoryDialog();
    var dialog=document.getElementById('memoryDialog');
    if(dialog&&!dialog.open)dialog.showModal();
  },

  refreshConsultantMemory: function(){
    if(!ChatUI.consultant)return;
    ChatUI.consultant.memory=Memory.preferenceContext();
    var panel=document.getElementById('consultantPanel');
    if(panel&&panel.style.display!=='none')ChatUI.renderConsultant(ChatUI.consultant.getState());
  },

  renderMemoryDialog: function(){
    var list=document.getElementById('memoryList');
    var items=Memory.preferenceItems();
    if(!items.length){
      list.innerHTML='<div class="memory-empty">还没有已确认的玩家偏好</div>';
      return;
    }
    list.innerHTML='';
    for(var i=0;i<items.length;i++){
      var item=items[i], row=document.createElement('div');
      row.className='memory-item';
      row.innerHTML='<div class="memory-item-main"><span class="memory-category">'+ChatUI.escape(item.categoryLabel)+'</span><span class="memory-value">'+ChatUI.escape(item.valueLabel)+'</span></div>'+
        '<div class="memory-meta">确认 '+item.count+' 次 · 置信度 '+Math.round(item.confidence*100)+'%</div>'+
        '<button class="memory-remove" title="移除此偏好" aria-label="移除此偏好">×</button>';
      var remove=row.querySelector('.memory-remove');
      remove.dataset.category=item.category;
      remove.dataset.value=String(item.value);
      remove.addEventListener('click',function(){
        Memory.removePreference(this.dataset.category,this.dataset.value);
        ChatUI.renderMemoryDialog();
        ChatUI.renderMemoryBadge();
        ChatUI.refreshConsultantMemory();
      });
      list.appendChild(row);
    }
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
  },

  // ═══ 测试面板 ═══
  showTestPanel: function(){
    var panel = document.getElementById('testPanel');
    var cv = document.getElementById('game');
    var canvasArea = document.getElementById('testCanvasArea');
    if(panel) panel.style.display = 'flex';
    // 把画布移到测试面板中展示
    if(cv && canvasArea && cv.parentElement !== canvasArea){
      canvasArea.appendChild(cv);
    }
    if(cv) cv.style.display = 'block';
    ChatUI.updateTestPanel({status:'初始化...'});
  },

  updateTestPanel: function(data){
    var panel = document.getElementById('testPanel');
    if(!panel || panel.style.display === 'none') return;
    if(data.round !== undefined){
      var rEl = document.getElementById('tpRound');
      if(rEl) rEl.textContent = '轮次 '+data.round+'/'+data.totalRounds;
      var bar = document.getElementById('tpProgressBar');
      if(bar) bar.style.width = ((data.round-1)/data.totalRounds*100 + ((data.frame||0)/(data.maxFrames||3600)*33)) + '%';
    }
    if(data.status !== undefined){
      var sEl = document.getElementById('tpStatus');
      if(sEl) sEl.textContent = data.status;
    }
    if(data.agentMode !== undefined){
      var mEl = document.getElementById('tpAgentMode');
      if(mEl) mEl.textContent = data.agentMode;
    }
    if(data.anomaliesFound !== undefined){
      var aEl = document.getElementById('tpAnomalies');
      if(aEl) aEl.textContent = data.anomaliesFound;
    }
    if(data.bugsFound !== undefined){
      var bEl = document.getElementById('tpBugs');
      if(bEl) bEl.textContent = data.bugsFound;
    }
  },

  hideTestPanel: function(){
    var panel = document.getElementById('testPanel');
    var cv = document.getElementById('game');
    var main = document.getElementById('main');
    if(panel) panel.style.display = 'none';
    // 把画布移回原位置
    if(cv && main && cv.parentElement !== main){
      main.appendChild(cv);
    }
    if(cv) cv.style.display = 'none';
  },

  // ═══ 测试报告卡片 ═══
  addTestReportCard: function(result){
    var messages = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg msg-ai';
    var gt = result.gameType || 'runner';
    var title = result.title || '未命名游戏';
    var dsl = result.dsl || {};
    var player = dsl.player || {};
    var world = dsl.world || {};
    var levels = dsl.levels ? dsl.levels.length + '关' : '无限';
    var tr = result.testReport;
    var roundHTML = '';

    if(tr && tr.rounds){
      for(var i=0; i<tr.rounds.length; i++){
        var rd = tr.rounds[i];
        var isBest = rd.round === tr.bestRound;
        var severityHTML = '';
        if(rd.bugReport && rd.bugReport.reports){
          for(var j=0; j<rd.bugReport.reports.length; j++){
            var bug = rd.bugReport.reports[j];
            var sevClass = bug.severity === 'critical' ? 'sev-critical' : (bug.severity === 'high' ? 'sev-high' : (bug.severity === 'medium' ? 'sev-medium' : 'sev-low'));
            severityHTML += '<div class="test-bug-item '+sevClass+'">' +
              '<span class="bug-sev">'+ (bug.severity === 'critical' ? '🔴' : bug.severity === 'high' ? '🟠' : bug.severity === 'medium' ? '🟡' : '🟢') +'</span>' +
              '<span class="bug-title">'+ChatUI.escape(bug.title)+'</span>' +
              '<span class="bug-file">'+ChatUI.escape(bug.file || '')+'</span>' +
              '<div class="bug-detail">'+ChatUI.escape(bug.suggestion || '')+'</div>' +
            '</div>';
          }
        }
        var fixHTML = '';
        if(rd.fixReport && rd.fixReport.fixes){
          for(var k=0; k<rd.fixReport.fixes.length; k++){
            var fix = rd.fixReport.fixes[k];
            fixHTML += '<div class="test-fix-item">🔧 '+ChatUI.escape(fix.detail || fix.action)+'</div>';
          }
        }
        roundHTML +=
          '<div class="test-round'+(isBest?' best':'')+'">' +
            '<div class="test-round-header">' +
              '<span class="test-round-num">'+(isBest?'⭐':'')+' 轮次 '+rd.round+'</span>' +
              '<span class="test-round-score">评分: '+rd.score+'</span>' +
              '<span class="test-round-anomalies">异常: '+rd.anomalyReport.totalAnomalies+'个</span>' +
            '</div>' +
            '<div class="test-round-body">' +
              (rd.anomalyReport.summary ? '<div class="test-summary">'+ChatUI.escape(rd.anomalyReport.summary)+'</div>' : '') +
              severityHTML +
              fixHTML +
            '</div>' +
          '</div>';
      }
    }

    // RL策略
    var rlHTML = '';
    if(tr && tr.rlReport && tr.rlReport.strategy && tr.rlReport.strategy.strategy){
      rlHTML = '<div class="test-rl-section">' +
        '<div class="test-rl-title">🧠 强化学习策略</div>' +
        '<div class="test-rl-info">总测试: '+tr.rlReport.totalEpisodes+'轮 | 总Bug: '+tr.rlReport.totalBugsFound+'个 | 总奖励: '+tr.rlReport.totalReward+'</div>' +
        '<div class="test-rl-advice">'+ChatUI.escape(tr.rlReport.summary)+'</div>' +
      '</div>';
    }

    div.innerHTML =
      '<div class="msg-avatar">🤖</div>' +
      '<div class="msg-body">' +
        '<div class="msg-role">AI</div>' +
        '<div class="msg-text">'+ChatUI.escape(result.summary)+'</div>' +
        '<div class="test-report-card">' +
          '<div class="test-report-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
            '<span class="test-report-title">📊 AI测试报告</span>' +
            '<span class="test-report-toggle">▶</span>' +
          '</div>' +
          '<div class="test-report-body">' +
            roundHTML +
            rlHTML +
          '</div>' +
        '</div>' +
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
