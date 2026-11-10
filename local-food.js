(() => {
  'use strict';
  const byId = id => document.getElementById('food-' + id);
  const regions = { ansan: '안산', sihwa: '시흥 정왕동 시화', baegot: '시흥 배곧' };
  const occasions = { dining: '맛집', delivery: '배달 음식점', group: '회식 음식점' };
  const region = byId('region'), occasion = byId('occasion'), period = byId('period');
  const query = byId('query'), message = byId('message');
  let places = [], votes = [], week, search = '', controller, loadNumber = 0, voting = false;
  const context = () => new URLSearchParams({ region: region.value, occasion: occasion.value, period: period.value });
  const contextId = () => region.value + '/' + occasion.value;

  function item(tag, content, className) {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
  }

  function row(place, index, showVote, ranked) {
    const counts = votes.find(entry => entry.id === place.id);
    const li = item('li');
    const info = item('div', '', 'place-info');
    info.append(item('strong', place.name));
    if (place.address || place.type) info.append(item('small', [place.type, place.address].filter(Boolean).join(' · ')));
    const map = item('a', '카카오맵 장소 보기 ↗', 'place-map');
    map.href = 'https://map.kakao.com/?q=' + encodeURIComponent(place.name + ' ' + place.address);
    map.target = '_blank';
    map.rel = 'noopener';
    info.append(map);
    if (ranked) li.append(item('span', String(index + 1), 'place-order'));
    li.append(info);
    const actions = item('div', '', 'votes');
    for (const [value, label, count] of [[1, '좋아요', counts?.up || 0], [-1, '싫어요', counts?.down || 0]]) {
      if (!showVote) {
        actions.append(item('span', label + ' ' + count, 'muted'));
        continue;
      }
      const button = item('button', label + ' ' + count);
      button.type = 'button';
      button.dataset.vote = place.id + ':' + value;
      button.setAttribute('aria-pressed', String(counts?.mine === value));
      button.disabled = voting || !week;
      button.addEventListener('click', () => vote(place.id, counts?.mine === value ? 0 : value, button));
      actions.append(button);
    }
    li.append(actions);
    return li;
  }

  function render() {
    const current = period.value === 'this';
    const ranked = votes.filter(entry => entry.up > 0).slice(0, 20);
    byId('rank').replaceChildren(...ranked.map((entry, index) => row(entry, index, current, true)));
    const candidates = search ? places : places.filter(place => !ranked.some(entry => entry.id === place.id));
    byId('places').replaceChildren(...candidates.map((place, index) => row(place, index, current, false)));
    byId('rank-empty').textContent = week && !ranked.length ? (current ? '아직 좋아요를 받은 가게가 없어요. 첫 추천을 남겨보세요.' : '지난주에는 추천받은 가게가 없었어요.') : '';
  }

  function setContextLinks() {
    const text = [regions[region.value], search || occasions[occasion.value]].join(' ');
    byId('external').href = 'https://map.kakao.com/?q=' + encodeURIComponent(text);
    const note = byId('context-note');
    note.hidden = occasion.value === 'dining';
    note.textContent = occasion.value === 'delivery'
      ? '배달 가능 여부와 배달 범위는 주문 전에 확인해 주세요.'
      : '단체석이나 예약 가능 여부는 방문 전에 확인해 주세요.';
  }

  async function load({ fetchPlaces = true, messageText = '' } = {}) {
    controller?.abort();
    controller = new AbortController();
    const sequence = ++loadNumber;
    const params = context();
    setContextLinks();
    if (fetchPlaces) params.set('q', search);
    else {
      params.set('search', '0');
      params.set('ids', places.map(place => place.id).join(','));
    }
    week = null;
    votes = [];
    if (fetchPlaces) places = [];
    message.textContent = '불러오는 중이에요.';
    render();
    try {
      const response = await fetch('/api/local-food?' + params, { signal: controller.signal });
      const data = await response.json();
      if (sequence !== loadNumber) return;
      if (!response.ok) throw Error(data.message);
      week = data.week;
      votes = data.votes;
      if (fetchPlaces) {
        places = data.places;
        byId('map-note').textContent = places.length
          ? (search ? '찾은 가게에 좋아요를 누르면 이번 주 순위에 올라가요.' : '지역별 가게를 골라봤어요. 원하는 가게를 직접 검색할 수도 있어요.')
          : '검색 결과가 없어요. 가게 이름의 일부나 음식 종류로 찾아보세요.';
      }
      byId('week').textContent = week.start + ' ~ ' + week.end + ' · 매주 월요일 오전 3시 갱신';
      message.textContent = messageText;
    } catch (error) {
      if (sequence !== loadNumber || error.name === 'AbortError') return;
      message.textContent = error.message || '목록을 불러오지 못했어요.';
    }
    render();
  }

  async function vote(id, value, trigger) {
    if (!week || voting || period.value !== 'this') return;
    const initial = contextId();
    const sequence = loadNumber;
    const params = context();
    params.set('ids', places.map(place => place.id).join(','));
    const focusList = trigger.closest('ol');
    const focusKey = trigger.dataset.vote;
    voting = true;
    render();
    try {
      const response = await fetch('/api/local-food?' + params, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value, week: week.start })
      });
      const data = await response.json();
      if (sequence !== loadNumber || initial !== contextId()) return;
      if (response.status === 409) return load({ fetchPlaces: false, messageText: data.message });
      if (!response.ok) throw Error(data.message);
      votes = data.votes;
      message.textContent = value === 1 ? '이번 주 추천 순위에 반영했어요.' : value === -1 ? '싫어요를 반영했어요.' : '투표를 취소했어요.';
    } catch (error) {
      if (sequence === loadNumber) message.textContent = error.message || '투표를 저장하지 못했어요.';
    } finally {
      voting = false;
      render();
      if (sequence === loadNumber && document.activeElement === document.body) {
        const selector = 'button[data-vote="' + focusKey + '"]';
        (focusList.querySelector(selector) || byId('ranking').querySelector(selector))?.focus({ preventScroll: true });
      }
    }
  }

  byId('search').addEventListener('submit', event => {
    event.preventDefault();
    search = query.value.trim();
    const ranking = byId('ranking'), results = byId('results');
    if (search) ranking.before(results);
    else results.before(ranking);
    byId('jump').hidden = !search;
    load();
  });
  for (const field of [region, occasion]) field.addEventListener('change', () => {
    period.value = 'this';
    load();
  });
  byId('jump').addEventListener('click', () => byId('rank-title').focus({ preventScroll: true }));
  period.addEventListener('change', () => load({ fetchPlaces: false }));
  load();
})();
