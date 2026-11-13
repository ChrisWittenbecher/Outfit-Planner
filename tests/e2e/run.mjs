import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['add-flow', 'theme-undo', 'outfit-fit', 'double-tap', 'update-persist', 'design-motion', 'pwa', 'calendar', 'search', 'storage', 'ideas', 'pages', 'linkfetch', 'mobile-back', 'selection', 'weather', 'stats', 'share', 'add-queue', 'haptics', 'cloud', 'security'];
const failed = [];
for (const name of FILES) {
  console.log(`\n===== ${name} (${process.env.BROWSER || 'chromium'}) =====`);
  const r = spawnSync(process.execPath, [path.join(dir, name + '.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(name);
}
console.log(failed.length ? `\nGescheitert: ${failed.join(', ')}` : '\nAlle End-to-End-Tests bestanden');
process.exit(failed.length ? 1 : 0);
