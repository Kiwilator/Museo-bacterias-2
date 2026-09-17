/* Controls tutorial: visible during loading via content-fix-base, then 7s more in the museum. */
(() => {
  const DURATION = 7000;
  const isSpanish = (window.MUSEUM_LANGUAGE || 'en') === 'es';
  const isMobile = !!window.MUSEO_IS_MOBILE;
  let shown = false;

  const copy = isSpanish ? {
    title: 'CÓMO MOVERTE', move: 'MOVERSE', look: 'MIRAR',
    keys: 'WASD O FLECHAS', mouse: 'CLIC + ARRASTRAR',
    keysHelp: 'Usa WASD o las flechas del teclado',
    mouseHelp: 'Mantén pulsado el botón izquierdo y arrastra',
    joystick: 'JOYSTICK', swipe: 'DESLIZAR',
    joystickHelp: 'Mueve el joystick para desplazarte',
    swipeHelp: 'Desliza el dedo para mirar alrededor', close: 'Cerrar'
  } : {
    title: 'HOW TO MOVE', move: 'MOVE', look: 'LOOK',
    keys: 'WASD OR ARROW KEYS', mouse: 'CLICK + DRAG',
    keysHelp: 'Use WASD or the arrow keys',
    mouseHelp: 'Hold the left mouse button and drag',
    joystick: 'JOYSTICK', swipe: 'SWIPE',
    joystickHelp: 'Move the joystick to walk around',
    swipeHelp: 'Swipe to look around', close: 'Close'
  };

  function installStyles() {
    if (document.getElementById('controls-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'controls-popup-style';
    style.textContent = `
      #controls-popup {
        position: fixed; inset: 0; z-index: 5000;
        display: grid; place-items: center; padding: 20px; box-sizing: border-box;
        background: rgba(22,14,28,.36); backdrop-filter: blur(5px);
        opacity: 0; pointer-events: none; transition: opacity .25s ease;
        font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
      }
      #controls-popup.visible { opacity: 1; pointer-events: auto; }
      #controls-popup .controls-popup-card {
        position: relative; width: min(720px, calc(100vw - 44px));
        padding: 22px 24px 18px; box-sizing: border-box;
        border-radius: 16px; border: 1px solid rgba(74,63,51,.16);
        background: rgba(250,246,240,.98); box-shadow: 0 24px 70px rgba(20,12,24,.30);
        color: #342c25;
      }
      #controls-popup .controls-popup-title {
        margin: 0 42px 18px; text-align: center; color: #6f368f;
        font-size: .72rem; line-height: 1.2; font-weight: 800; letter-spacing: .20em;
      }
      #controls-popup .controls-popup-row {
        display: grid; grid-template-columns: 1fr 1fr; gap: 22px;
      }
      #controls-popup .controls-popup-section {
        min-width: 0; min-height: 158px; display: flex; align-items: center;
        gap: 22px; padding: 14px 16px; box-sizing: border-box;
        border-radius: 11px; border: 1px solid rgba(74,63,51,.08);
        background: rgba(255,255,255,.68);
      }
      #controls-popup .controls-popup-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
      #controls-popup .controls-popup-kicker { color: #7d3fa8; font-size: .60rem; font-weight: 800; letter-spacing: .16em; }
      #controls-popup .controls-popup-name { color: #342c25; font-size: .76rem; font-weight: 800; letter-spacing: .04em; }
      #controls-popup .controls-popup-help { color: rgba(52,44,37,.66); font-size: .66rem; line-height: 1.4; }
      #controls-popup .controls-popup-close {
        position: absolute; top: 10px; right: 12px; width: 32px; height: 32px;
        display: grid; place-items: center; border: 0; border-radius: 50%;
        background: rgba(74,63,51,.08); color: #4a3f33; font-size: 20px; line-height: 1;
        cursor: pointer; z-index: 2;
      }
      #controls-popup .controls-popup-close:hover { background: rgba(125,63,168,.15); color: #6f368f; }
      #controls-popup .controls-popup-timer {
        height: 3px; margin-top: 15px; overflow: hidden; border-radius: 999px;
        background: rgba(74,63,51,.10);
      }
      #controls-popup .controls-popup-timer span {
        display: block; width: 100%; height: 100%; border-radius: inherit;
        background: linear-gradient(90deg,#7d3fa8,#4fe4dc); transform-origin: left center;
        animation: controls-popup-countdown ${DURATION}ms linear forwards;
      }

      /* Desktop keyboard visual: deliberately separated so WASD and arrows do not touch. */
      .controls-demo-wrap { width: 128px; height: 138px; flex: 0 0 128px; position: relative; }
      .controls-demo-keys {
        position: absolute; left: 15px; top: 0; width: 98px;
        display: grid; grid-template-columns: repeat(3,30px); grid-template-rows: repeat(2,30px); gap: 4px;
      }
      .controls-demo-key {
        width: 30px; height: 30px; display: grid; place-items: center; box-sizing: border-box;
        border: 1px solid rgba(74,63,51,.28); border-radius: 6px; background: rgba(255,255,255,.84);
        color: #41372e; font-size: .68rem; font-weight: 800; box-shadow: 0 2px 0 rgba(74,63,51,.12);
        animation: controls-key-pulse 2.8s ease-in-out infinite;
      }
      .controls-demo-key.w { grid-column: 2; grid-row: 1; }
      .controls-demo-key.a { grid-column: 1; grid-row: 2; animation-delay: .35s; }
      .controls-demo-key.s { grid-column: 2; grid-row: 2; animation-delay: .70s; }
      .controls-demo-key.d { grid-column: 3; grid-row: 2; animation-delay: 1.05s; }
      .controls-demo-arrows {
        position: absolute; left: 24px; top: 82px; width: 80px;
        display: grid; grid-template-columns: repeat(3,24px); grid-template-rows: repeat(2,24px); gap: 3px;
        opacity: .68;
      }
      .controls-demo-arrows .controls-demo-key { width: 24px; height: 24px; font-size: .62rem; }
      .controls-demo-arrows .up { grid-column: 2; grid-row: 1; }
      .controls-demo-arrows .left { grid-column: 1; grid-row: 2; animation-delay: .35s; }
      .controls-demo-arrows .down { grid-column: 2; grid-row: 2; animation-delay: .70s; }
      .controls-demo-arrows .right { grid-column: 3; grid-row: 2; animation-delay: 1.05s; }

      .controls-mouse-demo { width: 124px; height: 116px; flex: 0 0 124px; position: relative; display: grid; place-items: center; }
      .controls-mouse-shape {
        width: 40px; height: 60px; position: relative; border: 2px solid rgba(65,55,46,.72);
        border-radius: 21px; background: rgba(255,255,255,.74); animation: controls-mouse-drag 2.4s ease-in-out infinite;
      }
      .controls-mouse-shape::before { content:''; position:absolute; left:50%; top:0; width:1px; height:23px; background:rgba(65,55,46,.34); }
      .controls-mouse-shape::after {
        content:''; position:absolute; left:7px; top:7px; width:12px; height:17px;
        border-radius:8px 4px 5px 4px; background:#7d3fa8; animation:controls-click 2.4s ease-in-out infinite;
      }
      .controls-drag-arrows { position:absolute; left:0; right:0; bottom:2px; text-align:center; color:#7d3fa8; font-size:1.2rem; letter-spacing:.16em; }

      .controls-mobile-joystick { width:92px; height:92px; flex:0 0 92px; position:relative; border:1px solid rgba(74,63,51,.22); border-radius:50%; background:rgba(255,255,255,.62); }
      .controls-mobile-joystick::after { content:''; position:absolute; width:38px; height:38px; left:26px; top:26px; border-radius:50%; background:rgba(125,63,168,.76); animation:controls-joystick 2.2s ease-in-out infinite; }
      .controls-mobile-swipe { width:100px; height:84px; flex:0 0 100px; display:grid; place-items:center; color:#7d3fa8; font-size:2rem; animation:controls-swipe 2.2s ease-in-out infinite; }

      @keyframes controls-popup-countdown { from { transform:scaleX(1); } to { transform:scaleX(0); } }
      @keyframes controls-key-pulse { 0%,72%,100% { transform:translateY(0); background:rgba(255,255,255,.84); } 10%,28% { transform:translateY(2px); background:rgba(125,63,168,.13); } }
      @keyframes controls-mouse-drag { 0%,18%,100% { transform:translateX(-17px); } 55%,72% { transform:translateX(17px); } }
      @keyframes controls-click { 0%,12%,82%,100% { opacity:.42; transform:scale(1); } 20%,68% { opacity:1; transform:scale(.86); } }
      @keyframes controls-joystick { 0%,100% { transform:translate(0,0); } 25% { transform:translate(0,-16px); } 50% { transform:translate(15px,0); } 75% { transform:translate(-15px,0); } }
      @keyframes controls-swipe { 0%,100% { transform:translateX(-14px); opacity:.55; } 50% { transform:translateX(14px); opacity:1; } }

      @media (max-width: 640px) {
        #controls-popup { padding: 12px; }
        #controls-popup .controls-popup-card { width:min(370px,calc(100vw - 24px)); padding:18px 14px 14px; max-height:calc(100vh - 24px); overflow-y:auto; }
        #controls-popup .controls-popup-row { grid-template-columns:1fr; gap:8px; }
        #controls-popup .controls-popup-section { min-height:100px; padding:9px 10px; gap:10px; }
        #controls-popup .controls-popup-title { margin-bottom:12px; }
      }
      @media (prefers-reduced-motion: reduce) {
        #controls-popup, #controls-popup .controls-popup-timer span, .controls-demo-key,
        .controls-mouse-shape, .controls-mouse-shape::after, .controls-mobile-joystick::after,
        .controls-mobile-swipe { animation:none !important; transition:none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function keyboardVisual() {
    return `<div class="controls-demo-wrap" aria-hidden="true">
      <div class="controls-demo-keys">
        <span class="controls-demo-key w">W</span><span class="controls-demo-key a">A</span><span class="controls-demo-key s">S</span><span class="controls-demo-key d">D</span>
      </div>
      <div class="controls-demo-arrows">
        <span class="controls-demo-key up">↑</span><span class="controls-demo-key left">←</span><span class="controls-demo-key down">↓</span><span class="controls-demo-key right">→</span>
      </div>
    </div>`;
  }

  function mouseVisual() {
    return `<div class="controls-mouse-demo" aria-hidden="true"><div class="controls-mouse-shape"></div><div class="controls-drag-arrows">← →</div></div>`;
  }

  function showPopup() {
    if (shown || !document.body) return;
    shown = true;
    installStyles();

    const popup = document.createElement('div');
    popup.id = 'controls-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');

    const card = document.createElement('div');
    card.className = 'controls-popup-card';
    card.innerHTML = `<button class="controls-popup-close" type="button" aria-label="${copy.close}">&times;</button>
      <div class="controls-popup-title">${copy.title}</div>
      <div class="controls-popup-row">
        ${isMobile ? `
          <div class="controls-popup-section"><div class="controls-mobile-joystick" aria-hidden="true"></div><div class="controls-popup-copy"><span class="controls-popup-kicker">${copy.move}</span><span class="controls-popup-name">${copy.joystick}</span><span class="controls-popup-help">${copy.joystickHelp}</span></div></div>
          <div class="controls-popup-section"><div class="controls-mobile-swipe" aria-hidden="true">☝︎ ↔</div><div class="controls-popup-copy"><span class="controls-popup-kicker">${copy.look}</span><span class="controls-popup-name">${copy.swipe}</span><span class="controls-popup-help">${copy.swipeHelp}</span></div></div>` : `
          <div class="controls-popup-section">${keyboardVisual()}<div class="controls-popup-copy"><span class="controls-popup-kicker">${copy.move}</span><span class="controls-popup-name">${copy.keys}</span><span class="controls-popup-help">${copy.keysHelp}</span></div></div>
          <div class="controls-popup-section">${mouseVisual()}<div class="controls-popup-copy"><span class="controls-popup-kicker">${copy.look}</span><span class="controls-popup-name">${copy.mouse}</span><span class="controls-popup-help">${copy.mouseHelp}</span></div></div>`}
      </div>
      <div class="controls-popup-timer" aria-hidden="true"><span></span></div>`;

    popup.appendChild(card);
    document.body.appendChild(popup);

    let timer = 0;
    const close = card.querySelector('.controls-popup-close');
    const dismiss = () => {
      window.clearTimeout(timer);
      popup.classList.remove('visible');
      document.removeEventListener('keydown', onKey);
      window.setTimeout(() => popup.remove(), 280);
    };
    const onKey = (event) => { if (event.key === 'Escape') dismiss(); };
    close.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => requestAnimationFrame(() => popup.classList.add('visible')));
    timer = window.setTimeout(dismiss, DURATION);
  }

  function waitForMuseum() {
    const loading = document.getElementById('loading-screen');
    if (!loading) { window.setTimeout(waitForMuseum, 100); return; }

    const ready = () => loading.classList.contains('hidden') || getComputedStyle(loading).opacity === '0';
    if (ready()) { window.setTimeout(showPopup, 250); return; }

    const observer = new MutationObserver(() => {
      if (ready()) {
        observer.disconnect();
        window.setTimeout(showPopup, 250);
      }
    });
    observer.observe(loading, { attributes:true, attributeFilter:['class','style'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForMuseum, { once:true });
  else waitForMuseum();
})();

/* Keep the reactor control panel upright for the visitor. */
(() => {
  function fixReactorOrientation() {
    const model = document.getElementById('modelo');
    const comp = model && model.components && model.components['reactor-control'];
    const wrapper = comp && comp.wrapper && comp.wrapper.object3D;
    if (!wrapper) {
      window.setTimeout(fixReactorOrientation, 120);
      return;
    }
    if (wrapper.userData.reactorOrientationFixed) return;
    wrapper.rotateZ(Math.PI);
    wrapper.updateMatrixWorld(true);
    wrapper.userData.reactorOrientationFixed = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixReactorOrientation, { once:true });
  else fixReactorOrientation();
})();
