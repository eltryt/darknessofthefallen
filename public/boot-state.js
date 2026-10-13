// Run before the first paint. Without JavaScript, the server overview stays visible.
document.documentElement.classList.add('site-booting');
// A broken module or a stalled request must not hide useful public content forever.
window.setTimeout(() => document.documentElement.classList.remove('site-booting'), 8000);
