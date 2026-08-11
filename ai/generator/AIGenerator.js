/** AIGenerator.js v2.0 - structured AI calls for generation and consultation */
(function(){
var A=window.AGE;
if(A.SYSTEM_PROMPT&&A.SYSTEM_PROMPT.indexOf('tower_defense')<0)A.SYSTEM_PROMPT+='\n额外可用类型：strategy策略、tower_defense塔防、card卡牌、simulation模拟经营、sandbox沙盒、racing竞速。输出时meta.game_type必须使用这些标准值。';

var API_KEY_STORAGE='age.deepseek_api_key';

function readStoredAPIKey(){
  try{return(localStorage.getItem(API_KEY_STORAGE)||'').trim();}
  catch(error){return'';}
}

function saveAPIKey(key){
  A.API_KEY=key;
  try{localStorage.setItem(API_KEY_STORAGE,key);}catch(error){}
}

function clearStoredAPIKey(){
  A.API_KEY='';
  try{localStorage.removeItem(API_KEY_STORAGE);}catch(error){}
}

function requireAPIKey(){
  var key=(A.API_KEY||'').trim()||readStoredAPIKey();
  if(!key)key=(window.prompt('请输入 DeepSeek API Key')||'').trim();
  if(!key){
    var error=new Error('需要 DeepSeek API Key 才能使用 AI 生成');
    error.code='missing_api_key';
    throw error;
  }
  saveAPIKey(key);
  return key;
}

function extractJSON(text){
  var raw=(text||'').trim();
  var match=raw.match(/\{[\s\S]*\}/);
  try{return JSON.parse(match?match[0]:raw);}
  catch(error){error.code='invalid_json';throw error;}
}

function errorMessage(error){
  if(error.code==='missing_api_key')return'需要 DeepSeek API Key 才能使用 AI 生成';
  if(error.code==='output_truncated')return'AI输出过长，扩大输出预算后仍未完成';
  if(error.code==='invalid_json')return'AI返回的JSON格式无效';
  if(error.status===401)return'API Key无效或已过期';
  if(error.status===429)return'AI请求过于频繁或账户额度不足';
  if(error.name==='AbortError')return'AI请求超时';
  return error.message||'AI请求失败';
}

async function requestOnce(systemPrompt,userPrompt,options,maxTokens){
  var apiKey=requireAPIKey();
  var controller=new AbortController();
  var timer=setTimeout(function(){controller.abort();},options.timeout_ms||30000);
  try{
    var r=await fetch('https://api.deepseek.com/v1/chat/completions',{
      method:'POST',
      signal:controller.signal,
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({
        model:options.model||'deepseek-chat',
        messages:[{role:'system',content:systemPrompt},{role:'user',content:userPrompt}],
        temperature:typeof options.temperature==='number'?options.temperature:0.35,
        max_tokens:maxTokens
      })
    });
    if(!r.ok){
      var body={};
      try{body=await r.json();}catch(parseError){}
      var httpError=new Error(body.error?body.error.message:'HTTP '+r.status);
      httpError.code='http_error';
      httpError.status=r.status;
      throw httpError;
    }
    return await r.json();
  }finally{
    clearTimeout(timer);
  }
}

A.lastAIError=null;
A.getAIErrorMessage=function(fallback){return A.lastAIError&&A.lastAIError.message||fallback||'AI请求失败';};

A.callStructuredAI=async function(systemPrompt,userPrompt,options){
  options=options||{};
  A.lastAIError=null;
  var maxTokens=options.max_tokens||1800;
  try{
    var data=await requestOnce(systemPrompt,userPrompt,options,maxTokens);
    var choice=(data.choices||[])[0]||{};
    if(choice.finish_reason==='length'&&options.retry_on_length===true){
      var retryLimit=options.max_retry_tokens||8000;
      var retryTokens=Math.min(retryLimit,Math.max(maxTokens*2,4000));
      data=await requestOnce(systemPrompt,userPrompt,options,retryTokens);
      choice=(data.choices||[])[0]||{};
    }
    if(choice.finish_reason==='length'){
      var truncated=new Error('AI output was truncated');
      truncated.code='output_truncated';
      throw truncated;
    }
    return extractJSON(choice.message&&choice.message.content||'');
  }catch(error){
    if(error.status===401)clearStoredAPIKey();
    var message=errorMessage(error);
    A.lastAIError={code:error.code||'request_failed',status:error.status||0,message:message};
    if(A.setStatus)A.setStatus(message,'error');
    return null;
  }
};

A.callAI=async function(prompt){
  return A.callStructuredAI(A.SYSTEM_PROMPT,prompt,{temperature:0.7,max_tokens:5000,retry_on_length:true,max_retry_tokens:8000,errorStatus:'AI生成失败'});
};
})();
