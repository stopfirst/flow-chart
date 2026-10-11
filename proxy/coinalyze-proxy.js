// (선택) Coinalyze CORS 프록시 — 브라우저에서 api.coinalyze.net 직접 호출이 막힐 때만 사용
// 실행: node proxy/coinalyze-proxy.js  (기본 포트 8787, 의존성 없음, Node 18+)
// 앱 설정의 "Coinalyze 프록시 URL"에  https://<내 서버>/v1  입력 (HTTPS 리버스프록시 뒤에 두는 것을 권장)
// API 키는 앱이 쿼리(api_key)로 그대로 전달합니다. 서버에 키를 두고 싶으면 CA_KEY 환경변수를 설정하세요.
const http = require('http');
const PORT = +process.env.PORT || 8787;
const ORIGIN = process.env.ALLOW_ORIGIN || 'https://stopfirst.github.io';
const KEY = process.env.CA_KEY || '';
http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'api_key' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (req.method !== 'GET' || !u.pathname.startsWith('/v1/')) { res.writeHead(404, cors); return res.end(); }
  if (KEY) u.searchParams.set('api_key', KEY);
  try {
    const r = await fetch('https://api.coinalyze.net' + u.pathname + u.search);
    const body = Buffer.from(await r.arrayBuffer());
    const h = { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/json' };
    if (r.headers.get('retry-after')) { h['Retry-After'] = r.headers.get('retry-after'); h['Access-Control-Expose-Headers'] = 'Retry-After'; }
    res.writeHead(r.status, h); res.end(body);
  } catch (e) { res.writeHead(502, cors); res.end(JSON.stringify({ error: String(e) })); }
}).listen(PORT, () => console.log('coinalyze proxy on :' + PORT));
