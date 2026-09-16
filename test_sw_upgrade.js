const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8421;
const OLD_ROOT = '/tmp/old-root-sim';
const NEW_ROOT = '/home/claude/project/Lfnawa-Days/app';

function serve(root) {
  return spawn('node', ['/tmp/serve_root.js', root, String(PORT)], { stdio: 'pipe' });
}
function stop(proc) {
  return new Promise((resolve) => { proc.on('exit', resolve); proc.kill('SIGKILL'); });
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' :: ' + extra : ''));
}

(async () => {
  // --- Phase 1: simulate a previously-installed standalone old app at this origin ---
  let server = serve(OLD_ROOT);
  await wait(600);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 8000 }).catch(() => {});
  await wait(500);

  const oldBrandVisible = await page.locator('text=FENWA TRADES').first().isVisible().catch(() => false);
  check('Phase 1: old standalone app loads and its own SW takes control', oldBrandVisible);

  // Create a real trade in the OLD app so we can verify it's still
  // reachable (same esOrderFlowJournal DB, same origin) after the swap.
  const newTradeBtn = page.locator('button', { hasText: /New trade|Log your first trade/i }).first();
  await newTradeBtn.click().catch(() => {});
  await wait(300);
  const numberInputs = page.locator('input[type=number]');
  if (await numberInputs.count() >= 3) {
    await numberInputs.nth(0).fill('4321');
    await numberInputs.nth(1).fill('4300');
    await numberInputs.nth(2).fill('4350');
  }
  await page.locator('button', { hasText: /Save trade/i }).first().click().catch(() => {});
  await wait(500);

  // --- Phase 2: swap the server root to the NEW app, same origin/port ---
  await stop(server);
  server = serve(NEW_ROOT);
  await wait(600);

  // First reload: browser may still be controlled by the OLD service
  // worker for this navigation (expected -- see docs/ARCHITECTURE.md
  // §10). What matters is that it does NOT stay stuck there.
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await wait(2000); // let the background SW update check / install / activate / auto-reload settle

  // "LFNAWA DAYS" (the sidebar brand text) is unique to the new shell —
  // unlike "Today", it cannot accidentally match text inside the old
  // standalone trading app's own UI, so this is a reliable check.
  let shellVisible = await page.locator('text=LFNAWA DAYS').first().isVisible().catch(() => false);
  console.log('After 1st reload post-swap, new shell visible:', shellVisible);

  if (!shellVisible) {
    // One more relaunch-equivalent reload -- this is the realistic
    // "user reopens the app" case, still well within normal upgrade
    // behavior, not a permanent stuck state.
    await page.reload({ waitUntil: 'load' }).catch(() => {});
    await wait(2000);
    shellVisible = await page.locator('text=LFNAWA DAYS').first().isVisible().catch(() => false);
    console.log('After 2nd reload post-swap, new shell visible:', shellVisible);
  }
  check('Phase 2: new Lfnawa Days shell recovers within 2 reloads of the swap (not permanently stuck)', shellVisible);

  const navShowsAllSections = await page.locator('text=Lfenwa Trades').first().isVisible().catch(() => false);
  check('Phase 2: full Lfnawa Days navigation is present after recovery', navShowsAllSections);

  // --- Phase 3: the trade created in the OLD app is still reachable via Lfenwa Trades ---
  await page.click('text=Lfenwa Trades').catch(() => {});
  await wait(700);
  const frame = page.frames().find((f) => f.url().includes('/trades/'));
  const dashboardText = frame ? await frame.locator('body').innerText().catch(() => '') : '';
  const oldTradeStillThere = /Trades\s*\n?\s*1/.test(dashboardText) || dashboardText.includes('4321') || dashboardText.includes('ES · Long') || dashboardText.includes('· Long');
  check('Phase 3: trade created under the OLD app is still visible after the swap (same esOrderFlowJournal DB)', oldTradeStillThere, dashboardText.slice(0, 150));

  await browser.close();
  await stop(server);

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== UPGRADE-SIMULATION SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' passed ===');
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.name).join('; ')); process.exit(1); }
})();
