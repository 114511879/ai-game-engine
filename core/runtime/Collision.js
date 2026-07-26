/** Collision.js */
(function(){var A=window.AGE;A.hit=function(a,b,pad){pad=pad!==undefined?pad:2;return a.x+pad<b.x+b.w-pad&&a.x+a.w-pad>b.x+pad&&a.y+pad<b.y+b.h-pad&&a.y+a.h-pad>b.y+pad;};A.hitPlatformTop=function(p,pl){if(p.vy<0)return false;var pb=p.y+p.h;return pb>=pl.y&&pb<=pl.y+pl.h+p.vy+12&&p.x+p.w>pl.x+4&&p.x<pl.x+pl.w-4;};})();
