// 로컬 개발 전용. 배포 진입점으로 자동 감지되는 server.js 이름을 사용하지 않는다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/dust.js';

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/dust') {
      const regions = url.searchParams.getAll('sido');
      req.query = { sido: regions.length > 1 ? regions : regions[0] };
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
        return res;
      };
      await handler(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const file = staticFiles.get(url.pathname);
    if (!file) { res.writeHead(404).end('Not found'); return; }
    const content = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': file[1] });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(500).end('Internal server error');
  }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  console.log(`대기질 앱: http://localhost:${server.address().port}`);
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? '포트가 사용 중입니다. PORT 환경변수를 변경해주세요.' : error.message);
  process.exitCode = 1;
});
