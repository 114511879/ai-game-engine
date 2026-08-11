const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');

(async function () {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:8765/api/rag/retrieve', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: {
          rewritten_queries: ['量子园艺 节奏机制', '神经天气 游戏反馈'],
          limitations: ['当前引擎会把连续天气模拟简化为离散事件。']
        },
        documents: [
          { id: 'local_1', title: '节奏反馈基础', score: 0.62, metadata: { type: 'mechanic', source: 'curated' } },
          { id: 'web_1', title: 'Procedural Weather Design', score: 0.71, metadata: { type: 'web_reference', source: 'duckduckgo', url: 'https://example.com/weather-design' } }
        ],
        coverage: 0.61,
        web_search_needed: true,
        web_search_used: true,
        web_sources: [{ title: 'Procedural Weather Design', url: 'https://example.com/weather-design' }],
        source_counts: { local: 1, web: 1 },
        context_text: '联网设计参考'
      })
    }));
    await page.route('https://api.deepseek.com/**', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      const system = (((body.messages || [])[0] || {}).content || '');
      const result = system.includes('AI游戏顾问')
        ? { intent: {}, ready: false, summary: '继续澄清' }
        : { meta: { game_type: 'simulation', title: '量子花圃' }, player: { hp: 5 }, world: { theme: 'sci_fi' }, simulation: { starting_resources: 20 } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }) });
    });

    await page.goto('http://127.0.0.1:4173/');
    await page.waitForURL(/AI-ENGINE/);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#prompt').fill('制作一个量子园艺和神经天气结合的游戏');
    await page.locator('#btnSubmit').click();
    await page.getByRole('button', { name: '模拟经营' }).click();
    await page.getByRole('button', { name: '农场经营' }).click();
    await page.getByRole('button', { name: '标准挑战' }).click();
    await page.getByRole('button', { name: '科幻未来' }).click();
    await page.locator('#btnConsultantConfirm').click();

    await page.waitForFunction(() => document.querySelectorAll('.research-document').length === 2);
    assert((await page.locator('#researchStatus').textContent()).includes('本地 1 / 联网 1'));
    assert((await page.locator('#researchWebStatus').textContent()).includes('已联网检索 1 个来源'));
    const source = page.locator('.research-document-source');
    assert.strictEqual(await source.getAttribute('href'), 'https://example.com/weather-design');
    assert.strictEqual(await source.getAttribute('target'), '_blank');
    await page.locator('.game-card').waitFor({ state: 'visible' });
    assert.strictEqual(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: path.resolve(__dirname, '../assets/0806_web_search_v1.png'), fullPage: true });
    console.log('web search UI test passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
