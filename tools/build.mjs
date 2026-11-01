// Builds the site in site/ from src/:
//   index.html                      <- src/template.html + src/i18n.json
//   aviso-legal.html, privacidad.html, cookies.html
//                                   <- src/legal.html + src/legal.json + src/owner.json
//   sitemap.xml, robots.txt
// Spanish text is written into the HTML (what search engines and no-JS visitors see);
// each page's script swaps in RU / TR / EN from the dictionary embedded in it.
//
//   node tools/build.mjs                 -> site/
//   node tools/build.mjs --embed <file>  -> also writes a body-only copy of index.html for an embedded preview
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const write = (f, s) => { writeFileSync(join(root, f), s); console.log(f.padEnd(24), (s.length / 1024).toFixed(1) + ' KB'); };

const SITE = 'https://peludos-en-calma.github.io/';
const GOOGLE_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Playfair+Display:ital,wght@1,500;1,600&family=Unbounded:wght@400;500;600&display=swap">';
const DOCS = [['aviso', 'aviso-legal'], ['privacy', 'privacidad'], ['cookies', 'cookies']];
const SHARED_UI = ['home', 'langLabel', 'cta', 'skip', 'where', 'disclaimer', 'photos', 'sections', 'nav', 'lgNav', 'lgAviso', 'lgPrivacy', 'lgCookies'];

const main = JSON.parse(read('src/i18n.json'));
const legal = JSON.parse(read('src/legal.json'));
const owner = JSON.parse(read('src/owner.json'));
const baseCss = read('src/base.css');
const fontCss = read('src/fonts.css');
const LANGS = Object.keys(main);

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

// Every language must have exactly the same keys and list lengths as Spanish.
function sameShape(a, b, where) {
  if (typeof a === 'string') { if (typeof b !== 'string') throw new Error(`${where}: expected text`); return; }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) throw new Error(`${where}: expected ${a.length} items`);
    a.forEach((x, i) => sameShape(x, b[i], `${where}.${i}`));
    return;
  }
  if (a && typeof a === 'object') {
    for (const k of Object.keys(a)) {
      if (!b || !(k in b)) throw new Error(`${where}: missing "${k}"`);
      sameShape(a[k], b[k], `${where}.${k}`);
    }
  }
}
for (const l of LANGS) {
  sameShape(main.es, main[l], `i18n.json ${l}`);
  sameShape(legal.es, legal[l], `legal.json ${l}`);
}

// {name}, {nif}, {address}, {email}, {phone} come from src/owner.json
const fillOwner = (v) => {
  if (typeof v === 'string') return v.replace(/\{(\w+)\}/g, (m, k) => (k in owner ? owner[k] : m));
  if (Array.isArray(v)) return v.map(fillOwner);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillOwner(x)]));
  return v;
};

function render(html, dict, { embed = false } = {}) {
  const es = dict.es;
  html = html
    .replace('/*FONT_FACES*/', () => (embed ? '' : fontCss))
    .replace('/*BASE_CSS*/', () => baseCss)
    .replace('<!--FONT_LINK-->', () => (embed ? GOOGLE_FONTS : ''));
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
      tag = re.test(tag) ? tag.replace(re, () => set) : tag.replace(/\sdata-i18n-attr=/, `${set} data-i18n-attr=`);
    }
    return tag;
  });
  return html.replace('/*I18N_JSON*/', () => JSON.stringify(dict).replace(/</g, '\\u003c'));
}

/* ---------- landing ---------- */
const faq = main.es.faqs.map((_, i) => {
  const open = i === 0;
  return `    <div class="acc${open ? ' open' : ''}" data-reveal>
      <h3><button type="button" class="acc-btn" id="faq-q${i}" aria-expanded="${open}" aria-controls="faq-a${i}"><span data-i18n="faqs.${i}.q"></span><span class="acc-ico"><svg class="ic"><use href="#i-plus"></use></svg></span></button></h3>
      <div class="acc-panel" id="faq-a${i}" role="region" aria-labelledby="faq-q${i}"${open ? '' : ' inert aria-hidden="true"'}><div><p data-i18n="faqs.${i}.a"></p></div></div>
    </div>`;
}).join('\n');
const landing = read('src/template.html').replace('    <!--FAQ_ITEMS-->', () => faq);
write('site/index.html', render(landing, main).replace('<!--ARTIFACT_META-->\n', ''));

/* ---------- legal pages ---------- */
for (const [key, slug] of DOCS) {
  const dict = {};
  for (const l of LANGS) {
    const doc = fillOwner(legal[l].docs[key]);
    dict[l] = {
      ...Object.fromEntries(SHARED_UI.map((k) => [k, main[l][k]])),
      ...legal[l].ui,
      doc: { ...doc, metaTitle: `${doc.title} · Bienestar Animal` },
    };
  }
  const sections = legal.es.docs[key].blocks.map((b, i) => {
    const ps = (list, field) => (list || []).map((_, j) => `        <p data-i18n="doc.blocks.${i}.${field}.${j}"></p>`).join('\n');
    const lis = b.li ? `        <ul>\n${b.li.map((_, j) => `          <li data-i18n="doc.blocks.${i}.li.${j}"></li>`).join('\n')}\n        </ul>` : '';
    return [`      <section class="legal-sec" style="--i:${i}">`, `        <h2 data-i18n="doc.blocks.${i}.h"></h2>`, ps(b.p, 'p'), lis, ps(b.p2, 'p2'), '      </section>']
      .filter(Boolean).join('\n');
  }).join('\n');
  const html = read('src/legal.html')
    .replaceAll('{slug}', slug)
    .replace('<!--LEGAL_SECTIONS-->', () => sections)
    .replaceAll(`data-doc="${key}"`, `data-doc="${key}" aria-current="page"`);
  write(`site/${slug}.html`, render(html, dict));
}

/* ---------- sitemap & robots ---------- */
const pages = ['', ...DOCS.map(([, slug]) => `${slug}.html`)];
write('site/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>
`);
write('site/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

/* ---------- optional body-only copy of the landing for an embedded preview ---------- */
const flag = process.argv.indexOf('--embed');
if (flag > -1 && process.argv[flag + 1]) {
  let html = render(landing, main, { embed: true });
  for (const [, slug] of DOCS) html = html.replaceAll(`href="${slug}.html"`, `href="${SITE}${slug}.html"`);
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset="utf-8">\n/, '')
    .replace(/<meta name="viewport"[^>]*>\n/, '')
    .replace('<!--ARTIFACT_META-->', '<meta name="claude:viewport-fit-sides" content="cover">');
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
  const title = head.match(/<title[^>]*>[\s\S]*?<\/title>\n/)[0];
  writeFileSync(process.argv[flag + 1], title + head.replace(title, '') + body);
  console.log('embed copy ->', process.argv[flag + 1]);
}
