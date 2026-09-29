import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'www');
const appFiles = ['index.html', 'manifest.json', 'sw.js', 'apple-touch-icon.png'];

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const file of appFiles) {
  await cp(resolve(root, file), resolve(destination, file));
}

console.log('모바일 앱용 화면 파일을 준비했습니다.');
