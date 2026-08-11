/** RAGClient.js - browser client for the local game-design knowledge service */
(function(){var A=window.AGE;
var BASE='http://127.0.0.1:8765';
async function request(path,options,timeoutMs){
  var controller=new AbortController();
  var timer=setTimeout(function(){controller.abort();},timeoutMs||3500);
  try{
    var response=await fetch(BASE+path,Object.assign({},options||{},{signal:controller.signal,headers:Object.assign({'Content-Type':'application/json'},(options&&options.headers)||{})}));
    if(!response.ok)throw new Error('RAG HTTP '+response.status);
    return await response.json();
  }finally{clearTimeout(timer);}
}
A.RAGClient={
  retrieve:async function(query,intent){
    try{return await request('/api/rag/retrieve',{method:'POST',body:JSON.stringify({query:query,intent:intent,top_k:6})},25000);}
    catch(e){return{available:false,error:e.name==='AbortError'?'本地RAG服务未响应':e.message};}
  },
  saveExperience:async function(payload){
    try{return await request('/api/experience',{method:'POST',body:JSON.stringify(payload)},20000);}
    catch(e){return{indexed:false,error:e.name==='AbortError'?'本地RAG服务未响应':e.message};}
  },
  health:async function(){try{return await request('/health',{method:'GET'});}catch(e){return null;}}
};
})();
