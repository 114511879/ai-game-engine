const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

(async function () {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:8765/api/rag/retrieve', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: { rewritten_queries: ['恐怖文字冒险'], limitations: [] },
        documents: [{ id: 'local_story', title: '恐怖叙事结构', score: 0.7, metadata: { type: 'story', source: 'curated' } }],
        coverage: 0.7,
        web_search_needed: false,
        web_search_used: false,
        web_sources: [],
        source_counts: { local: 1, web: 0 },
        context_text: 'story test'
      })
    }));
    await page.route('https://api.deepseek.com/**', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      const system = (((body.messages || [])[0] || {}).content || '');
      const result = system.includes('AI游戏顾问')
        ? { intent: {}, ready: false, summary: '继续澄清' }
        : {
            meta: { game_type: 'story', title: '迷雾庄园' },
            player: { hp: 8 },
            rules: { win_condition: 'story_complete', win_value: 0 },
            world: { theme: 'modern_horror' }
          };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }) });
    });

    await page.goto('http://127.0.0.1:4173/');
    await page.waitForURL(/AI-ENGINE/);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#prompt').fill('我想做一个恐怖文字冒险游戏');
    await page.locator('#btnSubmit').click();
    await page.locator('#consultantPanel').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '怪物追杀' }).click();
    await page.getByRole('button', { name: '标准挑战' }).click();
    await page.getByRole('button', { name: '第一人称' }).click();
    await page.locator('#btnConsultantConfirm').click();
    await page.locator('.game-card').waitFor({ state: 'visible' });

    const id = await page.evaluate(() => window.ChatUI.currentConv.id);
    const game = await context.newPage();
    const gameErrors = [];
    game.on('pageerror', error => gameErrors.push(error.message));
    await game.goto('http://127.0.0.1:4173/game.html?id=' + id);
    await game.locator('#game').waitFor({ state: 'attached' });
    const display = await game.locator('#game-main').evaluate(node => getComputedStyle(node).display);
    if (display === 'none') throw new Error('game page error: ' + await game.locator('#error-page p').textContent() + ' | ' + gameErrors.join('; '));
    await game.waitForFunction(() => window.AGE && window.AGE._currentEngine && window.AGE._currentEngine._ev);
    const result = await game.evaluate(() => {
      const engine = window.AGE._currentEngine;
      return {
        type: engine.dsl.meta.game_type,
        preset: engine.dsl.meta.preset,
        events: engine._ev.slice(0, 3).map(event => [event.ch, event.x, event.q].join(' '))
      };
    });
    assert.strictEqual(result.type, 'story');
    assert.notStrictEqual(result.preset, true, 'generated story was marked as preset');
    assert(result.events.join(' ').includes('雾中来信'));
    assert(!/三国|黄巾|184年|刘备/.test(result.events.join(' ')));
    assert.strictEqual(errors.length, 0, errors.join('\n'));
    await game.screenshot({ path: path.resolve(__dirname, '../assets/0806_generated_story_v1.png'), fullPage: true });
    await game.close();
    console.log('generated story UI test passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
