(() => {
    'use strict';

    const pager = document.getElementById('home-pager');
    const controls = document.querySelector('.home-pager-controls');
    if (!pager || !controls) return;
    const panels = [...pager.querySelectorAll('[data-home-page]')];
    const dots = [...controls.querySelectorAll('[data-home-go]')];
    const previous = document.getElementById('home-pager-prev');
    const next = document.getElementById('home-pager-next');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pageIndex = id => panels.findIndex(panel => panel.id === id);
    const indexAtScroll = () => Math.max(0, Math.min(
        panels.length - 1, Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth))
    ));

    let selected = -1;
    let entryIndex = -1;
    let destination = null;
    let settleTimer;
    let width = pager.clientWidth;

    function show(index) {
        if (selected === index) return;
        selected = index;
        const focused = document.activeElement;
        if (panels.some((panel, page) => page !== index && panel.contains(focused))) {
            panels[index].inert = false;
            panels[index].focus({ preventScroll: true });
        }
        panels.forEach((panel, page) => { panel.inert = page !== index; });
        dots.forEach((dot, page) => {
            if (page === index) dot.setAttribute('aria-current', 'step');
            else dot.removeAttribute('aria-current');
        });
        if (index === 0 && focused === previous) dots[index].focus({ preventScroll: true });
        if (index === panels.length - 1 && focused === next) dots[index].focus({ preventScroll: true });
        previous.disabled = index === 0;
        next.disabled = index === panels.length - 1;
    }

    function remember(index) {
        if (entryIndex === index) return;
        const id = panels[index].id;
        const url = new URL(location.href);
        // Shared schedules and account callbacks own their fragments.
        if (!url.hash || pageIndex(url.hash.slice(1)) >= 0) url.hash = id;
        history.pushState({ ...history.state, welcomePanel: id }, '', url);
        entryIndex = index;
    }

    function move(index, { animate = false, focus = false } = {}) {
        destination = index;
        const smooth = animate && !motion.matches && Math.abs(index - indexAtScroll()) === 1;
        pager.scrollTo({ left: index * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
        if (!smooth) destination = null;
        show(index);
        if (focus) panels[index].focus({ preventScroll: true });
    }

    function navigate(index, options) {
        if (index < 0 || index >= panels.length) return;
        remember(index);
        move(index, options);
    }

    function restore() {
        const query = new URLSearchParams(location.search);
        const isLogin = /^\/login(?:\.html|\/)?$/.test(location.pathname) ||
            query.get('login') === 'unavailable' ||
            ['apple', 'google'].some(provider => ['denied', 'error'].includes(query.get(provider)));
        const anchor = pageIndex(location.hash.slice(1));
        const saved = pageIndex(history.state?.welcomePanel);
        const fallback = isLogin ? pageIndex('login') : 0;
        entryIndex = anchor >= 0 ? anchor : saved >= 0 ? saved : fallback;
        move(entryIndex);
        window.scrollTo(0, 0);
    }

    function settle() {
        clearTimeout(settleTimer);
        const index = indexAtScroll();
        if (Math.abs(pager.scrollLeft - index * pager.clientWidth) > 1) return;
        if (destination !== null && destination !== index) return;
        destination = null;
        show(index);
        remember(index);
    }

    pager.classList.add('home-pager-ready');
    controls.hidden = false;
    restore();

    pager.addEventListener('scroll', () => {
        if (destination === null) show(indexAtScroll());
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 140);
    }, { passive: true });
    pager.addEventListener('scrollend', settle);
    for (const type of ['wheel', 'pointerdown', 'touchstart']) {
        pager.addEventListener(type, () => { destination = null; }, { passive: true });
    }

    document.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const id = link.getAttribute('href').slice(1);
        const index = pageIndex(id);
        const skip = id === 'main-content' && link.classList.contains('skip-link');
        if (index < 0 && !skip) return;
        event.preventDefault();
        // The account bridge also handles anchor links on shared-schedule entry pages.
        event.stopImmediatePropagation();
        const panel = panels[skip ? selected : index];
        panel.classList.toggle('focus-from-keyboard', event.detail === 0);
        if (skip) panels[selected].focus({ preventScroll: true });
        else navigate(index, { focus: true });
        window.scrollTo(0, 0);
    }, true);

    controls.addEventListener('click', event => {
        const dot = event.target.closest('[data-home-go]');
        if (dot) navigate(pageIndex(dot.dataset.homeGo), { animate: true });
    });
    previous.addEventListener('click', () => navigate(selected - 1, { animate: true }));
    next.addEventListener('click', () => navigate(selected + 1, { animate: true }));
    document.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.defaultPrevented ||
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
            event.target.closest('input, textarea, select, [contenteditable], [role="slider"], footer')) return;
        event.preventDefault();
        navigate(selected + (event.key === 'ArrowRight' ? 1 : -1), { animate: true });
    });
    window.addEventListener('hashchange', restore);
    window.addEventListener('popstate', restore);
    new ResizeObserver(() => {
        if (width === pager.clientWidth) return;
        width = pager.clientWidth;
        move(entryIndex);
    }).observe(pager);
})();
