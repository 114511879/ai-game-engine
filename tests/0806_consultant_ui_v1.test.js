const assert = require('assert');
const path = require('path');
const {chromium} = require('playwright');

(async function(){
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api.deepseek.com/**',async route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    const system=(((body.messages||[])[0]||{}).content||'');
    const result=system.includes('AI游戏顾问')
      ? {intent:{},ready:false,summary:'继续澄清'}
      : {meta:{game_type:'dungeon',title:'深夜追猎'},player:{hp:8},rules:{win_condition:'boss_kill',win_value:1},skills:[{name:'fireball',type:'attack',damage:25,cooldown:30},{name:'shield',type:'defense',cooldown:80}],world:{theme:'dark'},entities:{boss:{name:'追猎者',hp:350}},levels:[{name:'逃生通道',map:{rooms:[{type:'enemy'}]}},{name:'追猎巢穴',map:{rooms:[{type:'boss'}]}}]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})});
  });
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForURL(/AI-ENGINE/);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.locator('#prompt').fill('我想做一个恐怖游戏');
  await page.locator('#btnSubmit').click();
  await page.locator('#consultantPanel').waitFor({state:'visible'});
  assert.strictEqual(await page.locator('#consultantQuestion').textContent(),'你想要哪一种恐怖体验？');
  await page.getByRole('button',{name:'怪物追杀'}).click();
  await page.getByRole('button',{name:'高难受苦'}).click();
  await page.getByRole('button',{name:'第一人称'}).click();
  await page.locator('#btnConsultantConfirm').waitFor({state:'visible'});
  await page.screenshot({path:path.resolve(__dirname,'../assets/0806_consultant_clarification_v1.png'),fullPage:true});
  await page.locator('#btnConsultantConfirm').click();
  await page.locator('.game-card').waitFor({state:'visible'});
  assert((await page.locator('.game-card-title').textContent()).includes('深夜追猎'));
  await page.locator('#btnMemory').click();
  await page.locator('#memoryDialog').waitFor({state:'visible'});
  assert((await page.locator('.memory-item').count())>=5);
  await page.screenshot({path:path.resolve(__dirname,'../assets/0806_player_memory_v1.png'),fullPage:true});
  await page.locator('#btnMemoryClose').click();
  await page.locator('#btnNewChat').click();
  await page.locator('#prompt').fill('生成一个新游戏');
  await page.locator('#btnSubmit').click();
  await page.locator('#consultantMemory').waitFor({state:'visible'});
  assert((await page.locator('#consultantMemoryText').textContent()).includes('恐怖游戏'));
  await page.locator('#btnApplyMemory').click();
  assert((await page.locator('#consultantIntent').textContent()).includes('恐怖游戏'));
  await page.locator('#btnConsultantConfirm').waitFor({state:'visible'});
  assert.strictEqual(errors.length,0,errors.join('\n'));
  await page.screenshot({path:path.resolve(__dirname,'../assets/0806_consultant_ui_v1.png'),fullPage:true});
  await browser.close();
  console.log('consultant UI test passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
