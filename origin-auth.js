(async () => {
  'use strict';
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  const raw = sessionStorage.getItem('origin-auth-flow');
  sessionStorage.removeItem('origin-auth-flow');
  let flow;
  try { flow = raw && JSON.parse(raw); } catch { /* An unreadable flow must be restarted. */ }
  if (!flow || flow.state !== params.get('state') || Date.now() > flow.expires) {
    throw Error('로그인 요청이 만료됐어요. 앱으로 돌아가 다시 로그인해 주세요.');
  }
  const post = async (action, body, token) => {
    const response = await fetch('/api/native-account?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body),
      credentials: 'same-origin'
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.message || '앱으로 돌아가 다시 로그인해 주세요.');
    return data;
  };
  const result = await post('exchange', { ticket: params.get('ticket'), state: flow.state, verifier: flow.verifier });
  await post('web-session', {}, result.token);
  localStorage.setItem('shift_origin_ready_v1', '1');
  document.cookie = '__Host-work-routine-ready=1; Path=/; Secure; SameSite=Lax; Max-Age=31536000';
  const next = flow.intent === 'calendar' ? '/?google=connected' : flow.intent === 'account' ? '/?cloud=connected' : '/';
  location.replace(next);
})().catch(error => {
  document.getElementById('auth-page').setAttribute('data-state', 'error');
  document.getElementById('auth-title').textContent = '로그인을 다시 시작해 주세요';
  document.getElementById('status').textContent = error.name === 'TypeError'
    ? '연결이 잠시 끊겼어요. 앱으로 돌아가 다시 로그인해 주세요.'
    : error.message;
  document.getElementById('return-hint').textContent = '아래 버튼을 눌러 앱으로 돌아갈 수 있어요';
});
