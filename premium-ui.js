// Adds a small "plan" card to the top of the artisan dashboard.
(function () {
  var wrap = document.querySelector('.wrap');
  var first = wrap && wrap.querySelector('section');
  if (!wrap || !first) return;

  fetch('/api/premium')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || j.error) return;

      var card = document.createElement('a');
      card.href = '/premium';
      card.style.cssText =
        'display:flex;align-items:center;gap:12px;margin-top:28px;padding:16px 20px;' +
        'background:var(--surface);border:1px solid var(--line);border-radius:20px;' +
        'box-shadow:var(--shadow);text-decoration:none;color:var(--text)';

      var text = document.createElement('div');
      text.style.cssText = 'flex:1;min-width:0';

      var title = document.createElement('div');
      title.style.cssText = 'font-size:15px;font-weight:600';

      var sub = document.createElement('div');
      sub.style.cssText = 'font-size:13px;color:var(--muted);margin-top:2px';

      var go = document.createElement('div');
      go.style.cssText = 'color:var(--accent);font-size:14px;font-weight:600;white-space:nowrap';

      if (j.premium) {
        title.textContent = 'Premium';
        sub.textContent = 'Active until ' + new Date(j.premium_until).toLocaleDateString(
          undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        go.textContent = 'Manage';
      } else {
        title.textContent = 'Free plan';
        sub.textContent = j.cap.enforced
          ? j.cap.used + ' of ' + j.cap.limit + ' accepted jobs used this month'
          : 'Get a Premium badge next to your name';
        go.textContent = 'See Premium';
      }

      text.appendChild(title);
      text.appendChild(sub);
      card.appendChild(text);
      card.appendChild(go);
      wrap.insertBefore(card, first);
    })
    .catch(function () {});
})();