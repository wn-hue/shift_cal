import { cp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'www');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const item of await readdir(root, { withFileTypes: true })) {
  if (item.isFile() && /\.(html|js|css|png|svg|ico)$/.test(item.name)) {
    await cp(resolve(root, item.name), resolve(destination, item.name));
  }
}
let html = await readFile(resolve(destination, 'index.html'), 'utf8');
html = html.replace('</head>', '<script src="./native-bridge.js"></script>\n</head>');
await writeFile(resolve(destination, 'index.html'), html);
console.log('최신 달력·급여·연차 화면과 안내 파일을 모바일 앱에 복사했습니다.');
