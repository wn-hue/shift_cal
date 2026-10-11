function openAppPreferences(){document.getElementById('app-preferences-dialog').showModal();}
(()=>{for(const name of ['adjacent','holidays','memos','shape','theme']){
const input=document.getElementById('pref-'+name),key='shift_display_'+name;
if(name==='theme')input.value='current';
try{const saved=localStorage.getItem(key);if(saved!==null){if(name==='theme')input.value=['current','gpt','toss'].includes(saved)?saved:'current';else if(name==='shape')input.value=saved==='circle'?'circle':'square';else input.checked=saved!=='false';}}catch{}
const apply=()=>{const value=(name==='shape'||name==='theme')?input.value:String(input.checked);document.body.setAttribute('data-pref-'+name,value);return value;};
apply();input.addEventListener('change',()=>{const value=apply();try{localStorage.setItem(key,value);}catch{}});
}
document.getElementById('app-preferences-dialog').addEventListener('close',()=>document.querySelector('.menu-preferences').focus());})();
