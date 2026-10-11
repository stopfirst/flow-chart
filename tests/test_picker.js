// node tests/test_picker.js — 심볼 선택기 순수 함수 테스트
const assert = require('assert');
const P = require('../js/picker.js');
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('✓', name); };
const U = [
  { name: 'BTC', vol: 9e8 }, { name: 'BCH', vol: 1e7 }, { name: 'ETH', vol: 5e8 }, { name: 'PAXG', vol: 2e6 },
  { name: 'xyz:GOLD', vol: 4e7, dex: 'xyz' }, { name: 'xyz:XYZ100', vol: 4e7, dex: 'xyz' }, { name: 'xyz:SP500', vol: 3e7, dex: 'xyz' },
  { name: 'xyz:TSLA', vol: 2e7, dex: 'xyz' }, { name: 'flx:GOLD', vol: 1e6, dex: 'flx' }, { name: 'kPEPE', vol: 3e6 },
];
const names = (q) => P.search(U, q).map(x => x.name);

t('normSym', () => {
  assert.strictEqual(P.normSym(' btcusdt '), 'BTC');
  assert.strictEqual(P.normSym('eth-usd'), 'ETH');
  assert.strictEqual(P.normSym('XYZ:sp500'), 'xyz:SP500');
  assert.strictEqual(P.normSym('kPEPE'), 'kPEPE');
  assert.strictEqual(P.normSym(''), '');
});
t('티커 검색: 정확 → 접두 → 거래대금순', () => {
  assert.deepStrictEqual(names('btc')[0], 'BTC');
  assert.deepStrictEqual(names('b').slice(0, 2), ['BTC', 'BCH']);
  assert.deepStrictEqual(names('sp5'), ['xyz:SP500']);
  assert.ok(names('xyz:').every(n => n.startsWith('xyz:')));
});
t('한글/영문 별칭 검색', () => {
  assert.strictEqual(names('비트')[0], 'BTC');
  assert.deepStrictEqual(names('금').slice(0, 3), ['xyz:GOLD', 'PAXG', 'flx:GOLD']);
  assert.strictEqual(names('나스닥')[0], 'xyz:XYZ100');
  assert.strictEqual(names('테슬라')[0], 'xyz:TSLA');
  assert.strictEqual(names('s&p')[0], 'xyz:SP500');
  assert.strictEqual(names('페페')[0], 'kPEPE');
  assert.deepStrictEqual(names('zzzz'), []);
});
t('카테고리', () => {
  assert.strictEqual(P.category('BTC'), 'coin');
  assert.strictEqual(P.category('PAXG'), 'commod');
  assert.strictEqual(P.category('xyz:GOLD'), 'commod');
  assert.strictEqual(P.category('xyz:CL'), 'commod');
  assert.strictEqual(P.category('xyz:SP500'), 'stock');
  assert.strictEqual(P.category('xyz:NVDA'), 'stock');
});
t('HL metaAndAssetCtxs 파싱 (상장폐지 제외, dex 접두)', () => {
  const res = [{ universe: [{ name: 'BTC' }, { name: 'OLD', isDelisted: true }, { name: 'SP500' }] },
    [{ midPx: '110', prevDayPx: '100', dayNtlVlm: '5e6' }, { midPx: '1' }, { markPx: '7000', prevDayPx: '7000', dayNtlVlm: '1' }]];
  const a = P.parseMetaCtx(res, '');
  assert.deepStrictEqual(a.map(x => x.name), ['BTC', 'SP500']);
  assert.ok(Math.abs(a[0].chg - 10) < 1e-9); assert.strictEqual(a[0].vol, 5e6);
  assert.deepStrictEqual(P.parseMetaCtx(res, 'xyz').map(x => x.name), ['xyz:BTC', 'xyz:SP500']);
});
t('포맷', () => {
  assert.strictEqual(P.fmtVol(842048278), '$842M');
  assert.strictEqual(P.fmtVol(1.25e9), '$1.3B');
  assert.strictEqual(P.fmtVol(43000), '$43K');
  assert.strictEqual(P.fmtPx(82858), '82,858');
  assert.strictEqual(P.fmtPx(2.5), '2.500');
  assert.strictEqual(P.fmtChg(1.234), '+1.23%');
  assert.strictEqual(P.fmtChg(null), '–');
  assert.strictEqual(P.krName('xyz:XYZ100'), '나스닥100');
});
console.log(`\n${pass} tests passed`);
