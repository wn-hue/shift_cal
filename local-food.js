(() => {
  'use strict';

  const byId = id => document.getElementById('food-' + id);
  const regions = { ansan: ['안산', '안산'], sihwa: ['시화', '시흥 정왕동 시화'], baegot: ['배곧', '시흥 배곧'] };
  const occasions = {
    dining: ['맛집', '맛집', ''],
    delivery: ['배달', '배달 음식점', '배달 가능 여부와 배달 범위는 주문 전에 확인해 주세요.'],
    group: ['회식', '회식 음식점', '단체석과 예약 가능 여부는 방문 전에 확인해 주세요.']
  };
  const query = byId('query');
  const period = byId('period');
  const results = byId('places');
  const ranking = byId('rank');
  const panelState = byId('state');
  const feedback = byId('feedback');
  const feedbackAction = byId('feedback-action');
  const saved = { this: null, last: null };

  let mode = 'find';
  let search = '';
  let request;
  let loading = false;
  let failed = false;
  let saving = false;
  let feedbackTimer;

  const selected = name => document.querySelector('input[name="' + name + '"]:checked').value;
  const activePeriod = () => mode === 'find' ? 'this' : period.value;
  const context = week => new URLSearchParams({ region: selected('region'), occasion: selected('occasion'), period: week });
  const searchKey = week => context(week).toString() + (week === 'this' ? '&q=' + encodeURIComponent(search) : '');

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function announce(text) {
    byId('announcement').textContent = text;
  }

  function closeFeedback() {
    clearTimeout(feedbackTimer);
    feedback.hidden = true;
  }

  function showFeedback(text, action, runAction) {
    clearTimeout(feedbackTimer);
    feedback.hidden = false;
    byId('message').textContent = text;
    feedbackAction.hidden = !action;
    feedbackAction.textContent = action || '';
    feedbackAction.onclick = runAction || null;
    if (!action) {
      feedbackTimer = setTimeout(() => {
        if (!saving && !feedback.contains(document.activeElement)) closeFeedback();
      }, 4600);
    }
  }

  function voteControl(place, counts, value, interactive) {
    const label = value === 1 ? '좋아요' : '싫어요';
    const total = (value === 1 ? counts?.up : counts?.down) || 0;
    const control = node(interactive ? 'button' : 'span', interactive ? 'vote' : 'vote total');
    const icon = byId('vote-icon').content.firstElementChild.cloneNode(true);
    if (value === -1) icon.classList.add('down');
    control.append(icon, node('span', '', label), node('span', 'vote-count', total));
    if (interactive) {
      control.type = 'button';
      control.dataset.vote = place.id + ':' + value;
      control.setAttribute('aria-label', label + ' ' + total + '표 · ' + place.name);
      control.setAttribute('aria-pressed', String(counts?.mine === value));
      control.setAttribute('aria-disabled', String(saving));
      control.addEventListener('click', () => vote(place.id, counts?.mine === value ? 0 : value, control));
    }
    return control;
  }

  function placeRow(place, counts, rank, interactive) {
    const li = node('li', rank ? 'place ranked' : 'place');
    if (rank) {
      const order = node('span', 'place-order', rank);
      order.setAttribute('aria-hidden', 'true');
      li.append(order);
    }
    const info = node('div', 'place-info');
    info.append(node('h3', '', place.name));
    if (place.type || place.address) {
      info.append(node('p', '', [place.type, place.address].filter(Boolean).join(' · ')));
    }
    const map = node('a', 'place-map', '지도');
    map.href = 'https://map.kakao.com/?q=' + encodeURIComponent([place.name, place.address].filter(Boolean).join(' '));
    map.target = '_blank';
    map.rel = 'noopener';
    map.setAttribute('aria-label', place.name + ' 카카오맵에서 보기 (새 창)');
    const actions = node('div', 'votes');
    actions.append(voteControl(place, counts, 1, interactive), voteControl(place, counts, -1, interactive));
    li.append(info, map, actions);
    return li;
  }

  function showState(title, description, action, runAction) {
    panelState.hidden = false;
    panelState.replaceChildren(node('strong', '', title), node('p', '', description));
    const button = node('button', 'text-action', action);
    button.type = 'button';
    button.addEventListener('click', runAction);
    panelState.append(button);
  }

  function showLoading() {
    panelState.hidden = false;
    panelState.replaceChildren();
    for (let i = 0; i < 2; i++) {
      const row = node('div', 'loading-row');
      row.setAttribute('aria-hidden', 'true');
      row.append(node('span', 'loading-line'), node('span', 'loading-line'), node('span', 'loading-line'));
      panelState.append(row);
    }
  }

  function weekLabel(week) {
    return [week.start, week.end].map(value => {
      const [, month, day] = value.split('-');
      return Number(month) + '.' + Number(day) + '.';
    }).join(' – ');
  }

  function render() {
    const finding = mode === 'find';
    const week = activePeriod();
    const region = regions[selected('region')];
    const occasion = occasions[selected('occasion')];
    const scope = region[0] + ' · ' + occasion[0];
    const data = saved[week]?.key === searchKey(week) ? saved[week].data : null;
    const list = finding ? results : ranking;
    const title = finding ? byId('map-title') : byId('rank-title');
    const count = byId('count');

    byId('find-tab').setAttribute('aria-pressed', String(finding));
    byId('rank-tab').setAttribute('aria-pressed', String(!finding));
    byId('results').hidden = !finding;
    byId('ranking').hidden = finding;
    byId('search').hidden = !finding;
    byId('clear').hidden = !query.value;
    byId('map-title').textContent = search ? '검색 결과' : '둘러보기';
    byId('map-note').textContent = search ? scope + ' · ' + search : scope;
    byId('week').textContent = data ? scope + ' · ' + weekLabel(data.week) : scope;
    byId('external').href = 'https://map.kakao.com/?q=' + encodeURIComponent(region[1] + ' ' + (finding && search ? search : occasion[1]));
    byId('context-note').hidden = !finding || !occasion[2];
    byId('context-note').textContent = occasion[2];

    count.hidden = true;
    list.after(panelState);
    list.setAttribute('aria-busy', String(loading));
    list.replaceChildren();
    panelState.hidden = true;

    if (loading) {
      showLoading();
      return;
    }
    if (failed) {
      showState('목록을 불러오지 못했어요.', '연결을 확인한 뒤 다시 시도해 주세요.', '다시 불러오기', () => {
        title.focus();
        load(true);
      });
      return;
    }
    if (!data) return;

    if (finding) {
      if (data.places.length) {
        const totals = new Map(data.votes.map(entry => [entry.id, entry]));
        list.replaceChildren(...data.places.map(place => placeRow(place, totals.get(place.id), null, true)));
        count.hidden = !search;
        count.textContent = data.places.length === 24 ? '상위 24곳' : data.places.length + '곳';
      } else {
        showState('검색 결과가 없어요.', '가게 이름의 일부나 음식 종류로 다시 찾아보세요.', '검색어 지우기', resetSearch);
      }
      return;
    }
    const ranked = data.votes.filter(place => place.up > 0).slice(0, 20);
    if (ranked.length) {
      list.replaceChildren(...ranked.map((place, index) => placeRow(place, place, index + 1, week === 'this')));
    } else if (week === 'this') {
      showState('이번 주 첫 추천을 남겨보세요.', '가게를 찾아 좋아요를 누르면 여기에 올라와요.', '가게 찾아보기', () => openMode('find', { focus: true }));
    } else {
      showState('지난주에 추천받은 가게가 없어요.', '이번 주 순위를 확인해 보세요.', '이번 주 순위', openCurrentRank);
    }
  }

  async function load(force = false) {
    request?.abort();
    request = null;
    const week = activePeriod();
    const key = searchKey(week);
    const cached = saved[week];
    const fresh = cached?.key === key && Date.now() - cached.at < 60_000;
    failed = false;
    loading = !fresh || force;
    render();
    if (!loading) return;
    announce('목록을 불러오는 중이에요.');

    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const params = context(week);
    if (week === 'this') params.set('q', search);
    else params.set('search', '0');
    try {
      const response = await fetch('/api/local-food?' + params, { signal: controller.signal });
      if (!response.ok) throw new Error('Load failed');
      const data = await response.json();
      if (request !== controller) return;
      saved[week] = { key, data, at: Date.now() };
      const summary = mode === 'find'
        ? '가게 ' + data.places.length + '곳을 표시했어요.'
        : '주간 추천 순위를 불러왔어요.';
      announce(summary);
    } catch {
      if (request !== controller) return;
      failed = true;
      announce('목록을 불러오지 못했어요. 다시 불러올 수 있어요.');
    } finally {
      clearTimeout(timeout);
      if (request === controller) {
        request = null;
        loading = false;
        render();
      }
    }
  }

  async function vote(id, value, trigger) {
    const snapshot = saved.this;
    const key = searchKey('this');
    if (!snapshot || snapshot.key !== key || activePeriod() !== 'this' || saving) return;

    const params = context('this');
    params.set('ids', snapshot.data.places.map(place => place.id).join(','));
    const focusList = trigger.closest('.items');
    const focusKey = trigger.dataset.vote;
    saving = true;
    document.querySelectorAll('button[data-vote]').forEach(button => button.setAttribute('aria-disabled', 'true'));
    showFeedback('투표를 저장하고 있어요.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let repaint = false;

    try {
      const response = await fetch('/api/local-food?' + params, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value, week: snapshot.data.week.start }),
        signal: controller.signal
      });
      const data = await response.json();
      if (searchKey('this') !== key) return;
      if (response.status === 409 || response.status === 401) {
        saved.this = saved.last = null;
        showFeedback('목록을 갱신했어요. 투표를 다시 눌러 주세요.');
        await load(true);
        return;
      }
      if (!response.ok) {
        showFeedback(data.message || '투표를 저장하지 못했어요. 다시 눌러 주세요.');
        return;
      }
      if (saved.this?.key === key) {
        saved.this.data.votes = data.votes;
        saved.this.at = Date.now();
        repaint = activePeriod() === 'this' && !loading && !failed;
      }
      if (value === 1) {
        if (mode === 'find') showFeedback('이번 주 순위에 반영했어요.', '순위 보기', openCurrentRank);
        else showFeedback('이번 주 순위에 반영했어요.');
      } else {
        showFeedback(value === -1 ? '싫어요를 반영했어요.' : '투표를 취소했어요.');
      }
    } catch {
      if (searchKey('this') === key) showFeedback('저장 결과를 확인하지 못했어요.', '다시 확인', () => {
        closeFeedback();
        load(true);
      });
    } finally {
      clearTimeout(timeout);
      saving = false;
      if (repaint) {
        const hadFocus = document.activeElement === trigger;
        render();
        if (hadFocus) {
          const target = focusList.querySelector('button[data-vote="' + focusKey + '"]');
          (target || byId('rank-title')).focus({ preventScroll: true });
        }
      } else {
        document.querySelectorAll('button[data-vote]').forEach(button => button.setAttribute('aria-disabled', 'false'));
      }
    }
  }

  function openMode(next, { focus = false } = {}) {
    mode = next;
    closeFeedback();
    if (focus) byId(next === 'find' ? 'find-tab' : 'rank-tab').focus();
    load();
  }

  function openCurrentRank() {
    period.value = 'this';
    openMode('rank', { focus: true });
  }

  function resetSearch() {
    const hadSearch = !!search;
    query.value = '';
    search = '';
    byId('clear').hidden = true;
    query.focus();
    if (hadSearch) {
      closeFeedback();
      load();
    }
  }

  byId('find-tab').addEventListener('click', () => openMode('find'));
  byId('rank-tab').addEventListener('click', () => openMode('rank'));
  byId('clear').addEventListener('click', resetSearch);
  byId('feedback-close').addEventListener('click', closeFeedback);
  query.addEventListener('input', () => { byId('clear').hidden = !query.value; });
  byId('search').addEventListener('submit', event => {
    event.preventDefault();
    search = query.value.trim();
    closeFeedback();
    const submittedFromInput = document.activeElement === query;
    load(true);
    if (submittedFromInput) byId('map-title').focus({ preventScroll: true });
  });
  document.querySelector('.filters').addEventListener('change', event => {
    if (event.target.type !== 'radio') return;
    closeFeedback();
    load();
  });
  period.addEventListener('change', () => {
    closeFeedback();
    load();
  });
  load();
})();
