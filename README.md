# 플로우 차트 (Flow Chart) · STOPFIRST

가격·ICT 레벨과 **프리미엄 · 거래소별 CVD · 합산 청산**을 한 장의 카드로 보는 웹앱입니다.
서버 없이 브라우저에서 각 거래소 공개 API를 직접 호출하며, 저장소에는 어떤 비밀값도 없습니다.

**바로 열기:** https://stopfirst.github.io/flow-chart/

- 주소 파라미터: `?s=BTC&tf=1h` · `?s=xyz:SP500&tf=4h` · `&bars=150` · `&mock=1`(모의 데이터 데모)
- **심볼 선택**: 툴바의 심볼 버튼(또는 PC에서 `/` 키) → 검색(티커·한글/영문 이름: `비트`, `금`, `나스닥`, `테슬라`…) + 탭(★즐겨찾기 / 최근 / 코인 / 주식·지수 / 원자재). 목록은 Hyperliquid 메인 무기한 + 모든 HIP-3 dex(xyz 등)에서 실시간으로 불러오며(10분 캐시) 가격 · 24h 변동률 · 24h 거래대금순. `BN`(Binance USDT 페어) · `CB`(Coinbase USD 현물) 배지는 해당 패널이 그려질 수 있다는 뜻입니다(24시간 캐시). 목록에 없는 심볼도 입력 후 Enter로 열 수 있습니다. 휴대폰에서는 아래에서 올라오는 시트, PC에서는 드롭다운(↑↓ · Enter · Esc).
- **즐겨찾기 칩**: 심볼 버튼 옆 가로 스크롤 칩으로 한 번에 전환. 목록의 ☆로 추가/삭제(기본: BTC · ETH · SOL · HYPE · xyz:SP500). 최근 8개 자동 기록.
- 없는 심볼을 열면 마지막 정상 차트를 유지하고 "종목을 찾지 못했어요: XXX"를 표시합니다.
- 휴대폰: 사이드 패널이 메인 차트 아래로 쌓입니다. 홈 화면에 추가하면 앱처럼 실행됩니다(PWA).
- **PNG 저장**: 화면 크기와 상관없이 항상 가로형(1600×860, 2배 해상도) 카드로 저장합니다. 휴대폰에서는 공유 시트가 열립니다.

## 화면 구성

| 영역 | 내용 | 데이터 |
|---|---|---|
| 헤더 | 심볼 · 타임프레임, 조회 시각(KST), 범례, 워터마크(설정에서 변경) | – |
| **가격·ICT** | 캔들(양봉 초록 / 음봉 분홍), EMA 20/50/100/200, 전일 고저(PDH/PDL, 회색 파선), 세션 고저(점선), OB(실선 박스), FVG(점선 박스), 오른쪽 라벨 | Binance 선물 → (실패 시) Binance 현물 → Hyperliquid |
| Coinbase 프리미엄 | `(Coinbase BTC-USD 종가 − Binance BTCUSDT 종가) / Binance × 100` (%) 막대. 양수 = 미국 현물 매수세 우위 | Coinbase Exchange 캔들, Binance 현물 |
| Binance 선물 CVD | 누적 `(테이커 매수 − 테이커 매도)` 거래대금(USDT) | fapi klines의 taker buy quote volume |
| Binance 현물 CVD | 위와 동일, 현물 | api/v3 klines |
| Coinbase 현물 CVD | 누적 `(매수 − 매도)` × 종가(USD) | Coinalyze `ohlcv-history`의 `bv`(매수량) |
| Hyperliquid 선물 CVD | 위와 동일 | Coinalyze `ohlcv-history` |
| 거래소 합산 청산 · 롱− / 숏+ | 롱 청산은 아래(분홍), 숏 청산은 위(초록) 막대, USD | Coinalyze `liquidation-history` (거래소별 무기한 최대 12개 합산) |

- EMA가 화면 가격 범위 밖에 있으면 범례에 `↑값` / `↓값`으로 표시합니다.
- CVD는 **화면 첫 봉부터 누적**합니다(절대값보다 기울기·다이버전스를 보세요).
- 데이터가 없는 패널은 숨깁니다. 예: `xyz:SP500`(Hyperliquid HIP-3)은 Binance·Coinbase가 없으므로 HL CVD(+Coinalyze에 있으면 청산)만 표시.
- 메인 차트/패널 위에 마우스를 올리거나 터치하면 같은 시점 값이 표시됩니다.

## 세션 정의 (ICT 킬존, 뉴욕 현지시간 · 서머타임 자동 반영)

| 세션 | 뉴욕(ET) | KST (EDT, 3~11월) | KST (EST, 11~3월) |
|---|---|---|---|
| 아시아 | 20:00–24:00 | 09:00–13:00 | 10:00–14:00 |
| 런던 | 02:00–05:00 | 15:00–18:00 | 16:00–19:00 |
| 뉴욕 | 07:00–10:00 | 20:00–23:00 | 21:00–24:00 |

- 각 세션의 **가장 최근 인스턴스(진행 중 포함)** 고가/저가를 세션 시작 지점부터 오른쪽 끝까지 점선으로 그립니다.
- 4시간봉에서도 정확하도록 세션·전일 레벨은 항상 **15분봉**으로 계산합니다.
- **전일 고저(PDH/PDL)**: 직전 **UTC 일봉**(KST 09:00 ~ 다음날 09:00)의 고가/저가.

## OB / FVG 규칙 (현재 타임프레임 기준, ATR = Wilder ATR 14)

**FVG (공정가치갭, 3봉)**
- 강세: `저가[i+1] > 고가[i−1]` → 구간 `[고가[i−1], 저가[i+1]]`
- 약세: `고가[i+1] < 저가[i−1]` → 구간 `[고가[i+1], 저가[i−1]]`
- 갭 크기 ≥ 0.1 × ATR 일 때만 인정
- 메움: 이후 가격이 갭 반대편 끝에 닿으면(강세: 저가 ≤ 하단, 약세: 고가 ≥ 상단) 그 봉에서 박스 종료
- 표시: 미충족 최근 4개(오른쪽 끝까지) + 화면 안에서 메워진 최근 3개

**OB (오더블록)**
- 강세 OB: 음봉 j 다음 봉이 양봉이고, 이후 3봉 안에 **종가가 고가[j]를 돌파**하며, `최고가(j+1..j+3) − 저가[j] ≥ 1.5 × ATR` → 구간 `[저가[j], 고가[j]]`
- 약세 OB: 양봉 j 다음 봉이 음봉이고, 3봉 안에 종가가 저가[j]를 하향 돌파하며, `고가[j] − 최저가(j+1..j+3) ≥ 1.5 × ATR`
- 무효화: 이후 **종가**가 구간을 반대로 이탈하면 삭제 (터치만으로는 유지)
- 표시: 유효한 OB 중 방향별 최근 2개, 오른쪽 끝까지 연장 + `OB` 라벨

규칙은 단순화한 버전입니다. 수치는 `js/calc.js`의 `findFVG`(minAtr) · `findOB`(disp)에서 바꿀 수 있습니다.

## 설정 (⚙)

1. **Coinalyze API 키** (무료): https://coinalyze.net 가입 → https://coinalyze.net/account/api-key/ 에서 발급 → 설정에 붙여넣기.
   키는 **이 기기 브라우저(localStorage)에만** 저장되고 저장소/서버로 가지 않습니다.
   - 키가 없으면: Coinbase 현물·Hyperliquid CVD는 `캔들 방향 × 거래대금` **근사치**(제목에 "(근사)")로, 합산 청산은 숨김.
   - 한도: 키당 분당 40회. 한 번 새로고침에 약 3~15회 사용(거래소 목록은 24시간 캐시) → 자동 새로고침은 **2분 이상** 권장.
2. **Coinalyze 프록시 URL** (선택): 브라우저에서 Coinalyze 직접 호출이 CORS로 막힐 때만. `proxy/coinalyze-proxy.js`를 서버(예: Lightsail)에 띄우고 `https://내서버/v1` 입력.
3. **워터마크 라벨**: 카드 오른쪽 위 문구(기본 `STOPFIRST`).

## 참고 · 한계

- Binance는 미국 등 일부 지역 IP를 차단(HTTP 451)합니다. 한국에서는 정상 동작합니다. 선물이 막히면 가격은 현물로 대체되고 선물 CVD 패널은 숨겨집니다.
- 프리미엄은 USD(Coinbase) 대 USDT(Binance) 비교라 USDT 디페그만큼의 상시 오프셋이 있습니다.
- Coinalyze 장중 데이터는 약 1500~2000개 포인트만 보관합니다.
- 모든 시각은 KST(UTC+9)로 표시합니다. 날짜 형식은 `월/일, 시:분`.

## 개발

```
node tests/test_picker.js   # 심볼 검색(한글 별칭) · 카테고리 · HL 파싱 · 포맷
node tests/test_calc.js     # EMA · ATR · 세션(DST) · 전일 레벨 · CVD · FVG · OB · 리샘플 · 포맷 테스트
python3 -m http.server      # 로컬 실행 → http://localhost:8000/?mock=1
```

파일: `index.html` · `css/style.css` · `js/calc.js`(순수 계산) · `js/data.js`(API 수집) · `js/render.js`(캔버스 렌더) · `js/picker.js`(심볼 선택기) · `js/app.js`(UI) · `sw.js` · `manifest.webmanifest`

데이터 출처: Binance · Coinbase Exchange · Hyperliquid · [Coinalyze](https://coinalyze.net)
