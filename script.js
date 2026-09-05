


const CLICK_MAX_MOVE_PX = 6;

const TAP_MAX_MOVE_PX = 16;


const TAP_TOLERANCE_PX = 18;
const MUSEUM_LANGUAGE = window.MUSEUM_LANGUAGE || 'en';
const museumText = (key) => window.getMuseumUiText ? window.getMuseumUiText(key) : key;


const MUSEO_IS_MOBILE = (function () {
  try {
    const byUA = !!(AFRAME.utils && AFRAME.utils.device && AFRAME.utils.device.isMobile());
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    return byUA || (touch && coarse);
  } catch (e) { return false; }
})();


if (MUSEO_IS_MOBILE) document.body.classList.add('is-mobile');
window.MUSEO_IS_MOBILE = MUSEO_IS_MOBILE;

const MUSEO_MOBILE_PIXEL_RATIO = 1.25;
const MUSEO_MOBILE_VIDEO_PLAY_DISTANCE = 1.6;
const MUSEO_MOBILE_VIDEO_PAUSE_DISTANCE = 2.3;

function museoRigWorldPosition(target) {
  const rig = document.getElementById('rig');
  if (!rig || !rig.object3D) return null;
  return rig.object3D.getWorldPosition(target);
}

function museoDistanceXZ(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function museoMobileSkipIdle(comp, running) {
  if (!MUSEO_IS_MOBILE || running || comp.near) return false;
  const display = comp.displayT || 0;
  const label = comp.labelT || 0;
  const glow = comp.glow || 0;
  const pulse = comp.pulseT || 0;
  return display < 0.015 && label < 0.015 && glow < 0.015 && pulse < 0.015;
}

function museoMobileCount(desktopCount, ratio, minimum) {
  if (!MUSEO_IS_MOBILE) return desktopCount;
  return Math.max(minimum || 1, Math.round(desktopCount * ratio));
}

(function setupMobileRuntimeProfile() {
  if (!MUSEO_IS_MOBILE) return;
  const scene = document.querySelector('a-scene');
  if (!scene) return;
  let applied = false;

  const apply = () => {
    if (!scene.renderer) {
      window.setTimeout(apply, 120);
      return;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, MUSEO_MOBILE_PIXEL_RATIO);
    scene.renderer.setPixelRatio(ratio);
    if (scene.renderer.shadowMap) scene.renderer.shadowMap.enabled = false;
    if (scene.object3D) {
      scene.object3D.traverse((obj) => {
        if (obj.isLight) obj.castShadow = false;
        if (obj.isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
          obj.frustumCulled = true;
        }
      });
    }
    window.MUSEO_MOBILE_RUNTIME_PROFILE = {
      pixelRatio: ratio,
      shadows: false
    };
    applied = true;
  };

  const reapply = () => {
    applied = false;
    apply();
  };

  scene.addEventListener('loaded', apply);
  scene.addEventListener('renderstart', apply);
  scene.addEventListener('museo-ready', apply);
  window.addEventListener('resize', AFRAME.utils.throttle(reapply, 300, null));
  window.setTimeout(() => { if (!applied) apply(); }, 600);
})();


window.MUSEO_MOVE_VECTOR = { x: 0, z: 0 };
(function setupMobileJoystick() {
  const base = document.getElementById('joystick-base');
  const nub = document.getElementById('joystick-nub');
  if (!base || !nub) return;

  let active = false;
  let touchId = null;
  let cx = 0, cy = 0;
  const MAX_R = 38;

  const setNub = (dx, dy) => { nub.style.transform = `translate(${dx}px, ${dy}px)`; };
  const reset = () => {
    active = false;
    touchId = null;
    window.MUSEO_MOVE_VECTOR.x = 0;
    window.MUSEO_MOVE_VECTOR.z = 0;
    setNub(0, 0);
  };
  const update = (px, py) => {
    let dx = px - cx, dy = py - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_R) { dx = (dx / dist) * MAX_R; dy = (dy / dist) * MAX_R; }
    setNub(dx, dy);


    window.MUSEO_MOVE_VECTOR.x = dx / MAX_R;
    window.MUSEO_MOVE_VECTOR.z = dy / MAX_R;
  };

  const start = (e) => {
    const t = e.changedTouches[0];
    touchId = t.identifier;
    const rect = base.getBoundingClientRect();
    cx = rect.left + rect.width / 2;
    cy = rect.top + rect.height / 2;
    active = true;
    update(t.clientX, t.clientY);
    e.preventDefault();
  };
  const move = (e) => {
    if (!active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId) { update(t.clientX, t.clientY); e.preventDefault(); break; }
    }
  };
  const end = (e) => {
    if (!active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) { reset(); break; }
    }
  };

  base.addEventListener('touchstart', start, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);
})();


const MUSEUM_GAME_VERSION = '2';
const MUSEO_CAP_KEY = 'museum-capabilities';
const MUSEO_CAP_VERSION_KEY = 'museum-game-version';
const MUSEO_CAP_FINAL_KEY = 'museum-capabilities-final-version';


const MUSEO_CAP_ORDER = ['pha', 'nitrogen', 'electro', 'co', 'hydrogen', 'biomass'];

(function museumCapabilities() {
  const known = (id) => MUSEO_CAP_ORDER.indexOf(id) !== -1;

  try {
    const savedVersion = window.localStorage.getItem(MUSEO_CAP_VERSION_KEY);
    if (savedVersion !== MUSEUM_GAME_VERSION) {
      window.localStorage.removeItem(MUSEO_CAP_KEY);
      window.localStorage.removeItem(MUSEO_CAP_FINAL_KEY);
      window.localStorage.setItem(MUSEO_CAP_VERSION_KEY, MUSEUM_GAME_VERSION);
    }
  } catch (e) {}

  let unlocked = [];
  try {
    const raw = window.localStorage.getItem(MUSEO_CAP_KEY);
    if (raw) unlocked = (JSON.parse(raw) || []).filter(known);
  } catch (e) { unlocked = []; }

  const copy = () => (window.getMuseumCapabilityText ? window.getMuseumCapabilityText() : {});

  let hud = null, toast = null, finalCard = null, counter = null, toastTimer = 0, finalTimer = 0;
  const chips = {};

  function buildHud() {
    if (hud || !document.body) return;
    const c = copy();

    hud = document.createElement('div');
    hud.id = 'capability-hud';
    hud.setAttribute('aria-live', 'polite');

    const head = document.createElement('div');
    head.className = 'cap-head';
    const title = document.createElement('span');
    title.className = 'cap-title';
    title.textContent = c.title || 'CAPABILITIES';
    counter = document.createElement('span');
    counter.className = 'cap-counter';
    head.appendChild(title);
    head.appendChild(counter);
    hud.appendChild(head);

    const row = document.createElement('div');
    row.className = 'cap-row';
    MUSEO_CAP_ORDER.forEach((id) => {
      const chip = document.createElement('span');
      chip.className = 'cap-chip';
      chip.textContent = (c.short && c.short[id]) || id.toUpperCase();
      row.appendChild(chip);
      chips[id] = chip;
    });
    hud.appendChild(row);


    const intro = document.createElement('div');
    intro.className = 'cap-intro';
    const introTitle = document.createElement('span');
    introTitle.className = 'cap-intro-title';
    introTitle.textContent = c.introTitle || 'DISCOVER THEIR CAPABILITIES';
    const introBody = document.createElement('span');
    introBody.className = 'cap-intro-body';
    introBody.textContent = c.introBody || 'Interact with the exhibits.';
    intro.appendChild(introTitle);
    intro.appendChild(introBody);
    hud.appendChild(intro);
    hud.classList.add('intro');
    window.setTimeout(() => hud.classList.remove('intro'), 6500);

    document.body.appendChild(hud);

    toast = document.createElement('div');
    toast.id = 'capability-toast';
    toast.setAttribute('role', 'status');


    const result = document.createElement('span');
    result.className = 'cap-toast-result';
    const kicker = document.createElement('span');
    kicker.className = 'cap-toast-kicker';
    const name = document.createElement('span');
    name.className = 'cap-toast-name';
    toast.appendChild(result);
    toast.appendChild(kicker);
    toast.appendChild(name);
    document.body.appendChild(toast);

    finalCard = document.createElement('div');
    finalCard.id = 'capability-final';
    finalCard.setAttribute('role', 'status');
    finalCard.setAttribute('aria-live', 'polite');
    ['count', 'title', 'lead', 'body'].forEach((part) => {
      const span = document.createElement('span');
      span.className = 'cap-final-' + part;
      finalCard.appendChild(span);
    });
    document.body.appendChild(finalCard);

    render();
  }

  function render() {
    if (!hud) return;
    const c = copy();
    MUSEO_CAP_ORDER.forEach((id) => {
      const on = unlocked.indexOf(id) !== -1;
      chips[id].classList.toggle('unlocked', on);
      const long = (c.long && c.long[id]) || id.toUpperCase();
      chips[id].setAttribute('aria-label', long + ' — ' + (on ? (c.found || '') : (c.pending || '')));
    });
    counter.textContent = unlocked.length + ' / ' + MUSEO_CAP_ORDER.length;
    hud.classList.toggle('complete', unlocked.length === MUSEO_CAP_ORDER.length);
  }

  function showToast(id) {
    if (!toast) return;
    const c = copy();
    const res = (c.result && c.result[id]) || '';
    const resEl = toast.querySelector('.cap-toast-result');
    resEl.textContent = res;
    resEl.style.display = res ? '' : 'none';
    toast.querySelector('.cap-toast-kicker').textContent = c.discovered || 'CAPABILITY DISCOVERED';
    toast.querySelector('.cap-toast-name').textContent = (c.long && c.long[id]) || id.toUpperCase();
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 4200);
  }

  function showFinalCard() {
    if (!finalCard) return;
    const c = copy();
    const f = c.final || {};
    finalCard.querySelector('.cap-final-count').textContent = f.count || (MUSEO_CAP_ORDER.length + ' / ' + MUSEO_CAP_ORDER.length);
    finalCard.querySelector('.cap-final-title').textContent = f.title || 'CAPABILITIES DISCOVERED';
    finalCard.querySelector('.cap-final-lead').textContent = f.lead || 'YOU HAVE DISCOVERED THEIR FULL POTENTIAL';
    finalCard.querySelector('.cap-final-body').textContent = f.body || 'Continue exploring the museum.';
    finalCard.classList.add('visible');
    if (hud) hud.classList.add('final-pulse');
    window.clearTimeout(finalTimer);
    finalTimer = window.setTimeout(() => {
      finalCard.classList.remove('visible');
      if (hud) hud.classList.remove('final-pulse');
    }, 5600);
  }

  function maybeShowFinalCard(previousCount) {
    if (previousCount !== MUSEO_CAP_ORDER.length - 1 || unlocked.length !== MUSEO_CAP_ORDER.length) return;
    try {
      if (window.localStorage.getItem(MUSEO_CAP_FINAL_KEY) === MUSEUM_GAME_VERSION) return;
      window.localStorage.setItem(MUSEO_CAP_FINAL_KEY, MUSEUM_GAME_VERSION);
    } catch (e) {}
    window.setTimeout(showFinalCard, 4450);
  }

  window.hasCapability = function hasCapability(id) {
    return unlocked.indexOf(id) !== -1;
  };


  window.unlockCapability = function unlockCapability(id) {
    if (!known(id)) { console.warn('[capacidades] id no registrado:', id); return false; }
    if (window.hasCapability(id)) return false;
    const previousCount = unlocked.length;
    unlocked.push(id);
    try { window.localStorage.setItem(MUSEO_CAP_KEY, JSON.stringify(unlocked)); } catch (e) {}
    buildHud();
    render();
    showToast(id);
    maybeShowFinalCard(previousCount);
    console.log('[capacidades] descubierta ' + id + ' (' + unlocked.length + '/' + MUSEO_CAP_ORDER.length + ')');
    return true;
  };


  window.resetCapabilities = function resetCapabilities() {
    unlocked = [];
    try {
      window.localStorage.removeItem(MUSEO_CAP_KEY);
      window.localStorage.removeItem(MUSEO_CAP_FINAL_KEY);
    } catch (e) {}
    render();
    return true;
  };

  window.MUSEUM_GAME_VERSION = MUSEUM_GAME_VERSION;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildHud);
  else buildHud();
})();

(function setupCreditsPanel() {
  const ready = () => {
    const trigger = document.getElementById('credits-trigger');
    const panel = document.getElementById('credits-panel');
    if (!trigger || !panel) return;
    const close = panel.querySelector('.credits-close');
    const copy = window.getMuseumCreditsText ? window.getMuseumCreditsText() : null;
    if (copy) {
      const title = panel.querySelector('#credits-title');
      const mediaTitle = panel.querySelector('#credits-media-title');
      const scienceTitle = panel.querySelector('#credits-science-title');
      const developmentTitle = panel.querySelector('#credits-development-title');
      if (title) title.textContent = copy.title || '';
      if (mediaTitle) mediaTitle.textContent = copy.mediaTitle || '';
      if (scienceTitle) scienceTitle.textContent = copy.scienceTitle || '';
      if (developmentTitle) developmentTitle.textContent = copy.developmentTitle || '';

      const media = panel.querySelector('#credits-media');
      if (media) {
        media.innerHTML = '';
        (copy.media || []).forEach((group) => {
          const row = document.createElement('div');
          row.className = 'credits-year';
          const year = document.createElement('strong');
          year.textContent = group.year || '';
          const names = document.createElement('span');
          names.textContent = (group.names || []).join(', ');
          row.appendChild(year);
          row.appendChild(names);
          media.appendChild(row);
        });
      }

      const science = panel.querySelector('#credits-science');
      if (science) {
        science.innerHTML = '';
        (copy.science || []).forEach((note) => {
          const p = document.createElement('span');
          p.className = 'credits-note';
          p.textContent = note;
          science.appendChild(p);
        });
      }

      const development = panel.querySelector('#credits-development');
      if (development) {
        development.innerHTML = '';
        (copy.development || []).forEach((note) => {
          const p = document.createElement('span');
          p.className = 'credits-note';
          p.textContent = note;
          development.appendChild(p);
        });
      }
    }

    const open = () => {
      panel.classList.add('visible');
      document.body.classList.add('panel-open');
    };
    const hide = () => {
      panel.classList.remove('visible');
      document.body.classList.remove('panel-open');
    };
    trigger.addEventListener('click', open);
    if (close) close.addEventListener('click', hide);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('visible')) hide();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();


const MUSEO_HOTSPOT_COLOR = 0x4fe4dc;

function faceMuseoFront(object3D, front) {
  if (!object3D || !front) return false;
  const dir = new THREE.Vector3(front.x || 0, 0, front.z || 0);
  if (dir.lengthSq() < 0.000001) return false;
  dir.normalize();
  object3D.lookAt(object3D.position.clone().add(dir));
  object3D.userData.museoFixedFront = { x: dir.x, z: dir.z };
  return true;
}

function createMuseoHotspot(cfg) {
  const scene = cfg.el.sceneEl.object3D;
  const group = new THREE.Group();
  group.name = 'museo-hotspot-' + (cfg.capability || 'x');
  group.position.copy(cfg.position);
  scene.add(group);
  const fixedFront = faceMuseoFront(group, cfg.faceDirection || cfg.front);

  const dotMat = new THREE.MeshBasicMaterial({
    color: MUSEO_HOTSPOT_COLOR, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
  });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0102, 24), dotMat);
  dot.position.z = 0.0008;
  group.add(dot);

  const ringMat = new THREE.MeshBasicMaterial({
    color: MUSEO_HOTSPOT_COLOR, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.0148, 0.0172, 28), ringMat);
  group.add(ring);


  const text = String(cfg.verb || '').toUpperCase();
  const probe = document.createElement('canvas').getContext('2d');
  const FONT = '800 52px Arial, Helvetica, sans-serif';
  probe.font = FONT;
  const c = document.createElement('canvas');
  c.height = 84;
  c.width = Math.max(64, Math.ceil(probe.measureText(text).width) + 30);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);


  const R = c.height * 0.34;
  ctx.beginPath();
  ctx.moveTo(R, 6);
  ctx.lineTo(c.width - R, 6);
  ctx.quadraticCurveTo(c.width - 2, 6, c.width - 2, 6 + R);
  ctx.lineTo(c.width - 2, c.height - 6 - R);
  ctx.quadraticCurveTo(c.width - 2, c.height - 6, c.width - R, c.height - 6);
  ctx.lineTo(R, c.height - 6);
  ctx.quadraticCurveTo(2, c.height - 6, 2, c.height - 6 - R);
  ctx.lineTo(2, 6 + R);
  ctx.quadraticCurveTo(2, 6, R, 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8, 14, 16, 0.62)';
  ctx.fill();
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#BFF6F1';
  ctx.fillText(text, 14, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const LABEL_H = 0.021;
  const LABEL_W = LABEL_H * (c.width / c.height);
  const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H), labelMat);
  label.position.set(0.020 + LABEL_W / 2, 0, 0.0008);
  group.add(label);


  const cc = document.createElement('canvas');
  cc.width = 64; cc.height = 64;
  const cctx = cc.getContext('2d');
  cctx.strokeStyle = '#BFF6F1';
  cctx.lineWidth = 8;
  cctx.lineCap = 'round';
  cctx.beginPath();
  cctx.moveTo(14, 34); cctx.lineTo(27, 47); cctx.lineTo(50, 18);
  cctx.stroke();
  const checkTex = new THREE.CanvasTexture(cc);
  checkTex.colorSpace = THREE.SRGBColorSpace;
  const checkMat = new THREE.MeshBasicMaterial({ map: checkTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const check = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.016), checkMat);
  check.position.set(0.024 + LABEL_W, 0, 0.0008);
  check.visible = false;
  group.add(check);

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(LABEL_W + 0.075, 0.048),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
  );
  hit.position.set((0.020 + LABEL_W) * 0.5 - 0.012, 0, 0.004);
  group.add(hit);

  const api = {
    group,
    amount: 0,
    busy: false,
    pressT: 0,
    activate() {
      if (api.busy || api.amount < 0.25) return;
      api.pressT = 1;
      if (cfg.onActivate) cfg.onActivate();
    },
    tick(dt, camera, visibleAmount, unlocked, busy) {
      api.amount = visibleAmount;
      api.busy = !!busy;
      const eased = visibleAmount * visibleAmount * (3 - 2 * visibleAmount);
      group.visible = eased > 0.01;
      if (!group.visible) return;
      if (!fixedFront && camera) group.lookAt(camera);

      api.pressT = Math.max(0, api.pressT - dt * 5.0);

      const beat = unlocked ? 0 : (0.5 + 0.5 * Math.sin(performance.now() / 620));
      const dim = busy ? 0.35 : 1;

      dotMat.opacity = eased * dim * (0.72 + 0.28 * beat + api.pressT * 0.3);
      dot.scale.setScalar(1 + beat * 0.10 + api.pressT * 0.45);
      ringMat.opacity = eased * dim * (unlocked ? 0.20 : (0.16 + 0.34 * beat));
      ring.scale.setScalar(1 + beat * 0.22 + api.pressT * 0.35);
      labelMat.opacity = eased * dim * 0.92;
      check.visible = !!unlocked;
      checkMat.opacity = unlocked ? eased * 0.75 : 0;
    },
    dispose() {
      if (group.parent) group.parent.remove(group);
      [dotMat, ringMat, labelMat, checkMat].forEach((m) => m.dispose());
    }
  };

  hit.userData.museoExhibitId = 'hotspot_' + (cfg.capability || 'x');
  hit.userData.museoAction = () => api.activate();
  if (cfg.info && cfg.info.selectableMeshes) {
    cfg.info.selectableMeshes.push(hit);
    api._hit = hit;
  }
  return api;
}


function museoHotspotSpot(bellBox, center, front) {
  const bellCenter = bellBox ? bellBox.getCenter(new THREE.Vector3()) : center.clone();
  const bellRadius = bellBox
    ? Math.max(bellBox.max.x - bellBox.min.x, bellBox.max.z - bellBox.min.z) * 0.5
    : 0.14;
  const p = bellCenter.clone().addScaledVector(front, bellRadius + 0.075);
  p.y = center.y - 0.055;
  return p;
}

AFRAME.registerComponent('drag-look-controls', {
  schema: {
    sensitivity: { type: 'number', default: 0.2 }
  },
  init() {
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.downX = 0;
    this.downY = 0;


    this.el.object3D.rotation.order = 'YXZ';
    this.pitch = this.el.object3D.rotation.x;
    this.yaw = this.el.object3D.rotation.y;
    const maxPitch = THREE.MathUtils.degToRad(80);

    const start = (x, y) => {
      this.dragging = true;
      this.downX = x;
      this.downY = y;
      this.lastX = x;
      this.lastY = y;
      canvas.style.cursor = 'grabbing';
    };
    const move = (x, y) => {
      if (!this.dragging) return;
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      this.lastX = x;
      this.lastY = y;
      this.yaw -= dx * this.data.sensitivity * (Math.PI / 180);
      this.pitch -= dy * this.data.sensitivity * (Math.PI / 180);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -maxPitch, maxPitch);
      this.el.object3D.rotation.set(this.pitch, this.yaw, 0);
    };
    const end = (isTouch) => {
      this.dragging = false;
      canvas.style.cursor = 'grab';


      const moved = Math.hypot(this.lastX - this.downX, this.lastY - this.downY);
      const slop = isTouch ? TAP_MAX_MOVE_PX : CLICK_MAX_MOVE_PX;
      if (moved < slop) this.trySelect(this.lastX, this.lastY, !!isTouch);
    };


    this._lastTouchAt = 0;
    const echoOfTouch = () => (Date.now() - this._lastTouchAt) < 900;

    this.onMouseDown = (e) => { if (e.button === 0 && !echoOfTouch()) start(e.clientX, e.clientY); };
    this.onMouseMove = (e) => { if (!echoOfTouch()) move(e.clientX, e.clientY); };
    this.onMouseUp = () => { if (!echoOfTouch()) end(false); };


    this._touchId = null;
    this.onTouchStart = (e) => {
      this._lastTouchAt = Date.now();


      if (this._touchId !== null) {
        let alive = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === this._touchId) { alive = true; break; }
        }
        if (alive) return;
        this._touchId = null;
        this.dragging = false;
      }
      const t = e.changedTouches[0];
      this._touchId = t.identifier;
      start(t.clientX, t.clientY);
    };
    this.onTouchMove = (e) => {
      if (this._touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._touchId) { move(t.clientX, t.clientY); e.preventDefault(); break; }
      }
    };
    this.onTouchEnd = (e) => {
      this._lastTouchAt = Date.now();
      if (this._touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._touchId) { this._touchId = null; end(true); break; }
      }
    };


    this.onTouchCancel = (e) => {
      this._lastTouchAt = Date.now();
      if (this._touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._touchId) {
          this._touchId = null;
          this.dragging = false;
          canvas.style.cursor = 'grab';
          break;
        }
      }
    };

    const canvas = this.el.sceneEl.canvas;
    const attach = () => {
      const c = this.el.sceneEl.canvas;
      c.style.cursor = 'grab';
      c.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
      c.addEventListener('touchstart', this.onTouchStart, { passive: true });
      window.addEventListener('touchmove', this.onTouchMove, { passive: false });
      window.addEventListener('touchend', this.onTouchEnd);
      window.addEventListener('touchcancel', this.onTouchCancel);
    };
    if (canvas) attach();
    else this.el.sceneEl.addEventListener('render-target-loaded', attach, { once: true });
  },


  trySelect(x, y, isTouch) {
    const sceneEl = this.el.sceneEl;
    const canvas = sceneEl && sceneEl.canvas;
    const modelo = document.querySelector('#modelo');
    const info = modelo && modelo.components && modelo.components['exhibit-info'];
    if (!canvas || !info || !info.selectableMeshes || !info.selectableMeshes.length) return;
    const camera = sceneEl.camera;
    if (!camera) return;

    const rect = canvas.getBoundingClientRect();
    if (!this._ndc) this._ndc = new THREE.Vector2();
    if (!this._raycaster) this._raycaster = new THREE.Raycaster();


    const probes = [[0, 0]];
    if (isTouch) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        probes.push([Math.cos(a) * TAP_TOLERANCE_PX * 0.55, Math.sin(a) * TAP_TOLERANCE_PX * 0.55]);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        probes.push([Math.cos(a) * TAP_TOLERANCE_PX, Math.sin(a) * TAP_TOLERANCE_PX]);
      }
    }

    for (let p = 0; p < probes.length; p++) {
      this._ndc.set(
        ((x + probes[p][0] - rect.left) / rect.width) * 2 - 1,
        -((y + probes[p][1] - rect.top) / rect.height) * 2 + 1
      );
      this._raycaster.setFromCamera(this._ndc, camera);
      const hits = this._raycaster.intersectObjects(info.selectableMeshes, false);
      if (!hits.length) continue;


      const action = hits[0].object.userData.museoAction;
      if (action) { action(); return; }
      const id = hits[0].object.userData.museoExhibitId;
      if (id) { info.open(id); return; }
    }
  },
  remove() {
    const c = this.el.sceneEl.canvas;
    if (c) {
      c.removeEventListener('mousedown', this.onMouseDown);
      c.removeEventListener('touchstart', this.onTouchStart);
    }
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('touchcancel', this.onTouchCancel);
  }
});


AFRAME.registerComponent('museum-movement', {
  schema: {
    speed: { type: 'number', default: 1.0 },
    acceleration: { type: 'number', default: 6 }
  },
  init() {
    this.keys = {};
    this.velocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.moveVector = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.cameraEl = this.el.querySelector('[camera]');

    this.onKeyDown = (e) => { this.keys[e.code] = true; };
    this.onKeyUp = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  },
  remove() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  },
  tick(time, delta) {
    if (!delta) return;
    const dt = Math.min(delta / 1000, 0.1);

    const forward = (this.keys.KeyW || this.keys.ArrowUp) ? 1 : 0;
    const backward = (this.keys.KeyS || this.keys.ArrowDown) ? 1 : 0;
    const left = (this.keys.KeyA || this.keys.ArrowLeft) ? 1 : 0;
    const right = (this.keys.KeyD || this.keys.ArrowRight) ? 1 : 0;

    this.moveVector.set(right - left, 0, backward - forward);


    const joy = window.MUSEO_MOVE_VECTOR;
    if (joy && (joy.x || joy.z)) { this.moveVector.x += joy.x; this.moveVector.z += joy.z; }
    if (this.moveVector.lengthSq() > 0) this.moveVector.normalize();


    const rigYaw = this.el.object3D.rotation.y;
    const cameraYaw = this.cameraEl ? this.cameraEl.object3D.rotation.y : 0;
    this.moveVector.applyAxisAngle(this.up, rigYaw + cameraYaw);
    this.targetVelocity.copy(this.moveVector).multiplyScalar(this.data.speed);

    this.velocity.lerp(this.targetVelocity, Math.min(1, this.data.acceleration * dt));

    this.el.object3D.position.x += this.velocity.x * dt;
    this.el.object3D.position.z += this.velocity.z * dt;
  }
});


AFRAME.registerComponent('log-when-loaded', {
  init() {
    this.el.addEventListener('model-loaded', (e) => {
      console.log('Loaded:', this.el, e.detail);
    });
    this.el.addEventListener('model-error', (e) => {
      console.error('Model error:', this.el, e.detail);
    });
  }
});


AFRAME.registerComponent('setup-museum-model', {
  schema: {
    length: { type: 'number', default: 11 },
    height: { type: 'number', default: 3 },
    wallMargin: { type: 'number', default: 0.4 },


    playerRadius: { type: 'number', default: 0.15 },
    eyeHeight: { type: 'number', default: 0.5 }
  },
  init() {


    const modulos = Array.from(this.el.querySelectorAll('[gltf-model]'));
    this.pendientes = modulos.length;
    if (!this.pendientes) { this.el.addEventListener('model-loaded', () => this.onLoaded()); return; }
    modulos.forEach((m) => {
      m.addEventListener('model-loaded', () => {
        this.pendientes--;
        if (this.pendientes === 0) this.onLoaded();
      });
    });
  },
  onLoaded() {
    const mesh = this.el.object3D;
    if (!mesh) return;


    const lights = [];
    mesh.traverse((o) => { if (o.isLight) lights.push(o); });
    lights.forEach((light) => {
      light.intensity = 0;
      light.visible = false;
      if (light.parent) light.parent.remove(light);
    });


    this.el.object3D.scale.set(1, 1, 1);
    this.el.object3D.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const horizontal = Math.max(size.x, size.z);
    if (horizontal > 0 && size.y > 0) {
      const scaleXZ = this.data.length / horizontal;
      const scaleY = this.data.height / size.y;
      this.el.object3D.scale.set(scaleXZ, scaleY, scaleXZ);
    }


    this.el.object3D.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);


    const floorRoot = mesh.getObjectByName('suelo');
    const floorMeshes = [];
    if (floorRoot) {
      floorRoot.traverse((o) => { if (o.isMesh) floorMeshes.push(o); });
    }
    let floorY;
    if (floorMeshes.length) {
      const floorBox = new THREE.Box3();
      floorMeshes.forEach((o) => floorBox.expandByObject(o));
      floorY = floorBox.max.y;
    } else {
      console.warn('[setup-museum-model] no floor mesh found under "suelo" — falling back to whole-model box.min.y for spawn height (may land below the real walking surface)');
      floorY = box.min.y;
    }


    const obstacles = [];
    const objBox = new THREE.Box3();
    const objSize = new THREE.Vector3();
    const objCenter = new THREE.Vector3();
    let peanaIndex = 0;
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      objBox.setFromObject(o);
      objBox.getSize(objSize);


      if (o.name.startsWith('PEANA_')) {
        objBox.getCenter(objCenter);
        const id = `peana-${peanaIndex++}`;
        o.userData.museoType = 'peana';
        o.userData.museoId = id;
        o.name = o.name || id;
        obstacles.push({
          minX: objBox.min.x - this.data.playerRadius, maxX: objBox.max.x + this.data.playerRadius,
          minZ: objBox.min.z - this.data.playerRadius, maxZ: objBox.max.z + this.data.playerRadius,
          center: { x: objCenter.x, z: objCenter.z },
          id,
          meshName: o.name
        });
      }
    });
    window.MUSEO_OBSTACLES = obstacles;

    const m = this.data.wallMargin;
    window.MUSEO_BOUNDS = {
      minX: box.min.x + m, maxX: box.max.x - m,
      minZ: box.min.z + m, maxZ: box.max.z - m
    };


    window.MUSEO_FLOOR_MESHES = floorMeshes;


    const wallRoot = mesh.getObjectByName('PAREDES_Sala');
    const wallMeshes = [];
    if (wallRoot) wallRoot.traverse((o) => { if (o.isMesh) wallMeshes.push(o); });
    window.MUSEO_WALL_MESHES = wallMeshes;


    window.MUSEO_INTERACTIVE = window.MUSEO_INTERACTIVE || {};
    window.MUSEO_INTERACTIVE.peanas = obstacles.map((o) => ({ id: o.id, meshName: o.meshName, position: o.center }));


    const rig = document.querySelector('#rig');
    const camera = document.querySelector('#camera');
    let yaw = 0;
    if (obstacles.length) {
      const avg = obstacles.reduce((a, o) => ({ x: a.x + o.center.x, z: a.z + o.center.z }), { x: 0, z: 0 });
      avg.x /= obstacles.length;
      avg.z /= obstacles.length;
      yaw = Math.atan2(center.x - avg.x, avg.z - center.z) * (180 / Math.PI);
    }


    const spawnXZ = findSafeSpawn(center.x, center.z, window.MUSEO_BOUNDS, obstacles, floorMeshes, floorY);

    if (rig) {
      rig.object3D.position.set(spawnXZ.x, floorY, spawnXZ.z);
      rig.object3D.rotation.set(0, THREE.MathUtils.degToRad(yaw), 0);
    }
    if (camera) {
      camera.object3D.position.set(0, this.data.eyeHeight, 0);
    }

    window.MUSEO_SPAWN = { x: spawnXZ.x, y: floorY, z: spawnXZ.z, yaw };

    this.el.emit('museo-modules-loaded', null, false);
    console.log(`[setup-museum-model] ${lights.length} baked lights removed, ` +
      `${obstacles.length} peanas tagged, spawn at`, window.MUSEO_SPAWN);

    this.el.sceneEl.emit('museo-ready');
  }
});


function clampToWalkable(x, z, bounds, obstacles) {
  x = THREE.MathUtils.clamp(x, bounds.minX, bounds.maxX);
  z = THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ);


  if (obstacles) {
    for (let pass = 0; pass < 4; pass++) {
      let movedAny = false;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) continue;
        const dLeft = x - o.minX, dRight = o.maxX - x;
        const dBack = z - o.minZ, dFront = o.maxZ - z;
        const min = Math.min(dLeft, dRight, dBack, dFront);
        if (min === dLeft) x = o.minX;
        else if (min === dRight) x = o.maxX;
        else if (min === dBack) z = o.minZ;
        else z = o.maxZ;
        movedAny = true;
      }
      x = THREE.MathUtils.clamp(x, bounds.minX, bounds.maxX);
      z = THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ);
      if (!movedAny) break;
    }
  }
  return { x, z };
}

function isFreeOfObstacles(x, z, obstacles, extraMargin) {
  const m = extraMargin || 0;
  return !obstacles.some((o) =>
    x >= o.minX - m && x <= o.maxX + m && z >= o.minZ - m && z <= o.maxZ + m);
}


const groundRaycaster = new THREE.Raycaster();
const groundRayOrigin = new THREE.Vector3();
const groundRayDir = new THREE.Vector3(0, -1, 0);

let groundProbe = null;

function rayHitsFloor(x, z, floorMeshes, refY) {
  groundRayOrigin.set(x, refY + 5, z);
  groundRaycaster.set(groundRayOrigin, groundRayDir);
  groundRaycaster.far = 10;
  return groundRaycaster.intersectObjects(floorMeshes, false).length > 0;
}


const wallRaycaster = new THREE.Raycaster();
const wallRayOrigin = new THREE.Vector3();
const wallRayDir = new THREE.Vector3();
function crossesWall(fromX, fromZ, toX, toZ, wallMeshes, refY) {
  if (!wallMeshes || !wallMeshes.length) return false;
  const dx = toX - fromX, dz = toZ - fromZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return false;
  wallRayOrigin.set(fromX, refY + 1.0, fromZ);
  wallRayDir.set(dx, 0, dz).normalize();
  wallRaycaster.set(wallRayOrigin, wallRayDir);
  wallRaycaster.far = dist + 0.05;
  return wallRaycaster.intersectObjects(wallMeshes, false).length > 0;
}

function isGrounded(x, z, floorMeshes, refY) {
  if (!floorMeshes || !floorMeshes.length) return true;
  if (groundProbe === null) {
    const s = window.MUSEO_SPAWN;
    groundProbe = s ? rayHitsFloor(s.x, s.z, floorMeshes, s.y) : false;
    if (!groundProbe) {
      console.warn('[clamp-to-bounds] el suelo no es intersecable; se usan solo los limites');
    }
  }
  if (groundProbe === false) return true;
  return rayHitsFloor(x, z, floorMeshes, refY);
}


function findSafeSpawn(centerX, centerZ, bounds, obstacles, floorMeshes, floorY) {
  const ok = (x, z, margin) =>
    isFreeOfObstacles(x, z, obstacles, margin) && isGrounded(x, z, floorMeshes, floorY);

  const candidate = clampToWalkable(centerX, centerZ, bounds, obstacles);

  for (const margin of [1.0, 0.5, 0]) {
    if (ok(candidate.x, candidate.z, margin)) return candidate;
    for (let radius = 0.5; radius <= 4; radius += 0.5) {
      for (let angleDeg = 0; angleDeg < 360; angleDeg += 30) {
        const angle = THREE.MathUtils.degToRad(angleDeg);
        const x = THREE.MathUtils.clamp(centerX + radius * Math.cos(angle), bounds.minX, bounds.maxX);
        const z = THREE.MathUtils.clamp(centerZ + radius * Math.sin(angle), bounds.minZ, bounds.maxZ);
        if (ok(x, z, margin)) return { x, z };
      }
    }
  }
  console.warn('[findSafeSpawn] no fully free (and grounded) spot found, using best-effort clamp');
  return candidate;
}

AFRAME.registerComponent('clamp-to-bounds', {
  init() {
    this.lastGood = null;
  },
  tick() {
    const b = window.MUSEO_BOUNDS;
    if (!b) return;
    const obj = this.el.object3D;

    if (!this.lastGood) {
      const spawn = window.MUSEO_SPAWN;
      this.lastGood = spawn ? { x: spawn.x, z: spawn.z } : { x: obj.position.x, z: obj.position.z };
    }

    const clamped = clampToWalkable(obj.position.x, obj.position.z, b, window.MUSEO_OBSTACLES);

    const spawn = window.MUSEO_SPAWN;
    const refY = spawn ? spawn.y : obj.position.y;
    const wallHit = crossesWall(this.lastGood.x, this.lastGood.z, clamped.x, clamped.z, window.MUSEO_WALL_MESHES, refY);
    if (wallHit) {


      clamped.x = this.lastGood.x;
      clamped.z = this.lastGood.z;
    } else if (isGrounded(clamped.x, clamped.z, window.MUSEO_FLOOR_MESHES, refY)) {
      this.lastGood.x = clamped.x;
      this.lastGood.z = clamped.z;
    } else {


      clamped.x = this.lastGood.x;
      clamped.z = this.lastGood.z;
    }

    obj.position.x = clamped.x;
    obj.position.z = clamped.z;
  }
});


AFRAME.registerComponent('respawn-guard', {
  init() {
    this.nextCheck = 0;
    this.margin = 1.0;
  },
  tick(time) {
    if (time < this.nextCheck) return;
    this.nextCheck = time + 400;

    const spawn = window.MUSEO_SPAWN;
    const bounds = window.MUSEO_BOUNDS;
    if (!spawn || !bounds) return;

    const pos = this.el.object3D.position;
    const farOutside =
      pos.x < bounds.minX - this.margin || pos.x > bounds.maxX + this.margin ||
      pos.z < bounds.minZ - this.margin || pos.z > bounds.maxZ + this.margin;
    const fellOrFlew = Math.abs(pos.y - spawn.y) > 1.0;

    if (farOutside || fellOrFlew) {
      console.warn('[respawn-guard] out of bounds, respawning', pos);
      pos.set(spawn.x, spawn.y, spawn.z);
      this.el.object3D.rotation.set(0, THREE.MathUtils.degToRad(spawn.yaw), 0);
    }
  }
});


AFRAME.registerComponent('gltf-animations', {


  schema: {
    fps: { type: 'number', default: 30 }
  },
  init() {
    this.mixer = null;
    this.accumulated = 0;
    this.el.addEventListener('model-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;
    const clips = mesh.animations || [];
    if (!clips.length) {
      console.warn('[gltf-animations] el GLB no trae animaciones');
      return;
    }
    if (this.mixer) this.mixer.stopAllAction();
    this.mixer = new THREE.AnimationMixer(mesh);
    clips.forEach((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    });
    console.log(`[gltf-animations] reproduciendo ${clips.length} animaciones en bucle`);
  },
  tick(time, timeDelta) {
    if (!this.mixer || !timeDelta || document.hidden) return;
    this.accumulated += timeDelta;
    const targetFps = MUSEO_IS_MOBILE ? Math.min(this.data.fps, 15) : this.data.fps;
    const interval = 1000 / Math.max(1, targetFps);
    if (this.accumulated < interval) return;
    this.mixer.update(this.accumulated / 1000);
    this.accumulated = 0;
  }
});


AFRAME.registerComponent('web-fixes', {
  init() {
    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.object3D;
    if (!mesh) return;
    const THREE = AFRAME.THREE;

    const bases = [];
    const neones = [];
    let suelo = null;
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'SUELO_Superficie') suelo = o;
      if (o.name.startsWith('VITRINA_Base_')) bases.push(o);
      if (o.material && o.material.name === 'Neon_Purple') neones.push(o);

      if (o.material && o.material.name === 'Bacteria_Mat') {
        o.material.side = THREE.FrontSide;
        o.material.needsUpdate = true;
      }
    });


    let blanco = null;
    let pintados = 0;
    bases.forEach((base) => {
      const bb = new THREE.Box3().setFromObject(base);
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      neones.forEach((n) => {
        const nb = new THREE.Box3().setFromObject(n);
        const nx = (nb.min.x + nb.max.x) / 2;
        const nz = (nb.min.z + nb.max.z) / 2;
        const cerca = Math.hypot(nx - cx, nz - cz) < 0.35;
        const justoDebajo = nb.max.y <= bb.min.y + 0.05 && nb.max.y >= bb.min.y - 0.30;
        if (!cerca || !justoDebajo) return;
        if (!blanco) {
          blanco = n.material.clone();
          blanco.name = 'Neon_Blanco_Vitrina';
          blanco.color = new THREE.Color(0xffffff);
          blanco.emissive = new THREE.Color(0xfff4e2);
          blanco.emissiveIntensity = n.material.emissiveIntensity;
        }
        n.material = blanco;
        pintados++;
      });
    });


    let tubos = 0;
    mesh.traverse((o) => {
      if (o.isMesh && /^(Lab_|Tubo|Tube)/.test(o.name)) { o.visible = false; tubos++; }
    });


    let blancoVentana = null;
    let ventanas = 0;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.name !== 'Neon_Purple') return;
      const b = new THREE.Box3().setFromObject(o);
      if ((b.min.x + b.max.x) / 2 >= 0) return;
      const alto = b.max.y - b.min.y;
      if (alto < 1.0 || b.min.y > 1.0) return;
      if (!blancoVentana) {
        blancoVentana = o.material.clone();
        blancoVentana.name = 'Neon_Blanco_Ventana';
        blancoVentana.color = new THREE.Color(0xffffff);
        blancoVentana.emissive = new THREE.Color(0xfff6ea);
        blancoVentana.emissiveIntensity = o.material.emissiveIntensity;
      }
      o.material = blancoVentana;
      ventanas++;
    });

    console.log(`[web-fixes] ${pintados} aros de vitrina y ${ventanas} marcos de ventana en blanco, ${tubos} tubos ocultos`);
  }
});


const ROOM2_ACCENT = '#2C8C82';
const ROOM2_ACCENT_LIGHT = '#5A9994';
const REACTOR_CONTROL_I18N = {
  en: {
    title: 'PHOTOBIOREACTOR',
    statusTitle: 'CONTROL STATUS',
    idle: 'Tap a control to learn what that process does inside a photobioreactor.',
    systemActive: 'SYSTEM ACTIVE',
    systemActiveText: 'Light, circulation, nutrients and metabolic activity are balanced.',
    labels: {
      light: 'LIGHT',
      flow: 'FLOW',
      nutrients: 'NUTRIENTS',
      active: 'ACTIVITY'
    },
    buttons: {
      light: 'LIGHT',
      flow: 'FLOW',
      nutrients: 'FEED',
      active: 'ACTIVATE'
    },
    messages: {
      light: {
        onTitle: 'LIGHT',
        on: 'Light provides the energy used by purple phototrophic bacteria.',
        offTitle: 'LIGHT OFF',
        off: 'Photosynthetic activity decreases.'
      },
      flow: {
        onTitle: 'FLOW',
        on: 'Circulation keeps cells and nutrients distributed throughout the culture.',
        offTitle: 'FLOW OFF',
        off: 'Circulation slows and the culture becomes less mixed.'
      },
      nutrients: {
        onTitle: 'NUTRIENTS',
        on: 'Carbon, nitrogen and minerals enter the culture.',
        offTitle: 'NUTRIENTS OFF',
        off: 'The feed stream pauses.'
      },
      active: {
        onTitle: 'ACTIVE CULTURE',
        on: 'Metabolic activity becomes visible through gas production and exchange.',
        offTitle: 'ACTIVITY OFF',
        off: 'Gas production and exchange become less visible.'
      }
    }
  },
  es: {
    title: 'FOTOBIORREACTOR',
    statusTitle: 'ESTADO DE CONTROL',
    idle: 'Pulsa un control para aprender qué proceso activa dentro del fotobiorreactor.',
    systemActive: 'SISTEMA ACTIVO',
    systemActiveText: 'Luz, circulación, nutrientes y actividad metabólica están equilibrados.',
    labels: {
      light: 'LUZ',
      flow: 'FLUJO',
      nutrients: 'NUTRIENTES',
      active: 'ACTIVIDAD'
    },
    buttons: {
      light: 'LUZ',
      flow: 'FLUJO',
      nutrients: 'NUTRIENTES',
      active: 'ACTIVAR'
    },
    messages: {
      light: {
        onTitle: 'LUZ',
        on: 'La luz aporta la energía utilizada por las bacterias fototróficas púrpuras.',
        offTitle: 'LUZ APAGADA',
        off: 'La actividad fotosintética disminuye.'
      },
      flow: {
        onTitle: 'FLUJO',
        on: 'La circulación mantiene las células y los nutrientes distribuidos por el cultivo.',
        offTitle: 'FLUJO APAGADO',
        off: 'La mezcla se ralentiza y el cultivo queda menos distribuido.'
      },
      nutrients: {
        onTitle: 'NUTRIENTES',
        on: 'El cultivo recibe carbono, nitrógeno y minerales.',
        offTitle: 'NUTRIENTES APAGADOS',
        off: 'La entrada de nutrientes queda en pausa.'
      },
      active: {
        onTitle: 'CULTIVO ACTIVO',
        on: 'La actividad metabólica se hace visible mediante la producción y el intercambio de gases.',
        offTitle: 'ACTIVIDAD APAGADA',
        off: 'La producción y el intercambio de gases se ven menos.'
      }
    }
  }
};

const museumContent = {


  bacteriaLarge01: {
    lead: 'Much more than photosynthesis', tags: ['PHOTOSYNTHESIS', 'METABOLIC DIVERSITY', 'PHA'], icon: 'cell',
    tier: 'primary', anchor: 'BACTERIA_MASTER',
    section: '01', title: 'PURPLE PHOTOTROPHIC BACTERIA', label: 'EXPLORE +',


    body: 'Purple phototrophic bacteria (PPB) are a diverse group of microorganisms capable of using light as a source of energy. What makes them particularly interesting, however, is not only their photosynthetic ability, but also the extraordinary variety of metabolic strategies they can develop.\n\nDepending on the species and environmental conditions, these bacteria can modify their metabolism, fix nitrogen, transform organic compounds, use certain gases, exchange electrons with minerals or electrodes, and store carbon in the form of PHA (biopolymers with potential applications in the production of bio-based plastics). Some strains are also particularly efficient at producing hydrogen, while the biomass obtained from their cultivation is being investigated for food and feed applications.\n\nThis diversity makes purple phototrophic bacteria important both for understanding fundamental biological processes (such as the conversion of light into energy and cellular adaptation to environmental conditions) and for investigating more sustainable biotechnological processes. Their cultivation opens possibilities related to hydrogen production, bioplastics, biomass and bioelectrochemical systems.\n\nBut they do not all behave in the same way.\n\nFrom this point onwards, the exhibition focuses on eight specific strains, revealing the characteristics and capabilities that distinguish each one.\n\n01. RHODOSPIRILLUM RUBRUM\nA key bacterium for understanding photosynthesis\n\nRhodospirillum rubrum has played an important role in the history of bacterial photosynthesis research. Its relatively simple photosynthetic apparatus made it one of the first model organisms used to investigate how energy from light is transformed, through electron transfer, into energy that the cell can use.\n\nIts study has also helped researchers understand the relationship between energy production, nitrogen fixation and carbon metabolism, showing how a bacterium can coordinate different processes depending on its needs and environmental conditions.\n\nIts relevance is not limited to fundamental research. R. rubrum can accumulate PHA in the form of intracellular granules. These compounds act as carbon reserves for the bacterium and can be used in the production of bio-based and biodegradable materials. The species is also currently being investigated as a potential nutritious ingredient for food and feed applications.\n\nSOURCE\nPHA in R. rubrum · DOI 10.1016/0141-8130(89)90040-8'
  },


  spaceMission: {
    dynamic: true, tier: 'primary',
    section: 'ISS', title: 'RHODOSPIRILLUM RUBRUM IN SPACE',
    lead: 'Seven days aboard the International Space Station',
    tags: ['SPACEFLIGHT', 'MICROGRAVITY', 'CLOSED-LOOP LIFE SUPPORT'],
    images: ['./assets/images/rhodospirillum-space-mission.jpg'],
    body: 'Future space missions will need ways to produce food, recycle waste and regenerate air and water without depending on constant supplies from Earth. One possible solution is to use beneficial microorganisms inside engineered closed-loop ecosystems.\n\nIn 2015, scientists sent Rhodospirillum rubrum and several other useful bacterial species to the International Space Station for seven days. The original culture was divided into two groups: one remained on Earth while the other travelled into low Earth orbit, where it experienced microgravity and increased radiation.\n\nAfter the flight, the researchers reactivated both cultures and compared them. R. rubrum survived the journey, grew normally and continued to perform its expected biological functions. The spaceflight appeared to have little effect on its overall performance.\n\nThese results support the possibility of using this purple bacterium, which is being investigated as a potential food/feed ingredient, in experimental life-support systems. In the future, microorganisms such as R. rubrum could help recycle resources, reduce dependence on terrestrial resupply and perhaps contribute to feeding astronauts during long-duration missions.\n\nSOURCE\nIlgrande et al., 2019 · DOI 10.1089/ast.2018.1973'
  },
  bacteriaSmall01: {
    lead: 'The machinery that converts light into energy', tags: ['REACTION CENTER', 'NOBEL PRIZE'], icon: 'form',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_base',
    section: '02', title: 'BLASTOCHLORIS VIRIDIS', label: 'VIEW +',
    images: ['./assets/images/blastochloris-viridis.png'],
    body: 'Inside photosynthetic bacteria, specialized structures capture light energy and begin its conversion into chemical energy. The photosynthetic reaction center of Blastochloris viridis occupies a particularly important place in the history of science.\n\nIt was the first membrane protein complex whose structure was resolved at atomic resolution. Observing its organization at this level of detail made it possible to better understand one of the essential processes of photosynthesis (the initial conversion of light energy into chemical energy).\n\nThis discovery went far beyond the study of a single bacterium. It opened new possibilities for investigating the structure of membrane proteins and contributed to the research recognized by the 1988 Nobel Prize in Chemistry.\n\nThe structure shown here is a later structure of the same reaction center, not the original one behind that prize.\n\nSOURCE\nStructure of the photosynthetic reaction center of Blastochloris viridis. PDB 5M7J · DOI 10.2210/pdb5M7J/pdb'
  },
  bacteriaSmall02: {
    lead: 'Changing from within to adapt', tags: ['CHROMATOPHORES', 'ADAPTATION'], icon: 'surface',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_10',
    section: '03', title: 'CEREIBACTER SPHAEROIDES', label: 'VIEW +',

    body: 'Bacteria are not static organisms. Some can modify their own cellular architecture in response to the conditions around them.\n\nCereibacter sphaeroides (formerly known as Rhodobacter sphaeroides) is one of the most extensively studied photosynthetic microorganisms and provides a particularly clear example of this ability to adapt.\n\nWhen oxygen availability decreases, the bacterium develops extensive intracellular membranes known as chromatophores. These membranes contain the machinery required for photosynthesis. As environmental conditions change, the internal organization of the cell changes as well.\n\nResearch on C. sphaeroides has helped scientists understand both the molecular mechanisms of electron transfer during photosynthesis and the way microorganisms regulate and reorganize their metabolism in response to changing environments.'
  },
  bacteriaSmall03: {
    lead: 'Coordinating light, nitrogen and energy', tags: ['NITROGEN FIXATION', 'REDOX BALANCE'], icon: 'wave',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_12',
    section: '04', title: 'RHODOBACTER CAPSULATUS', label: 'VIEW +',

    body: 'A cell must coordinate many processes at the same time. Rhodobacter capsulatus has become an important model organism for studying how a photosynthetic bacterium maintains this balance.\n\nResearch on this species has revealed important connections between photosynthesis, nitrogen fixation and cellular redox balance. These processes are interconnected and form part of the regulatory networks controlling how the cell obtains and uses energy.\n\nMore recently, structural studies have revealed an unusually compact architecture in its light-harvesting and reaction-center complex.\n\nIts study demonstrates that even within purple phototrophic bacteria, different biological solutions exist for capturing light, managing energy and responding to changing environmental conditions.'
  },
  bacteriaLarge02: {
    lead: 'A different way to reproduce', tags: ['HYPHAE', 'BUDDING', 'LIFE CYCLE'], icon: 'transform',
    tier: 'primary', anchor: 'Exhibit_Mesh0_Capsule',
    section: '05', title: 'RHODOMICROBIUM VANNIELII', label: 'EXPLORE +',


    images: ['./assets/videos/rhodomicrobium-vannielii-animation.mp4', './assets/images/rhodomicrobium-budding.jpg'],
    body: 'We often imagine bacteria reproducing through a simple division in which one cell produces two almost identical cells. Rhodomicrobium vannielii shows that bacterial reproduction can be considerably more complex.\n\nThis bacterium develops filamentous extensions known as hyphae. New cells are formed by budding from the tips of these structures. A small bud appears, gradually grows and eventually separates to form a new cell.\n\nThis life cycle includes processes of cellular differentiation and unusual multicellular stages, making R. vannielii an important organism for studying the evolution of complex bacterial life cycles.\n\nIts distinctive morphology also provides a striking example of the extraordinary diversity found among photosynthetic bacteria.'
  },
  bacteriaSmall04: {
    lead: 'Bacteria connected to electricity', tags: ['ELECTROACTIVITY', 'BIOELECTROCHEMISTRY'], icon: 'grid',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_14',
    section: '06', title: 'RHODOVULUM', label: 'VIEW +',


    images: ['./assets/images/rhodovulum-electroactivity.jpg'],
    body: 'Some purple phototrophic bacteria have a particularly remarkable ability (they are electroactive). This means that they can exchange electrons with elements outside the cell.\n\nSpecies of Rhodovulum (including Rhodovulum sulfidophilum and Rhodovulum visakhapatnamense) can obtain electrons from hydrogen, iron or even directly from an electrode.\n\nThese processes allow us to understand the bacterium not as an isolated organism, but as part of a system in which biological matter and conductive materials can exchange electrical charges.\n\nThe mechanisms responsible for this electroactivity are still not completely understood. For this reason, these bacteria remain an active field of research and provide new opportunities to investigate interactions between microorganisms, minerals and bioelectrochemical systems.\n\nSOURCE\nRhodovulum sulfidophilum AB26 · DOI 10.1038/s41396-021-01015-8'
  },
  bacteriaSmall05: {
    lead: 'Living from a toxic gas', tags: ['CARBON MONOXIDE', 'BIOHYDROGEN'], icon: 'scale',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_16',
    section: '07', title: 'RUBRIVIVAX GELATINOSUS', label: 'VIEW +',

    body: 'Carbon monoxide (CO) is toxic to many organisms. Rubrivivax gelatinosus, however, is able to use it as an energy source.\n\nUnder anaerobic conditions (in the absence of oxygen), some purple phototrophic bacteria can oxidize CO using specialized enzyme systems. In R. gelatinosus, this metabolism can also be linked to hydrogen production.\n\nThis ability has made the species an important model for studying both the biological conversion of carbon monoxide and potential processes for biohydrogen production.\n\nIts case illustrates one of the key ideas running throughout this room (the remarkable metabolic flexibility of purple phototrophic bacteria and their ability to exploit substances and environmental conditions that would be unfavorable for many other organisms).'
  },
  bacteriaSmall06: {
    lead: 'When a biological capability becomes an opportunity', tags: ['PHOTOFERMENTATION', 'ELECTROACTIVITY'], icon: 'transform',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_18',
    section: '08', title: 'RHODOPSEUDOMONAS PALUSTRIS', label: 'VIEW +',


    images: ['./assets/images/b1.png', './assets/images/b3.png'],
    body: 'Rhodopseudomonas palustris brings together several of the capabilities explored throughout the exhibition.\n\nIt can use light to support the anaerobic degradation of aromatic compounds derived from plants, contributing to the recycling of complex organic matter and to processes associated with the carbon cycle.\n\nIt is also particularly effective at producing hydrogen through photofermentation. Among the purple phototrophic bacteria studied for this process, certain strains of R. palustris (such as strain 42OL) have achieved especially high hydrogen productivity.\n\nIt has another important characteristic as well (electroactivity). Some strains can exchange electrons with electrodes and, by combining electricity and light, use these processes to generate valuable products such as PHA and certain biofuels.\n\nAt this point, we have finished looking closely at the bacteria themselves. The next step is to understand how they can be cultivated and how these capabilities can be used at a larger scale.\n\nR. palustris is also a model for microbial electroactivity. The strain TIE-1 can take up electrons from an electrode under illuminated conditions and use carbon dioxide as a carbon source. This metabolism has been investigated for the production of compounds including PHA and n-butanol.\n\nSOURCE\nR. palustris 42OL, photofermentation · DOI 10.1155/2012/590693\nTIE-1 on an electrode: Bose et al., 2014, Nature Communications'
  },


  reactor01: {
    lead: 'Creating the right conditions for microbial growth',
    tags: ['CULTIVATION', 'CONTROLLED CONDITIONS', 'PROCESS'], icon: 'reactor',
    tier: 'primary', anchor: 'PEANA_Bioreactor',
    title: 'PHOTOBIOREACTOR', label: 'VIEW PROCESS +',


    images: ['./assets/images/reactor-cultivation-01.jpg', './assets/images/reactor-cultivation-02.jpg'],
    body: 'FROM BACTERIA TO BIOPROCESS\n\nIn the previous room, we discovered the remarkable metabolic diversity of purple phototrophic bacteria.\n\nBut understanding what these microorganisms can do is only the beginning. To use their capabilities, researchers need to create controlled environments where bacteria receive the appropriate light, nutrients and operating conditions. Photobioreactors make this possible.\n\nInside these systems, microorganisms can be cultivated under controlled conditions, allowing researchers to study and develop processes related to hydrogen production, bioplastics, biomass and bioelectrochemical applications.\n\nIn this room, the focus moves from the microorganism itself to the process.\n\nPHOTOBIOREACTOR\n\nA photobioreactor provides a controlled environment for cultivating photosynthetic microorganisms.\n\nThe system allows key conditions such as light, nutrient supply and circulation to be managed while the culture grows. By controlling these variables, researchers can investigate how purple phototrophic bacteria transform resources and produce compounds of potential interest.\n\nThe reactor therefore represents the transition between understanding the biology of these microorganisms and using their capabilities in technological processes.'
  },


  window01: { display: false, tier: 'tertiary', windowIndex: 0, openable: true, icon: 'wave',
    section: '01', title: 'FROM LIGHT TO HYDROGEN', lead: 'Photofermentation',
    tags: ['HYDROGEN', 'PHOTOFERMENTATION'],
    images: ['./assets/images/photofermentation-culture.jpg'],
    body: 'Some purple phototrophic bacteria can use light energy to produce hydrogen through a process known as photofermentation.\n\nRhodopseudomonas palustris is particularly relevant in this field, with certain strains showing high hydrogen productivity.\n\nThis process illustrates how the metabolism of a microorganism can become the basis of a potential renewable energy pathway.' },
  window02: { display: false, tier: 'tertiary', windowIndex: 1, openable: true, icon: 'form',
    section: '02', title: 'FROM CARBON TO BIOPLASTIC', lead: 'PHA production',
    tags: ['PHA', 'BIOPLASTIC'],

    images: ['./assets/images/pha-granules-tem.jpg'],
    body: 'Some purple phototrophic bacteria can accumulate carbon inside their cells in the form of PHA.\n\nFor the microorganism, these compounds function as carbon and energy reserves. For biotechnology, however, PHA is especially interesting because it can be used as a basis for producing bio-based and biodegradable materials.\n\nThe process creates a direct connection between microbial metabolism and the development of alternative materials.' },
  window03: { display: false, tier: 'tertiary', windowIndex: 2, openable: true, icon: 'scale',
    section: '03', title: 'FROM CULTURE TO BIOMASS', lead: 'Food and feed applications',
    tags: ['BIOMASS', 'FOOD & FEED'],
    images: ['./assets/images/biomass-concentration.jpg'],
    body: 'Cultivating purple phototrophic bacteria also produces microbial biomass.\n\nThis biomass contains compounds of nutritional interest and is being investigated for possible applications in food and animal feed.\n\nThe challenge is not only to produce biomass, but also to develop cultivation systems capable of generating it efficiently and at an appropriate scale.' },
  window04: { display: false, tier: 'tertiary', windowIndex: 3, openable: true, icon: 'grid',
    section: '04', title: 'BIOELECTRICITY', lead: 'Microorganisms and electrodes',
    tags: ['ELECTROACTIVITY', 'BIOELECTROCHEMISTRY'],


    images: ['./assets/images/electroactivity-electrode-sem.jpg'],
    body: 'Some purple phototrophic bacteria are electroactive.\n\nThis means that they can exchange electrons with external materials, including electrodes.\n\nThese interactions allow researchers to investigate bioelectrochemical systems in which living microorganisms and conductive materials become part of the same process.\n\nElectroactivity opens new possibilities for connecting microbial metabolism with technological systems.' },
  window05: { display: false, tier: 'tertiary', windowIndex: 4, openable: true, icon: 'surface',
    section: '05', title: 'SCALE UP', lead: 'From laboratory to larger production',
    tags: ['SCALE-UP', 'PRODUCTION'],


    images: ['./assets/images/scaleup-bag-reactors-01.jpg', './assets/images/scaleup-bag-reactors-02.jpg'],
    body: 'A successful biological process must eventually move beyond the laboratory.\n\nOne strategy for reducing production and installation costs is to cultivate purple phototrophic bacteria in low-cost plastic bag reactors using food-grade equipment.\n\nInstead of building one increasingly large reactor, production capacity can be expanded by operating several reactors in parallel.\n\nThis approach offers a flexible way of increasing cultivation capacity while keeping the system relatively simple, and it can be run under sterile conditions.\n\nThe biomass obtained is studied as an ingredient for food and feed applications. Productivity can still be improved, but the system is viable and scalable.\n\nThese systems are currently being optimised at UMONS (Belgium), while PurpleTech develops capacity expansion through the parallel operation of multiple bag reactors.' },


  window06: { display: false, tier: 'tertiary', windowIndex: 5, openable: true, icon: 'transform',
    section: '06', title: 'ONE MICROORGANISM, MANY OUTPUTS', lead: 'Different processes, different possibilities',
    tags: ['HYDROGEN', 'PHA', 'BIOMASS', 'ELECTRON EXCHANGE'],


    images: ['./assets/images/process-overview.jpg'],
    body: 'Purple phototrophic bacteria do not lead to a single product or application.\n\nDepending on the strain, cultivation conditions and process, their metabolism can be connected to different outcomes.\n\nHYDROGEN\nPHA\nBIOMASS\nELECTRON EXCHANGE\n\nThe value of these microorganisms lies precisely in this diversity.\n\nDifferent bacteria, different processes and different possibilities.\n\nBACTERIA → PROCESS → RESULT\n\nUnderstanding the microorganism is the first step. Controlling the process is what allows its capabilities to be explored at a larger scale.' }
};


const translatedContent = window.MUSEUM_I18N
  && window.MUSEUM_I18N.content
  && window.MUSEUM_I18N.content[MUSEUM_LANGUAGE];
if (translatedContent) {
  Object.keys(translatedContent).forEach((id) => {
    if (museumContent[id]) museumContent[id] = { ...museumContent[id], ...translatedContent[id] };
  });
}


const PANEL_KEYWORDS = [
  'International Space Station', 'closed-loop ecosystems', 'life-support systems',
  'microgravity', 'spaceflight', 'radiation',
  'photosynthetic reaction center', 'reaction center',
  'carbon monoxide (CO)', 'carbon monoxide',
  'anaerobic conditions', 'anaerobic degradation', 'anaerobic',
  'hydrogen production', 'hydrogen productivity', 'biohydrogen', 'hydrogen',
  'electroactivity', 'electroactive',
  'photofermentation',
  'nitrogen fixation',
  'electron exchange', 'electron transfer', 'electrons',
  'chromatophores',
  'redox balance',
  'bioelectrochemical', 'bioelectrochemistry',
  'PHA',
  'Estación Espacial Internacional', 'ecosistemas cerrados', 'sistemas de soporte vital',
  'microgravedad', 'vuelo espacial', 'radiación',
  'centro de reacción fotosintético', 'centro de reacción',
  'monóxido de carbono (CO)', 'monóxido de carbono',
  'condiciones anaerobias', 'degradación anaerobia', 'anaerobia',
  'producción de hidrógeno', 'productividad de hidrógeno', 'biohidrógeno', 'hidrógeno',
  'electroactividad', 'electroactivas',
  'fotofermentación',
  'fijación de nitrógeno',
  'intercambio de electrones', 'transferencia de electrones', 'electrones',
  'cromatóforos',
  'equilibrio redox',
  'bioelectroquímicos', 'bioelectroquímica'
].sort((a, b) => b.length - a.length);

const PANEL_KEYWORDS_RE = new RegExp(
  '(' + PANEL_KEYWORDS.map((k) => {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pre = /^\w/.test(k) ? '\\b' : '';
    const post = /\w$/.test(k) ? '\\b' : '';
    return pre + esc + post;
  }).join('|') + ')',
  'gi'
);

function escapeHtml(s) {
  return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function highlightKeywords(escapedText) {
  return escapedText.replace(PANEL_KEYWORDS_RE, '<strong>$1</strong>');
}


function renderPanelBody(rawText) {
  const highlighted = highlightKeywords(escapeHtml(rawText || ''));
  return highlighted
    .split(/\n\n+/)
    .map((para) => `<p>${para.split('\n').join('<br>')}</p>`)
    .join('');
}


function reparentPreservingWorld(child, newParent) {
  child.updateWorldMatrix(true, false);
  const worldMatrix = child.matrixWorld.clone();
  newParent.add(child);
  newParent.updateWorldMatrix(true, false);
  const parentInverse = new THREE.Matrix4().copy(newParent.matrixWorld).invert();
  const localMatrix = new THREE.Matrix4().multiplyMatrices(parentInverse, worldMatrix);
  localMatrix.decompose(child.position, child.quaternion, child.scale);
}


AFRAME.registerComponent('face-camera', {
  init() { this._target = new THREE.Vector3(); },
  tick() {
    const camera = this.el.sceneEl && this.el.sceneEl.camera;
    if (!camera) return;
    camera.getWorldPosition(this._target);
    this.el.object3D.lookAt(this._target);
  }
});


const PPB_CIRCLES = {
  PPB_VIDEO_01: { centroid: [-1.94093, 1.40719, 2.99479], normal: [0.92215, -0.38567, 0.02998], u: [0.37767, 0.88082, -0.28553], radius: 0.1904 },
  PPB_VIDEO_02: { centroid: [-1.84054, 1.39784, 2.26459], normal: [0.89861, -0.39303, 0.19501], u: [0.43474, 0.73765, -0.5166], radius: 0.1975 },
  PPB_VIDEO_03: { centroid: [-1.66489, 1.39732, 1.51321], normal: [0.89418, -0.40005, 0.20102], u: [0.4463, 0.76082, -0.47114], radius: 0.1955 },
  PPB_VIDEO_04: { centroid: [-1.97822, 1.39696, -2.11191], normal: [0.86051, -0.43998, -0.25679], u: [-0.50805, -0.70407, -0.49615], radius: 0.2058 },
  PPB_VIDEO_05: { centroid: [-2.18675, 1.40212, -2.87555], normal: [0.87692, -0.43359, -0.20738], u: [-0.48008, -0.76949, -0.42119], radius: 0.1942 },
  PPB_VIDEO_06: { centroid: [-2.30118, 1.40707, -3.61543], normal: [0.90425, -0.4241, -0.04974], u: [-0.4165, -0.85032, -0.32169], radius: 0.1944 }
};


AFRAME.registerComponent('place-ppb-circle', {
  schema: { id: { type: 'string' } },
  init() {
    const modelo = document.querySelector('#modelo');
    if (!modelo) return;
    modelo.addEventListener('museo-modules-loaded', () => this.place());
  },
  place() {
    const data = PPB_CIRCLES[this.data.id];
    const modelo = document.querySelector('#modelo');
    if (!data || !modelo) return;
    const scale = modelo.object3D.scale;

    const c = new THREE.Vector3(data.centroid[0], data.centroid[1], data.centroid[2]);
    const nRaw = new THREE.Vector3(data.normal[0], data.normal[1], data.normal[2]);
    const uRaw = new THREE.Vector3(data.u[0], data.u[1], data.u[2]);
    const vRaw = new THREE.Vector3().crossVectors(nRaw, uRaw).normalize();

    const worldPos = new THREE.Vector3(c.x * scale.x, c.y * scale.y, c.z * scale.z);

    const worldNormal = new THREE.Vector3(nRaw.x / scale.x, nRaw.y / scale.y, nRaw.z / scale.z).normalize();

    const uScaled = new THREE.Vector3(uRaw.x * scale.x, uRaw.y * scale.y, uRaw.z * scale.z);
    const uScaleFactor = uScaled.length();
    const worldU = uScaled.clone().addScaledVector(worldNormal, -uScaled.dot(worldNormal)).normalize();

    const vScaled = new THREE.Vector3(vRaw.x * scale.x, vRaw.y * scale.y, vRaw.z * scale.z);
    const vScaleFactor = vScaled.length();

    let worldV = new THREE.Vector3().crossVectors(worldNormal, worldU).normalize();
    let finalU = worldU;
    if (worldV.y < 0) { finalU = worldU.clone().negate(); worldV = worldV.clone().negate(); }

    const rotMatrix = new THREE.Matrix4().makeBasis(finalU, worldV, worldNormal);
    const quat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    const worldRadius = data.radius * (uScaleFactor + vScaleFactor) / 2;
    const forwardOffset = 0.015;

    this.el.object3D.position.copy(worldPos).addScaledVector(worldNormal, forwardOffset);
    this.el.object3D.quaternion.copy(quat);
    this.el.setAttribute('radius', worldRadius);
  }
});

AFRAME.registerComponent('exhibit-info', {
  schema: {
    show:  { type: 'number', default: 2.0 },
    close: { type: 'number', default: 3.5 }
  },
  init() {
    this.items = [];
    this.active = null;
    this.openId = null;
    this.nextCheck = 0;
    this.tmp = new THREE.Vector3();

    this.ui = false;


    this.hoverId = null;
    this._hoverNdc = new THREE.Vector2();
    this._hoverRaycaster = new THREE.Raycaster();
    this._lastHoverCheck = 0;
    this.onMouseMove = (e) => this.updateHover(e.clientX, e.clientY);
    window.addEventListener('mousemove', this.onMouseMove);

    this.onKey = (e) => {
      if (e.key === 'Escape') this.close();


      if ((e.key === 'e' || e.key === 'E') && this.active && !this.openId) this.open(this.active.id);
    };
    window.addEventListener('keydown', this.onKey);

    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },


  wireUI() {
    if (this.ui) return true;
    this.panel = document.getElementById('exhibit-panel');
    this.intro = document.getElementById('intro-msg');
    if (!this.panel) return false;

    this.panel.querySelector('.panel-close').addEventListener('click', () => this.close());
    setTimeout(() => this.hideIntro(), 6500);
    this.ui = true;
    return true;
  },

  onLoaded() {
    const mesh = this.el.object3D;
    if (!mesh) return;
    this.wireUI();
    const byName = {};
    const turquesaAlto = [];
    mesh.traverse((o) => {
      if (!o.isMesh && !o.isObject3D) return;
      if (o.name) byName[o.name] = o;
      if (!o.isMesh || !o.material || o.material.name !== 'Neon_Turquoise') return;
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());


      if (c.x < 1.2 || s.y < 0.9 || s.y > 2.6 || Math.max(s.x, s.z) > 1.6) return;
      turquesaAlto.push({ o, p: c, minY: b.min.y, maxY: b.max.y });
    });


    turquesaAlto.sort((a, b) => a.p.z - b.p.z);
    const huecos = [];
    turquesaAlto.forEach((n) => {
      const cerca = huecos.find((h) => Math.abs(h.p.z - n.p.z) < 0.6);
      if (cerca) {
        cerca.p.lerp(n.p, 0.5);
        cerca.minY = Math.min(cerca.minY, n.minY);
        cerca.maxY = Math.max(cerca.maxY, n.maxY);
      } else {
        huecos.push({ p: n.p.clone(), minY: n.minY, maxY: n.maxY });
      }
    });

    this.items = [];
    Object.keys(museumContent).forEach((id) => {
      const data = museumContent[id];
      if (data.dynamic) return;
      let pos = null;
      let topY = null;
      let bottomY = null;
      let anchorObj = null;
      if (data.tier === 'tertiary') {
        const h = huecos[data.windowIndex];
        if (h) { pos = h.p.clone(); topY = h.maxY; bottomY = h.minY; }
      } else {
        const o = byName[data.anchor];
        if (o) {
          anchorObj = o;
          const box = new THREE.Box3().setFromObject(o);
          pos = box.getCenter(new THREE.Vector3());
          topY = box.max.y;
          bottomY = box.min.y;


          o.traverse((n) => { if (n.isMesh) n.userData.museoExhibitId = id; });


          if (id === 'reactor01') {
            mesh.traverse((n) => {
              if (n.isMesh && n.name && n.name.startsWith('Bioreactor_')) n.userData.museoExhibitId = id;
            });
          }
        }
      }
      if (pos) this.items.push({ id, data, pos, topY, bottomY, anchorObj });
      else console.warn('[exhibit-info] sin ancla:', id, data.anchor || 'ventana');
    });

    this.selectableMeshes = [];
    mesh.traverse((o) => { if (o.isMesh && o.userData.museoExhibitId) this.selectableMeshes.push(o); });


    this.peanaBoxes = [];
    mesh.traverse((o) => {
      if (o.isMesh && o.name.startsWith('PEANA_')) {
        const b = new THREE.Box3().setFromObject(o);
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());


        this.peanaBoxes.push({
          center: c, radius: Math.max(s.x, s.z) / 2,
          radiusX: s.x / 2, radiusZ: s.z / 2,
          minY: b.min.y, maxY: b.max.y
        });
      }
    });


    this._placardRowDir = null;
    {
      const secondary = this.items.filter((i) => i.data.tier === 'secondary' && i.id.startsWith('bacteria'));
      if (secondary.length) {
        let avgX = 0, avgZ = 0;
        secondary.forEach((i) => { avgX += i.pos.x; avgZ += i.pos.z; });
        avgX /= secondary.length; avgZ /= secondary.length;
        const hero = this.items.find((i) => i.id === 'bacteriaLarge01');
        const spawn = window.MUSEO_SPAWN;
        const bounds = window.MUSEO_BOUNDS;
        let tx = null, tz = null;
        if (hero) { tx = hero.pos.x; tz = hero.pos.z; }
        else if (spawn && typeof spawn.x === 'number') { tx = spawn.x; tz = spawn.z; }
        else if (bounds) { tx = (bounds.minX + bounds.maxX) / 2; tz = (bounds.minZ + bounds.maxZ) / 2; }
        if (tx !== null) {
          const dx = tx - avgX, dz = tz - avgZ;
          const len = Math.hypot(dx, dz);
          if (len > 0.001) this._placardRowDir = { x: dx / len, z: dz / len };
        }
      }
    }


    this.items.forEach((it) => {
      if (it.data.tier === 'tertiary' || !it.id.startsWith('bacteria')) return;
      this.setupHoverAffordance(it);
    });


    this.items.forEach((it) => {
      if (it.data.tier !== 'tertiary' || !it.data.openable) return;
      this.setupWindowTag(it);
    });

    console.log(`[exhibit-info] ${this.items.length} piezas activas, ${this.selectableMeshes.length} mallas seleccionables por click/tap, ` +
      `${this.items.filter((i) => i.pivot).length} con lenguaje visual de hover`);
  },


  setupHoverAffordance(it) {
    const anchorObj = it.anchorObj;
    if (!anchorObj) return;


    let p = anchorObj;
    while (p && !p.el) p = p.parent;
    const wrapperEl = p && p.el;
    if (!wrapperEl || !wrapperEl.object3D || !wrapperEl.object3D.parent) return;
    const wrapperObj = wrapperEl.object3D;
    const parent = wrapperObj.parent;

    parent.updateWorldMatrix(true, false);
    const pivot = new THREE.Group();
    pivot.name = `hover-pivot-${it.id}`;
    pivot.position.copy(parent.worldToLocal(it.pos.clone()));
    parent.add(pivot);
    pivot.updateWorldMatrix(true, false);
    reparentPreservingWorld(wrapperObj, pivot);

    it.pivot = pivot;
    it.hoverT = 0;


    const mats = new Set();
    const black = new THREE.Color(0, 0, 0);
    anchorObj.traverse((n) => {
      if (n.isMesh && n.material && n.material.emissive && !n.material.emissive.equals(black)) {
        mats.add(n.material);
      }
    });
    it.emissiveMats = Array.from(mats).map((mat) => ({ mat, base: mat.emissiveIntensity }));


    it.placard = this.createPedestalPlacard(it);
  },


  wallFacingDir(pos) {
    const bounds = window.MUSEO_BOUNDS;
    if (!bounds) return { x: 0, z: -1 };
    const dLeft = pos.x - bounds.minX;
    const dRight = bounds.maxX - pos.x;
    const dNear = pos.z - bounds.minZ;
    const dFar = bounds.maxZ - pos.z;
    const min = Math.min(dLeft, dRight, dNear, dFar);
    if (min === dRight) return { x: -1, z: 0 };
    if (min === dLeft) return { x: 1, z: 0 };
    if (min === dFar) return { x: 0, z: -1 };
    return { x: 0, z: 1 };
  },


  setupWindowTag(it) {


    const dir = this.wallFacingDir(it.pos);
    const dirX = dir.x, dirZ = dir.z;
    const yaw = Math.atan2(dirX, dirZ);


    const HEIGHT = 0.26;
    const WIDTH = it.id === 'window04' ? 0.392 : 0.28;


    const spawn = window.MUSEO_SPAWN;
    const floorY = (spawn && typeof spawn.y === 'number')
      ? spawn.y
      : (it.bottomY !== null ? it.bottomY - 1.0 : it.pos.y - 1.2);
    const STAND_OUT = 0.40;
    const SIGN_CENTER_Y = floorY + 1.15;
    const POLE_RADIUS = 0.012;
    const poleH = Math.max(0.3, SIGN_CENTER_Y - floorY - HEIGHT * 0.5);

    const px = it.pos.x + dirX * STAND_OUT;
    const pz = it.pos.z + dirZ * STAND_OUT;

    const wrapper = document.createElement('a-entity');
    wrapper.object3D.position.set(px, floorY, pz);
    wrapper.object3D.rotation.set(0, yaw, 0);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, poleH, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.5, metalness: 0.35 })
    );
    pole.position.set(0, poleH / 2, 0);
    wrapper.object3D.add(pole);


    const texture = this.buildPlacardTextTexture(
      it.data.section || '', (it.data.title || '').toUpperCase(), museumText('clickToExplore'),
      HEIGHT, WIDTH, ROOM2_ACCENT, ROOM2_ACCENT_LIGHT
    );
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, HEIGHT),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, map: texture,
        emissive: new THREE.Color(ROOM2_ACCENT), emissiveIntensity: 0.08,
        roughness: 0.9, metalness: 0, side: THREE.DoubleSide
      })
    );
    plane.position.set(0, poleH + HEIGHT * 0.5, 0.001);
    plane.userData.museoExhibitId = it.id;
    wrapper.object3D.add(plane);
    this.selectableMeshes.push(plane);

    this.el.sceneEl.appendChild(wrapper);


    it.pivot = wrapper.object3D;
    it.hoverT = 0;
    it.emissiveMats = [{ mat: plane.material, base: plane.material.emissiveIntensity }];
    it.tag = { wrapper, plane, pole };
  },


  getPlacardPaperTexture() {
    if (this._placardPaperTexture) return this._placardPaperTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 900; i++) {
      const v = 210 + Math.floor(Math.random() * 45);
      ctx.fillStyle = `rgba(${v},${v},${v},0.10)`;
      ctx.fillRect(Math.random() * 96, Math.random() * 96, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    this._placardPaperTexture = t;
    return this._placardPaperTexture;
  },


  wrapCanvasText(ctx, text, maxWidthPx) {
    const words = (text || '').split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(test).width > maxWidthPx) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines;
  },


  buildPlacardTextTexture(section, title, cueText, heightM, widthM, accentColor, cueColor) {


    const numberColor = accentColor || '#74349A';
    const cueTextColor = cueColor || '#805096';
    const HPX = 640;
    const WPX = Math.max(64, Math.round(HPX * (widthM / heightM)));
    const c = document.createElement('canvas');
    c.width = WPX; c.height = HPX;
    const ctx = c.getContext('2d');
    const pxPerM = HPX / heightM;


    ctx.fillStyle = '#F7F4EE';
    ctx.fillRect(0, 0, WPX, HPX);
    const grano = Math.round((WPX * HPX) / 700);
    for (let i = 0; i < grano; i++) {
      const v = 205 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgba(${v},${v},${v},0.05)`;
      ctx.fillRect(Math.random() * WPX, Math.random() * HPX, 1, 1);
    }


    const numberSizePx = heightM * 0.105 * pxPerM;
    let titleSizePx = heightM * 0.125 * pxPerM;
    const cueSizePx = heightM * 0.070 * pxPerM;
    const gap1Px = heightM * 0.050 * pxPerM;
    const gap2Px = heightM * 0.055 * pxPerM;
    const padSidePx = WPX * 0.09;
    const lineSpacing = 1.18;
    const maxTextWidth = WPX - padSidePx * 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.font = `600 ${titleSizePx}px Helvetica, Arial, sans-serif`;
    let lines = title ? this.wrapCanvasText(ctx, title, maxTextWidth) : [];
    while (lines.some((line) => ctx.measureText(line).width > maxTextWidth) &&
           titleSizePx > heightM * 0.078 * pxPerM) {
      titleSizePx -= 2;
      ctx.font = `600 ${titleSizePx}px Helvetica, Arial, sans-serif`;
      lines = this.wrapCanvasText(ctx, title, maxTextWidth);
    }
    const titleBlockH = lines.length * titleSizePx * lineSpacing;


    const contentH = (section ? numberSizePx + gap1Px : 0) + titleBlockH +
                      (cueText ? gap2Px + cueSizePx : 0);
    let cy = Math.max((HPX - contentH) / 2, HPX * 0.06);

    if (section) {
      ctx.font = `600 ${numberSizePx}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = numberColor;
      cy += numberSizePx * 0.85;
      ctx.fillText(section, WPX / 2, cy);
      cy += numberSizePx * 0.15 + gap1Px;
    }

    ctx.font = `600 ${titleSizePx}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = '#201A1E';
    lines.forEach((line, i) => {
      cy += titleSizePx * 0.85;
      ctx.fillText(line, WPX / 2, cy);
      cy += titleSizePx * (lineSpacing - 0.85);
    });

    if (cueText) {
      cy += gap2Px - titleSizePx * (lineSpacing - 0.85);
      ctx.font = `600 ${cueSizePx}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = cueTextColor;
      cy += cueSizePx * 0.85;
      ctx.fillText(cueText, WPX / 2, cy);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },


  createPedestalPlacard(it) {
    let peanaRadius = 0.22, peanaRadiusX = 0.22, peanaRadiusZ = 0.22, peanaMinY = null, peanaMaxY = null;
    let px = it.pos.x, pz = it.pos.z;
    let nearest = null, nearestD = Infinity;
    (this.peanaBoxes || []).forEach((pb) => {
      const d = Math.hypot(pb.center.x - it.pos.x, pb.center.z - it.pos.z);
      if (d < nearestD) { nearestD = d; nearest = pb; }
    });
    if (nearest) {
      peanaRadius = nearest.radius;
      peanaRadiusX = nearest.radiusX;
      peanaRadiusZ = nearest.radiusZ;
      peanaMinY = nearest.minY;
      peanaMaxY = nearest.maxY;
      px = nearest.center.x;
      pz = nearest.center.z;
    }


    let dirX = 0, dirZ = 1;
    if (this._placardRowDir) {
      dirX = this._placardRowDir.x;
      dirZ = this._placardRowDir.z;
    } else {
      const spawn = window.MUSEO_SPAWN;
      const bounds = window.MUSEO_BOUNDS;
      let tx = null, tz = null;
      if (spawn && typeof spawn.x === 'number') { tx = spawn.x; tz = spawn.z; }
      else if (bounds) { tx = (bounds.minX + bounds.maxX) / 2; tz = (bounds.minZ + bounds.maxZ) / 2; }
      if (tx !== null) {
        const dx = tx - px, dz = tz - pz;
        const len = Math.hypot(dx, dz);
        if (len > 0.001) { dirX = dx / len; dirZ = dz / len; }
      }
    }
    const yaw = Math.atan2(dirX, dirZ);

    const peanaHeightM = (peanaMinY !== null && peanaMaxY !== null) ? (peanaMaxY - peanaMinY) : null;
    const isLowWidePlinth = peanaHeightM !== null && peanaHeightM < 0.35;


    const isEllipticalPlinth = isLowWidePlinth &&
      Math.abs(peanaRadiusX - peanaRadiusZ) > 0.03 * Math.max(peanaRadiusX, peanaRadiusZ);


    const ARC_DEG = isLowWidePlinth ? 50 : 82;
    const ARC = ARC_DEG * Math.PI / 180;
    const PLACARD_HEIGHT = isLowWidePlinth ? 0.15 : 0.26;
    const heightFrac = isLowWidePlinth ? 0.50 : 0.58;
    const segs = Math.max(10, Math.round(ARC_DEG / 6));

    const spawn = window.MUSEO_SPAWN;
    const floorY = (spawn && typeof spawn.y === 'number')
      ? spawn.y
      : (it.bottomY !== null ? it.bottomY - 0.9 : it.pos.y - 1.2);
    const py = (peanaMinY !== null && peanaMaxY !== null)
      ? peanaMinY + peanaHeightM * heightFrac
      : floorY + 0.55;

    const wrapper = document.createElement('a-entity');
    wrapper.object3D.position.set(px, py, pz);

    let curveGeo, arcLengthM;
    if (isEllipticalPlinth) {

      const rx = peanaRadiusX + 0.008, rz = peanaRadiusZ + 0.008;


      const thetaCenter = Math.atan2(dirX * rx, dirZ * rz);
      const thetaStart = thetaCenter - ARC / 2;

      wrapper.object3D.rotation.set(0, 0, 0);
      curveGeo = new THREE.CylinderGeometry(1, 1, PLACARD_HEIGHT, segs, 1, true, thetaStart, ARC);
      curveGeo.scale(rx, 1, rz);


      const rEff = Math.hypot(rx * Math.sin(thetaCenter), rz * Math.cos(thetaCenter));
      arcLengthM = rEff * ARC;
    } else {
      const CURVE_RADIUS = peanaRadius + 0.008;
      wrapper.object3D.rotation.set(0, yaw, 0);
      curveGeo = new THREE.CylinderGeometry(CURVE_RADIUS, CURVE_RADIUS, PLACARD_HEIGHT, segs, 1, true, -ARC / 2, ARC);
      arcLengthM = CURVE_RADIUS * ARC;
    }

    const texture = this.buildPlacardTextTexture(
      it.data.section || '', (it.data.title || '').toUpperCase(), museumText('clickToExplore'),
      PLACARD_HEIGHT, arcLengthM
    );
    const curve = new THREE.Mesh(
      curveGeo,
      new THREE.MeshStandardMaterial({
        color: 0xffffff, map: texture,
        roughness: 0.9, metalness: 0, side: THREE.DoubleSide
      })
    );
    curve.userData.museoExhibitId = it.id;
    wrapper.object3D.add(curve);
    this.selectableMeshes.push(curve);

    this.el.sceneEl.appendChild(wrapper);
    return { wrapper, curve };
  },


  updateHover(x, y) {
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - this._lastHoverCheck < 50) return;
    this._lastHoverCheck = now;

    if (!this.selectableMeshes || !this.selectableMeshes.length) return;
    const sceneEl = this.el.sceneEl;
    const canvas = sceneEl && sceneEl.canvas;
    const camera = sceneEl && sceneEl.camera;
    if (!canvas || !camera) return;


    const cameraEl = document.getElementById('camera');
    const drag = cameraEl && cameraEl.components && cameraEl.components['drag-look-controls'];
    if (drag && drag.dragging) { this.setHover(null); return; }

    const rect = canvas.getBoundingClientRect();
    this._hoverNdc.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
    this._hoverRaycaster.setFromCamera(this._hoverNdc, camera);
    const hits = this._hoverRaycaster.intersectObjects(this.selectableMeshes, false);
    this.setHover(hits.length ? hits[0].object.userData.museoExhibitId : null);
  },

  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    const canvas = this.el.sceneEl && this.el.sceneEl.canvas;
    if (canvas) canvas.style.cursor = id ? 'pointer' : 'grab';
  },

  tick(time) {
    if (!this.items.length) return;

    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp);


    this.items.forEach((it) => {
      if (!it.pivot) return;
      const isHovered = this.hoverId === it.id;
      it.hoverT += ((isHovered ? 1 : 0) - it.hoverT) * 0.08;

      const breathe = 0.5 + 0.5 * Math.sin(time * 0.0016);
      const scale = 1 + it.hoverT * (0.015 + 0.015 * breathe);
      it.pivot.scale.setScalar(scale);


      if (it.data.tier === 'primary' && it.placard && it.placard.wrapper) {
        it.placard.wrapper.object3D.scale.setScalar(scale);
      }

      if (it.emissiveMats.length) {
        const boost = 1 + it.hoverT * 0.35;
        it.emissiveMats.forEach(({ mat, base }) => { mat.emissiveIntensity = base * boost; });
      }
    });

    if (time < this.nextCheck) return;
    this.nextCheck = time + 180;
    if (!this.wireUI()) return;


    let mejor = null, mejorD = Infinity;
    this.items.forEach((it) => {
      if (it.data.tier === 'tertiary' && !it.data.openable) return;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < mejorD) { mejorD = d; mejor = it; }
    });
    this.active = (mejor && mejorD <= this.data.show) ? mejor : null;


    if (this.openId) {
      const abierto = this.items.find((i) => i.id === this.openId);
      if (abierto && Math.hypot(abierto.pos.x - p.x, abierto.pos.z - p.z) > this.data.close) this.close();
    }
  },

  open(id) {
    if (!id || !this.wireUI()) return;
    const it = this.items.find((i) => i.id === id);
    if (!it || (it.data.tier === 'tertiary' && !it.data.openable)) return;
    const d = it.data;
    this.panel.querySelector('.panel-section').textContent = d.section || '';
    this.panel.querySelector('.panel-section').style.display = d.section ? 'block' : 'none';
    this.panel.querySelector('.panel-title').textContent = d.title;
    const lead = this.panel.querySelector('.panel-lead');
    lead.textContent = d.lead || '';
    lead.style.display = d.lead ? 'block' : 'none';


    this.panel.querySelector('.panel-body').innerHTML = renderPanelBody(d.body);


    const imagesEl = this.panel.querySelector('.panel-images');
    if (imagesEl) {
      imagesEl.innerHTML = '';
      (d.images || []).forEach((src) => {
        const isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(src);
        if (isVideo) {
          const video = document.createElement('video');
          video.src = src;
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          video.playsInline = true;
          video.setAttribute('aria-label', d.title || '');
          video.addEventListener('canplay', () => {
            const p = video.play();
            if (p && p.catch) p.catch(() => {});
          }, { once: true });
          imagesEl.appendChild(video);
        } else {
          const img = document.createElement('img');
          img.src = src;
          img.alt = d.title || '';
          imagesEl.appendChild(img);
        }
      });
    }
    const tags = this.panel.querySelector('.panel-tags');
    tags.textContent = (d.tags || []).join(' · ');
    tags.style.display = (d.tags && d.tags.length) ? 'block' : 'none';
    this.panel.classList.toggle('secondary', d.tier === 'secondary' || d.tier === 'tertiary');


    this.panel.classList.toggle('room2', id.startsWith('reactor') || id.startsWith('window') || id === 'spaceMission');
    this.panel.classList.add('visible');
    const scroll = this.panel.querySelector('.panel-scroll');
    if (scroll) scroll.scrollTop = 0;
    this.openId = id;
    this.hideIntro();


    document.body.classList.add('panel-open');
  },

  close() {
    if (!this.openId || !this.panel) return;
    this.panel.classList.remove('visible');
    this.openId = null;
    document.body.classList.remove('panel-open');
  },

  hideIntro() {
    if (this.intro) this.intro.classList.add('hidden');
  },

  remove() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('mousemove', this.onMouseMove);
  }
});


AFRAME.registerComponent('space-mission-descent', {
  schema: {
    anchor: { type: 'string', default: 'Exhibit_Mesh0_Capsule' },
    trigger: { type: 'number', default: 2.35 },
    release: { type: 'number', default: 3.20 },
    duration: { type: 'number', default: 1.65 },
    modelScale: { type: 'number', default: 1.15 }
  },

  init() {
    this.modelReady = false;
    this.museumReady = false;
    this.ready = false;
    this.registered = false;
    this.active = false;
    this.progress = 0;
    this.hoverT = 0;
    this.nextDistanceCheck = 0;
    this.rigPosition = new THREE.Vector3();
    this.basePosition = new THREE.Vector3();
    this.leftPosition = new THREE.Vector3();
    this.rightPosition = new THREE.Vector3();

    this.onModelLoaded = () => {
      this.modelReady = true;
      this.trySetup();
    };
    this.onMuseumLoaded = () => {
      this.museumReady = true;


      setTimeout(() => this.trySetup(), 0);
    };

    this.el.addEventListener('model-loaded', this.onModelLoaded);
    const museum = document.getElementById('modelo');
    if (museum) museum.addEventListener('museo-modules-loaded', this.onMuseumLoaded);

    if (this.el.getObject3D('mesh')) this.modelReady = true;
    if (window.MUSEO_SPAWN) this.museumReady = true;
    this.trySetup();
  },

  trySetup() {
    if (this.ready || !this.modelReady || !this.museumReady) return;
    const museum = document.getElementById('modelo');
    const spawn = window.MUSEO_SPAWN;
    if (!museum || !spawn) return;

    museum.object3D.updateMatrixWorld(true);
    const anchor = museum.object3D.getObjectByName(this.data.anchor);
    if (!anchor) {
      console.warn('[space-mission-descent] no se encontro el ancla', this.data.anchor);
      return;
    }

    const anchorPosition = new THREE.Box3().setFromObject(anchor).getCenter(new THREE.Vector3());
    const towardVisitor = new THREE.Vector3(spawn.x - anchorPosition.x, 0, spawn.z - anchorPosition.z);
    if (towardVisitor.lengthSq() < 0.0001) towardVisitor.set(0, 0, 1);
    towardVisitor.normalize();


    this.basePosition.set(
      anchorPosition.x + towardVisitor.x * 0.82,
      spawn.y + 2.22,
      anchorPosition.z + towardVisitor.z * 0.82
    );
    this.visibleY = this.basePosition.y;
    this.hiddenY = spawn.y + 5.45;
    this.ceilingY = this.hiddenY + this.data.modelScale * 0.52;
    this.baseYaw = Math.atan2(spawn.x - this.basePosition.x, spawn.z - this.basePosition.z);

    this.el.object3D.position.set(this.basePosition.x, this.hiddenY, this.basePosition.z);
    this.el.object3D.rotation.set(0, this.baseYaw, 0);
    this.el.object3D.scale.setScalar(this.data.modelScale * 0.88);
    this.el.object3D.visible = false;

    this.leftAnchor = this.el.object3D.getObjectByName('CableAnchor_Left');
    this.rightAnchor = this.el.object3D.getObjectByName('CableAnchor_Right');
    this.createCables();
    this.createGlow();
    this.registerWithExhibitInfo();
    this.ready = true;
    console.log('[space-mission-descent] estacion preparada sobre', this.data.anchor, this.basePosition);
  },

  createCables() {
    if (!this.leftAnchor || !this.rightAnchor) return;
    this.cablePositions = new Float32Array(12);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.cablePositions, 3));
    this.cableMaterial = new THREE.LineBasicMaterial({
      color: 0xc1873b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: true
    });
    this.cables = new THREE.LineSegments(geometry, this.cableMaterial);
    this.cables.name = 'ISS_Suspension_Cables';
    this.cables.visible = false;
    this.el.sceneEl.object3D.add(this.cables);
  },

  createGlow() {
    this.greenGlow = new THREE.PointLight(0x36df84, 0, 3.0, 2);
    this.greenGlow.position.set(0, -0.18, 0.30);
    this.greenGlow.castShadow = false;
    this.el.object3D.add(this.greenGlow);
  },

  registerWithExhibitInfo() {
    if (this.registered) return true;
    const museum = document.getElementById('modelo');
    const info = museum && museum.components && museum.components['exhibit-info'];
    const data = museumContent.spaceMission;
    if (!info || !data || !info.items || !info.selectableMeshes) {
      setTimeout(() => this.registerWithExhibitInfo(), 60);
      return false;
    }

    const item = {
      id: 'spaceMission',
      data,
      pos: new THREE.Vector3(this.basePosition.x, this.visibleY, this.basePosition.z),
      topY: this.visibleY + 0.7,
      bottomY: this.visibleY - 0.7,
      anchorObj: this.el.object3D
    };
    info.items.push(item);
    this.infoItem = item;
    this.info = info;

    this.stationMeshes = [];
    this.el.object3D.traverse((node) => {
      if (!node.isMesh) return;
      node.userData.museoExhibitId = 'spaceMission';
      this.stationMeshes.push(node);
      info.selectableMeshes.push(node);
    });
    this.registered = true;
    return true;
  },

  updateCables() {
    if (!this.cables || !this.leftAnchor || !this.rightAnchor) return;
    this.el.object3D.updateMatrixWorld(true);
    this.leftAnchor.getWorldPosition(this.leftPosition);
    this.rightAnchor.getWorldPosition(this.rightPosition);
    const p = this.cablePositions;
    p.set([
      this.leftPosition.x, this.ceilingY, this.leftPosition.z,
      this.leftPosition.x, this.leftPosition.y, this.leftPosition.z,
      this.rightPosition.x, this.ceilingY, this.rightPosition.z,
      this.rightPosition.x, this.rightPosition.y, this.rightPosition.z
    ]);
    this.cables.geometry.attributes.position.needsUpdate = true;
    this.cables.geometry.computeBoundingSphere();
  },

  tick(time, delta) {
    if (!this.ready) return;
    const rig = document.getElementById('rig');
    if (!rig) return;

    if (time >= this.nextDistanceCheck) {
      this.nextDistanceCheck = time + 100;
      rig.object3D.getWorldPosition(this.rigPosition);
      const distance = Math.hypot(
        this.rigPosition.x - this.basePosition.x,
        this.rigPosition.z - this.basePosition.z
      );
      if (!this.active && distance <= this.data.trigger) {
        this.active = true;
        this.el.object3D.visible = true;
        if (this.cables) this.cables.visible = true;
      } else if (this.active && distance >= this.data.release) {
        this.active = false;
      }
    }

    const seconds = Math.min(0.05, (delta || 0) / 1000);
    const direction = this.active ? 1 : -1;
    this.progress = THREE.MathUtils.clamp(
      this.progress + direction * seconds / Math.max(0.25, this.data.duration),
      0,
      1
    );
    const eased = this.progress * this.progress * (3 - 2 * this.progress);
    const hovered = this.info && this.info.hoverId === 'spaceMission';
    this.hoverT += ((hovered ? 1 : 0) - this.hoverT) * 0.10;
    const settled = eased > 0.92 ? (eased - 0.92) / 0.08 : 0;
    const bob = settled * Math.sin(time * 0.00135) * 0.035;
    const yawDrift = settled * Math.sin(time * 0.00048) * 0.045;

    this.el.object3D.position.set(
      this.basePosition.x,
      THREE.MathUtils.lerp(this.hiddenY, this.visibleY, eased) + bob,
      this.basePosition.z
    );
    this.el.object3D.rotation.y = this.baseYaw + yawDrift;
    const scale = this.data.modelScale * (0.88 + 0.12 * eased) * (1 + this.hoverT * 0.025);
    this.el.object3D.scale.setScalar(scale);

    if (this.greenGlow) this.greenGlow.intensity = eased * (0.62 + this.hoverT * 0.45);
    if (this.cables) {
      this.cables.visible = this.progress > 0.005;
      this.cableMaterial.opacity = eased * 0.82;
      this.updateCables();
    }

    if (!this.active && this.progress <= 0.001) {
      this.el.object3D.visible = false;
      if (this.cables) this.cables.visible = false;
    }
  },

  remove() {
    this.el.removeEventListener('model-loaded', this.onModelLoaded);
    const museum = document.getElementById('modelo');
    if (museum) museum.removeEventListener('museo-modules-loaded', this.onMuseumLoaded);
    if (this.cables && this.cables.parent) this.cables.parent.remove(this.cables);
    if (this.cables) this.cables.geometry.dispose();
    if (this.cableMaterial) this.cableMaterial.dispose();
    if (this.info && this.stationMeshes) {
      this.info.selectableMeshes = this.info.selectableMeshes.filter((mesh) => !this.stationMeshes.includes(mesh));
      this.info.items = this.info.items.filter((item) => item.id !== 'spaceMission');
    }
  }
});


AFRAME.registerComponent('image-windows', {
  init() { this.el.addEventListener('museo-modules-loaded', () => this.onLoaded()); },

  lamina(d) {
    const W = 512, H = 360;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');


    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#161320'); g.addColorStop(1, '#241d2c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);


    ctx.lineWidth = 1.1;
    for (let i = 0; i < 26; i++) {
      const x = 40 + Math.random()*(W-80), y = 30 + Math.random()*(H-120);
      const r = 8 + Math.random()*34;
      ctx.strokeStyle = 'rgba(214,196,235,' + (0.10 + Math.random()*0.22).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.stroke();
      if (r > 20) { ctx.beginPath(); ctx.arc(x, y, r*0.42, 0, 6.28); ctx.stroke(); }
    }

    const v = ctx.createLinearGradient(0, H*0.45, 0, H);
    v.addColorStop(0, 'rgba(12,10,18,0)'); v.addColorStop(1, 'rgba(12,10,18,0.92)');
    ctx.fillStyle = v; ctx.fillRect(0, H*0.45, W, H*0.55);

    ctx.fillStyle = '#c79bf0';
    ctx.font = '600 20px Helvetica, Arial, sans-serif';
    ctx.fillText(d.number, 34, H - 92);
    ctx.fillStyle = '#f6f1ea';
    ctx.font = '600 34px Helvetica, Arial, sans-serif';
    ctx.fillText(d.title, 34, H - 56);
    ctx.fillStyle = 'rgba(246,241,234,0.62)';
    ctx.font = '17px Helvetica, Arial, sans-serif';

    const palabras = d.caption.split(' ');
    let linea = '', y = H - 28;
    palabras.forEach((w) => {
      if (ctx.measureText(linea + w).width > W - 68) { ctx.fillText(linea, 34, y); linea = ''; y += 21; }
      linea += w + ' ';
    });
    ctx.fillText(linea.trim(), 34, y);

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  onLoaded() {
    const comp = this.el.components['exhibit-info'];
    if (!comp || !comp.items.length) { setTimeout(() => this.onLoaded(), 300); return; }
    const mesh = this.el.object3D;
    const raiz = this.el.object3D;


    const marcos = [];
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.name !== 'Neon_Turquoise') return;
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());


      if (c.x < 1.2 || s.y < 0.9 || s.y > 2.6 || Math.max(s.x, s.z) > 1.6) return;
      marcos.push({ c, s });
    });

    const huecos = [];
    marcos.forEach((m) => {
      const h = huecos.find((h) => Math.abs(h.c.z - m.c.z) < 0.6);
      if (h) { h.s.max(m.s); } else { huecos.push({ c: m.c.clone(), s: m.s.clone() }); }
    });
    huecos.sort((a, b) => (b.s.y * Math.max(b.s.x, b.s.z)) - (a.s.y * Math.max(a.s.x, a.s.z)));

    const contenidos = comp.items.filter((i) => i.data.tier === 'tertiary' && i.data.display);
    let puestas = 0;
    contenidos.forEach((it, i) => {
      const h = huecos[i];
      if (!h) return;
      const tex = it.data.image ? new THREE.TextureLoader().load(it.data.image) : this.lamina(it.data);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.94,
                                                side: THREE.FrontSide, toneMapped: true });

      const ancho = Math.min(Math.max(h.s.z, 0.5) * 0.8, 1.1);
      const alto = Math.min(h.s.y * 0.66, 0.85);
      const plano = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), mat);
      const p = h.c.clone();
      p.x -= 0.04;
      raiz.worldToLocal(p);
      plano.position.copy(p);
      plano.renderOrder = 1;
      raiz.add(plano);
      const mirar = p.clone(); mirar.x -= 3;
      plano.lookAt(mirar);
      puestas++;
    });
    console.log(`[image-windows] ${puestas} vitrinas de imagen`);
  }
});

const MUSEO_APPLICATIONS = [
  { id: 'window01', key: 'hydrogen', cap: 'hydrogen' },
  { id: 'window02', key: 'pha', cap: 'pha' },
  { id: 'window03', key: 'biomass', cap: 'biomass' },
  { id: 'window04', key: 'electro', cap: 'electro' },
  { id: 'window05', key: 'scale' }
];

function canvasRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

AFRAME.registerComponent('application-visuals', {
  init() {
    this.cards = [];
    this.roomSigns = [];
    this.nextDraw = 0;
    this.tmp = new THREE.Vector3();
    this.el.addEventListener('museo-modules-loaded', () => window.setTimeout(() => this.onLoaded(), 0));
  },

  onLoaded() {
    const info = this.el.components['exhibit-info'];
    if (!info || !info.items || !info.items.length) {
      window.setTimeout(() => this.onLoaded(), 180);
      return;
    }

    MUSEO_APPLICATIONS.forEach((def) => {
      const it = info.items.find((item) => item.id === def.id);
      if (it) this.createApplicationCard(info, it, def);
    });
    if (!this.cards.some((card) => card.def.key === 'scale')) {
      this.createScaleFallbackCard(info);
    }
    this.createRoomSigns(info);
    console.log(`[application-visuals] ${this.cards.length} aplicaciones visuales y ${this.roomSigns.length} señales de sala`);
  },

  makeTexture() {
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 460;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { c, ctx, tex };
  },

  createApplicationCard(info, it, def) {
    const pack = window.getMuseumApplicationText ? window.getMuseumApplicationText(def.key) : null;
    const copy = pack || { title: def.key.toUpperCase(), short: '', steps: [] };
    const dir = info.wallFacingDir ? info.wallFacingDir(it.pos) : { x: -1, z: 0 };
    const front = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const height = Math.min(0.54, Math.max(0.40, ((it.topY || it.pos.y + 0.4) - (it.bottomY || it.pos.y - 0.4)) * 0.34));
    const width = height * 1.52;
    const p = it.pos.clone().addScaledVector(front, 0.055);
    p.y = it.pos.y + 0.03;

    const canvas = this.makeTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: canvas.tex, transparent: true, opacity: 0.94,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: true
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    plane.position.copy(p);
    faceMuseoFront(plane, front);
    plane.userData.museoExhibitId = it.id;
    if (info.selectableMeshes) info.selectableMeshes.push(plane);
    this.el.sceneEl.object3D.add(plane);

    const card = { def, copy, canvas, mat, plane, t: Math.random() * 10, lastUnlocked: false };
    this.cards.push(card);
    this.drawApplicationCard(card, 0);
  },

  createScaleFallbackCard(info) {
    const data = museumContent.window05;
    const windows = info.items
      .filter((item) => item.id.startsWith('window'))
      .sort((a, b) => a.pos.z - b.pos.z);
    const base = windows[windows.length - 1] || info.items.find((item) => item.id === 'reactor01');
    if (!data || !base) return;

    const dir = info.wallFacingDir ? info.wallFacingDir(base.pos) : { x: -1, z: 0 };
    const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const bounds = window.MUSEO_BOUNDS;
    const pos = base.pos.clone().addScaledVector(side, 0.72);
    if (bounds) {
      pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX + 0.55, bounds.maxX - 0.55);
      pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ + 0.55, bounds.maxZ - 0.55);
    }
    const item = {
      id: 'window05',
      data,
      pos,
      topY: base.topY,
      bottomY: base.bottomY,
      anchorObj: null
    };
    info.items.push(item);
    this.createApplicationCard(info, item, { id: 'window05', key: 'scale' });
  },

  drawApplicationCard(card, seconds) {
    const { ctx, tex, c } = card.canvas;
    const copy = card.copy;
    const w = c.width, h = c.height;
    const phase = (seconds || 0) + card.t;
    const unlocked = !!(card.def.cap && window.hasCapability && window.hasCapability(card.def.cap));
    const accent = '#4FE4DC';
    const ink = '#F7FCFA';
    const muted = 'rgba(247,252,250,0.70)';

    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#071516');
    g.addColorStop(1, '#1f2230');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(79,228,220,0.48)';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    this.fitCanvasFont(ctx, copy.title || '', 900, 34, w - 84, 20);
    ctx.fillText(copy.title || '', 42, 62);

    ctx.strokeStyle = 'rgba(79,228,220,0.30)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(42, 100);
    ctx.lineTo(w - 42, 100);
    ctx.stroke();

    if (card.def.key === 'pha') this.drawPha(ctx, phase);
    else if (card.def.key === 'hydrogen') this.drawHydrogen(ctx, phase);
    else if (card.def.key === 'electro') this.drawElectro(ctx, phase);
    else if (card.def.key === 'biomass') this.drawBiomass(ctx, phase);
    else if (card.def.key === 'scale') this.drawScale(ctx, phase);

    const barY = h - 72;
    ctx.fillStyle = unlocked || card.def.key === 'scale' ? 'rgba(79,228,220,0.14)' : 'rgba(247,252,250,0.07)';
    ctx.fillRect(42, barY, w - 84, 38);
    ctx.fillStyle = unlocked || card.def.key === 'scale' ? accent : muted;
    const bottomText = (unlocked || card.def.key === 'scale') ? (copy.short || '') : (copy.steps || []).join(' → ');
    this.fitCanvasFont(ctx, bottomText, 900, 26, w - 116, 15);
    ctx.fillText(bottomText, 58, barY + 20);

    tex.needsUpdate = true;
    card.lastUnlocked = unlocked;
  },

  arrow(ctx, x1, y1, x2, y2, color) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - 0.55) * 18, y2 - Math.sin(ang - 0.55) * 18);
    ctx.lineTo(x2 - Math.cos(ang + 0.55) * 18, y2 - Math.sin(ang + 0.55) * 18);
    ctx.closePath();
    ctx.fill();
  },

  pill(ctx, x, y, w, h, text, fill, color) {
    canvasRoundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(247,252,250,0.20)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color || '#F7FCFA';
    this.fitCanvasFont(ctx, text, 900, 28, w - 18, 14);
    ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + h / 2 + 2);
  },

  fitCanvasFont(ctx, text, weight, maxPx, maxWidth, minPx) {
    let size = maxPx;
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    while (size > minPx && ctx.measureText(String(text || '')).width > maxWidth) {
      size -= 2;
      ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    }
  },

  drawPha(ctx, phase) {
    const e = 0.5 + 0.5 * Math.sin(phase * 1.4);
    const granules = [[130, 202], [172, 230], [210, 196], [252, 228], [292, 204]];
    granules.forEach((p, i) => {
      ctx.fillStyle = `rgba(199,155,234,${0.42 + e * 0.38})`;
      ctx.beginPath();
      ctx.arc(p[0], p[1] + Math.sin(phase * 1.8 + i) * 5, 18, 0, Math.PI * 2);
      ctx.fill();
    });
    this.arrow(ctx, 328, 214, 406, 214, '#C79BEA');
    this.pill(ctx, 420, 176, 116, 76, 'PHA', 'rgba(125,63,168,0.34)', '#F1D5FF');
    this.arrow(ctx, 544, 214, 610, 214, '#C79BEA');
    canvasRoundRect(ctx, 620, 178, 58, 72, 10);
    ctx.fillStyle = `rgba(241,213,255,${0.42 + e * 0.35})`;
    ctx.fill();
    ctx.fillStyle = '#F7FCFA';
    ctx.font = '900 22px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BIO', 649, 214);
  },

  drawHydrogen(ctx, phase) {
    this.pill(ctx, 78, 174, 190, 76, (this.cardStep('hydrogen', 0) || 'LIGHT / CULTURE'), 'rgba(255,242,168,0.15)', '#FFF2A8');
    this.arrow(ctx, 292, 212, 404, 212, '#FFF2A8');
    const bubbles = museoMobileCount(6, 0.67, 4);
    for (let i = 0; i < bubbles; i++) {
      const t = (phase * 0.22 + i * 0.17) % 1;
      const x = 460 + i * 26 + Math.sin(phase + i) * 8;
      const y = 286 - t * 120;
      ctx.strokeStyle = `rgba(185,242,251,${1 - t * 0.65})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 14 + i % 2 * 4, 0, Math.PI * 2);
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.fillStyle = '#EAFBFF';
        ctx.font = '900 22px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('H₂', x, y + 2);
      }
    }
  },

  drawElectro(ctx, phase) {
    this.pill(ctx, 66, 176, 150, 72, (this.cardStep('electro', 0) || 'BACTERIUM'), 'rgba(125,63,168,0.22)', '#F1D5FF');
    canvasRoundRect(ctx, 530, 148, 72, 128, 10);
    ctx.fillStyle = 'rgba(247,252,250,0.12)';
    ctx.fill();
    ctx.strokeStyle = `rgba(79,228,220,${0.48 + 0.28 * Math.sin(phase * 2)})`;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#BFFCF7';
    ctx.font = '900 24px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.cardStep('electro', 2) || 'ELECTRODE', 566, 302);
    ctx.strokeStyle = 'rgba(79,228,220,0.38)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(224, 212);
    ctx.bezierCurveTo(310, 150, 410, 150, 520, 212);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(520, 228);
    ctx.bezierCurveTo(410, 290, 310, 290, 224, 228);
    ctx.stroke();
    const electrons = museoMobileCount(5, 0.60, 3);
    for (let i = 0; i < electrons; i++) {
      const t = (phase * 0.30 + i * 0.20) % 1;
      const x = 224 + (520 - 224) * t;
      const y = 212 + Math.sin(t * Math.PI * 2) * 48;
      ctx.fillStyle = '#6FFCF2';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#052123';
      ctx.font = '900 16px Arial, Helvetica, sans-serif';
      ctx.fillText('e⁻', x, y + 1);
    }
  },

  drawBiomass(ctx, phase) {
    const grow = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(phase * 1.1));
    this.pill(ctx, 72, 174, 150, 76, this.cardStep('biomass', 0) || 'CULTURE', 'rgba(79,228,220,0.13)', '#BFF6F1');
    this.arrow(ctx, 250, 212, 350, 212, '#4FE4DC');
    ctx.fillStyle = `rgba(176,108,232,${0.24 + grow * 0.32})`;
    ctx.beginPath();
    ctx.ellipse(432, 218, 54 + grow * 36, 26 + grow * 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F7FCFA';
    ctx.font = '900 28px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.cardStep('biomass', 1) || 'BIOMASS', 432, 218);
    this.arrow(ctx, 526, 212, 590, 212, '#4FE4DC');
    this.pill(ctx, 590, 178, 104, 68, this.cardStep('biomass', 2) || 'FOOD / FEED', 'rgba(247,252,250,0.10)', '#F7FCFA');
  },

  drawScale(ctx, phase) {
    const values = [1, 4, 8, 16];
    const active = Math.floor((phase * 0.55) % values.length);
    values.forEach((value, i) => {
      const x = 82 + i * 154;
      const on = i <= active;
      canvasRoundRect(ctx, x, 148, 94, 120, 16);
      ctx.fillStyle = on ? 'rgba(79,228,220,0.18)' : 'rgba(247,252,250,0.07)';
      ctx.fill();
      ctx.strokeStyle = on ? '#4FE4DC' : 'rgba(247,252,250,0.16)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = on ? '#BFF6F1' : 'rgba(247,252,250,0.42)';
      ctx.font = '900 42px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(value), x + 47, 210);
      if (i < values.length - 1) this.arrow(ctx, x + 108, 208, x + 142, 208, on ? '#4FE4DC' : 'rgba(247,252,250,0.24)');
    });
  },

  cardStep(key, index) {
    const copy = window.getMuseumApplicationText ? window.getMuseumApplicationText(key) : null;
    return copy && copy.steps ? copy.steps[index] : null;
  },

  createRoomSigns(info) {
    const room1 = this.averageItems(info.items.filter((it) => it.id.startsWith('bacteria')));
    const room2 = this.averageItems(info.items.filter((it) => it.id.startsWith('window') || it.id === 'reactor01'));
    if (room1) this.createRoomSign(window.getMuseumApplicationText('room01'), room1, 0.0);
    if (room2) this.createRoomSign(window.getMuseumApplicationText('room02'), room2, Math.PI);
  },

  averageItems(items) {
    if (!items.length) return null;
    const p = new THREE.Vector3();
    items.forEach((it) => p.add(it.pos));
    return p.multiplyScalar(1 / items.length);
  },

  createRoomSign(copy, pos, rotY) {
    if (!copy) return;
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 150;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(6, 14, 17, 0.62)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#4FE4DC';
    ctx.fillRect(0, 0, 8, c.height);
    ctx.fillStyle = '#4FE4DC';
    ctx.font = '900 30px Arial, Helvetica, sans-serif';
    ctx.fillText(copy.kicker || '', 34, 55);
    ctx.fillStyle = '#F7FCFA';
    ctx.font = '900 34px Arial, Helvetica, sans-serif';
    ctx.fillText(copy.title || '', 34, 104);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.70, 0.146), mat);
    const floor = window.MUSEO_SPAWN && typeof window.MUSEO_SPAWN.y === 'number' ? window.MUSEO_SPAWN.y : 0;
    plane.position.set(pos.x, floor + 0.014, pos.z);
    plane.rotation.set(-Math.PI / 2, 0, rotY);
    this.el.sceneEl.object3D.add(plane);
    this.roomSigns.push(plane);
  },

  visitorNearCards(distance) {
    if (!MUSEO_IS_MOBILE) return true;
    const rigPos = museoRigWorldPosition(this.tmp);
    if (!rigPos) return true;
    return this.cards.some((card) => museoDistanceXZ(rigPos, card.plane.position) < distance);
  },

  tick(time) {
    if (!this.cards.length) return;
    const unlockedChanged = this.cards.some((card) => {
      const unlocked = !!(card.def.cap && window.hasCapability && window.hasCapability(card.def.cap));
      return unlocked !== card.lastUnlocked;
    });
    const near = this.visitorNearCards(4.8);
    if (MUSEO_IS_MOBILE && !near && !unlockedChanged) return;
    if (!unlockedChanged && time < this.nextDraw) return;
    this.nextDraw = time + (MUSEO_IS_MOBILE ? (near ? 160 : 1100) : 90);
    const seconds = near ? (time || 0) / 1000 : 0;
    this.cards.forEach((card) => this.drawApplicationCard(card, seconds));
  },

  remove() {
    this.cards.forEach((card) => {
      if (card.plane && card.plane.parent) card.plane.parent.remove(card.plane);
      if (card.mat) card.mat.dispose();
    });
    this.roomSigns.forEach((sign) => { if (sign.parent) sign.parent.remove(sign); });
  }
});


AFRAME.registerComponent('electroactivity-exhibit', {
  schema: {
    target: { type: 'string', default: 'bacteriaSmall04' },
    trigger: { type: 'number', default: 2.2 },
    release: { type: 'number', default: 2.8 },
    maxElectrons: { type: 'number', default: 7 }
  },

  init() {
    this.ready = false;
    this.active = false;
    this.near = false;
    this.seq = -1;
    this.awarded = false;
    this.displayT = 0;
    this.nextSpawn = 0;
    this.pulseT = 0;
    this.retryCount = 0;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.electrons = [];
    this.curves = [];
    this.bacteriaMats = [];
    this.el.addEventListener('museo-modules-loaded', () => {
      window.setTimeout(() => this.setup(), 0);
    });
  },

  getText(key) {
    return window.getMuseumElectroactivityText ? window.getMuseumElectroactivityText(key) : key;
  },


  findVitrine(center) {
    let bell = null, base = null;
    this.el.object3D.traverse((o) => {
      if (!o.isMesh || !o.name) return;
      const isBell = o.name.indexOf('VITRINA_Campana') === 0;
      const isBase = o.name.indexOf('VITRINA_Base') === 0;
      if (!isBell && !isBase) return;
      const b = new THREE.Box3().setFromObject(o);
      const inXZ = center.x >= b.min.x - 0.02 && center.x <= b.max.x + 0.02 &&
                   center.z >= b.min.z - 0.02 && center.z <= b.max.z + 0.02;
      if (!inXZ) return;
      if (isBell && (!bell || b.max.y > bell.box.max.y)) bell = { obj: o, box: b };
      if (isBase && (!base || b.max.y > base.box.max.y)) base = { obj: o, box: b };
    });
    return { bell, base };
  },

  findNearestPeana(info, center) {
    let nearest = null, nearestD = Infinity;
    (info.peanaBoxes || []).forEach((pb) => {
      const d = Math.hypot(pb.center.x - center.x, pb.center.z - center.z);
      if (d < nearestD) { nearestD = d; nearest = pb; }
    });
    return nearest;
  },


  getFrontDirection(info, center) {
    if (info && info._placardRowDir) {
      return new THREE.Vector3(info._placardRowDir.x, 0, info._placardRowDir.z).normalize();
    }
    const spawn = window.MUSEO_SPAWN;
    if (spawn && typeof spawn.x === 'number') {
      const dx = spawn.x - center.x, dz = spawn.z - center.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) return new THREE.Vector3(dx / len, 0, dz / len);
    }
    return new THREE.Vector3(0, 0, 1);
  },

  setup() {
    const info = this.el.components['exhibit-info'];
    const item = info && info.items && info.items.find((it) => it.id === this.data.target);
    const anchor = item && item.anchorObj;
    if (!info || !item || !anchor) {
      this.retryCount += 1;
      if (this.retryCount < 30) window.setTimeout(() => this.setup(), 120);
      else console.warn('[electroactivity] no se pudo localizar Rhodovulum');
      return;
    }

    const box = new THREE.Box3().setFromObject(anchor);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const bacHeight = Math.max(0.05, size.y);

    const vitrine = this.findVitrine(center);
    const bellBox = vitrine.bell ? vitrine.bell.box : null;
    const bellCenter = bellBox ? bellBox.getCenter(new THREE.Vector3()) : center.clone();
    const bellRadius = bellBox
      ? Math.max(bellBox.max.x - bellBox.min.x, bellBox.max.z - bellBox.min.z) * 0.5
      : Math.max(size.x, size.z) * 0.5 + 0.05;

    const peana = this.findNearestPeana(info, center);
    const standTopY = peana && typeof peana.maxY === 'number'
      ? peana.maxY
      : (vitrine.base ? vitrine.base.box.min.y : box.min.y - 0.12);
    const standCenter = peana ? peana.center : bellCenter;
    const standRadius = peana ? peana.radius : bellRadius + 0.18;

    const front = this.getFrontDirection(info, center);

    const right = new THREE.Vector3(front.z, 0, -front.x).normalize();


    const margin = 0.055;
    const wanted = bellRadius + 0.072;
    const place = (dir, lateral) => bellCenter.clone()
      .addScaledVector(dir, lateral)
      .addScaledVector(front, -0.022);
    const fits = (p) => Math.hypot(p.x - standCenter.x, p.z - standCenter.z) <= standRadius - margin;

    let sideDir = right.clone();
    let lateral = wanted;
    let pos = place(sideDir, lateral);
    if (!fits(pos)) {
      const alt = place(right.clone().negate(), wanted);
      if (fits(alt)) { sideDir = right.clone().negate(); pos = alt; }
      else {

        while (lateral > bellRadius + 0.030 && !fits(pos)) {
          lateral -= 0.008;
          pos = place(sideDir, lateral);
        }
      }
    }
    pos.y = standTopY + 0.002;


    const plateH = THREE.MathUtils.clamp(bacHeight * 0.58, 0.046, 0.095);
    const plateW = plateH * 0.64;
    const plateT = 0.0038;
    const plateCY = center.y - bacHeight * 0.12;

    this.info = info;
    this.anchorObj = anchor;
    this.targetCenter = center;
    this.bacHeight = bacHeight;
    this.front = front;
    this.side = sideDir;
    this.electrodeBase = pos;
    this.plateGeom = { w: plateW, h: plateH, t: plateT, cy: plateCY };
    this.bellBox = bellBox;

    this.collectBacteriaMaterials(anchor);
    this.createElectrode();
    this.createPath();
    this.createGuide();
    this.createElectronPool();
    this.createLabel();
    this.hotspot = createMuseoHotspot({
      el: this.el, info,
      capability: 'electro',
      verb: ((window.getMuseumCapabilityText && window.getMuseumCapabilityText().verbs) || {}).electro || 'ACTIVATE ELECTRODE',
      position: museoHotspotSpot(bellBox, center, front),
      faceDirection: front,
      onActivate: () => this.start()
    });

    this.ready = true;
    console.log('[electroactivity] Rhodovulum listo', {
      bacteria: center.toArray().map((v) => +v.toFixed(3)),
      alturaBacteria: +bacHeight.toFixed(3),
      electrodo: pos.toArray().map((v) => +v.toFixed(3)),
      placa: [+plateW.toFixed(3), +plateH.toFixed(3)],
      campana: bellBox ? bellBox.max.toArray().map((v) => +v.toFixed(3)) : null
    });
  },

  collectBacteriaMaterials(anchor) {
    const mats = new Set();
    anchor.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      list.forEach((mat) => { if (mat && mat.emissive) mats.add(mat); });
    });
    this.bacteriaMats = Array.from(mats).map((mat) => ({
      mat, base: mat.emissiveIntensity || 0
    }));
  },


  createElectrode() {
    const sceneObj = this.el.sceneEl.object3D;
    const { w, h, t, cy } = this.plateGeom;
    const base = this.electrodeBase;

    const group = new THREE.Group();
    group.name = 'rhodovulum-electrodo';
    group.position.copy(base);

    const toBac = this.targetCenter.clone().sub(base); toBac.y = 0;
    if (toBac.lengthSq() < 1e-6) toBac.copy(this.front);
    toBac.normalize();
    group.rotation.y = Math.atan2(toBac.x, toBac.z);
    sceneObj.add(group);
    this.faceDir = toBac;

    const graphite = new THREE.MeshStandardMaterial({
      color: 0x1b1e20, roughness: 0.46, metalness: 0.62,
      emissive: 0x0d2b2b, emissiveIntensity: 0,
      transparent: true, opacity: 0
    });
    const turquoise = new THREE.MeshBasicMaterial({
      color: 0x3fd9d2, transparent: true, opacity: 0, depthWrite: false
    });
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x24282a, roughness: 0.5, metalness: 0.6,
      transparent: true, opacity: 0
    });

    const plateY = cy - base.y;
    const plateBottom = plateY - h / 2;


    const rim = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.0016, h + 0.0016), turquoise);
    rim.position.set(0, plateY, t / 2 - 0.0004);
    group.add(rim);

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), graphite);
    body.position.set(0, plateY, 0);
    group.add(body);

    const faceMat = new THREE.MeshBasicMaterial({
      map: this.buildElectrodeFaceTexture(), transparent: true, opacity: 0,
      depthWrite: false
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.94), faceMat);
    face.position.set(0, plateY, t / 2 + 0.0006);
    group.add(face);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0026, 0.0032, Math.max(0.004, plateBottom), 10), stemMat);
    stem.position.set(0, plateBottom / 2, 0);
    group.add(stem);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.40, w * 0.46, 0.005, 20), stemMat);
    foot.position.set(0, 0.0025, 0);
    group.add(foot);


    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 2.6, h * 1.9),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
    );
    hit.position.set(0, plateY, t / 2 + 0.004);
    group.add(hit);
    hit.userData.museoExhibitId = 'electroactivityElectrode';
    hit.userData.museoAction = () => this.start();
    if (this.info && this.info.selectableMeshes) this.info.selectableMeshes.push(hit);

    this.electrode = { group, graphite, turquoise, stemMat, faceMat, plateY, hit };
  },

  buildElectrodeFaceTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 400;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#5FEDE4';
    ctx.textAlign = 'center';
    ctx.font = '900 132px Arial, Helvetica, sans-serif';
    ctx.fillText(this.getText('electron'), c.width / 2, 215);
    ctx.fillStyle = 'rgba(233, 250, 248, 0.80)';
    ctx.font = '800 40px Arial, Helvetica, sans-serif';
    ctx.fillText(this.getText('electrode'), c.width / 2, 300);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  buildElectronLabelTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 72;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#BFFCF7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 48px Arial, Helvetica, sans-serif';
    ctx.fillText('e⁻', c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },


  createPath() {
    const base = this.electrodeBase;
    const { cy, t } = this.plateGeom;
    const start = new THREE.Vector3(base.x, cy, base.z).addScaledVector(this.faceDir, t / 2 + 0.003);
    const end = this.targetCenter.clone();
    this.pathStart = start;
    this.pathEnd = end;

    const lift = Math.max(0.016, start.distanceTo(end) * 0.16);
    const perp = new THREE.Vector3(this.faceDir.z, 0, -this.faceDir.x);
    this.curves = [-1, 0, 1].map((v) => {
      const mid = start.clone().lerp(end, 0.5)
        .addScaledVector(perp, v * 0.010)
        .add(new THREE.Vector3(0, lift * (1 + v * 0.14), 0));
      return new THREE.QuadraticBezierCurve3(start.clone(), mid, end.clone());
    });
  },


  createGuide() {
    const sceneObj = this.el.sceneEl.object3D;
    const group = new THREE.Group();
    group.name = 'rhodovulum-guia-electrones';
    sceneObj.add(group);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x3fd9d2, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curves[1], 44, 0.0014, 6, false), mat);
    group.add(tube);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.0068, 0.017, 12), mat);


    const tAt = 0.50;
    const p = this.curves[1].getPointAt(tAt);
    const tan = this.curves[1].getTangentAt(tAt).normalize();
    head.position.copy(p);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    group.add(head);

    this.guide = { group, mat };
  },

  createElectronPool() {
    const sceneObj = this.el.sceneEl.object3D;

    const geo = new THREE.SphereGeometry(0.0045, 10, 8);
    const trailGeo = new THREE.SphereGeometry(0.0026, 8, 6);
    const tagTex = this.buildElectronLabelTexture();
    this.electronGeo = geo;
    this.trailGeo = trailGeo;
    const electronCount = museoMobileCount(this.data.maxElectrons, 0.70, 4);
    for (let i = 0; i < electronCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x6ffcf2, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      sceneObj.add(mesh);
      const trails = [0.045, 0.09].map(() => {
        const tm = new THREE.MeshBasicMaterial({
          color: 0x4fe4dc, transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending
        });
        const t = new THREE.Mesh(trailGeo, tm);
        t.visible = false;
        sceneObj.add(t);
        return { mesh: t, mat: tm };
      });
      let tag = null, tagMat = null;
      if (i % 3 === 0) {
        tagMat = new THREE.MeshBasicMaterial({
          map: tagTex, transparent: true, opacity: 0,
          depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        tag = new THREE.Mesh(new THREE.PlaneGeometry(0.020, 0.011), tagMat);
        tag.visible = false;
        sceneObj.add(tag);
      }
      this.electrons.push({ mesh, mat, trails, tag, tagMat, active: false, t: 0, speed: 0.55, curve: i % 3 });
    }
  },


  createLabel() {
    const sceneObj = this.el.sceneEl.object3D;
    const group = new THREE.Group();
    group.name = 'rhodovulum-microetiqueta';
    const base = this.electrodeBase;
    const topPlate = this.plateGeom.cy + this.plateGeom.h / 2;
    const bellTop = this.bellBox ? this.bellBox.max.y : topPlate + 0.2;


    const y = Math.min(topPlate + 0.048, bellTop - 0.030);
    group.position.set(base.x + this.side.x * 0.022, y, base.z + this.side.z * 0.022);
    sceneObj.add(group);
    faceMuseoFront(group, this.front);

    const tex = this.buildLabelTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.160, 0.043), mat);
    group.add(plane);
    this.label = { group, mat, plane };
  },

  buildLabelTexture() {
    const c = document.createElement('canvas');
    c.width = 740; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(6, 14, 17, 0.62)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#4FE4DC';
    ctx.fillRect(0, 0, 7, c.height);
    ctx.textAlign = 'left';


    const fit = (text, weight, maxPx, boxW) => {
      let size = maxPx;
      ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
      while (size > 22 && ctx.measureText(text).width > boxW) {
        size -= 2;
        ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
      }
    };
    const boxW = c.width - 34 - 26;
    ctx.fillStyle = '#4FE4DC';
    fit(this.getText('title'), 900, 52, boxW);
    ctx.fillText(this.getText('title'), 34, 84);
    ctx.fillStyle = 'rgba(247, 252, 250, 0.88)';
    fit(this.getText('flow'), 700, 44, boxW);
    ctx.fillText(this.getText('flow'), 34, 150);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },


  start() {
    if (this.seq >= 0) return;
    this.seq = 0;
    this.spawnElectron(true);
  },


  isBoosting() { return this.seq >= 0 && this.seq < 4.0; },

  spawnElectron(force) {
    if (!this.ready || (!this.active && !force)) return;
    const e = this.electrons.find((p) => !p.active);
    if (!e) return;
    e.active = true;
    e.t = 0;
    e.curve = Math.floor(Math.random() * this.curves.length);
    e.speed = 1 / THREE.MathUtils.randFloat(1.25, 1.85);
    e.mesh.visible = true;
    e.mat.opacity = 0;
  },

  setVisibleAmount(t) {
    if (!this.electrode) return;
    const eased = t * t * (3 - 2 * t);
    const boost = this.isBoosting() ? 1 : 0;
    const g = this.electrode;
    g.group.visible = eased > 0.005;

    const press = (this.seq >= 0 && this.seq < 0.45) ? 1 - (this.seq / 0.45) : 0;
    const solid = 0.22 + 0.72 * eased;
    g.graphite.opacity = solid;
    g.stemMat.opacity = solid;
    g.turquoise.opacity = (0.10 + 0.62 * eased) * (1 + boost * 0.25 + press * 0.55);
    g.graphite.emissiveIntensity = (0.02 + 0.10 * eased) * (1 + boost * 0.6 + press * 0.9);
    g.faceMat.opacity = 0.05 + 0.90 * eased;
    if (this.guide) {
      this.guide.group.visible = eased > 0.01;
      this.guide.mat.opacity = (0.06 + 0.36 * eased) * (1 + boost * 0.45);
    }
    if (this.label) {
      this.label.group.visible = eased > 0.03;
      this.label.mat.opacity = 0.94 * Math.max(0, (eased - 0.03) / 0.97);
    }
  },

  updateParticles(dt, time) {
    if (!this.curves.length) return;
    if (this.active) {
      const interval = this.isBoosting()
        ? THREE.MathUtils.randFloat(130, 190)
        : THREE.MathUtils.randFloat(290, 400);
      if (time >= this.nextSpawn) {
        this.spawnElectron(false);
        this.nextSpawn = time + interval;
      }
    }
    this.electrons.forEach((e) => {
      if (!e.active) return;
      e.t += e.speed * dt;
      const curve = this.curves[e.curve] || this.curves[0];
      const tt = Math.min(e.t, 1);
      e.mesh.position.copy(curve.getPointAt(tt));
      const fadeIn = THREE.MathUtils.clamp(e.t / 0.10, 0, 1);
      const fadeOut = THREE.MathUtils.clamp((1 - e.t) / 0.14, 0, 1);
      const a = 0.95 * this.displayT * fadeIn * fadeOut;
      e.mat.opacity = a;
      if (e.tag) {
        e.tag.visible = true;
        e.tag.position.copy(e.mesh.position).add(new THREE.Vector3(0, 0.013, 0));
        e.tagMat.opacity = a * 0.95;
      }
      e.trails.forEach((tr, i) => {
        const bt = Math.max(0, tt - 0.05 * (i + 1));
        tr.mesh.visible = true;
        tr.mesh.position.copy(curve.getPointAt(bt));
        tr.mat.opacity = a * (0.34 - i * 0.14);
      });
      if (e.t >= 1) {
        e.active = false;
        e.mesh.visible = false;
        if (e.tag) { e.tag.visible = false; e.tagMat.opacity = 0; }
        e.trails.forEach((tr) => { tr.mesh.visible = false; });
        this.pulseT = 1;
      }
    });
  },


  updateBacteriaPulse(dt) {
    if (this.pulseT > 0) this.pulseT = Math.max(0, this.pulseT - dt / 0.32);
    const p = Math.sin(this.pulseT * Math.PI);
    this.bacteriaMats.forEach(({ mat, base }) => {
      mat.emissiveIntensity = base + (base > 0.01 ? base * 0.30 : 0.09) * p;
    });
  },

  tick(time, delta) {
    if (!this.ready) return;
    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp2);
    const d = Math.hypot(p.x - this.targetCenter.x, p.z - this.targetCenter.z);
    if (!this.near && d <= this.data.trigger) this.near = true;
    else if (this.near && d >= this.data.release) this.near = false;

    const dt = Math.min(0.05, Math.max(0.001, (delta || 16) / 1000));
    if (this.seq >= 0) {
      this.seq += dt;
      if (this.seq > 6.4) this.seq = -1;
      if (this.seq === -1) this.nextSpawn = 0;
    }
    const running = this.seq >= 0;
    this.active = this.isBoosting();
    if (museoMobileSkipIdle(this, running)) return;

    this.displayT += (((this.near || running) ? 1 : 0) - this.displayT) * 0.075;
    this.setVisibleAmount(this.displayT);
    this.updateParticles(dt, time);
    this.updateBacteriaPulse(dt);


    if (running && !this.awarded && this.seq >= 4.9) {
      this.awarded = true;
      if (window.unlockCapability) window.unlockCapability('electro');
    }
    if (!running) this.awarded = false;

    const cam = this.el.sceneEl.camera ? this.el.sceneEl.camera.getWorldPosition(this.tmp) : null;
    if (this.label && cam && !this.label.group.userData.museoFixedFront) this.label.group.lookAt(cam);
    if (cam) this.electrons.forEach((e) => { if (e.tag && e.active) e.tag.lookAt(cam); });
    if (this.hotspot) {
      this.hotspot.tick(dt, cam, this.displayT,
        !!(window.hasCapability && window.hasCapability('electro')), running);
    }
  },

  remove() {
    if (this.hotspot) this.hotspot.dispose();
    this.bacteriaMats.forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    [this.electrode && this.electrode.group, this.guide && this.guide.group, this.label && this.label.group]
      .forEach((g) => { if (g && g.parent) g.parent.remove(g); });
    this.electrons.forEach((e) => {
      if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
      if (e.tag && e.tag.parent) e.tag.parent.remove(e.tag);
      e.trails.forEach((tr) => { if (tr.mesh.parent) tr.mesh.parent.remove(tr.mesh); });
    });
    if (this.electronGeo) this.electronGeo.dispose();
    if (this.trailGeo) this.trailGeo.dispose();
  }
});


AFRAME.registerComponent('reactor-control', {
  init() {
    this.stage = { light: false, flow: false, nutrients: false, active: false };
    this.buttons = [];
    this._hoverT = {};
    this.reactorLang = this.getReactorLang();
    this.reactorLast = { id: null, on: false };
    this.msgUntil = 0;
    this.rewardUntil = 0;
    this.rewardActiveAt = 0;
    this.wasComplete = false;
    this.biomassAt = 0;
    this.rewardPulse = 0;
    this.doses = [];
    this.needsRedraw = false;
    this.nextLangCheck = 0;
    this.mobileTmp = new THREE.Vector3();
    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },

  getReactorLang() {
    const readStore = (key) => {
      try { return localStorage.getItem(key); }
      catch (e) { return null; }
    };
    const candidates = [
      window.MUSEUM_LANGUAGE,
      window.MUSEO_LANGUAGE,
      window.MUSEO_LANG,
      readStore('museum-language'),
      readStore('MUSEUM_LANGUAGE'),
      readStore('museumLanguage'),
      readStore('museoLanguage'),
      document.documentElement.getAttribute('lang')
    ].filter(Boolean);
    const value = String(candidates[0] || 'en').toLowerCase();
    return value.startsWith('es') ? 'es' : 'en';
  },


  getReactorCopy() {
    const lang = this.getReactorLang();
    this.reactorLang = lang;
    const shared = window.MUSEUM_I18N && window.MUSEUM_I18N.reactorPanel;
    const fromI18n = shared && (shared[lang] || shared.en);
    return fromI18n || REACTOR_CONTROL_I18N[lang] || REACTOR_CONTROL_I18N.en;
  },

  now() { return (window.performance && performance.now) ? performance.now() : Date.now(); },

  activeCount() {
    const s = this.stage;
    return (s.light ? 1 : 0) + (s.flow ? 1 : 0) + (s.nutrients ? 1 : 0) + (s.active ? 1 : 0);
  },


  getReactorMessage(copy) {
    if (this.reactorLast && this.reactorLast.id && this.now() < this.msgUntil) {
      const m = copy.messages[this.reactorLast.id];
      if (m) {
        return this.reactorLast.on
          ? { title: m.onTitle, body: m.on }
          : { title: m.offTitle, body: m.off };
      }
    }
    return { title: copy.statusTitle, body: copy.idle };
  },

  onLoaded() {
    const mesh = this.el.object3D;


    let bubbleMat = null, liquidMat = null, liquidMesh = null, glassMat = null, glassMesh = null;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.material.name === 'Bioreactor_Bubble' && !bubbleMat) bubbleMat = o.material;
      if (o.material.name === 'Bioreactor_Liquid' && !liquidMat) { liquidMat = o.material; liquidMesh = o; }
      if (o.name === 'Bioreactor_Glass') { glassMesh = o; if (!glassMat) glassMat = o.material; }
      if (o.material.name === 'Vidrio' && !glassMat) glassMat = o.material;
    });
    this.bubbleMat = bubbleMat;
    this.liquidMat = liquidMat;
    this.glassMat = glassMat;
    this.bubbleBase = bubbleMat ? { i: bubbleMat.emissiveIntensity, o: bubbleMat.opacity } : null;
    this.liquidBase = liquidMat ? { i: liquidMat.emissiveIntensity, o: liquidMat.opacity } : null;
    this.liquidMesh = liquidMesh;
    this.captureLiquidLevel(liquidMesh);

    this.glassBaseEmissive = glassMat && glassMat.emissive ? glassMat.emissive.clone() : new THREE.Color(0, 0, 0);
    this.glassBaseEmissiveIntensity = (glassMat && typeof glassMat.emissiveIntensity === 'number') ? glassMat.emissiveIntensity : 1;
    this.hoverGlow = 0;


    this.glassBox = glassMesh ? new THREE.Box3().setFromObject(glassMesh) : null;
    this.liquidTopY = liquidMesh ? new THREE.Box3().setFromObject(liquidMesh).max.y : null;


    const bioreactorEl = this.el.querySelector('[gltf-model="#bioreactor"]');
    this.bioreactorAnim = bioreactorEl && bioreactorEl.components && bioreactorEl.components['gltf-animations'];

    const lightingComp = this.el.components['exhibit-lighting'];
    this.reactorSpot = lightingComp && lightingComp.spotsByAnchor && lightingComp.spotsByAnchor['PEANA_Bioreactor'];
    this.spotBase = (this.reactorSpot && this.reactorSpot.userData.baseIntensity) || 2.4;

    this.curSpot = this.spotBase;
    this.curBubbleI = this.bubbleBase ? this.bubbleBase.i : 0;
    this.curBubbleO = this.bubbleBase ? this.bubbleBase.o : 0;
    this.curLiquidI = this.liquidBase ? this.liquidBase.i : 0;
    this.curFlowAmount = 0;
    this.curAnimSpeed = 0;
    this.curNutrientLevel = 0;
    this.flowAngle = 0;
    this.recomputeTargets();
    this.curSpot = this.targetSpot;
    this.curBubbleI = this.targetBubbleI;
    this.curBubbleO = this.targetBubbleO;
    this.curLiquidI = this.targetLiquidI;
    this.curFlowAmount = this.targetFlowAmount;
    this.curAnimSpeed = this.targetAnimSpeed;
    this.applyReactorState();

    this.buildFlowParticles(mesh);
    this.buildNutrientParticles(mesh);
    this.buildActivityBubbles(mesh);
    this.buildControlStand();
    console.log('[reactor-control] listo -- 0/4, reactor en reposo');
  },


  recomputeTargets() {
    const s = this.stage;
    const all = this.activeCount() === 4;

    this.targetSpot = this.spotBase * (0.46 + (s.light ? 0.54 : 0) + (all ? 0.05 : 0));
    this.targetLiquidI = this.liquidBase
      ? this.liquidBase.i * (0.34 + (s.light ? 0.66 : 0) + (all ? 0.06 : 0))
      : 0;

    this.targetFlowAmount = s.flow ? 1 : 0;
    this.targetNutrientLevel = s.nutrients ? 1 : 0;

    this.targetBubbleI = this.bubbleBase ? this.bubbleBase.i * (s.active ? 1.0 : 0.05) : 0;
    this.targetBubbleO = this.bubbleBase ? (s.active ? Math.min(1, this.bubbleBase.o * 1.2) : 0) : 0;
    this.targetAnimSpeed = s.active ? (all ? 1.12 : 1) : 0;
  },

  applyReactorState() {
    const hoverBoost = 1 + this.hoverGlow * 0.18;
    const reward = this.rewardPulse || 0;
    if (this.reactorSpot) this.reactorSpot.intensity = this.curSpot * (1 + reward * 0.10);
    if (this.bubbleMat) {
      this.bubbleMat.emissiveIntensity = this.curBubbleI * hoverBoost;
      this.bubbleMat.opacity = this.curBubbleO;
      this.bubbleMat.visible = this.curBubbleO > 0.01;
    }
    if (this.liquidMat) this.liquidMat.emissiveIntensity = this.curLiquidI * hoverBoost * (1 + reward * 0.12);
    if (this.bioreactorAnim && this.bioreactorAnim.mixer) this.bioreactorAnim.mixer.timeScale = this.curAnimSpeed;
    this.applyLiquidLevel(this.curNutrientLevel || 0);


    if (this.glassMat) {
      const accent = this._room2AccentColor || (this._room2AccentColor = new THREE.Color(ROOM2_ACCENT));
      const glowMix = Math.min(1, this.hoverGlow * 0.42 + reward * 0.30);
      this.glassMat.emissive.copy(this.glassBaseEmissive).lerp(accent, glowMix);
      this.glassMat.emissiveIntensity = this.glassBaseEmissiveIntensity + this.hoverGlow * 0.55 + reward * 0.35;
    }
  },


  buildFlowParticles(mesh) {
    this.flowDots = [];
    if (!this.liquidMesh) return;
    const b = new THREE.Box3().setFromObject(this.liquidMesh);
    const sx = Math.max(0.02, b.max.x - b.min.x);
    const sy = Math.max(0.02, b.max.y - b.min.y);
    const sz = Math.max(0.02, b.max.z - b.min.z);
    const cx = (b.min.x + b.max.x) * 0.5;
    const cz = (b.min.z + b.max.z) * 0.5;
    const group = new THREE.Group();
    group.name = 'reactor-flow-circulation';


    const color = new THREE.Color(0x8df7ef);
    const RINGS = 4, PER = 5;
    const perRing = museoMobileCount(PER, 0.75, 3);
    for (let r = 0; r < RINGS; r++) {
      for (let i = 0; i < perRing; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0, depthWrite: false
        });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0125 - (r % 2) * 0.0025, 10, 8), mat);
        group.add(dot);
        this.flowDots.push({
          mesh: dot, mat,
          angle: (i / perRing) * Math.PI * 2 + r * 0.5,

          radiusX: sx * (0.20 + r * 0.055),
          radiusZ: sz * (0.20 + r * 0.055),
          y: b.min.y + sy * (0.20 + r * 0.185),
          dir: r % 2 === 0 ? 1 : -1
        });
      }
    }
    this.flowCenter = { cx, cz };
    this.el.sceneEl.object3D.add(group);
    this.flowGroup = group;
  },

  updateFlowParticles(dt) {
    if (!this.flowDots || !this.flowDots.length) return;
    const amount = THREE.MathUtils.clamp(this.curFlowAmount || 0, 0, 1);
    this.flowAngle = (this.flowAngle + dt * 0.85 * Math.max(amount, 0.0001)) % (Math.PI * 2);
    const c = this.flowCenter;
    const axis = this._flowAxis || (this._flowAxis = new THREE.Vector3(1, 0, 0));
    const tan = this._flowTan || (this._flowTan = new THREE.Vector3());
    this.flowDots.forEach((d) => {
      const a = d.angle + this.flowAngle * d.dir;
      d.mesh.position.set(c.cx + Math.cos(a) * d.radiusX, d.y, c.cz + Math.sin(a) * d.radiusZ);


      tan.set(-Math.sin(a) * d.dir, 0, Math.cos(a) * d.dir).normalize();
      d.mesh.quaternion.setFromUnitVectors(axis, tan);
      d.mesh.scale.set(3.0, 0.8, 0.8);
      d.mat.opacity += (amount - d.mat.opacity) * 0.10;
      d.mesh.visible = d.mat.opacity > 0.01;
    });
  },


  buildNutrientParticles(mesh) {
    this.nutrientDots = [];
    const tube = mesh.getObjectByName('Bioreactor_CenterTube');
    const box = tube ? new THREE.Box3().setFromObject(tube) : null;
    const cx = box ? (box.min.x + box.max.x) / 2 : 0;
    const cz = box ? (box.min.z + box.max.z) / 2 : 0;
    if (!box) return;
    const glassTop = this.glassBox ? this.glassBox.max.y : box.max.y;
    const liquidTop = (this.liquidTopY !== null && this.liquidTopY < glassTop) ? this.liquidTopY : box.min.y;
    const liquidBottom = this.liquidMesh
      ? new THREE.Box3().setFromObject(this.liquidMesh).min.y
      : liquidTop - 0.3;


    const color = new THREE.Color(0xf6e9d2);
    const group = new THREE.Group();
    group.name = 'reactor-nutrient-dose';
    const N = museoMobileCount(20, 0.70, 12);
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), mat);
      dot.visible = false;
      group.add(dot);
      this.nutrientDots.push({ mesh: dot, mat, active: false, t: 0, delay: 0, ax: 0, az: 0, drop: 0 });
    }


    const tubeR = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
    this.nutrientTravel = {
      cx, cz,
      entryR: tubeR + 0.024,
      entryY: glassTop - 0.012,
      surfaceY: liquidTop,
      depthY: liquidBottom + (liquidTop - liquidBottom) * 0.35
    };
    this.el.sceneEl.object3D.add(group);
    this.nutrientGroup = group;
  },


  injectDose() {
    if (!this.nutrientDots || !this.nutrientDots.length) return;
    const free = this.nutrientDots.filter((d) => !d.active);
    const n = Math.min(10, free.length);
    for (let i = 0; i < n; i++) {
      const d = free[i];
      const a = Math.random() * Math.PI * 2;
      d.active = true;
      d.t = 0;
      d.delay = i * 0.13;
      d.ax = Math.cos(a);
      d.az = Math.sin(a);
      d.drop = 0.9 + Math.random() * 0.35;
      d.mesh.visible = true;
      d.mat.opacity = 0;
    }
    this.nextTrickle = this.now() + 1600;
  },

  updateNutrientParticles(dt) {
    if (!this.nutrientDots || !this.nutrientTravel) return;


    if (this.stage.nutrients && this.now() > (this.nextTrickle || 0)) this.injectDose();

    const tr = this.nutrientTravel;
    const fallH = tr.entryY - tr.surfaceY;
    this.nutrientDots.forEach((d) => {
      if (!d.active) { d.mat.opacity = 0; d.mesh.visible = false; return; }
      if (d.delay > 0) { d.delay -= dt; d.mat.opacity = 0; return; }
      d.t += dt * 0.42 * d.drop;
      if (d.t >= 1) { d.active = false; d.mesh.visible = false; d.mat.opacity = 0; return; }
      const fall = THREE.MathUtils.clamp(d.t / 0.34, 0, 1);
      const spread = THREE.MathUtils.clamp((d.t - 0.34) / 0.66, 0, 1);
      const y = tr.entryY - fallH * fall - (tr.surfaceY - tr.depthY) * spread;
      const rad = tr.entryR + 0.075 * spread;
      d.mesh.position.set(tr.cx + d.ax * rad, y, tr.cz + d.az * rad);
      d.mesh.scale.setScalar(1 + spread * 0.5);
      const fadeIn = Math.min(1, d.t / 0.06);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(spread, 0.5, 1);
      d.mat.opacity = fadeIn * fadeOut;
    });
  },

  captureLiquidLevel(liquidMesh) {
    if (!liquidMesh || !liquidMesh.geometry) { this.liquidLevel = null; return; }
    liquidMesh.geometry.computeBoundingBox();
    const box = liquidMesh.geometry.boundingBox;
    if (!box) { this.liquidLevel = null; return; }
    this.liquidLevel = {
      mesh: liquidMesh,
      baseScaleY: liquidMesh.scale.y,
      basePosY: liquidMesh.position.y,
      minY: box.min.y,
      maxY: box.max.y,
      low: 0.90,
      high: 1.0
    };
  },

  applyLiquidLevel(amount) {
    const level = this.liquidLevel;
    if (!level) return;
    const t = THREE.MathUtils.clamp(amount, 0, 1);
    const factor = THREE.MathUtils.lerp(level.low, level.high, t);
    const nextScaleY = level.baseScaleY * factor;
    level.mesh.scale.y = nextScaleY;
    level.mesh.position.y = level.basePosY - level.minY * (nextScaleY - level.baseScaleY);
    level.mesh.updateWorldMatrix(true, false);
    const top = new THREE.Vector3(0, level.maxY, 0).applyMatrix4(level.mesh.matrixWorld);
    this.currentLiquidTopY = top.y;
  },


  buildActivityBubbles(mesh) {
    this.activityBubbles = [];
    if (!this.liquidMesh) return;
    const b = new THREE.Box3().setFromObject(this.liquidMesh);
    const sx = Math.max(0.02, b.max.x - b.min.x);
    const sy = Math.max(0.02, b.max.y - b.min.y);
    const sz = Math.max(0.02, b.max.z - b.min.z);
    const cx = (b.min.x + b.max.x) * 0.5;
    const cz = (b.min.z + b.max.z) * 0.5;
    const group = new THREE.Group();
    group.name = 'reactor-activity-bubbles';
    const color = this.bubbleMat && this.bubbleMat.color ? this.bubbleMat.color.clone() : new THREE.Color(0xd8fbf7);
    const N = museoMobileCount(20, 0.70, 12);
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
      const size = 0.008 + ((i * 37) % 5) * 0.0035;
      const bub = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), mat);
      bub.visible = false;
      group.add(bub);
      this.activityBubbles.push({
        mesh: bub, mat,
        x: cx + (((i * 37) % 100) / 100 - 0.5) * sx * 0.52,
        z: cz + (((i * 61) % 100) / 100 - 0.5) * sz * 0.52,
        t: i / N,
        speed: 0.16 + ((i * 13) % 7) * 0.022,
        sway: 0.004 + ((i * 17) % 5) * 0.0016,
        alive: false
      });
    }
    this.activityTravel = { minY: b.min.y + sy * 0.06, maxY: b.max.y - sy * 0.05 };
    this.el.sceneEl.object3D.add(group);
    this.activityGroup = group;
  },

  updateActivityBubbles(dt, time) {
    if (!this.activityBubbles || !this.activityBubbles.length) return;
    const on = this.stage.active;
    const tr = this.activityTravel;
    const secs = (time || 0) / 1000;
    this.activityBubbles.forEach((b) => {
      if (!b.alive) {
        if (!on) { b.mat.opacity = 0; b.mesh.visible = false; return; }
        b.alive = true; b.t = Math.random() * 0.3;
      }
      b.t += dt * b.speed;
      if (b.t >= 1) {
        b.t = 0;
        if (!on) { b.alive = false; b.mesh.visible = false; b.mat.opacity = 0; return; }
      }
      b.mesh.visible = true;
      b.mesh.position.set(
        b.x + Math.sin(secs * 1.3 + b.t * 7) * b.sway,
        THREE.MathUtils.lerp(tr.minY, tr.maxY, b.t),
        b.z + Math.cos(secs * 1.1 + b.t * 6) * b.sway
      );
      const fadeIn = Math.min(1, b.t / 0.10);
      const fadeOut = Math.min(1, (1 - b.t) / 0.16);
      b.mat.opacity = Math.min(fadeIn, fadeOut) * 0.85;
    });
  },


  computeTopSurface(obj) {
    const tris = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    obj.traverse((target) => {
      if (!target.isMesh || !target.geometry || !target.geometry.attributes.position) return;
      target.updateWorldMatrix(true, false);
      const pos = target.geometry.attributes.position;
      const idx = target.geometry.index;
      const read = (i, out) => out.fromBufferAttribute(pos, i).applyMatrix4(target.matrixWorld);
      const triCount = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < triCount; t++) {
        const ia = idx ? idx.getX(t * 3) : t * 3;
        const ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        read(ia, a); read(ib, b); read(ic, c);
        ab.subVectors(b, a); ac.subVectors(c, a);
        const cross = new THREE.Vector3().crossVectors(ab, ac);
        const area = cross.length() * 0.5;
        if (area < 1e-7) continue;
        const normal = cross.normalize();
        if (normal.y < 0) normal.negate();
        if (normal.y < 0.35) continue;
        const center = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
        tris.push({ normal, area, center, d: normal.dot(center), pts: [a.clone(), b.clone(), c.clone()] });
      }
    });
    if (!tris.length) return null;

    const groups = [];
    const maxAngle = Math.cos(THREE.MathUtils.degToRad(4));
    tris.forEach((tri) => {
      let group = groups.find((g) => tri.normal.dot(g.normal) > maxAngle && Math.abs(tri.d - g.d) < 0.018);
      if (!group) {
        group = { normal: tri.normal.clone(), d: tri.d, area: 0, weightedY: 0, pts: [] };
        groups.push(group);
      }
      const nextArea = group.area + tri.area;
      group.normal.multiplyScalar(group.area).addScaledVector(tri.normal, tri.area).divideScalar(nextArea).normalize();
      group.d = (group.d * group.area + tri.d * tri.area) / nextArea;
      group.area = nextArea;
      group.weightedY += tri.center.y * tri.area;
      group.pts.push(...tri.pts);
    });
    groups.forEach((g) => { g.avgY = g.weightedY / Math.max(g.area, 1e-9); });
    const maxArea = Math.max(...groups.map((g) => g.area));
    const candidates = groups.filter((g) => g.area >= maxArea * 0.28);
    const best = candidates.sort((g1, g2) => (g2.avgY - g1.avgY) || (g2.area - g1.area))[0];
    if (!best || best.pts.length < 3) return null;

    const normal = best.normal.clone();
    if (normal.y < 0) normal.negate();
    const planePoint = new THREE.Vector3();
    best.pts.forEach((p) => planePoint.add(p));
    planePoint.multiplyScalar(1 / best.pts.length);


    const uHelp = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const uAxis = new THREE.Vector3().crossVectors(uHelp, normal).normalize();
    const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();

    let Suu = 0, Suv = 0, Svv = 0;
    const rel = new THREE.Vector3();
    best.pts.forEach((p) => {
      rel.subVectors(p, planePoint);
      const pu = rel.dot(uAxis), pv = rel.dot(vAxis);
      Suu += pu * pu; Suv += pu * pv; Svv += pv * pv;
    });
    Suu /= best.pts.length; Suv /= best.pts.length; Svv /= best.pts.length;

    const trace = Suu + Svv;
    const det = Suu * Svv - Suv * Suv;
    const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
    const lambda1 = trace / 2 + disc;
    let ex, ey;
    if (Math.abs(Suv) > 1e-9) { ex = lambda1 - Svv; ey = Suv; }
    else { ex = 1; ey = 0; }
    const eLen = Math.hypot(ex, ey) || 1;
    ex /= eLen; ey /= eLen;
    const axisLong = new THREE.Vector3().addScaledVector(uAxis, ex).addScaledVector(vAxis, ey).normalize();
    const axisShort = new THREE.Vector3().crossVectors(normal, axisLong).normalize();

    let longMin = Infinity, longMax = -Infinity, shortMin = Infinity, shortMax = -Infinity;
    let maxY = -Infinity;
    best.pts.forEach((p) => {
      rel.subVectors(p, planePoint);
      const dl = rel.dot(axisLong), ds = rel.dot(axisShort);
      if (dl < longMin) longMin = dl; if (dl > longMax) longMax = dl;
      if (ds < shortMin) shortMin = ds; if (ds > shortMax) shortMax = ds;
      if (p.y > maxY) maxY = p.y;
    });
    const centroid = planePoint.clone()
      .addScaledVector(axisLong, (longMin + longMax) * 0.5)
      .addScaledVector(axisShort, (shortMin + shortMax) * 0.5);

    return {
      normal, centroid, topY: maxY,
      axisLong, axisShort,
      extentLong: longMax - longMin,
      extentShort: shortMax - shortMin
    };
  },

  buildControlPanelTexture(widthM, heightM, defs) {
    const HPX = 760;
    const WPX = Math.max(1800, Math.round(HPX * (widthM / heightM)));
    const c = document.createElement('canvas');
    c.width = WPX; c.height = HPX;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.controlPanelCanvas = { c, ctx, tex, w: WPX, h: HPX, defs };
    this.drawControlPanelTexture();
    return tex;
  },

  drawControlPanelTexture() {
    if (!this.controlPanelCanvas) return;
    const { ctx, tex, w: WPX, h: HPX, defs } = this.controlPanelCanvas;
    const copy = this.getReactorCopy();
    const message = this.getReactorMessage(copy);
    const count = this.activeCount();
    const complete = count === 4;
    const rewarding = this.now() < this.rewardUntil;
    const rewardActive = rewarding && this.now() >= this.rewardActiveAt;

    ctx.clearRect(0, 0, WPX, HPX);
    ctx.fillStyle = 'rgba(3, 10, 13, 0.92)';
    ctx.fillRect(0, 0, WPX, HPX);
    const grain = Math.round((WPX * HPX) / 1400);
    for (let i = 0; i < grain; i++) {
      const v = 70 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgba(${v},${v + 20},${v + 20},0.03)`;
      ctx.fillRect(Math.random() * WPX, Math.random() * HPX, 1, 1);
    }

    const accent = ROOM2_ACCENT;
    const accentLight = ROOM2_ACCENT_LIGHT;
    const onColor = '#4FE4DC';
    const offColor = 'rgba(200, 212, 210, 0.30)';
    const ink = '#F7FCFA';
    const muted = '#9FB2B0';
    const line = 'rgba(90, 153, 148, 0.32)';
    const padX = WPX * 0.048;


    const pulse = rewarding ? (0.55 + 0.45 * Math.sin(this.now() / 150)) : 0;
    ctx.strokeStyle = complete
      ? `rgba(79, 228, 220, ${0.45 + pulse * 0.5})`
      : 'rgba(90, 153, 148, 0.55)';
    ctx.lineWidth = complete ? 6 : 3;
    ctx.strokeRect(padX * 0.55, HPX * 0.055, WPX - padX * 1.10, HPX * 0.885);


    const headY = HPX * 0.115;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentLight;
    ctx.font = '800 44px Arial, Helvetica, sans-serif';
    ctx.fillText('02', padX, headY);
    ctx.fillStyle = ink;
    ctx.font = '900 62px Arial, Helvetica, sans-serif';
    ctx.fillText(copy.title, padX + 96, headY);


    ctx.textAlign = 'right';
    ctx.fillStyle = muted;
    ctx.font = '800 30px Arial, Helvetica, sans-serif';
    ctx.fillText(copy.statusTitle, WPX - padX - 132, headY - 14);
    ctx.fillStyle = complete ? onColor : ink;
    ctx.font = '900 58px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${count} / 4`, WPX - padX, headY + 4);

    ctx.fillStyle = complete ? 'rgba(79, 228, 220, 0.85)' : line;
    ctx.fillRect(padX, HPX * 0.178, (WPX - padX * 2) * (count / 4), 5);
    ctx.fillStyle = 'rgba(247, 252, 250, 0.10)';
    ctx.fillRect(padX + (WPX - padX * 2) * (count / 4), HPX * 0.178, (WPX - padX * 2) * (1 - count / 4), 5);


    const cols = defs.length;
    const usableW = WPX - padX * 2;
    const colW = usableW / cols;
    const chipY = HPX * 0.248;
    const buttonY = HPX * 0.49;
    const labelY = HPX * 0.685;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    defs.forEach((d, i) => {
      const x = padX + colW * (i + 0.5);
      const isOn = !!(this.stage && this.stage[d.id]);
      const label = copy.buttons[d.id] || d.label;

      if (i > 0) {
        ctx.strokeStyle = line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - colW * 0.5, HPX * 0.215);
        ctx.lineTo(x - colW * 0.5, HPX * 0.745);
        ctx.stroke();
      }


      const chipW = colW * 0.46, chipH = HPX * 0.072, rr = chipH / 2;
      const cx0 = x - chipW / 2, cy0 = chipY - chipH / 2;
      ctx.beginPath();
      ctx.moveTo(cx0 + rr, cy0);
      ctx.lineTo(cx0 + chipW - rr, cy0);
      ctx.quadraticCurveTo(cx0 + chipW, cy0, cx0 + chipW, cy0 + rr);
      ctx.lineTo(cx0 + chipW, cy0 + chipH - rr);
      ctx.quadraticCurveTo(cx0 + chipW, cy0 + chipH, cx0 + chipW - rr, cy0 + chipH);
      ctx.lineTo(cx0 + rr, cy0 + chipH);
      ctx.quadraticCurveTo(cx0, cy0 + chipH, cx0, cy0 + chipH - rr);
      ctx.lineTo(cx0, cy0 + rr);
      ctx.quadraticCurveTo(cx0, cy0, cx0 + rr, cy0);
      ctx.closePath();
      ctx.fillStyle = isOn ? onColor : 'rgba(247, 252, 250, 0.07)';
      ctx.fill();
      ctx.strokeStyle = isOn ? onColor : offColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = isOn ? '#04191B' : 'rgba(247, 252, 250, 0.45)';
      ctx.font = '900 34px Arial, Helvetica, sans-serif';
      ctx.fillText(isOn ? (copy.on || 'ON') : (copy.off || 'OFF'), x, chipY + 2);


      ctx.strokeStyle = isOn ? 'rgba(79, 228, 220, 0.75)' : 'rgba(247, 252, 250, 0.16)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(x, buttonY, 56, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isOn ? onColor : accentLight;
      ctx.font = '800 30px Arial, Helvetica, sans-serif';
      ctx.fillText(d.num, x, labelY - 42);
      ctx.fillStyle = isOn ? ink : 'rgba(247, 252, 250, 0.72)';
      const labelFont = label.length > 8 ? 38 : 46;
      ctx.font = `900 ${labelFont}px Arial, Helvetica, sans-serif`;
      ctx.fillText(label, x, labelY + 8);
    });


    const stripY = HPX * 0.775, stripH = HPX * 0.155;
    ctx.fillStyle = rewarding ? 'rgba(79, 228, 220, 0.16)' : 'rgba(247, 252, 250, 0.06)';
    ctx.fillRect(padX, stripY, WPX - padX * 2, stripH);
    ctx.fillStyle = rewarding ? onColor : accentLight;
    ctx.fillRect(padX, stripY, 10, stripH);
    ctx.textAlign = 'left';
    if (rewardActive) {
      ctx.fillStyle = onColor;
      ctx.font = '900 44px Arial, Helvetica, sans-serif';
      ctx.fillText(copy.systemActive, padX + 34, stripY + stripH * 0.34);
      ctx.fillStyle = ink;
      ctx.font = '800 34px Arial, Helvetica, sans-serif';
      ctx.fillText(copy.systemActiveText, padX + 34, stripY + stripH * 0.74);
    } else if (rewarding) {
      ctx.fillStyle = onColor;
      ctx.font = '900 44px Arial, Helvetica, sans-serif';
      ctx.fillText('4 / 4', padX + 34, stripY + stripH * 0.34);
      ctx.fillStyle = ink;
      ctx.font = '800 34px Arial, Helvetica, sans-serif';
      ctx.fillText(copy.statusTitle, padX + 34, stripY + stripH * 0.74);
    } else {
      ctx.fillStyle = accentLight;
      ctx.font = '900 30px Arial, Helvetica, sans-serif';
      ctx.fillText(message.title, padX + 34, stripY + stripH * 0.30);
      ctx.fillStyle = ink;
      ctx.font = '800 31px Arial, Helvetica, sans-serif';
      this.wrapCanvasText(ctx, message.body, padX + 34, stripY + stripH * 0.68, WPX - padX * 2 - 68, 36, 2);
    }

    tex.needsUpdate = true;
  },
  wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let lines = 0;
    words.forEach((word) => {
      if (lines >= maxLines) return;
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = word;
      } else {
        line = test;
      }
    });
    if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
  },


  buildControlStand() {
    const mesh = this.el.object3D;
    const standObj = mesh.getObjectByName('PEANA_Alta_B');
    if (!standObj) { console.warn('[reactor-control] no se encontro PEANA_Alta_B'); return; }

    const top = this.computeTopSurface(standObj);
    let origin, zAxis;
    if (top) {
      origin = top.centroid;
      zAxis = top.normal;
    } else {


      const box = new THREE.Box3().setFromObject(standObj);
      origin = box.getCenter(new THREE.Vector3());
      origin.y = box.max.y;
      zAxis = new THREE.Vector3(0, 1, 0);
    }


    let dirX = 0, dirZ = 1;
    const spawn = window.MUSEO_SPAWN;
    const bounds = window.MUSEO_BOUNDS;
    let tx = null, tz = null;
    if (spawn && typeof spawn.x === 'number') { tx = spawn.x; tz = spawn.z; }
    else if (bounds) { tx = (bounds.minX + bounds.maxX) / 2; tz = (bounds.minZ + bounds.maxZ) / 2; }
    if (tx !== null) {
      const dx = tx - origin.x, dz = tz - origin.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) { dirX = dx / len; dirZ = dz / len; }
    }
    const towardVisitor = new THREE.Vector3(dirX, 0, dirZ);

    let yAxis;
    if (top && top.axisShort) {
      yAxis = top.axisShort.clone();
      if (yAxis.dot(towardVisitor) < 0) yAxis.negate();
    } else {


      yAxis = towardVisitor.clone();
      yAxis.addScaledVector(zAxis, -yAxis.dot(zAxis));
      if (yAxis.lengthSq() < 1e-6) yAxis.set(0, 1, 0).addScaledVector(zAxis, -zAxis.y);
    }
    yAxis.normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    yAxis.crossVectors(zAxis, xAxis).normalize();

    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    const STANDOFF = 0.002;
    const pos = origin.clone().addScaledVector(zAxis, STANDOFF);

    const wrapper = document.createElement('a-entity');
    wrapper.object3D.position.copy(pos);
    wrapper.object3D.quaternion.copy(quat);


    const fitWithin = (preferred, minimum, maximum) => {
      const max = Math.max(0.001, maximum);
      return Math.min(Math.max(preferred, Math.min(minimum, max)), max);
    };
    const WIDTH = (top && top.extentLong)
      ? fitWithin(0.80, 0.66, top.extentLong * 0.96)
      : 0.80;
    const HEIGHT = (top && top.extentShort)
      ? fitWithin(0.31, 0.24, top.extentShort * 0.86)
      : 0.31;
    const exhibitInfo = this.el.components['exhibit-info'];
    const reactorText = (id) => window.getMuseumReactorText
      ? window.getMuseumReactorText(id)
      : { label: id.toUpperCase(), symbol: id.toUpperCase(), onText: '', offText: '' };
    const lightText = reactorText('light');
    const flowText = reactorText('flow');
    const nutrientsText = reactorText('nutrients');
    const activeText = reactorText('active');
    const defs = [
      {
        id: 'light', num: '01', label: lightText.label, symbol: lightText.symbol,
        off: 0xeaf6f4, on: 0x6ff0e8,
        onText: lightText.onText,
        offText: lightText.offText
      },
      {
        id: 'flow', num: '02', label: flowText.label, symbol: flowText.symbol,
        off: 0xe5f3ef, on: 0x35d5d3,
        onText: flowText.onText,
        offText: flowText.offText
      },
      {
        id: 'nutrients', num: '03', label: nutrientsText.label, symbol: nutrientsText.symbol,
        off: 0xe7f2f0, on: 0x4fe4dc,
        onText: nutrientsText.onText,
        offText: nutrientsText.offText
      },
      {
        id: 'active', num: '04', label: activeText.label, symbol: activeText.symbol,
        off: 0xe4f0ee, on: 0x2fc9c2,
        onText: activeText.onText,
        offText: activeText.offText
      }
    ];
    this.controlDefs = defs;
    const controlTex = this.buildControlPanelTexture(WIDTH, HEIGHT, defs);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, HEIGHT),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, map: controlTex,
        roughness: 0.88, metalness: 0, side: THREE.DoubleSide,
        transparent: true, opacity: 0.92
      })
    );
    wrapper.object3D.add(panel);


    const BUTTON_Z = 0.014;

    const spacing = Math.min(WIDTH * 0.23, (WIDTH * 0.84) / (defs.length - 1));
    const startX = -spacing * (defs.length - 1) / 2;
    const BTN_R = Math.min(HEIGHT * 0.105, WIDTH * 0.043);
    const BTN_DEPTH = HEIGHT * 0.055;
    const BTN_Y = HEIGHT * 0.01;


    defs.forEach((d, i) => {
      const bx = startX + i * spacing;


      const btnColor = new THREE.Color(d.off);
      const material = new THREE.MeshStandardMaterial({
        color: btnColor, emissive: new THREE.Color(d.on),
        emissiveIntensity: 0.14,
        roughness: 0.48, metalness: 0.08, side: THREE.DoubleSide
      });
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(d.on), emissive: new THREE.Color(d.on),
        emissiveIntensity: 0.04, roughness: 0.62, metalness: 0,
        transparent: true, opacity: 0.34, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(BTN_R * 1.12, BTN_R * 1.34, 36), ringMaterial);
      ring.position.set(bx, BTN_Y, BUTTON_Z - 0.004);
      wrapper.object3D.add(ring);

      const btn = new THREE.Mesh(new THREE.CylinderGeometry(BTN_R, BTN_R * 0.94, BTN_DEPTH, 36), material);
      btn.rotation.x = Math.PI / 2;
      const upZ = BUTTON_Z + BTN_DEPTH * 0.55;
      const downZ = BUTTON_Z + BTN_DEPTH * 0.18;
      btn.position.set(bx, BTN_Y, upZ);
      btn.userData.museoExhibitId = `reactorBtn_${d.id}`;
      btn.userData.museoAction = () => this.onButtonClick(d.id);
      wrapper.object3D.add(btn);
      if (exhibitInfo) exhibitInfo.selectableMeshes.push(btn);


      this.buttons.push({
        id: d.id, mesh: btn, material, ring, ringMaterial,
        offColor: d.off, onColor: d.on, upZ, downZ, pressT: 0,
        baseEmissive: material.emissiveIntensity
      });
      this._hoverT[d.id] = 0;
    });


    this.el.sceneEl.appendChild(wrapper);
    this.wrapper = wrapper;
    this.reactorCenter = pos.clone();
  },


  onButtonClick(id) {
    if (!(id in this.stage)) return;
    this.stage[id] = !this.stage[id];
    this.reactorLast = { id, on: this.stage[id] };
    this.msgUntil = this.now() + 3800;
    const button = this.buttons.find((b) => b.id === id);
    if (button) button.pressT = 1;
    if (id === 'nutrients') this.injectDose();
    this.recomputeTargets();
    this.checkReward();
    this.updateButtonLooks();
    this.drawControlPanelTexture();
  },


  checkReward() {
    const complete = this.activeCount() === 4;
    if (complete && !this.wasComplete) {
      const now = this.now();
      this.rewardUntil = now + 2750;
      this.rewardActiveAt = now + 1250;
      this.rewardPulse = 1;


      this.biomassAt = now + 3050;
    }
    this.wasComplete = complete;
  },

  updateButtonLooks() {
    this.buttons.forEach((b) => {
      const on = this.stage[b.id];
      b.material.color.set(on ? b.onColor : b.offColor);
      b.material.emissive.set(b.onColor);
      if (b.ringMaterial) {
        b.ringMaterial.opacity = on ? 0.92 : 0.28;
        b.ringMaterial.emissiveIntensity = on ? 0.65 : 0.03;
      }
      if (b.statusMaterial) {
        b.statusMaterial.color.set(on ? b.onColor : 0xc9c2bc);
        b.statusMaterial.emissiveIntensity = on ? 0.60 : 0.02;
      }
      b.baseEmissive = on ? 0.75 : 0.12;
    });
  },

  tick(time, delta) {
    if (!this.wrapper) return;
    const dt = Math.min((delta || 16) / 1000, 0.1);
    const speed = 1 - Math.pow(0.004, dt);
    const now = this.now();

    const info = this.el.components['exhibit-info'];
    const hoverId = info && info.hoverId;
    this.hoverGlow += ((hoverId === 'reactor01' ? 1 : 0) - this.hoverGlow) * 0.12;


    const rewarding = now < this.rewardUntil;
    if (this.biomassAt && now >= this.biomassAt) {
      this.biomassAt = 0;
      if (window.unlockCapability) window.unlockCapability('biomass');
    }

    if (MUSEO_IS_MOBILE && this.reactorCenter) {
      const rigPos = museoRigWorldPosition(this.mobileTmp);
      const far = rigPos && museoDistanceXZ(rigPos, this.reactorCenter) > 5.2;
      const messageExpired = this.msgUntil && now > this.msgUntil;
      if (far && !rewarding && !this.biomassAt && !messageExpired && this.hoverGlow < 0.015) return;
    }

    const rewardTarget = rewarding ? (0.55 + 0.45 * Math.sin(now / 150)) : 0;
    this.rewardPulse += (rewardTarget - this.rewardPulse) * 0.25;

    this.curSpot += (this.targetSpot - this.curSpot) * speed;
    this.curBubbleI += (this.targetBubbleI - this.curBubbleI) * speed;
    this.curBubbleO += (this.targetBubbleO - this.curBubbleO) * speed;
    this.curLiquidI += (this.targetLiquidI - this.curLiquidI) * speed;
    this.curFlowAmount += ((this.targetFlowAmount || 0) - this.curFlowAmount) * speed;
    this.curAnimSpeed += ((this.targetAnimSpeed || 0) - this.curAnimSpeed) * speed;
    this.curNutrientLevel += ((this.targetNutrientLevel || 0) - this.curNutrientLevel) * speed;
    this.applyReactorState();
    this.updateFlowParticles(dt);
    this.updateNutrientParticles(dt);
    this.updateActivityBubbles(dt, time);


    if (rewarding) {
      this.drawControlPanelTexture();
      this._rewardWasOn = true;
    } else if (this._rewardWasOn) {
      this._rewardWasOn = false;
      this.drawControlPanelTexture();
    } else if (this.msgUntil && this.now() > this.msgUntil) {
      this.msgUntil = 0;
      this.drawControlPanelTexture();
    }

    if ((time || 0) > this.nextLangCheck) {
      this.nextLangCheck = (time || 0) + 400;
      const lang = this.getReactorLang();
      if (lang !== this.reactorLang) {
        this.reactorLang = lang;
        this.drawControlPanelTexture();
      }
    }


    this.buttons.forEach((b) => {
      const isHovered = hoverId === `reactorBtn_${b.id}`;
      const t = this._hoverT[b.id] + ((isHovered ? 1 : 0) - this._hoverT[b.id]) * 0.15;
      this._hoverT[b.id] = t;
      b.mesh.scale.setScalar(1 + t * 0.10 + (b.pressT || 0) * 0.06);
      if (b.ring) b.ring.scale.setScalar(1 + t * 0.06);
      const targetZ = (this.stage[b.id] ? b.downZ : b.upZ) - (b.pressT || 0) * 0.005;
      b.mesh.position.z += (targetZ - b.mesh.position.z) * 0.32;
      b.pressT = Math.max(0, (b.pressT || 0) - dt * 5.5);
      b.material.emissiveIntensity = b.baseEmissive * (1 + t * 0.5 + (b.pressT || 0) * 0.8);
    });
  }
});


AFRAME.registerComponent('mood-lighting', {
  init() {
    this.accentLights = [];
    this.nextPulse = 0;
    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const root = this.el.object3D;
    const bounds = window.MUSEO_BOUNDS;
    const spawn = window.MUSEO_SPAWN;
    if (!bounds || !spawn) return;
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cz = (bounds.minZ + bounds.maxZ) * 0.5;
    const sideOffset = (bounds.maxX - bounds.minX) * 0.26;
    const accents = [
      { x: cx - sideOffset, y: spawn.y + 2.65, z: cz, color: 0xa74cff, intensity: 1.00, distance: 4.8, phase: 0 },
      { x: cx + sideOffset, y: spawn.y + 2.65, z: cz, color: 0x943cff, intensity: 0.96, distance: 4.8, phase: Math.PI },
      { x: cx, y: spawn.y + 3.15, z: bounds.minZ + 0.8, color: 0xd7a4ff, intensity: 0.22, distance: 5.2, phase: Math.PI / 2 }
    ];
    accents.forEach((accent) => {
      const local = new THREE.Vector3(accent.x, accent.y, accent.z);
      root.worldToLocal(local);
      const light = new THREE.PointLight(accent.color, accent.intensity, accent.distance, 2);
      light.position.copy(local);
      light.castShadow = false;
      light.userData.baseIntensity = accent.intensity;
      light.userData.phase = accent.phase;
      root.add(light);
      this.accentLights.push(light);
    });
    console.log(`[mood-lighting] ${this.accentLights.length} acentos violeta de bajo coste`);
  },
  tick(time) {
    if (document.hidden || time < this.nextPulse) return;
    this.nextPulse = time + 50;
    const phase = time * 0.00042;
    this.accentLights.forEach((light) => {
      light.intensity = light.userData.baseIntensity * (0.93 + 0.07 * Math.sin(phase + light.userData.phase));
    });
  },
  remove() {
    this.accentLights.forEach((light) => { if (light.parent) light.parent.remove(light); });
    this.accentLights.length = 0;
  }
});

AFRAME.registerComponent('exhibit-lighting', {
  init() {
    this.spotsByAnchor = {};
    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.object3D;


    const focos = [
      { anchor: 'BACTERIA_MASTER',  intensidad: 2.6, alcance: 8.0, angulo: 0.95, color: 0xfff1de },
      { anchor: 'PEANA_Bioreactor', intensidad: 2.4, alcance: 8.0, angulo: 0.95, color: 0xe9f2ff }
    ];

    const raiz = this.el.object3D;
    let puestos = 0;
    focos.forEach((f) => {
      const o = mesh.getObjectByName(f.anchor);
      if (!o) return;
      const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      raiz.worldToLocal(c);

      const spot = new THREE.SpotLight(f.color, f.intensidad, f.alcance, f.angulo, 1.0, 1.4);
      spot.position.set(c.x, c.y + 2.4, c.z);
      spot.castShadow = false;
      spot.target.position.copy(c);
      spot.userData.baseIntensity = f.intensidad;
      raiz.add(spot);
      raiz.add(spot.target);
      this.spotsByAnchor[f.anchor] = spot;
      puestos++;
    });
    console.log(`[exhibit-lighting] ${puestos} focos de exposicion`);
  }
});


AFRAME.scenes[0]?.addEventListener('loaded', () => {
  document.querySelectorAll('[gltf-model]').forEach((el) => {
    el.setAttribute('log-when-loaded', '');
  });
});


(function () {
  const videos = Array.from(document.querySelectorAll('video[id^="ppb-video-"]'));
  if (!videos.length) return;
  videos.forEach((video) => {
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
  });

  if (MUSEO_IS_MOBILE) {
    videos.forEach((video) => {
      video.autoplay = false;
      video.removeAttribute('autoplay');
      video.preload = 'metadata';
      video.pause();
    });

    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    let screens = [];
    let nextScan = 0;
    const playing = new Set();

    const pauseVideo = (video) => {
      if (!video || video.paused) return;
      video.pause();
      playing.delete(video);
    };
    const playVideo = (video) => {
      if (!video || playing.has(video)) return;
      const p = video.play();
      if (p && p.then) {
        p.then(() => playing.add(video)).catch(() => playing.delete(video));
      } else {
        playing.add(video);
      }
    };
    const videoFromCircle = (circle) => {
      const mat = circle.getAttribute('material');
      const src = typeof mat === 'string'
        ? ((mat.match(/src:\s*#([\w-]+)/) || [])[1])
        : (mat && mat.src && (mat.src.id || String(mat.src).replace(/^#/, '')));
      return src ? document.getElementById(src) : null;
    };
    const scanScreens = () => {
      const now = performance.now();
      if (now < nextScan && screens.length) return;
      nextScan = now + 1200;
      screens = Array.from(document.querySelectorAll('a-circle[id^="PPB_VIDEO_"]'))
        .map((circle) => ({ circle, video: videoFromCircle(circle) }))
        .filter((item) => item.video && item.circle.object3D);
    };
    const update = () => {
      scanScreens();
      const rigPos = museoRigWorldPosition(tmp);
      if (!rigPos || !screens.length) {
        videos.forEach(pauseVideo);
        return;
      }
      const assigned = new Set(screens.map((item) => item.video));
      videos.forEach((video) => { if (!assigned.has(video)) pauseVideo(video); });
      screens.forEach(({ circle, video }) => {
        if (!circle.object3D.visible) { pauseVideo(video); return; }
        const pos = circle.object3D.getWorldPosition(tmp2);
        const dist = museoDistanceXZ(rigPos, pos);
        if (dist < MUSEO_MOBILE_VIDEO_PLAY_DISTANCE) playVideo(video);
        else if (dist > MUSEO_MOBILE_VIDEO_PAUSE_DISTANCE) pauseVideo(video);
      });
    };

    const interval = window.setInterval(update, 450);
    const onReady = () => update();
    const onFirstInteraction = () => update();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) videos.forEach(pauseVideo);
      else update();
    });
    window.addEventListener('pagehide', () => videos.forEach(pauseVideo));
    window.addEventListener('click', onFirstInteraction);
    window.addEventListener('touchstart', onFirstInteraction, { passive: true });
    window.addEventListener('keydown', onFirstInteraction);
    const scene = document.querySelector('a-scene');
    if (scene) {
      scene.addEventListener('museo-ready', onReady);
      scene.addEventListener('loaded', onReady);
    }
    window.MUSEO_MOBILE_VIDEO_PROFILE = { interval, playDistance: MUSEO_MOBILE_VIDEO_PLAY_DISTANCE, pauseDistance: MUSEO_MOBILE_VIDEO_PAUSE_DISTANCE };
    return;
  }

  const tryPlay = () => {
    videos.forEach((video) => {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    });
  };

  videos.forEach((video) => video.addEventListener('ended', tryPlay));
  tryPlay();

  const onFirstInteraction = () => {
    tryPlay();
    window.removeEventListener('click', onFirstInteraction);
    window.removeEventListener('touchstart', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
  };
  window.addEventListener('click', onFirstInteraction);
  window.addEventListener('touchstart', onFirstInteraction);
  window.addEventListener('keydown', onFirstInteraction);
})();


(function () {
  const scene = document.querySelector('a-scene');
  const screen = document.getElementById('loading-screen');
  if (!scene || !screen) return;

  let sceneLoaded = false;
  let museoReady = false;

  function tryHide() {
    if (sceneLoaded && museoReady) {
      screen.classList.add('hidden');
    }
  }

  scene.addEventListener('loaded', () => { sceneLoaded = true; tryHide(); });
  scene.addEventListener('museo-ready', () => { museoReady = true; tryHide(); });
})();


(function () {
  const bar = document.getElementById('controls-help');
  if (!bar) return;
  setTimeout(() => bar.classList.add('faded'), 6000);
})();


AFRAME.registerComponent('co-hydrogen-exhibit', {
  schema: {
    target: { type: 'string', default: 'bacteriaSmall05' },
    trigger: { type: 'number', default: 2.2 },
    release: { type: 'number', default: 2.8 },
    capability: { type: 'string', default: 'co' }
  },

  init() {
    this.ready = false;
    this.active = false;
    this.near = false;
    this.seq = -1;
    this.awarded = false;
    this.displayT = 0;
    this.retry = 0;
    this.pulseT = 0;
    this.nextCO = 0;
    this.pendingH2 = [];
    this.co = [];
    this.h2 = [];
    this.bacteriaMats = [];
    this._wired = [];
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.el.addEventListener('museo-modules-loaded', () => window.setTimeout(() => this.setup(), 0));
  },

  copy() {
    const fallback = { title: 'CO → H₂', sub: 'FROM GAS TO HYDROGEN', co: 'CO' };
    return window.getMuseumExhibitLabel ? (window.getMuseumExhibitLabel('coHydrogen') || fallback) : fallback;
  },

  findVitrine(center) {
    let bell = null, base = null;
    this.el.object3D.traverse((o) => {
      if (!o.isMesh || !o.name) return;
      const isBell = o.name.indexOf('VITRINA_Campana') === 0;
      const isBase = o.name.indexOf('VITRINA_Base') === 0;
      if (!isBell && !isBase) return;
      const b = new THREE.Box3().setFromObject(o);
      if (center.x < b.min.x - 0.02 || center.x > b.max.x + 0.02) return;
      if (center.z < b.min.z - 0.02 || center.z > b.max.z + 0.02) return;
      if (isBell && (!bell || b.max.y > bell.max.y)) bell = b;
      if (isBase && (!base || b.max.y > base.max.y)) base = b;
    });
    return { bell, base };
  },

  setup() {
    const info = this.el.components['exhibit-info'];
    const item = info && info.items && info.items.find((it) => it.id === this.data.target);
    const anchor = item && item.anchorObj;
    if (!info || !item || !anchor) {
      this.retry += 1;
      if (this.retry < 30) window.setTimeout(() => this.setup(), 120);
      else console.warn('[co-h2] no se pudo localizar Rubrivivax');
      return;
    }

    const box = new THREE.Box3().setFromObject(anchor);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const vit = this.findVitrine(center);
    const bell = vit.bell;
    const bellCenter = bell ? bell.getCenter(new THREE.Vector3()) : center.clone();
    const bellRadius = bell
      ? Math.max(bell.max.x - bell.min.x, bell.max.z - bell.min.z) * 0.5
      : Math.max(size.x, size.z) * 0.5 + 0.05;
    const bellTop = bell ? bell.max.y : center.y + 0.2;

    let peana = null, pd = Infinity;
    (info.peanaBoxes || []).forEach((pb) => {
      const d = Math.hypot(pb.center.x - center.x, pb.center.z - center.z);
      if (d < pd) { pd = d; peana = pb; }
    });

    const front = (info._placardRowDir)
      ? new THREE.Vector3(info._placardRowDir.x, 0, info._placardRowDir.z).normalize()
      : new THREE.Vector3(0, 0, 1);

    const right = new THREE.Vector3(front.z, 0, -front.x).normalize();
    const left = right.clone().negate();


    let lateral = bellRadius + 0.060;
    const entry = () => bellCenter.clone().addScaledVector(left, lateral);
    if (peana) {
      const margin = 0.055;
      while (lateral > bellRadius + 0.02 &&
             Math.hypot(entry().x - peana.center.x, entry().z - peana.center.z) > peana.radius - margin) {
        lateral -= 0.006;
      }
    }
    const halfSide = 0.5 * (Math.abs(left.x) * size.x + Math.abs(left.z) * size.z);
    const start = entry();
    start.y = center.y + 0.012;
    const coTarget = center.clone().addScaledVector(left, halfSide * 0.5);
    const h2Origin = center.clone().addScaledVector(right, halfSide * 0.45);
    h2Origin.y = center.y + 0.012;

    this.info = info;
    this.center = center;
    this.left = left;
    this.right = right;
    this.front = front;
    this.coStart = start;
    this.coTarget = coTarget;
    this.h2Origin = h2Origin;
    this.h2Rise = Math.min(0.16, Math.max(0.09, (bellTop - 0.035) - h2Origin.y));
    this.bellTop = bellTop;

    this.collectMaterials(anchor);
    this.buildPath();
    this.buildGuide();
    this.buildCO();
    this.buildH2();
    this.buildLabel();
    this.hotspot = createMuseoHotspot({
      el: this.el, info,
      capability: 'co',
      verb: ((window.getMuseumCapabilityText && window.getMuseumCapabilityText().verbs) || {}).co || 'START REACTION',
      position: museoHotspotSpot(bell, center, front),
      faceDirection: front,
      onActivate: () => this.start()
    });

    this.ready = true;
    console.log('[co-h2] Rubrivivax listo', {
      bacteria: center.toArray().map((v) => +v.toFixed(3)),
      entradaCO: start.toArray().map((v) => +v.toFixed(3)),
      salidaH2: h2Origin.toArray().map((v) => +v.toFixed(3)),
      subidaH2: +this.h2Rise.toFixed(3)
    });
  },

  collectMaterials(anchor) {
    const set = new Set();
    anchor.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (m && m.emissive) set.add(m); });
    });
    this.bacteriaMats = Array.from(set).map((mat) => ({ mat, base: mat.emissiveIntensity || 0 }));
  },

  buildPath() {
    const mid = this.coStart.clone().lerp(this.coTarget, 0.5);
    mid.y += 0.014;
    this.path = new THREE.QuadraticBezierCurve3(this.coStart.clone(), mid, this.coTarget.clone());
  },


  buildGuide() {
    const g = new THREE.Group();
    g.name = 'rubrivivax-guia-co';
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe0b483, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    g.add(new THREE.Mesh(new THREE.TubeGeometry(this.path, 30, 0.0011, 6, false), mat));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.014, 12), mat);
    const t = 0.62;
    head.position.copy(this.path.getPointAt(t));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.path.getTangentAt(t).normalize());
    g.add(head);
    this.el.sceneEl.object3D.add(g);
    this.guide = { group: g, mat };
  },

  buildCOLabelTexture() {
    const c = document.createElement('canvas');
    c.width = 192; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#3a2a18';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 58px Arial, Helvetica, sans-serif';
    ctx.fillText(this.copy().co || 'CO', c.width / 2, c.height / 2 + 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  buildH2LabelTexture() {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#eafcff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 60px Arial, Helvetica, sans-serif';
    ctx.fillText('H₂', c.width / 2, c.height / 2 + 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },


  buildCO() {
    const scene = this.el.sceneEl.object3D;
    const geo = new THREE.SphereGeometry(0.0075, 12, 10);
    const tex = this.buildCOLabelTexture();
    this.coGeo = geo;
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe8c089, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      const tagMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.030, 0.015), tagMat);
      tag.position.set(0, 0.019, 0);
      mesh.add(tag);
      scene.add(mesh);
      this.co.push({ mesh, mat, tag, tagMat, active: false, t: 0, speed: 0.5 });
    }
  },


  buildH2() {
    const scene = this.el.sceneEl.object3D;
    const geo = new THREE.SphereGeometry(0.005, 10, 8);
    const tagTex = this.buildH2LabelTexture();
    this.h2Geo = geo;
    const h2Count = museoMobileCount(8, 0.75, 5);
    for (let i = 0; i < h2Count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd6f6ff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      let tag = null, tagMat = null;
      if (i % 3 === 0) {
        tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        tag = new THREE.Mesh(new THREE.PlaneGeometry(0.027, 0.015), tagMat);
        tag.visible = false;
        scene.add(tag);
      }
      this.h2.push({ mesh, mat, tag, tagMat, active: false, t: 0, speed: 0.5, sway: 0, dx: 0, dz: 0 });
    }
  },

  buildLabel() {
    const c = document.createElement('canvas');
    c.width = 700; c.height = 190;
    const ctx = c.getContext('2d');
    const copy = this.copy();
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(10, 8, 14, 0.60)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#C79BEA';
    ctx.fillRect(0, 0, 7, c.height);
    ctx.textAlign = 'left';
    const fit = (text, weight, maxPx, boxW) => {
      let size = maxPx;
      ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      while (size > 20 && ctx.measureText(text).width > boxW) {
        size -= 2;
        ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      }
    };
    const boxW = c.width - 34 - 26;
    ctx.fillStyle = '#E8C089';
    fit(copy.title, '900', 58, boxW);
    ctx.fillText(copy.title, 34, 78);
    ctx.fillStyle = 'rgba(247, 244, 250, 0.86)';
    fit(copy.sub, '700', 40, boxW);
    ctx.fillText(copy.sub, 34, 142);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    group.name = 'rubrivivax-microetiqueta';


    group.position.copy(this.coStart).addScaledVector(this.left, 0.048);
    group.position.y = Math.min(this.bellTop - 0.030, this.center.y + 0.115);
    this.el.sceneEl.object3D.add(group);
    faceMuseoFront(group, this.front);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.170, 0.046), mat));
    this.label = { group, mat };
  },

  now() { return (window.performance && performance.now) ? performance.now() : Date.now(); },


  isRunning() { return this.seq >= 0 && this.seq < 2.35; },


  start() {
    if (this.seq >= 0) return;
    this.seq = 0;
    this.active = true;
    this.nextCO = 0.72;
    this.spawnCO(true);
  },

  spawnCO(force) {
    if (!this.ready || (!this.active && !force)) return;
    const p = this.co.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.t = 0;
    p.speed = 1 / THREE.MathUtils.randFloat(1.35, 1.85);
    p.mesh.visible = true;
    p.mat.opacity = 0;
  },

  spawnH2() {
    const p = this.h2.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.t = 0;
    p.speed = 1 / THREE.MathUtils.randFloat(2.0, 3.0);
    p.sway = THREE.MathUtils.randFloat(0.004, 0.010);
    const a = Math.random() * Math.PI * 2;
    p.dx = Math.cos(a); p.dz = Math.sin(a);
    p.mesh.visible = true;
    p.mat.opacity = 0;
  },

  setVisibleAmount(t) {
    const eased = t * t * (3 - 2 * t);
    const boosting = this.isRunning();
    if (this.guide) {
      this.guide.group.visible = eased > 0.01;
      this.guide.mat.opacity = (0.04 + 0.22 * eased) * (boosting ? 1.5 : 1);
    }
    if (this.label) {
      this.label.group.visible = eased > 0.03;
      this.label.mat.opacity = 0.94 * Math.max(0, (eased - 0.03) / 0.97);
    }
  },

  updateCO(dt) {
    const boosting = this.isRunning();
    if (this.active && this.seq >= this.nextCO) {
      this.spawnCO(false);
      this.nextCO = this.seq + (boosting ? THREE.MathUtils.randFloat(0.72, 0.92) : THREE.MathUtils.randFloat(1.0, 1.3));
    }
    this.co.forEach((p) => {
      if (!p.active) return;
      p.t += p.speed * dt;
      const tt = Math.min(p.t, 1);
      p.mesh.position.copy(this.path.getPointAt(tt));
      const fadeIn = THREE.MathUtils.clamp(p.t / 0.12, 0, 1);
      const fadeOut = THREE.MathUtils.clamp((1 - p.t) / 0.20, 0, 1);
      const a = 0.95 * this.displayT * fadeIn * fadeOut;
      p.mat.opacity = a;
      p.tagMat.opacity = a * 0.92;
      if (p.t >= 1) {
        p.active = false;
        p.mesh.visible = false;
        this.pulseT = 1;
        this.pendingH2.push(this.now() + 360);
      }
    });
  },

  updateH2(dt) {
    const now = this.now();
    while (this.pendingH2.length && this.pendingH2[0] <= now) {
      this.pendingH2.shift();
      this.spawnH2();
    }
    this.h2.forEach((p) => {
      if (!p.active) return;
      p.t += p.speed * dt;
      if (p.t >= 1) {
        p.active = false;
        p.mesh.visible = false;
        p.mat.opacity = 0;
        if (p.tag) { p.tag.visible = false; p.tagMat.opacity = 0; }
        return;
      }
      const rise = this.h2Rise * p.t;
      const wob = Math.sin(p.t * 6.5) * p.sway;
      p.mesh.position.set(
        this.h2Origin.x + p.dx * (0.006 + p.t * 0.014) + wob * 0.4,
        this.h2Origin.y + rise,
        this.h2Origin.z + p.dz * (0.006 + p.t * 0.014)
      );
      p.mesh.scale.setScalar(1 + p.t * 0.45);
      const fadeIn = Math.min(1, p.t / 0.14);
      const fadeOut = Math.min(1, (1 - p.t) / 0.34);
      const a = 0.9 * this.displayT * Math.min(fadeIn, fadeOut);
      p.mat.opacity = a;
      if (p.tag) {
        p.tag.visible = true;
        p.tag.position.set(p.mesh.position.x + 0.013, p.mesh.position.y + 0.012, p.mesh.position.z);
        p.tagMat.opacity = a * 0.95;
      }
    });
  },

  updatePulse(dt) {
    if (this.pulseT > 0) this.pulseT = Math.max(0, this.pulseT - dt / 0.34);
    const p = Math.sin(this.pulseT * Math.PI);
    this.bacteriaMats.forEach(({ mat, base }) => {
      mat.emissiveIntensity = base + (base > 0.01 ? base * 0.26 : 0.08) * p;
    });
  },

  tick(time, delta) {
    if (!this.ready) return;
    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp2);
    const d = Math.hypot(p.x - this.center.x, p.z - this.center.z);
    const boosting = this.isRunning();
    if (!this.near && d <= this.data.trigger) this.near = true;
    else if (this.near && d >= this.data.release) this.near = false;

    const dt = Math.min(0.05, Math.max(0.001, (delta || 16) / 1000));
    if (this.seq >= 0) {
      this.seq += dt;
      if (this.seq > 7.6) this.seq = -1;
    }
    const running = this.seq >= 0;
    this.active = this.isRunning();
    if (museoMobileSkipIdle(this, running)) return;


    if (running && !this.awarded && this.seq >= 5.0) {
      this.awarded = true;
      if (window.unlockCapability) window.unlockCapability(this.data.capability);
    }
    if (!running) this.awarded = false;

    this.displayT += (((this.near || running) ? 1 : 0) - this.displayT) * 0.07;
    this.setVisibleAmount(this.displayT);
    this.updateCO(dt);
    this.updateH2(dt);
    this.updatePulse(dt);

    const cam = this.el.sceneEl.camera;
    const cw = cam ? cam.getWorldPosition(this.tmp) : null;
    if (cw) {
      if (this.label && !this.label.group.userData.museoFixedFront) this.label.group.lookAt(cw);
      this.co.forEach((x) => { if (x.active) x.tag.lookAt(cw); });
      this.h2.forEach((x) => { if (x.tag && x.active) x.tag.lookAt(cw); });
    }
    if (this.hotspot) {
      this.hotspot.tick(dt, cw, this.displayT,
        !!(window.hasCapability && window.hasCapability(this.data.capability)), running);
    }
  },

  remove() {
    if (this.hotspot) this.hotspot.dispose();
    this.bacteriaMats.forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    this._wired.forEach((m) => { if (m.userData) delete m.userData.museoAction; });
    [this.guide && this.guide.group, this.label && this.label.group].forEach((g) => {
      if (g && g.parent) g.parent.remove(g);
    });
    this.co.concat(this.h2).forEach((x) => {
      if (x.mesh && x.mesh.parent) x.mesh.parent.remove(x.mesh);
      if (x.tag && x.tag.parent) x.tag.parent.remove(x.tag);
    });
    if (this.coGeo) this.coGeo.dispose();
    if (this.h2Geo) this.h2Geo.dispose();
  }
});


AFRAME.registerComponent('pha-exhibit', {
  schema: {
    target: { type: 'string', default: 'bacteriaLarge01' },
    trigger: { type: 'number', default: 3.2 },
    release: { type: 'number', default: 4.0 },
    granules: { type: 'number', default: 5 },
    capability: { type: 'string', default: 'pha' }
  },

  init() {
    this.ready = false;
    this.near = false;
    this.displayT = 0;
    this.retry = 0;
    this.seq = -1;
    this.awarded = false;
    this.granules = [];
    this.carbon = [];
    this.nextCarbon = 0;
    this._wired = [];
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.el.addEventListener('museo-modules-loaded', () => window.setTimeout(() => this.setup(), 0));
  },

  copy() {
    const fallback = { title: 'PHA', sub: 'CARBON STORAGE' };
    return window.getMuseumExhibitLabel ? (window.getMuseumExhibitLabel('pha') || fallback) : fallback;
  },

  setup() {
    const info = this.el.components['exhibit-info'];
    const item = info && info.items && info.items.find((it) => it.id === this.data.target);
    const anchor = item && item.anchorObj;
    if (!info || !item || !anchor) {
      this.retry += 1;
      if (this.retry < 30) window.setTimeout(() => this.setup(), 120);
      else console.warn('[pha] no se pudo localizar R. rubrum');
      return;
    }


    let body = null;
    anchor.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.material.name === 'Bacteria_Mat' && !body) body = o;
    });
    if (!body) body = anchor;

    const box = new THREE.Box3().setFromObject(body);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const front = (info._placardRowDir)
      ? new THREE.Vector3(info._placardRowDir.x, 0, info._placardRowDir.z).normalize()
      : new THREE.Vector3(1, 0, 0);


    const axes = [
      { v: new THREE.Vector3(1, 0, 0), len: size.x },
      { v: new THREE.Vector3(0, 1, 0), len: size.y },
      { v: new THREE.Vector3(0, 0, 1), len: size.z }
    ].sort((a, b) => b.len - a.len);
    const along = axes[0];


    const cross = axes.slice(1).sort((a, b) => Math.abs(b.v.dot(front)) - Math.abs(a.v.dot(front)));


    let bell = null;
    this.el.object3D.traverse((o) => {
      if (!o.isMesh || !o.name || o.name.indexOf('VITRINA_Campana') !== 0) return;
      const b = new THREE.Box3().setFromObject(o);
      if (center.x < b.min.x || center.x > b.max.x || center.z < b.min.z || center.z > b.max.z) return;
      if (!bell || (b.max.y - b.min.y) > (bell.max.y - bell.min.y)) bell = b;
    });
    const bellTop = bell ? bell.max.y : center.y + 0.5;
    const bellRadius = bell
      ? Math.min(bell.max.x - bell.min.x, bell.max.z - bell.min.z) * 0.5
      : Math.max(size.x, size.z);

    this.info = info;
    this.bodyMesh = body;
    this.center = center;
    this.halfLong = along.len * 0.5;
    this.axisLong = along.v;
    this.axisA = cross[0].v;
    this.axisB = cross[1].v;
    this.radA = cross[0].len * 0.5;
    this.radB = cross[1].len * 0.5;
    this.front = front;
    this.bellTop = bellTop;
    this.bellRadius = bellRadius;

    this.collectMaterials(anchor);
    this.buildGranules();
    this.buildCarbon();
    this.buildLabel();
    this.hotspot = createMuseoHotspot({
      el: this.el, info,
      capability: 'pha',
      verb: ((window.getMuseumCapabilityText && window.getMuseumCapabilityText().verbs) || {}).pha || 'SHOW ACCUMULATION',
      position: museoHotspotSpot(bell, center, front),
      faceDirection: front,
      onActivate: () => this.start()
    });

    this.ready = true;
    console.log('[pha] R. rubrum listo', {
      cuerpo: center.toArray().map((v) => +v.toFixed(3)),
      tamano: size.toArray().map((v) => +v.toFixed(3)),
      granulos: this.granules.length,
      campanaTop: +bellTop.toFixed(3)
    });
  },

  collectMaterials(anchor) {
    const set = new Set();
    anchor.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (m && m.emissive) set.add(m); });
    });
    this.mats = Array.from(set).map((mat) => ({ mat, base: mat.emissiveIntensity || 0 }));
  },


  surfacePoint(u, theta, sink) {
    const taper = Math.sqrt(Math.max(0.18, 1 - u * u * 0.92));
    const ca = Math.cos(theta), sb = Math.sin(theta);
    const dirFront = this.axisA.dot(this.front) >= 0 ? 1 : -1;
    const p = this.center.clone()
      .addScaledVector(this.axisLong, u * this.halfLong)
      .addScaledVector(this.axisA, dirFront * this.radA * taper * ca)
      .addScaledVector(this.axisB, this.radB * taper * sb);
    const n = new THREE.Vector3()
      .addScaledVector(this.axisA, dirFront * ca / Math.max(this.radA, 1e-4))
      .addScaledVector(this.axisB, sb / Math.max(this.radB, 1e-4))
      .normalize();
    if (sink) p.addScaledVector(n, sink);
    return { p, n };
  },

  buildGranules() {
    const scene = this.el.sceneEl.object3D;
    const n = THREE.MathUtils.clamp(Math.round(this.data.granules), 3, 6);
    const geo = new THREE.SphereGeometry(1, 18, 14);
    this.granuleGeo = geo;
    for (let i = 0; i < n; i++) {

      const u = -0.62 + (i + 0.5) * (1.24 / n) + ((i % 2) ? 0.05 : -0.05);
      const theta = (i % 2 ? 1 : -1) * (0.18 + (i % 3) * 0.16);
      const r = 0.034 + ((i * 7) % 3) * 0.008;
      const { p } = this.surfacePoint(u, theta, -r * 0.24);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7d3fa8, emissive: 0x3d1c58, emissiveIntensity: 0.30,
        roughness: 0.30, metalness: 0.04, transparent: true, opacity: 0
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(p);
      mesh.scale.setScalar(0.001);
      mesh.visible = false;
      scene.add(mesh);
      this.granules.push({ mesh, mat, radius: r, t: 0 });
    }
  },

  buildCarbon() {
    const scene = this.el.sceneEl.object3D;
    const geo = new THREE.SphereGeometry(0.0075, 10, 8);
    const tagTex = this.buildCarbonLabelTexture();
    this.carbonGeo = geo;
    const carbonCount = museoMobileCount(14, 0.70, 8);
    for (let i = 0; i < carbonCount; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xefe0c4, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      let tag = null, tagMat = null;
      if (i % 4 === 0) {
        tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        tag = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.014), tagMat);
        tag.visible = false;
        scene.add(tag);
      }
      scene.add(mesh);
      this.carbon.push({ mesh, mat, tag, tagMat, active: false, t: 0, speed: 0.5, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
  },

  buildCarbonLabelTexture() {
    const c = document.createElement('canvas');
    c.width = 120; c.height = 72;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff0d4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 50px Arial, Helvetica, sans-serif';
    ctx.fillText('C', c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  buildLabel() {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 190;
    const ctx = c.getContext('2d');
    const copy = this.copy();
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(10, 8, 14, 0.58)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#C79BEA';
    ctx.fillRect(0, 0, 7, c.height);
    ctx.textAlign = 'left';
    const fit = (text, weight, maxPx, boxW) => {
      let size = maxPx;
      ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      while (size > 20 && ctx.measureText(text).width > boxW) {
        size -= 2;
        ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      }
    };
    const boxW = c.width - 34 - 26;
    ctx.fillStyle = '#D9B6F2';
    fit(copy.title, '900', 60, boxW);
    ctx.fillText(copy.title, 34, 78);
    ctx.fillStyle = 'rgba(247, 244, 250, 0.86)';
    fit(copy.sub, '700', 40, boxW);
    ctx.fillText(copy.sub, 34, 142);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    group.name = 'rubrum-microetiqueta-pha';
    group.position.set(this.center.x, this.bellTop + 0.075, this.center.z);
    this.el.sceneEl.object3D.add(group);
    faceMuseoFront(group, this.front);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.061), mat));
    this.label = { group, mat };
    this.buildPhaCallout();
  },

  buildPhaCallout() {
    if (!this.granules.length) return;
    const scene = this.el.sceneEl.object3D;
    const c = document.createElement('canvas');
    c.width = 160; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#F1D5FF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 50px Arial, Helvetica, sans-serif';
    ctx.fillText('PHA', c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.024), mat);
    plane.position.copy(this.granules[0].mesh.position).addScaledVector(this.front, 0.075).add(new THREE.Vector3(0, 0.045, 0));
    scene.add(plane);
    faceMuseoFront(plane, this.front);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xd9b6f2, transparent: true, opacity: 0, depthWrite: false });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      plane.position.clone().add(new THREE.Vector3(0, -0.010, 0)),
      this.granules[0].mesh.position.clone()
    ]);
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);
    this.phaCallout = { plane, mat, line, lineMat };
  },


  start() {
    this.seq = 0;
    this.nextCarbon = 0;
    this.granules.forEach((g) => { g.t = 0; g.mesh.visible = false; g.mat.opacity = 0; g.mesh.scale.setScalar(0.001); });
  },

  spawnCarbon() {
    const p = this.carbon.find((x) => !x.active);
    if (!p) return;

    const a = Math.random() * Math.PI * 2;
    const b = (Math.random() - 0.5) * 1.1;
    const rad = Math.min(this.bellRadius * 0.80, Math.max(this.radA, this.radB) + 0.28);
    p.from.set(
      this.center.x + Math.cos(a) * rad,
      this.center.y + Math.sin(b) * rad * 0.55,
      this.center.z + Math.sin(a) * rad
    );
    const u = (Math.random() * 2 - 1) * 0.7;
    const theta = (Math.random() - 0.5) * 1.5;
    p.to.copy(this.surfacePoint(u, theta, 0).p);
    p.active = true;
    p.t = 0;
    p.speed = 1 / THREE.MathUtils.randFloat(1.1, 1.7);
    p.mesh.visible = true;
    p.mat.opacity = 0;
    if (p.tag) { p.tag.visible = true; p.tagMat.opacity = 0; }
  },

  updateCarbon(dt) {


    if (this.seq >= 0 && this.seq < 2.0 && this.seq >= this.nextCarbon) {
      this.spawnCarbon();
      this.nextCarbon = this.seq + THREE.MathUtils.randFloat(0.10, 0.18);
    }
    this.carbon.forEach((p) => {
      if (!p.active) return;
      p.t += p.speed * dt;
      if (p.t >= 1) {
        p.active = false;
        p.mesh.visible = false;
        p.mat.opacity = 0;
        if (p.tag) { p.tag.visible = false; p.tagMat.opacity = 0; }
        return;
      }
      const e = p.t * p.t * (3 - 2 * p.t);
      p.mesh.position.lerpVectors(p.from, p.to, e);
      const fadeIn = Math.min(1, p.t / 0.16);
      const fadeOut = Math.min(1, (1 - p.t) / 0.22);
      const a = 0.92 * Math.min(fadeIn, fadeOut);
      p.mat.opacity = a;
      if (p.tag) {
        p.tag.visible = true;
        p.tag.position.copy(p.mesh.position).add(new THREE.Vector3(0, 0.018, 0));
        p.tagMat.opacity = a * 0.9;
      }
    });
  },


  updateGranules() {
    const START = 2.05, STEP = 0.25, GROW = 0.42, HOLD = 8.0, FADE = 1.2;
    let done = 0;
    this.granules.forEach((g, i) => {
      const t0 = START + i * STEP;
      let a = 0;
      if (this.seq >= t0) {
        const grow = THREE.MathUtils.clamp((this.seq - t0) / GROW, 0, 1);
        const fade = 1 - THREE.MathUtils.clamp((this.seq - HOLD) / FADE, 0, 1);
        a = grow * fade;
        if (grow >= 1) done += 1;
      }
      g.t = a;
      const eased = a * a * (3 - 2 * a);
      g.mesh.visible = eased > 0.01;
      g.mesh.scale.setScalar(Math.max(0.001, g.radius * (0.55 + 0.45 * eased)));
      g.mat.opacity = 0.94 * eased;
    });
    return done;
  },

  updatePhaCallout(done, cam) {
    if (!this.phaCallout) return;
    const running = this.seq >= 0;
    const show = running && done >= this.granules.length && this.seq < 7.2;
    const t = show ? THREE.MathUtils.clamp((this.seq - 3.55) / 0.45, 0, 1) : 0;
    this.phaCallout.plane.visible = t > 0.02;
    this.phaCallout.line.visible = t > 0.02;
    this.phaCallout.mat.opacity = t * 0.92;
    this.phaCallout.lineMat.opacity = t * 0.70;
    if (cam && t > 0.02 && !this.phaCallout.plane.userData.museoFixedFront) this.phaCallout.plane.lookAt(cam);
  },

  tick(time, delta) {
    if (!this.ready) return;
    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp2);
    const d = Math.hypot(p.x - this.center.x, p.z - this.center.z);
    if (!this.near && d <= this.data.trigger) this.near = true;
    else if (this.near && d >= this.data.release) this.near = false;

    const dt = Math.min(0.05, Math.max(0.001, (delta || 16) / 1000));
    if (this.seq >= 0) {
      this.seq += dt;
      if (this.seq > 9.4) this.seq = -1;
    }
    const running = this.seq >= 0;
    if (museoMobileSkipIdle(this, running)) return;


    this.displayT += (((this.near || running) ? 1 : 0) - this.displayT) * 0.07;
    if (this.label) {
      this.label.group.visible = this.displayT > 0.03;
      this.label.mat.opacity = this.displayT * (running ? 0.95 : 0.5);
    }

    this.updateCarbon(dt);
    const done = this.updateGranules();


    if (running && !this.awarded && done >= this.granules.length && this.seq >= 4.2) {
      this.awarded = true;
      if (window.unlockCapability) window.unlockCapability(this.data.capability);
    }
    if (!running) this.awarded = false;

    const cam = this.el.sceneEl.camera;
    const cw = cam ? cam.getWorldPosition(this.tmp) : null;
    if (cw && this.label && !this.label.group.userData.museoFixedFront) this.label.group.lookAt(cw);
    this.updatePhaCallout(done, cw);
    if (cw) this.carbon.forEach((c) => { if (c.tag && c.active) c.tag.lookAt(cw); });
    if (this.hotspot) {
      this.hotspot.tick(dt, cw, this.displayT,
        !!(window.hasCapability && window.hasCapability(this.data.capability)), running);
    }
  },

  remove() {
    if (this.hotspot) this.hotspot.dispose();
    (this.mats || []).forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    this._wired.forEach((m) => { if (m.userData) delete m.userData.museoAction; });
    if (this.label && this.label.group && this.label.group.parent) this.label.group.parent.remove(this.label.group);
    if (this.phaCallout) {
      if (this.phaCallout.plane.parent) this.phaCallout.plane.parent.remove(this.phaCallout.plane);
      if (this.phaCallout.line.parent) this.phaCallout.line.parent.remove(this.phaCallout.line);
    }
    this.granules.concat(this.carbon).forEach((x) => {
      if (x.mesh && x.mesh.parent) x.mesh.parent.remove(x.mesh);
      if (x.tag && x.tag.parent) x.tag.parent.remove(x.tag);
    });
    if (this.granuleGeo) this.granuleGeo.dispose();
    if (this.carbonGeo) this.carbonGeo.dispose();
  }
});


AFRAME.registerComponent('hydrogen-exhibit', {
  schema: {
    target: { type: 'string', default: 'bacteriaSmall06' },
    trigger: { type: 'number', default: 2.2 },
    release: { type: 'number', default: 2.8 },
    capability: { type: 'string', default: 'hydrogen' }
  },

  init() {
    this.ready = false;
    this.near = false;
    this.displayT = 0;
    this.retry = 0;
    this.seq = -1;
    this.awarded = false;
    this.glow = 0;
    this.pulseT = 0;
    this.lightPulseDone = false;
    this.nextBubble = 0;
    this.photons = [];
    this.bubbles = [];
    this._wired = [];
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.el.addEventListener('museo-modules-loaded', () => window.setTimeout(() => this.setup(), 0));
  },

  copy() {
    const fallback = { title: 'H₂', sub: 'PHOTOBIOLOGICAL HYDROGEN PRODUCTION', tag: 'H₂' };
    return window.getMuseumExhibitLabel ? (window.getMuseumExhibitLabel('hydrogen') || fallback) : fallback;
  },

  setup() {
    const info = this.el.components['exhibit-info'];
    const item = info && info.items && info.items.find((it) => it.id === this.data.target);
    const anchor = item && item.anchorObj;
    if (!info || !item || !anchor) {
      this.retry += 1;
      if (this.retry < 30) window.setTimeout(() => this.setup(), 120);
      else console.warn('[h2] no se pudo localizar R. palustris');
      return;
    }

    const box = new THREE.Box3().setFromObject(anchor);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    let bell = null;
    this.el.object3D.traverse((o) => {
      if (!o.isMesh || !o.name || o.name.indexOf('VITRINA_Campana') !== 0) return;
      const b = new THREE.Box3().setFromObject(o);
      if (center.x < b.min.x - 0.02 || center.x > b.max.x + 0.02) return;
      if (center.z < b.min.z - 0.02 || center.z > b.max.z + 0.02) return;
      if (!bell || b.max.y > bell.max.y) bell = b;
    });
    const bellCenter = bell ? bell.getCenter(new THREE.Vector3()) : center.clone();
    const bellRadius = bell
      ? Math.max(bell.max.x - bell.min.x, bell.max.z - bell.min.z) * 0.5
      : Math.max(size.x, size.z) * 0.5 + 0.05;
    const bellTop = bell ? bell.max.y : center.y + 0.2;

    let peana = null, pd = Infinity;
    (info.peanaBoxes || []).forEach((pb) => {
      const d = Math.hypot(pb.center.x - center.x, pb.center.z - center.z);
      if (d < pd) { pd = d; peana = pb; }
    });
    const standTop = peana ? peana.maxY : (bell ? bell.min.y - 0.06 : center.y - 0.2);

    const front = (info._placardRowDir)
      ? new THREE.Vector3(info._placardRowDir.x, 0, info._placardRowDir.z).normalize()
      : new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(front.z, 0, -front.x).normalize();


    const place = (dir, lat) => bellCenter.clone().addScaledVector(dir, lat).addScaledVector(front, -0.018);
    const fits = (p) => !peana || Math.hypot(p.x - peana.center.x, p.z - peana.center.z) <= peana.radius - 0.055;
    let side = right.clone();
    let lateral = bellRadius + 0.060;
    let pos = place(side, lateral);
    if (!fits(pos)) {
      const alt = place(right.clone().negate(), lateral);
      if (fits(alt)) { side = right.clone().negate(); pos = alt; }
      else { while (lateral > bellRadius + 0.02 && !fits(pos)) { lateral -= 0.006; pos = place(side, lateral); } }
    }
    pos.y = standTop + 0.002;

    this.info = info;
    this.center = center;
    this.front = front;
    this.side = side;
    this.indicatorBase = pos;
    this.plateY = center.y - 0.004;
    this.bellTop = bellTop;
    this.riseFrom = center.y + size.y * 0.18;
    this.riseTo = Math.min(bellTop - 0.035, this.riseFrom + 0.145);
    this.spreadX = size.x * 0.30;
    this.spreadZ = size.z * 0.30;
    this.lightFrom = center.clone().addScaledVector(front, -0.20).add(new THREE.Vector3(0, size.y * 0.40, 0));
    this.lightTarget = center.clone().add(new THREE.Vector3(0, size.y * 0.08, 0));

    this.collectMaterials(anchor);
    this.buildIndicator();
    this.buildPhotons();
    this.buildBubbles();
    this.buildLabel();
    this.hotspot = createMuseoHotspot({
      el: this.el, info,
      capability: 'hydrogen',
      verb: ((window.getMuseumCapabilityText && window.getMuseumCapabilityText().verbs) || {}).hydrogen || 'PRODUCE H₂',
      position: museoHotspotSpot(bell, center, front),
      faceDirection: front,
      onActivate: () => this.start()
    });

    this.ready = true;
    console.log('[h2] R. palustris listo', {
      bacteria: center.toArray().map((v) => +v.toFixed(3)),
      indicador: pos.toArray().map((v) => +v.toFixed(3)),
      subida: [+this.riseFrom.toFixed(3), +this.riseTo.toFixed(3)]
    });
  },

  collectMaterials(anchor) {
    const set = new Set();
    anchor.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (m && m.emissive) set.add(m); });
    });
    this.mats = Array.from(set).map((mat) => ({ mat, base: mat.emissiveIntensity || 0 }));
  },

  buildIndicatorTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 168;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 96px Arial, Helvetica, sans-serif';
    ctx.fillText(this.copy().tag || 'H₂', c.width / 2, c.height / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },


  buildIndicator() {
    const group = new THREE.Group();
    group.name = 'palustris-indicador-h2';
    group.position.copy(this.indicatorBase);
    const face = this.front.clone();
    group.rotation.y = Math.atan2(face.x, face.z);
    this.el.sceneEl.object3D.add(group);

    const W = 0.058, H = 0.038, T = 0.004;
    const y = this.plateY - this.indicatorBase.y;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1c2124, roughness: 0.5, metalness: 0.5,
      emissive: 0x0c3b45, emissiveIntensity: 0, transparent: true, opacity: 0
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), bodyMat);
    body.position.set(0, y, 0);
    group.add(body);

    const tagMat = new THREE.MeshBasicMaterial({
      map: this.buildIndicatorTexture(), transparent: true, opacity: 0,
      depthWrite: false, color: 0x6d7578
    });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.82, H * 0.82), tagMat);
    tag.position.set(0, y, T / 2 + 0.0006);
    group.add(tag);

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x24282a, roughness: 0.5, metalness: 0.55, transparent: true, opacity: 0
    });
    const stemH = Math.max(0.004, y - H / 2);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.003, stemH, 10), stemMat);
    stem.position.set(0, stemH / 2, 0);
    group.add(stem);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.30, W * 0.34, 0.005, 18), stemMat);
    foot.position.set(0, 0.0025, 0);
    group.add(foot);

    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2.2, H * 2.4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
    );
    hit.position.set(0, y, T / 2 + 0.004);
    group.add(hit);
    hit.userData.museoExhibitId = 'hydrogenIndicator';
    hit.userData.museoAction = () => this.start();
    if (this.info && this.info.selectableMeshes) this.info.selectableMeshes.push(hit);

    this.indicator = { group, bodyMat, tagMat, stemMat, hit };
  },

  buildPhotons() {
    const scene = this.el.sceneEl.object3D;
    const geo = new THREE.SphereGeometry(0.0048, 10, 8);
    this.photonGeo = geo;
    const photonCount = museoMobileCount(5, 0.80, 4);
    for (let i = 0; i < photonCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff2a8, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.photons.push({
        mesh, mat,
        delay: i * 0.12,
        offset: new THREE.Vector3((i - (photonCount - 1) / 2) * 0.018, ((i % 2) - 0.5) * 0.018, (((photonCount - 1) / 2) - i) * 0.006)
      });
    }
  },

  buildBubbleTagTexture() {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#eafcff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 62px Arial, Helvetica, sans-serif';
    ctx.fillText(this.copy().tag || 'H₂', c.width / 2, c.height / 2 + 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  buildBubbles() {
    const scene = this.el.sceneEl.object3D;
    const geo = new THREE.SphereGeometry(1, 12, 10);
    const tagTex = this.buildBubbleTagTexture();
    this.bubbleGeo = geo;
    const bubbleCount = museoMobileCount(10, 0.70, 7);
    for (let i = 0; i < bubbleCount; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd8f7ff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;

      const tagged = (i % 3 === 0);
      let tag = null, tagMat = null;
      if (tagged) {
        tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        tag = new THREE.Mesh(new THREE.PlaneGeometry(0.030, 0.017), tagMat);
        scene.add(tag);
      }
      scene.add(mesh);
      this.bubbles.push({ mesh, mat, tag, tagMat, active: false, t: 0, speed: 0.3, r: 0.005, x: 0, z: 0, sway: 0, phase: 0 });
    }
  },

  buildLabel() {
    const c = document.createElement('canvas');
    c.width = 760; c.height = 190;
    const ctx = c.getContext('2d');
    const copy = this.copy();
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(8, 12, 16, 0.60)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#8FE6F5';
    ctx.fillRect(0, 0, 7, c.height);
    ctx.textAlign = 'left';
    const fit = (text, weight, maxPx, boxW) => {
      let size = maxPx;
      ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      while (size > 18 && ctx.measureText(text).width > boxW) {
        size -= 2;
        ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      }
    };
    const boxW = c.width - 34 - 26;
    ctx.fillStyle = '#B9F2FB';
    fit(copy.title, '900', 58, boxW);
    ctx.fillText(copy.title, 34, 76);
    ctx.fillStyle = 'rgba(247, 251, 252, 0.86)';
    fit(copy.sub, '700', 38, boxW);
    ctx.fillText(copy.sub, 34, 142);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    group.name = 'palustris-microetiqueta-h2';

    group.position.copy(this.indicatorBase).addScaledVector(this.side, 0.052);
    group.position.y = Math.min(this.bellTop - 0.030, this.center.y + 0.115);
    this.el.sceneEl.object3D.add(group);
    faceMuseoFront(group, this.front);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.052), mat));
    this.label = { group, mat };
  },


  start() {
    this.seq = 0;
    this.pulseT = 0;
    this.lightPulseDone = false;
    this.nextBubble = 1.25;
  },

  spawnBubble() {
    const b = this.bubbles.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.t = 0;
    b.r = THREE.MathUtils.randFloat(0.0035, 0.0085);
    b.speed = 1 / THREE.MathUtils.randFloat(2.6, 4.2);
    b.x = this.center.x + THREE.MathUtils.randFloatSpread(this.spreadX * 2);
    b.z = this.center.z + THREE.MathUtils.randFloatSpread(this.spreadZ * 2);
    b.sway = THREE.MathUtils.randFloat(0.003, 0.009);
    b.phase = Math.random() * Math.PI * 2;
    b.mesh.visible = true;
    b.mat.opacity = 0;
    if (b.tag) { b.tag.visible = true; b.tagMat.opacity = 0; }
  },

  updateBubbles(dt, secs) {


    if (this.seq >= 0 && this.seq < 3.8 && this.seq >= this.nextBubble) {
      this.spawnBubble();
      this.nextBubble = this.seq + THREE.MathUtils.randFloat(0.26, 0.44);
    }
    this.bubbles.forEach((b) => {
      if (!b.active) return;
      b.t += b.speed * dt;
      if (b.t >= 1) {
        b.active = false;
        b.mesh.visible = false;
        b.mat.opacity = 0;
        if (b.tag) { b.tag.visible = false; b.tagMat.opacity = 0; }
        return;
      }

      const wob = Math.sin(secs * 1.5 + b.phase) * b.sway;
      const wob2 = Math.cos(secs * 1.1 + b.phase * 1.7) * b.sway * 0.7;
      const y = THREE.MathUtils.lerp(this.riseFrom, this.riseTo, b.t);
      b.mesh.position.set(b.x + wob, y, b.z + wob2);
      b.mesh.scale.setScalar(b.r * (1 + b.t * 0.35));
      const fadeIn = Math.min(1, b.t / 0.16);
      const fadeOut = Math.min(1, (1 - b.t) / 0.30);
      const a = 0.88 * Math.min(fadeIn, fadeOut);
      b.mat.opacity = a;
      if (b.tag) {
        b.tag.position.set(b.mesh.position.x + b.r * 2.4, y + b.r * 1.4, b.mesh.position.z);
        b.tagMat.opacity = a * 0.95;
      }
    });
  },

  updatePhotons() {
    this.photons.forEach((p) => {
      if (this.seq < 0) { p.mesh.visible = false; p.mat.opacity = 0; return; }
      const t = (this.seq - p.delay) / 0.82;
      if (t < 0 || t > 1.25) { p.mesh.visible = false; p.mat.opacity = 0; return; }
      const e = THREE.MathUtils.clamp(t, 0, 1);
      const smooth = e * e * (3 - 2 * e);
      const from = this.lightFrom.clone().add(p.offset);
      const to = this.lightTarget.clone().addScaledVector(this.front, p.offset.x * 0.30);
      p.mesh.position.lerpVectors(from, to, smooth);
      p.mesh.scale.setScalar(1 + smooth * 0.35);
      p.mesh.visible = true;
      p.mat.opacity = 0.88 * Math.min(THREE.MathUtils.clamp(t / 0.18, 0, 1), THREE.MathUtils.clamp((1.25 - t) / 0.25, 0, 1));
    });
  },

  updatePulse(dt) {
    if (this.pulseT > 0) this.pulseT = Math.max(0, this.pulseT - dt / 0.45);
    const p = Math.sin(this.pulseT * Math.PI);
    (this.mats || []).forEach(({ mat, base }) => {
      mat.emissiveIntensity = base + (base > 0.01 ? base * 0.34 : 0.10) * p;
    });
  },

  tick(time, delta) {
    if (!this.ready) return;
    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp2);
    const d = Math.hypot(p.x - this.center.x, p.z - this.center.z);
    if (!this.near && d <= this.data.trigger) this.near = true;
    else if (this.near && d >= this.data.release) this.near = false;

    const dt = Math.min(0.05, Math.max(0.001, (delta || 16) / 1000));
    if (this.seq >= 0) {
      this.seq += dt;
      if (this.seq > 7.8) this.seq = -1;
    }
    const running = this.seq >= 0;
    if (museoMobileSkipIdle(this, running)) return;
    if (running && !this.lightPulseDone && this.seq >= 0.86) {
      this.lightPulseDone = true;
      this.pulseT = 1;
    }


    this.displayT += (((this.near || running) ? 1 : 0) - this.displayT) * 0.07;

    const glowTarget = (running && this.seq > 0.15 && this.seq < 4.6) ? 1 : 0;
    this.glow += (glowTarget - this.glow) * 0.09;

    const eased = this.displayT * this.displayT * (3 - 2 * this.displayT);
    if (this.indicator) {
      const g = this.indicator;
      g.group.visible = eased > 0.01;
      g.bodyMat.opacity = 0.94 * eased;
      g.stemMat.opacity = 0.94 * eased;
      g.tagMat.opacity = eased * (0.55 + 0.45 * this.glow);
      g.tagMat.color.setRGB(
        THREE.MathUtils.lerp(0.43, 0.62, this.glow),
        THREE.MathUtils.lerp(0.46, 0.95, this.glow),
        THREE.MathUtils.lerp(0.47, 1.0, this.glow)
      );
      g.bodyMat.emissiveIntensity = 0.05 + this.glow * 0.55;
    }
    if (this.label) {
      this.label.group.visible = eased > 0.03;
      this.label.mat.opacity = eased * (running ? 0.95 : 0.52);
    }

    this.updatePhotons();
    this.updateBubbles(dt, (time || 0) / 1000);
    this.updatePulse(dt);


    if (running && !this.awarded && this.seq >= 5.0) {
      this.awarded = true;
      if (window.unlockCapability) window.unlockCapability(this.data.capability);
    }
    if (!running) this.awarded = false;

    const cam = this.el.sceneEl.camera;
    const cw = cam ? cam.getWorldPosition(this.tmp) : null;
    if (cw) {
      if (this.label && !this.label.group.userData.museoFixedFront) this.label.group.lookAt(cw);
      this.bubbles.forEach((b) => { if (b.tag && b.active) b.tag.lookAt(cw); });
    }
    if (this.hotspot) {
      this.hotspot.tick(dt, cw, this.displayT,
        !!(window.hasCapability && window.hasCapability(this.data.capability)), running);
    }
  },

  remove() {
    if (this.hotspot) this.hotspot.dispose();
    (this.mats || []).forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    this._wired.forEach((m) => { if (m.userData) delete m.userData.museoAction; });
    [this.indicator && this.indicator.group, this.label && this.label.group].forEach((g) => {
      if (g && g.parent) g.parent.remove(g);
    });
    this.bubbles.forEach((b) => {
      if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
      if (b.tag && b.tag.parent) b.tag.parent.remove(b.tag);
    });
    this.photons.forEach((p) => { if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh); });
    if (this.bubbleGeo) this.bubbleGeo.dispose();
    if (this.photonGeo) this.photonGeo.dispose();
  }
});


AFRAME.registerComponent('nitrogen-exhibit', {
  schema: {
    target: { type: 'string', default: 'bacteriaSmall03' },
    trigger: { type: 'number', default: 2.2 },
    release: { type: 'number', default: 2.8 },
    molecules: { type: 'number', default: 3 },
    capability: { type: 'string', default: 'nitrogen' }
  },

  init() {
    this.ready = false;
    this.near = false;
    this.displayT = 0;
    this.retry = 0;
    this.seq = -1;
    this.awarded = false;
    this.arrivedAt = null;
    this.pulseT = 0;
    this.labelT = 0;
    this.mol = [];
    this._wired = [];
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.el.addEventListener('museo-modules-loaded', () => window.setTimeout(() => this.setup(), 0));
  },

  copy() {
    const fallback = { title: 'N₂', sub: 'NITROGEN FIXATION' };
    return window.getMuseumExhibitLabel ? (window.getMuseumExhibitLabel('nitrogen') || fallback) : fallback;
  },

  setup() {
    const info = this.el.components['exhibit-info'];
    const item = info && info.items && info.items.find((it) => it.id === this.data.target);
    const anchor = item && item.anchorObj;
    if (!info || !item || !anchor) {
      this.retry += 1;
      if (this.retry < 30) window.setTimeout(() => this.setup(), 120);
      else console.warn('[n2] no se pudo localizar R. capsulatus');
      return;
    }

    const box = new THREE.Box3().setFromObject(anchor);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    let bell = null;
    this.el.object3D.traverse((o) => {
      if (!o.isMesh || !o.name || o.name.indexOf('VITRINA_Campana') !== 0) return;
      const b = new THREE.Box3().setFromObject(o);
      if (center.x < b.min.x - 0.02 || center.x > b.max.x + 0.02) return;
      if (center.z < b.min.z - 0.02 || center.z > b.max.z + 0.02) return;
      if (!bell || b.max.y > bell.max.y) bell = b;
    });
    const bellCenter = bell ? bell.getCenter(new THREE.Vector3()) : center.clone();
    const bellRadius = bell
      ? Math.max(bell.max.x - bell.min.x, bell.max.z - bell.min.z) * 0.5
      : Math.max(size.x, size.z) * 0.5 + 0.05;
    const bellTop = bell ? bell.max.y : center.y + 0.2;

    let peana = null, pd = Infinity;
    (info.peanaBoxes || []).forEach((pb) => {
      const d = Math.hypot(pb.center.x - center.x, pb.center.z - center.z);
      if (d < pd) { pd = d; peana = pb; }
    });

    const front = (info._placardRowDir)
      ? new THREE.Vector3(info._placardRowDir.x, 0, info._placardRowDir.z).normalize()
      : new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(front.z, 0, -front.x).normalize();
    const left = right.clone().negate();


    const place = (dir, lat) => bellCenter.clone().addScaledVector(dir, lat);
    const fits = (p) => !peana || Math.hypot(p.x - peana.center.x, p.z - peana.center.z) <= peana.radius - 0.050;
    let side = left.clone();
    let lateral = bellRadius + 0.070;
    let hub = place(side, lateral);
    if (!fits(hub)) {
      const alt = place(right, lateral);
      if (fits(alt)) { side = right.clone(); hub = alt; }
      else { while (lateral > bellRadius + 0.025 && !fits(hub)) { lateral -= 0.006; hub = place(side, lateral); } }
    }
    hub.y = center.y + 0.008;

    this.info = info;
    this.center = center;
    this.front = front;
    this.side = side;
    this.hub = hub;
    this.bellTop = bellTop;

    const halfSide = 0.5 * (Math.abs(side.x) * size.x + Math.abs(side.z) * size.z);
    this.arrival = center.clone().addScaledVector(side, halfSide * 0.45);

    this.collectMaterials(anchor);
    this.buildMolecules();
    this.buildLabel();
    this.hotspot = createMuseoHotspot({
      el: this.el, info,
      capability: 'nitrogen',
      verb: ((window.getMuseumCapabilityText && window.getMuseumCapabilityText().verbs) || {}).nitrogen || 'OBSERVE N₂',
      position: museoHotspotSpot(bell, center, front),
      faceDirection: front,
      onActivate: () => this.start()
    });

    this.ready = true;
    console.log('[n2] R. capsulatus listo', {
      bacteria: center.toArray().map((v) => +v.toFixed(3)),
      moleculas: this.mol.length,
      espera: hub.toArray().map((v) => +v.toFixed(3))
    });
  },

  collectMaterials(anchor) {
    const set = new Set();
    anchor.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (m && m.emissive) set.add(m); });
    });
    this.mats = Array.from(set).map((mat) => ({ mat, base: mat.emissiveIntensity || 0 }));
  },


  buildMolecules() {
    const scene = this.el.sceneEl.object3D;
    const n = THREE.MathUtils.clamp(Math.round(this.data.molecules), 2, 4);
    const R = 0.0085, GAP = 0.0115;
    const atomGeo = new THREE.SphereGeometry(R, 14, 12);
    const bondGeo = new THREE.CylinderGeometry(R * 0.42, R * 0.42, GAP * 2, 10);
    const tagTex = this.buildN2LabelTexture();
    this.atomGeo = atomGeo;
    this.bondGeo = bondGeo;

    const spots = [
      { f: 0.000, u: 0.030 },
      { f: 0.034, u: -0.010 },
      { f: -0.030, u: -0.026 },
      { f: 0.006, u: -0.052 }
    ];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8fd9e3, emissive: 0x2f6f7c, emissiveIntensity: 0.35,
        roughness: 0.34, metalness: 0.05, transparent: true, opacity: 0
      });
      const group = new THREE.Group();
      const a = new THREE.Mesh(atomGeo, mat); a.position.set(0, GAP, 0);
      const b = new THREE.Mesh(atomGeo, mat); b.position.set(0, -GAP, 0);
      const bond = new THREE.Mesh(bondGeo, mat);
      group.add(a); group.add(b); group.add(bond);
      group.rotation.z = Math.PI / 2 + THREE.MathUtils.randFloatSpread(0.8);
      const home = this.hub.clone()
        .addScaledVector(this.front, spots[i].f)
        .add(new THREE.Vector3(0, spots[i].u, 0));
      group.position.copy(home);
      group.visible = false;
      scene.add(group);
      const tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.018), tagMat);
      tag.visible = false;
      scene.add(tag);
      this.mol.push({
        group, mat, tag, tagMat, home, t: 0, moving: false, arrived: false,
        delay: i * 1.25, speed: 1 / THREE.MathUtils.randFloat(0.95, 1.18),
        phase: Math.random() * Math.PI * 2, spin: THREE.MathUtils.randFloatSpread(0.35)
      });
    }
  },

  buildN2LabelTexture() {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 90;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#D8F8FC';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 58px Arial, Helvetica, sans-serif';
    ctx.fillText('N₂', c.width / 2, c.height / 2 + 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  buildLabel() {
    const c = document.createElement('canvas');
    c.width = 700; c.height = 190;
    const ctx = c.getContext('2d');
    const copy = this.copy();
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(9, 11, 16, 0.60)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#8FD9E3';
    ctx.fillRect(0, 0, 7, c.height);
    ctx.textAlign = 'left';
    const fit = (text, weight, maxPx, boxW) => {
      let size = maxPx;
      ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      while (size > 18 && ctx.measureText(text).width > boxW) {
        size -= 2;
        ctx.font = weight + ' ' + size + 'px Arial, Helvetica, sans-serif';
      }
    };
    const boxW = c.width - 34 - 26;
    ctx.fillStyle = '#B7E9F1';
    fit(copy.title, '900', 58, boxW);
    ctx.fillText(copy.title, 34, 76);
    ctx.fillStyle = 'rgba(247, 251, 252, 0.86)';
    fit(copy.sub, '700', 38, boxW);
    ctx.fillText(copy.sub, 34, 142);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const group = new THREE.Group();
    group.name = 'capsulatus-microetiqueta-n2';
    group.position.copy(this.hub)
      .addScaledVector(this.side, 0.050);
    group.position.y = Math.min(this.bellTop - 0.030, this.center.y + 0.118);
    this.el.sceneEl.object3D.add(group);
    faceMuseoFront(group, this.front);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.190, 0.048), mat));
    this.label = { group, mat };
  },


  start() {
    if (this.seq >= 0) return;
    this.seq = 0;
    this.arrivedAt = null;
    this.mol.forEach((m) => { m.moving = true; m.arrived = false; m.t = 0; });
  },

  resetMolecules() {
    this.mol.forEach((m) => {
      m.moving = false; m.arrived = false; m.t = 0;
      m.group.position.copy(m.home);
      if (m.tag) { m.tag.visible = false; m.tagMat.opacity = 0; }
    });
  },

  updateMolecules(dt, secs) {
    let arrived = 0;
    this.mol.forEach((m) => {
      if (m.arrived) {
        arrived += 1;
        m.group.visible = false;
        if (m.tag) { m.tag.visible = false; m.tagMat.opacity = 0; }
        return;
      }
      if (!m.moving) {

        m.group.position.copy(m.home);
        m.group.position.y += Math.sin(secs * 0.7 + m.phase) * 0.006;
        m.group.position.x += Math.cos(secs * 0.5 + m.phase) * 0.004;
        m.group.rotation.z += m.spin * dt * 0.25;
        m.group.visible = this.displayT > 0.02;
        m.mat.opacity = 0.92 * this.displayT;
        m.tag.visible = this.displayT > 0.02;
        m.tag.position.copy(m.group.position).add(new THREE.Vector3(0, 0.030, 0));
        m.tagMat.opacity = 0.90 * this.displayT;
        return;
      }
      if (m.delay > 0 && this.seq < m.delay) {
        m.group.position.copy(m.home);
        m.group.visible = true;
        m.tag.visible = true;
        m.tag.position.copy(m.group.position).add(new THREE.Vector3(0, 0.030, 0));
        m.tagMat.opacity = 0.82 * this.displayT;
        return;
      }
      m.t += m.speed * dt;
      const e = m.t * m.t * (3 - 2 * m.t);
      m.group.position.lerpVectors(m.home, this.arrival, Math.min(e, 1));
      m.group.rotation.z += m.spin * dt * 0.5;
      m.group.visible = true;
      const a = 0.92 * this.displayT * (1 - THREE.MathUtils.clamp((m.t - 0.78) / 0.22, 0, 1));
      m.mat.opacity = a;
      m.tag.visible = true;
      m.tag.position.copy(m.group.position).add(new THREE.Vector3(0, 0.030, 0));
      m.tagMat.opacity = a * 0.94;
      if (m.t >= 1) {
        m.arrived = true;
        m.group.visible = false;
        m.tag.visible = false;
        m.tagMat.opacity = 0;
        this.pulseT = 1;
      }
    });
    return arrived;
  },

  updatePulse(dt) {
    if (this.pulseT > 0) this.pulseT = Math.max(0, this.pulseT - dt / 0.36);
    const p = Math.sin(this.pulseT * Math.PI);
    (this.mats || []).forEach(({ mat, base }) => {
      mat.emissiveIntensity = base + (base > 0.01 ? base * 0.28 : 0.09) * p;
    });
  },

  tick(time, delta) {
    if (!this.ready) return;
    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp2);
    const d = Math.hypot(p.x - this.center.x, p.z - this.center.z);
    if (!this.near && d <= this.data.trigger) this.near = true;
    else if (this.near && d >= this.data.release) this.near = false;

    const dt = Math.min(0.05, Math.max(0.001, (delta || 16) / 1000));
    if (this.seq >= 0) {
      this.seq += dt;
      if (this.seq > 8.0) { this.seq = -1; this.resetMolecules(); }
    }
    const running = this.seq >= 0;
    if (museoMobileSkipIdle(this, running)) return;

    this.displayT += (((this.near || running) ? 1 : 0) - this.displayT) * 0.07;
    const arrived = this.updateMolecules(dt, (time || 0) / 1000);
    this.updatePulse(dt);


    const showLabel = running && arrived > 0 && this.seq < 7.0;
    this.labelT += ((showLabel ? 1 : 0) - this.labelT) * 0.09;
    if (this.label) {
      this.label.group.visible = this.labelT > 0.02;
      this.label.mat.opacity = 0.94 * this.labelT;
    }


    if (running && arrived >= this.mol.length && this.arrivedAt === null) this.arrivedAt = this.seq;
    if (running && !this.awarded && this.arrivedAt !== null && this.seq >= this.arrivedAt + 0.9) {
      this.awarded = true;
      if (window.unlockCapability) window.unlockCapability(this.data.capability);
    }
    if (!running) { this.awarded = false; this.arrivedAt = null; }

    const cam = this.el.sceneEl.camera;
    const cw = cam ? cam.getWorldPosition(this.tmp) : null;
    if (cw && this.label && !this.label.group.userData.museoFixedFront) this.label.group.lookAt(cw);
    if (cw) this.mol.forEach((m) => { if (m.tag && m.tag.visible) m.tag.lookAt(cw); });
    if (this.hotspot) {
      this.hotspot.tick(dt, cw, this.displayT,
        !!(window.hasCapability && window.hasCapability(this.data.capability)), running);
    }
  },

  remove() {
    if (this.hotspot) this.hotspot.dispose();
    (this.mats || []).forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    this._wired.forEach((m) => { if (m.userData) delete m.userData.museoAction; });
    if (this.label && this.label.group && this.label.group.parent) this.label.group.parent.remove(this.label.group);
    this.mol.forEach((m) => {
      if (m.group.parent) m.group.parent.remove(m.group);
      if (m.tag && m.tag.parent) m.tag.parent.remove(m.tag);
    });
    if (this.atomGeo) this.atomGeo.dispose();
    if (this.bondGeo) this.bondGeo.dispose();
  }
});
