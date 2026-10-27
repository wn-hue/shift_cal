/* Keep Korean source text separate from display text; never modify stored/user content. */
(()=>{'use strict';
 const dict=window.AppTranslations,languages={ko:['ko','한국어'],en:['en','English'],zh:['zh-Hans','简体中文'],ja:['ja','日本語']},sources=new WeakMap(),attrs=new WeakMap();
 let language='ko',frame=0;try{const saved=localStorage.getItem('shift_display_language');if(languages[saved])language=saved}catch{}
 const skip='script,style,textarea,input,code,pre,[data-no-i18n],[data-language],#settings-language-name,.memo-tag,.day-event-tag,.external-event,.meal-items,#external-calendar-list,#account-email,.lost-card h3,.lost-card-place,.lost-card-storage,.event-open strong,.event-open span,#schedule-reminder p,.bus-unified-place strong,.bus-unified-place small,.bus-unified-route strong,.bus-route-heading strong,.bus-stop-name,.bus-result-stop';
 const days={en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],zh:['日','一','二','三','四','五','六'],ja:['日','月','火','水','木','金','土']};
 function t(source,el){
  if(language==='ko')return source;
  const s=source.trim();let value=dict[s]?.[language],m;
  if(el?.closest('.cal-weekdays,.group-weekday')&&'일월화수목금토'.includes(s)&&s.length===1)value=days[language]['일월화수목금토'.indexOf(s)];
  if(!value&&el?.closest('.shift-badge,.stats-badge,.opt-btn,.group-shift,.attendance-pill')&&['주','야','휴'].includes(s))value={en:{주:'D',야:'N',휴:'Off'},zh:{주:'白',야:'夜',휴:'休'},ja:{주:'日',야:'夜',휴:'休'}}[language][s];
  if(!value&&s==='원')value=el?.closest('#pref-shape')?{en:'Circle',zh:'圆形',ja:'円'}[language]:{en:'KRW',zh:'韩元',ja:'ウォン'}[language];
  if(!value&&(m=s.match(/^([ABC])조( 근무표)?$/)))value={en:'Team '+m[1]+(m[2]?' schedule':''),zh:m[1]+'组'+(m[2]?'班表':''),ja:m[1]+'組'+(m[2]?'の勤務表':'')}[language];
  if(!value&&(m=s.match(/^([ABC])조 · 3조 2교대$/)))value={en:'Team '+m[1]+' · 3 teams / 2 shifts',zh:m[1]+'组 · 三班两倒',ja:m[1]+'組・3組2交替'}[language];
  if(!value&&(m=s.match(/^(\d+)년 (\d+)월 급여$/)))value={en:`Pay · ${m[1]}.${m[2]}`,zh:`${m[1]}年${m[2]}月工资`,ja:`${m[1]}年${m[2]}月の給与`}[language];
  if(!value&&(m=s.match(/^(\d+)월 (\d+)일 ([일월화수목금토])요일$/))){const y=typeof currentCalDate==='undefined'?new Date().getFullYear():currentCalDate.getFullYear();value=new Intl.DateTimeFormat(languages[language][0],{month:'long',day:'numeric',weekday:'long'}).format(new Date(y,Number(m[1])-1,Number(m[2])));}
  if(!value&&(m=s.match(/^(\d+)년$/)))value={en:m[1],zh:m[1]+'年',ja:m[1]+'年'}[language];
  if(!value&&(m=s.match(/^([+−-]?[\d,]+(?:\.\d+)?)\s*원$/)))value={en:'KRW '+m[1],zh:m[1]+'韩元',ja:m[1]+'ウォン'}[language];
  if(!value&&(m=s.match(/^(\d+(?:\.\d+)?)일$/)))value={en:m[1]+(m[1]==='1'?' day':' days'),zh:m[1]+'天',ja:m[1]+'日'}[language];
  if(!value&&(m=s.match(/^(좋아요|싫어요) (\d+)$/)))value=t(m[1])+' '+m[2];
  if(!value&&(m=s.match(/^(.+) 스티커( 변경|를 저장했어요\.|가 붙어 있어요\.)$/))&&dict[m[1]])value=t(m[1])+{en:{' 변경':' · Change sticker','를 저장했어요.':' sticker saved.','가 붙어 있어요.':' sticker selected.'},zh:{' 변경':' · 更换贴纸','를 저장했어요.':'贴纸已保存。','가 붙어 있어요.':'贴纸已选中。'},ja:{' 변경':'・ステッカーを変更','를 저장했어요.':'のステッカーを保存しました。','가 붙어 있어요.':'のステッカーを選択中です。'}}[language][m[2]];
  if(!value&&(m=s.match(/^기본 (.+)$/)))value=t('기본')+' '+t(m[1]);
  if(!value&&(m=s.match(/^(.+) 스티커$/))&&dict[m[1]])value=t(m[1])+' '+t('스티커');
  const copy=(en,zh,ja)=>({en,zh,ja}[language]);
  const date=(y,month,day)=>new Intl.DateTimeFormat(languages[language][0],{month:'long',day:'numeric',weekday:'short',...(y?{year:'numeric'}:{})}).format(new Date(Number(y)||2026,Number(month)-1,Number(day)));
  if(!value&&(m=s.match(/^(?:(\d{4})년 )?(\d+)월 (\d+)일 \([일월화수목금토]\)$/)))value=date(m[1],m[2],m[3]);
  if(!value&&(m=s.match(/^예상 급여 변화 (.+)$/)))value=copy('Estimated pay change: ','预计工资变化：','予想給与の変化：')+t(m[1]);
  if(!value&&(m=s.match(/^(.+) · 현재 근무와 비교한 세전 추정입니다\. 저장 전까지 근무는 바뀌지 않습니다\.$/)))value=m[1]+copy(' · Gross estimate compared with your current shift. No shift changes until saved.',' · 与当前班次相比的税前预估，保存前不会更改班次。','・現在の勤務と比較した税引前の推定です。保存するまで勤務は変わりません。');
  if(!value&&(m=s.match(/^산정기간: (.+)$/)))value=copy('Pay period: ','计算期间：','算定期間：')+m[1];
  if(!value&&(m=s.match(/^(\d+)월 급여명세서 발송일$/)))value=copy(`Month ${m[1]} payslip notice`,`${m[1]}月工资单发送日`,`${m[1]}月の給与明細送付日`);
  if(!value&&(m=s.match(/^([ABC])조 근무표 적용됨 · 자동 저장$/)))value=copy(`Team ${m[1]} schedule applied · Auto-saved`,`${m[1]}组班表已应用 · 自动保存`,`${m[1]}組の勤務表を適用・自動保存`);
  if(!value&&(m=s.match(/^([ABC])조 (?!·)(.+)$/)))value=t(m[1]+'조')+' '+t(m[2]);
  if(!value&&(m=s.match(/^([ABC])조 · (.+)에 맞춰 자동 설정$/)))value=t(m[1]+'조')+' · '+copy('Automatically matched to ','自动匹配','自動設定：')+t(m[2]);
  if(!value&&(m=s.match(/^(\d{4})년 (\d+)월 (\d+)번째 주 조별 근무$/)))value=copy(`${m[1]}.${m[2]} · Week ${m[3]} teams`,`${m[1]}年${m[2]}月 · 第${m[3]}周各组班次`,`${m[1]}年${m[2]}月・第${m[3]}週のグループ勤務`);
  if(!value&&(m=s.match(/^(\d{4})년 (\d+)월 조별 근무 연도와 월 선택$/)))value=copy(`Choose teams schedule month · ${m[1]}.${m[2]}`,`选择各组班次年月 · ${m[1]}年${m[2]}月`,`グループ勤務の年月を選択・${m[1]}年${m[2]}月`);
  if(!value&&(m=s.match(/^(\d+)월 (\d+)일 (.+), 조별 근무 보기$/)))value=date(null,m[1],m[2])+' · '+t(m[3])+' · '+t('조별 근무');
  if(!value&&(m=s.match(/^(\d+)월 (\d+)일 [일월화수목금토]요일(?: (.+))? 조별 근무 보기$/)))value=date(null,m[1],m[2])+(m[3]?' · '+t(m[3]):'')+' · '+t('조별 근무');
  if(!value&&(m=s.match(/^([124])공장( · 본사)?$/)))value=copy(`Factory ${m[1]}`,`${m[1]}号工厂`,`${m[1]}工場`)+(m[2]?copy(' · Head office',' · 总部','・本社'):'');
  if(!value&&(m=s.match(/^(.+) · ([124])공장( 조건에서 검색했어요\.)?$/)))value=t(m[1])+' · '+t(m[2]+'공장')+(m[3]?copy(' · Search conditions',' · 查询条件','・検索条件'):'');
  if(!value&&(m=s.match(/^(.+) · (\d{2}:\d{2})$/)))value=t(m[1])+' · '+m[2];
  if(!value&&(m=s.match(/^(.+) ⌄$/)))value=t(m[1])+' ⌄';
  if(!value&&(m=s.match(/^(\d+)개 노선(?: · (.+))?$/)))value=copy(`${m[1]} routes`,`${m[1]}条路线`,`${m[1]}路線`)+(m[2]?' · '+t(m[2]):'');
  if(!value&&(m=s.match(/^인식 완료: (.+)$/)))value=copy('Recognized: ','识别完成：','読み取り完了：')+m[1].split(' · ').map(part=>{const amount=part.match(/^(기본시급|통상시급|고정수당) ([\d,]+) 원$/);return amount?t(amount[1])+' '+t(amount[2]+' 원'):t(part);}).join(' · ');
  if(!value&&(m=s.match(/^조회 결과 (\d+)개$/)))value=copy(`${m[1]} results`,`${m[1]}条结果`,`${m[1]}件の結果`);
  if(!value&&(m=s.match(/^노선 검색 결과 (\d+)개 보기$/)))value=copy(`View ${m[1]} matching routes`,`查看${m[1]}条匹配路线`,`${m[1]}件の路線検索結果を見る`);
  if(!value&&(m=s.match(/^(.+) ([\d.]+)일$/))&&dict[m[1]])value=t(m[1])+' '+t(m[2]+'일');
  if(!value&&(m=s.match(/^(.+) · (\d+)곳 경유$/)))value=t(m[1])+' · '+copy(`${m[2]} stops`,`${m[2]}个站点`,`${m[2]}か所経由`);
  if(!value&&(m=s.match(/^(.+) 지도에서 보기$/)))value=m[1]+copy(' · View map',' · 查看地图','・地図を見る');
  if(!value&&(m=s.match(/^(.+) 즐겨찾기$/)))value=m[1]+' · '+t('즐겨찾기');
  if(!value&&(m=s.match(/^노선표 기준 (.+) · 회사 제공 시간표$/)))value=copy(`Company timetable · Updated ${m[1]}`,`公司提供时刻表 · ${m[1]}版`,`会社提供の時刻表・${m[1]}時点`);
  if(!value&&(m=s.match(/^(가까운 승차 지점|추천 하차 지점) · (.+)$/)))value=(m[1]==='가까운 승차 지점'?copy('Nearby boarding stop','附近上车点','近くの乗車地点'):copy('Suggested drop-off stop','推荐下车点','おすすめの降車地点'))+' · '+m[2];
  if(!value&&(m=s.match(/^(공유 정류장 핀|주변 기준점): (.+)$/)))value=(m[1]==='공유 정류장 핀'?copy('Shared stop pin','共享站点定位','共有停留所ピン'):copy('Nearby reference point','附近参考点','周辺の参考地点'))+': '+m[2];
  if(!value&&(m=s.match(/^(\d{2}:\d{2}) 승차$/)))value=m[1]+' '+t('승차');
  if(!value&&(m=s.match(/^([\d.]+(?:m|km)) · (출발 위치에서|목적지까지) 직선거리$/)))value=m[1]+' · '+(m[2]==='출발 위치에서'?copy('Straight-line distance from origin','距出发地的直线距离','出発地からの直線距離'):copy('Straight-line distance to destination','距目的地的直线距离','目的地までの直線距離'));
  if(!value&&(m=s.match(/^([\d.]+(?:m|km)) · 직선거리$/)))value=m[1]+copy(' · Straight-line distance',' · 直线距离','・直線距離');
  if(!value&&(m=s.match(/^([\d.]+(?:m|km)) 이내 · 직접 선택한 범위의 직선거리순이에요\.$/)))value=copy(`Within ${m[1]} · Ranked by straight-line distance in your selected range.`,`${m[1]}内 · 按所选范围的直线距离排列。`,`${m[1]}以内・選択範囲の直線距離順です。`);
  if(!value&&language==='zh'&&(m=s.match(/^급여: 개인 기준 미등록 · 기본 공제율 ([\d.]+)% 단순 추정 · 상여: 개인 기준 미등록 · 기본 공제율 ([\d.]+)% 단순 추정$/)))value=`工资：未设置个人扣除规则，按默认${m[1]}%粗略估算 · 奖金：未设置个人扣除规则，按默认${m[2]}%粗略估算`;
  if(!value&&language==='zh'&&(m=s.match(/^(.+) 기준 · 개근 가정 · 회계연도 부여 ([\d.]+)일$/)))value=`截至${m[1]} · 假设全勤 · 会计年度授予${m[2]}天`;
  if(!value&&language==='zh'&&(m=s.match(/^(.+) · (맑음|흐림|비 예보)$/)))value=t(m[1])+' · '+t(m[2]);
  if(!value&&language==='zh'&&(m=s.match(/^체감 (.+) · 최저 (.+) \/ 최고 (.+) · 오늘 강수확률 (.+) · 바람 (.+)$/)))value=`体感${m[1]} · 最低${m[2]} / 最高${m[3]} · 今日降水概率${m[4]} · 风速${m[5]}`;
  if(!value&&language==='zh'&&(m=s.match(/^(.+) 기준 · Asia\/Seoul$/)))value=`截至${m[1]} · 韩国时间`;
  return value?source.replace(s,value):source;
 }
 // Reading a translated select label must not turn its display text into the next source.
 function sourceText(element){const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node,result='';while(node=walker.nextNode()){const record=sources.get(node);result+=record&&node.nodeValue===record.rendered?record.source:node.nodeValue;}return result;}
 function observe(){observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','title','alt']})}
 function refresh(){
  if(frame){cancelAnimationFrame(frame);frame=0;}observer.disconnect();
  document.documentElement.lang=languages[language][0];document.body.dataset.uiLanguage=language;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
   const el=node.parentElement;if(!el||el.closest(skip)||el.tagName==='OPTION'&&!el.hasAttribute('value'))continue;
   let record=sources.get(node);if(!record||node.nodeValue!==record.rendered)record={source:node.nodeValue};
   record.rendered=t(record.source,el);if(node.nodeValue!==record.rendered)node.nodeValue=record.rendered;sources.set(node,record);
  }
  for(const el of document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')){
   if(el.closest('[data-no-i18n],.memo-tag,.day-event-tag,.external-event,.meal-items,.lost-card h3,.lost-card-place,.lost-card-storage,#event-list,#account-email'))continue;
   const records=attrs.get(el)||{};
   for(const name of ['aria-label','placeholder','title','alt'])if(el.hasAttribute(name)){const value=el.getAttribute(name);let r=records[name];if(!r||value!==r.rendered)r={source:value};r.rendered=t(r.source,el);if(r.rendered!==value)el.setAttribute(name,r.rendered);records[name]=r;}
   attrs.set(el,records);
  }
  const label=document.getElementById('settings-language-name');if(label)label.textContent=languages[language][1];
  document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  observe();
 }
 const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(refresh)});
 function setLanguage(next){
  if(!languages[next])return;
  const status=document.getElementById('language-save-status');
  try{localStorage.setItem('shift_display_language',next);language=next;if(status)status.textContent='언어를 저장했어요.';}catch{if(status)status.textContent='언어를 저장하지 못했어요. 다시 시도해 주세요.';}
  refresh();
 }
 for(const method of ['alert','confirm']){const original=window[method].bind(window);window[method]=message=>original(t(String(message)))}
 window.addEventListener('storage',e=>{if(e.key==='shift_display_language'){language=languages[e.newValue]?e.newValue:'ko';refresh()}});
 window.AppI18n={setLanguage,refresh,t,sourceText,get language(){return language}};refresh();
})();
