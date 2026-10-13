function openAppPreferences(){document.getElementById('app-preferences-dialog').showModal();}
(()=>{for(const name of ['adjacent','holidays','memos','shape','theme','mode']){
const input=document.getElementById('pref-'+name),key='shift_display_'+name;
if(name==='theme')input.value='current';if(name==='mode')input.value='light';
try{const saved=localStorage.getItem(key);if(saved!==null){if(name==='theme')input.value=['current','gpt','toss'].includes(saved)?saved:'current';else if(name==='mode')input.value=['light','dark','auto'].includes(saved)?saved:'light';else if(name==='shape')input.value=saved==='circle'?'circle':'square';else input.checked=saved!=='false';}}catch{}
const media=name==='mode'?window.matchMedia('(prefers-color-scheme: dark)'):null;
const apply=()=>{const value=(name==='shape'||name==='theme'||name==='mode')?input.value:String(input.checked);const resolved=name==='mode'?(value==='auto'?(media.matches?'dark':'light'):value):value;document.body.setAttribute('data-pref-'+name,resolved);if(name==='mode'){document.documentElement.style.colorScheme=resolved;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='dark'?'#12161d':'#ffffff');}return value;};
media?.addEventListener('change',()=>{if(input.value==='auto')apply();});
apply();input.addEventListener('change',()=>{const value=apply();try{localStorage.setItem(key,value);}catch{}});
}
document.getElementById('app-preferences-dialog').addEventListener('close',()=>document.querySelector('.menu-preferences').focus());})();
