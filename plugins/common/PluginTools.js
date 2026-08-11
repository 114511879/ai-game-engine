/** PluginTools.js - shared helpers for full-loop game plugins */
(function(){var A=window.AGE;
A.PluginTools={
  clamp:function(v,min,max){return Math.max(min,Math.min(max,v));},
  win:function(e,message){if(e._win)return;e._win=true;A.setGameState(A.STATE.WIN);if(A.setStatus)A.setStatus(message||'目标完成','success');},
  fail:function(e,message){if(e.gameOver)return;e.gameOver=true;A.setGameState(A.STATE.GAMEOVER);if(A.setStatus)A.setStatus(message||'挑战失败','error');},
  background:function(ctx,color,title,subtitle){
    ctx.fillStyle=color||'#17191f';ctx.fillRect(0,0,800,400);
    ctx.fillStyle='rgba(255,255,255,.06)';
    for(var i=0;i<10;i++)ctx.fillRect(0,i*44,800,1);
    ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.fillText(title||'',20,30);
    if(subtitle){ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='12px sans-serif';ctx.fillText(subtitle,20,50);}
  },
  panel:function(ctx,x,y,w,h){ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='rgba(255,255,255,.18)';ctx.strokeRect(x+.5,y+.5,w-1,h-1);},
  bar:function(ctx,x,y,w,h,value,max,color,label){
    var ratio=max>0?this.clamp(value/max,0,1):0;
    ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(x,y,w,h);
    ctx.fillStyle=color||'#35c78a';ctx.fillRect(x,y,w*ratio,h);
    if(label){ctx.fillStyle='#fff';ctx.font='11px sans-serif';ctx.fillText(label,x,y-4);}
  },
  text:function(ctx,text,x,y,color,size,align){ctx.fillStyle=color||'#fff';ctx.font=(size||13)+'px sans-serif';ctx.textAlign=align||'left';ctx.fillText(text,x,y);ctx.textAlign='left';}
};
})();
