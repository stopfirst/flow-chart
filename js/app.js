/* app.js — UI 상태, 레이아웃, 이벤트 */
(function () {
  'use strict';
  const FC = self.FC, R = self.FCRender, DATA = self.FCData, PK = self.FCPicker;
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const LS = 'fc_settings_v1';

  const settings = Object.assign({ caKey: '', caProxy: '', label: 'STOPFIRST' }, JSON.parse(localStorage.getItem(LS) || '{}'));
  const state = Object.assign({ sym: 'BTC', tf: '1h', bars: 100, auto: 0 }, JSON.parse(localStorage.getItem('fc_state_v1') || '{}'));
  if (qs.get('s')) state.sym = qs.get('s');
  if (qs.get('tf') && DATA.TF[qs.get('tf')]) state.tf = qs.get('tf');
  if (qs.get('bars')) state.bars = +qs.get('bars');
  const MOCK = qs.get('mock') === '1';

  let D = null, hover = null, timer = null, loading = false, seq = 0;
  const saveState = () => localStorage.setItem('fc_state_v1', JSON.stringify(state));

  const normSym = (s) => PK.normSym(s) || 'BTC';
  state.sym = normSym(state.sym);

  /* ---------- 헤더 ---------- */
  function legendHTML(items, dot) {
    return items.map(it => `<span style="color:${it.col}"><i class="${dot ? 'dot' : ''}"></i>${it.text}</span>`).join('');
  }

  /* ---------- 레이아웃 + 그리기 ---------- */
  function layout() {
    if (!D) return;
    const narrow = window.innerWidth <= 760;
    const wrap = $('mainwrap'), side = $('side');
    const mainW = Math.max(260, wrap.clientWidth - (narrow ? 0 : 12));
    const mainH = narrow ? Math.round(Math.min(420, Math.max(300, mainW * 0.85))) : Math.round(Math.min(620, Math.max(420, mainW * 0.62)));
    const ctx = R.setupCanvas($('main'), mainW, mainH);
    const yr = R.drawMain(ctx, 0, 0, mainW, mainH, D, hover, { narrow });
    geom.main = yr;
    $('legend1').innerHTML = legendHTML(R.legendItems(D, yr), false);
    $('legend2').innerHTML = legendHTML(R.LEVEL_LEGEND, true);
    // 사이드
    const sideW = Math.max(240, side.clientWidth - (narrow ? 0 : 12));
    const n = D.panels.length;
    const ph = narrow ? 110 : Math.max(78, Math.min(124, Math.floor(mainH / Math.max(1, n))));
    let cvs = side.querySelectorAll('canvas');
    if (cvs.length !== n) { side.innerHTML = D.panels.map(() => '<canvas></canvas>').join(''); cvs = side.querySelectorAll('canvas'); bindMini(); }
    D.panels.forEach((P, i) => { const c = R.setupCanvas(cvs[i], sideW, ph - 4); R.drawMini(c, 0, 0, sideW, ph - 4, P, D.times, hover, {}); });
    geom.sideL = 62; geom.sideW = sideW - 70;
    if (!n) side.innerHTML = '<div class="muted small" style="padding:20px 0">표시할 플로우 데이터가 없습니다</div>';
  }
  const geom = {};

  function setHoverFromX(xCss, which) {
    if (!D) return;
    const n = D.candles.length;
    let i;
    if (which === 'main') i = Math.floor((xCss - geom.main.plotL) / geom.main.step);
    else i = Math.floor((xCss - geom.sideL) / (geom.sideW / n));
    const h = i >= 0 && i < n ? i : null;
    if (h !== hover) { hover = h; layout(); }
  }
  function bindMini() {
    $('side').querySelectorAll('canvas').forEach(cv => {
      cv.addEventListener('pointermove', e => setHoverFromX(e.offsetX, 'mini'));
      cv.addEventListener('pointerleave', () => { hover = null; layout(); });
    });
  }
  $('main').addEventListener('pointermove', e => setHoverFromX(e.offsetX, 'main'));
  $('main').addEventListener('pointerleave', () => { hover = null; layout(); });

  /* ---------- 로드 ---------- */
  let goodFoot = '';
  async function load() {
    const my = ++seq, want = state.sym; loading = true; $('loading').classList.add('on');
    try {
      const d = await DATA.loadAll({ sym: want, tf: state.tf, bars: state.bars, settings, mock: MOCK });
      if (my !== seq) return; // 더 새 요청이 있으면 이 응답은 버림
      D = d;
      $('title').textContent = `${D.sym} · ${D.tfLabel}`;
      $('stamp').textContent = FC.fmtKstStamp(D.fetchedAt) + (MOCK ? ' · 모의 데이터' : '');
      $('stamp').title = '';
      document.title = `${D.sym} ${D.tfLabel} · 플로우 차트`;
      const approx = D.panels.filter(p => p.approx).map(p => p.title.replace(' (근사)', ''));
      goodFoot = [
        `가격: ${D.src} · 세션(ICT 킬존, ET): 아시아 20–24 · 런던 02–05 · 뉴욕 07–10 · 전일 = UTC 일봉(KST 09시 기준)`,
        approx.length ? `근사: ${approx.join(', ')} (캔들 방향 × 거래대금)` : '',
        ...D.warnings.map(w => `<span class="warn">⚠ ${w}</span>`),
      ].filter(Boolean).join('<br>');
      $('foot').innerHTML = goodFoot; // 이전 오류/경고는 여기서 모두 교체
      hover = null; layout();
    } catch (e) {
      if (my !== seq) return;
      const same = D && D.sym === want;
      const msg = same ? '새로고침 실패 · 이전 데이터 표시 중' : `종목을 찾지 못했어요: ${want}`;
      if (!same) PK.dropRecent(want);
      if (D && !same) { state.sym = D.sym; saveState(); syncControls(); if (picker) picker.renderChips(); } // 마지막 정상 차트 유지
      $('stamp').textContent = D ? FC.fmtKstStamp(D.fetchedAt) + ' · ' + msg : msg;
      $('stamp').title = e.message;
      $('foot').innerHTML = (D ? goodFoot + '<br>' : '') + `<span class="warn">⚠ ${msg}</span>`;
    } finally { if (my === seq) { loading = false; $('loading').classList.remove('on'); } }
  }

  /* ---------- 컨트롤 ---------- */
  function syncControls() {
    $('symtxt').textContent = state.sym; $('bars').value = String(state.bars); $('auto').value = String(state.auto);
    document.querySelectorAll('#tfseg button').forEach(b => b.classList.toggle('on', b.dataset.tf === state.tf));
    $('wm').textContent = settings.label || 'STOPFIRST';
    const u = new URL(location.href); u.searchParams.set('s', state.sym); u.searchParams.set('tf', state.tf); history.replaceState(null, '', u);
  }
  function setAuto() {
    clearInterval(timer); timer = null;
    if (state.auto > 0) timer = setInterval(() => { if (!loading && !document.hidden) load(); }, state.auto * 1000);
  }
  const change = () => { saveState(); syncControls(); if (picker) picker.renderChips(); load(); };
  let picker = null;
  picker = PK.init({
    button: $('symbtn'), chips: $('favchips'), getSym: () => state.sym,
    onPick: (s) => { s = normSym(s); if (s === state.sym) return; state.sym = s; change(); },
  });
  document.querySelectorAll('#tfseg button').forEach(b => b.addEventListener('click', () => { state.tf = b.dataset.tf; change(); }));
  $('bars').addEventListener('change', () => { state.bars = +$('bars').value; change(); });
  $('auto').addEventListener('change', () => { state.auto = +$('auto').value; saveState(); setAuto(); });
  $('refresh').addEventListener('click', load);

  $('png').addEventListener('click', async () => {
    if (!D) return;
    const cv = document.createElement('canvas');
    R.drawCard(cv, D, { label: settings.label });
    const p = FC.kstParts(D.fetchedAt), pad = (x) => String(x).padStart(2, '0');
    const name = `flow_${D.sym.replace(':', '-')}_${D.tf}_${p.year}${pad(p.month)}${pad(p.day)}_${pad(p.hour)}${pad(p.minute)}.png`;
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { /* 취소 → 다운로드로 */ }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  });

  $('gear').addEventListener('click', () => {
    $('caKey').value = settings.caKey; $('caProxy').value = settings.caProxy; $('label').value = settings.label;
    $('settings').showModal();
  });
  $('saveSettings').addEventListener('click', () => {
    settings.caKey = $('caKey').value.trim(); settings.caProxy = $('caProxy').value.trim(); settings.label = $('label').value.trim() || 'STOPFIRST';
    localStorage.setItem(LS, JSON.stringify(settings)); localStorage.removeItem('fc_ca_markets_v1');
    syncControls(); load();
  });

  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.auto > 0 && D && Date.now() - D.fetchedAt > state.auto * 1000) load(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  self.__fc = { get D() { return D; }, load, settings, get picker() { return picker; } };

  PK.pushRecent(state.sym); picker.renderChips();
  syncControls(); setAuto(); load();
})();
