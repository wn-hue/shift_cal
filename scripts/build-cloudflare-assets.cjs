'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.cloudflare-assets');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const files=[...new Set([...execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),...['origin-migration-config.json','origin-data-core.js','origin-transfer.css','origin-transfer.html','origin-transfer.js','origin-bridge.js','origin-auth.html','origin-auth.js','welcome.html','origin-welcome.js','onboarding-state.js']])];let count=0;
for(const file of files){
 const top=!file.includes('/')&&/\.(?:html|css|js|json|webmanifest|png|webp|jpg|jpeg|gif|svg|ico|shortcut|ics)$/i.test(file)&&!['package.json','package-lock.json','vercel.json'].includes(file);
 const asset=/^(?:assets|data|shortcuts)\//.test(file)&&!file.includes('..');
 if(!top&&!asset&&file!=='sitemap.xml')continue;
 const source=path.join(root,file);if(!fs.statSync(source).isFile())continue;
 const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);count++;
}
fs.writeFileSync(path.join(out,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n/\n  Cache-Control: no-store\n/*.html\n  Cache-Control: no-store\n');
console.log('Prepared '+count+' public assets; private files and server sources excluded.');
