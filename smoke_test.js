const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');

const BASE = 'http://localhost:8420';
const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' :: ' + extra : ''));
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext(); // fresh profile — simulates a brand-new install
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text()); });

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  check('Shell loads and shows Today', await page.locator('text=Today').first().isVisible().catch(() => false));
  check('Nav shows Lfenwa Trades item', await page.locator('text=Lfenwa Trades').first().isVisible().catch(() => false));

  // Regression test for the read-only trades bridge: on a brand-new
  // install, Today's "Trading" stat reads the trades DB before the user
  // has ever opened Lfenwa Trades. This must NOT create/poison the
  // esOrderFlowJournal database (see storage.js readTradesKV comment).
  const dbsBeforeOpeningTrades = await page.evaluate(() => indexedDB.databases().then(l => l.map(d => d.name)));
  check('Fresh install: esOrderFlowJournal not created just by viewing Today', !dbsBeforeOpeningTrades.includes('esOrderFlowJournal'), JSON.stringify(dbsBeforeOpeningTrades));

  // Create a My Day entry and verify persistence across reload (Part 30 "Fresh installation" test).
  await page.click('text=My Day');
  await page.waitForTimeout(200);
  await page.click('text=Basic');
  const noteBox = page.locator('textarea').first();
  await noteBox.fill('Playwright smoke test note ' + Date.now());
  await page.waitForTimeout(700); // debounce-free here (writes are immediate on change), just let IDB settle
  const noteValue = await noteBox.inputValue();
  check('My Day note field accepts input', noteValue.includes('Playwright smoke test note'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('text=My Day');
  await page.waitForTimeout(200);
  await page.click('text=Basic');
  const noteAfterReload = await page.locator('textarea').first().inputValue();
  check('My Day note survives reload (IndexedDB persistence)', noteAfterReload.includes('Playwright smoke test note'), noteAfterReload);

  // Metrics rating tap
  await page.click('text=Metrics');
  await page.waitForTimeout(150);
  const ratingButtons = page.locator('button', { hasText: '8' });
  if (await ratingButtons.count() > 0) await ratingButtons.first().click();
  check('Metrics tab renders rating buttons', await ratingButtons.count() > 0);

  // Quick Add -> Activity
  await page.click('text=Today');
  await page.waitForTimeout(200);
  await page.click('button:has-text("Add")');
  await page.waitForTimeout(200);
  await page.click('text=Activity');
  await page.waitForTimeout(150);
  await page.fill('input[placeholder="e.g. Studied React, Gym, Lunch with family"]', 'Playwright activity test');
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(300);
  check('Quick Add > Activity flow completes without crash', consoleErrors.filter(e => e.includes('pageerror')).length === 0, consoleErrors.join(' | '));

  // Calendar renders
  await page.click('text=Calendar');
  await page.waitForTimeout(300);
  check('Calendar view renders month grid', await page.locator('text=' + new Date().toLocaleDateString(undefined, { month: 'long' })).first().isVisible().catch(() => false));

  // Money add
  await page.click('text=Money');
  await page.waitForTimeout(200);
  await page.click('button:has-text("Add")');
  await page.waitForTimeout(150);
  const amountInput = page.locator('input[type=number]').first();
  await amountInput.fill('42');
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(300);
  check('Money: added transaction shows in list', await page.locator('text=42').first().isVisible().catch(() => false));

  // Goals create
  await page.click('text=Goals');
  await page.waitForTimeout(200);
  await page.click('button:has-text("New goal")');
  await page.waitForTimeout(150);
  await page.fill('input[placeholder="e.g. Learn programming"]', 'Playwright test goal');
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(300);
  check('Goals: created goal appears in list', await page.locator('text=Playwright test goal').first().isVisible().catch(() => false));

  // Habits toggle
  await page.click('text=Health & Habits');
  await page.waitForTimeout(300);
  check('Habits: default habits seeded', await page.locator('text=Exercise').first().isVisible().catch(() => false));

  // Settings export backup does not throw
  await page.click('text=Settings');
  await page.waitForTimeout(200);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.click('button:has-text("Export backup")'),
  ]);
  check('Settings: export backup triggers a download', !!download, download ? download.suggestedFilename() : 'no download event');

  // --- Lfenwa Trades embedded iframe ---
  await page.click('text=Lfenwa Trades');
  await page.waitForTimeout(600);
  const frame = page.frames().find(f => f.url().includes('/trades/'));
  check('Lfenwa Trades iframe loads', !!frame);
  if (frame) {
    await frame.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(300);
    const brandVisible = await frame.locator('text=LFENWA TRADES').first().isVisible().catch(() => false);
    check('Lfenwa Trades shows rebranded sidebar label', brandVisible);

    // Create a trade end to end, using the real UI button (no keyboard-shortcut reliance)
    await frame.getByRole('button', { name: /Trades/i }).click().catch(() => frame.click('text=Trades'));
    await page.waitForTimeout(300);
    const newTradeBtn = frame.locator('button', { hasText: /New trade|Log your first trade/i }).first();
    await newTradeBtn.click({ timeout: 5000 }).catch(async () => { await frame.click('text=Trades'); await page.waitForTimeout(200); await newTradeBtn.click(); });
    await page.waitForTimeout(300);
    const hasForm = await frame.locator('text=/Instrument|Direction|Entry price/i').first().isVisible().catch(() => false);
    check('Lfenwa Trades: trade form opens (existing functionality intact)', hasForm);
  }

  // --- Full trade creation + persistence (the most important regression check) ---
  const frame2 = page.frames().find(f => f.url().includes('/trades/'));
  if (frame2) {
    const instrumentSelect = frame2.locator('select').first();
    if (await instrumentSelect.count() > 0) await instrumentSelect.selectOption({ index: 0 }).catch(() => {});
    const numberInputs = frame2.locator('input[type=number]');
    const n = await numberInputs.count();
    // Entry/Stop/Target are typically the first few numeric inputs on the form.
    if (n >= 3) {
      await numberInputs.nth(0).fill('5000');
      await numberInputs.nth(1).fill('4990');
      await numberInputs.nth(2).fill('5020');
    }
    const saveBtn = frame2.locator('button', { hasText: /Save trade/i }).first();
    await saveBtn.click().catch(() => {});
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.click('text=Lfenwa Trades');
    await page.waitForTimeout(700);
    const frame3 = page.frames().find(f => f.url().includes('/trades/'));
    const dashboardText = await frame3?.locator('body').innerText().catch(() => '');
    const tradeCountVisible = /Trades\s*\n?\s*1/.test(dashboardText || '') || (dashboardText || '').includes('ES · Long');
    check('Lfenwa Trades: created trade persists after reload', tradeCountVisible, (dashboardText || '').slice(0, 150));
  }

  // --- Mobile viewport: drawer nav should appear instead of desktop rail ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const desktopRailVisible = await page.locator('.lfnawa-desktop-rail').first().isVisible().catch(() => false);
  const hamburgerVisible = await page.locator('.lfnawa-mobile-drawer').first().isVisible().catch(() => false);
  check('Mobile viewport (390px): desktop rail hidden, hamburger shown', !desktopRailVisible && hamburgerVisible);
  await page.setViewportSize({ width: 1280, height: 800 });

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log('\n=== SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' passed ===');
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.name).join('; '));
    process.exit(1);
  }
})();
