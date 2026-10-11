// node tests/test_calc.js — 계산 함수 단위 테스트
const assert = require('assert');
const FC = require('../js/calc.js');
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('✓', name); };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const H = 3600e3;
const mk = (t, o, h, l, c, v = 1) => ({ t, o, h, l, c, v, qv: v * c });

t('EMA: SMA 시드 + 재귀식', () => {
  const v = [1, 2, 3, 4, 5, 6];
  const e = FC.ema(v, 3); // seed=(1+2+3)/3=2, a=0.5
  assert.deepStrictEqual(e.slice(0, 2), [null, null]);
  near(e[2], 2); near(e[3], 3); near(e[4], 4); near(e[5], 5);
  const c = FC.ema(Array(300).fill(7), 200); near(c[299], 7);
});

t('ATR(Wilder) 상수 범위', () => {
  const C = Array.from({ length: 30 }, (_, i) => mk(i * H, 10, 11, 9, 10));
  near(FC.atr(C, 14)[29], 2);
});

t('세션: 뉴욕 DST 반영 (EDT/EST)', () => {
  // 2026-10-09 KST 09:00 = 2026-10-09 00:00Z = 10-08 20:00 EDT → 아시아
  assert.strictEqual(FC.sessionOf(Date.UTC(2026, 9, 9, 0)).s.key, 'asia');
  // 06:00Z = 02:00 EDT → 런던
  assert.strictEqual(FC.sessionOf(Date.UTC(2026, 9, 9, 6)).s.key, 'london');
  // 11:00Z = 07:00 EDT → 뉴욕
  assert.strictEqual(FC.sessionOf(Date.UTC(2026, 9, 9, 11)).s.key, 'ny');
  assert.strictEqual(FC.sessionOf(Date.UTC(2026, 9, 9, 14)), null); // 10:00 EDT → 세션 밖
  // 겨울(EST, UTC-5): 01:00Z = 20:00 EST → 아시아, 00:00Z = 19:00 → 없음
  assert.strictEqual(FC.sessionOf(Date.UTC(2026, 11, 9, 1)).s.key, 'asia');
  assert.strictEqual(FC.sessionOf(Date.UTC(2026, 11, 9, 0)), null);
});

t('세션 H/L: 가장 최근 인스턴스', () => {
  const C = [];
  // 이틀치 1h 봉, 가격 = 시간 인덱스, 아시아(00–04Z, EDT) 고가/저가 확인
  for (let i = 0; i < 48; i++) { const t0 = Date.UTC(2026, 9, 8, 0) + i * H; C.push(mk(t0, 100 + i, 100.5 + i, 99.5 + i, 100 + i)); }
  const s = FC.sessionLevels(C);
  // 두 번째 날 00Z..03Z = 인덱스 24..27
  near(s.asia.h, 100.5 + 27); near(s.asia.l, 99.5 + 24);
  assert.strictEqual(s.asia.start, Date.UTC(2026, 9, 9, 0));
  near(s.london.h, 100.5 + 32); near(s.london.l, 99.5 + 30); // 06–08Z
  near(s.ny.h, 100.5 + 37); near(s.ny.l, 99.5 + 35);         // 11–13Z
});

t('전일 H/L (UTC 일봉)', () => {
  const C = [];
  for (let i = 0; i < 48; i++) { const t0 = Date.UTC(2026, 9, 9, 0) + i * H; C.push(mk(t0, 50, 50 + (i < 24 ? i : 0), 40 - (i < 24 ? i : 0), 50)); }
  const pd = FC.prevDayLevels(C, Date.UTC(2026, 9, 10, 12));
  near(pd.pdh, 73); near(pd.pdl, 17);
});

t('CVD: 누적(2·매수 − 전체)', () => {
  assert.deepStrictEqual(FC.cvdFromBuyTotal([6, 2, 5], [10, 10, 10]), [2, -4, -4]);
  const ap = FC.cvdApprox([mk(0, 1, 2, 0, 2, 10), mk(H, 2, 2, 1, 1, 5), mk(2 * H, 1, 1, 1, 1, 5)]);
  assert.deepStrictEqual(ap, [20, 15, 15]);
});

t('FVG: 강세 갭 탐지 + 메움', () => {
  const C = [];
  for (let i = 0; i < 20; i++) C.push(mk(i * H, 100, 101, 99, 100));
  C.push(mk(20 * H, 100, 101, 99, 100.8));   // a (high 101)
  C.push(mk(21 * H, 101, 106, 100.8, 105.5)); // 장대 양봉
  C.push(mk(22 * H, 105.5, 107, 103, 106.5)); // b (low 103) → 갭 [101,103]
  C.push(mk(23 * H, 106.5, 107, 104, 105));
  C.push(mk(24 * H, 105, 105, 100.5, 101));   // low 100.5 ≤ 101 → 메움
  const g = FC.findFVG(C).filter(z => z.dir === 'bull');
  assert.strictEqual(g.length, 1);
  near(g[0].bottom, 101); near(g[0].top, 103); assert.strictEqual(g[0].i0, 20); assert.strictEqual(g[0].end, 24);
});

t('FVG: 약세 갭', () => {
  const C = [];
  for (let i = 0; i < 20; i++) C.push(mk(i * H, 100, 101, 99, 100));
  C.push(mk(20 * H, 100, 101, 99, 99.2));
  C.push(mk(21 * H, 99, 99.2, 94, 94.5));
  C.push(mk(22 * H, 94.5, 97, 93, 93.5)); // high 97 < low[a] 99 → [97,99]
  const g = FC.findFVG(C).filter(z => z.dir === 'bear');
  assert.strictEqual(g.length, 1); near(g[0].top, 99); near(g[0].bottom, 97); assert.strictEqual(g[0].end, null);
});

t('OB: 강세 OB (음봉 → 변위 돌파) + 무효화', () => {
  const C = [];
  for (let i = 0; i < 20; i++) C.push(mk(i * H, 100, 100.5, 99.5, 100)); // ATR≈1
  C.push(mk(20 * H, 100, 100.3, 98.8, 99));   // 음봉 j=20, zone [98.8,100.3]
  C.push(mk(21 * H, 99, 101.5, 98.9, 101.2)); // 양봉, 종가 > 100.3 돌파
  C.push(mk(22 * H, 101.2, 102.5, 101, 102.3)); // max high 102.5 − 98.8 = 3.7 ≥ 1.5·ATR
  for (let i = 23; i < 28; i++) C.push(mk(i * H, 102, 102.5, 101.5, 102));
  let ob = FC.findOB(C).filter(z => z.dir === 'bull');
  assert.strictEqual(ob.length, 1); assert.strictEqual(ob[0].i0, 20); near(ob[0].bottom, 98.8); near(ob[0].top, 100.3); assert.strictEqual(ob[0].end, null);
  C.push(mk(28 * H, 102, 102, 98, 98.5)); // 종가 < 98.8 → 무효
  ob = FC.findOB(C).filter(z => z.dir === 'bull' && z.i0 === 20);
  assert.strictEqual(ob[0].end, 28); assert.strictEqual(ob[0].touched, 28);
});

t('OB: 변위 부족이면 미탐지', () => {
  const C = [];
  for (let i = 0; i < 20; i++) C.push(mk(i * H, 100, 102, 98, 100)); // ATR≈4
  C.push(mk(20 * H, 100, 100.3, 99.5, 99.6));
  C.push(mk(21 * H, 99.6, 100.6, 99.5, 100.5));
  C.push(mk(22 * H, 100.5, 100.8, 100.2, 100.6));
  assert.strictEqual(FC.findOB(C).filter(z => z.i0 === 20).length, 0);
});

t('resample 1h→4h, alignTo', () => {
  const C = Array.from({ length: 8 }, (_, i) => mk(i * H, i, i + 1, i - 1, i + 0.5, 1));
  const r = FC.resample(C, 4 * H);
  assert.strictEqual(r.length, 2); near(r[0].o, 0); near(r[0].c, 3.5); near(r[0].h, 4); near(r[0].l, -1); near(r[0].v, 4);
  assert.deepStrictEqual(FC.alignTo([0, H, 2 * H], [{ t: H, x: 5 }], 'x'), [null, 5, null]);
});

t('KST 포맷', () => {
  assert.strictEqual(FC.fmtKstAxis(Date.UTC(2026, 9, 10, 0, 0)), '10/10, 09:00');
  assert.strictEqual(FC.fmtKstStamp(Date.UTC(2026, 9, 10, 0, 25, 18)), '2026. 10. 10. 09:25:18 KST');
  assert.strictEqual(FC.fmtBig(-1.4e9), '-1.40B'); assert.strictEqual(FC.fmtBig(136800, true), '+136.80K');
});

t('실데이터: ETHUSDT 현물 15m, 2026-10-11 14:30 KST 기준 세션·전일 H/L', () => {
  const fx = require('./fixtures/ethusdt_spot_15m_20261011.json');
  const C = fx.rows.map(([t, o, h, l, c]) => mk(t, o, h, l, c));
  const now = Date.UTC(2026, 9, 11, 5, 30); // 14:30 KST
  const s = FC.sessionLevels(C, now);
  // 아시아 10/11 09:00–13:00 KST (완료), 런던 10/10 15–18, 뉴욕 10/10 20–23
  near(s.asia.h, 2513.59); near(s.asia.l, 2499.24); assert.strictEqual(s.asia.live, false);
  assert.strictEqual(FC.fmtKstAxis(s.asia.start), '10/11, 09:00'); assert.strictEqual(FC.fmtKstAxis(s.asia.end), '10/11, 12:45');
  assert.strictEqual(s.asia.schedEnd, Date.UTC(2026, 9, 11, 4)); // 13:00 KST
  near(s.london.h, 2499.14); near(s.london.l, 2492.34); assert.strictEqual(FC.fmtKstAxis(s.london.start), '10/10, 15:00');
  near(s.ny.h, 2500.02); near(s.ny.l, 2494.47); assert.strictEqual(FC.fmtKstAxis(s.ny.start), '10/10, 20:00');
  const pd = FC.prevDayLevels(C, now); // 10/10 09:00 ~ 10/11 09:00 KST
  near(pd.pdh, 2519.51); near(pd.pdl, 2486.03);
  // 진행 중: 10:30 KST에 자르면 아시아는 live=true, 지금까지의 봉만
  const cut = C.filter(c => c.t < Date.UTC(2026, 9, 11, 1, 30));
  const s2 = FC.sessionLevels(cut, Date.UTC(2026, 9, 11, 1, 30));
  assert.strictEqual(s2.asia.live, true); assert.strictEqual(FC.fmtKstAxis(s2.asia.end), '10/11, 10:15');
  assert.ok(s2.asia.h <= 2513.59 && s2.asia.l >= 2499.24);
  assert.strictEqual(s2.london.live, false);
});

t('라벨 겹침 방지: 간격·순서·경계', () => {
  const L = FC.layoutLabels([{ y: 50, id: 'a' }, { y: 52, id: 'b' }, { y: 200, id: 'c' }, { y: 298, id: 'd' }, { y: 299, id: 'e' }], 12, 0, 300);
  assert.deepStrictEqual(L.map(x => x.id), ['a', 'b', 'c', 'd', 'e']);
  for (let i = 1; i < L.length; i++) assert.ok(L[i].ly - L[i - 1].ly >= 12 - 1e-9);
  near(L[0].ly, 45); near(L[1].ly, 57); near(L[2].ly, 200); // 묶음 중심(51) 기준 대칭
  assert.ok(L[4].ly <= 300 && L[3].ly <= 288);
  const one = FC.layoutLabels([{ y: 10 }], 12, 0, 100); near(one[0].ly, 10);
});

console.log(`\n${pass} tests passed`);
