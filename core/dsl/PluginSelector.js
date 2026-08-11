/** PluginSelector.js — 支持 game_type=["shooter","rpg"] 组合游戏 */
(function(){var A=window.AGE;A.PluginSelector={select:function(gt,pm){
  if(!pm||!pm.get)return null;
  var aliases={platformer:'platform',action_rpg:'dungeon',horror:'dungeon',puzzle:'platform'};
  // 单类型
  if(typeof gt==='string')return pm.get(aliases[gt]||gt);
  // 复合类型: 取第一个匹配的plugin,标记extensions
  if(Array.isArray(gt)){var main=pm.get(gt[0]);if(main)main._extensions=gt.slice(1);return main;}
  return null;
}};})();
