/* Browser calendars use spare viewport space; the installed test app retains its row size. */
(() => {
 'use strict';
 let frame = 0;
 const native = Boolean(window.webkit?.messageHandlers?.natbam);
 document.body.dataset.calendarHost = native ? 'native' : 'web';
 function fit() {
  frame = 0;
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const rows = Math.ceil(grid.children.length / 7);
  if (rows) grid.style.setProperty('--test-calendar-weeks', rows);
  if (document.body.dataset.prefTheme !== 'test' || native) { grid.style.removeProperty('height'); return; }
  if (document.body.dataset.view !== 'calendar' || document.querySelector('#modal-override.active')) return;
  const viewport = window.visualViewport;
  // Zoom and the keyboard must not resize all of the calendar rows.
  if (viewport && Math.abs(viewport.scale - 1) > .01) return;
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  if (!rows) return;
  const top = grid.getBoundingClientRect().top + window.scrollY;
  const bottom = Math.min(nav.getBoundingClientRect().top, viewport?.height || innerHeight);
  const height = Math.max(rows * 96, bottom - top - 12);
  grid.style.height = Math.round(height) + 'px';
 }
 function schedule() { if (!frame) frame = requestAnimationFrame(fit); }
 window.TestCalendar = {schedule};
 window.addEventListener('resize', schedule);
 window.addEventListener('pageshow', schedule);
 window.addEventListener('orientationchange', schedule);
 document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
 window.visualViewport?.addEventListener('resize', schedule);
 document.fonts?.ready.then(schedule);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-pref-theme','data-view']});
 const overlay = document.getElementById('modal-override');
 if (overlay) new MutationObserver(schedule).observe(overlay,{attributes:true,attributeFilter:['class']});
 if (window.ResizeObserver) {
  const observer = new ResizeObserver(schedule);
  for (const element of document.querySelectorAll('.reference-header,.bottom-nav,#first-use-guide')) observer.observe(element);
 }
 schedule();
})();
