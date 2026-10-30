(() => {
  'use strict';

  const KEY = 'brick.v1';
  const ARMING_MS = 800;
  const DURATIONS = [0, 30, 60, 120, 240, 480]; // minutes, 0 = no minimum

  const $ = (id) => document.getElementById(id);
  const el = {
    app: $('app'), state: $('state'), zone: $('zone'), addTime: $('addTime'),
    timerBtn: $('timerBtn'), timerLabel: $('timerLabel'), timerValue: $('timerValue'),
  };

  const defaults = { state: 'unlocked', since: null, until: null, minutes: 0 };
  let s = load();
  let arming = false;

  function load() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...defaults }; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
  }

  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (sec) => {
    sec = Math.max(0, Math.round(sec));
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
  };

  // ---- State changes (driven by the NFC shortcut through the link) ----
  function brick(minutes) {
    s.state = 'bricked';
    s.since = Date.now();
    s.until = minutes > 0 ? Date.now() + minutes * 60000 : null;
    save(); render();
  }

  function arm(minutes) {
    if (arming || s.state === 'bricked') return;
    arming = true;
    render();
    setTimeout(() => { arming = false; brick(minutes); }, ARMING_MS);
  }

  function unbrick() {
    arming = false;
    s.state = 'unlocked';
    s.since = null;
    s.until = null;
    save(); render();
  }

  // Shortcut links: ?state=bricked&min=90   or   ?state=unlocked
  function applyParams() {
    const p = new URLSearchParams(location.search);
    const st = p.get('state');
    if (st === 'bricked') {
      const min = parseInt(p.get('min') || '', 10);
      arm(Number.isFinite(min) ? min : s.minutes);
    } else if (st === 'unlocked') {
      unbrick();
    }
    if (st) history.replaceState(null, '', location.pathname);
  }

  // ---- Rendering ----
  function render() {
    const ph = arming ? 'arming' : s.state;
    el.app.dataset.state = ph;
    el.state.textContent = { unlocked: 'UNLOCKED', arming: 'ARMING', bricked: 'BRICKED' }[ph];
    el.zone.textContent = ph === 'bricked' ? 'You\u2019re in the fuckin\u2019 zone' : 'Get in the pocket';
    el.addTime.hidden = s.state !== 'bricked';
    el.timerBtn.disabled = s.state === 'bricked' || arming;
    tick();
  }

  function tick() {
    const now = Date.now();
    let label, value;
    if (s.state === 'bricked') {
      if (s.until) {
        const rem = (s.until - now) / 1000;
        label = rem > 0 ? 'FOCUS REMAINING' : 'READY TO UNLOCK';
        value = fmt(rem);
      } else {
        label = 'TIME BRICKED';
        value = fmt((now - (s.since || now)) / 1000);
      }
    } else {
      label = 'LOCK TIMER';
      value = s.minutes > 0 ? fmt(s.minutes * 60) : '--:--:--';
    }
    el.timerLabel.textContent = label;
    el.timerValue.textContent = value;
  }

  // Tap the timer while unlocked to cycle the minimum lock time.
  el.timerBtn.addEventListener('click', () => {
    if (s.state === 'bricked' || arming) return;
    s.minutes = DURATIONS[(DURATIONS.indexOf(s.minutes) + 1) % DURATIONS.length];
    save(); render();
  });

  // Extend the lock by 30 minutes. Counts from the current end, or from now if it has passed or none was set.
  el.addTime.addEventListener('click', () => {
    if (s.state !== 'bricked') return;
    const now = Date.now();
    s.until = Math.max(s.until || 0, now) + 30 * 60000;
    save(); render();
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  window.addEventListener('pageshow', render);

  applyParams();
  render();
  setInterval(tick, 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
