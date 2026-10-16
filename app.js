(() => {
  'use strict';

  const C = window.KLUB_CONFIG || {};
  const DEMO = !C.API_URL;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  const STAVY = { navrh: 'V žrebovaní', citame: 'Práve čítame', precitana: 'Prečítaná' };

  const S = {
    auth: store.get('klub_auth'), // { heslo, ja }  – ja = skratka členky
    data: null,
    q: '', stav: 'vsetky', zaner: '', moje: '', sort: 'nove',
    vylucene: new Set(store.get('klub_vylucene') || []),
    drawing: false,
    kandidat: null, // vyžrebovaná, ešte neprijatá kniha
    veto: [],       // vetované knihy v tomto žrebovaní
    vOsudi: 0,
  };

  /* ---------------- API ---------------- */
  async function api(action, params = {}) {
    const body = Object.assign({ action, heslo: S.auth && S.auth.heslo, ja: S.auth && S.auth.ja }, params);
    let res;
    try {
      if (DEMO) res = await window.KLUB_DEMO.handle(body);
      else {
        const r = await fetch(C.API_URL, { method: 'POST', body: JSON.stringify(body) });
        res = await r.json();
      }
    } catch (e) {
      throw new Error('Nepodarilo sa spojiť so serverom. Skontroluj internet a skús znova.');
    }
    if (!res.ok) {
      const err = new Error(res.error || 'Niečo sa pokazilo.');
      err.auth = res.auth === false;
      throw err;
    }
    S.data = res.data;
    return res.data;
  }

  async function run(action, params, okMsg) {
    try {
      const d = await api(action, params);
      if (okMsg) toast(okMsg);
      return d;
    } catch (e) {
      if (e.auth) { logout(); toast('Heslo sa zmenilo, prihlás sa znova.', true); }
      else toast(e.message, true);
      throw e;
    }
  }

  /* ---------------- Pomocníci ---------------- */
  const me = () => S.auth.ja;
  const book = id => S.data.knihy.find(k => k.id === id);
  const nameOf = s => { const c = S.data.clenky.find(x => x.skratka === s); return c && c.meno ? c.meno : s; };
  const names = arr => (Array.isArray(arr) ? arr : String(arr || '').split(/[,;\s]+/)).filter(Boolean).map(nameOf).join(', ');
  const onlyAuthor = k => !k.nazov || k.nazov.trim() === '?';
  const title = k => onlyAuthor(k) ? k.autor : k.nazov;
  const subtitle = k => onlyAuthor(k) ? 'ľubovoľná kniha od autora' : k.autor;
  const genres = k => String(k.zaner || '').split(',').map(s => s.trim()).filter(g => g && g !== 'autor');
  const allGenres = () => [...new Set(S.data.knihy.flatMap(genres))].sort((a, b) => a.localeCompare(b, 'sk'));
  const ratingsOf = id => S.data.hodnotenia.filter(h => h.kniha_id === id);
  function avg(id) {
    const r = ratingsOf(id).map(h => +h.hviezdy).filter(n => n > 0);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  }
  function fmtDate(iso, opts) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('sk-SK', opts || { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function daysUntil(iso) {
    const d = new Date(iso + 'T12:00:00'), t = new Date();
    t.setHours(12, 0, 0, 0);
    return Math.round((d - t) / 864e5);
  }
  function inDays(n) {
    if (n === 0) return 'dnes';
    if (n === 1) return 'zajtra';
    if (n === -1) return 'včera';
    if (n < 0) return `pred ${-n} dňami`;
    if (n < 5) return `o ${n} dni`;
    return `o ${n} dní`;
  }
  const plural = (n, one, few, many) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;
  const knihCount = n => `${n} ${plural(n, 'kniha', 'knihy', 'kníh')}`;
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  const hours = k => { const m = String(k.dlzka || '').match(/\d+/); return m ? +m[0] : 999; };

  const PAL = [['#4f5b2e', '#efdcae'], ['#8e3f24', '#f3dcb4'], ['#2f4a35', '#e3c47a'], ['#6e2a2a', '#efd3a8'], ['#9a6a24', '#f8ebcb'], ['#33415a', '#e9d6a6'], ['#5a3a3f', '#ecd2b0'], ['#6b7a3c', '#f6ebcd'], ['#3d3324', '#e3c47a']];
  function cover(k, cls = '') {
    const p = PAL[hash(k.nazov + k.autor) % PAL.length];
    const inner = onlyAuthor(k)
      ? `<span class="cv-q">?</span><span class="cv-t">${esc(k.autor)}</span>`
      : `<span class="cv-t">${esc(k.nazov)}</span><span class="cv-a">${esc(k.autor)}</span>`;
    return `<div class="cover ${cls}" style="--c:${p[0]};--c2:${p[1]}">${inner}</div>`;
  }
  function stars(v, cls = '') {
    if (!v) return '';
    const full = Math.round(v);
    return `<span class="stars ${cls}" title="${v.toFixed(1)} z 5">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span>`;
  }
  const badge = st => `<span class="badge b-${st}">${STAVY[st] || st}</span>`;

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = ''), err ? 5000 : 2600);
  }

  /* ---------------- Modál ---------------- */
  function modal(html, cls = '') {
    $('#modal-root').innerHTML = `<div class="modal-bg" data-act="bg"><div class="modal ${cls}" role="dialog" aria-modal="true"><button class="x" data-act="close" aria-label="Zavrieť">×</button>${html}</div></div>`;
    document.body.classList.add('noscroll');
    const f = $('#modal-root [autofocus]');
    if (f) f.focus();
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.classList.remove('noscroll');
  }

  /* ---------------- Prihlásenie ---------------- */
  function logout() {
    S.auth = null; S.data = null;
    store.del('klub_auth');
    closeModal();
    render();
  }

  function vLogin(err = '') {
    return `<div class="login"><div class="login-card">
      <h1>${esc(C.NAZOV || 'Čitateľský klub')}</h1>
      <p class="muted">Súkromná knižnica nášho klubu. Vstup len pre členky.</p>
      <form data-form="login" autocomplete="on">
        <label>Heslo klubu<input type="password" name="heslo" autocomplete="current-password" required autofocus></label>
        <button class="btn primary wide" type="submit">Vstúpiť</button>
        <p class="err">${esc(err)}</p>
      </form>
      ${DEMO ? '<p class="hint">Ukážkový režim – heslo je <b>kniha</b>.</p>' : ''}
    </div></div>`;
  }

  function vWho() {
    const cl = S.data.clenky;
    return `<div class="login"><div class="login-card">
      <h1>Kto si?</h1>
      <p class="muted">Podľa toho budeme vedieť, kto knihu navrhol, prečítal a ako ju hodnotil.</p>
      <div class="who-list">${cl.map(c => `<button class="chip big" data-act="iam" data-m="${esc(c.skratka)}">${esc(c.meno || c.skratka)}</button>`).join('')}</div>
      ${cl.length ? '' : `<form data-form="iam" class="row"><input name="ja" placeholder="Tvoja skratka (napr. E)" required autofocus><button class="btn" type="submit">Pokračovať</button></form>`}
    </div></div>`;
  }

  /* ---------------- Rozloženie ---------------- */
  const NAV = [['domov', 'Domov'], ['kniznica', 'Knižnica'], ['zrebovanie', 'Žrebovanie'], ['klub', 'Klub']];

  function shell(view, body) {
    return `<div class="masthead">
        <a href="#domov" class="mast-link"><img class="mast-img" src="img/clenky.webp" alt="Členky klubu" width="1000" height="382">
        <span class="mast-title">${esc(C.NAZOV || 'Čitateľský klub')}</span></a>
        ${C.PODNAZOV ? `<small class="mast-sub">${esc(C.PODNAZOV)}</small>` : ''}
      </div>
      <header class="top"><div class="top-in">
        <nav>${NAV.map(([k, l]) => `<a href="#${k}" class="${k === view ? 'on' : ''}">${l}</a>`).join('')}</nav>
        <a class="me" href="#klub" title="Prihlásená">${esc(nameOf(me()))}</a>
      </div></header>
      ${DEMO ? '<div class="demo">Ukážkový režim s vymyslenými knihami – zmeny sa ukladajú len v tomto prehliadači.</div>' : ''}
      <main class="wrap v-${view}">${body}</main>
      <footer class="wrap foot">${esc(C.NAZOV || '')} · od roku 2024</footer>`;
  }

  function render() {
    const app = $('#app');
    if (!S.auth || !S.auth.heslo) { app.innerHTML = vLogin(); focusAuto(); return; }
    if (!S.data) { app.innerHTML = '<div class="loading"><div class="spinner"></div></div>'; return; }
    if (!S.auth.ja) { app.innerHTML = vWho(); focusAuto(); return; }
    let view = location.hash.slice(1);
    if (!VIEWS[view]) view = 'domov';
    app.innerHTML = shell(view, VIEWS[view]());
  }
  function focusAuto() { const f = $('#app [autofocus]'); if (f) f.focus(); }

  /* ---------------- Domov ---------------- */
  function vDomov() {
    const d = S.data, n = d.nastavenia || {};
    const cur = d.knihy.filter(k => k.stav === 'citame');
    const read = d.knihy.filter(k => k.stav === 'precitana').sort((a, b) => (b.citane || '').localeCompare(a.citane || ''));
    const pool = d.knihy.filter(k => k.stav === 'navrh');
    const fresh = pool.slice().sort((a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0)).slice(0, 6);

    const curHtml = cur.length ? cur.map(k => {
      const z = d.zrebovania.filter(x => x.kniha_id === k.id).pop();
      return `<div class="now">
        <button class="now-cover" data-act="open" data-id="${esc(k.id)}">${cover(k, 'lg')}</button>
        <div class="now-txt">
          <div class="eyebrow">Práve čítame</div>
          <h2>${esc(title(k))}</h2>
          <p class="author">${esc(subtitle(k))}</p>
          <p class="meta">${[k.dlzka && esc(k.dlzka), genres(k).map(esc).join(', '), k.navrhla && `navrhla ${esc(names(k.navrhla))}`].filter(Boolean).join(' · ')}</p>
          ${z ? `<p class="meta">Vyžrebované ${fmtDate(z.datum)}${z.zrebovala ? `, losovala ${esc(nameOf(z.zrebovala))}` : ''}</p>` : ''}
          <button class="btn ghost" data-act="open" data-id="${esc(k.id)}">Detail a hodnotenie</button>
        </div></div>`;
    }).join('') : `<div class="now empty"><div class="now-txt"><div class="eyebrow">Práve čítame</div><h2>Zatiaľ nič</h2><p class="muted">V žrebovaní čaká ${knihCount(pool.length)}.</p><a class="btn primary" href="#zrebovanie">Ísť žrebovať</a></div></div>`;

    let meet;
    if (n.stretnutie_datum) {
      const dd = daysUntil(n.stretnutie_datum), dt = new Date(n.stretnutie_datum + 'T12:00:00');
      meet = `<div class="meet">
        <div class="eyebrow">Najbližšie stretnutie</div>
        <div class="cal"><span class="cal-m">${dt.toLocaleDateString('sk-SK', { month: 'long' })}</span><span class="cal-d">${dt.getDate()}</span><span class="cal-w">${dt.toLocaleDateString('sk-SK', { weekday: 'long' })}</span></div>
        <p class="when"><b>${inDays(dd)}</b>${n.stretnutie_cas ? ` o ${esc(n.stretnutie_cas)}` : ''}</p>
        ${n.stretnutie_miesto ? `<p>${esc(n.stretnutie_miesto)}</p>` : ''}
        ${n.stretnutie_poznamka ? `<p class="muted small">${esc(n.stretnutie_poznamka)}</p>` : ''}
        <a class="link small" href="#klub">upraviť</a>
      </div>`;
    } else {
      meet = `<div class="meet"><div class="eyebrow">Najbližšie stretnutie</div><p class="muted">Dátum ešte nie je dohodnutý.</p><a class="btn ghost" href="#klub">Nastaviť stretnutie</a></div>`;
    }

    const addHtml = `<div class="addbox">
        <div class="eyebrow">Pridaj novú knihu</div>
        <p class="muted small">Napíš názov a autora, ostatné údaje sa pokúsime dohľadať.</p>
        <form data-form="quickadd" class="form">
          <label>Názov<input name="nazov" placeholder="napr. Malý princ"></label>
          <label>Autor/ka<input name="autor" placeholder="napr. Exupéry"></label>
          <button class="btn primary wide" type="submit">Pridať knihu</button>
        </form>
      </div>`;
    return `<section class="hero">${addHtml}${curHtml}${meet}</section>
      <div class="shelf-band full" aria-hidden="true"></div>
      <section class="stats">
        <div><b>${pool.length}</b><span>${plural(pool.length, 'kniha', 'knihy', 'kníh')} v žrebovaní</span></div>
        <div><b>${read.length}</b><span>${plural(read.length, 'prečítaná', 'prečítané', 'prečítaných')} spolu</span></div>
        <div><b>${d.knihy.filter(k => k.precitali.includes(me())).length}</b><span>prečítala si ty</span></div>
      </section>
      ${read.length ? `<section><div class="sec-h"><h3>Prečítali sme</h3><a class="link" href="#kniznica" data-act="filter" data-stav="precitana">všetky →</a></div>
        <div class="shelf">${read.map(k => `<button class="shelf-b" data-act="open" data-id="${esc(k.id)}">${cover(k)}<span class="t">${esc(title(k))}</span><span class="s">${stars(avg(k.id))}${k.citane ? `<em>${fmtDate(k.citane, { month: 'short', year: 'numeric' })}</em>` : ''}</span></button>`).join('')}</div></section>` : ''}
      <section><div class="sec-h"><h3>Najnovšie návrhy</h3><button class="btn primary sm" data-act="add">+ Pridať knihu</button></div>
        ${fresh.length ? `<div class="grid">${fresh.map(card).join('')}</div>` : '<p class="muted">Zatiaľ žiadne návrhy.</p>'}</section>`;
  }

  /* ---------------- Knižnica ---------------- */
  function card(k) {
    const a = avg(k.id);
    const mine = k.precitali.includes(me()) ? '<span title="Prečítala si">✓ čítala si</span>' : '';
    return `<button class="card" data-act="open" data-id="${esc(k.id)}">
      ${cover(k)}
      <span class="card-b">
        <span class="card-t">${esc(title(k))}</span>
        <span class="card-a">${esc(subtitle(k))}</span>
        <span class="card-m">${badge(k.stav)}${a ? stars(a, 'sm') : ''}${mine ? `<span class="mine">${mine}</span>` : ''}</span>
        <span class="card-n">${[k.dlzka && k.dlzka !== '?' ? esc(k.dlzka) : '', k.navrhla ? `navrhla ${esc(names(k.navrhla))}` : ''].filter(Boolean).join(' · ')}</span>
      </span></button>`;
  }

  function filtered() {
    const q = fold(S.q).trim();
    const list = S.data.knihy.filter(k =>
      (S.stav === 'vsetky' || k.stav === S.stav) &&
      (!S.zaner || (S.zaner === '__autor' ? onlyAuthor(k) : genres(k).includes(S.zaner))) &&
      (!S.moje ||
        (S.moje === 'navrhla' && String(k.navrhla).split(/[,\s]+/).includes(me())) ||
        (S.moje === 'precitala' && k.precitali.includes(me())) ||
        (S.moje === 'neprecitala' && !k.precitali.includes(me()))) &&
      (!q || fold([k.nazov, k.autor, k.zaner, k.popis, names(k.navrhla)].join(' ')).includes(q)));
    const cmp = {
      nove: (a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0),
      nazov: (a, b) => title(a).localeCompare(title(b), 'sk'),
      autor: (a, b) => (a.autor || '').localeCompare(b.autor || '', 'sk'),
      hodnotenie: (a, b) => avg(b.id) - avg(a.id),
      dlzka: (a, b) => hours(a) - hours(b),
    }[S.sort];
    return list.sort(cmp);
  }

  function vGrid() {
    const list = filtered();
    if (!list.length) return `<div class="empty-box"><p>Nenašla sa žiadna kniha.</p><button class="btn ghost" data-act="reset-filter">Zrušiť filtre</button></div>`;
    return `<p class="count">${knihCount(list.length)}</p><div class="grid">${list.map(card).join('')}</div>`;
  }

  function vKniznica() {
    const d = S.data;
    const cnt = st => d.knihy.filter(k => st === 'vsetky' || k.stav === st).length;
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    return `<div class="sec-h page-h"><h1>Knižnica</h1><button class="btn primary" data-act="add">+ Pridať knihu</button></div>
      <div class="toolbar">
        <input class="search" type="search" placeholder="Hľadať názov, autora, tému…" value="${esc(S.q)}" data-input="q">
        <div class="tb-sel">
          <select data-input="zaner">${opt('', 'Všetky žánre', S.zaner)}${allGenres().map(g => opt(g, g, S.zaner)).join('')}${opt('__autor', 'Len autori (bez knihy)', S.zaner)}</select>
          <select data-input="moje">${[['', 'Všetky členky'], ['navrhla', 'Navrhla som'], ['precitala', 'Prečítala som'], ['neprecitala', 'Ešte som nečítala']].map(([v, l]) => opt(v, l, S.moje)).join('')}</select>
          <select data-input="sort">${[['nove', 'Najnovšie'], ['nazov', 'Podľa názvu'], ['autor', 'Podľa autora'], ['dlzka', 'Od najkratšej'], ['hodnotenie', 'Podľa hodnotenia']].map(([v, l]) => opt(v, l, S.sort)).join('')}</select>
        </div>
      </div>
      <div class="chips">${[['vsetky', 'Všetky'], ['navrh', 'V žrebovaní'], ['citame', 'Práve čítame'], ['precitana', 'Prečítané v klube']].map(([v, l]) => `<button class="chip ${S.stav === v ? 'on' : ''}" data-act="stav" data-v="${v}">${l} <span>${cnt(v)}</span></button>`).join('')}</div>
      <div id="grid">${vGrid()}</div>`;
  }

  /* ---------------- Detail knihy ---------------- */
  function openBook(id) {
    const k = book(id);
    if (!k) return;
    const rs = ratingsOf(id), mine = rs.find(h => h.kto === me()) || {};
    const a = avg(id), nR = rs.filter(h => +h.hviezdy).length;
    const canRate = k.stav === 'precitana' || k.stav === 'citame';
    const rows = [['Žáner', genres(k).join(', ')], ['Dĺžka', k.dlzka !== '?' ? k.dlzka : ''], ['Navrhla', names(k.navrhla)], ['Prečítali', names(k.precitali)], ['Losovaná', k.citane ? fmtDate(k.citane) : ''], ['Číslo', k.id]].filter(r => r[1]);
    const iRead = k.precitali.includes(me());
    modal(`<div class="detail">
      <div class="d-cover">${cover(k, 'lg')}</div>
      <div class="d-body">
        ${badge(k.stav)}
        <h2>${esc(title(k))}</h2>
        <p class="author">${esc(subtitle(k))}</p>
        ${a ? `<p class="d-avg">${stars(a)} <b>${a.toFixed(1).replace('.', ',')}</b> <span class="muted">(${nR} ${plural(nR, 'hodnotenie', 'hodnotenia', 'hodnotení')})</span></p>` : ''}
        <div class="toggles">
          <button class="tog ${iRead ? 'on' : ''}" data-act="oznac" data-id="${esc(k.id)}" data-on="${iRead ? 0 : 1}">${iRead ? '✓ Prečítala som' : 'Prečítala som'}</button>
        </div>
        <dl>${rows.map(([t, v]) => `<dt>${t}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${k.popis ? `<p class="note">${esc(k.popis)}</p>` : ''}
        <div class="d-actions">
          <button class="btn" data-act="edit" data-id="${esc(k.id)}">Upraviť</button>
          <a class="btn ghost" href="${esc(martinusUrl(onlyAuthor(k) ? '' : k.nazov, k.autor))}" target="_blank" rel="noopener">Martinus ↗</a>
          <button class="btn danger-ghost" data-act="del-ask">Zmazať</button>
        </div>
        <div class="confirm" id="del-confirm" hidden>Naozaj zmazať „${esc(title(k))}“ aj z tabuľky? <button class="btn danger sm" data-act="del" data-id="${esc(k.id)}">Áno, zmazať</button> <button class="btn ghost sm" data-act="del-no">Nie</button></div>
      </div></div>
      ${canRate ? `<div class="ratings">
        <h3>Hodnotenia členiek</h3>
        ${rs.filter(h => h.kto !== me()).length ? `<ul class="r-list">${rs.filter(h => h.kto !== me()).map(h => `<li><b>${esc(nameOf(h.kto))}</b> ${stars(+h.hviezdy, 'sm')}${h.komentar ? `<p>${esc(h.komentar)}</p>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Zatiaľ nikto iný nehodnotil.</p>'}
        <form data-form="rate" data-id="${esc(k.id)}" class="r-form">
          <div class="r-me">Tvoje hodnotenie, ${esc(nameOf(me()))}:</div>
          <div class="star-pick" data-v="${+mine.hviezdy || 0}">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-act="star" data-v="${i}" class="${i <= (+mine.hviezdy || 0) ? 'on' : ''}" aria-label="${i} z 5">★</button>`).join('')}</div>
          <textarea name="komentar" rows="2" placeholder="Krátky dojem (nepovinné)">${esc(mine.komentar || '')}</textarea>
          <button class="btn primary sm" type="submit">Uložiť hodnotenie</button>
        </form></div>` : ''}`, 'wide');
  }

  /* ---------------- Formulár knihy ---------------- */
  function openForm(id, pred) {
    const k = id ? book(id) : Object.assign({ navrhla: me(), precitali: [] }, pred || {});
    const myG = genres(k);
    const gList = [...new Set([...allGenres(), ...myG])];
    const cl = S.data.clenky;
    const pills = (name, items, sel, label = x => x) => `<div class="pick">${items.map(v => `<label class="pill"><input type="checkbox" name="${name}" value="${esc(v)}" ${sel.includes(v) ? 'checked' : ''}><span>${esc(label(v))}</span></label>`).join('')}</div>`;
    modal(`<h2>${id ? 'Upraviť knihu' : 'Navrhnúť knihu'}</h2>
      <form data-form="book" data-id="${esc(id || '')}" class="form">
        <div class="two">
          <label>Názov<input name="nazov" value="${esc(!onlyAuthor(k) ? (k.nazov || '') : '')}" autofocus placeholder="nechaj prázdne, ak navrhuješ len autora"></label>
          <label>Autor/ka<input name="autor" value="${esc(k.autor || '')}"></label>
        </div>
        <div class="gb-bar"><button type="button" class="btn ghost sm" data-act="gb">🔎 Dohľadať údaje</button><button type="button" class="btn ghost sm" data-act="martinus-form">Pozrieť na Martinuse ↗</button><span class="muted small" id="gb-hint">${id ? 'žáner, dĺžku a popis' : 'po napísaní názvu a autora sa hľadá samo'}</span></div>
        <div id="gb-res"></div>
        <div class="field"><span class="lbl">Žáner <span class="muted">(ťukni, môžeš aj viac)</span></span>${pills('zaner', gList, myG)}</div>
        <details class="more" ${id ? 'open' : ''}>
          <summary>Ďalšie údaje (nepovinné)</summary>
          <label>Dĺžka čítania<input name="dlzka" value="${esc(k.dlzka || '')}" placeholder="napr. 6 hodín"></label>
          <label>Popis / prečo ju čítať<textarea name="popis" rows="3">${esc(k.popis || '')}</textarea></label>
          <label>Iný žáner<input name="zaner_novy" placeholder="ak chýba v zozname vyššie"></label>
          ${id ? `<label>Navrhla<select name="navrhla"><option value="">—</option>${cl.map(c => `<option value="${esc(c.skratka)}" ${c.skratka === k.navrhla ? 'selected' : ''}>${esc(c.meno || c.skratka)}</option>`).join('')}${k.navrhla && !cl.some(c => c.skratka === k.navrhla) ? `<option selected>${esc(k.navrhla)}</option>` : ''}</select></label>
            <label>Dátum losovania<input type="date" name="citane" value="${esc(k.citane || '')}"></label>
            <div class="field"><span class="lbl">Prečítali</span>${pills('precitali', cl.map(c => c.skratka), k.precitali, s => nameOf(s))}</div>` : ''}
        </details>
        <div class="f-actions"><button class="btn ghost" type="button" data-act="close">Zrušiť</button><button class="btn primary" type="submit">${id ? 'Uložiť zmeny' : 'Pridať do databázy'}</button></div>
      </form>`, 'wide');
  }

  /* ---------------- Dohľadanie údajov (Google Books) ---------------- */
  const GB_ZANRE = [
    [/religio|christian|bible|spiritual|theolog|church/i, 'duchovná/kresťanská l.'],
    [/psycholog|self-help|family & relationships|body, mind|health|parenting/i, 'psychológia/motivačná l.'],
    [/philosoph/i, 'filozofia'],
    [/biograph|history|memoir/i, 'história/fakty/biografia'],
    [/social science|political|journalism|true crime|current events|reportage/i, 'reportáže a publicistika'],
    [/fiction|novel|literary|poetry|drama|literature|romance|stories/i, 'beletria'],
  ];
  const hodinyText = pages => { const h = Math.max(1, Math.round(pages / 50)); return `${h} ${h === 1 ? 'hodina' : h < 5 ? 'hodiny' : 'hodín'}`; };
  function cistiPopis(t) {
    t = String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length <= 700) return t;
    const cut = t.slice(0, 700), dot = cut.lastIndexOf('. ');
    return (dot > 300 ? cut.slice(0, dot + 1) : cut) + ' …';
  }

  // Jednotný tvar výsledku: { zdroj, title, authors[], rok, strany, jazyk, kategorie, popis, obalka, olKey }
  async function hladajGoogle(t, a) {
    const priezv = a.split(/\s+/).pop();
    const dotazy = [`intitle:${t}${priezv ? ` inauthor:${priezv}` : ''}`, `${t} ${a}`];
    for (const q of dotazy) {
      const r = await (await fetch(`https://www.googleapis.com/books/v1/volumes?maxResults=10&printType=books&q=${encodeURIComponent(q)}`)).json();
      const items = (r.items || []).map(i => i.volumeInfo || {}).filter(v => v.title);
      if (items.length) return items.map(v => {
        const img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
        return {
          zdroj: 'Google Books', title: v.title, authors: v.authors || [], rok: (v.publishedDate || '').slice(0, 4),
          strany: v.pageCount || 0, jazyk: v.language || '', kategorie: (v.categories || []).join(' / '),
          popis: v.description || '', obalka: img ? String(img).replace(/^http:/, 'https:').replace('&edge=curl', '') : '',
        };
      });
    }
    return [];
  }
  const OL_JAZYK = { slo: 'sk', cze: 'cs', eng: 'en', ger: 'de', fre: 'fr', ita: 'it', spa: 'es', pol: 'pl', hun: 'hu', rus: 'ru' };
  async function hladajOpenLibrary(t, a) {
    const fields = 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,language';
    const pokusy = [`title=${encodeURIComponent(t)}${a ? `&author=${encodeURIComponent(a)}` : ''}`, `q=${encodeURIComponent(`${t} ${a}`)}`];
    for (const q of pokusy) {
      const r = await (await fetch(`https://openlibrary.org/search.json?${q}&limit=8&fields=${fields}`)).json();
      const docs = (r.docs || []).filter(d => d.title);
      if (docs.length) return docs.map(d => {
        const jaz = (d.language || []).map(l => OL_JAZYK[l] || l);
        return {
          zdroj: 'Open Library', title: d.title, authors: d.author_name || [], rok: d.first_publish_year ? String(d.first_publish_year) : '',
          strany: d.number_of_pages_median || 0, jazyk: jaz.includes('sk') ? 'sk' : jaz.includes('cs') ? 'cs' : (jaz[0] || ''),
          kategorie: (d.subject || []).slice(0, 15).join(' / '), popis: '', olKey: d.key,
          obalka: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
        };
      });
    }
    return [];
  }

  async function gbHladaj(auto) {
    const form = $('form[data-form="book"]');
    if (!form) return;
    const t = form.nazov.value.trim(), a = form.autor.value.trim();
    const box = $('#gb-res');
    if (!t) { if (!auto) box.innerHTML = '<p class="muted small">Najprv napíš názov knihy.</p>'; return; }
    const key = t + '|' + a;
    if (auto && gbHladaj.last === key) return;
    gbHladaj.last = key;
    box.innerHTML = '<p class="muted small">Hľadám v Google Books a Open Library…</p>';
    const [g, o] = await Promise.allSettled([hladajGoogle(t, a), hladajOpenLibrary(t, a)]);
    if (!$('form[data-form="book"]') || gbHladaj.last !== key) return;
    const gItems = g.status === 'fulfilled' ? g.value : [], oItems = o.status === 'fulfilled' ? o.value : [];
    if (g.status === 'rejected' && o.status === 'rejected') {
      box.innerHTML = '<p class="muted small">Vyhľadávanie teraz nefunguje. Údaje môžeš vyplniť ručne alebo pozrieť na Martinuse.</p>';
      return;
    }
    const lang = v => v.jazyk === 'sk' ? 0 : v.jazyk === 'cs' ? 1 : 2;
    const skore = v => lang(v) * 10 - (v.obalka ? 3 : 0) - (v.popis ? 2 : 0) - (v.strany ? 1 : 0);
    const zorad = arr => arr.sort((x, y) => skore(x) - skore(y));
    // z každého zdroja najlepšie 3, potom spolu zoradené
    const items = zorad([...zorad(gItems).slice(0, 3), ...zorad(oItems).slice(0, 3)]);
    gbHladaj.items = items;
    if (!items.length) { box.innerHTML = '<p class="muted small">Nič sa nenašlo. Nevadí – údaje sú nepovinné, prípadne pozri na Martinuse.</p>'; return; }
    box.innerHTML = `<p class="muted small">Je to niektorá z týchto? Ťukni a údaje sa doplnia:</p><div class="gb-list">${items.map((v, i) =>
      `<button type="button" class="gb-item" data-act="gb-pick" data-i="${i}">${v.obalka ? `<img src="${esc(v.obalka)}" alt="" onerror="this.outerHTML='<span class=gb-noimg>bez obálky</span>'">` : '<span class="gb-noimg">bez obálky</span>'}<span><b>${esc(v.title)}</b><br>${esc(v.authors.slice(0, 2).join(', '))}<br><em>${[v.rok, v.strany && `${v.strany} strán`, v.jazyk && v.jazyk.toUpperCase()].filter(Boolean).join(' · ')}</em><br><small class="gb-src">${v.zdroj}</small></span></button>`
    ).join('')}</div><button type="button" class="link small" data-act="gb-close">nie je tam – zavrieť</button>`;
  }

  async function gbPouzi(i) {
    const v = gbHladaj.items[i], form = $('form[data-form="book"]');
    if (!v || !form) return;
    // Open Library má popis až v detaile diela
    if (!v.popis && v.olKey && !form.popis.value.trim()) {
      $('#gb-res').innerHTML = '<p class="muted small">Načítavam popis…</p>';
      try {
        const w = await (await fetch(`https://openlibrary.org${v.olKey}.json`)).json();
        v.popis = typeof w.description === 'string' ? w.description : (w.description && w.description.value) || '';
      } catch (e) { /* bez popisu */ }
      if (!$('form[data-form="book"]')) return;
    }
    if (!$$('input[name="zaner"]:checked', form).length) {
      const z = (GB_ZANRE.find(([re]) => re.test(v.kategorie)) || [])[1];
      if (z) {
        let inp = $$('input[name="zaner"]', form).find(x => x.value === z);
        if (!inp) {
          $('.pick', form).insertAdjacentHTML('beforeend', `<label class="pill"><input type="checkbox" name="zaner" value="${esc(z)}"><span>${esc(z)}</span></label>`);
          inp = $$('input[name="zaner"]', form).pop();
        }
        inp.checked = true;
      }
    }
    if (!form.autor.value.trim() && v.authors.length) form.autor.value = v.authors.join(', ');
    if (!form.dlzka.value.trim() && v.strany) form.dlzka.value = hodinyText(v.strany);
    if (!form.popis.value.trim() && v.popis) form.popis.value = cistiPopis(v.popis);
    $('#gb-res').innerHTML = `<p class="muted small ok">✓ Údaje doplnené z ${v.zdroj} – skontroluj ich v „Ďalších údajoch“.</p>`;
    const det = $('details.more', form);
    if (det) det.open = true;
  }

  const martinusUrl = (t, a) => `https://www.martinus.sk/search?q=${encodeURIComponent([t, a].filter(Boolean).join(' '))}`;

  /* ---------------- Žrebovanie ---------------- */
  const PRESETS = [
    ['vsetky', 'Všetky'],
    ['nikto', 'Len čo ešte nikto nečítal'],
    ['knihy', 'Bez „len autorov“'],
  ];
  function applyPreset(p) {
    const pool = S.data.knihy.filter(k => k.stav === 'navrh');
    S.vylucene = new Set(pool.filter(k =>
      (p === 'nikto' && k.precitali.length) ||
      (p === 'knihy' && onlyAuthor(k))).map(k => k.id));
    store.set('klub_vylucene', [...S.vylucene]);
  }

  function vZrebovanie() {
    const d = S.data;
    const pool = d.knihy.filter(k => k.stav === 'navrh').sort((a, b) => title(a).localeCompare(title(b), 'sk'));
    const veto = S.veto.filter(id => pool.some(k => k.id === id));
    const inPool = pool.filter(k => !S.vylucene.has(k.id) && !veto.includes(k.id));
    const cur = d.knihy.filter(k => k.stav === 'citame');
    const hist = d.zrebovania.slice().reverse();
    const kand = S.kandidat && book(S.kandidat);
    let stage;
    if (kand) {
      stage = `<div class="eyebrow">Vyžrebovaná kniha</div>
        <div class="reel won" id="reel"><div class="reel-item"><b>${esc(title(kand))}</b><span>${esc(subtitle(kand))}</span></div></div>
        <div class="kand-info">
          <dl>
            <dt>Dĺžka čítania</dt><dd>${kand.dlzka && kand.dlzka !== '?' ? esc(kand.dlzka) : '<span class="muted">neuvedená</span>'}</dd>
            <dt>Žáner</dt><dd>${genres(kand).length ? esc(genres(kand).join(', ')) : '<span class="muted">neuvedený</span>'}</dd>
            ${kand.navrhla ? `<dt>Navrhla</dt><dd>${esc(names(kand.navrhla))}</dd>` : ''}
            ${kand.precitali.length ? `<dt>Už čítali</dt><dd>${esc(names(kand.precitali))}</dd>` : ''}
          </dl>
          ${kand.popis ? `<p class="kand-popis">${esc(kand.popis)}</p>` : '<p class="muted small">Popis nie je vyplnený.</p>'}
        </div>
        <div class="decide">
          <button class="btn primary big" data-act="prijat">Prijať</button>
          <button class="btn ghost big" data-act="vetovat">Vetovať</button>
        </div>
        <p class="stage-note">Až po prijatí sa kniha zapíše ako kniha na ďalší mesiac${cur.length ? ` a „${esc(cur.map(title).join('“, „'))}“ sa presunie medzi prečítané` : ''}.</p>`;
    } else {
      stage = `<img class="flipbook" id="flipbook" src="img/kniha-staticka.webp" alt="" width="280" height="164">
        <div class="reel" id="reel"><div class="reel-item idle"><b>?</b><span>${knihCount(inPool.length)} v žrebovaní</span></div></div>
        <button class="btn primary big" data-act="draw" ${inPool.length ? '' : 'disabled'}>${veto.length ? 'Žrebovať znova' : 'Žrebovať'}</button>
        ${!inPool.length && veto.length ? '<p class="stage-note">Všetky knihy boli vetované alebo odškrtnuté.</p>' : ''}
        ${cur.length ? `<p class="stage-note">Po prijatí novej knihy sa „${esc(cur.map(title).join('“, „'))}“ presunie medzi prečítané.</p>` : ''}`;
    }
    const vetoHtml = veto.length ? `<div class="veto-list"><span>Vetované:</span> ${veto.map(id => `<em>${esc(title(book(id)))}</em>`).join(', ')} <button class="link small" data-act="veto-reset">zrušiť vetá</button></div>` : '';
    return `<div class="page-h"><h1>Žrebovanie</h1><p class="muted">Na konci stretnutia vyžrebujte knihu na ďalší mesiac. Vyžrebovanú knihu môžete prijať alebo vetovať a žrebovať znova.</p></div>
      <section class="draw">
        <div class="stage">${stage}${vetoHtml}</div>
        <div class="pool">
          <div class="pool-h"><b>Žrebuje sa: ${inPool.length} z ${pool.length}</b></div>
          <div class="presets">${PRESETS.map(([v, l]) => `<button class="chip sm" data-act="preset" data-v="${v}">${l}</button>`).join('')}</div>
          <p class="muted small">Odškrtnuté knihy sa tentoraz nežrebujú.</p>
          <ul class="pool-list">${pool.map(k => {
            const v = veto.includes(k.id);
            return `<li class="${v ? 'vetoed' : ''}"><label><input type="checkbox" data-act="pool-toggle" data-id="${esc(k.id)}" ${S.vylucene.has(k.id) || v ? '' : 'checked'} ${v ? 'disabled' : ''}><span><b>${esc(title(k))}</b> <em>${esc(onlyAuthor(k) ? '(len autor)' : k.autor)}</em>${v ? ' <small class="veto-tag">vetované</small>' : ''}</span></label></li>`;
          }).join('') || '<li class="muted">V žrebovaní nie je žiadna kniha – pridajte návrhy v Knižnici.</li>'}</ul>
        </div>
      </section>
      <section><div class="sec-h"><h3>História žrebovaní</h3></div>
        ${hist.length ? `<table class="hist"><thead><tr><th>Dátum</th><th>Kniha</th><th>Losovala</th><th>V žrebovaní</th></tr></thead><tbody>
          ${hist.map(z => `<tr><td>${fmtDate(z.datum, { day: 'numeric', month: 'numeric', year: 'numeric' })}</td><td>${book(z.kniha_id) ? `<button class="link" data-act="open" data-id="${esc(z.kniha_id)}">${esc(z.nazov)}</button>` : esc(z.nazov)}${z.vetovane ? `<div class="hist-veto">vetované: ${esc(z.vetovane)}</div>` : ''}</td><td>${esc(nameOf(z.zrebovala))}</td><td>${esc(z.v_osudi)}</td></tr>`).join('')}
        </tbody></table>
        <p class="undo"><button class="link small" data-act="undo-ask">Vrátiť posledné žrebovanie</button></p>
        <div class="confirm" id="undo-confirm" hidden>Zrušiť žrebovanie „${esc(hist[0].nazov)}“? Kniha sa vráti medzi knihy v žrebovaní. <button class="btn danger sm" data-act="undo">Áno, zrušiť</button> <button class="btn ghost sm" data-act="undo-no">Nie</button></div>` : '<p class="muted">Zatiaľ žiadne žrebovanie cez web.</p>'}
      </section>`;
  }

  // Žrebovanie prebehne v prehliadači; do tabuľky sa zapíše až po prijatí.
  async function doDraw(btn) {
    if (S.drawing) return;
    const pool = S.data.knihy.filter(k => k.stav === 'navrh' && !S.vylucene.has(k.id) && !S.veto.includes(k.id));
    if (!pool.length) return;
    S.drawing = true;
    btn.disabled = true;
    btn.textContent = 'Žrebujem…';
    const reel = $('#reel');
    reel.classList.add('spin');
    const fb = $('#flipbook');
    if (fb && !matchMedia('(prefers-reduced-motion: reduce)').matches) fb.src = 'img/kniha-listuje.webp?' + Date.now();
    const show = k => { reel.innerHTML = `<div class="reel-item"><b>${esc(title(k))}</b><span>${esc(subtitle(k))}</span></div>`; };
    const winner = pool[Math.floor(Math.random() * pool.length)];
    let i = Math.floor(Math.random() * pool.length);
    const next = () => pool[(i++) % pool.length];
    for (let s = 0; s < 16; s++) { show(next()); await sleep(65); }
    const tail = 13;
    for (let j = 0; j < tail; j++) {
      let k = next();
      if (j === tail - 1) k = winner;
      else if (pool.length > 1 && k.id === winner.id) k = next();
      show(k);
      await sleep(80 + Math.pow(j / tail, 2.2) * 620);
    }
    reel.classList.remove('spin');
    reel.classList.add('won');
    await sleep(500);
    S.drawing = false;
    S.kandidat = winner.id;
    S.vOsudi = pool.length;
    render();
  }

  async function prijat(btn) {
    const id = S.kandidat;
    if (!id) return;
    btn.disabled = true;
    btn.textContent = 'Zapisujem…';
    try {
      await run('potvrdZrebovanie', { id, vetovane: S.veto, vOsudi: S.vOsudi });
    } catch (e) { render(); return; }
    const k = book(id);
    S.kandidat = null; S.veto = [];
    S.vylucene.clear(); store.set('klub_vylucene', []);
    render();
    reveal(k);
  }

  function reveal(k) {
    modal(`<div class="reveal">
      <div class="confetti">${Array.from({ length: 36 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 1.2).toFixed(2)}s;--r:${Math.floor(Math.random() * 360)}deg;--c:${['#8a2f3c', '#2f5a4c', '#b8913f', '#28405e'][i % 4]}"></i>`).join('')}</div>
      <div class="eyebrow">Ďalší mesiac čítame</div>
      ${cover(k, 'lg')}
      <h2>${esc(title(k))}</h2>
      <p class="author">${esc(subtitle(k))}</p>
      ${k.navrhla ? `<p class="muted">navrhla ${esc(names(k.navrhla))}</p>` : ''}
      <div class="f-actions center"><a class="btn ghost" href="#klub" data-act="close-go">Nastaviť stretnutie</a><button class="btn primary" data-act="close">Super!</button></div>
    </div>`, 'narrow');
  }

  /* ---------------- Klub ---------------- */
  function vKlub() {
    const n = S.data.nastavenia || {};
    return `<div class="page-h"><h1>Klub</h1></div>
      <div class="cols">
        <section class="panel">
          <h3>Najbližšie stretnutie</h3>
          <form data-form="meet" class="form">
            <div class="two"><label>Dátum<input type="date" name="stretnutie_datum" value="${esc(n.stretnutie_datum || '')}"></label>
            <label>Čas<input type="time" name="stretnutie_cas" value="${esc(n.stretnutie_cas || '')}"></label></div>
            <label>Miesto<input name="stretnutie_miesto" value="${esc(n.stretnutie_miesto || '')}"></label>
            <label>Poznámka<input name="stretnutie_poznamka" value="${esc(n.stretnutie_poznamka || '')}"></label>
            <button class="btn primary" type="submit">Uložiť</button>
          </form>
        </section>
        <section class="panel">
          <h3>Členky</h3>
          <p class="muted small">Skratka je tá, ktorú používate v tabuľke (stĺpce „kto navrhol“, „kto už prečítal“…).</p>
          <form data-form="members" class="form">
            <div class="mem-rows">${S.data.clenky.map(c => memRow(c)).join('')}</div>
            <div class="row wrap-row"><button class="btn ghost sm" type="button" data-act="add-member">+ pridať členku</button><button class="btn primary sm" type="submit">Uložiť členky</button></div>
          </form>
        </section>
        <section class="panel">
          <h3>Ty</h3>
          <p>Prihlásená ako <b>${esc(nameOf(me()))}</b> (${esc(me())}).</p>
          <div class="row wrap-row"><button class="btn ghost" data-act="change-me">Som niekto iný</button><button class="btn ghost" data-act="logout">Odhlásiť sa</button></div>
          <p class="muted small">Tip: na mobile otvor stránku v prehliadači a daj „Pridať na plochu“ – bude sa správať ako aplikácia.</p>
          ${DEMO ? '<p><button class="link small" data-act="demo-reset">Obnoviť ukážkové dáta</button></p>' : ''}
        </section>
      </div>`;
  }
  const memRow = c => `<div class="mem-row"><input name="skratka" value="${esc(c.skratka)}" placeholder="skr." maxlength="4" aria-label="Skratka"><input name="meno" value="${esc(c.meno)}" placeholder="Meno" aria-label="Meno"><button type="button" class="link small" data-act="rm-member">odobrať</button></div>`;

  const VIEWS = { domov: vDomov, kniznica: vKniznica, zrebovanie: vZrebovanie, klub: vKlub };

  /* ---------------- Udalosti ---------------- */
  const ACTS = {
    bg(el, e) { if (e.target === el) closeModal(); },
    close() { closeModal(); },
    'close-go'() { closeModal(); },
    open(el) { openBook(el.dataset.id); },
    add() { openForm(); },
    edit(el) { openForm(el.dataset.id); },
    async 'set-stav'(el) {
      await run('upravKnihu', { kniha: { id: el.dataset.id, stav: el.dataset.v } }, 'Uložené');
      render(); openBook(el.dataset.id);
    },
    async oznac(el) {
      el.disabled = true;
      await run('oznac', { id: el.dataset.id, zapnut: el.dataset.on === '1' }).finally(() => (el.disabled = false));
      render(); openBook(el.dataset.id);
    },
    'del-ask'() { $('#del-confirm').hidden = false; },
    'del-no'() { $('#del-confirm').hidden = true; },
    async del(el) { await run('zmazKnihu', { id: el.dataset.id }, 'Kniha zmazaná'); closeModal(); render(); },
    star(el) {
      const pick = el.parentNode, v = +el.dataset.v === +pick.dataset.v ? 0 : +el.dataset.v;
      pick.dataset.v = v;
      $$('button', pick).forEach(b => b.classList.toggle('on', +b.dataset.v <= v));
    },
    stav(el) { S.stav = el.dataset.v; render(); },
    filter(el) { S.stav = el.dataset.stav; },
    'reset-filter'() { S.q = ''; S.zaner = ''; S.moje = ''; S.stav = 'vsetky'; render(); },
    draw(el) { doDraw(el); },
    prijat(el) { return prijat(el); },
    vetovat() { if (S.kandidat) S.veto.push(S.kandidat); S.kandidat = null; render(); },
    'veto-reset'() { S.veto = []; render(); },
    preset(el) { applyPreset(el.dataset.v); render(); },
    'pool-toggle'(el) {
      el.checked ? S.vylucene.delete(el.dataset.id) : S.vylucene.add(el.dataset.id);
      store.set('klub_vylucene', [...S.vylucene]);
      render();
    },
    'undo-ask'() { $('#undo-confirm').hidden = false; },
    'undo-no'() { $('#undo-confirm').hidden = true; },
    async undo() { await run('zrusZrebovanie', {}, 'Žrebovanie zrušené'); render(); },
    gb() { gbHladaj.last = null; gbHladaj(false); },
    'gb-pick'(el) { gbPouzi(+el.dataset.i); },
    'martinus-form'() {
      const f = $('form[data-form="book"]');
      const t = f.nazov.value.trim(), a = f.autor.value.trim();
      if (!t && !a) { toast('Najprv napíš názov alebo autora.', true); return; }
      window.open(martinusUrl(t, a), '_blank', 'noopener');
    },
    'gb-close'() { $('#gb-res').innerHTML = ''; },
    iam(el) { setMe(el.dataset.m); },
    'change-me'() { S.auth.ja = ''; store.set('klub_auth', S.auth); render(); },
    logout() { logout(); },
    'add-member'() { $('.mem-rows').insertAdjacentHTML('beforeend', memRow({ skratka: '', meno: '' })); $('.mem-rows .mem-row:last-child input').focus(); },
    'rm-member'(el) { el.closest('.mem-row').remove(); },
    async 'demo-reset'() { window.KLUB_DEMO.reset(); await api('nacitaj'); render(); toast('Ukážkové dáta obnovené'); },
  };

  function setMe(s) {
    S.auth.ja = String(s).trim().toUpperCase();
    store.set('klub_auth', S.auth);
    render();
  }

  const FORMS = {
    async login(f) {
      const btn = $('button', f);
      btn.disabled = true; btn.textContent = 'Overujem…';
      const prev = store.get('klub_auth');
      S.auth = { heslo: f.heslo.value, ja: prev && prev.ja ? prev.ja : '' };
      try {
        await api('nacitaj');
        if (S.auth.ja && !S.data.clenky.some(c => c.skratka === S.auth.ja)) S.auth.ja = '';
        store.set('klub_auth', S.auth);
        render();
      } catch (e) {
        S.auth = null;
        $('#app').innerHTML = vLogin(e.message);
        focusAuto();
      }
    },
    iam(f) { setMe(f.ja.value); },
    async book(f) {
      const id = f.dataset.id;
      const k = {};
      ['nazov', 'autor', 'dlzka', 'popis'].forEach(p => (k[p] = f[p].value.trim()));
      const zanre = $$('input[name="zaner"]:checked', f).map(i => i.value);
      if (f.zaner_novy.value.trim()) zanre.push(...f.zaner_novy.value.split(',').map(s => s.trim()).filter(Boolean));
      if (!k.nazov && k.autor) zanre.splice(0, zanre.length, 'autor');
      k.zaner = [...new Set(zanre)].join(', ');
      if (!k.nazov && !k.autor) { toast('Vyplň aspoň názov alebo autora.', true); return; }
      if (id) {
        k.id = id; k.navrhla = f.navrhla.value; k.citane = f.citane.value;
        k.precitali = $$('input[name="precitali"]:checked', f).map(i => i.value);
      }
      const btn = $('button[type=submit]', f);
      btn.disabled = true;
      try {
        await run(id ? 'upravKnihu' : 'pridajKnihu', { kniha: k }, id ? 'Zmeny uložené' : 'Kniha pridaná do databázy');
        closeModal(); render();
        if (id) openBook(id);
      } catch (e) { btn.disabled = false; }
    },
    async rate(f) {
      const v = +$('.star-pick', f).dataset.v;
      await run('hodnot', { kniha_id: f.dataset.id, hviezdy: v, komentar: f.komentar.value }, 'Hodnotenie uložené');
      render(); openBook(f.dataset.id);
    },
    quickadd(f) {
      const nazov = f.nazov.value.trim(), autor = f.autor.value.trim();
      openForm(null, { nazov, autor });
      if (nazov) { gbHladaj.last = null; gbHladaj(true); }
    },
    async meet(f) {
      const n = {};
      ['stretnutie_datum', 'stretnutie_cas', 'stretnutie_miesto', 'stretnutie_poznamka'].forEach(p => (n[p] = f[p].value));
      await run('ulozNastavenia', { nastavenia: n }, 'Stretnutie uložené');
      render();
    },
    async members(f) {
      const clenky = $$('.mem-row', f).map(r => ({ skratka: $('[name=skratka]', r).value.trim().toUpperCase(), meno: $('[name=meno]', r).value.trim() })).filter(c => c.skratka);
      await run('ulozClenky', { clenky }, 'Členky uložené');
      render();
    },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTS[el.dataset.act];
    if (!fn) return;
    if (el.dataset.act === 'bg' && e.target !== el) return;
    if (el.tagName === 'BUTTON') e.preventDefault();
    Promise.resolve(fn(el, e)).catch(() => {});
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    Promise.resolve(FORMS[f.dataset.form](f)).catch(() => {});
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.input === 'q') { S.q = el.value; $('#grid').innerHTML = vGrid(); }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.input === 'zaner') { S.zaner = el.value; render(); }
    if (el.dataset.input === 'moje') { S.moje = el.value; render(); }
    if (el.dataset.input === 'sort') { S.sort = el.value; render(); }
    const bf = el.closest && el.closest('form[data-form="book"]');
    if (bf && !bf.dataset.id && (el.name === 'nazov' || el.name === 'autor') && bf.nazov.value.trim() && bf.autor.value.trim()) gbHladaj(true);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal(); });
  window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.auth && S.auth.heslo && S.auth.ja && S.data && !S.drawing && !$('#modal-root').innerHTML) {
      api('nacitaj').then(render).catch(() => {});
    }
  });

  /* ---------------- Štart ---------------- */
  (async function start() {
    if (S.auth && S.auth.heslo) {
      render();
      try { await api('nacitaj'); }
      catch (e) {
        if (e.auth) { S.auth = null; store.del('klub_auth'); }
        else { $('#app').innerHTML = `<div class="login"><div class="login-card"><h1>Ups</h1><p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Skúsiť znova</button></div></div>`; return; }
      }
    }
    render();
  })();
})();
