(() => {
  'use strict';
  if (location.origin !== 'https://h-lyart-ten.vercel.app') return;
  const send = (action, value) => window.webkit.messageHandlers.natbam.postMessage({action, value});
  let previous = '', timer;
  function sync(force = false) {
    addMenu();
    if (typeof getActualShift !== 'function' || typeof currentGroup === 'undefined') return;
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
    const part = name => Number(parts.find(p => p.type === name).value);
    const days = Array.from({length: 30}, (_, i) => {
      const date = new Date(part('year'), part('month') - 1, part('day') + i, 12);
      const shift = getActualShift(date, currentGroup);
      return {date: `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`, type: shift.type, origType: shift.origType || null};
    });
    const value = {group: currentGroup, days};
    const encoded = JSON.stringify(value);
    if (force || encoded !== previous) { previous = encoded; send('snapshot', value); }
  }
  function queue() { clearTimeout(timer); timer = setTimeout(() => sync(), 150); }
  function addMenu() {
    const parkingAlert = document.getElementById('parking-alert-toggle');
    if (parkingAlert && !parkingAlert.dataset.nativeNotice) {
      parkingAlert.dataset.nativeNotice = 'true';
      parkingAlert.onclick = () => {
        const status = document.getElementById('parking-alert-status');
        if (status) status.textContent = '이 iPhone 테스트 앱은 근무 알람을 지원해요. 주차장 만차 원격 알림은 Safari의 홈 화면 웹앱에서 이용해 주세요.';
      };
    }
    const section = document.querySelector('#view-all .menu-services');
    if (!section || document.getElementById('native-alarm-open')) return;
    const button = document.createElement('button');
    button.id = 'native-alarm-open';
    button.type = 'button';
    button.className = 'life-entry';
    button.setAttribute('aria-label', '근무 알람');
    button.innerHTML = '<span class="menu-service-icon" style="--service-color:#3182f6;--service-bg:#eaf2ff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M5 3 2 6m17-3 3 3M6 20l-1 2m13-2 1 2"/></svg></span><span class="menu-service-copy"><strong>근무 알람</strong><small>아이폰 알람 · 달력과 자동 연결</small></span><span class="menu-service-chevron" aria-hidden="true">›</span>';
    button.addEventListener('click', () => { sync(true); send('alarms'); });
    section.append(button);
  }
  // Storage hooks cover calendar edits, group switches, and cloud restoration.
  for (const method of ['setItem', 'removeItem', 'clear']) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function(...args) {
      const result = original.apply(this, args);
      if (this === localStorage) queue();
      return result;
    };
  }
  window.addEventListener('shift-account-changed', queue);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(true); });
  window.natbamSync = () => sync(true);
  new MutationObserver(queue).observe(document.documentElement, {childList: true, subtree: true});
  setInterval(() => { if (!document.hidden) sync(); }, 30000);
  sync(true);

  const pending = new Map();
  let sequence = 0;
  window.natbamShareResult = (id, ok) => {
    const promise = pending.get(id);
    if (!promise) return;
    pending.delete(id);
    ok ? promise.resolve() : promise.reject(new DOMException('공유를 취소했어요.', 'AbortError'));
  };
  const read = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  async function share(data = {}) {
    const files = Array.from(data.files || []);
    if (files.length > 5 || files.reduce((total, f) => total + f.size, 0) > 10 * 1024 * 1024) throw new Error('공유 파일은 10MB까지 지원해요.');
    const value = {id: String(++sequence), title: String(data.title || ''), text: String(data.text || ''), url: String(data.url || ''), files: await Promise.all(files.map(async f => ({name: f.name || '교대 루틴', data: await read(f)})))};
    return new Promise((resolve, reject) => { pending.set(value.id, {resolve, reject}); send('share', value); });
  }
  Object.defineProperty(navigator, 'share', {value: share, configurable: true});
  Object.defineProperty(navigator, 'canShare', {value: data => !data?.files || (data.files.length <= 5 && data.files.reduce((n,f) => n+f.size,0) <= 10*1024*1024), configurable: true});
  // Existing ICS/JSON exports use blob download links, which WKWebView cannot download itself.
  function download(link) {
    if (!link || !link.hasAttribute('download') || !/^(blob:|data:)/.test(link.href)) return false;
    (async () => {
      try { const blob = await (await fetch(link.href)).blob(); await share({files: [new File([blob], link.download || '교대 루틴')]}); }
      catch (error) { if (error.name !== 'AbortError') alert(error.message); }
    })();
    return true;
  }
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (!download(this)) originalClick.call(this);
  };
  document.addEventListener('click', event => {
    if (download(event.target.closest?.('a[download]'))) event.preventDefault();
  }, true);
})();
