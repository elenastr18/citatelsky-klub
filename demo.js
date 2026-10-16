// DEMO režim – napodobňuje server, keď v config.js nie je vyplnené API_URL.
// Dáta sú vymyslené a ukladajú sa iba v tomto prehliadači. Heslo: kniha
(function () {
  const KEY = 'klub_demo_data_v4';
  const HESLO = 'kniha';
  const iso = d => d.toISOString().slice(0, 10);
  const dnes = () => iso(new Date());
  const newId = () => Math.random().toString(36).slice(2, 12);

  function vzorka() {
    let n = 0;
    const k = (nazov, autor, zaner, tema, dlzka, navrhla, precitali, doma, citane, stav, popis) => ({
      id: String(++n).padStart(2, '0'), nazov, autor, zaner, dlzka, popis: popis || '', navrhla,
      precitali: precitali ? precitali.split(',') : [], citane: citane || '',
      stav: stav === 'citame' ? 'citame' : citane ? 'precitana' : 'navrh',
    });
    const knihy = [
      k('Pýcha a predsudok', 'Jane Austen', 'beletria', 'láska, spoločnosť', '10 hodín', 'J', 'J,Z,M', 'J,M', '2024-06-12', '', 'Klasika o tom, ako prvý dojem klame.'),
      k('Malý princ', 'Antoine de Saint-Exupéry', 'filozofia', 'detstvo, priateľstvo', '2 hodiny', 'Z', 'J,Z,M,K,P', 'Z,K,P', '2024-09-03'),
      k('Sto rokov samoty', 'Gabriel García Márquez', 'beletria', 'rod, čas, osamelosť', '14 hodín', 'M', 'M,K', 'M', '2025-02-18'),
      k('Štyri dohody', 'Don Miguel Ruiz', 'psychológia/motivačná l.', 'sebapoznanie', '3 hodiny', 'K', 'K,P', 'K', '2025-06-02'),
      k('Kvety pre Algernona', 'Daniel Keyes', 'beletria', 'inteligencia, ľudskosť', '7 hodín', 'P', 'P,J', 'P', '2025-09-03'),
      k('Lekcie chémie', 'Bonnie Garmus', 'beletria', 'žena vo vede, humor', '9 hodín', 'E', '', 'E,J', '2025-09-03', 'citame', 'Vraj vtipná aj smutná zároveň.'),
      k('Svetlo, ktoré nevidíme', 'Anthony Doerr', 'beletria, história/fakty/biografia', 'vojna, vytrvalosť', '12 hodín', 'L', '', 'L', ''),
      k('Kafka na pobreží', 'Haruki Murakami', 'beletria', 'sny, hľadanie seba', '12 hodín', 'Z', 'Z', '', ''),
      k('Rebecca', 'Daphne du Maurier', 'beletria', 'tajomstvo, žiarlivosť', '10 hodín', 'K', '', 'K,M', ''),
      k('Stoner', 'John Williams', 'beletria', 'obyčajný život', '7 hodín', 'E', 'E', 'E', '', '', 'Tichá, krásna kniha o obyčajnom živote.'),
      k('Kým nevychladne káva', 'Toshikazu Kawaguchi', 'beletria', 'čas, ľútosť', '4 hodiny', 'J', '', 'J', ''),
      k('Emočne zrelá žena', 'Lisa Firestone', 'psychológia/motivačná l.', 'vzťahy, sebapoznanie', '6 hodín', 'M', '', '', ''),
      k('Vyznania', 'sv. Augustín', 'duchovná/kresťanská l.', 'viera, obrátenie', '10 hodín', 'P', 'P', 'P', '', 'odlozena'),
      k('?', 'Karel Čapek', 'autor', '', '?', 'L', '', '', ''),
      k('Zbohom, zbrane', 'Ernest Hemingway', 'beletria', 'vojna, láska', '8 hodín', 'L', '', 'L,Z', ''),
    ];
    const meet = new Date(); meet.setDate(meet.getDate() + 12);
    const byN = t => knihy.find(x => x.nazov === t).id;
    return {
      knihy,
      clenky: [
        { skratka: 'E', meno: 'Elena' }, { skratka: 'J', meno: 'Jana' }, { skratka: 'K', meno: 'Katka' },
        { skratka: 'L', meno: 'Lucia' }, { skratka: 'M', meno: 'Martina' }, { skratka: 'P', meno: 'Petra' }, { skratka: 'Z', meno: 'Zuzka' },
      ],
      zrebovania: [
        { id: newId(), datum: '2025-06-02', kniha_id: byN('Kvety pre Algernona'), nazov: 'Kvety pre Algernona', zrebovala: 'Z', v_osudi: '11', predosla: byN('Štyri dohody') },
        { id: newId(), datum: '2025-09-03', kniha_id: byN('Lekcie chémie'), nazov: 'Lekcie chémie', zrebovala: 'K', v_osudi: '10', predosla: byN('Kvety pre Algernona') },
      ],
      hodnotenia: [
        { kniha_id: byN('Pýcha a predsudok'), kto: 'J', hviezdy: '5', komentar: 'Pán Darcy navždy.', datum: '2024-06-12' },
        { kniha_id: byN('Pýcha a predsudok'), kto: 'M', hviezdy: '4', komentar: '', datum: '2024-06-12' },
        { kniha_id: byN('Sto rokov samoty'), kto: 'M', hviezdy: '5', komentar: 'Potrebovala som rodokmeň, ale stálo to za to.', datum: '2025-02-18' },
        { kniha_id: byN('Kvety pre Algernona'), kto: 'P', hviezdy: '5', komentar: 'Plakala som.', datum: '2025-09-03' },
        { kniha_id: byN('Kvety pre Algernona'), kto: 'J', hviezdy: '4', komentar: '', datum: '2025-09-03' },
      ],
      nastavenia: { stretnutie_datum: iso(meet), stretnutie_cas: '18:30', stretnutie_miesto: 'u Zuzky', stretnutie_poznamka: 'Každá prinesie niečo malé na zjedenie.' },
    };
  }

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.knihy) return d; } catch (e) {}
    return vzorka();
  }
  let D = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} }
  // stav sa odvodí rovnako ako na serveri: prečítaná = má dátum, práve čítame = posledná vyžrebovaná
  function fixStav() {
    const last = D.zrebovania.length ? D.zrebovania[D.zrebovania.length - 1].kniha_id : null;
    let cur = D.knihy.find(k => k.id === last && k.citane);
    if (!cur) cur = D.knihy.filter(k => k.citane).sort((a, b) => b.citane.localeCompare(a.citane))[0];
    D.knihy.forEach(k => { k.stav = !k.citane ? 'navrh' : cur && k.id === cur.id ? 'citame' : 'precitana'; });
  }

  const POLIA = ['nazov', 'autor', 'zaner', 'dlzka', 'popis', 'navrhla'];
  const clean = v => String(v == null ? '' : v).trim().slice(0, 3000);
  const find = id => { const b = D.knihy.find(k => k.id === String(id)); if (!b) throw new Error('Kniha sa nenašla.'); return b; };

  const A = {
    nacitaj() {},
    pridajKnihu(r) {
      const k = {};
      POLIA.forEach(p => (k[p] = clean(r.kniha[p])));
      if (!k.nazov && !k.autor) throw new Error('Vyplň aspoň názov alebo autora.');
      if (!k.nazov) { k.nazov = '?'; k.zaner = 'autor'; }
      const max = D.knihy.reduce((m, x) => Math.max(m, parseInt(x.id, 10) || 0), 0);
      Object.assign(k, { id: String(max + 1).padStart(2, '0'), stav: 'navrh', citane: '', precitali: [] });
      if (!k.navrhla) k.navrhla = r.ja || '';
      D.knihy.push(k);
      return { id: k.id };
    },
    upravKnihu(r) {
      const b = find(r.kniha.id);
      POLIA.forEach(p => { if (p in r.kniha) b[p] = clean(r.kniha[p]); });
      if (!b.nazov) b.nazov = '?';
      if ('citane' in r.kniha) b.citane = clean(r.kniha.citane);
      if (Array.isArray(r.kniha.precitali)) b.precitali = r.kniha.precitali;
      fixStav();
    },
    oznac(r) {
      const b = find(r.id);
      b.precitali = b.precitali.filter(x => x !== r.ja);
      if (r.zapnut) b.precitali.push(r.ja);
    },
    zmazKnihu(r) {
      D.knihy = D.knihy.filter(k => k.id !== r.id);
      D.hodnotenia = D.hodnotenia.filter(h => h.kniha_id !== r.id);
    },
    zrebuj(r) {
      const vyl = r.vylucene || [];
      const osudie = D.knihy.filter(k => k.stav === 'navrh' && !vyl.includes(k.id));
      if (!osudie.length) throw new Error('V databáze nie je žiadna kniha.');
      const v = osudie[Math.floor(Math.random() * osudie.length)];
      const pred = D.knihy.filter(k => k.stav === 'citame');
      v.citane = dnes();
      D.zrebovania.push({ id: newId(), datum: dnes(), kniha_id: v.id, nazov: v.nazov !== '?' ? v.nazov : 'niečo od: ' + v.autor, zrebovala: r.ja || '', v_osudi: String(osudie.length), predosla: pred.map(k => k.id).join(',') });
      fixStav();
      return { vitaz: v.id };
    },
    potvrdZrebovanie(r) {
      const v = D.knihy.find(k => k.id === String(r.id));
      if (!v || v.stav !== 'navrh') throw new Error('Táto kniha už nie je medzi knihami na žrebovanie.');
      const pred = D.knihy.filter(k => k.stav === 'citame');
      v.citane = dnes();
      const veta = (r.vetovane || []).map(id => D.knihy.find(k => k.id === id)).filter(Boolean).map(k => k.nazov !== '?' ? k.nazov : 'niečo od: ' + k.autor).join(', ');
      D.zrebovania.push({ id: newId(), datum: dnes(), kniha_id: v.id, nazov: v.nazov !== '?' ? v.nazov : 'niečo od: ' + v.autor, zrebovala: r.ja || '', v_osudi: String(r.vOsudi || ''), predosla: pred.map(k => k.id).join(','), vetovane: veta });
      fixStav();
      return { vitaz: v.id };
    },
    zrusZrebovanie() {
      const z = D.zrebovania.pop();
      if (!z) throw new Error('Nie je čo zrušiť.');
      const v = D.knihy.find(x => x.id === z.kniha_id); if (v) v.citane = '';
      fixStav();
    },
    hodnot(r) {
      if (!r.ja) throw new Error('Najprv si vyber, ktorá si.');
      const h = Math.max(0, Math.min(5, parseInt(r.hviezdy, 10) || 0));
      const kom = clean(r.komentar);
      D.hodnotenia = D.hodnotenia.filter(x => !(x.kniha_id === r.kniha_id && x.kto === r.ja));
      if (h || kom) D.hodnotenia.push({ kniha_id: r.kniha_id, kto: r.ja, hviezdy: String(h), komentar: kom, datum: dnes() });
    },
    ulozNastavenia(r) {
      ['stretnutie_datum', 'stretnutie_cas', 'stretnutie_miesto', 'stretnutie_poznamka'].forEach(k => { if (k in r.nastavenia) D.nastavenia[k] = clean(r.nastavenia[k]); });
    },
    ulozClenky(r) {
      D.clenky = (r.clenky || []).map(c => ({ skratka: clean(c.skratka).toUpperCase(), meno: clean(c.meno) })).filter(c => c.skratka);
    },
  };

  window.KLUB_DEMO = {
    reset() { D = vzorka(); save(); },
    async handle(req) {
      await new Promise(r => setTimeout(r, 200));
      if (req.heslo !== HESLO) return { ok: false, auth: false, error: 'Nesprávne heslo. (V ukážkovom režime je heslo „kniha“.)' };
      if (!A[req.action]) return { ok: false, error: 'Neznáma akcia' };
      try {
        const extra = A[req.action](req) || {};
        save();
        return { ok: true, data: Object.assign(JSON.parse(JSON.stringify(D)), extra) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  };
})();
