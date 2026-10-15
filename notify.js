(function () {
  var POLL_MS = 6000;
  var nav = document.querySelector('.nav');
  if (!nav) return;

  var baseTitle = document.title;
  var lastId = null;           // newest notification already seen
  var data = { unread: 0, notifications: [] };
  var timer = null;
  var pushChecked = false;
  var push = { state: 'unsupported', key: null, busy: false, note: '' };

  // ---------- styles (use each page's own colours) ----------
  var css =
    '.ig-bell{position:relative;flex:none;width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--text);display:none;place-items:center;cursor:pointer;padding:0;transition:transform .15s}' +
    '.ig-bell.show{display:grid}.ig-bell:active{transform:scale(.94)}' +
    '.ig-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ff3b30;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;box-sizing:border-box}' +
    '.ig-badge.on{display:flex}' +
    '.ig-panel{position:fixed;top:62px;right:12px;width:min(360px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.18);z-index:200;opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .2s,transform .2s;font-family:inherit}' +
    '.ig-panel.on{opacity:1;transform:none;pointer-events:auto}' +
    '.ig-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px}' +
    '.ig-head b{font-size:15px}' +
    '.ig-link{border:0;background:none;color:var(--accent);font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0}' +
    '.ig-item{display:flex;gap:10px;padding:12px 16px;border-top:1px solid var(--line);cursor:pointer}' +
    '.ig-dot{flex:none;width:8px;height:8px;border-radius:50%;margin-top:6px;background:transparent}' +
    '.ig-item.unread .ig-dot{background:var(--accent)}' +
    '.ig-title{font-size:14px;font-weight:600}' +
    '.ig-body{font-size:13px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}' +
    '.ig-time{font-size:11px;color:var(--muted);margin-top:4px}' +
    '.ig-empty{padding:28px 16px;text-align:center;color:var(--muted);font-size:14px;border-top:1px solid var(--line)}' +
    '.ig-ask{padding:0 16px 12px}' +
    '.ig-ask .ig-body{margin:0 0 6px}' +
    '.ig-toasts{position:fixed;top:68px;right:12px;width:min(340px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;z-index:300;pointer-events:none}' +
    '.ig-toast{pointer-events:auto;cursor:pointer;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:16px;padding:12px 14px;box-shadow:0 12px 40px rgba(0,0,0,.2);animation:igin .3s cubic-bezier(.4,0,.2,1);transition:opacity .25s,transform .25s}' +
    '.ig-toast.out{opacity:0;transform:translateY(-6px)}' +
    '@keyframes igin{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;   // textContent keeps content safe from code injection
    return e;
  }

  function ago(s) {
    var d = new Date(String(s).replace(' ', 'T') + 'Z');
    var m = Math.round((Date.now() - d) / 60000);
    if (isNaN(m)) return '';
    if (m < 1) return 'Just now';
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      keepalive: true
    });
  }

  // ---------- the bell and panel ----------
  var bell = el('button', 'ig-bell');
  bell.setAttribute('aria-label', 'Notifications');
  bell.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  var badge = el('span', 'ig-badge');
  bell.appendChild(badge);
  nav.appendChild(bell);

  var panel = el('div', 'ig-panel');
  var head = el('div', 'ig-head');
  head.appendChild(el('b', '', 'Notifications'));
  var markAll = el('button', 'ig-link', 'Mark all read');
  head.appendChild(markAll);
  var ask = el('div', 'ig-ask');
  var list = el('div');
  panel.appendChild(head);
  panel.appendChild(ask);
  panel.appendChild(list);
  document.body.appendChild(panel);

  var toasts = el('div', 'ig-toasts');
  document.body.appendChild(toasts);

  function go(x) {
    post('/api/notifications/read', { id: x.id });
    if (x.link && x.link.charAt(0) === '/' && x.link.charAt(1) !== '/') {
      location.href = x.link;
    }
  }

  // ---------- device alerts (Web Push) ----------
  function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function b64ToBytes(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function getRegistration() {
    return navigator.serviceWorker.register('/sw.js').then(function () {
      return navigator.serviceWorker.ready;
    });
  }

  function sendSubscription(sub) {
    return post('/api/push/subscribe', sub.toJSON()).then(function (r) {
      if (!r.ok) throw new Error('subscribe failed');
    });
  }

  // Works out whether alerts are on for this device, and keeps the server in sync
  function refreshPush() {
    if (!pushSupported()) { push.state = 'unsupported'; render(); return Promise.resolve(); }

    return fetch('/api/push/key')
      .then(function (r) { return r.json(); })
      .then(function (k) {
        if (!k.enabled) { push.state = 'unsupported'; return; }
        push.key = k.key;
        if (Notification.permission === 'denied') { push.state = 'blocked'; return; }

        return getRegistration().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (sub) {
            if (!sub || Notification.permission !== 'granted') { push.state = 'off'; return; }
            // Re-link this device to the current login (also repairs a reset database)
            return sendSubscription(sub).then(
              function () { push.state = 'on'; },
              function () { push.state = 'off'; }
            );
          });
        });
      })
      .catch(function () {})
      .then(render);
  }

  function enablePush() {
    if (push.busy) return;
    push.busy = true;
    push.note = '';
    Notification.requestPermission()
      .then(function (perm) {
        if (perm !== 'granted') return;
        return getRegistration().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (existing) {
            return existing || reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64ToBytes(push.key)
            });
          });
        }).then(sendSubscription);
      })
      .catch(function () { push.note = 'Could not turn on alerts on this device.'; })
      .then(function () { push.busy = false; return refreshPush(); });
  }

  function disablePush() {
    getRegistration()
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (!sub) return;
        return post('/api/push/unsubscribe', { endpoint: sub.endpoint }).then(function () {
          return sub.unsubscribe();
        });
      })
      .catch(function () {})
      .then(refreshPush);
  }

  function render() {
    var n = data.unread;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.className = 'ig-badge' + (n ? ' on' : '');
    document.title = (n ? '(' + n + ') ' : '') + baseTitle;
    markAll.style.display = n ? '' : 'none';

    ask.textContent = '';
    if (push.state === 'off') {
      var on = el('button', 'ig-link', 'Turn on alerts on this device');
      on.onclick = enablePush;
      ask.appendChild(on);
    } else if (push.state === 'on') {
      ask.appendChild(el('div', 'ig-body', 'Alerts are on for this device.'));
      var off = el('button', 'ig-link', 'Turn off');
      off.onclick = disablePush;
      ask.appendChild(off);
    } else if (push.state === 'blocked') {
      ask.appendChild(el('div', 'ig-body', 'Alerts are blocked for this site. Allow notifications in your browser settings to turn them on.'));
    }
    if (push.note) ask.appendChild(el('div', 'ig-body', push.note));

    list.textContent = '';
    if (!data.notifications.length) {
      list.appendChild(el('div', 'ig-empty', 'No notifications yet.'));
    }
    data.notifications.forEach(function (x) {
      var row = el('div', 'ig-item' + (x.read ? '' : ' unread'));
      row.appendChild(el('span', 'ig-dot'));
      var text = el('div');
      text.appendChild(el('div', 'ig-title', x.title));
      if (x.body) text.appendChild(el('div', 'ig-body', x.body));
      text.appendChild(el('div', 'ig-time', ago(x.created_at)));
      row.appendChild(text);
      row.onclick = function () { go(x); };
      list.appendChild(row);
    });
  }

  function togglePanel(force) {
    var on = typeof force === 'boolean' ? force : !panel.classList.contains('on');
    panel.classList.toggle('on', on);
  }
  bell.onclick = function (e) { e.stopPropagation(); togglePanel(); };
  panel.onclick = function (e) { e.stopPropagation(); };
  document.addEventListener('click', function () { togglePanel(false); });

  markAll.onclick = function () {
    post('/api/notifications/read', {}).then(poll);
  };

  // ---------- pop-ups ----------
  function toast(x) {
    var t = el('div', 'ig-toast');
    t.appendChild(el('div', 'ig-title', x.title));
    if (x.body) t.appendChild(el('div', 'ig-body', x.body));
    t.onclick = function () { go(x); };
    toasts.appendChild(t);
    while (toasts.children.length > 3) toasts.removeChild(toasts.firstChild);
    setTimeout(function () {
      if (!t.parentNode) return;
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }, 7000);
  }

  // ---------- checking for new notifications ----------
  function poll() {
    fetch('/api/notifications')
      .then(function (r) {
        if (r.status === 401) {          // logged out: nothing to show, stop checking
          clearInterval(timer);
          return null;
        }
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.notifications) return;
        data = j;
        bell.classList.add('show');
        render();

        if (!pushChecked) { pushChecked = true; refreshPush(); }

        var maxId = 0;
        j.notifications.forEach(function (x) { if (x.id > maxId) maxId = x.id; });

        // First check only records what already exists, so old ones don't pop up
        if (lastId === null) { lastId = maxId; return; }

        var fresh = j.notifications.filter(function (x) { return x.id > lastId && !x.read; }).reverse();
        lastId = Math.max(lastId, maxId);

        // With device alerts on, the system notification covers it
        if (push.state !== 'on') fresh.forEach(toast);
      })
      .catch(function () {});
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  timer = setInterval(poll, POLL_MS);
  poll();
})();