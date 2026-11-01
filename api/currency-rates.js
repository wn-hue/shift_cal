'use strict';
// Only public rates are fetched. Salary and personal information never leave the browser.
const URL='https://api.frankfurter.dev/v2/rates?base=KRW&quotes=USD,CNY,JPY';
let cache=null,pending=null;
function normalize(rows){
 if(!Array.isArray(rows))throw Error('Invalid rates');
 const rates={};for(const quote of ['USD','CNY','JPY']){const row=rows.find(r=>r.base==='KRW'&&r.quote===quote);if(!row||typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date+'T00:00:00Z')))throw Error('Invalid rate');rates[quote]={rate:row.rate,date:row.date};}return {base:'KRW',source:'Frankfurter',rates};
}
async function latest(){if(cache&&Date.now()-cache.at<600000)return cache.data;if(!pending)pending=(async()=>{const r=await fetch(URL,{signal:AbortSignal.timeout(8000),redirect:'error',headers:{Accept:'application/json'}});if(!r.ok)throw Error('Rates unavailable');const data=normalize(await r.json());cache={at:Date.now(),data};return data;})().finally(()=>{pending=null;});return pending;}
module.exports=async(req,res)=>{if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}try{return res.status(200).json(await latest());}catch{return res.status(503).json({error:'RATES_UNAVAILABLE'});}};
module.exports.normalize=normalize;
