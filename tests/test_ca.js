// node tests/test_ca.js — Coinalyze 스로틀·캐시·병합·429 처리 테스트 (가짜 시계 + 모의 fetch)
const assert = require('assert');
const CA = require('../js/ca.js');
let pass = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

class Store {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
function clockEnv(start = 1_760_000_000_000) {
  const c = { now: start, slept: [] };
  c.env = { now: () => c.now, sleep: async (ms) => { c.slept.push(ms); c.now += ms; } };
  return c;
}
const H = 3600, HMS = 3600e3;
const bars = (sym, t0, n, step = H, f = 1) => ({ symbol: sym, history: Array.from({ length: n }, (_, i) => ({ t: t0 + i * step, o: 1, h: 1, l: 1, c: 100 * f, v: 10, bv: 6, tx: 3 })) });
const qp = (url) => Object.fromEntries(new URL(url).searchParams);

t('parseRetryAfter: 숫자·날짜·없음', () => {
  assert.strictEqual(CA.parseRetryAfter('7'), 7);
  assert.strictEqual(CA.parseRetryAfter(null), 10);
  assert.strictEqual(CA.parseRetryAfter('abc'), 10);
  assert.strictEqual(CA.parseRetryAfter(new Date(1_000_000 + 30e3).toUTCString(), 1_000_000), 30);
});
t('freshMs = max(60초, 봉/2)', () => {
  assert.strictEqual(CA.freshMs(15 * 60e3), 450e3);
  assert.strictEqual(CA.freshMs(60e3), 60e3);
  assert.strictEqual(CA.freshMs(4 * HMS), 2 * HMS);
});
t('mergeRows: 같은 t는 새 값, 정렬, 심볼 합집합', () => {
  const a = [{ symbol: 'A', history: [{ t: 1, v: 1 }, { t: 2, v: 2 }] }, { symbol: 'B', history: [{ t: 1, v: 9 }] }];
  const b = [{ symbol: 'A', history: [{ t: 3, v: 3 }, { t: 2, v: 20 }] }, { symbol: 'C', history: [{ t: 5, v: 5 }] }];
  const m = CA.mergeRows(a, b);
  assert.deepStrictEqual(m.find(r => r.symbol === 'A').history, [{ t: 1, v: 1 }, { t: 2, v: 20 }, { t: 3, v: 3 }]);
  assert.strictEqual(m.find(r => r.symbol === 'B').history.length, 1);
  assert.strictEqual(m.find(r => r.symbol === 'C').history[0].v, 5);
});
t('trimRows / lastT', () => {
  const r = [bars('A', 0, 10), bars('B', 0, 8)];
  assert.strictEqual(CA.lastT(r), 7 * H);
  assert.strictEqual(CA.trimRows(r, 5 * H)[0].history.length, 5);
  assert.strictEqual(CA.trimRows(r, 0, 3)[0].history[0].t, 7 * H);
  assert.strictEqual(CA.lastT([{ symbol: 'A', history: [] }]), null);
});
t('planFetch: full / fresh / incr(마지막−2봉) / 범위 부족 → full', () => {
  const now = 1000 * HMS;
  assert.deepStrictEqual(CA.planFetch(null, 500 * H, HMS, now), { mode: 'full', from: 500 * H });
  const e = { at: now - 10e3, from: 400 * H, rows: [bars('A', 400 * H, 600)] }; // 마지막 t = 999h
  assert.deepStrictEqual(CA.planFetch(e, 500 * H, HMS, now), { mode: 'fresh' });
  assert.deepStrictEqual(CA.planFetch({ ...e, at: now - 31 * 60e3 }, 500 * H, HMS, now), { mode: 'incr', from: 997 * H });
  assert.deepStrictEqual(CA.planFetch({ ...e, from: 600 * H }, 500 * H, HMS, now), { mode: 'full', from: 500 * H }); // 캐시가 요청 시작을 못 덮음
});
t('reserve: 롤링 60초 30회, 초과 시 대기 ms', () => {
  const s = new Store();
  for (let i = 0; i < 30; i++) assert.strictEqual(CA.reserve(s, 1000 + i), 0);
  assert.strictEqual(CA.reserve(s, 1030), 60e3 - 30);   // 가장 오래된 호출(1000)이 빠질 때까지
  assert.strictEqual(CA.reserve(s, 61_000), 0);          // 윈도 지나면 다시 가능
});
t('스로틀: 탭 간 공유 저장소 → 두 클라이언트 합산 30회 후 대기', async () => {
  const s = new Store(), c = clockEnv(); let n = 0;
  const mk = () => CA.createClient({ storage: s, ...c.env, maxWaitMs: 120e3, fetchJSON: async () => { n++; return []; } });
  const A = mk(), B = mk();
  for (let i = 0; i < 20; i++) await A.get('https://x', '/p', { i: 'a' + i });
  for (let i = 0; i < 10; i++) await B.get('https://x', '/p', { i: 'b' + i });
  assert.strictEqual(c.slept.length, 0);
  await B.get('https://x', '/p', { i: 'b-over' });
  assert.strictEqual(n, 31);
  assert.ok(c.slept.length === 1 && c.slept[0] > 0 && c.slept[0] <= 60e3);
});
t('스로틀: 대기가 maxWait 초과면 호출 없이 throttled 에러', async () => {
  const s = new Store(), c = clockEnv(); let n = 0;
  for (let i = 0; i < 30; i++) CA.reserve(s, c.now);
  const A = CA.createClient({ storage: s, ...c.env, maxWaitMs: 15e3, fetchJSON: async () => { n++; return []; } });
  await assert.rejects(A.get('https://x', '/p', {}), e => e.throttled && e.limited && e.waitS === 60);
  assert.strictEqual(n, 0);
});
t('큐: 순차 실행 + 같은 URL 중복 합치기', async () => {
  const s = new Store(), c = clockEnv(); let active = 0, maxActive = 0, n = 0;
  const A = CA.createClient({ storage: s, ...c.env, fetchJSON: async () => { n++; active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 5)); active--; return [n]; } });
  const [x, y, z] = await Promise.all([A.get('https://x', '/a', {}), A.get('https://x', '/a', {}), A.get('https://x', '/b', {})]);
  assert.strictEqual(n, 2); assert.strictEqual(maxActive, 1); assert.deepStrictEqual(x, y); assert.notDeepStrictEqual(x, z);
});
t('429: Retry-After ≤15초 → 대기 후 1회 재시도 성공', async () => {
  const s = new Store(), c = clockEnv(); let n = 0;
  const A = CA.createClient({ storage: s, ...c.env, fetchJSON: async () => { n++; if (n === 1) throw Object.assign(new Error('HTTP 429'), { status: 429, retryAfter: '5' }); return ['ok']; } });
  assert.deepStrictEqual(await A.get('https://x', '/p', {}), ['ok']);
  assert.strictEqual(n, 2); assert.deepStrictEqual(c.slept, [5000]);
});
t('429: Retry-After >15초 → 재시도 없이 실패, 백오프 동안 호출 생략', async () => {
  const s = new Store(), c = clockEnv(); let n = 0;
  const A = CA.createClient({ storage: s, ...c.env, fetchJSON: async () => { n++; throw Object.assign(new Error('HTTP 429'), { status: 429, retryAfter: '40' }); } });
  await assert.rejects(A.get('https://x', '/p', {}), e => e.status === 429 && e.waitS === 40);
  assert.strictEqual(n, 1); assert.strictEqual(A.backoffLeftS(), 40);
  // 다른 탭(같은 저장소)도 백오프를 지킴
  const B = CA.createClient({ storage: s, ...c.env, fetchJSON: async () => { n++; return []; } });
  await assert.rejects(B.get('https://x', '/q', {}), e => e.backoff && e.waitS === 40);
  assert.strictEqual(n, 1);
  c.now += 41e3; await B.get('https://x', '/q', {}); assert.strictEqual(n, 2);
});
t('429 두 번 연속(재시도도 429) → 1회만 재시도하고 실패', async () => {
  const s = new Store(), c = clockEnv(); let n = 0;
  const A = CA.createClient({ storage: s, ...c.env, fetchJSON: async () => { n++; throw Object.assign(new Error('HTTP 429'), { status: 429, retryAfter: '3' }); } });
  await assert.rejects(A.get('https://x', '/p', {}), e => e.status === 429);
  assert.strictEqual(n, 2);
});

/* history(): 캐시 + 증분 */
function histEnv() {
  const s = new Store(), c = clockEnv(1000 * HMS), calls = [];
  let fail = null;
  const A = CA.createClient({ storage: s, ...c.env, fetchJSON: async (url) => {
    calls.push(qp(url)); if (fail) throw fail;
    const q = qp(url), out = [];
    for (const sym of q.symbols.split(',')) {
      const h = []; for (let tt = +q.from; tt < +q.to; tt += H) h.push({ t: tt, o: 1, h: 1, l: 1, c: 100, v: 10, bv: calls.length, tx: 1 });
      out.push({ symbol: sym, history: h });
    }
    return out;
  } });
  return { s, c, calls, A, setFail: (e) => { fail = e; } };
}
const hopts = (c, extra) => ({ base: 'https://p', apiKey: 'K', path: '/ohlcv-history', symbols: 'CB,HL', interval: '1hour', tfMs: HMS,
  fromS: c.now / 1000 - 100 * H, toS: c.now / 1000, ...(extra || {}) });

t('history: 첫 요청 full → 같은 범위는 신선 캐시(호출 0) → 오래되면 증분(from = 마지막 t − 2봉) 병합', async () => {
  const { c, calls, A } = histEnv();
  const r1 = await A.history(hopts(c));
  assert.strictEqual(r1.state, 'net'); assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].symbols, 'CB,HL'); assert.strictEqual(calls[0].api_key, 'K');
  assert.strictEqual(r1.rows[0].history.length, 100);
  assert.deepStrictEqual(Object.keys(r1.rows[0].history[0]).sort(), ['bv', 'c', 't', 'v']); // 슬림 저장
  c.now += 20e3;
  const r2 = await A.history(hopts(c));
  assert.strictEqual(r2.state, 'fresh'); assert.strictEqual(calls.length, 1);
  c.now += 2 * HMS - 20e3; // 2봉 경과 → 30분(봉/2) 넘음
  const r3 = await A.history(hopts(c));
  assert.strictEqual(r3.state, 'net'); assert.strictEqual(calls.length, 2);
  const lastPrev = r1.rows[0].history[99].t;
  assert.strictEqual(+calls[1].from, lastPrev - 2 * H);
  const h = r3.rows.find(r => r.symbol === 'CB').history;
  assert.strictEqual(h.length, 100);                         // 새 범위로 잘림
  assert.strictEqual(h[h.length - 1].t, c.now / 1000 - H);  // 최신 봉 포함
  assert.strictEqual(h.find(x => x.t === lastPrev).bv, 2);  // 겹친 봉은 새 값으로 교체
  assert.strictEqual(h.find(x => x.t === lastPrev - 3 * H).bv, 1); // 이전 봉은 캐시 유지
});
t('history: 더 긴 범위 요청(봉 수 증가)은 full', async () => {
  const { c, calls, A } = histEnv();
  await A.history(hopts(c));
  c.now += 2 * HMS;
  await A.history(hopts(c, { fromS: c.now / 1000 - 300 * H }));
  assert.strictEqual(+calls[1].from, c.now / 1000 - 300 * H);
});
t('history: 실패 시 캐시 있으면 stale+err 반환, 없으면 throw; cacheOnly는 호출 없음', async () => {
  const { c, calls, A, setFail } = histEnv();
  assert.strictEqual(await A.history(hopts(c, { cacheOnly: true })), null);
  assert.strictEqual(calls.length, 0);
  setFail(Object.assign(new Error('HTTP 500'), { status: 500 }));
  await assert.rejects(A.history(hopts(c)));
  setFail(null); await A.history(hopts(c));
  c.now += 2 * HMS;
  const co = await A.history(hopts(c, { cacheOnly: true }));
  assert.strictEqual(co.state, 'stale'); assert.ok(!co.err);
  setFail(Object.assign(new Error('HTTP 429'), { status: 429, retryAfter: '60' }));
  const st = await A.history(hopts(c));
  assert.strictEqual(st.state, 'stale'); assert.ok(st.err.limited); assert.strictEqual(st.rows[0].history.length, 98);
  const n = calls.length;
  const st2 = await A.history(hopts(c)); // 백오프 중 → 호출 생략
  assert.strictEqual(calls.length, n); assert.ok(st2.err.backoff);
});

/* loadAll 통합: 새로고침당 Coinalyze 호출 수 */
t('loadAll: 시장목록 캐시 후 새로고침당 Coinalyze 2회(ohlcv 1 + 청산 1), 신선하면 0회, 429면 캐시+회색 안내', async () => {
  const store = new Store();
  global.self = global; global.localStorage = store;
  self.FC = require('../js/calc.js'); self.FCCA = CA;
  let caCalls = [], ca429 = false;
  const now0 = Date.now();
  const kl = (interval, limit) => { const ms = { '15m': 9e5, '1h': 36e5, '4h': 144e5 }[interval]; const end = Math.floor(Date.now() / ms) * ms;
    return Array.from({ length: limit }, (_, i) => { const tt = end - (limit - 1 - i) * ms; return [tt, '100', '101', '99', '100', '10', 0, '1000', 0, '5', '520']; }); };
  const resp = (body, status = 200, ra) => ({ ok: status < 400, status, headers: { get: (h) => (h === 'Retry-After' ? ra : null) }, json: async () => body });
  global.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.host.includes('binance')) return resp(kl(u.searchParams.get('interval'), +u.searchParams.get('limit')));
    if (u.host.includes('hyperliquid')) return resp([]);
    if (u.host.includes('coinbase')) return resp([]);
    if (u.host === 'ca.test') {
      caCalls.push(u.pathname + '?' + u.searchParams.get('symbols'));
      if (ca429) return resp({}, 429, '45');
      if (u.pathname === '/exchanges') return resp([{ name: 'Coinbase', code: 'C' }, { name: 'Hyperliquid', code: 'H' }, { name: 'Binance', code: 'A' }]);
      if (u.pathname === '/spot-markets') return resp([{ symbol: 'BTCUSD.C', exchange: 'C', base_asset: 'BTC', quote_asset: 'USD', has_buy_sell_data: true }]);
      if (u.pathname === '/future-markets') return resp([
        { symbol: 'BTC.H', exchange: 'H', base_asset: 'BTC', quote_asset: 'USD', is_perpetual: true, has_buy_sell_data: true, margined: 'STABLE' },
        { symbol: 'BTCUSDT_PERP.A', exchange: 'A', base_asset: 'BTC', quote_asset: 'USDT', is_perpetual: true, has_buy_sell_data: true, margined: 'STABLE' }]);
      const q = Object.fromEntries(u.searchParams), out = [];
      for (const sym of q.symbols.split(',')) { const h = []; for (let tt = +q.from; tt < +q.to; tt += 3600) h.push({ t: tt, c: 100, v: 10, bv: 6, l: 1, s: 2 }); out.push({ symbol: sym, history: h }); }
      return resp(out);
    }
    throw new Error('unexpected ' + url);
  };
  delete require.cache[require.resolve('../js/data.js')];
  require('../js/data.js');
  const D = self.FCData;
  const settings = { caKey: 'K', caProxy: 'https://ca.test' };
  const opts = { sym: 'BTC', tf: '1h', bars: 100, settings, mock: false };
  let d = await D.loadAll(opts);
  assert.deepStrictEqual(caCalls, ['/exchanges?null', '/future-markets?null', '/spot-markets?null', '/ohlcv-history?BTCUSD.C,BTC.H', '/liquidation-history?BTCUSDT_PERP.A,BTC.H']);
  assert.ok(['cbs', 'hl', 'liq'].every(id => d.panels.some(p => p.id === id && !p.approx)));
  assert.deepStrictEqual(d.warnings, []); assert.strictEqual(d.caRefresh, null);
  caCalls = [];
  d = await D.loadAll(opts);                       // 바로 다시 → 신선 캐시
  assert.strictEqual(caCalls.length, 0);
  // 2시간 뒤처럼: 캐시 시각을 과거로 돌려 오래된 캐시 만들기
  const age = (ms) => { for (const k of [...store.m.keys()]) if (k.startsWith(CA.K_PRE)) { const e = JSON.parse(store.getItem(k)); e.at -= ms; store.setItem(k, JSON.stringify(e)); } };
  age(2 * 36e5);
  d = await D.loadAll(opts);                       // 캐시 즉시 표시 + 백그라운드 갱신
  assert.strictEqual(caCalls.length, 0); assert.ok(d.caRefresh);
  assert.ok(d.panels.some(p => p.id === 'cbs' && !p.approx));
  const r = await d.caRefresh();
  assert.deepStrictEqual(caCalls.map(x => x.split('?')[0]), ['/ohlcv-history', '/liquidation-history']);
  D.applyCa(d, r); assert.deepStrictEqual(d.warnings, []);
  // 429 (Retry-After 45초) → 캐시 + 회색 안내, 빨간 경고 없음, 이후 호출 생략
  age(2 * 36e5); caCalls = []; ca429 = true;
  d = await D.loadAll(opts);
  const r2 = await d.caRefresh(); D.applyCa(d, r2);
  assert.strictEqual(caCalls.length, 1);
  assert.deepStrictEqual(d.warnings, []);
  assert.ok(/^Coinalyze 한도 대기 중 · 캐시 데이터 표시 \(4\d초 후 재시도\)/.test(d.notes[0]), d.notes[0]);
  d = await D.loadAll(opts); await d.caRefresh();
  assert.strictEqual(caCalls.length, 1);            // 백오프 동안 생략
  // 캐시 전혀 없음 + 백오프 → ⚠ 경고 (호출 없음)
  for (const k of [...store.m.keys()]) if (k.startsWith(CA.K_PRE)) store.removeItem(k);
  d = await D.loadAll(opts);
  assert.strictEqual(caCalls.length, 1);
  assert.ok(d.warnings.some(w => /Coinbase 현물 CVD\(Coinalyze\): HTTP 429/.test(w)));
  assert.ok(d.panels.some(p => p.id === 'hl' && p.approx) || !d.panels.some(p => p.id === 'hl'));
  assert.ok(Date.now() - now0 < 10e3);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('✓', name); }
    catch (e) { console.log('✗', name); console.error(e); process.exitCode = 1; }
  }
  console.log(`\n${pass}/${tests.length} tests passed`);
})();
