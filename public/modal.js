(() => {
  const backdrop = document.getElementById('bookingModal');
  const shell = document.querySelector('.app-shell');
  let wasOpen = false, returnFocus = null;
  const controls = () => [...backdrop.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
  const focusFirst = () => (backdrop.querySelector('input:not([readonly]):not(:disabled)') || controls()[0])?.focus({ preventScroll: true });
  new MutationObserver(() => {
    const open = !backdrop.hidden;
    if (open && !wasOpen) returnFocus = document.activeElement;
    shell.inert = open;
    if (open && (!wasOpen || !backdrop.contains(document.activeElement))) focusFirst();
    if (!open && wasOpen && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    wasOpen = open;
  }).observe(backdrop, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  document.addEventListener('keydown', event => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); backdrop.hidden = true; }
    if (event.key !== 'Tab') return;
    const items = controls(), first = items[0], last = items.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !backdrop.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !backdrop.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
})();
