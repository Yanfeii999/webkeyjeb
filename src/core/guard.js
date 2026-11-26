let _tripped = false;
let _timerId = null;

function neutralizeReactDevTools() {
  try {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook && typeof hook === 'object') {
      for (const prop of Object.keys(hook)) {
        if (prop === 'renderers') {
          hook[prop] = new Map();
        } else if (typeof hook[prop] === 'function') {
          hook[prop] = () => {};
        }
      }
    }
  } catch {
    // ignore read-only hook errors
  }
}

function renderLockScreen() {
  try {
    sessionStorage.removeItem('jeb_admin_sess');
  } catch {
    // ignore storage errors
  }

  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f17;color:#e2e8f0;padding:24px;font-family:system-ui,-apple-system,sans-serif;">' +
      '<div style="max-width:440px;width:100%;background:#121826;border:1px solid rgba(244,63,94,0.35);border-radius:16px;padding:28px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.5);">' +
      '<div style="width:48px;height:48px;margin:0 auto 16px;border-radius:12px;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.35);display:flex;align-items:center;justify-content:center;color:#fb7185;font-weight:700;font-size:20px;">!</div>' +
      '<h1 style="margin:0 0 10px;font-size:18px;font-weight:700;color:#fb7185;">Truy cập bị tạm khóa</h1>' +
      '<p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">Truy cập bị tạm khóa — Vui lòng đóng công cụ kiểm tra (DevTools) và tải lại trang.</p>' +
      '</div></div>';
  }
}

export function initGuard(onTrip) {
  neutralizeReactDevTools();

  const trip = () => {
    if (_tripped) return;
    _tripped = true;
    if (_timerId !== null) {
      clearInterval(_timerId);
      _timerId = null;
    }
    try {
      if (typeof onTrip === 'function') onTrip();
    } catch {
      // ignore callback error
    }
    renderLockScreen();
  };

  document.addEventListener('contextmenu', (e) => {
    if (!e.target?.closest?.('[data-allow-copy="true"]')) {
      e.preventDefault();
    }
  });

  document.addEventListener('selectstart', (e) => {
    const el = e.target;
    if (
      el &&
      (el.closest?.('input, textarea, [data-allow-copy="true"]') ||
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA')
    ) {
      return;
    }
    e.preventDefault();
  });

  document.addEventListener('dragstart', (e) => {
    const el = e.target;
    if (
      el &&
      (el.closest?.('input, textarea, [data-allow-copy="true"]') ||
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA')
    ) {
      return;
    }
    e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const ctrlOrShiftIJC = e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k');
    const ctrlUSP = e.ctrlKey && (k === 'u' || k === 's' || k === 'p');
    const metaAlt = e.metaKey && e.altKey && (k === 'i' || k === 'j' || k === 'c' || k === 'u');

    if (e.key === 'F12' || ctrlOrShiftIJC || ctrlUSP || metaAlt) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  const checkDimensions = () => {
    if (_tripped) return;
    if (window.outerWidth > 0 && window.outerHeight > 0) {
      const dw = window.outerWidth - window.innerWidth;
      const dh = window.outerHeight - window.innerHeight;
      if (dw > 170 || dh > 170) {
        trip();
      }
    }
  };

  const checkDebuggerTiming = () => {
    if (_tripped) return;
    const t0 = performance.now();
    try {
      Function('debugger')();
    } catch {
      // ignore
    }
    if (performance.now() - t0 > 120) {
      trip();
    }
  };

  window.addEventListener('resize', checkDimensions);

  _timerId = setInterval(() => {
    neutralizeReactDevTools();
    checkDimensions();
    checkDebuggerTiming();
  }, 1200);
}
