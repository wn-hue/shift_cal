(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    // Match the API's 03:00 Asia/Seoul meal-day boundary, independent of device timezone.
    const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now() - 3 * 60 * 60 * 1000));
    let shownDate = '', selectedDate = null, requestId = 0;
    const pending = new Map();
    let loadingTimer;
    function loading(active, refreshing = false) {
        clearTimeout(loadingTimer);
        const indicator = $('today-menu-loading');
        indicator.hidden = !active;
        indicator.classList.toggle('is-refreshing', refreshing);
        $('today-menu-status').classList.toggle('meal-status-loading', active);
        if (!active) return;
        indicator.querySelector('strong').textContent = refreshing ? '식단을 다시 확인하고 있어요' : '식단을 가져오고 있어요';
        indicator.querySelector('small').textContent = '잠시만 기다려 주세요';
        $('today-menu-status').textContent = indicator.querySelector('strong').textContent;
        loadingTimer = setTimeout(() => {
            indicator.querySelector('small').textContent = '식당 응답을 기다리고 있어요. 조금만 더 기다려 주세요.';
            $('today-menu-status').textContent = '식당 응답을 기다리고 있어요. 조금만 더 기다려 주세요.';
        }, 8000);
    }
    const selected = () => selectedDate || today();
    const offset = date => Math.round((Date.parse(date)-Date.parse(today()))/86400000);
    const moveDate = (date, days) => new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
    function updateNavigation(date) {
        if (document.body.dataset.view === 'menu') $('header-view-title').textContent = title(date);
        $('view-menu').setAttribute('aria-label', title(date));
        const days = offset(date);
        if ($('today-menu-relative')) $('today-menu-relative').textContent = days===0?'오늘':days===1?'내일':days===-1?'어제':days>0?days+'일 뒤':Math.abs(days)+'일 전';
        if ($('today-menu-prev')) $('today-menu-prev').disabled = days<=-31;
        if ($('today-menu-next')) $('today-menu-next').disabled = days>=31;
        $('today-menu-relative').setAttribute('aria-label', dateLabel(date));
        if ($('today-menu-cards').dataset) $('today-menu-cards').dataset.menuDate = date;
    }
    const cacheKey = 'shift_today_menu_cache_v2';
    const cachedMenus = new Map();
    let cacheRead = false;
    function validMenu(data, date) {
        return data?.status === 'ok' && data.date === date && Number.isFinite(Date.parse(data.checkedAt)) &&
            Array.isArray(data.meals) && data.meals.length === 4 && data.meals.every(meal =>
                typeof meal.name === 'string' && Array.isArray(meal.groups) && meal.groups.length > 0 && meal.groups.length <= 12 &&
                meal.groups.every(group => typeof group.title === 'string' && Array.isArray(group.items) && group.items.length > 0 &&
                    group.items.length <= 50 && group.items.every(item => typeof item === 'string' && item.length <= 2000)));
    }
    function validMissing(data, date) {
        return data?.status === 'not_published' && data.date === date &&
            Number.isFinite(Date.parse(data.checkedAt)) && Date.now() - Date.parse(data.checkedAt) < 3600000;
    }
    function readCache(date) {
        if (!cacheRead) {
            cacheRead = true;
            try {
                const raw = localStorage.getItem(cacheKey);
                const data = raw && raw.length <= 3000000 ? JSON.parse(raw) : {};
                for (const [day,menu] of Object.entries(data || {}).slice(-93)) if (validMenu(menu,day) || validMissing(menu,day)) cachedMenus.set(day,menu);
                // Carry over the previously saved single day without another request.
                const old = JSON.parse(localStorage.getItem('shift_today_menu_cache_v1') || 'null');
                if (old && validMenu(old,old.date) && !cachedMenus.has(old.date)) cachedMenus.set(old.date,old);
            } catch (_) { /* Storage can be disabled; memory caching still works. */ }
        }
        const menu = cachedMenus.get(date);
        return validMenu(menu,date) || validMissing(menu,date) ? menu : null;
    }
    function saveCache(data) {
        readCache(data.date);
        cachedMenus.delete(data.date);
        cachedMenus.set(data.date,data);
        // Keep three months of successful menus without filling device storage.
        while (cachedMenus.size > 93) cachedMenus.delete(cachedMenus.keys().next().value);
        try {localStorage.setItem(cacheKey,JSON.stringify(Object.fromEntries(cachedMenus)));} catch (_) {}
    }
    function requestMenu(date) {
        if (pending.has(date)) return pending.get(date);
        const request = (async()=>{
            const response = await fetch('/api/today-menu?date='+encodeURIComponent(date),{cache:'no-store',signal:AbortSignal.timeout(45000)});
            const data = await response.json();
            if (!response.ok || data.status === 'error') throw new Error(data.message || '식단을 불러오지 못했어요. 다시 시도해 주세요.');
            if (data.date !== date) throw new Error('날짜가 변경되었어요. 새로고침해 주세요.');
            // Save the entire published schedule so moving to another day needs no download.
            const {menus, ...menu} = data;
            if (Array.isArray(menus)) for (const item of menus.slice(0,31)) if (validMenu(item,item?.date)) saveCache(item);
            if (validMenu(menu,date)) saveCache(menu);
            else if (data.status === 'not_published') saveCache({...menu,checkedAt:data.checkedAt || new Date().toISOString()});
            else if (data.status !== 'not_published') throw new Error('메뉴를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
            return menu;
        })().finally(()=>pending.delete(date));
        pending.set(date,request);
        return request;
    }

    function title(date = selected()) {
        const weekday = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',weekday:'long'}).format(new Date(date + 'T12:00:00+09:00'));
        return weekday + ' 메뉴';
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
    function choiceName(title) {
        const name = title.replace(/[\s·ㆍ•-]/g,'');
        return /간편식/.test(name) ? '간편식' : /별미공방/.test(name) ? '별미공방' : '';
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
            const choices = meal.groups.slice(1).filter(group => choiceName(group.title));
            const additions = meal.groups.slice(1).filter(group => !choiceName(group.title));
            const body = node('div','meal-card-body'+(choices.length?' has-sides':''));
            const main = node('section','meal-main');
            main.setAttribute('aria-label',meal.name+' '+meal.groups[0].title);
            main.appendChild(node('h3','meal-group-title',meal.groups[0].title));
            main.appendChild(list(meal.groups[0].items));
            for (const group of additions) {
                const section = node('section','meal-addon');
                const plus = /^\s*(?:plus|\+)\s*$/i.test(group.title);
                section.appendChild(node('h3','meal-group-title',group.title+(plus?' · 추가 제공':'')));
                section.appendChild(list(group.items));
                main.appendChild(section);
            }
            body.appendChild(main);
            if (choices.length) {
                const sides = node('aside','meal-sides');
                sides.setAttribute('aria-label',meal.name+' 선택 메뉴');
                sides.appendChild(node('p','meal-choice-label','선택 메뉴'));
                for (const group of choices) {
                    const section = node('section','meal-side-group');
                    const title = node('h3','meal-group-title meal-choice-title',choiceName(group.title));
                    section.appendChild(title);
                    section.appendChild(list(group.items));
                    sides.appendChild(section);
                }
                body.appendChild(sides);
            }
            card.appendChild(body);
            cards.appendChild(card);
        }
        if(!window.matchMedia?.('(prefers-reduced-motion:reduce)')?.matches&&cards.animate){cards.getAnimations().forEach(a=>a.cancel());cards.animate([{opacity:.4},{opacity:1}],{duration:160,easing:'ease-out'});}
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
        loading(false);
        $('today-menu-panel').setAttribute('aria-busy','false');
        if (!force) {
            const saved = readCache(date);
            if (saved) {
                if (validMenu(saved,date)) render(saved);
                else empty(saved.message);
                shownDate = date;
                return;
            }
        }
        if (shownDate !== date) {
            $('today-menu-cards').replaceChildren();
            $('today-menu-note').hidden = true;
            $('today-menu-checked').textContent = '';
        }
        loading(true, Boolean($('today-menu-cards').querySelector('.meal-card')));
        $('today-menu-panel').setAttribute('aria-busy','true');
        $('today-menu-empty').hidden = true;
        try {
            const data = await requestMenu(date);
            if (id !== requestId || date !== selected()) return;
            if (validMenu(data,date)) render(data);
            else empty(data.message);
            shownDate = date;
        } catch (error) {
            if (id !== requestId) return;
            empty(error.name === 'TimeoutError' || error.name === 'AbortError' ? '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.' : error.message === 'Failed to fetch' ? '인터넷 연결을 확인한 뒤 다시 시도해 주세요.' : error.message);
        } finally {
            if (id !== requestId) return;
            loading(false);
            $('today-menu-panel').setAttribute('aria-busy','false');
        }
    }
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
    // Empty/unpublished meals leave most of the viewport as body background.
    // Accept that background too, while keeping navigation and overlays independent.
    window.ShiftUI?.bindMonthSwipe(document.body,$('today-menu-panel'),changeDate,{
        decorateTarget:false,
        enabled:event=>document.body.dataset.view==='menu'
            && !document.querySelector('dialog[open],.modal-overlay.active')
            && !event.target.closest('.bottom-nav,.app-header,#lost-found-dialog,#commute-dialog')
    });
    window.TodayMenu = {load,changeDate,title};
})();
