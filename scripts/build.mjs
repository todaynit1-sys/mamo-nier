import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { minify } from 'terser';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
if (path.dirname(out) !== root) throw new Error('Invalid output directory');
await fs.mkdir(out, { recursive: true });
// Delete only previously generated files inside this exact output directory.
for (const file of await fs.readdir(out)) {
  if (/^(research\.[a-f0-9]{12}\.js|index\.html|INDEX~1\.HTM)$/.test(file)) await fs.unlink(path.join(out, file));
}
let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
await fs.writeFile(path.join(root, 'INDEX~1.HTM'), html);
html = html.replace(/<link[^>]*data-research-source[^>]*>/g, '')
  .replace(/<script[^>]*data-research-source[^>]*><\/script>/g, '');
const css = await fs.readFile(path.join(root, 'src', 'research.css'), 'utf8');
const ui = (await fs.readFile(path.join(root, 'src', 'research-archive.js'), 'utf8')) + '\n' +
  (await fs.readFile(path.join(root, 'src', 'facility-data.js'), 'utf8')) + '\n' +
  (await fs.readFile(path.join(root, 'src', 'ofp.js'), 'utf8')) + '\n' +
  (await fs.readFile(path.join(root, 'src', 'weather.js'), 'utf8')) + '\n' +
  (await fs.readFile(path.join(root, 'src', 'field-report.js'), 'utf8')) + '\n' +
  (await fs.readFile(path.join(root, 'src', 'field-report-workspace.js'), 'utf8')) + '\n' +
  (await fs.readFile(path.join(root, 'src', 'research.js'), 'utf8'));
const { code } = await minify(ui, { compress: true, mangle: true, format: { comments: false }, sourceMap: false });
const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 12);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const buildRecord = {
  engine_sha256: sha(html.match(/<script>'use strict';([\s\S]*?)<\/script>/)[1]),
  embedded_facilities_sha256: sha(html.match(/<script id="facData" type="application\/json">([\s\S]*?)<\/script>/)[1]),
  research_ui_sha256: sha(code)
};
const asset = `research.${hash}.js`;
html = html.replace('</head>', `<style>${css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()}</style>\n</head>`)
  .replace('</body>', `<script>window.MAMO_BUILD=${JSON.stringify(buildRecord)};</script><script src="./${asset}"></script>\n</body>`);
await fs.writeFile(path.join(out, asset), code);
await fs.writeFile(path.join(out, 'index.html'), html);
await fs.writeFile(path.join(out, 'INDEX~1.HTM'), html);
console.log(`Built dist/index.html and ${asset}; no source maps`);
