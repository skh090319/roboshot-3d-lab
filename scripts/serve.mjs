import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const host = '127.0.0.1';
const port = 4173;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

let canonicalRoot;
try {
  canonicalRoot = await realpath(root);
  await stat(path.join(canonicalRoot, 'index.html'));
} catch {
  console.error('dist/index.html이 없습니다. 먼저 npm run build를 실행하세요.');
  process.exit(1);
}

function insideRoot(filename) {
  const relative = path.relative(canonicalRoot, filename);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, `http://${host}:${port}`).pathname);
    if (pathname === '/__roboshot_health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ app: 'RoboShot 3D Lab', ready: true }));
      return;
    }
    if (pathname.includes('\0')) throw new Error('Invalid path');
    let filename = path.resolve(canonicalRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!insideRoot(filename)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    filename = await realpath(filename);
    if (!insideRoot(filename)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filename).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': path.extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error instanceof URIError ? 'Bad request' : 'Not found');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `포트 ${port}를 사용 중입니다. 이미 실행 중이면 http://${host}:${port}를 여세요.`
    : error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`RoboShot 3D Lab: http://${host}:${port}`);
  console.log('외부 인터넷 없이 실행됩니다. 이 터미널에서 실행한 경우 Ctrl+C로 종료합니다.');
});
