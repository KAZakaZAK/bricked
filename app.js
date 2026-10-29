(() => {
  'use strict';

  const KEY = 'brick.v1';
  const EMERGENCY_SECONDS = 60;
  const ARMING_MS = 800;

  const $ = (id) => document.getElementById(id);
  const el = {
    app: $('app'), state: $('state'), hint: $('hint'),
    timerLabel: $('timerLabel'), timerValue: $('timerValue'),
    minLock: $('minLock'), firewall: $('firewall'),
    cta: $('cta'), note: $('note'), emergency: $('emergency'),
  };

  const defaults = { state: 'unlocked', since: null, until: null, minutes: 0, firewall: true };
  let s = load();
  let arming = false;
  let message = '';
  let emergencyLeft = null;
  let emergencyTimer = null;

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

  // ---- State changes ----
  function brick(minutes = s.minutes) {
    s.state = 'bricked';
    s.since = Date.now();
    s.until = minutes > 0 ? Date.now() + minutes * 60000 : null;
    message = '';
    save(); render();
  }

  function unbrick() {
    s.state = 'unlocked';
    s.since = null;
    s.until = null;
    stopEmergency();
    save(); render();
  }

  function tap() {
    if (arming) return;
    if (s.state === 'bricked') {
      if (s.until && s.until > Date.now()) {
        message = `Locked for ${fmt((s.until - Date.now()) / 1000)} more.`;
        render();
        return;
      }
      unbrick();
      return;
    }
    arming = true;
    message = '';
    render();
    setTimeout(() => { arming = false; brick(); }, ARMING_MS);
  }

  // ---- Emergency unlock (lost tag) ----
  function toggleEmergency() {
    if (emergencyLeft !== null) { stopEmergency(); render(); return; }
    emergencyLeft = EMERGENCY_SECONDS;
    emergencyTimer = setInterval(() => {
      emergencyLeft -= 1;
      if (emergencyLeft <= 0) { unbrick(); message = 'Emergency unlock used.'; render(); }
      else render();
    }, 1000);
    render();
  }
  function stopEmergency() {
    clearInterval(emergencyTimer);
    emergencyTimer = null;
    emergencyLeft = null;
  }

  // ---- Deep links from Shortcuts: ?state=bricked&min=90  /  ?state=unlocked ----
  function applyParams() {
    const p = new URLSearchParams(location.search);
    const st = p.get('state');
    if (st === 'bricked') {
      const min = parseInt(p.get('min') || '', 10);
      if (s.state !== 'bricked') brick(Number.isFinite(min) ? min : s.minutes);
    } else if (st === 'unlocked') {
      unbrick();
    }
    if (st) history.replaceState(null, '', location.pathname);
  }

  // ---- Rendering ----
  function phase() { return arming ? 'arming' : s.state; }

  function render() {
    const ph = phase();
    el.app.dataset.state = ph;
    el.state.textContent = { unlocked: 'UNLOCKED', arming: 'ARMING', bricked: 'BRICKED' }[ph];
    el.hint.textContent = {
      unlocked: 'Tap the tag to brick this phone',
      arming: 'Running BRICK protocol',
      bricked: 'Tap the tag again to unlock',
    }[ph];

    el.cta.textContent = {
      unlocked: 'Arm tag and run BRICK protocol',
      arming: 'Arming',
      bricked: 'Release BRICK protocol',
    }[ph];
    el.cta.disabled = ph === 'arming';

    el.minLock.value = String(s.minutes);
    el.minLock.disabled = s.state === 'bricked' || arming;
    el.firewall.setAttribute('aria-checked', String(s.firewall));

    el.note.textContent = message || (s.state === 'bricked'
      ? 'Restrictions are enforced by iOS Focus and Shortcuts.'
      : 'Starts a background automation. Tap the tag to run it, no confirmation prompt.');

    el.emergency.hidden = s.state !== 'bricked';
    el.emergency.textContent = emergencyLeft === null
      ? 'Emergency unlock'
      : `Unlocking in ${emergencyLeft}s, tap to cancel`;

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
      label = 'MIN LOCK';
      value = s.minutes > 0 ? fmt(s.minutes * 60) : '--:--:--';
    }
    el.timerLabel.textContent = label;
    el.timerValue.textContent = value;
  }

  // ---- Events ----
  el.cta.addEventListener('click', tap);
  el.emergency.addEventListener('click', toggleEmergency);
  el.minLock.addEventListener('change', () => { s.minutes = parseInt(el.minLock.value, 10) || 0; save(); render(); });
  el.firewall.addEventListener('click', () => { s.firewall = !s.firewall; save(); render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); } });
  window.addEventListener('pageshow', render);

  applyParams();
  render();
  setInterval(tick, 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
