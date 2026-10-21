/* app.js — UI 상태, 레이아웃, 이벤트 */
(function () {
  'use strict';
  const FC = self.FC, R = self.FCRender, DATA = self.FCData, PK = self.FCPicker;
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const LS = 'fc_settings_v1';

  const settings = Object.assign({ caKey: '', caProxy: '', label: 'STOPFIRST', obMode: 'baekdo' }, JSON.parse(localStorage.getItem(LS) || '{}'));
  const state = Object.assign({ sym: 'BTC', tf: '1h', bars: 100, auto: 0 }, JSON.parse(localStorage.getItem('fc_state_v1') || '{}'));
  FC.setOBMode(settings.obMode); // OB 방식: 백도식(기본) / 넓게(이전 방식)
  if (qs.get('s')) state.sym = qs.get('s');
  if (qs.get('tf') && DATA.TF[qs.get('tf')]) state.tf = qs.get('tf');
  if (qs.get('bars')) state.bars = +qs.get('bars');
  const MOCK = qs.get('mock') === '1';

  // 차트 레이어 표시 토글 (기본 모두 켬)
  const LAYERS = [{ k: 'sess', t: '세션' }, { k: 'pd', t: 'PDH·PDL' }, { k: 'tdo', t: 'TDO' }, { k: 'ob', t: 'OB' }, { k: 'fvg', t: 'FVG' }, { k: 'bbfvg', t: 'BB+FVG' }];
  const layers = Object.assign({ sess: true, pd: true, tdo: true, ob: true, fvg: true, bbfvg: true }, JSON.parse(localStorage.getItem('fc_layers_v1') || '{}'));
  function renderLayers() {
    $('layers').innerHTML = LAYERS.map(l => `<button type="button" data-k="${l.k}" aria-pressed="${layers[l.k] ? 'true' : 'false'}" class="${layers[l.k] ? 'on' : ''}">${l.t}</button>`).join('');
  }
  $('layers').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    layers[b.dataset.k] = !layers[b.dataset.k];
    localStorage.setItem('fc_layers_v1', JSON.stringify(layers)); renderLayers(); layout();
  });
  renderLayers();

  let D = null, hover = null, timer = null, loading = false, seq = 0;
  const saveState = () => localStorage.setItem('fc_state_v1', JSON.stringify(state));

  const normSym = (s) => PK.normSym(s) || 'BTC';
  state.sym = normSym(state.sym);

  /* ---------- 헤더 ---------- */
  function legendHTML(items, dot) {
    return items.map(it => `<span style="color:${it.col}"><i class="${it.box ? 'box' : dot && !it.solid ? 'dot' : ''}"></i>${it.text}</span>`).join('');
  }

  /* ---------- 레이아웃 + 그리기 ---------- */
  function layout() {
    if (!D) return;
    const narrow = window.innerWidth <= 760;
    const wrap = $('mainwrap'), side = $('side');
    const mainW = Math.max(260, wrap.clientWidth - (narrow ? 0 : 12));
    const mainH = narrow ? Math.round(Math.min(420, Math.max(300, mainW * 0.85))) : Math.round(Math.min(620, Math.max(420, mainW * 0.62)));
    const ctx = R.setupCanvas($('main'), mainW, mainH);
    const yr = R.drawMain(ctx, 0, 0, mainW, mainH, D, hover, { narrow, show: layers });
    geom.main = yr;
    $('legend1').innerHTML = legendHTML(R.legendItems(D, yr), false);
    $('legend2').innerHTML = legendHTML(R.levelLegend(layers), true);
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
    if (h !== hover) { hover = h; redraw(); }
  }
  let raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layout(); }); };
  const clearHover = () => { if (hover != null) { hover = null; redraw(); } };
  function bindMini() {
    $('side').querySelectorAll('canvas').forEach(cv => {
      cv.addEventListener('pointermove', e => setHoverFromX(e.offsetX, 'mini'));
      cv.addEventListener('pointerleave', clearHover);
      cv.addEventListener('pointercancel', clearHover); // 터치 스크롤 시작 → 호버 해제
    });
  }
  $('main').addEventListener('pointermove', e => setHoverFromX(e.offsetX, 'main'));
  $('main').addEventListener('pointerleave', clearHover);
  $('main').addEventListener('pointercancel', clearHover);

  // 현재 서머타임 여부에 따른 KST 세션 시간 표시
  function sessKst() {
    const off = (FC.tzParts(Date.now(), 'America/New_York').hour - FC.kstParts(Date.now()).hour + 48) % 24; // ET − KST (시)
    const k = (h) => String((h - off + 48) % 24).padStart(2, '0');
    return `KST ${k(20)}–${k(24)} · ${k(2)}–${k(5)} · ${k(7)}–${k(10)}`;
  }
  // TDO(뉴욕 00:00)의 KST 시각 (EDT 13:00 / EST 14:00)
  const tdoKst = (t) => { const p = FC.kstParts(t ?? FC.nyMidnight(Date.now())); return String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0'); };

  /* ---------- 로드 ---------- */
  let goodFoot = '';
  function renderFoot() {
    const approx = D.panels.filter(p => p.approx).map(p => p.title.replace(' (근사)', ''));
    goodFoot = [
      `가격: ${D.src} · 세션(ICT 킬존, 뉴욕시간): 아시아 20–24 · 런던 02–05 · 뉴욕 07–10 (${sessKst()}) · 각 세션의 가장 최근 회차(진행 중이면 '진행중') · 전일 = UTC 일봉(KST 09시 기준), MID = (PDH+PDL)/2`,
      `TDO(True Day Open) = 뉴욕 00:00 봉 시가 (KST ${tdoKst(D.tdo && D.tdo.t)}${tdoKst(D.tdo && D.tdo.t) === '13:00' ? ' · EST 기간 14:00' : ' · EDT 기간 13:00'})${D.tdo && D.tdo.approx ? ' · TDO≈: 해당 시각을 품은 봉의 시가' : ''}`,
      FC.getOBMode() === 'wide' ? `OB(넓게·이전 방식) = 변위 직전 반대색 봉 꼬리 전체 · 현재가 위·아래 가까운 2개씩` : `OB(백도식) = 스윙(좌우 2봉) 종가 돌파(BOS) 직전 마지막 반대색 봉 몸통 · 종가가 반대편을 넘으면 삭제 · 방향별 최근 1개(화면 안)`,
      `BB+FVG(브레이커+FVG 겹침) = 실패한 OB(종가로 반대편 돌파 → 방향 반전)의 몸통 ∩ 그 돌파 변위의 같은 방향 FVG · 종가가 구간 반대편을 넘으면 삭제 · 현재가에 가까운 최대 2개`,
      approx.length ? `근사: ${approx.join(', ')} (캔들 방향 × 거래대금)` : '',
      ...(D.notes || []).map(n => `<span class="note">${n}</span>`),
      ...D.warnings.map(w => `<span class="warn">⚠ ${w}</span>`),
    ].filter(Boolean).join('<br>');
    $('foot').innerHTML = goodFoot; // 이전 오류/경고는 여기서 모두 교체
  }
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
      renderFoot();
      hover = null; layout();
      // Coinalyze 캐시를 먼저 보여줬으면 백그라운드에서 증분 갱신 후 패널만 교체
      if (D.caRefresh) {
        const d0 = D, job = D.caRefresh(); d0.caRefresh = null;
        job.then(r => { if (my !== seq || D !== d0) return; DATA.applyCa(D, r); renderFoot(); layout(); }).catch(() => {});
      }
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
    R.drawCard(cv, D, { label: settings.label, show: layers });
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
    $('caKey').value = settings.caKey; $('caProxy').value = settings.caProxy; $('label').value = settings.label; $('obMode').value = settings.obMode === 'wide' ? 'wide' : 'baekdo';
    $('settings').showModal();
  });
  $('saveSettings').addEventListener('click', () => {
    settings.caKey = $('caKey').value.trim(); settings.caProxy = $('caProxy').value.trim(); settings.label = $('label').value.trim() || 'STOPFIRST';
    settings.obMode = FC.setOBMode($('obMode').value);
    localStorage.setItem(LS, JSON.stringify(settings)); localStorage.removeItem('fc_ca_markets_v1');
    syncControls(); load();
  });

  let rt, lastW = window.innerWidth; window.addEventListener('resize', () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(layout, 120); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.auto > 0 && D && Date.now() - D.fetchedAt > state.auto * 1000) load(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  self.__fc = { get D() { return D; }, load, settings, get picker() { return picker; } };

  PK.pushRecent(state.sym); picker.renderChips();
  syncControls(); setAuto(); load();
})();
