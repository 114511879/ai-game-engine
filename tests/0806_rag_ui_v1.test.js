const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

(async function () {
  let browser;
  try {
    browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:8765/api/rag/retrieve', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      plan: { rewritten_queries: ['souls_like boss pattern', 'magic system balance', 'open world exploration'], limitations: ['Canvas 2D 不支持无缝 3D 开放世界。'] },
      documents: [
        { id: 'local_1', title: '魂系战斗核心', score: 0.72, metadata: { type: 'combat', source: 'curated' } },
        { id: 'local_2', title: '元素魔法系统', score: 0.68, metadata: { type: 'system', source: 'curated' } },
        { id: 'local_3', title: '开放区域探索结构', score: 0.64, metadata: { type: 'world', source: 'curated' } }
      ],
      coverage: 0.68,
      web_search_needed: false,
      web_search_used: false,
      web_sources: [],
      source_counts: { local: 3, web: 0 },
      context_text: '本地测试检索结果'
    })
  }));
  await page.route('http://127.0.0.1:8765/api/experience', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ indexed: true, document_id: 'experience_ui_test', knowledge_count: 1 }) }));
  await page.route('https://api.deepseek.com/**', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    const system = (((body.messages || [])[0] || {}).content || '');
    const result = system.includes('AI游戏顾问')
      ? { intent: {}, ready: false, summary: '继续澄清' }
      : {
          meta: { game_type: 'dungeon', title: '魂火开放区' },
          player: { hp: 10 },
          rules: { win_condition: 'boss_kill', win_value: 1 },
          combat: { style: 'souls_like', difficulty: 'hard' },
          world: { theme: 'western_fantasy' },
          entities: { boss: { name: '灰烬领主', hp: 420 } },
          levels: [{ name: '开放区域', map: { rooms: [{ type: 'boss' }] } }]
        };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] })
    });
  });

  const staticPort = process.env.AGE_TEST_STATIC_PORT || '4173';
  await page.goto('http://127.0.0.1:' + staticPort + '/');
  await page.waitForURL(/AI-ENGINE/);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('age.deepseek_api_key', 'test-runtime-key');
  });
  await page.reload();
  await page.locator('#prompt').fill('我想做一个类似黑魂但是有魔法和开放世界的游戏');
  await page.locator('#btnSubmit').click();
  await page.locator('#consultantPanel').waitFor({ state: 'visible' });
  console.log('consultant opened');
  await page.locator('#btnConsultantConfirm').waitFor({ state: 'visible' });
  assert((await page.locator('#consultantIntent').textContent()).includes('魂系战斗'));
  assert((await page.locator('#consultantIntent').textContent()).includes('高难'));
  assert((await page.locator('#consultantIntent').textContent()).includes('第三人称'));
  await page.locator('#btnConsultantConfirm').click();
  console.log('consultant confirmed');

  await page.locator('#researchPanel').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.research-query').length > 0);
  await page.waitForFunction(() => document.querySelectorAll('.research-document').length > 0);
  assert((await page.locator('#researchStatus').textContent()).includes('命中'));
  assert((await page.locator('.research-query').count()) >= 3);
  assert((await page.locator('.research-document').count()) >= 3);
  assert((await page.locator('#researchLimits').textContent()).includes('引擎限制'));
  console.log('research rendered');

  await page.locator('.game-card').waitFor({ state: 'visible' });
  const save = page.locator('.experience-save').last();
  await save.click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.experience-save')).some(button => button.textContent.includes('已保存')), null, { timeout: 30000 });
  console.log('experience saved');
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: path.resolve(__dirname, '../assets/0806_rag_search_v1.png'), fullPage: true });
  console.log('RAG consultant UI test passed');
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
