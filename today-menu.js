(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    // Match the API's 03:00 Asia/Seoul meal-day boundary, independent of device timezone.
    const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now() - 3 * 60 * 60 * 1000));
    let shownDate = '', loadedAt = 0, selectedDate = null, requestId = 0, controller = null;
    const selected = () => selectedDate || today();
    const offset = date => Math.round((Date.parse(date)-Date.parse(today()))/86400000);
    const moveDate = (date, days) => new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
    function updateNavigation(date) {
        $('today-menu-date').textContent = dateLabel(date);
        const days = offset(date);
        if ($('today-menu-relative')) $('today-menu-relative').textContent = days===0?'오늘':days===1?'내일':days===-1?'어제':days>0?days+'일 뒤':Math.abs(days)+'일 전';
        if ($('today-menu-prev')) $('today-menu-prev').disabled = days<=-31;
        if ($('today-menu-next')) $('today-menu-next').disabled = days>=31;
        if ($('today-menu-today')) $('today-menu-today').hidden = days===0;
        if ($('today-menu-cards').dataset) $('today-menu-cards').dataset.menuDate = date;
    }
    const cacheKey = 'shift_today_menu_cache_v1';
    let cachedMenu = null;
    function validMenu(data, date) {
        return data?.status === 'ok' && data.date === date && Number.isFinite(Date.parse(data.checkedAt)) &&
            Array.isArray(data.meals) && data.meals.length === 4 && data.meals.every(meal =>
                typeof meal.name === 'string' && Array.isArray(meal.groups) && meal.groups.length > 0 && meal.groups.length <= 12 &&
                meal.groups.every(group => typeof group.title === 'string' && Array.isArray(group.items) && group.items.length > 0 &&
                    group.items.length <= 50 && group.items.every(item => typeof item === 'string' && item.length <= 2000)));
    }
    function readCache(date) {
        if (validMenu(cachedMenu,date)) return cachedMenu;
        try {
            const raw = localStorage.getItem(cacheKey);
            const data = raw && raw.length <= 100000 ? JSON.parse(raw) : null;
            if (validMenu(data,date)) return (cachedMenu = data);
            localStorage.removeItem(cacheKey);
        } catch (_) { /* Storage can be disabled; the in-memory cache still works. */ }
        return null;
    }
    function saveCache(data) {
        cachedMenu = data;
        try {localStorage.setItem(cacheKey,JSON.stringify(data));} catch (_) {}
    }

    function dateLabel(date) {
        return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(date + 'T12:00:00+09:00'));
    }
    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function list(items) {
        const ul = node('ul','meal-items');
        for (const item of items) ul.appendChild(node('li','',item));
        return ul;
    }
    function render(data) {
        const cards = $('today-menu-cards');
        cards.replaceChildren();
        for (const meal of data.meals) {
            const card = node('article','meal-card');
            card.setAttribute('data-meal',meal.name);
            const heading = node('div','meal-card-heading');
            heading.appendChild(node('h2','',meal.name));
            card.appendChild(heading);
            const body = node('div','meal-card-body'+(meal.groups.length > 1?' has-sides':''));
            const main = node('section','meal-main');
            main.setAttribute('aria-label',meal.name+' '+meal.groups[0].title);
            main.appendChild(node('h3','meal-group-title',meal.groups[0].title));
            main.appendChild(list(meal.groups[0].items));
            body.appendChild(main);
            if (meal.groups.length > 1) {
                const sides = node('aside','meal-sides');
                sides.setAttribute('aria-label',meal.name+' 추가 메뉴');
                for (const group of meal.groups.slice(1)) {
                    const section = node('section','meal-side-group');
                    section.appendChild(node('h3','meal-group-title',group.title));
                    section.appendChild(list(group.items));
                    sides.appendChild(section);
                }
                body.appendChild(sides);
            }
            card.appendChild(body);
            cards.appendChild(card);
        }
        $('today-menu-status').textContent = '';
        $('today-menu-empty').hidden = true;
        $('today-menu-note').hidden = false;
        $('today-menu-checked').textContent = '확인 ' + new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(data.checkedAt));
    }
    function empty(message) {
        $('today-menu-cards').replaceChildren();
        $('today-menu-empty').hidden = false;
        $('today-menu-empty').textContent = message;
        $('today-menu-note').hidden = true;
        $('today-menu-checked').textContent = '';
        $('today-menu-status').textContent = message;
    }
    async function load(force = false) {
        const date = selected();
        updateNavigation(date);
        const id = ++requestId;
        if (controller) controller.abort();
        controller = null;
        $('today-menu-refresh').disabled = false;
        $('today-menu-refresh').textContent = '새로고침';
        $('today-menu-refresh').setAttribute('aria-busy','false');
        $('today-menu-panel').setAttribute('aria-busy','false');
        if (!force) {
            const saved = readCache(date);
            if (saved) {
                render(saved);
                shownDate = date;
                loadedAt = Date.now();
                return;
            }
            if (shownDate === date && Date.now() - loadedAt < 120000) return;
        }
        if (shownDate !== date) $('today-menu-cards').replaceChildren();
        controller = new AbortController();
        const button = $('today-menu-refresh');
        button.disabled = true;
        button.setAttribute('aria-busy','true');
        button.textContent = '불러오는 중…';
        $('today-menu-status').textContent = '식단을 불러오는 중이에요.';
        $('today-menu-panel').setAttribute('aria-busy','true');
        $('today-menu-empty').hidden = true;
        try {
            const response = await fetch('/api/today-menu?date='+encodeURIComponent(date),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
            const data = await response.json();
            if (id !== requestId) return;
            if (!response.ok || data.status === 'error') throw new Error(data.message || '식단을 불러오지 못했어요. 다시 시도해 주세요.');
            if (date !== selected() || data.date !== date) throw new Error('날짜가 변경되었어요. 새로고침해 주세요.');
            if (validMenu(data,date)) {render(data); saveCache(data);}
            else if (data.status === 'not_published') empty(data.message);
            else throw new Error('메뉴를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
            shownDate = date;
            loadedAt = Date.now();
        } catch (error) {
            if (id !== requestId) return;
            empty(error.name === 'TimeoutError' || error.name === 'AbortError' ? '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.' : error.message === 'Failed to fetch' ? '인터넷 연결을 확인한 뒤 다시 시도해 주세요.' : error.message);
            loadedAt = 0;
        } finally {
            if (id !== requestId) return;
            controller = null;
            button.disabled = false;
            button.setAttribute('aria-busy','false');
            button.textContent = '새로고침';
            $('today-menu-panel').setAttribute('aria-busy','false');
        }
    }
    $('today-menu-refresh').addEventListener('click',() => load(true));
    document.addEventListener('visibilitychange',() => {if (!document.hidden && document.body.dataset.view === 'menu') load();});
    setInterval(() => {if (!document.hidden && document.body.dataset.view === 'menu' && !selectedDate && shownDate !== today()) load();},60000);
    function changeDate(days) {
        const date = moveDate(selected(),days);
        if (Math.abs(offset(date))>31) return;
        selectedDate = date===today()?null:date;
        return load();
    }
    $('today-menu-prev')?.addEventListener('click',() => changeDate(-1));
    $('today-menu-next')?.addEventListener('click',() => changeDate(1));
    $('today-menu-today')?.addEventListener('click',() => {selectedDate=null;load();});
    window.ShiftUI?.bindMonthSwipe($('view-menu'),$('today-menu-panel'),changeDate);
    window.TodayMenu = {load,changeDate};
})();
