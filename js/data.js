/* data.js — 거래소 공개 API에서 데이터 수집 (모두 브라우저에서 직접 호출, 비밀값 없음) */
(function () {
  'use strict';
  const FC = self.FC;

  const TF = {
    '15m': { ms: 15 * 60e3, bn: '15m', hl: '15m', ca: '15min', cb: 900, cbAgg: 1, label: '15M' },
    '1h':  { ms: 60 * 60e3, bn: '1h',  hl: '1h',  ca: '1hour', cb: 3600, cbAgg: 1, label: '1H' },
    '4h':  { ms: 240 * 60e3, bn: '4h', hl: '4h',  ca: '4hour', cb: 3600, cbAgg: 4, label: '4H' },
  };
  const WARMUP = 260; // EMA200 워밍업

  const PANEL_META = {
    premium: { title: 'Coinbase 프리미엄', color: '#c0577a', kind: 'bar', unit: '%' },
    bnf:     { title: 'Binance 선물 CVD', color: '#c0577a', kind: 'line' },
    bns:     { title: 'Binance 현물 CVD', color: '#3f9a6e', kind: 'line' },
    cbs:     { title: 'Coinbase 현물 CVD', color: '#3b6fa8', kind: 'line' },
    hl:      { title: 'Hyperliquid 선물 CVD', color: '#c08a2a', kind: 'line' },
    liq:     { title: '거래소 합산 청산 · 롱− / 숏+', color: '#8a8a8a', kind: 'liq' },
  };

  async function getJSON(url, init) {
    let r;
    try { r = await fetch(url, init); }
    catch (e) { const err = new Error('네트워크/CORS 차단'); err.cors = true; throw err; }
    if (!r.ok) {
      const err = new Error('HTTP ' + r.status + (r.status === 451 ? ' (지역 제한)' : r.status === 429 ? ' (요청 한도 초과)' : ''));
      err.status = r.status; err.retryAfter = r.headers.get('Retry-After'); throw err;
    }
    return r.json();
  }

  /* ---------- Binance ---------- */
  function parseBn(rows) {
    return rows.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], qv: +k[7], tbv: +k[9], tbq: +k[10] }));
  }
  async function binanceSpot(pair, interval, limit) {
    const q = `/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
    try { return parseBn(await getJSON('https://data-api.binance.vision' + q)); }
    catch (e) { if (e.status === 400) throw e; return parseBn(await getJSON('https://api.binance.com' + q)); }
  }
  async function binanceFutures(pair, interval, limit) {
    return parseBn(await getJSON(`https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${interval}&limit=${Math.min(limit, 1500)}`));
  }

  /* ---------- Hyperliquid ---------- */
  async function hlCandles(coin, interval, startMs, endMs) {
    const rows = await getJSON('https://api.hyperliquid.xyz/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime: startMs, endTime: endMs } })
    });
    return rows.map(k => { const c = +k.c, v = +k.v; return { t: k.t, o: +k.o, h: +k.h, l: +k.l, c, v, qv: v * c }; });
  }

  /* ---------- Coinbase Exchange (공개 캔들, 1요청당 최대 300개) ---------- */
  async function coinbaseCandles(product, gran, startMs, endMs) {
    const out = [], step = gran * 1000 * 300;
    const jobs = [];
    for (let s = startMs; s < endMs; s += step) {
      const e = Math.min(endMs, s + step - gran * 1000);
      jobs.push(getJSON(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=${gran}&start=${new Date(s).toISOString()}&end=${new Date(e).toISOString()}`));
    }
    for (const rows of await Promise.all(jobs)) for (const r of rows) out.push({ t: r[0] * 1000, l: r[1], h: r[2], o: r[3], c: r[4], v: r[5] });
    out.sort((a, b) => a.t - b.t);
    return out.filter((x, i) => i === 0 || x.t !== out[i - 1].t);
  }

  /* ---------- Coinalyze ---------- */
  function caBase(settings) { return (settings.caProxy || 'https://api.coinalyze.net/v1').replace(/\/$/, ''); }
  async function caGet(settings, path, params) {
    const qs = new URLSearchParams(params || {});
    if (settings.caKey) qs.set('api_key', settings.caKey); // 쿼리 파라미터 → 사전요청(preflight) 없는 단순 GET
    return getJSON(caBase(settings) + path + (qs.toString() ? '?' + qs : ''));
  }
  async function caMarkets(settings) {
    const ck = 'fc_ca_markets_v1';
    try {
      const c = JSON.parse(localStorage.getItem(ck) || 'null');
      if (c && Date.now() - c.t < 24 * 3600e3 && c.base === caBase(settings)) return c;
    } catch (e) { /* ignore */ }
    const [exchanges, future, spot] = await Promise.all([
      caGet(settings, '/exchanges'), caGet(settings, '/future-markets'), caGet(settings, '/spot-markets')]);
    const slim = (m) => ({ symbol: m.symbol, exchange: m.exchange, soe: m.symbol_on_exchange, base: m.base_asset,
      quote: m.quote_asset, perp: m.is_perpetual, margined: m.margined, bs: m.has_buy_sell_data, den: m.oi_lq_vol_denominated_in });
    const c = { t: Date.now(), base: caBase(settings), exchanges, future: future.map(slim), spot: spot.map(slim) };
    try { localStorage.setItem(ck, JSON.stringify(c)); } catch (e) { /* quota */ }
    return c;
  }
  const EX_PREF = ['binance', 'bybit', 'okx', 'hyperliquid', 'bitget', 'gate', 'deribit', 'bitmex', 'coinbase', 'kraken', 'htx', 'huobi', 'bitfinex', 'kucoin', 'mexc', 'bingx', 'phemex', 'dydx'];
  function exCode(mk, re) { const e = mk.exchanges.find(x => re.test(x.name)); return e && e.code; }
  function exName(mk, code) { const e = mk.exchanges.find(x => x.code === code); return e ? e.name.toLowerCase() : ''; }
  function matchBase(m, sym) { return sym.includes(':') ? (m.soe === sym || m.soe === sym.replace(':', '-')) : m.base === sym; }

  function pickLiqSymbols(mk, sym, max = 12) {
    const perps = mk.future.filter(m => m.perp && matchBase(m, sym));
    const byEx = new Map();
    const score = (m) => (m.margined === 'STABLE' ? 0 : 2) + (/USDT/.test(m.quote) ? 0 : /USD/.test(m.quote) ? 0.5 : 1);
    for (const m of perps) { const cur = byEx.get(m.exchange); if (!cur || score(m) < score(cur)) byEx.set(m.exchange, m); }
    const rank = (code) => { const n = exName(mk, code); const i = EX_PREF.findIndex(p => n.includes(p)); return i < 0 ? 99 : i; };
    return [...byEx.values()].sort((a, b) => rank(a.exchange) - rank(b.exchange)).slice(0, max).map(m => m.symbol);
  }

  async function caOhlcvCvd(settings, symbol, tf, fromS, toS) {
    const rows = await caGet(settings, '/ohlcv-history', { symbols: symbol, interval: TF[tf].ca, from: fromS, to: toS });
    const h = (rows[0] && rows[0].history) || [];
    return h.map(x => ({ t: x.t * 1000, v: x.v * x.c, bv: x.bv * x.c })); // 기초자산 수량 × 종가 ≈ USD
  }
  async function caLiq(settings, symbols, tf, fromS, toS) {
    const rows = await caGet(settings, '/liquidation-history', { symbols: symbols.join(','), interval: TF[tf].ca, from: fromS, to: toS, convert_to_usd: 'true' });
    const m = new Map();
    for (const r of rows) for (const x of r.history || []) {
      const t = x.t * 1000, a = m.get(t) || { t, l: 0, s: 0 }; a.l += x.l || 0; a.s += x.s || 0; m.set(t, a);
    }
    return [...m.values()].sort((a, b) => a.t - b.t);
  }

  /* ---------- 모의 데이터 (?mock=1) ---------- */
  function mockAll(sym, tf, n) {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ms = TF[tf].ms, now = Math.floor(Date.now() / ms) * ms;
    let p = sym.includes('ETH') ? 2500 : sym.includes(':') ? 7780 : 82000;
    const C = [];
    for (let i = n - 1; i >= 0; i--) {
      const o = p, drift = Math.sin(i / 37) * 0.002 + (rnd() - 0.5) * 0.012, c = o * (1 + drift);
      const h = Math.max(o, c) * (1 + rnd() * 0.004), l = Math.min(o, c) * (1 - rnd() * 0.004);
      const v = 500 + rnd() * 1500, buy = v * (0.5 + (c > o ? 0.08 : -0.08) * rnd());
      C.push({ t: now - i * ms, o, h, l, c, v, qv: v * c, tbv: buy, tbq: buy * c }); p = c;
    }
    return C;
  }

  /* ---------- 전체 로드 ---------- */
  async function loadAll(opts) {
    const { sym, tf, bars, settings, mock } = opts;
    const T = TF[tf], isHip = sym.includes(':'), need = bars + WARMUP;
    const now = Date.now(), startFull = Math.floor(now / T.ms) * T.ms - (need - 1) * T.ms;
    const warnings = [], status = {};
    const pair = sym + 'USDT';

    let full, src, lvl15, bnS = null, bnF = null, hl = null;
    if (mock) {
      full = mockAll(sym, tf, need); src = 'MOCK';
      lvl15 = tf === '15m' ? full : mockAll(sym, '15m', 400);
      bnS = bnF = full; hl = full;
    } else {
      const tasks = {
        bnF: isHip ? null : binanceFutures(pair, T.bn, need),
        bnS: isHip ? null : binanceSpot(pair, T.bn, need),
        hl: hlCandles(sym, T.hl, startFull, now),
        lv: null,
      };
      const settle = async (p) => { if (!p) return { skip: true }; try { return { v: await p }; } catch (e) { return { e }; } };
      const [rF, rS, rH] = await Promise.all([settle(tasks.bnF), settle(tasks.bnS), settle(tasks.hl)]);
      if (rF.v && rF.v.length) bnF = rF.v; else if (rF.e) { status.bnf = rF.e.message; warnings.push('Binance 선물: ' + rF.e.message + (rF.e.status === 400 ? ' (심볼 없음)' : ' (미국 등 제한 지역 IP는 451 차단)')); }
      if (rS.v && rS.v.length) bnS = rS.v; else if (rS.e) { status.bns = rS.e.message; warnings.push('Binance 현물: ' + rS.e.message); }
      if (rH.v && rH.v.length) hl = rH.v; else if (rH.e) { status.hl = rH.e.message; warnings.push('Hyperliquid: ' + rH.e.message); }
      if (bnF) { full = bnF; src = 'Binance 선물'; }
      else if (bnS) { full = bnS; src = 'Binance 현물'; }
      else if (hl) { full = hl; src = 'Hyperliquid'; }
      else throw new Error('가격 데이터를 불러오지 못했습니다 (' + warnings.join(' / ') + ')');
      // 세션·전일 레벨은 항상 15분봉으로 계산 (4시간봉에서도 정확하게)
      if (tf === '15m') lvl15 = full;
      else {
        try {
          if (src === 'Binance 선물') lvl15 = await binanceFutures(pair, '15m', 400);
          else if (src === 'Binance 현물') lvl15 = await binanceSpot(pair, '15m', 400);
          else lvl15 = await hlCandles(sym, '15m', now - 400 * 15 * 60e3, now);
        } catch (e) { lvl15 = full; warnings.push('15분봉 레벨 데이터 실패 → 현재 봉으로 계산'); }
      }
    }

    // 지표는 전체 구간으로 계산 후 표시 구간만 자름
    const closes = full.map(c => c.c);
    const emas = { 20: FC.ema(closes, 20), 50: FC.ema(closes, 50), 100: FC.ema(closes, 100), 200: FC.ema(closes, 200) };
    const cut = Math.max(0, full.length - bars);
    const candles = full.slice(cut);
    const times = candles.map(c => c.t);
    const E = {}; for (const k in emas) E[k] = emas[k].slice(cut);
    const shift = (arr) => arr.map(z => ({ ...z, i0: z.i0 - cut, end: z.end == null ? null : z.end - cut, created: z.created != null ? z.created - cut : undefined }));
    const fvg = shift(FC.findFVG(full)).filter(z => (z.end == null || z.end >= 0) && z.i0 >= -20);
    const ob = shift(FC.findOB(full)).filter(z => z.end == null && z.i0 >= -WARMUP);
    const sessions = FC.sessionLevels(lvl15, now);
    const pd = FC.prevDayLevels(lvl15, now);
    // TDO: 15분봉은 뉴욕 자정에 항상 정렬 → 정확. 없으면 현재 타임프레임 봉(자정을 품은 봉, 'TDO≈')
    const tdo = FC.trueDayOpen(lvl15, now, 15 * 60e3) || FC.trueDayOpen(full, now, T.ms);

    /* ---------- 사이드 패널 ---------- */
    const panels = [];
    let cbP = null; // Coinbase 캔들은 한 번만 요청 (프리미엄 + 근사 CVD 공용)
    const getCb = () => cbP || (cbP = coinbaseCandles(sym + '-USD', T.cb, times[0], times[times.length - 1] + T.ms));
    const cum = (deltas) => { let s = 0; return deltas.map(d => (d == null ? null : (s += d))); };
    const addPanel = (id, values, extra) => {
      if (!values || values.every(v => v == null)) return;
      panels.push({ id, ...PANEL_META[id], values, ...(extra || {}) });
    };
    const bnDelta = (rows) => FC.alignTo(times, rows.map(k => ({ t: k.t, d: 2 * k.tbq - k.qv })), 'd');

    // 1) Coinbase 프리미엄
    if (!isHip && bnS) {
      if (mock) addPanel('premium', times.map((t, i) => -0.05 - 0.06 * Math.abs(Math.sin(i / 9))));
      else {
        try {
                    const cb = await getCb();
          const cbClose = new Map(cb.map(x => [x.t, x.c]));
          const bnClose = new Map(bnS.map(x => [x.t, x.c]));
          const subMs = T.cb * 1000;
          const vals = times.map(t => {
            const cc = cbClose.get(t + T.ms - subMs), bc = bnClose.get(t); // 상위봉의 마지막 하위봉 종가
            return cc != null && bc ? ((cc - bc) / bc) * 100 : null;
          });
          addPanel('premium', vals);
        } catch (e) { warnings.push('Coinbase 프리미엄: ' + e.message); }
      }
    }
    // 2) Binance 선물 CVD, 3) Binance 현물 CVD
    if (bnF) addPanel('bnf', cum(bnDelta(bnF)));
    if (bnS) addPanel('bns', cum(bnDelta(bnS)));

    // Coinalyze (키가 있으면): Coinbase 현물 CVD, HL CVD, 합산 청산
    let mk = null;
    const fromS = Math.floor(times[0] / 1000), toS = Math.floor((times[times.length - 1] + T.ms) / 1000);
    if (!mock && settings.caKey) {
      try { mk = await caMarkets(settings); }
      catch (e) { warnings.push('Coinalyze: ' + e.message + (e.cors ? ' → 브라우저 직접 호출이 막힘. 설정의 프록시 URL 사용 필요' : '')); }
    }
    // 4) Coinbase 현물 CVD
    if (!isHip) {
      let done = false;
      if (mk) {
        const cbCode = exCode(mk, /coinbase/i);
        const m = mk.spot.find(x => x.exchange === cbCode && x.base === sym && /^USD$/.test(x.quote) && x.bs)
               || mk.spot.find(x => x.exchange === cbCode && x.base === sym && x.bs);
        if (m) {
          try {
            const rows = await caOhlcvCvd(settings, m.symbol, tf, fromS, toS);
            addPanel('cbs', cum(FC.alignTo(times, rows.map(r => ({ t: r.t, d: 2 * r.bv - r.v })), 'd')));
            done = true;
          } catch (e) { warnings.push('Coinbase 현물 CVD(Coinalyze): ' + e.message); }
        }
      }
      if (!done && mock) { addPanel('cbs', cum(bnDelta(bnS).map(d => d && d * 0.3))); done = true; }
      if (!done) {
        try {
          const cb = await getCb();
          const agg = T.cbAgg > 1 ? FC.resample(cb, T.ms) : cb;
          const ap = agg.map(x => ({ t: x.t, d: Math.sign(x.c - x.o) * x.v * x.c }));
          addPanel('cbs', cum(FC.alignTo(times, ap, 'd')), { approx: true, title: PANEL_META.cbs.title + ' (근사)' });
        } catch (e) { warnings.push('Coinbase 현물 CVD: ' + e.message); }
      }
    }
    // 5) Hyperliquid 선물 CVD
    {
      let done = false;
      if (mk) {
        const hlCode = exCode(mk, /hyperliquid/i);
        const m = mk.future.find(x => x.exchange === hlCode && x.perp && matchBase(x, sym) && x.bs);
        if (m) {
          try {
            const rows = await caOhlcvCvd(settings, m.symbol, tf, fromS, toS);
            addPanel('hl', cum(FC.alignTo(times, rows.map(r => ({ t: r.t, d: 2 * r.bv - r.v })), 'd')));
            done = true;
          } catch (e) { warnings.push('Hyperliquid CVD(Coinalyze): ' + e.message); }
        }
      }
      if (!done && mock) { addPanel('hl', cum(bnDelta(full).map(d => d && d * 0.2))); done = true; }
      if (!done && hl) {
        const ap = hl.map(x => ({ t: x.t, d: Math.sign(x.c - x.o) * x.v * x.c }));
        addPanel('hl', cum(FC.alignTo(times, ap, 'd')), { approx: true, title: PANEL_META.hl.title + ' (근사)' });
      }
    }
    // 6) 거래소 합산 청산
    if (mock) {
      addPanel('liq', times.map((t, i) => ({ l: (i % 7 === 0 ? 3e6 * (1 + Math.sin(i)) : 2e5), s: (i % 11 === 0 ? 4e6 : 1e5) })));
    } else if (mk) {
      const syms = pickLiqSymbols(mk, sym);
      if (syms.length) {
        try {
          const rows = await caLiq(settings, syms, tf, fromS, toS);
          const m = new Map(rows.map(r => [r.t, r]));
          addPanel('liq', times.map(t => m.get(t) || { l: 0, s: 0 }), { note: syms.length + '개 거래소 합산' });
        } catch (e) { warnings.push('청산(Coinalyze): ' + e.message); }
      }
    }

    // 프리미엄/선물/현물 표시 순서 고정
    const order = ['premium', 'bnf', 'bns', 'cbs', 'hl', 'liq'];
    panels.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    if (!mock && !settings.caKey) warnings.push('Coinalyze 키 미설정: Coinbase·HL CVD는 근사치, 합산 청산은 숨김');

    return { sym, tf, tfLabel: T.label, tfMs: T.ms, candles, times, emas: E, fvg, ob, sessions, pd, tdo, panels, src, warnings, fetchedAt: now, status };
  }

  self.FCData = { loadAll, TF, PANEL_META, pickLiqSymbols };
})();
