/*
  Museo Bacterias Púrpura — content/image corrections from the reviewed
  museum-content document (2026-09-17).
  This file only corrects content mappings and source labels; it does not
  change the scene, GLBs, interactions or layout.
*/
(() => {
  const VERSION = '?v=20260917-content1';

  try {
    const content = (typeof museumContent !== 'undefined') ? museumContent : null;
    if (content) {
      // 01 · Rhodospirillum rubrum: keep only the R. rubrum PHA image.
      // The previous second image belonged to Rhodobacter capsulatus.
      if (content.bacteriaLarge01) {
        content.bacteriaLarge01.images = [
          './assets/images/pha-granules-tem.jpg' + VERSION
        ];
        content.bacteriaLarge01.imageSources = [
          { label: 'Own source · scientific team' }
        ];
      }

      // 02 · Blastochloris viridis: the source document shows both the
      // PDB 5M7J reaction centre and the Bayreuth electron micrograph.
      if (content.bacteriaSmall01) {
        content.bacteriaSmall01.images = [
          'https://www.ebi.ac.uk/pdbe/static/entry/5m7j_deposited_chain_front_image-800x800.png',
          './assets/images/blastochloris-viridis.png' + VERSION
        ];
        content.bacteriaSmall01.imageSources = [
          { label: 'Source: PDB 5M7J · PDBe', url: 'https://doi.org/10.2210/pdb5M7J/pdb' },
          { label: 'Source: University of Bayreuth', url: 'https://www.uni-bayreuth.de/press-releases/genetic-magnetization-of-living-bacteria' }
        ];
      }

      // Rhodovulum: use the SEM/EDS image corresponding to
      // Rhodovulum visakhapatnamense AB26, not the duplicated lab-device photo.
      if (content.bacteriaSmall04) {
        content.bacteriaSmall04.images = [
          './assets/images/electroactivity-electrode-sem.jpg' + VERSION
        ];
        content.bacteriaSmall04.imageSources = [
          {
            label: 'Source: ISME Journal (2021) · Rhodovulum visakhapatnamense AB26',
            url: 'https://doi.org/10.1038/s41396-021-01015-8'
          }
        ];
      }

      // NUTRIENTS: use the cultivation system / feed-lines image from the
      // supplied scientific material instead of the generic culture image.
      if (content.window03) {
        content.window03.images = [
          './assets/images/process-overview.jpg' + VERSION
        ];
        content.window03.imageSources = [
          { label: 'Own source · scientific team' }
        ];
      }

      // Rhodomicrobium: distinguish the museum animation from the microscopy
      // supplied by Arpita Bose's laboratory.
      if (content.bacteriaLarge02) {
        content.bacteriaLarge02.imageSources = [
          { label: 'Museum animation / own visualisation' },
          { label: 'Source: Arpita Bose laboratory' }
        ];
      }

      // Space-mission image comes from the original scientific material.
      if (content.spaceMission) {
        content.spaceMission.imageSources = [
          { label: 'Source: original scientific material' }
        ];
      }
    }
  } catch (error) {
    console.error('[content-fix] museum content patch failed', error);
  }

  try {
    const i18n = window.MUSEUM_I18N;
    const es = i18n && i18n.content && i18n.content.es;

    if (es) {
      if (es.bacteriaLarge01) {
        es.bacteriaLarge01.imageSources = [
          { label: 'Fuente propia · equipo científico' }
        ];
      }

      if (es.bacteriaSmall01) {
        es.bacteriaSmall01.imageSources = [
          { label: 'Fuente: PDB 5M7J · PDBe', url: 'https://doi.org/10.2210/pdb5M7J/pdb' },
          { label: 'Fuente: Universidad de Bayreuth', url: 'https://www.uni-bayreuth.de/press-releases/genetic-magnetization-of-living-bacteria' }
        ];
      }

      if (es.bacteriaSmall04) {
        es.bacteriaSmall04.imageSources = [
          {
            label: 'Fuente: ISME Journal (2021) · Rhodovulum visakhapatnamense AB26',
            url: 'https://doi.org/10.1038/s41396-021-01015-8'
          }
        ];
      }

      if (es.window03) {
        es.window03.imageSources = [
          { label: 'Fuente propia · equipo científico' }
        ];
      }

      if (es.bacteriaLarge02) {
        es.bacteriaLarge02.imageSources = [
          { label: 'Animación propia / visualización del museo' },
          { label: 'Fuente: laboratorio de Arpita Bose' }
        ];
      }

      if (es.spaceMission) {
        es.spaceMission.imageSources = [
          { label: 'Fuente: material científico original' }
        ];
      }
    }

    // Correct the species attached to the AB26 / ISME 2021 material in both
    // language versions of the credits/references.
    ['en', 'es'].forEach((lang) => {
      const references = i18n && i18n.credits && i18n.credits[lang] && i18n.credits[lang].references;
      if (!Array.isArray(references)) return;

      references.forEach((item) => {
        if (!item || typeof item.label !== 'string') return;
        item.label = item.label.replace(
          /Rhodovulum sulfidophilum AB26/g,
          'Rhodovulum visakhapatnamense AB26'
        );
      });
    });
  } catch (error) {
    console.error('[content-fix] i18n/source patch failed', error);
  }
})();

/*
  Controls onboarding — clearer keyboard/mouse instructions.
  The museum already supports both WASD and the four arrow keys; this layer
  makes that visible and adds a small animated guide while the museum loads.
*/
(() => {
  const isSpanish = (window.MUSEUM_LANGUAGE || document.documentElement.lang || 'en') === 'es';
  const isMobile = !!window.MUSEO_IS_MOBILE;

  const copy = isSpanish ? {
    guideTitle: 'CÓMO MOVERTE',
    move: 'MOVERSE',
    look: 'MIRAR',
    keyboard: 'WASD O FLECHAS',
    mouse: 'CLIC + ARRASTRAR',
    keyboardHelp: 'Usa WASD o las flechas del teclado',
    mouseHelp: 'Mantén pulsado el botón izquierdo y arrastra',
    mobileMove: 'JOYSTICK',
    mobileLook: 'DESLIZAR',
    mobileMoveHelp: 'Mueve el joystick para desplazarte',
    mobileLookHelp: 'Desliza el dedo para mirar alrededor'
  } : {
    guideTitle: 'HOW TO MOVE',
    move: 'MOVE',
    look: 'LOOK',
    keyboard: 'WASD OR ARROW KEYS',
    mouse: 'CLICK + DRAG',
    keyboardHelp: 'Use WASD or the arrow keys',
    mouseHelp: 'Hold the left mouse button and drag',
    mobileMove: 'JOYSTICK',
    mobileLook: 'SWIPE',
    mobileMoveHelp: 'Move the joystick to walk around',
    mobileLookHelp: 'Swipe to look around'
  };

  function addStyles() {
    if (document.getElementById('museum-controls-guide-style')) return;
    const style = document.createElement('style');
    style.id = 'museum-controls-guide-style';
    style.textContent = `
      #loading-screen .controls-loading-guide {
        width: min(620px, calc(100vw - 36px));
        margin-top: 4px;
        padding: 18px 20px 16px;
        box-sizing: border-box;
        border: 1px solid rgba(74, 63, 51, 0.16);
        border-radius: 14px;
        background: rgba(255, 252, 247, 0.58);
        box-shadow: 0 12px 34px rgba(74, 63, 51, 0.08);
      }
      #loading-screen .controls-guide-title {
        margin: 0 0 14px;
        text-align: center;
        color: #6f368f;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.20em;
      }
      #loading-screen .controls-guide-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }
      #loading-screen .controls-guide-card {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 14px;
        border-radius: 10px;
        background: rgba(255,255,255,0.38);
      }
      #loading-screen .controls-guide-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      #loading-screen .controls-guide-kicker {
        color: #7d3fa8;
        font-size: 0.60rem;
        font-weight: 800;
        letter-spacing: 0.16em;
      }
      #loading-screen .controls-guide-name {
        color: #342c25;
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.05em;
      }
      #loading-screen .controls-guide-help {
        color: rgba(52,44,37,0.64);
        font-size: 0.66rem;
        line-height: 1.35;
      }
      .controls-keyboard {
        width: 116px;
        flex: 0 0 116px;
        display: grid;
        grid-template-columns: repeat(3, 30px);
        grid-template-rows: repeat(2, 30px);
        gap: 5px;
        justify-content: center;
        align-content: center;
      }
      .controls-key {
        height: 30px;
        display: grid;
        place-items: center;
        box-sizing: border-box;
        border: 1px solid rgba(74,63,51,.28);
        border-radius: 6px;
        background: rgba(255,255,255,.72);
        color: #41372e;
        font-size: 0.68rem;
        font-weight: 800;
        box-shadow: 0 2px 0 rgba(74,63,51,.13);
        animation: controls-key-pulse 2.8s ease-in-out infinite;
      }
      .controls-key.key-w { grid-column: 2; grid-row: 1; animation-delay: 0s; }
      .controls-key.key-a { grid-column: 1; grid-row: 2; animation-delay: .35s; }
      .controls-key.key-s { grid-column: 2; grid-row: 2; animation-delay: .70s; }
      .controls-key.key-d { grid-column: 3; grid-row: 2; animation-delay: 1.05s; }
      .controls-arrows {
        position: absolute;
        width: 116px;
        height: 65px;
        pointer-events: none;
        transform: translateY(73px) scale(.76);
        transform-origin: top center;
        opacity: .62;
      }
      .controls-arrows .controls-key { position: absolute; width: 30px; }
      .controls-arrows .key-up { left: 43px; top: 0; }
      .controls-arrows .key-left { left: 8px; top: 35px; animation-delay: .35s; }
      .controls-arrows .key-down { left: 43px; top: 35px; animation-delay: .70s; }
      .controls-arrows .key-right { left: 78px; top: 35px; animation-delay: 1.05s; }
      .controls-keyboard-wrap {
        width: 116px;
        height: 116px;
        flex: 0 0 116px;
        position: relative;
        display: grid;
        place-items: start center;
      }
      .controls-mouse-demo {
        width: 116px;
        height: 96px;
        flex: 0 0 116px;
        position: relative;
        display: grid;
        place-items: center;
      }
      .controls-mouse {
        width: 38px;
        height: 58px;
        position: relative;
        border: 2px solid rgba(65,55,46,.72);
        border-radius: 20px;
        background: rgba(255,255,255,.62);
        animation: controls-mouse-drag 2.4s ease-in-out infinite;
      }
      .controls-mouse::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        width: 1px;
        height: 22px;
        background: rgba(65,55,46,.35);
      }
      .controls-mouse::after {
        content: '';
        position: absolute;
        left: 7px;
        top: 7px;
        width: 11px;
        height: 16px;
        border-radius: 8px 4px 5px 4px;
        background: #7d3fa8;
        animation: controls-click 2.4s ease-in-out infinite;
      }
      .controls-drag-line {
        position: absolute;
        left: 6px;
        right: 6px;
        bottom: 3px;
        text-align: center;
        color: rgba(125,63,168,.82);
        font-size: 1.1rem;
        letter-spacing: .12em;
      }
      .controls-mobile-demo {
        width: 92px;
        height: 92px;
        flex: 0 0 92px;
        position: relative;
        border: 1px solid rgba(74,63,51,.22);
        border-radius: 50%;
        background: rgba(255,255,255,.45);
      }
      .controls-mobile-demo::after {
        content: '';
        position: absolute;
        width: 38px;
        height: 38px;
        left: 26px;
        top: 26px;
        border-radius: 50%;
        background: rgba(125,63,168,.74);
        animation: controls-joystick 2.2s ease-in-out infinite;
      }
      .controls-swipe-demo {
        width: 100px;
        height: 72px;
        flex: 0 0 100px;
        display: grid;
        place-items: center;
        color: #7d3fa8;
        font-size: 2rem;
        animation: controls-swipe 2.2s ease-in-out infinite;
      }
      #controls-help .hint-desktop b,
      #intro-msg .hint-desktop b { white-space: nowrap; }
      @keyframes controls-key-pulse {
        0%, 72%, 100% { transform: translateY(0); border-color: rgba(74,63,51,.28); background: rgba(255,255,255,.72); }
        10%, 28% { transform: translateY(2px); border-color: rgba(125,63,168,.72); background: rgba(125,63,168,.12); }
      }
      @keyframes controls-mouse-drag {
        0%, 18%, 100% { transform: translateX(-16px); }
        55%, 72% { transform: translateX(16px); }
      }
      @keyframes controls-click {
        0%, 12%, 82%, 100% { opacity: .45; transform: scale(1); }
        20%, 68% { opacity: 1; transform: scale(.86); }
      }
      @keyframes controls-joystick {
        0%, 100% { transform: translate(0,0); }
        25% { transform: translate(0,-16px); }
        50% { transform: translate(15px,0); }
        75% { transform: translate(-15px,0); }
      }
      @keyframes controls-swipe {
        0%,100% { transform: translateX(-14px); opacity: .55; }
        50% { transform: translateX(14px); opacity: 1; }
      }
      @media (max-width: 640px) {
        #loading-screen .controls-loading-guide { width: min(360px, calc(100vw - 24px)); padding: 14px; }
        #loading-screen .controls-guide-row { grid-template-columns: 1fr; gap: 8px; }
        #loading-screen .controls-guide-card { padding: 9px 11px; gap: 10px; }
        #loading-screen .controls-guide-help { font-size: .62rem; }
      }
      @media (prefers-reduced-motion: reduce) {
        .controls-key, .controls-mouse, .controls-mouse::after,
        .controls-mobile-demo::after, .controls-swipe-demo { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildKeyboard() {
    return `
      <div class="controls-keyboard-wrap" aria-hidden="true">
        <div class="controls-keyboard">
          <span class="controls-key key-w">W</span>
          <span class="controls-key key-a">A</span>
          <span class="controls-key key-s">S</span>
          <span class="controls-key key-d">D</span>
        </div>
        <div class="controls-arrows">
          <span class="controls-key key-up">↑</span>
          <span class="controls-key key-left">←</span>
          <span class="controls-key key-down">↓</span>
          <span class="controls-key key-right">→</span>
        </div>
      </div>`;
  }

  function buildMouse() {
    return `
      <div class="controls-mouse-demo" aria-hidden="true">
        <div class="controls-mouse"></div>
        <div class="controls-drag-line">← →</div>
      </div>`;
  }

  function buildLoadingGuide() {
    const loading = document.getElementById('loading-screen');
    if (!loading || loading.querySelector('.controls-loading-guide')) return;

    const guide = document.createElement('div');
    guide.className = 'controls-loading-guide';

    if (isMobile) {
      guide.innerHTML = `
        <div class="controls-guide-title">${copy.guideTitle}</div>
        <div class="controls-guide-row">
          <div class="controls-guide-card">
            <div class="controls-mobile-demo" aria-hidden="true"></div>
            <div class="controls-guide-copy">
              <span class="controls-guide-kicker">${copy.move}</span>
              <span class="controls-guide-name">${copy.mobileMove}</span>
              <span class="controls-guide-help">${copy.mobileMoveHelp}</span>
            </div>
          </div>
          <div class="controls-guide-card">
            <div class="controls-swipe-demo" aria-hidden="true">☝︎ ↔</div>
            <div class="controls-guide-copy">
              <span class="controls-guide-kicker">${copy.look}</span>
              <span class="controls-guide-name">${copy.mobileLook}</span>
              <span class="controls-guide-help">${copy.mobileLookHelp}</span>
            </div>
          </div>
        </div>`;
    } else {
      guide.innerHTML = `
        <div class="controls-guide-title">${copy.guideTitle}</div>
        <div class="controls-guide-row">
          <div class="controls-guide-card">
            ${buildKeyboard()}
            <div class="controls-guide-copy">
              <span class="controls-guide-kicker">${copy.move}</span>
              <span class="controls-guide-name">${copy.keyboard}</span>
              <span class="controls-guide-help">${copy.keyboardHelp}</span>
            </div>
          </div>
          <div class="controls-guide-card">
            ${buildMouse()}
            <div class="controls-guide-copy">
              <span class="controls-guide-kicker">${copy.look}</span>
              <span class="controls-guide-name">${copy.mouse}</span>
              <span class="controls-guide-help">${copy.mouseHelp}</span>
            </div>
          </div>
        </div>`;
    }

    loading.appendChild(guide);
  }

  function updateVisibleHelp() {
    const controls = document.getElementById('controls-help');
    if (controls) {
      const desktop = controls.querySelectorAll('.hint-desktop');
      if (desktop[0]) desktop[0].innerHTML = `<b>WASD / ↑ ← ↓ →</b> <span class="control-action">${copy.move}</span>`;
      if (desktop[1]) desktop[1].innerHTML = `<b>${copy.mouse}</b> <span class="control-action">${copy.look}</span>`;
    }

    const intro = document.getElementById('intro-msg');
    if (intro) {
      const desktop = intro.querySelector('.hint-desktop');
      if (desktop) {
        desktop.innerHTML = `<b>WASD / ↑ ← ↓ →</b> — <span class="intro-move">${copy.move}</span> &nbsp;&nbsp; <b>${copy.mouse}</b> — <span class="intro-look">${copy.look}</span>`;
      }
    }
  }

  addStyles();
  buildLoadingGuide();
  updateVisibleHelp();
})();
