// Builds site/index.html from src/template.html and src/i18n.json.
// Spanish text is written into the HTML (what search engines and no-JS visitors see);
// the page script swaps in RU / TR / EN from the embedded dictionary.
//
//   node tools/build.mjs                 -> site/index.html
//   node tools/build.mjs --embed <file>  -> also writes a body-only copy for an embedded preview
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'src/i18n.json'), 'utf8'));
const es = data.es;
let html = readFileSync(join(root, 'src/template.html'), 'utf8');

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

for (const lang of Object.keys(data)) {
  for (const key of Object.keys(es)) {
    if (!(key in data[lang])) throw new Error(`"${lang}" is missing key "${key}"`);
  }
}

// FAQ items: one per entry in the dictionary, the first one open.
const faq = es.faqs.map((_, i) => {
  const open = i === 0;
  return `    <div class="acc${open ? ' open' : ''}" data-reveal>
      <h3><button type="button" class="acc-btn" id="faq-q${i}" aria-expanded="${open}" aria-controls="faq-a${i}"><span data-i18n="faqs.${i}.q"></span><span class="acc-ico"><svg class="ic"><use href="#i-plus"></use></svg></span></button></h3>
      <div class="acc-panel" id="faq-a${i}" role="region" aria-labelledby="faq-q${i}"${open ? '' : ' inert aria-hidden="true"'}><div><p data-i18n="faqs.${i}.a"></p></div></div>
    </div>`;
}).join('\n');
html = html.replace('    <!--FAQ_ITEMS-->', faq);

// Text: <tag data-i18n="path"></tag>
html = html.replace(/(<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>)(<\/\2>)/g, (m, open, tag, path, close) => {
  const v = get(es, path);
  if (typeof v !== 'string') throw new Error(`No Spanish text for "${path}"`);
  return open + esc(v) + close;
});

// Attributes: data-i18n-attr="alt:path;aria-label:path"
html = html.replace(/<[a-z][^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g, (tag, spec) => {
  for (const pair of spec.split(';')) {
    const [attr, path] = pair.split(':');
    const v = get(es, path);
    if (typeof v !== 'string') throw new Error(`No Spanish text for "${path}"`);
    const re = new RegExp(`\\s${attr}="[^"]*"`);
    const set = ` ${attr}="${escAttr(v)}"`;
    tag = re.test(tag) ? tag.replace(re, set) : tag.replace(/\sdata-i18n-attr=/, `${set} data-i18n-attr=`);
  }
  return tag;
});

html = html.replace('/*I18N_JSON*/', JSON.stringify(data).replace(/</g, '\\u003c'));

const site = html.replace('<!--ARTIFACT_META-->\n', '');
writeFileSync(join(root, 'site/index.html'), site);
console.log('site/index.html', (site.length / 1024).toFixed(1) + ' KB');

const flag = process.argv.indexOf('--embed');
if (flag > -1 && process.argv[flag + 1]) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset="utf-8">\n/, '')
    .replace(/<meta name="viewport"[^>]*>\n/, '')
    .replace('<!--ARTIFACT_META-->', '<meta name="claude:viewport-fit-sides" content="cover">');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  const title = head.match(/<title[^>]*>[\s\S]*?<\/title>\n/)[0];
  writeFileSync(process.argv[flag + 1], title + head.replace(title, '') + body);
  console.log('embed copy ->', process.argv[flag + 1]);
}
