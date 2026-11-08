import { checker, startServer, launch } from './helpers.mjs';
const PORT = 8751, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const VARIANTS = {
  normal: '',
  noTextWrap: 'h1,h2,h3,p,.hint,.sub,.empty { text-wrap: wrap !important }',
  noRoot: 'html { scrollbar-gutter: auto !important } body { -webkit-font-smoothing: auto !important }',
  noBtnTransform: 'button, .card { transition: background-color .12s, color .12s, border-color .12s !important }',
  noTouchAction: '* { touch-action: auto !important }',
  allOff: 'h1,h2,h3,p,.hint,.sub,.empty { text-wrap: wrap !important } html { scrollbar-gutter: auto !important } body { -webkit-font-smoothing: auto !important } button, .card { transition: background-color .12s, color .12s, border-color .12s !important } * { touch-action: auto !important }',
};
const measure = async (p) => {
  const t0 = Date.now();
  await p.click('#theme');
  await p.waitForFunction(() => document.documentElement.dataset.theme === 'light', null, { polling: 'raf', timeout: 5000 }).catch(() => {});
  return Date.now() - t0;
};
try {
  for (const [name, css] of Object.entries(VARIANTS)) {
    const res = { cold: [], afterDialog: [], immediate: [] };
    for (let round = 0; round < 3; round++) {
      for (const scenario of ['cold', 'afterDialog', 'immediate']) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', bypassCSP: true });
        const p = await ctx.newPage();
        await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
        if (css) await p.addStyleTag({ content: css });
        await p.waitForTimeout(300);
        if (scenario !== 'cold') { await p.click('#addBtn'); await p.waitForTimeout(400); await p.click('#cancel'); if (scenario === 'afterDialog') await p.waitForTimeout(800); }
        res[scenario].push(await measure(p));
        await ctx.close();
      }
    }
    console.log('PROBE', name.padEnd(15), JSON.stringify(res));
  }
} finally { await browser.close(); server.close(); }
ok(true, 'probe done');
process.exit(0);
