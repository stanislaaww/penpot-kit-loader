// Kit Builder (Лаб. 10): статический интерпретатор JSON-команд сборки UI-кита.
// Не выполняет произвольный код: принимает только данные {type:'kit-ops', ops:[...]} из вкладки Penpot.
penpot.ui.open('Kit Builder', 'ui.html', { width: 300, height: 150 });

const REF = {};            // имя -> фигура (пока плагин открыт)
const COMP = {};           // имя -> компонент библиотеки
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[KIT] ' + a.join(' '));
const fileId = () => { try { return penpot.currentFile.id; } catch (e) { return undefined; } };
const lib = () => penpot.library.local;
const pagesList = () => { try { return penpot.currentFile.pages; } catch (e) { return []; } };

function splitKey(key) { const i = key.lastIndexOf('/'); return i < 0 ? ['', key] : [key.slice(0, i), key.slice(i + 1)]; }
function findColor(key) { const [p, n] = splitKey(key); return lib().colors.find((c) => c.name === n && (c.path || '') === p); }
function findTypo(key) { const [p, n] = splitKey(key); return lib().typographies.find((t) => t.name === n && (t.path || '') === p); }

function fillSpec(f) {
  if (f && typeof f === 'object') return f;               // градиент и т.п. — как есть
  if (typeof f === 'string' && f[0] === '#') return { fillColor: f, fillOpacity: 1 };
  const c = findColor(f);
  if (!c) throw new Error('нет цвета в библиотеке: ' + f);
  return { fillColor: c.color, fillOpacity: 1, fillColorRefId: c.id, fillColorRefFile: fileId() };
}
function strokeSpec(s) {
  const c = findColor(s.c);
  if (!c) throw new Error('нет цвета обводки: ' + s.c);
  return { strokeColor: c.color, strokeOpacity: 1, strokeStyle: 'solid', strokeWidth: s.w || 1,
           strokeAlignment: s.a || 'inner', strokeColorRefId: c.id, strokeColorRefFile: fileId() };
}
const tryset = (fn) => { try { fn(); return true; } catch (e) { return false; } };

function setSizing(s, sz, inFlex) {
  if (!sz) return;
  const map = { fill: 'fill', hug: 'auto', fix: 'fix' };
  if (inFlex && s.layoutChild) {
    if (sz.w) tryset(() => { s.layoutChild.horizontalSizing = map[sz.w]; });
    if (sz.h) tryset(() => { s.layoutChild.verticalSizing = map[sz.h]; });
  }
  if (s.type === 'board' && s.flex) {
    if (sz.w === 'hug') { tryset(() => { s.horizontalSizing = 'fit-content'; }) || tryset(() => { s.horizontalSizing = 'auto'; }); }
    if (sz.h === 'hug') { tryset(() => { s.verticalSizing = 'fit-content'; }) || tryset(() => { s.verticalSizing = 'auto'; }); }
  }
}

async function build(n, parent) {
  let s;
  switch (n.t) {
    case 'board': s = penpot.createBoard(); break;
    case 'rect': s = penpot.createRectangle(); break;
    case 'ellipse': s = penpot.createEllipse(); break;
    case 'text': s = penpot.createText(n.text || ' '); break;
    case 'svg': s = penpot.createShapeFromSvg(n.svg); break;
    default: throw new Error('неизвестный тип ' + n.t);
  }
  if (!s) throw new Error('не создан объект типа ' + n.t + ' (' + (n.name || '') + ')');
  s.name = n.name || n.t;
  if (n.t === 'board') {
    if (n.flex) {
      const f = s.addFlexLayout();
      f.dir = n.flex.dir || 'column';
      if (n.flex.wrap) f.wrap = n.flex.wrap;
      const gap = n.flex.gap || 0;
      f.rowGap = n.flex.rowGap !== undefined ? n.flex.rowGap : gap;
      f.columnGap = n.flex.colGap !== undefined ? n.flex.colGap : gap;
      const p = n.flex.pad || [0, 0, 0, 0];
      f.topPadding = p[0]; f.rightPadding = p[1]; f.bottomPadding = p[2]; f.leftPadding = p[3];
      if (n.flex.align) f.alignItems = n.flex.align;
      if (n.flex.justify) f.justifyContent = n.flex.justify;
    }
    s.clipContent = n.clip === true;
  }
  if (parent) parent.appendChild(s);
  if (n.t !== 'text' && (n.w || n.h)) s.resize(n.w || s.width, n.h || s.height);
  if (!parent) { if (n.x !== undefined) s.x = n.x; if (n.y !== undefined) s.y = n.y; }
  if (n.t === 'text') {
    if (n.typo) {
      const ty = findTypo(n.typo);
      if (!ty) throw new Error('нет текстового стиля: ' + n.typo);
      s.applyTypography(ty);
    }
    s.characters = n.text;
    if (n.fill) s.fills = [fillSpec(n.fill)];
    if (n.align) s.textAlign = n.align;
    if (n.w) { s.growType = 'auto-height'; s.resize(n.w, s.height); } else { s.growType = 'auto-width'; }
  } else {
    if (n.fill === null) s.fills = [];
    else if (n.fill !== undefined) s.fills = [fillSpec(n.fill)];
    if (n.stroke) s.strokes = (Array.isArray(n.stroke) ? n.stroke : [n.stroke]).map(strokeSpec);
    if (n.radius !== undefined && 'borderRadius' in s) s.borderRadius = n.radius;
  }
  if (n.opacity !== undefined) s.opacity = n.opacity;
  if (n.children) for (const c of n.children) await build(c, s);
  const inFlex = !!(parent && parent.flex);
  setSizing(s, n.sz, inFlex);
  if (n.ref) REF[n.ref] = s;
  return s;
}

function walk(s, fn) { fn(s); if (s.children) s.children.forEach((c) => walk(c, fn)); }

async function run(o) {
  const L = lib();
  switch (o.op) {
    case 'page': {
      let p = pagesList().find((x) => x.name === o.name);
      if (!p && o.rename) { p = pagesList().find((x) => x.name === o.rename); if (p) p.name = o.name; }
      if (!p) { p = penpot.createPage(); p.name = o.name; }
      penpot.openPage(p); await sleep(900);
      if (penpot.currentPage.id !== p.id) throw new Error('страница не открылась: ' + o.name);
      break;
    }
    case 'color': {
      if (findColor(o.path + '/' + o.name)) break;
      const c = L.createColor(); if (!c) throw new Error('createColor вернул null');
      c.name = o.name; c.path = o.path; c.color = o.hex; break;
    }
    case 'typo': {
      if (findTypo(o.path + '/' + o.name)) break;
      const t = L.createTypography(); if (!t) throw new Error('createTypography вернул null');
      const f = penpot.fonts.all.find((x) => x.name === o.family);
      if (!f) throw new Error('нет шрифта ' + o.family);
      const v = f.variants.find((x) => String(x.fontWeight) === String(o.weight) && x.fontStyle === 'normal');
      if (!v) throw new Error('нет начертания ' + o.weight);
      t.name = o.name; t.path = o.path; t.setFont(f, v);
      t.fontSize = String(o.size); t.lineHeight = String(o.lh); t.letterSpacing = String(o.ls || 0);
      break;
    }
    case 'tokens': {
      const cat = L.tokens;
      let set = cat.sets.find((s) => s.name === o.set);
      if (!set) set = cat.addSet({ name: o.set });
      if (!set) throw new Error('addSet вернул null');
      let n = 0;
      for (const t of o.tokens) {
        let r = null;
        try { r = set.addToken({ type: t.type, name: t.name, value: t.value }); } catch (e) { r = null; }
        if (!r) { try { r = set.addToken(t.type, t.name, t.value); } catch (e) { r = null; } }
        if (r) n++;
      }
      log('tokens ' + o.set + ': ' + n + '/' + o.tokens.length);
      break;
    }
    case 'build': { const p = o.parent ? REF[o.parent] : null; await build(o.node, p); break; }
    case 'component': {
      const b = await build(o.node, null);
      const c = L.createComponent([b]); if (!c) throw new Error('createComponent вернул null');
      c.name = o.name; if (o.path) c.path = o.path;
      COMP[o.ref] = c; REF[o.ref + ':main'] = b; break;
    }
    case 'variants': {
      const mains = o.refs.map((r) => REF[r + ':main']);
      const vc = penpot.createVariantFromComponents(mains);
      if (!vc) throw new Error('createVariantFromComponents вернул null');
      REF[o.ref] = vc;
      const vs = COMP[o.refs[0]].variants;
      if (!vs) throw new Error('у компонента нет .variants');
      const want = (o.props || []).length;
      let guard = 0;
      while (vs.properties.length < want && guard++ < 6) { vs.addProperty(); }
      log('variant props: ' + JSON.stringify(vs.properties));
      (o.props || []).forEach((p, k) => { try { vs.renameProperty(k, p); } catch (e) { log('rename ' + k + ': ' + e.message); } });
      o.refs.forEach((r, i) => {
        (o.values[i] || []).forEach((val, k) => { try { COMP[r].setVariantProperty(k, val); } catch (e) { log('setVariantProperty ' + r + ' ' + k + ': ' + e.message); } });
      });
      break;
    }
    case 'instance': {
      const c = COMP[o.comp]; if (!c) throw new Error('нет компонента ' + o.comp);
      const i = c.instance(); if (!i) throw new Error('instance вернул null');
      const p = o.parent ? REF[o.parent] : null;
      if (p) p.appendChild(i);
      if (o.name) i.name = o.name;
      if (!p) { if (o.x !== undefined) i.x = o.x; if (o.y !== undefined) i.y = o.y; }
      if (o.w) i.resize(o.w, o.h || i.height);
      if (o.set) walk(i, (s) => { if (s.type === 'text' && o.set[s.name] !== undefined) s.characters = o.set[s.name]; });
      if (o.hide) walk(i, (s) => { if (o.hide.includes(s.name)) s.visible = false; });
      setSizing(i, o.sz, !!(p && p.flex));
      if (o.ref) REF[o.ref] = i; break;
    }
    case 'clone': { const s = REF[o.of].clone(); if (o.x !== undefined) s.x = o.x; if (o.y !== undefined) s.y = o.y; if (o.name) s.name = o.name; if (o.ref) REF[o.ref] = s; break; }
    case 'measure': { const out = {}; for (const r of o.refs) { const s = REF[r]; if (s) out[r] = [Math.round(s.x), Math.round(s.y), Math.round(s.width), Math.round(s.height)]; } log('MEASURE ' + JSON.stringify(out)); break; }
    case 'remove': { for (const r of o.refs) { const s = REF[r]; if (s) s.remove(); } break; }
    case 'removeShapes': { const ss = penpot.currentPage.findShapes({ name: o.name }); ss.forEach((s) => s.remove()); log('removed ' + ss.length); break; }
    case 'libremove': {
      const list = o.kind === 'color' ? L.colors : L.typographies;
      const [p, n] = splitKey(o.key);
      list.filter((x) => x.name === n && (x.path || '') === p).forEach((x) => x.remove());
      break;
    }
    case 'dump': {
      log('DUMP ' + JSON.stringify({ pages: pagesList().map((p) => p.name),
        colors: L.colors.length, typos: L.typographies.map((t) => (t.path ? t.path + '/' : '') + t.name),
        comps: L.components.length,
        sets: (L.tokens && L.tokens.sets ? L.tokens.sets.map((s) => s.name) : 'n/a'), shapesOnPage: penpot.currentPage.findShapes().length }));
      break;
    }
    default: throw new Error('неизвестная операция ' + o.op);
  }
}

penpot.ui.onMessage(async (m) => {
  if (!m || m.type !== 'kit-ops' || !Array.isArray(m.ops)) return;
  let ok = 0, bad = 0;
  for (let i = 0; i < m.ops.length; i++) {
    const o = m.ops[i];
    try { await run(o); ok++; } catch (e) { bad++; log('OP FAIL #' + i + ' ' + o.op + ' ' + (o.ref || o.name || '') + ': ' + ((e && e.message) || e)); }
  }
  log('BATCH ' + (m.id || '') + ' ok=' + ok + ' bad=' + bad);
  penpot.ui.sendMessage({ type: 'done', ok, bad });
});
