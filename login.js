(() => {
  'use strict';

  const _w = window;
  const _d = document;
  const _store = 'ca.session.v2';
  const _hash = '204e41cf06200c7045e77a7169166509f3ab867925166579af179c9c832283f9';
  let _tripped = false;
  let _loading = null;

  const _enc = new TextEncoder();
  const _hex = buffer =>
    Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
  const _sleep = ms => new Promise(resolve => _w.setTimeout(resolve, ms));

  const _sha = async value => {
    if (!_w.crypto || !_w.crypto.subtle) {
      throw new Error('Secure crypto is unavailable.');
    }
    return _hex(await _w.crypto.subtle.digest('SHA-256', _enc.encode(value)));
  };

  const _same = (left, right) => {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
      diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
  };

  const _fingerprint = () => [_hash, location.origin, 'trusted-browser'].join(':');

  const _save = async () => {
    const now = Date.now();
    localStorage.setItem(_store, JSON.stringify({
      v: 2,
      t: now,
      m: await _sha(_fingerprint())
    }));
  };

  const _valid = async () => {
    try {
      const raw = localStorage.getItem(_store);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || saved.v !== 2 || typeof saved.t !== 'number' || typeof saved.m !== 'string') {
        return false;
      }
      return _same(saved.m, await _sha(_fingerprint()));
    } catch (_) {
      localStorage.removeItem(_store);
      return false;
    }
  };

  const _blank = () => {
    if (_tripped) return;
    _tripped = true;
    try {
      localStorage.removeItem(_store);
    } catch (_) {
      // Storage access can fail in hardened browser modes.
    }
    _d.documentElement.innerHTML = '<head><title></title><style>html,body{width:100%;height:100%;margin:0;background:#000;overflow:hidden;}</style></head><body></body>';
  };

  const _antiTamper = () => {
    _d.addEventListener('contextmenu', event => event.preventDefault(), true);
    _d.addEventListener('keydown', event => {
      const key = String(event.key || '').toLowerCase();
      const combo =
        event.key === 'F12' ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        ((event.ctrlKey || event.metaKey) && ['u', 's'].includes(key));

      if (!combo) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      _blank();
    }, true);

    const probe = () => {
      if (_tripped) return;
      const desktop = !_w.matchMedia('(pointer: coarse)').matches && Math.max(_w.screen.width, _w.screen.height) >= 900;
      if (!desktop) return;

      if ((_w.outerWidth - _w.innerWidth > 170) || (_w.outerHeight - _w.innerHeight > 170)) {
        _blank();
        return;
      }

      const start = performance.now();
      debugger;
      if (performance.now() - start > 140) _blank();
    };

    _w.setInterval(probe, 1800);
  };

  const _loadApp = () => {
    if (_loading) return _loading;
    _loading = new Promise((resolve, reject) => {
      const tag = _d.createElement('script');
      tag.src = 'app.js';
      tag.defer = true;
      tag.dataset.protectedApp = '1';
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('Unable to load protected app.'));
      _d.head.appendChild(tag);
    });
    return _loading;
  };

  const _grant = async () => {
    const shell = _d.getElementById('loginShell');
    const app = _d.getElementById('app');
    _d.body.classList.add('app-active');
    if (app) {
      app.hidden = false;
      app.style.display = 'block';
      app.setAttribute('aria-hidden', 'false');
    }
    await _loadApp();
    if (shell) shell.classList.add('is-hidden');
  };

  const _wire = () => {
    const form = _d.getElementById('loginForm');
    const input = _d.getElementById('passwordInput');
    const button = _d.getElementById('loginButton');
    const error = _d.getElementById('loginError');

    if (!form || !input || !button || !error) return;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      error.textContent = '';
      button.disabled = true;
      button.textContent = 'Signing in...';

      try {
        const [digest] = await Promise.all([
          _sha(input.value),
          _sleep(420 + Math.floor(Math.random() * 260))
        ]);

        if (!_same(digest, _hash)) {
          input.value = '';
          error.textContent = 'Incorrect password.';
          input.focus();
          return;
        }

        await _save();
        await _grant();
      } catch (_) {
        error.textContent = 'Unable to unlock on this browser.';
      } finally {
        button.disabled = false;
        button.textContent = 'Sign in';
      }
    });

    input.addEventListener('input', () => {
      error.textContent = '';
    });
  };

  const _boot = async () => {
    _antiTamper();
    _wire();

    if (await _valid()) {
      await _grant();
      return;
    }

    const input = _d.getElementById('passwordInput');
    if (input) input.focus({ preventScroll: true });
  };

  if (_d.readyState === 'loading') {
    _d.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})();
