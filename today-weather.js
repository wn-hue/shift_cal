(function(){
'use strict';
const $=id=>document.getElementById(id),select=$('weather-city'),status=$('weather-status');
const cities=[['안산',37.32,126.83],['서울',37.57,126.98],['인천',37.46,126.71],['수원',37.26,127.03],['성남',37.42,127.13],['평택',36.99,127.11],['대전',36.35,127.38],['청주',36.64,127.49],['대구',35.87,128.60],['부산',35.18,129.08],['울산',35.54,129.31],['광주',35.16,126.85],['전주',35.82,127.15],['춘천',37.88,127.73],['강릉',37.75,128.90],['제주',33.50,126.53]];
for(const [name]of cities){const o=document.createElement('option');o.value=name;o.textContent=name;select.append(o);}
try{const saved=localStorage.getItem('shift_weather_city');if(cities.some(c=>c[0]===saved))select.value=saved;}catch(_){}
const gpsOption=document.createElement('option');gpsOption.value='';gpsOption.textContent='현재 위치';gpsOption.disabled=true;gpsOption.hidden=true;select.append(gpsOption);
let location=cities.find(c=>c[0]===select.value),serial=0,controller,loaded=0,busy=false;
function describe(code){if(code===0)return '맑음';if([1,2].includes(code))return '구름 조금';if(code===3)return '흐림';if([45,48].includes(code))return '안개';if([51,53,55,56,57].includes(code))return '이슬비';if([61,63,65,66,67,80,81,82].includes(code))return '비';if([71,73,75,77,85,86].includes(code))return '눈';if([95,96,99].includes(code))return '뇌우';return '날씨 정보';}
function clear(){for(const id of ['weather-temperature','weather-detail','weather-updated'])$(id).textContent='';}
function number(v){return Number.isFinite(v)?Math.round(v):null;}
async function load(){
const request=++serial;controller?.abort();controller=new AbortController();const activeController=controller;
busy=true;$('weather-refresh').disabled=true;status.textContent='날씨를 불러오는 중…';clear();
const timeout=setTimeout(()=>activeController.abort(),12000);
try{
const query=new URLSearchParams({latitude:location[1].toFixed(2),longitude:location[2].toFixed(2),current:'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',timezone:'auto',forecast_days:'1'});
const response=await fetch('https://api.open-meteo.com/v1/forecast?'+query,{signal:activeController.signal});if(!response.ok)throw Error('weather');
const data=await response.json();if(request!==serial)return;
const c=data.current,d=data.daily;
if(!c||!d||!Number.isFinite(c.temperature_2m)||!Number.isFinite(c.apparent_temperature)||!Number.isFinite(c.weather_code)||!Number.isFinite(c.wind_speed_10m)||![d.temperature_2m_max?.[0],d.temperature_2m_min?.[0],d.precipitation_probability_max?.[0]].every(Number.isFinite)||c.time?.slice(0,10)!==d.time?.[0])throw Error('invalid');
$('weather-temperature').textContent=number(c.temperature_2m)+'°';status.textContent=location[0]+' · '+describe(c.weather_code);
$('weather-detail').textContent=`체감 ${number(c.apparent_temperature)}° · 최저 ${number(d.temperature_2m_min[0])}° / 최고 ${number(d.temperature_2m_max[0])}° · 오늘 강수확률 ${number(d.precipitation_probability_max[0])}% · 바람 ${number(c.wind_speed_10m)}km/h`;
$('weather-updated').textContent=c.time.replace('T',' ')+' 기준 · '+data.timezone;loaded=Date.now();
}catch(error){if(request!==serial)return;status.textContent='날씨를 불러오지 못했어요. 새로고침을 눌러 주세요.';loaded=0;}
finally{clearTimeout(timeout);if(request===serial){busy=false;$('weather-refresh').disabled=false;}}
}
select.addEventListener('change',()=>{location=cities.find(c=>c[0]===select.value);try{localStorage.setItem('shift_weather_city',select.value);}catch(_){}load();});
$('weather-refresh').onclick=load;
$('weather-locate').onclick=()=>{
if(!navigator.geolocation){status.textContent='이 브라우저에서는 위치를 사용할 수 없어요. 지역을 선택해 주세요.';return;}
const request=++serial;controller?.abort();busy=true;$('weather-refresh').disabled=true;clear();status.textContent='현재 위치를 확인하는 중…';
navigator.geolocation.getCurrentPosition(position=>{if(request!==serial)return;location=['현재 위치',position.coords.latitude,position.coords.longitude];select.value='';load();},()=>{if(request!==serial)return;busy=false;$('weather-refresh').disabled=false;status.textContent='위치를 확인하지 못했어요. 지역 선택 또는 새로고침으로 확인해 주세요.';},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
};
function refreshIfNeeded(){if(!document.hidden&&!busy&&Date.now()-loaded>900000)load();}
document.addEventListener('visibilitychange',refreshIfNeeded);window.addEventListener('online',refreshIfNeeded);
setInterval(refreshIfNeeded,900000);load();
})();
