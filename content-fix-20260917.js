/*
  Museo Bacterias Púrpura — loader for content fixes + persistent controls onboarding.
  Keeps the existing reviewed content patch intact and adds a closable 10-second
  controls popup once the museum has finished loading.
*/
(() => {
  const BASE_SCRIPT = './content-fix-base-20260917.js?v=2';
  const POPUP_DURATION = 10000;

  function installPopupStyles() {
    if (document.getElementById('controls-onboarding-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'controls-onboarding-popup-style';
    style.textContent = `
      #controls-onboarding-popup {
        position: fixed;
        inset: 0;
        z-index: 1450;
        display: grid;
        place-items: center;
        padding: 22px;
        box-sizing: border-box;
        background: rgba(24, 15, 28, 0.34);
        backdrop-filter: blur(4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity .28s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      }
      #controls-onboarding-popup.visible {
        opacity: 1;
        pointer-events: auto;
      }
      #controls-onboarding-popup .controls-popup-card {
        position: relative;
        width: min(650px, calc(100vw - 36px));
        padding: 20px 22px 16px;
        box-sizing: border-box;
        border: 1px solid rgba(74, 63, 51, 0.16);
        border-radius: 16px;
        background: rgba(250, 246, 240, 0.97);
        box-shadow: 0 22px 60px rgba(20, 12, 24, 0.28);
        color: #342c25;
      }
      #controls-onboarding-popup .controls-loading-guide {
        width: 100%;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }
      #controls-onboarding-popup .controls-guide-title {
        margin: 0 36px 16px;
        text-align: center;
        color: #6f368f;
        font-size: .70rem;
        font-weight: 800;
        letter-spacing: .20em;
      }
      #controls-onboarding-popup .controls-guide-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      #controls-onboarding-popup .controls-guide-card {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 14px;
        border-radius: 11px;
        background: rgba(255,255,255,.62);
        border: 1px solid rgba(74,63,51,.08);
      }
      #controls-onboarding-popup .controls-guide-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      #controls-onboarding-popup .controls-guide-kicker {
        color: #7d3fa8;
        font-size: .60rem;
        font-weight: 800;
        letter-spacing: .16em;
      }
      #controls-onboarding-popup .controls-guide-name {
        color: #342c25;
        font-size: .74rem;
        font-weight: 800;
        letter-spacing: .05em;
      }
      #controls-onboarding-popup .controls-guide-help {
        color: rgba(52,44,37,.66);
        font-size: .66rem;
        line-height: 1.35;
      }
      #controls-onboarding-popup .controls-popup-close {
        position: absolute;
        top: 10px;
        right: 12px;
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 50%;
        background: rgba(74,63,51,.08);
        color: #4a3f33;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        z-index: 2;
      }
      #controls-onboarding-popup .controls-popup-close:hover,
      #controls-onboarding-popup .controls-popup-close:focus-visible {
        background: rgba(125,63,168,.14);
        color: #6f368f;
      }
      #controls-onboarding-popup .controls-popup-close:focus-visible {
        outline: 2px solid #7d3fa8;
        outline-offset: 2px;
      }
      #controls-onboarding-popup .controls-popup-timer {
        height: 3px;
        margin-top: 14px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(74,63,51,.10);
      }
      #controls-onboarding-popup .controls-popup-timer::after {
        content: '';
        display: block;
        width: 100%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #7d3fa8, #4fe4dc);
        transform-origin: left center;
        animation: controls-popup-countdown ${POPUP_DURATION}ms linear forwards;
      }
      @keyframes controls-popup-countdown {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
      @media (max-width: 640px) {
        #controls-onboarding-popup { padding: 12px; }
        #controls-onboarding-popup .controls-popup-card {
          width: min(370px, calc(100vw - 24px));
          padding: 17px 14px 13px;
          max-height: calc(100vh - 24px);
          overflow-y: auto;
        }
        #controls-onboarding-popup .controls-guide-row {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        #controls-onboarding-popup .controls-guide-card {
          padding: 9px 10px;
          gap: 10px;
        }
        #controls-onboarding-popup .controls-guide-help { font-size: .62rem; }
      }
      @media (prefers-reduced-motion: reduce) {
        #controls-onboarding-popup,
        #controls-onboarding-popup .controls-popup-timer::after { transition: none; animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  let shown = false;
  let closeTimer = 0;

  function showControlsPopup() {
    if (shown) return;
    const loading = document.getElementById('loading-screen');
    const sourceGuide = loading && loading.querySelector('.controls-loading-guide');
    if (!sourceGuide) {
      window.setTimeout(showControlsPopup, 120);
      return;
    }

    shown = true;
    installPopupStyles();

    const popup = document.createElement('div');
    popup.id = 'controls-onboarding-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-label', (window.MUSEUM_LANGUAGE === 'es') ? 'Cómo moverse por el museo' : 'How to move around the museum');

    const card = document.createElement('div');
    card.className = 'controls-popup-card';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'controls-popup-close';
    close.setAttribute('aria-label', (window.MUSEUM_LANGUAGE === 'es') ? 'Cerrar' : 'Close');
    close.innerHTML = '&times;';

    const guide = sourceGuide.cloneNode(true);
    const timer = document.createElement('div');
    timer.className = 'controls-popup-timer';
    timer.setAttribute('aria-hidden', 'true');

    card.appendChild(close);
    card.appendChild(guide);
    card.appendChild(timer);
    popup.appendChild(card);
    document.body.appendChild(popup);

    const dismiss = () => {
      if (!popup.isConnected) return;
      window.clearTimeout(closeTimer);
      popup.classList.remove('visible');
      window.setTimeout(() => popup.remove(), 300);
      document.removeEventListener('keydown', onKeyDown);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') dismiss();
    };

    close.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKeyDown);
    window.requestAnimationFrame(() => popup.classList.add('visible'));
    closeTimer = window.setTimeout(dismiss, POPUP_DURATION);
  }

  function armPopup() {
    const loading = document.getElementById('loading-screen');
    if (!loading) {
      window.setTimeout(armPopup, 120);
      return;
    }

    const maybeShow = () => {
      if (loading.classList.contains('hidden')) {
        window.setTimeout(showControlsPopup, 250);
        return true;
      }
      return false;
    };

    if (maybeShow()) return;

    const observer = new MutationObserver(() => {
      if (maybeShow()) observer.disconnect();
    });
    observer.observe(loading, { attributes: true, attributeFilter: ['class'] });

    // Safety fallback in case the loading screen is hidden by another mechanism.
    window.setTimeout(() => {
      if (!shown && (loading.classList.contains('hidden') || getComputedStyle(loading).opacity === '0')) {
        observer.disconnect();
        showControlsPopup();
      }
    }, 8000);
  }

  const base = document.createElement('script');
  base.src = BASE_SCRIPT;
  base.onload = armPopup;
  base.onerror = () => console.error('[controls-popup] could not load base content-fix script');
  document.head.appendChild(base);
})();