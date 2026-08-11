const assert=require('assert');
const path=require('path');
const {chromium}=require('playwright');

(async function(){
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push('main: '+e.message));
  await page.route('https://api.deepseek.com/**',async route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    const system=(((body.messages||[])[0]||{}).content||'');
    const result=system.includes('AI游戏顾问')?{intent:{},ready:false,summary:'继续澄清'}:{meta:{game_type:'tower_defense',title:'顾问防线'},player:{hp:12},rules:{win_condition:'defend_waves',win_value:5},world:{theme:'sci_fi'},tower_defense:{waves:5,slots:6,starting_gold:45}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})});
  });
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForURL(/AI-ENGINE/);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();

  const consultantTypes=[['runner','runner','runner_goal'],['shooter','shooter','shooter_mode'],['platform','platformer','platform_goal'],['dungeon','dungeon','dungeon_goal'],['story','story','story_mode'],['rpg','rpg','rpg_growth'],['strategy','strategy','strategy_mode'],['tower_defense','tower_defense','tower_layout'],['card','card','card_system'],['simulation','simulation','simulation_goal'],['sandbox','sandbox','sandbox_goal'],['racing','racing','racing_mode']];
  for(const entry of consultantTypes){
    await page.selectOption('#presetSelect',entry[0]);
    await page.locator('#consultantPanel').waitFor({state:'visible'});
    await page.waitForFunction(()=>!window.ChatUI.isGenerating);
    const state=await page.evaluate(()=>({type:window.ChatUI.consultant.state.intent.game_type,question:window.ChatUI.consultant.state.questionId,cards:document.querySelectorAll('.game-card').length}));
    assert.strictEqual(state.type,entry[1]);
    assert.strictEqual(state.question,entry[2]);
    assert.strictEqual(state.cards,0,entry[0]+' bypassed consultant');
    if(entry[0]==='tower_defense')await page.screenshot({path:path.resolve(__dirname,'../assets/0806_type_consultant_v1.png'),fullPage:true});
  }

  await page.selectOption('#presetSelect','tower_defense');
  await page.getByRole('button',{name:'单线路径'}).click();
  await page.getByRole('button',{name:'标准挑战'}).click();
  await page.getByRole('button',{name:'科幻未来'}).click();
  await page.locator('#btnConsultantConfirm').waitFor({state:'visible'});
  await page.locator('#btnConsultantConfirm').click();
  await page.locator('.game-card').waitFor({state:'visible'});
  assert.strictEqual(await page.evaluate(()=>window.ChatUI.currentConv.dsl.meta.game_type),'tower_defense');

  const types=['rpg','strategy','tower_defense','card','simulation','sandbox','racing'];
  const keys={rpg:['j'],strategy:[' ','j'],tower_defense:[' '],card:['1','Enter'],simulation:['1'],sandbox:[' '],racing:['ArrowUp']};
  for(const type of types){
    await page.evaluate(selected=>window.ChatUI.loadPreset(selected),type);
    await page.locator('.game-card').last().waitFor({state:'visible'});
    const id=await page.evaluate(()=>window.ChatUI.currentConv.id);
    const game=await context.newPage();
    game.on('pageerror',e=>errors.push(type+': '+e.message));
    await game.goto('http://127.0.0.1:4173/game.html?id='+id);
    await game.locator('#game').waitFor({state:'visible'});
    for(const key of keys[type])await game.keyboard.press(key===' '? 'Space':key);
    await game.waitForTimeout(180);
    const result=await game.evaluate(()=>{
      const engine=window.AGE._currentEngine;
      const data=document.getElementById('game').getContext('2d').getImageData(0,0,800,400).data;
      let colored=0;
      for(let i=0;i<data.length;i+=64)if(data[i]||data[i+1]||data[i+2])colored++;
      return{plugin:engine.plugin&&engine.plugin.name,colored,hint:document.getElementById('hint').textContent};
    });
    assert.strictEqual(result.plugin,type);
    assert(result.colored>100,type+' canvas is blank');
    assert(result.hint.length>5,type+' hint is missing');
    if(type==='tower_defense')await game.screenshot({path:path.resolve(__dirname,'../assets/0806_game_types_v1.png'),fullPage:true});
    await game.close();
  }
  assert.strictEqual(errors.length,0,errors.join('\n'));
  await browser.close();
  console.log('12 consultant entries and 7 new game types UI tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
