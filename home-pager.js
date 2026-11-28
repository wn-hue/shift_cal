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
    let selected = -1;
    let frame;

    const pageIndex = id => panels.findIndex(panel => panel.id === id);
    const indexAtScroll = () => Math.max(0, Math.min(
        panels.length - 1, Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth))
    ));

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
        if (index === 0 && focused === previous) dots[index].focus();
        if (index === panels.length - 1 && focused === next) dots[index].focus();
        previous.disabled = index === 0;
        next.disabled = index === panels.length - 1;
    }

    function go(index, { smooth = true, focus = false } = {}) {
        if (index < 0 || index >= panels.length) return;
        // Focus jumps and non-adjacent jumps settle immediately.
        const animate = smooth && !motion.matches && !focus && Math.abs(index - selected) === 1;
        pager.scrollTo({ left: index * pager.clientWidth, behavior: animate ? 'smooth' : 'auto' });
        if (!animate) show(index);
        if (focus) panels[index].focus({ preventScroll: true });
    }

    function followHash() {
        const index = pageIndex(location.hash.slice(1));
        const defaultPanel = /^\/login(?:\.html|\/)?$/.test(location.pathname) ? pageIndex('login') : 0;
        go(index < 0 ? defaultPanel : index, { smooth: false });
        window.scrollTo(0, 0);
    }

    pager.classList.add('home-pager-ready');
    controls.hidden = false;
    followHash();

    pager.addEventListener('scroll', () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = undefined;
            show(indexAtScroll());
        });
    }, { passive: true });

    document.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href^="#"]');
        const id = link?.getAttribute('href').slice(1);
        const index = pageIndex(id);
        if (index < 0) return;
        event.preventDefault();
        // The account bridge also handles anchor links on shared-schedule entry pages.
        event.stopImmediatePropagation();
        const fragment = location.hash.slice(1);
        if (!fragment || pageIndex(fragment) >= 0) {
            if (fragment !== id) history.pushState(null, '', '#' + id);
        }
        go(index, { focus: true });
        window.scrollTo(0, 0);
    }, true);

    controls.addEventListener('click', event => {
        const dot = event.target.closest('[data-home-go]');
        if (dot) go(pageIndex(dot.dataset.homeGo));
    });
    previous.addEventListener('click', () => go(indexAtScroll() - 1));
    next.addEventListener('click', () => go(indexAtScroll() + 1));
    document.getElementById('main-content').addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey ||
            event.target.closest('input, textarea, select, [contenteditable]')) return;
        event.preventDefault();
        go(indexAtScroll() + (event.key === 'ArrowRight' ? 1 : -1));
    });
    window.addEventListener('hashchange', followHash);
    window.addEventListener('popstate', followHash);
    new ResizeObserver(() => {
        // Keep the current page aligned after a viewport or orientation change.
        pager.scrollTo({ left: selected * pager.clientWidth, behavior: 'auto' });
    }).observe(pager);
})();
