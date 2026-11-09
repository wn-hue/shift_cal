/* Keep Korean source text separate from display text; never modify stored/user content. */
(()=>{'use strict';
 const dict=window.AppTranslations,languages={ko:['ko','한국어'],en:['en','English'],zh:['zh-Hans','简体中文'],ja:['ja','日本語']},sources=new WeakMap(),attrs=new WeakMap();
 let language='ko',frame=0;try{const saved=localStorage.getItem('shift_display_language');if(languages[saved])language=saved}catch{}
 const skip='script,style,textarea,input,code,pre,[data-no-i18n],[data-language],#settings-language-name,.memo-tag,.day-event-tag,.external-event,.meal-items,#external-calendar-list,.lost-card h3,.lost-card-place,.lost-card-storage,.event-open strong,.event-open span,#schedule-reminder p,.bus-unified-place strong,.bus-unified-place small,.bus-unified-route strong,.bus-route-heading strong,.bus-stop-name,.bus-result-stop';
 const days={en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],zh:['日','一','二','三','四','五','六'],ja:['日','月','火','水','木','金','土']};
 const deductionLabels={
  급여:{en:'Salary',zh:'工资',ja:'給与'},
  상여:{en:'Bonus',zh:'奖金',ja:'賞与'},
  '전체 공제':{en:'Total deductions',zh:'扣除总额',ja:'控除合計'}
 };
 function t(source,el,attribute=false){
  if(language==='ko')return source;
  const s=source.trim();let value=dict[s]?.[language],m;
  if(el?.closest('.cal-weekdays,.group-weekday')&&'일월화수목금토'.includes(s)&&s.length===1)value=days[language]['일월화수목금토'.indexOf(s)];
  if(!value&&el?.closest('.shift-badge,.stats-badge,.opt-btn,.group-shift,.attendance-pill')&&['주','야','휴'].includes(s))value={en:{주:'D',야:'N',휴:'Off'},zh:{주:'白',야:'夜',휴:'休'},ja:{주:'日',야:'夜',휴:'休'}}[language][s];
  // Keep compact calendar badges legible; titles and accessible names retain the full wording.
  if(!attribute&&el?.closest('.cal-grid .shift-badge')&&['test1','test3','test4'].includes(document.body.dataset.prefTheme)&&['주특','야특'].includes(s))value={en:{주특:'D+',야특:'N+'},zh:{주특:'白加',야특:'夜加'},ja:{주특:'日特',야특:'夜特'}}[language][s];
  if(!value&&s==='원')value=el?.closest('#pref-shape')?{en:'Circle',zh:'圆形',ja:'円'}[language]:{en:'KRW',zh:'韩元',ja:'ウォン'}[language];
  if(s==='일'&&el?.closest('#menu-leave-settings'))value={en:el.querySelector('#quick-remain-leave')?.textContent.trim()==='1'?' day':' days',zh:'天',ja:'日'}[language];
  if(!value&&(m=s.match(/^([ABC])조( 근무표)?$/)))value={en:'Team '+m[1]+(m[2]?' schedule':''),zh:m[1]+'组'+(m[2]?'班表':''),ja:m[1]+'組'+(m[2]?'の勤務表':'')}[language];
  if(!value&&(m=s.match(/^([ABC])조 · 3조 2교대$/)))value={en:'Team '+m[1]+' · 3 teams / 2 shifts',zh:m[1]+'组 · 三班两倒',ja:m[1]+'組・3組2交替'}[language];
  if(!value&&(m=s.match(/^(\d+)년 (\d+)월 급여$/)))value={en:`Pay · ${m[1]}.${m[2]}`,zh:`${m[1]}年${m[2]}月工资`,ja:`${m[1]}年${m[2]}月の給与`}[language];
  if(!value&&(m=s.match(/^(\d+)월 (\d+)일 ([일월화수목금토])요일$/))){const y=typeof currentCalDate==='undefined'?new Date().getFullYear():currentCalDate.getFullYear();value=new Intl.DateTimeFormat(languages[language][0],{month:'long',day:'numeric',weekday:'long'}).format(new Date(y,Number(m[1])-1,Number(m[2])));}
  if(!value&&(m=s.match(/^(\d{4})년 (\d{1,2})월$/)))value=new Intl.DateTimeFormat(languages[language][0],{year:'numeric',month:'long'}).format(new Date(Number(m[1]),Number(m[2])-1,1));
  if(!value&&(m=s.match(/^(\d{1,2})월$/)))value=new Intl.DateTimeFormat(languages[language][0],{month:el?.matches?.('.payroll-recap-month')?'short':'long'}).format(new Date(2026,Number(m[1])-1,1));
  if(!value&&(m=s.match(/^(\d+)년$/)))value={en:m[1],zh:m[1]+'年',ja:m[1]+'年'}[language];
  if(!value&&(m=s.match(/^([+−-]?[\d,]+(?:\.\d+)?)\s*원$/)))value={en:'KRW '+m[1],zh:m[1]+'韩元',ja:m[1]+'ウォン'}[language];
  if(!value&&(m=s.match(/^(\d+(?:\.\d+)?)일$/)))value={en:m[1]+(m[1]==='1'?' day':' days'),zh:m[1]+'天',ja:m[1]+'日'}[language];
  if(!value&&(m=s.match(/^(좋아요|싫어요) (\d+)$/)))value=t(m[1])+' '+m[2];
  if(!value&&(m=s.match(/^(.+) 스티커( 변경|를 저장했어요\.|가 붙어 있어요\.)$/))&&dict[m[1]])value=t(m[1])+{en:{' 변경':' · Change sticker','를 저장했어요.':' sticker saved.','가 붙어 있어요.':' sticker selected.'},zh:{' 변경':' · 更换贴纸','를 저장했어요.':'贴纸已保存。','가 붙어 있어요.':'贴纸已选中。'},ja:{' 변경':'・ステッカーを変更','를 저장했어요.':'のステッカーを保存しました。','가 붙어 있어요.':'のステッカーを選択中です。'}}[language][m[2]];
  if(!value&&(m=s.match(/^기본 (.+)$/)))value=t('기본')+' '+t(m[1]);
  if(!value&&(m=s.match(/^(.+) 스티커$/))&&dict[m[1]])value=t(m[1])+' '+t('스티커');
  const copy=(en,zh,ja)=>({en,zh,ja}[language]);
  if(!value&&(m=s.match(/^(\d{4})년 급여 결산( 보기)?$/)))value=m[2]?copy(`View the ${m[1]} pay recap`,`查看${m[1]}年薪资回顾`,`${m[1]}年の給与まとめを見る`):copy(`${m[1]} pay recap`,`${m[1]}年薪资回顾`,`${m[1]}年の給与まとめ`);
  if(!value&&(m=s.match(/^(\d{4})\. 1\. 1\.–12\. 31\.$/)))value=copy(`Jan 1–Dec 31, ${m[1]}`,`${m[1]}年1月1日至12月31日`,`${m[1]}年1月1日〜12月31日`);
  const date=(y,month,day)=>new Intl.DateTimeFormat(languages[language][0],{month:'long',day:'numeric',weekday:'short',...(y?{year:'numeric'}:{})}).format(new Date(Number(y)||2026,Number(month)-1,Number(day)));
  if(!value&&(m=s.match(/^(급여|상여): (문자 기준|기본 비율) ([\d.]+)%$/)))value=deductionLabels[m[1]][language]+copy(': ','：','：')+(m[2]==='문자 기준'?copy('message rate ','短信比例 ','メッセージの割合 '):copy('default rate ','默认比例 ','既定の割合 '))+m[3]+'%';
  if(!value&&(m=s.match(/^(급여|상여): 문자에 나온 세금·보험료 기준$/)))value=deductionLabels[m[1]][language]+copy(': taxes and insurance from your message','：短信中的税费和保险费','：メッセージの税金・保険料を使用');
  if(!value&&el?.id==='payroll-sms-preview'&&s.includes('\n'))value=s.split('\n').map(line=>t(line)).join('\n');
  if(!value&&(m=s.match(/^(급여: (?:기본 비율 |문자로 등록한 공제율 |월 보험료 ).+) · (상여: (?:기본 비율 |문자로 등록한 공제율 |월 보험료 ).+)$/)))value=t(m[1])+' · '+t(m[2]);
  if(!value&&(m=s.match(/^(급여|상여|전체 공제): 기본 비율 ([\d.]+)%로 예상해요 \((소득세·지방소득세·고용보험|세금·보험료) 포함\)$/))){
   const name=deductionLabels[m[1]][language],rate=m[2];
   const included=m[3]==='세금·보험료'?copy('taxes and insurance','税费和保险费','税金・保険料'):copy('income tax, local income tax and employment insurance','所得税、地方所得税和就业保险','所得税・地方所得税・雇用保険');
   value=copy(name+': estimated at the default rate of '+rate+'% (including '+included+')',name+'：按默认比例'+rate+'%估算（含'+included+'）',name+'：既定の割合'+rate+'%で見積もり（'+included+'を含む）');
  }
  if(!value&&(m=s.match(/^(급여|상여|전체 공제): 문자로 등록한 공제율 ([\d.]+)%$/))){
   const name=deductionLabels[m[1]][language],rate=m[2];
   value=copy(name+': deduction rate from your message '+rate+'%',name+'：短信扣除比例'+rate+'%',name+'：メッセージに基づく控除率'+rate+'%');
  }
  if(!value&&(m=s.match(/^(급여|상여|전체 공제): 월 보험료 ([\d,]+ 원) · 문자로 등록한 세금 비율 ([\d.]+)% · 고용보험 ([\d.]+)%(?: · 기타 월 공제 ([\d,]+ 원))?$/))){
   const name=deductionLabels[m[1]][language],insurance=t(m[2]),tax=m[3],employment=m[4];
   value=copy(name+': monthly insurance '+insurance+' · tax rate from your message '+tax+'% · employment insurance '+employment+'%',name+'：每月保险费'+insurance+' · 短信税率'+tax+'% · 就业保险'+employment+'%',name+'：月額保険料'+insurance+'・メッセージに基づく税率'+tax+'%・雇用保険'+employment+'%');
   if(m[5])value+=copy(' · other monthly deductions ',' · 其他每月扣除','・その他の月額控除')+t(m[5]);
  }
  if(!value&&(m=s.match(/^(.+)은 ([01])원부터 10억 원까지 입력할 수 있어요\. 소수점 없이 숫자로 입력해 주세요\.$/))&&dict[m[1]]){
   const label=t(m[1]),minimum=m[2];
   value=copy('Enter '+label+' as a whole amount from ₩'+minimum+' to ₩1 billion.','请输入'+minimum+'韩元至10亿韩元之间的'+label+'金额，且不含小数。',label+'は'+minimum+'ウォンから10億ウォンまで、整数で入力してください。');
  }
  if(!value&&(m=s.match(/^(.+) 기존에 등록한 내용은 그대로 유지돼요\.$/)))value=t(m[1])+' '+t('기존에 등록한 내용은 그대로 유지돼요.');
  if(!value&&(m=s.match(/^저장을 완료하지 못했어요\. (.+)$/)))value=t('저장을 완료하지 못했어요.')+' '+t(m[1]);
  if(!value&&(m=s.match(/^계정에 저장한 기록 사용하기 · (.+)$/)))value=t('계정에 저장한 기록 사용하기')+' · '+m[1];
  if(!value&&(m=s.match(/^근무표 보내기 실패 · (.+)$/)))value=t('근무표를 보내지 못했어요.')+' '+t(m[1]);
  if(!value&&(m=s.match(/^중복되거나 반복되는 일정 (\d+)개를 빼고 보냈어요\. Google 캘린더에서 확인한 뒤 다시 보내 주세요\.$/))){
   const count=m[1];
   value=copy('Skipped '+count+' duplicate or recurring '+(count==='1'?'event':'events')+'. Check Google Calendar, then send again.','已跳过'+count+'个重复或定期日程。请在 Google 日历中检查后重新发送。','重複または繰り返しの予定を'+count+'件除いて送信しました。Googleカレンダーで確認してから再送してください。');
  }
  if(!value&&(m=s.match(/^지난주 식단 평가 · (\d{2}\.\d{2}~\d{2}\.\d{2})$/)))value=copy('Last week’s meal ratings','上周餐点评价','先週の献立の評価')+' · '+m[1];
  if(!value&&(m=s.match(/^([\d.]+(?:m|km)) 안에서 직선거리로 가까운 순서대로 보여 드려요\.$/)))value=copy('Within '+m[1]+' · Sorted by straight-line distance',m[1]+'以内 · 按直线距离排序',m[1]+'以内・直線距離が近い順に表示');
  if(!value&&(m=s.match(/^(?:(\d{4})년 )?(\d+)월 (\d+)일 \([일월화수목금토]\)$/)))value=date(m[1],m[2],m[3]);
  if(!value&&(m=s.match(/^예상 급여 변화 (.+)$/)))value=copy('Estimated pay change: ','预计工资变化：','予想給与の変化：')+t(m[1]);
  if(!value&&(m=s.match(/^(.+) · 현재 근무와 비교한 세전 추정입니다\. 저장 전까지 근무는 바뀌지 않습니다\.$/)))value=m[1]+copy(' · Gross estimate compared with your current shift. No shift changes until saved.',' · 与当前班次相比的税前预估，保存前不会更改班次。','・現在の勤務と比較した税引前の推定です。保存するまで勤務は変わりません。');
  if(!value&&(m=s.match(/^산정기간: (.+)$/)))value=copy('Pay period: ','计算期间：','算定期間：')+m[1];
  if(!value&&(m=s.match(/^(\d+)월 급여명세서 발송일$/)))value=copy(`Month ${m[1]} payslip notice`,`${m[1]}月工资单发送日`,`${m[1]}月の給与明細送付日`);
  if(!value&&(m=s.match(/^([ABC])조 근무표가 표시돼요\. 근무조는 자동으로 저장돼요\.$/)))value=copy('Showing Team '+m[1]+'’s schedule. Your team is saved automatically.','已显示'+m[1]+'组班表。班组会自动保存。',m[1]+'組の勤務表を表示します。勤務グループは自動で保存されます。');
  if(!value&&(m=s.match(/^전체 메뉴에서 다음 항목을 설정해 주세요\. (.+)$/)))value=copy('Set up the following in the All menu: ','请在“全部”菜单中设置以下项目：','「すべて」メニューで次の項目を設定してください。')+m[1].split(' · ').map(item=>t(item)).join(' · ');
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
  if(!value&&(m=s.match(/^(\d+)주차$/)))value=copy(`Week ${m[1]}`,`第${m[1]}周`,`${m[1]}週目`);
  if(!value&&(m=s.match(/^문자에서 (\d+)개 항목을 자동으로 채웠어요$/)))value=copy(`Filled ${m[1]} fields from your message`, `已从短信自动填入${m[1]}项`, `メッセージから${m[1]}項目を入力しました`);
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
   if(el.closest('#account-email')&&!Object.hasOwn(dict,record.source.trim()))continue;
   record.rendered=t(record.source,el);if(node.nodeValue!==record.rendered)node.nodeValue=record.rendered;sources.set(node,record);
  }
  for(const el of document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')){
   if(el.closest('[data-no-i18n],.memo-tag,.day-event-tag,.external-event,.meal-items,.lost-card h3,.lost-card-place,.lost-card-storage,#event-list,#account-email'))continue;
   const records=attrs.get(el)||{};
   for(const name of ['aria-label','placeholder','title','alt'])if(el.hasAttribute(name)){const value=el.getAttribute(name);let r=records[name];if(!r||value!==r.rendered)r={source:value};r.rendered=t(r.source,el,true);if(r.rendered!==value)el.setAttribute(name,r.rendered);records[name]=r;}
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
