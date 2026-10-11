/* picker.js — 심볼 선택기: Hyperliquid 전체 종목(메인 + HIP-3) 검색 · 즐겨찾기 · 최근 · 카테고리 */
(function (root, factory) {
  const P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P; else root.FCPicker = P;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HL = 'https://api.hyperliquid.xyz/info';
  const K = { uni: 'fc_universe_v1', bn: 'fc_bn_pairs_v1', cb: 'fc_cb_products_v1', fav: 'fc_favs_v1', rec: 'fc_recent_v1' };
  const UNI_TTL = 10 * 60e3, EX_TTL = 24 * 3600e3;
  const DEFAULT_FAVS = ['BTC', 'ETH', 'SOL', 'HYPE', 'xyz:SP500'];
  const MAX_RECENT = 8;

  /* ---------- 이름/별칭 (코인 부분 기준, dex 무관) ---------- */
  const ALIAS = {
    BTC: '비트코인 비트 bitcoin', ETH: '이더리움 이더 ethereum', SOL: '솔라나 solana', XRP: '리플 엑스알피 ripple',
    DOGE: '도지코인 도지 dogecoin', HYPE: '하이퍼리퀴드 하이프 hyperliquid', BNB: '바이낸스코인 비앤비 binance',
    ADA: '에이다 카르다노 cardano', SUI: '수이 sui', AVAX: '아발란체 avalanche', LINK: '체인링크 chainlink',
    TRX: '트론 tron', TON: '톤코인 toncoin', LTC: '라이트코인 litecoin', BCH: '비트코인캐시 bitcoin cash',
    DOT: '폴카닷 polkadot', NEAR: '니어 near', APT: '앱토스 aptos', ARB: '아비트럼 arbitrum', OP: '옵티미즘 optimism',
    PAXG: '팍스골드 금 gold', ENA: '에테나 ethena', PUMP: '펌프펀 pump', kPEPE: '페페 pepe', kBONK: '봉크 bonk',
    WLD: '월드코인 worldcoin', TAO: '비텐서 bittensor', AAVE: '에이브 aave', UNI: '유니스왑 uniswap', XMR: '모네로 monero',
    // 지수 · ETF · FX
    SP500: 'S&P500 에스앤피 미국지수 sp500', XYZ100: '나스닥100 나스닥 nasdaq', US500: 'S&P500 에스앤피 sp500',
    USTECH: '나스닥100 나스닥 nasdaq', KR200: '코스피200 코스피 kospi', JP225: '닛케이225 닛케이 nikkei',
    NIFTY: '니프티50 인도 nifty', IBOV: '보베스파 브라질 ibovespa', DXY: '달러인덱스 달러 dollar', VIX: 'VIX 변동성지수 공포지수',
    KRW: '원화 원달러 krw', JPY: '엔화 엔 yen', EUR: '유로 euro', GBP: '파운드 pound',
    EWY: '한국 ETF korea', EWJ: '일본 ETF japan', EWZ: '브라질 ETF', EWT: '대만 ETF', SMH: '반도체 ETF semis',
    SOXL: '반도체 3배 ETF', XLE: '에너지 ETF energy', TLT: '미국채 장기 ETF treasury', XBI: '바이오 ETF biotech',
    // 주식
    NVDA: '엔비디아 nvidia', TSLA: '테슬라 tesla', AAPL: '애플 apple', MSFT: '마이크로소프트 microsoft',
    GOOGL: '구글 알파벳 google', AMZN: '아마존 amazon', META: '메타 페이스북 meta', NFLX: '넷플릭스 netflix',
    AMD: 'AMD 에이엠디', INTC: '인텔 intel', MU: '마이크론 micron', TSM: 'TSMC 대만반도체', AVGO: '브로드컴 broadcom',
    ORCL: '오라클 oracle', PLTR: '팔란티어 palantir', COIN: '코인베이스 coinbase', HOOD: '로빈후드 robinhood',
    MSTR: '스트래티지 마이크로스트래티지 strategy', CRCL: '서클 circle', BABA: '알리바바 alibaba', COST: '코스트코 costco',
    LLY: '일라이릴리 lilly', SMSN: '삼성전자 삼성 samsung', SKHX: 'SK하이닉스 하이닉스 hynix', SKHY: 'SK하이닉스 하이닉스 hynix',
    HYUNDAI: '현대차 현대자동차 hyundai', SOFTBANK: '소프트뱅크 softbank', GME: '게임스탑 gamestop', RIVN: '리비안 rivian',
    ASML: 'ASML 에이에스엠엘', ARM: 'ARM 암홀딩스', IBM: 'IBM 아이비엠', QCOM: '퀄컴 qualcomm', DELL: '델 dell',
    // 원자재
    GOLD: '금 골드 gold', SILVER: '은 실버 silver', CL: 'WTI 원유 유가 오일 crude oil', BRENTOIL: '브렌트유 원유 오일 brent',
    OIL: '원유 오일 oil', NATGAS: '천연가스 가스 natural gas', COPPER: '구리 copper', PLATINUM: '백금 플래티넘 platinum',
    PALLADIUM: '팔라듐 palladium', URANIUM: '우라늄 uranium', ALUMINIUM: '알루미늄 aluminium', CORN: '옥수수 corn',
    WHEAT: '밀 소맥 wheat', TTF: '유럽 천연가스 TTF', HO: '난방유 heating oil', URNM: '우라늄 ETF',
  };
  const COMMOD = new Set(['GOLD', 'SILVER', 'CL', 'BRENTOIL', 'OIL', 'WTI', 'BRENT', 'NATGAS', 'COPPER', 'PLATINUM', 'PALLADIUM',
    'URANIUM', 'ALUMINIUM', 'ALUMINUM', 'CORN', 'WHEAT', 'SOYBEAN', 'COFFEE', 'SUGAR', 'COCOA', 'TTF', 'HO', 'XAU', 'XAG']);

  const coinOf = (name) => (name.includes(':') ? name.split(':')[1] : name);
  const dexOf = (name) => (name.includes(':') ? name.split(':')[0] : '');
  const aliasOf = (name) => ALIAS[coinOf(name)] || ALIAS[coinOf(name).toUpperCase()] || '';
  const krName = (name) => { const a = aliasOf(name); return a ? a.split(' ')[0] : ''; };
  function category(name) {
    const c = coinOf(name).toUpperCase();
    if (!name.includes(':')) return c === 'PAXG' ? 'commod' : 'coin';
    return COMMOD.has(c) ? 'commod' : 'stock';
  }

  function normSym(s) {
    s = (s || '').trim(); if (!s) return '';
    if (s.includes(':')) { const [d, c] = s.split(':'); return d.toLowerCase() + ':' + (c || '').toUpperCase(); }
    if (/^k[A-Z]/.test(s)) return s; // Hyperliquid 1000배 단위 (kPEPE 등)
    return s.toUpperCase().replace(/USDT$|-USD$|USD$/, '') || '';
  }

  /* ---------- 검색 ---------- */
  const fold = (s) => (s || '').toLowerCase().replace(/[\s&\-_.]/g, '');
  // 점수: 낮을수록 좋음. null = 불일치
  function score(item, q) {
    q = fold(q); if (!q) return 0;
    const name = fold(item.name), coin = fold(coinOf(item.name)), al = aliasOf(item.name).toLowerCase();
    if (coin === q || name === q) return 0;
    if (coin.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    const words = al.split(' ').map(fold);
    if (words.some(w => w === q)) return 1.5;
    if (words.some(w => w.startsWith(q))) return 3;
    if (coin.includes(q)) return 4;
    if (fold(al).includes(q)) return 5;
    return null;
  }
  function search(items, q, limit = 200) {
    const out = [];
    for (const it of items) { const s = score(it, q); if (s != null) out.push([s, it]); }
    out.sort((a, b) => a[0] - b[0] || (b[1].vol || 0) - (a[1].vol || 0));
    return out.slice(0, limit).map(x => x[1]);
  }

  /* ---------- 포맷 ---------- */
  function fmtPx(p) {
    if (p == null || !isFinite(p)) return '–';
    const a = Math.abs(p);
    const d = a >= 10000 ? 0 : a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
    return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtVol(v) {
    if (v == null || !isFinite(v)) return '–';
    const u = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']].find(([k]) => v >= k);
    if (!u) return '$' + Math.round(v);
    const x = v / u[0];
    return '$' + (x >= 100 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, '')) + u[1];
  }
  const fmtChg = (c) => (c == null || !isFinite(c) ? '–' : (c > 0 ? '+' : '') + c.toFixed(2) + '%');

  /* ---------- 즐겨찾기 / 최근 ---------- */
  function lsGet(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 용량/사파리 프라이빗 */ } }
  const favs = () => lsGet(K.fav, DEFAULT_FAVS.slice());
  function toggleFav(sym) { const f = favs(); const i = f.indexOf(sym); if (i >= 0) f.splice(i, 1); else f.push(sym); lsSet(K.fav, f); return i < 0; }
  const recents = () => lsGet(K.rec, []);
  const dropRecent = (sym) => lsSet(K.rec, recents().filter(x => x !== sym));
  function pushRecent(sym) { if (!sym) return; const r = recents().filter(x => x !== sym); r.unshift(sym); lsSet(K.rec, r.slice(0, MAX_RECENT)); }

  /* ---------- 데이터 ---------- */
  async function post(body) {
    const r = await fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HL HTTP ' + r.status);
    return r.json();
  }
  function parseMetaCtx(res, dex) {
    const [meta, ctxs] = res, out = [];
    (meta.universe || []).forEach((u, i) => {
      if (u.isDelisted) return;
      const c = ctxs[i] || {};
      const px = +(c.midPx || c.markPx), prev = +c.prevDayPx;
      const name = dex && !u.name.includes(':') ? dex + ':' + u.name : u.name;
      out.push({ name, px: isFinite(px) ? px : null, chg: px && prev ? (px / prev - 1) * 100 : null, vol: +c.dayNtlVlm || 0, dex: dex || '' });
    });
    return out;
  }
  async function fetchUniverse() {
    const [main, dexs] = await Promise.all([post({ type: 'metaAndAssetCtxs' }), post({ type: 'perpDexs' }).catch(() => [])]);
    const items = parseMetaCtx(main, '');
    const names = (dexs || []).filter(Boolean).map(d => d.name).filter(Boolean);
    const res = await Promise.all(names.map(d => post({ type: 'metaAndAssetCtxs', dex: d }).then(r => parseMetaCtx(r, d)).catch(() => [])));
    res.forEach(a => items.push(...a));
    items.sort((a, b) => b.vol - a.vol);
    return items;
  }
  function cachedUniverse() { const c = lsGet(K.uni, null); return c && Array.isArray(c.items) ? c : null; }
  let uniP = null;
  function loadUniverse(force) {
    const c = cachedUniverse();
    if (!force && c && Date.now() - c.at < UNI_TTL) return Promise.resolve(c);
    if (!uniP) uniP = fetchUniverse().then(items => { const v = { at: Date.now(), items }; lsSet(K.uni, v); return v; }).finally(() => { uniP = null; });
    return uniP;
  }
  // 거래소 페어 목록 (배지용, 24시간 캐시, 실패해도 무시)
  async function exSet(key, loader) {
    const c = lsGet(key, null);
    if (c && Date.now() - c.at < EX_TTL && Array.isArray(c.b)) return new Set(c.b);
    try { const b = await loader(); lsSet(key, { at: Date.now(), b }); return new Set(b); }
    catch (e) { return c && Array.isArray(c.b) ? new Set(c.b) : null; }
  }
  const bnLoader = async () => {
    const bases = new Set();
    const spot = fetch('https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT&showPermissionSets=false&symbolStatus=TRADING')
      .then(r => r.json()).then(j => j.symbols.forEach(s => { if (s.quoteAsset === 'USDT') bases.add(s.baseAsset); }));
    const fut = fetch('https://fapi.binance.com/fapi/v1/ticker/price')
      .then(r => r.json()).then(j => j.forEach(s => { if (/USDT$/.test(s.symbol)) bases.add(s.symbol.slice(0, -4)); }));
    const rs = await Promise.allSettled([spot, fut]);
    if (rs.every(r => r.status === 'rejected')) throw new Error('binance');
    return [...bases];
  };
  const cbLoader = async () => {
    const j = await (await fetch('https://api.exchange.coinbase.com/products')).json();
    return j.filter(p => p.quote_currency === 'USD' && p.status === 'online' && !p.trading_disabled).map(p => p.base_currency);
  };
  let exP = null;
  const loadExchanges = () => exP || (exP = Promise.all([exSet(K.bn, bnLoader), exSet(K.cb, cbLoader)]).then(([bn, cb]) => ({ bn, cb })));

  /* ---------- UI ---------- */
  const TABS = [['fav', '★ 즐겨찾기'], ['recent', '최근'], ['coin', '코인'], ['stock', '주식·지수'], ['commod', '원자재']];
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function init(opts) {
    const { button, chips, getSym, onPick } = opts;
    const doc = document;
    const back = doc.createElement('div'); back.className = 'pk-back'; back.hidden = true;
    const el = doc.createElement('div'); el.className = 'picker'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '심볼 선택');
    el.innerHTML = `
      <div class="pk-grab" aria-hidden="true"></div>
      <div class="pk-head">
        <div class="pk-search"><span aria-hidden="true">⌕</span>
          <input type="search" enterkeyhint="go" autocomplete="off" autocapitalize="characters" spellcheck="false"
            placeholder="검색: BTC · 비트 · 금 · 나스닥" aria-label="심볼 검색"></div>
        <button class="pk-close" type="button" aria-label="닫기">✕</button>
      </div>
      <div class="pk-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="pk-cols"><span>종목</span><span>가격 · 24h</span></div>
      <div class="pk-list" role="listbox"></div>
      <div class="pk-foot"><span class="pk-status"></span><span class="pk-keys">↑↓ 이동 · Enter 선택 · Esc 닫기</span></div>`;
    doc.body.append(back, el);
    const q = el.querySelector('input'), list = el.querySelector('.pk-list'), status = el.querySelector('.pk-status');
    let tab = 'fav', rows = [], hi = 0, uni = { at: 0, items: [] }, ex = { bn: null, cb: null }, open = false, pushed = false, pending = null, err = '';
    const byName = () => { const m = new Map(); uni.items.forEach(it => m.set(it.name, it)); return m; };

    function itemsFor(t) {
      const m = byName(), stub = (n) => m.get(n) || { name: n, px: null, chg: null, vol: null, dex: dexOf(n) };
      if (t === 'fav') return favs().map(stub);
      if (t === 'recent') return recents().map(stub);
      return uni.items.filter(it => category(it.name) === t);
    }
    function badges(it) {
      const b = [];
      if (it.dex) b.push(`<i class="b dex">${esc(it.dex)}</i>`);
      else {
        const c = coinOf(it.name);
        if (ex.bn && ex.bn.has(c)) b.push('<i class="b bn" title="Binance USDT 페어">BN</i>');
        if (ex.cb && ex.cb.has(c)) b.push('<i class="b cb" title="Coinbase USD 현물">CB</i>');
      }
      return b.join('');
    }
    function rowHTML(it, i, cur, fs) {
      const name = krName(it.name), on = fs.has(it.name);
      const cls = it.chg > 0 ? 'up' : it.chg < 0 ? 'dn' : '';
      return `<div class="pk-row${i === hi ? ' hi' : ''}${it.name === cur ? ' cur' : ''}" role="option" data-i="${i}" aria-selected="${i === hi}">
        <button type="button" class="star${on ? ' on' : ''}" data-star="${esc(it.name)}" aria-label="즐겨찾기">${on ? '★' : '☆'}</button>
        <div class="nm"><div class="t"><b>${esc(coinOf(it.name))}</b>${badges(it)}</div>
          <div class="s">${name ? esc(name) + ' · ' : ''}거래대금 ${fmtVol(it.vol)}</div></div>
        <div class="px"><div>${fmtPx(it.px)}</div><div class="${cls}">${fmtChg(it.chg)}</div></div></div>`;
    }
    function render() {
      const query = q.value.trim(), cur = getSym(), fs = new Set(favs());
      el.querySelectorAll('.pk-tabs button').forEach(b => b.classList.toggle('on', !query && b.dataset.tab === tab));
      el.classList.toggle('searching', !!query);
      if (query) {
        const all = uni.items.slice(), m = byName();
        favs().concat(recents()).forEach(n => { if (!m.has(n)) { m.set(n, 1); all.push({ name: n, px: null, chg: null, vol: null, dex: dexOf(n) }); } });
        rows = search(all, query);
        const typed = normSym(query);
        if (typed && /^[A-Za-z0-9]+(:[A-Za-z0-9]+)?$/.test(typed) && !rows.some(r => r.name === typed)) rows.push({ name: typed, custom: true });
      } else rows = itemsFor(tab);
      hi = Math.max(0, Math.min(hi, rows.length - 1));
      list.innerHTML = rows.map((it, i) => it.custom
        ? `<div class="pk-row custom${i === hi ? ' hi' : ''}" role="option" data-i="${i}"><span class="star">↵</span><div class="nm"><div class="t"><b>${esc(it.name)}</b> 직접 열기</div><div class="s">Binance USDT · Hyperliquid · HIP-3(dex:코인) 아무 심볼</div></div></div>`
        : rowHTML(it, i, cur, fs)).join('')
        || `<div class="pk-empty">${tab === 'fav' ? '☆를 눌러 즐겨찾기에 추가하세요' : tab === 'recent' ? '최근 본 심볼이 없습니다' : uni.items.length ? '종목 없음' : '불러오는 중…'}</div>`;
      const n = rows.filter(r => !r.custom).length;
      status.textContent = err ? err : query ? `검색 결과 ${n}개` : uni.at ? `${uni.items.length}개 종목 · ${new Date(uni.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })} 기준` : '불러오는 중…';
    }
    function move(d) {
      if (!rows.length) return; hi = (hi + d + rows.length) % rows.length;
      list.querySelectorAll('.pk-row').forEach(r => { const on = +r.dataset.i === hi; r.classList.toggle('hi', on); r.setAttribute('aria-selected', on); if (on) r.scrollIntoView({ block: 'nearest' }); });
    }
    function refreshData(force) {
      const c = cachedUniverse(); if (c) { uni = c; render(); }
      loadUniverse(force).then(v => { uni = v; err = ''; if (open) render(); renderChips(); })
        .catch(() => { err = uni.items.length ? '오프라인 · 저장된 목록 표시' : 'Hyperliquid 목록을 불러오지 못했습니다 · 직접 입력 가능'; if (open) render(); });
      loadExchanges().then(v => { ex = v; if (open) render(); });
    }
    const isSheet = () => window.innerWidth <= 760;
    function place() {
      if (isSheet()) { el.style.left = el.style.top = el.style.width = el.style.maxHeight = ''; return; }
      const r = button.getBoundingClientRect(), w = Math.min(460, window.innerWidth - 24);
      el.style.width = w + 'px';
      el.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + 'px';
      el.style.top = (r.bottom + 6) + 'px';
      el.style.maxHeight = Math.max(320, Math.min(600, window.innerHeight - r.bottom - 18)) + 'px';
    }
    function show() {
      if (open) return; open = true;
      tab = favs().length ? 'fav' : 'coin'; q.value = ''; hi = 0; err = '';
      el.classList.toggle('sheet', isSheet()); back.classList.toggle('sheet', isSheet());
      place(); back.hidden = el.hidden = false; button.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => el.classList.add('in'));
      doc.documentElement.classList.add('pk-open');
      if (isSheet()) { try { history.pushState({ fcPicker: 1 }, ''); pushed = true; } catch (e) { pushed = false; } }
      render(); refreshData(false);
      setTimeout(() => q.focus({ preventScroll: true }), 30);
    }
    function hideUI() {
      open = false; el.classList.remove('in'); back.hidden = el.hidden = true; button.setAttribute('aria-expanded', 'false');
      doc.documentElement.classList.remove('pk-open'); q.blur();
    }
    function close(then) {
      if (!open) return;
      if (pushed) { pushed = false; pending = then || null; hideUI(); history.back(); }
      else { hideUI(); if (then) then(); button.focus({ preventScroll: true }); }
    }
    window.addEventListener('popstate', () => {
      if (open) { pushed = false; hideUI(); }
      if (pending) { const f = pending; pending = null; f(); }
    });
    function pick(name) { name = normSym(name); if (!name) return; close(() => { pushRecent(name); onPick(name); renderChips(); }); }

    q.addEventListener('input', () => { hi = 0; render(); list.scrollTop = 0; });
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); const r = rows[hi]; if (r) pick(r.name); else if (q.value.trim()) pick(q.value); }
      else if (e.key === 'Escape') { e.preventDefault(); if (q.value) { q.value = ''; render(); } else close(); }
      else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !q.value) {
        e.preventDefault(); const i = TABS.findIndex(t => t[0] === tab); tab = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]; hi = 0; render();
      }
    });
    el.querySelector('.pk-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; q.value = ''; hi = 0; render(); list.scrollTop = 0; });
    list.addEventListener('click', e => {
      const s = e.target.closest('[data-star]');
      if (s) { e.stopPropagation(); toggleFav(s.dataset.star); render(); renderChips(); return; }
      const r = e.target.closest('.pk-row'); if (r && rows[+r.dataset.i]) pick(rows[+r.dataset.i].name);
    });
    list.addEventListener('pointermove', e => { const r = e.target.closest('.pk-row'); if (r && +r.dataset.i !== hi && e.pointerType === 'mouse') { hi = +r.dataset.i; list.querySelectorAll('.pk-row').forEach(x => x.classList.toggle('hi', +x.dataset.i === hi)); } });
    el.querySelector('.pk-close').addEventListener('click', () => close());
    back.addEventListener('click', () => close());
    button.addEventListener('click', () => (open ? close() : show()));
    doc.addEventListener('keydown', e => {
      if (open && e.key === 'Escape') { e.preventDefault(); close(); return; }
      const tag = (e.target.tagName || '').toLowerCase();
      if (!open && e.key === '/' && !/input|textarea|select/.test(tag) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); show(); }
    });
    window.addEventListener('resize', () => { if (open && !isSheet()) place(); });

    /* 툴바 즐겨찾기 칩 */
    function renderChips() {
      if (!chips) return;
      const cur = getSym(), m = byName();
      chips.innerHTML = favs().map(n => {
        const it = m.get(n), cls = it && it.chg > 0 ? 'up' : it && it.chg < 0 ? 'dn' : '';
        return `<button type="button" class="chip${n === cur ? ' on' : ''}" data-sym="${esc(n)}" title="${esc(n)}">${n.includes(':') ? `<small>${esc(dexOf(n))}:</small>` : ''}${esc(coinOf(n))}${it && it.chg != null ? `<em class="${cls}">${it.chg > 0 ? '+' : ''}${it.chg.toFixed(1)}%</em>` : ''}</button>`;
      }).join('') + '<button type="button" class="chip add" aria-label="즐겨찾기 편집">＋</button>';
      const on = chips.querySelector('.chip.on'); if (on && chips.scrollWidth > chips.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (chips) chips.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      if (b.classList.contains('add')) { show(); return; }
      const n = b.dataset.sym; if (n === getSym()) return; pushRecent(n); onPick(n); renderChips();
    });
    const c = cachedUniverse(); if (c) uni = c;
    renderChips();
    // 칩의 24h 변동률을 위해 백그라운드로 목록 미리 로드
    setTimeout(() => loadUniverse(false).then(v => { uni = v; renderChips(); }).catch(() => {}), 800);
    return { open: show, close, renderChips, get isOpen() { return open; } };
  }

  return { init, search, score, normSym, category, coinOf, dexOf, krName, fmtPx, fmtVol, fmtChg, parseMetaCtx, DEFAULT_FAVS, pushRecent, dropRecent, toggleFav, favs, recents };
});
