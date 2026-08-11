/** GameState.js */
(function(){var A=window.AGE=window.AGE||{};A.STATE={IDLE:'idle',LOADING:'loading',RUNNING:'running',WIN:'win',GAMEOVER:'over'};var s=A.STATE.IDLE;A.getGameState=function(){return s;};A.setGameState=function(v){s=v;};})();
