(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    // Match the API's 03:00 Asia/Seoul meal-day boundary, independent of device timezone.
    const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now() - 3 * 60 * 60 * 1000));
    let shownDate = '', loadedAt = 0, loading = false;

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
            const heading = node('div','meal-card-heading');
            heading.appendChild(node('h2','',meal.name));
            heading.appendChild(node('span','meal-category',meal.groups[0].title));
            card.appendChild(heading);
            card.appendChild(list(meal.groups[0].items));
            if (meal.groups.length > 1) {
                const details = node('details','meal-extras');
                details.appendChild(node('summary','',meal.groups.slice(1).map(g => g.title).join(' · ')));
                for (const group of meal.groups.slice(1)) {
                    details.appendChild(node('h3','',group.title));
                    details.appendChild(list(group.items));
                }
                card.appendChild(details);
            }
            cards.appendChild(card);
        }
        $('today-menu-status').textContent = '오늘 식단을 불러왔어요.';
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
        const date = today();
        $('today-menu-date').textContent = dateLabel(date);
        if (loading || (!force && shownDate === date && Date.now() - loadedAt < 120000)) return;
        if (shownDate !== date) $('today-menu-cards').replaceChildren();
        loading = true;
        const button = $('today-menu-refresh');
        button.disabled = true;
        button.setAttribute('aria-busy','true');
        button.textContent = '불러오는 중…';
        $('today-menu-status').textContent = '오늘 식단을 불러오는 중이에요.';
        $('today-menu-panel').setAttribute('aria-busy','true');
        $('today-menu-empty').hidden = true;
        try {
            const response = await fetch('/api/today-menu',{cache:'no-store',signal:AbortSignal.timeout(45000)});
            const data = await response.json();
            if (!response.ok || data.status === 'error') throw new Error(data.message || '식단을 불러오지 못했어요. 다시 시도해 주세요.');
            if (date !== today() || data.date !== today()) throw new Error('날짜가 변경되었어요. 새로고침해 주세요.');
            if (data.status === 'ok' && Array.isArray(data.meals) && data.meals.length === 4) render(data);
            else if (data.status === 'not_published') empty(data.message);
            else throw new Error('오늘 식단을 확인하지 못했어요. 원문을 확인해 주세요.');
            shownDate = date;
            loadedAt = Date.now();
        } catch (error) {
            empty(error.name === 'TimeoutError' || error.name === 'AbortError' ? '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.' : error.message === 'Failed to fetch' ? '인터넷 연결을 확인한 뒤 다시 시도해 주세요.' : error.message);
            loadedAt = 0;
        } finally {
            loading = false;
            button.disabled = false;
            button.setAttribute('aria-busy','false');
            button.textContent = '새로고침';
            $('today-menu-panel').setAttribute('aria-busy','false');
        }
    }
    $('today-menu-refresh').addEventListener('click',() => load(true));
    document.addEventListener('visibilitychange',() => {if (!document.hidden && document.body.dataset.view === 'menu') load();});
    setInterval(() => {if (!document.hidden && document.body.dataset.view === 'menu' && shownDate !== today()) load();},60000);
    window.TodayMenu = {load};
})();
