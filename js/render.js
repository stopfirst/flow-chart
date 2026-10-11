/* render.js — 캔버스 렌더러 (화면 + PNG 내보내기 공용) */
(function () {
  'use strict';
  const FC = self.FC;
  const FONT = "'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";
  const COL = {
    up: '#5aa889', down: '#c8607e', grid: '#efeff2', axis: '#8a8f99', text: '#3b3f46',
    ema: { 20: '#2f86a6', 50: '#9a5fb0', 100: '#d08a3a', 200: '#4a5fb8' },
    asia: '#5b7fc7', london: '#3f9a6e', ny: '#d08a3a', pd: '#9aa0aa',
  };
  const SESSION_COL = { asia: COL.asia, london: COL.london, ny: COL.ny };

  function xLabelIdx(n) { return [Math.round(n * 0.08), Math.round(n * 0.5), Math.round(n * 0.92) - 1].map(i => Math.max(0, Math.min(n - 1, i))); }

  function setupCanvas(cv, cssW, cssH) {
    const dpr = Math.min(3, self.devicePixelRatio || 1);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
  }

  function idxOfTime(times, t, tfMs) {
    if (t < times[0]) return -1;
    for (let i = 0; i < times.length; i++) if (times[i] <= t && t < times[i] + tfMs) return i;
    return times.length - 1;
  }

  /* ---------- 메인 차트 ---------- */
  function drawMain(ctx, x0, y0, W, H, D, hover, opt) {
    opt = opt || {};
    const fs = opt.fs || 11;
    const C = D.candles, n = C.length;
    ctx.save(); ctx.translate(x0, y0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COL.text; ctx.font = `${fs + 1}px ${FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('가격·ICT', 4, 2);
    const L = opt.narrow ? 50 : 58, R = opt.narrow ? 70 : 92, T = 26, B = 24;
    const pw = W - L - R, ph = H - T - B;
    const step = pw / n;
    const X = (i) => L + (i + 0.5) * step;

    // y 범위: 캔들 + 가까운 레벨(범위의 35% 이내)
    let lo = Math.min(...C.map(c => c.l)), hi = Math.max(...C.map(c => c.h));
    const rng = hi - lo || hi * 0.01;
    const levels = [];
    if (D.pd) { levels.push({ v: D.pd.pdh, label: 'PDH', col: COL.pd, dash: [4, 3], start: -1 }); levels.push({ v: D.pd.pdl, label: 'PDL', col: COL.pd, dash: [4, 3], start: -1 }); }
    for (const k of ['asia', 'london', 'ny']) {
      const s = D.sessions && D.sessions[k]; if (!s) continue;
      const si = idxOfTime(D.times, s.start, D.tfMs);
      levels.push({ v: s.h, label: s.name + ' H', col: SESSION_COL[k], dash: [1.5, 2.5], start: si });
      levels.push({ v: s.l, label: s.name + ' L', col: SESSION_COL[k], dash: [1.5, 2.5], start: si });
    }
    for (const lv of levels) if (lv.v > hi && lv.v - hi < rng * 0.35) hi = lv.v; else if (lv.v < lo && lo - lv.v < rng * 0.35) lo = lv.v;
    const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    const Y = (v) => T + (hi - v) / (hi - lo) * ph;
    const inR = (v) => v >= lo && v <= hi;

    // 그리드 + y축
    ctx.font = `${fs - 1}px ${FONT}`; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = hi - (hi - lo) * g / 4, y = Y(v);
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillStyle = COL.axis; ctx.textAlign = 'right';
      const ref = Math.abs(hi);
      ctx.fillText(ref >= 10000 ? (v / 1000).toFixed(1) + 'k' : FC.fmtPrice(v, ref), L - 6, y);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();

    const rightLabels = [];
    // FVG (점선 박스)
    // 미충족 FVG 최근 4개 + 화면 안에서 메워진 FVG 최근 3개
    const fvgs = [...D.fvg.filter(z => z.end == null).slice(-4), ...D.fvg.filter(z => z.end != null && z.end >= 0 && z.i0 >= 0).slice(-3)];
    for (const z of fvgs) {
      const xa = Math.max(L, X(z.i0) - step / 2), xb = z.end == null ? L + pw : X(z.end) + step / 2;
      const ya = Y(z.top), yb = Y(z.bottom);
      const c = z.dir === 'bull' ? '80,160,125' : '200,96,126';
      ctx.fillStyle = `rgba(${c},0.07)`; ctx.fillRect(xa, ya, xb - xa, yb - ya);
      ctx.setLineDash([2, 2]); ctx.strokeStyle = `rgba(${c},0.55)`; ctx.lineWidth = 1; ctx.strokeRect(xa + 0.5, ya + 0.5, xb - xa - 1, yb - ya - 1); ctx.setLineDash([]);
    }
    // OB (실선 박스, 오른쪽 끝까지)
    const obs = [...D.ob.filter(z => z.dir === 'bull').slice(-2), ...D.ob.filter(z => z.dir === 'bear').slice(-2)];
    for (const z of obs) {
      if (!inR(z.top) && !inR(z.bottom) && !(z.top > hi && z.bottom < lo)) continue;
      const xa = Math.max(L, X(z.i0) - step / 2), xb = L + pw;
      const ya = Y(z.top), yb = Y(z.bottom);
      const c = z.dir === 'bull' ? '80,160,125' : '200,96,126';
      ctx.fillStyle = `rgba(${c},0.13)`; ctx.fillRect(xa, ya, xb - xa, yb - ya);
      ctx.strokeStyle = `rgba(${c},0.75)`; ctx.lineWidth = 1; ctx.strokeRect(xa + 0.5, ya + 0.5, xb - xa - 1, yb - ya - 1);
      rightLabels.push({ y: (ya + yb) / 2, text: 'OB', col: `rgb(${c})` });
    }
    // 레벨 선
    for (const lv of levels) {
      if (!inR(lv.v)) continue;
      const y = Math.round(Y(lv.v)) + 0.5, xa = lv.start < 0 ? L : X(lv.start) - step / 2;
      ctx.strokeStyle = lv.col; ctx.setLineDash(lv.dash); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.setLineDash([]);
      rightLabels.push({ y, text: lv.label, col: lv.col });
    }
    // EMA
    for (const k of [200, 100, 50, 20]) {
      const e = D.emas[k]; ctx.strokeStyle = COL.ema[k]; ctx.lineWidth = 1.3; ctx.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) { if (e[i] == null) { pen = false; continue; } const x = X(i), y = Y(e[i]); if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // 캔들
    const cw = Math.max(1, Math.min(14, step * 0.62));
    for (let i = 0; i < n; i++) {
      const c = C[i], up = c.c >= c.o, col = up ? COL.up : COL.down, x = X(i);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(c.h)); ctx.lineTo(Math.round(x) + 0.5, Y(c.l)); ctx.stroke();
      const yo = Y(c.o), yc = Y(c.c); ctx.fillStyle = col;
      ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
    }
    // 크로스헤어
    if (hover != null && hover >= 0 && hover < n) {
      ctx.strokeStyle = 'rgba(60,64,72,0.35)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(hover), T); ctx.lineTo(X(hover), T + ph); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // 오른쪽 라벨 (겹침 방지)
    rightLabels.sort((a, b) => a.y - b.y);
    const gap = fs + 1;
    for (let i = 1; i < rightLabels.length; i++) if (rightLabels[i].y - rightLabels[i - 1].y < gap) rightLabels[i].y = rightLabels[i - 1].y + gap;
    ctx.font = `${fs - 1}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const lb of rightLabels) {
      ctx.strokeStyle = lb.col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L + pw + 2, lb.y); ctx.lineTo(L + pw + 8, lb.y); ctx.stroke();
      ctx.fillStyle = lb.col; ctx.fillText(lb.text, L + pw + 11, lb.y);
    }
    // x축
    ctx.fillStyle = COL.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `${fs - 1}px ${FONT}`;
    for (const i of xLabelIdx(n)) ctx.fillText(FC.fmtKstAxis(D.times[i]), X(i), T + ph + 7);
    // 호버 정보
    if (hover != null && hover >= 0 && hover < n) {
      const c = C[hover], r = Math.abs(c.c);
      const s = `${FC.fmtKstAxis(c.t)}  O ${FC.fmtPrice(c.o, r)}  H ${FC.fmtPrice(c.h, r)}  L ${FC.fmtPrice(c.l, r)}  C ${FC.fmtPrice(c.c, r)}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = c.c >= c.o ? COL.up : COL.down; ctx.font = `${fs - 1}px ${FONT}`;
      ctx.fillText(s, L + pw, 3);
    }
    ctx.restore();
    return { lo, hi, plotL: L, plotW: pw, step };
  }

  /* ---------- 미니 패널 ---------- */
  function drawMini(ctx, x0, y0, W, H, P, times, hover, opt) {
    opt = opt || {};
    const fs = opt.fs || 10, n = times.length;
    ctx.save(); ctx.translate(x0, y0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.font = `${fs + 0.5}px ${FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = P.id === 'liq' ? '#6b6f78' : P.color; ctx.fillText(P.title, 2, 2);
    const L = 62, R = 8, T = 20, B = 16, pw = W - L - R, ph = H - T - B;
    const step = pw / n, X = (i) => L + (i + 0.5) * step;
    let lo, hi;
    const V = P.values;
    if (P.kind === 'liq') { const m = Math.max(1, ...V.map(v => (v ? Math.max(v.l, v.s) : 0))); lo = -m; hi = m; }
    else {
      const vs = V.filter(v => v != null); lo = Math.min(...vs); hi = Math.max(...vs);
      if (P.kind === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
      if (hi === lo) { hi += 1; lo -= 1; }
    }
    const padv = (hi - lo) * 0.08, ylo = lo - padv, yhi = hi + padv;
    const Y = (v) => T + (yhi - v) / (yhi - ylo) * ph;
    // 축 라벨 (상/하)
    const fmt = (v) => P.unit === '%' ? v.toFixed(4) + '%' : FC.fmtBig(v, P.kind === 'liq');
    ctx.font = `${fs - 1}px ${FONT}`; ctx.fillStyle = COL.axis; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(fmt(hi), L - 8, Y(hi)); ctx.fillText(fmt(lo), L - 8, Y(lo));
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (const v of [hi, lo]) { ctx.beginPath(); ctx.moveTo(L, Math.round(Y(v)) + 0.5); ctx.lineTo(L + pw, Math.round(Y(v)) + 0.5); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T - 2, pw, ph + 4); ctx.clip();
    const bw = Math.max(1, step * 0.6);
    if (P.kind === 'bar') {
      const y0v = Y(0);
      for (let i = 0; i < n; i++) { const v = V[i]; if (v == null) continue; ctx.fillStyle = v >= 0 ? COL.up : COL.down; const y = Y(v); ctx.fillRect(X(i) - bw / 2, Math.min(y, y0v), bw, Math.max(1, Math.abs(y - y0v))); }
    } else if (P.kind === 'liq') {
      const y0v = Y(0);
      ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(L, y0v); ctx.lineTo(L + pw, y0v); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const v = V[i]; if (!v) continue;
        if (v.s > 0) { ctx.fillStyle = COL.up; ctx.fillRect(X(i) - bw / 2, Y(v.s), bw, Math.max(1, y0v - Y(v.s))); }
        if (v.l > 0) { ctx.fillStyle = COL.down; ctx.fillRect(X(i) - bw / 2, y0v, bw, Math.max(1, Y(-v.l) - y0v)); }
      }
    } else {
      ctx.strokeStyle = P.color; ctx.lineWidth = 1.3; ctx.beginPath(); let pen = false;
      for (let i = 0; i < n; i++) { const v = V[i]; if (v == null) { pen = false; continue; } if (!pen) { ctx.moveTo(X(i), Y(v)); pen = true; } else ctx.lineTo(X(i), Y(v)); }
      ctx.stroke();
    }
    if (hover != null && hover >= 0 && hover < n) {
      ctx.strokeStyle = 'rgba(60,64,72,0.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(hover), T - 2); ctx.lineTo(X(hover), T + ph + 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    // 호버 값
    if (hover != null && hover >= 0 && hover < n && V[hover] != null) {
      const v = V[hover];
      const s = P.kind === 'liq' ? `롱 ${FC.fmtBig(-v.l)} / 숏 ${FC.fmtBig(v.s, true)}` : fmt(v);
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = COL.text; ctx.font = `${fs}px ${FONT}`; ctx.fillText(s, L + pw, 2);
    }
    if (opt.showX !== false) {
      ctx.fillStyle = COL.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `${fs - 1.5}px ${FONT}`;
      for (const i of xLabelIdx(n)) ctx.fillText(FC.fmtKstAxis(times[i]), X(i), T + ph + 4);
    }
    ctx.restore();
  }

  /* ---------- 헤더 (PNG 내보내기용) ---------- */
  function legendItems(D, yr) {
    const items = [];
    for (const k of [20, 50, 100, 200]) {
      const e = D.emas[k]; const last = e[e.length - 1]; let s = 'EMA ' + k;
      if (yr && last != null) { if (last > yr.hi) s += ' ↑' + FC.fmtPrice(last, last); else if (last < yr.lo) s += ' ↓' + FC.fmtPrice(last, last); }
      items.push({ text: s, col: COL.ema[k], dash: false });
    }
    return items;
  }
  const LEVEL_LEGEND = [{ text: '아시아 H/L', col: COL.asia }, { text: '런던 H/L', col: COL.london }, { text: '뉴욕 H/L', col: COL.ny }, { text: '전일 H/L', col: COL.pd }];

  function drawLegendRow(ctx, x, y, items, dotted, fs) {
    ctx.font = `${fs}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const it of items) {
      ctx.strokeStyle = it.col; ctx.lineWidth = 1.6; ctx.setLineDash(dotted ? [1.5, 2] : []);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = it.col; ctx.fillText(it.text, x + 16, y); x += 16 + ctx.measureText(it.text).width + 12;
    }
  }

  function drawCard(cv, D, meta) {
    const W = 1600, panels = D.panels;
    const H = 860, ctx = cv.getContext('2d');
    const sc = 2; cv.width = W * sc; cv.height = H * sc; ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // 헤더
    ctx.fillStyle = COL.text; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `500 26px ${FONT}`; ctx.fillText(`${D.sym} · ${D.tfLabel}`, 28, 44);
    ctx.font = `13px ${FONT}`; ctx.fillStyle = COL.axis; ctx.fillText(FC.fmtKstStamp(D.fetchedAt), 28, 66);
    ctx.font = `12px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#9aa0aa'; ctx.fillText(meta.label || 'STOPFIRST', W - 28, 34);
    ctx.fillText('data: Binance · Coinbase · Hyperliquid · Coinalyze', W - 28, 54);
    ctx.strokeStyle = '#e6e6ea'; ctx.beginPath(); ctx.moveTo(20, 84.5); ctx.lineTo(W - 20, 84.5); ctx.stroke();
    // 메인
    const mainW = Math.round(W * 0.64), top = 96, mainH = H - top - 18;
    const yr = drawMain(ctx, 20, top, mainW - 30, mainH, D, null, { fs: 13 });
    drawLegendRow(ctx, 330, 30, legendItems(D, yr), false, 12);
    drawLegendRow(ctx, 330, 56, LEVEL_LEGEND, true, 12);
    // 구분선
    ctx.strokeStyle = '#e6e6ea'; ctx.beginPath(); ctx.moveTo(mainW + 0.5, top); ctx.lineTo(mainW + 0.5, H - 18); ctx.stroke();
    // 미니 패널 (세로 가운데 정렬)
    const sideX = mainW + 16, sideW = W - sideX - 24;
    const ph = Math.min(126, Math.floor(mainH / Math.max(1, panels.length)));
    let y = top + Math.max(0, (mainH - ph * panels.length) / 2);
    for (const P of panels) {
      drawMini(ctx, sideX, y, sideW, ph - 6, P, D.times, null, { fs: 12 });
      ctx.strokeStyle = '#ececf0'; ctx.beginPath(); ctx.moveTo(sideX, y + ph - 2.5); ctx.lineTo(sideX + sideW, y + ph - 2.5); ctx.stroke();
      y += ph;
    }
    return cv;
  }

  self.FCRender = { drawMain, drawMini, drawCard, setupCanvas, legendItems, LEVEL_LEGEND, COL };
})();
