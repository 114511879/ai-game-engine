/** RAGClient.js - browser HTTP transport plus Android on-device transport. */
(function(){
var A=window.AGE=window.AGE||{};
var HTTP_BASE='http://127.0.0.1:8765';
var nativePending=new Map();
var requestCounter=0;

function nextRequestId(){
  requestCounter+=1;
  return 'rag_'+Date.now()+'_'+requestCounter;
}

function parseJson(value){
  if(value&&typeof value==='object')return value;
  return JSON.parse(value||'{}');
}

function settleNative(id,succeeded,payloadJson){
  var pending=nativePending.get(String(id));
  if(!pending)return;
  nativePending.delete(String(id));
  clearTimeout(pending.timer);
  try{
    var payload=parseJson(payloadJson);
    if(succeeded)pending.resolve(payload);
    else pending.reject(new Error(payload.message||payload.error||'本机 RAG 请求失败'));
  }catch(error){pending.reject(error);}
}

A.NativeRAG={
  resolve:function(id,resultJson){settleNative(id,true,resultJson);},
  reject:function(id,errorJson){settleNative(id,false,errorJson);}
};

function hasNativeTransport(){
  return !!(window.AndroidRag&&
    typeof window.AndroidRag.retrieve==='function'&&
    typeof window.AndroidRag.saveExperience==='function'&&
    typeof window.AndroidRag.health==='function');
}

function nativeRequest(method,payload,timeoutMs){
  return new Promise(function(resolve,reject){
    var id=nextRequestId();
    var timer=setTimeout(function(){
      if(!nativePending.has(id))return;
      nativePending.delete(id);
      reject(new Error('本机 RAG 请求超时'));
    },timeoutMs);
    nativePending.set(id,{resolve:resolve,reject:reject,timer:timer});
    try{
      if(method==='health')window.AndroidRag.health(id);
      else window.AndroidRag[method](id,JSON.stringify(payload||{}));
    }catch(error){
      nativePending.delete(id);
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function httpRequest(path,options,timeoutMs){
  var controller=new AbortController();
  var timer=setTimeout(function(){controller.abort();},timeoutMs||3500);
  try{
    var response=await fetch(HTTP_BASE+path,Object.assign({},options||{}, {
      signal:controller.signal,
      headers:Object.assign({'Content-Type':'application/json'},(options&&options.headers)||{})
    }));
    if(!response.ok)throw new Error('RAG HTTP '+response.status);
    return await response.json();
  }finally{clearTimeout(timer);}
}

function addValues(target,value){
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i++)if(value[i]!==null&&value[i]!==undefined)target.push(String(value[i]));
  }else if(value&&typeof value==='object'){
    for(var key in value)if(Object.prototype.hasOwnProperty.call(value,key)&&value[key]!==null&&value[key]!==undefined){
      if(typeof value[key]!=='object')target.push(String(value[key]));
    }
  }else if(value!==null&&value!==undefined&&value!=='')target.push(String(value));
}

function buildQueries(query,intent){
  intent=intent||{};
  var queries=[];
  function add(parts){
    var value=(Array.isArray(parts)?parts.join(' '):String(parts||'')).trim();
    if(value&&queries.indexOf(value)<0)queries.push(value);
  }
  add(query);
  var world=[];
  addValues(world,intent.game_type);
  if(intent.theme)addValues(world,intent.theme.world);
  if(intent.camera)addValues(world,intent.camera.view);
  add(world);
  var systems=[];
  if(intent.combat){
    addValues(systems,intent.combat.style);
    addValues(systems,intent.combat.difficulty);
    if(intent.combat.boss_focus)systems.push('boss');
  }
  addValues(systems,intent.details);
  addValues(systems,intent.systems);
  add(systems);
  return queries.slice(0,3);
}

function normalizeNativeResult(raw,queries){
  raw=raw||{};
  var documents=Array.isArray(raw.documents)?raw.documents:[];
  var context=[];
  for(var i=0;i<documents.length;i++){
    context.push('【'+(documents[i].title||'本地知识')+'】'+(documents[i].content||''));
  }
  var rawPlan=raw.plan||{};
  return {
    available:true,
    runtime_mode:raw.runtime_mode||'native_semantic',
    plan:{
      rewritten_queries:queries,
      limitations:Array.isArray(rawPlan.limitations)?rawPlan.limitations:[]
    },
    documents:documents,
    coverage:Number(raw.coverage)||0,
    context_text:raw.context_text||context.join('\n'),
    source_counts:{local:documents.length,web:0},
    web_search_needed:false,
    web_search_used:false,
    web_sources:[]
  };
}

A.RAGClient={
  retrieve:async function(query,intent){
    if(hasNativeTransport()){
      var queries=buildQueries(query,intent);
      try{
        var nativeResult=await nativeRequest('retrieve',{queries:queries,top_k:6},45000);
        return normalizeNativeResult(nativeResult,queries);
      }catch(error){return{available:false,error:error.message||'本机 RAG 不可用'};}
    }
    try{return await httpRequest('/api/rag/retrieve',{method:'POST',body:JSON.stringify({query:query,intent:intent,top_k:6})},25000);}
    catch(error){return{available:false,error:error.name==='AbortError'?'本地 RAG 服务未响应':error.message};}
  },
  saveExperience:async function(payload){
    if(hasNativeTransport()){
      try{return await nativeRequest('saveExperience',payload,30000);}
      catch(error){return{indexed:false,error:error.message||'本机范例索引失败'};}
    }
    try{return await httpRequest('/api/experience',{method:'POST',body:JSON.stringify(payload)},20000);}
    catch(error){return{indexed:false,error:error.name==='AbortError'?'本地 RAG 服务未响应':error.message};}
  },
  health:async function(){
    try{
      return hasNativeTransport()
        ?await nativeRequest('health',null,10000)
        :await httpRequest('/health',{method:'GET'});
    }catch(error){return null;}
  }
};
})();
