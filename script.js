/*
  Look: click-and-drag to look around, release to stop — not pointer lock.
  Pointer lock (look-controls' pointerLockEnabled) captures the cursor on
  click and needs ESC to let go, which read as "stuck"/uncomfortable.
  This never captures the cursor at all: hold the left mouse button (or one
  finger on touch) and drag, release and looking stops, cursor free the
  whole time. No ESC, nothing to "get out of".
*/
// Un desplazamiento del puntero por debajo de este umbral (en pixeles) se
// trata como CLICK/TAP sobre la escena; por encima, como arrastre de camara.
// Ver trySelect() mas abajo: es lo unico que distingue seleccionar una pieza
// de simplemente mirar alrededor.
const CLICK_MAX_MOVE_PX = 6;
/*
  El dedo nunca se queda tan quieto como el raton: un tap normal en pantalla
  tactil se desplaza facilmente 10-15 px entre touchstart y touchend, asi que
  con el umbral del raton (6 px) casi todos los toques se interpretaban como
  arrastre de camara y la seleccion no llegaba a dispararse.
*/
const TAP_MAX_MOVE_PX = 16;
// radio de tolerancia del dedo al apuntar: los controles del reactor son
// piezas de ~3 cm y en un movil caen en muy pocos pixeles, demasiado poco
// para un dedo. Ver trySelect().
const TAP_TOLERANCE_PX = 18;
const MUSEUM_LANGUAGE = window.MUSEUM_LANGUAGE || 'en';
const museumText = (key) => window.getMuseumUiText ? window.getMuseumUiText(key) : key;

/* ==========================================================================
   Soporte movil: en un telefono/tablet no hay teclado, asi que WASD (unica
   forma de moverse hasta ahora) simplemente no existe -- mirar alrededor y
   tocar piezas YA funcionaban en tactil (drag-look-controls, mas abajo,
   escucha touchstart/move/end desde el principio), pero avanzar/retroceder/
   strafe no tenian ningun equivalente tactil. Se detecta el dispositivo una
   sola vez al cargar (AFRAME.utils.device.isMobile ya cubre los casos
   habituales por user-agent; se combina con una comprobacion de puntero
   "coarse" + soporte tactil como red de seguridad en dispositivos raros que
   ese user-agent-sniffing no reconozca) y se marca con una clase en <body>
   -- todo lo demas (mostrar el joystick, cambiar el texto de ayuda de WASD
   a instrucciones tactiles) es CSS puro sobre esa clase, ver style.css.
   ========================================================================== */
const MUSEO_IS_MOBILE = (function () {
  try {
    const byUA = !!(AFRAME.utils && AFRAME.utils.device && AFRAME.utils.device.isMobile());
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    return byUA || (touch && coarse);
  } catch (e) { return false; }
})();
// En <body>, no en <html>: exhibit-info.open()/close() tambien marca
// "panel-open" sobre document.body (ver mas abajo) para ocultar el joystick
// mientras se lee una ficha -- ambas clases deben vivir en el mismo
// elemento para que el selector combinado .is-mobile.panel-open funcione.
if (MUSEO_IS_MOBILE) document.body.classList.add('is-mobile');

/*
  Joystick tactil de movimiento (solo visible en moviles, ver CSS): un
  circulo base fijo abajo a la izquierda de la pantalla con un nucleo que
  sigue al dedo, desplazamiento limitado a un radio maximo. Mientras se
  mantiene pulsado, window.MUSEO_MOVE_VECTOR guarda la direccion normalizada
  (-1..1 en x/z, mismos ejes de pantalla que WASD) que museum-movement suma
  a las teclas -- es literalmente "otra fuente de entrada" para el mismo
  sistema de movimiento, no uno nuevo. Es un elemento HTML aparte por encima
  del canvas (mobile-controls en index.html): sus toques nunca llegan al
  canvas, asi que nunca compiten con el arrastre de camara de drag-look-
  controls, y viceversa (ver el seguimiento por touch.identifier alli).
*/
window.MUSEO_MOVE_VECTOR = { x: 0, z: 0 };
(function setupMobileJoystick() {
  const base = document.getElementById('joystick-base');
  const nub = document.getElementById('joystick-nub');
  if (!base || !nub) return;

  let active = false;
  let touchId = null;
  let cx = 0, cy = 0;
  const MAX_R = 38; // px, radio maximo de desplazamiento del nucleo

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
    // pantalla: x+ = derecha, y+ = abajo -- mismos signos que W/A/S/D en
    // museum-movement.tick (right-left en x, backward-forward en z).
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

/* ==========================================================================
   CAPACIDADES DESCUBIERTAS -- capa de juego transversal del museo.

   Es una capa independiente: no toca el GLB, ni las fichas cientificas, ni
   ninguna exposicion. Solo mantiene una lista de capacidades que el visitante
   ha llegado a descubrir interactuando, la guarda en el navegador y la muestra
   en un HUD discreto arriba a la izquierda (la esquina libre: el selector de
   idioma vive arriba a la derecha, la ayuda de controles abajo al centro y el
   joystick tactil abajo a la izquierda).

   Cada exposicion solo tiene que llamar a unlockCapability('<id>') cuando su
   interaccion se complete. La funcion es idempotente: devuelve true la primera
   vez y false siempre despues, asi que una capacidad no puede descubrirse dos
   veces ni el aviso repetirse.

   Para añadir una capacidad nueva (por ejemplo H2 en Rhodopseudomonas
   palustris) basta con poner su id en MUSEO_CAP_ORDER y sus textos en
   museum-i18n.js: ni el HUD ni el contador necesitan tocarse.
   ========================================================================== */
const MUSEO_CAP_KEY = 'museum-capabilities';
const MUSEO_CAP_ORDER = ['pha', 'co', 'hydrogen'];

(function museumCapabilities() {
  const known = (id) => MUSEO_CAP_ORDER.indexOf(id) !== -1;

  let unlocked = [];
  try {
    const raw = window.localStorage.getItem(MUSEO_CAP_KEY);
    if (raw) unlocked = (JSON.parse(raw) || []).filter(known);
  } catch (e) { unlocked = []; }

  const copy = () => (window.getMuseumCapabilityText ? window.getMuseumCapabilityText() : {});

  let hud = null, toast = null, counter = null, toastTimer = 0;
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
    document.body.appendChild(hud);

    toast = document.createElement('div');
    toast.id = 'capability-toast';
    toast.setAttribute('role', 'status');
    const kicker = document.createElement('span');
    kicker.className = 'cap-toast-kicker';
    const name = document.createElement('span');
    name.className = 'cap-toast-name';
    toast.appendChild(kicker);
    toast.appendChild(name);
    document.body.appendChild(toast);

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
    toast.querySelector('.cap-toast-kicker').textContent = c.discovered || 'CAPABILITY DISCOVERED';
    toast.querySelector('.cap-toast-name').textContent = (c.long && c.long[id]) || id.toUpperCase();
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3600);
  }

  window.hasCapability = function hasCapability(id) {
    return unlocked.indexOf(id) !== -1;
  };

  /*
    Devuelve true SOLO la primera vez. Cualquier exposicion puede llamarla
    tantas veces como quiera sin comprobar nada por su cuenta: aqui esta el
    unico sitio donde se decide si algo es un descubrimiento nuevo.
  */
  window.unlockCapability = function unlockCapability(id) {
    if (!known(id)) { console.warn('[capacidades] id no registrado:', id); return false; }
    if (window.hasCapability(id)) return false;
    unlocked.push(id);
    try { window.localStorage.setItem(MUSEO_CAP_KEY, JSON.stringify(unlocked)); } catch (e) {}
    buildHud();
    render();
    showToast(id);
    console.log('[capacidades] descubierta ' + id + ' (' + unlocked.length + '/' + MUSEO_CAP_ORDER.length + ')');
    return true;
  };

  // utilidad de prueba: vacia lo descubierto para poder repetir el recorrido
  window.resetCapabilities = function resetCapabilities() {
    unlocked = [];
    try { window.localStorage.removeItem(MUSEO_CAP_KEY); } catch (e) {}
    render();
    return true;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildHud);
  else buildHud();
})();

AFRAME.registerComponent('drag-look-controls', {
  schema: {
    sensitivity: { type: 'number', default: 0.2 } // degrees per pixel of drag
  },
  init() {
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.downX = 0;
    this.downY = 0;
    /*
      Orden de rotacion YXZ (yaw y luego pitch). Con el orden por defecto XYZ
      el pitch se aplica ANTES que el yaw, y al combinar ambos aparece un
      alabeo parasito: el horizonte se inclinaba en diagonal en cuanto mirabas
      hacia arriba o abajo y girabas a la vez. Con YXZ el horizonte se
      mantiene horizontal siempre. El roll se fija a 0 explicitamente mas
      abajo, asi que la camara nunca acumula giro sobre el eje de vision.
    */
    this.el.object3D.rotation.order = 'YXZ';
    this.pitch = this.el.object3D.rotation.x;
    this.yaw = this.el.object3D.rotation.y;
    const maxPitch = THREE.MathUtils.degToRad(80);   // ni techo ni suelo del reves

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
      // Mismo gesto (mousedown/touchstart -> mouseup/touchend) que el drag-look,
      // pero si el puntero apenas se movio se interpreta como click/tap sobre
      // una pieza en vez de arrastre de camara -- ver CLICK_MAX_MOVE_PX arriba.
      const moved = Math.hypot(this.lastX - this.downX, this.lastY - this.downY);
      const slop = isTouch ? TAP_MAX_MOVE_PX : CLICK_MAX_MOVE_PX;
      if (moved < slop) this.trySelect(this.lastX, this.lastY, !!isTouch);
    };

    /*
      MOVIL -- causa real de que los controles del reactor "no funcionaran":
      despues de cada touchend el navegador emite ademas mousedown/mouseup de
      compatibilidad sobre el mismo punto. El gesto llegaba entonces por las
      DOS vias y trySelect() se ejecutaba dos veces por cada toque: el boton
      se encendia y se apagaba dentro del mismo tap, asi que en pantalla no
      cambiaba nada. Aqui se marca el instante del ultimo toque y se ignora
      cualquier evento de raton que llegue justo detras.
    */
    this._lastTouchAt = 0;
    const echoOfTouch = () => (Date.now() - this._lastTouchAt) < 900;

    this.onMouseDown = (e) => { if (e.button === 0 && !echoOfTouch()) start(e.clientX, e.clientY); };
    this.onMouseMove = (e) => { if (!echoOfTouch()) move(e.clientX, e.clientY); };
    this.onMouseUp = () => { if (!echoOfTouch()) end(false); };

    /*
      Toque en movil: se identifica el "dedo de mirar" por su touch.identifier
      (this._touchId), no por "cuantos dedos hay en total en la pantalla"
      como antes. Con el criterio antiguo (e.touches.length === 1) un segundo
      dedo en cualquier otro sitio -- el joystick de movimiento en moviles
      (ver mobile-controls mas abajo), o simplemente otro toque accidental --
      hacia que el gesto de mirar dejara de funcionar mientras ese segundo
      dedo estuviera apoyado. Ademas, al ser un listener en window, el
      propio preventDefault() se llamaba para CUALQUIER touchmove de un solo
      dedo en toda la pagina, aunque no fuera el que empezo a arrastrar
      sobre el canvas -- eso es lo que bloqueaba el scroll tactil dentro del
      panel de informacion (panel-scroll): un dedo deslizando el texto
      tambien disparaba este preventDefault() y el navegador nunca llegaba a
      hacer scroll. Ahora solo se sigue el toque que EMPEZO sobre el propio
      canvas (this._touchId) y solo ESE toque llama a preventDefault();
      cualquier otro toque (panel, joystick) pasa de largo sin tocarse.
    */
    this._touchId = null;
    this.onTouchStart = (e) => {
      this._lastTouchAt = Date.now();
      // Red de seguridad: si un gesto anterior se quedo "colgado" (por ejemplo
      // un touchcancel del sistema que no llego a cerrarse) y ya no queda
      // ningun dedo del gesto anterior en pantalla, se descarta ese id en vez
      // de bloquear para siempre tanto el mirar como el tap.
      if (this._touchId !== null) {
        let alive = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === this._touchId) { alive = true; break; }
        }
        if (alive) return;                  // ya hay un toque de "mirar" en curso
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
    /*
      touchcancel lo dispara el propio sistema (gesto del navegador, llamada
      entrante, cambio de app...). Sin escucharlo, this._touchId se quedaba
      apuntando a un dedo que ya no existe y a partir de ahi ni el tap ni el
      giro de camara volvian a responder en toda la sesion.
    */
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
  /*
    Seleccion directa por click/tap: lanza un rayo desde la camara hacia el
    punto de pantalla donde se solto el puntero y, si toca una de las mallas
    que exhibit-info marco como pieza informativa (userData.museoExhibitId),
    abre la misma ficha que abriria la proximidad. Solo se comprueba contra
    esa lista corta de mallas (bacterias, reactor...), nunca contra paredes,
    suelo o neones, y solo se llama cuando el gesto no fue un arrastre.
  */
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

    /*
      Con raton basta un rayo por el punto exacto. Con el dedo no: los cuatro
      controles del reactor son cilindros de unos 3 cm y en un movil ocupan muy
      pocos pixeles, mucho menos que la huella real de un dedo. Se prueba
      primero el punto exacto -- asi un toque preciso se comporta igual que
      siempre -- y solo si falla se prueban dos coronas de puntos alrededor,
      dentro del radio de tolerancia. Nunca amplia lo que es seleccionable,
      solo la punteria necesaria para acertarle.
    */
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
      // Los controles del reactor (Sala 2) no abren ficha: llevan su propia
      // accion (museoAction) en vez de museoExhibitId, y se comprueban primero.
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

/*
  Movement: WASD + arrow keys, smooth acceleration (no abrupt start/stop),
  moderate walking pace, relative to where the camera is looking, no fly
  (Y is never touched here). Custom instead of aframe-extras'
  movement-controls because that component throws
  "THREE.Math.degToRad is not a function" on this A-Frame/three.js build
  (aframe-extras 6.1.0 still calls the THREE.Math namespace three.js
  removed around r125+ in favor of THREE.MathUtils) — confirmed via a
  compat shim that only fixed it intermittently, meaning something in that
  dependency chain is genuinely unreliable here, not just a load-order
  issue. Its nav-mesh component has the same problem (calls the removed
  THREE.Geometry class), so aframe-extras isn't used at all in the end —
  this component and `clamp-to-bounds` below replace what it would have
  provided, without an unreliable third-party dependency in the input loop.
*/
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
    // Joystick tactil (moviles, ver MUSEO_MOVE_VECTOR mas arriba): misma
    // convencion de ejes que las teclas, asi que basta con sumarlo antes de
    // normalizar -- otra fuente de entrada para el mismo vector, no un
    // sistema de movimiento aparte.
    const joy = window.MUSEO_MOVE_VECTOR;
    if (joy && (joy.x || joy.z)) { this.moveVector.x += joy.x; this.moveVector.z += joy.z; }
    if (this.moveVector.lengthSq() > 0) this.moveVector.normalize();

    // BUG FIX: this only read the camera's own local yaw (from mouse look),
    // ignoring the rig's own yaw (set once at spawn, to face the exhibition
    // — see setup-museum-model). Since those two rotations combine to make
    // up what the player actually sees, using only one made "forward" point
    // ~84° off from the real view direction — reported as arrow-up walking
    // left instead of forward.
    const rigYaw = this.el.object3D.rotation.y;
    const cameraYaw = this.cameraEl ? this.cameraEl.object3D.rotation.y : 0;
    this.moveVector.applyAxisAngle(this.up, rigYaw + cameraYaw);
    this.targetVelocity.copy(this.moveVector).multiplyScalar(this.data.speed);

    this.velocity.lerp(this.targetVelocity, Math.min(1, this.data.acceleration * dt));

    this.el.object3D.position.x += this.velocity.x * dt;
    this.el.object3D.position.z += this.velocity.z * dt;
  }
});

/* Basic helpers for debug */
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

/*
  Full setup for the museum model, run once when the GLB finishes loading:

  1. Strips baked Blender lights (LUZ_*, REBOTE_*) — Blender's light power (W)
     isn't the same unit as glTF's photometric intensity (candela/lux), so
     these were exported with intensities in the thousands and blew the
     whole render out to white.
  2. Rescales the model so its real-world footprint matches `length`
     (largest horizontal dimension) and `height`, regardless of export units.
  3. Re-measures the world-space bounding box AFTER scaling, and:
     - places the player rig (#rig) at the model's real floor (ground level,
       y = box.min.y) and the camera child at local y = eyeHeight — a proper
       rig/camera split, not "move the whole museum to fix the height".
     - orients the rig to face the exhibition (toward the centroid of the
       detected peanas) instead of a fixed, possibly-wrong direction.
     - stores window.MUSEO_SPAWN for the respawn safety net.
     - stores the horizontal bounds (shrunk by `wallMargin`) on
       window.MUSEO_BOUNDS and per-peana boxes on window.MUSEO_OBSTACLES —
       this rectangle-with-holes *is* our navmesh data (see note on
       `clamp-to-bounds` for why it's applied this way instead of via
       aframe-extras' nav-mesh component).
  4. Tags each detected peana with a stable id/class-like userData so future
     interactivity (panels, video, audio...) has something to hook onto
     without re-deriving "which mesh is a peana" again.
*/
AFRAME.registerComponent('setup-museum-model', {
  schema: {
    length: { type: 'number', default: 11 },
    height: { type: 'number', default: 3 },
    wallMargin: { type: 'number', default: 0.4 },
    // Radio del jugador para las peanas. Antes se reutilizaba wallMargin, que
    // esta pensado para no pegarse a los muros: al inflar cada peana 0.4 m por
    // lado, cualquier hueco perdia 0.8 m y varios pasos reales quedaban
    // cerrados. Separado en su propio valor, mucho menor, para que se pueda
    // pasar entre piezas sin dejar de chocar con ellas.
    playerRadius: { type: 'number', default: 0.15 },
    eyeHeight: { type: 'number', default: 0.5 }
  },
  init() {
    /*
      El museo ya no es un GLB unico sino doce modulos, cada uno cargado en su
      propia entidad hija y todos con las coordenadas de mundo de Blender. Este
      componente espera a que TODOS terminen y solo entonces mide el conjunto y
      aplica una unica escala al contenedor: si cada modulo se midiera y
      escalara por separado, cada uno saldria con un factor distinto y las
      piezas no encajarian.
    */
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

    // 1) strip baked lights
    const lights = [];
    mesh.traverse((o) => { if (o.isLight) lights.push(o); });
    lights.forEach((light) => {
      light.intensity = 0;
      light.visible = false;
      if (light.parent) light.parent.remove(light);
    });

    // 1b) NOTE: an earlier version of this step force-set `toneMapped =
    // false` on every emissive material, to stop ACES from "washing" the
    // neon/bacteria colors. Reverted: with toneMapped=false, any lit value
    // that goes over 1.0 in a channel (very plausible here — bright
    // hemisphere + directional light hitting a glossy low-roughness
    // material, on top of its own emissive) hard-clips straight to white
    // instead of being rolled off gracefully by the tone-mapping curve —
    // that clip is almost certainly why the purple bacteria/exhibit
    // materials were reading as white on screen. Leaving every material's
    // default toneMapped: true in place, plus the light-intensity trim in
    // index.html, restores the graceful roll-off so the actual Blender
    // colors (confirmed correct in the source file and in the exported
    // glTF: base color + emissive are both purple) show through instead of
    // clipping out.

    // 2) scale to real-world size
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

    // 3) re-measure in world space after scaling
    this.el.object3D.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Real floor meshes (children of the 'suelo' node): the walking
    // surface is their TOP face, not the lowest point of the whole model
    // (box.min.y). The floor mesh has real thickness (~0.5m slab), so
    // box.min.y lands at its underside -- using that as the rig's Y put
    // the camera embedded inside the floor slab instead of standing on
    // top of it (near-plane clipping through solid geometry, screen full
    // of fog/background). floorMeshes is also reused below for the
    // ground-collision raycast.
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

    // 4) detect free-standing "blocks" (peanas) to collide with + tag them
    const obstacles = [];
    const objBox = new THREE.Box3();
    const objSize = new THREE.Vector3();
    const objCenter = new THREE.Vector3();
    let peanaIndex = 0;
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      objBox.setFromObject(o);
      objBox.getSize(objSize);
      // Solo las peanas reales cuentan como obstaculo. La heuristica por
      // tamaño detectaba 29 objetos (bacterias, bases de vitrina, piezas del
      // reactor...) y sus margenes de 0.4 m se solapaban hasta tapar casi
      // toda la sala, que es lo que impedia moverse. Los objetos del GLB ya
      // vienen con nombres claros desde Blender, asi que basta con el prefijo.
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

    // 4b) MUSEO_FLOOR_MESHES for the ground-collision check (isGrounded
    // below). This room's outer wall is a curved/organic shape, not a
    // rectangle, so MUSEO_BOUNDS above is only a coarse outer limit —
    // plenty of points inside that rectangle are past the real wall, over
    // nothing. clamp-to-bounds raycasts against these meshes to catch
    // that instead of letting the player walk off the edge of the model
    // into empty space. (floorMeshes/floorRoot computed above, in step 3,
    // where floorY also needs them.)
    window.MUSEO_FLOOR_MESHES = floorMeshes;

    // 4c) MUSEO_WALL_MESHES: the real curved perimeter wall (node
    // 'PAREDES_Sala' in museum_walls.glb), used by clamp-to-bounds as a
    // lightweight horizontal-raycast collision proxy so the visitor can't
    // step through the curved wall — no separate invisible collision box,
    // just the wall geometry that already ships in the modular GLB.
    const wallRoot = mesh.getObjectByName('PAREDES_Sala');
    const wallMeshes = [];
    if (wallRoot) wallRoot.traverse((o) => { if (o.isMesh) wallMeshes.push(o); });
    window.MUSEO_WALL_MESHES = wallMeshes;

    // registry for future interactivity hooks (peanas, nichos, screens...)
    window.MUSEO_INTERACTIVE = window.MUSEO_INTERACTIVE || {};
    window.MUSEO_INTERACTIVE.peanas = obstacles.map((o) => ({ id: o.id, meshName: o.meshName, position: o.center }));

    // 5) player rig: ground level, facing the exhibition (toward the
    // average position of the peanas), camera child holds the eye height
    const rig = document.querySelector('#rig');
    const camera = document.querySelector('#camera');
    let yaw = 0;
    if (obstacles.length) {
      const avg = obstacles.reduce((a, o) => ({ x: a.x + o.center.x, z: a.z + o.center.z }), { x: 0, z: 0 });
      avg.x /= obstacles.length;
      avg.z /= obstacles.length;
      yaw = Math.atan2(center.x - avg.x, avg.z - center.z) * (180 / Math.PI);
    }
    // the geometric center of the room can itself land inside a peana's
    // footprint, or in the gap between two overlapping peana margins where
    // a single push-out isn't enough to land somewhere fully free — so
    // find a genuinely free spot with a ring search outward from center,
    // instead of trusting the center point at all.
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

/*
  Constrains the player rig to the walkable floor: outer rectangle
  (window.MUSEO_BOUNDS) minus a hole per peana (window.MUSEO_OBSTACLES) —
  push back to the nearest edge if it ends up inside a hole or past the
  outer bounds.

  This *is* our navmesh: a rectangle-with-holes matching the walkable area,
  built once from the model's own measured geometry. We tried the "proper"
  route first — aframe-extras' `nav-mesh` component + `movement-controls`'
  `constrainToNavMesh` — but that component throws
  "THREE.Geometry is not a constructor" on this A-Frame/three.js build
  (aframe-extras 6.1.0 still calls the THREE.Geometry class that three.js
  removed around r125+), so it's non-functional here. Since our obstacles
  are already axis-aligned boxes, this rectangle-minus-boxes clamp produces
  the same walkable region a "real" navmesh would for this room shape,
  without depending on the broken component.
*/
function clampToWalkable(x, z, bounds, obstacles) {
  x = THREE.MathUtils.clamp(x, bounds.minX, bounds.maxX);
  z = THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ);

  // a few relaxation passes: pushing out of one peana's (margin-expanded)
  // box can land you inside a neighbouring one where they're close together,
  // so a single pass isn't always enough.
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

/*
  Ground check: casts a ray straight down at (x, z) against the real floor
  meshes (window.MUSEO_FLOOR_MESHES, set in setup-museum-model) and reports
  whether it actually hits floor. Cheap (one ray against ~450 triangles) —
  fine to run every tick. If no floor meshes were found at all, doesn't
  block movement (falls back to the rectangle-only bounds instead of
  trapping the player at spawn).
*/
const groundRaycaster = new THREE.Raycaster();
const groundRayOrigin = new THREE.Vector3();
const groundRayDir = new THREE.Vector3(0, -1, 0);
// null = sin comprobar, true = el raycast sirve, false = inservible (usar solo bounds)
let groundProbe = null;

function rayHitsFloor(x, z, floorMeshes, refY) {
  groundRayOrigin.set(x, refY + 5, z);
  groundRaycaster.set(groundRayOrigin, groundRayDir);
  groundRaycaster.far = 10;
  return groundRaycaster.intersectObjects(floorMeshes, false).length > 0;
}

/*
  El suelo de este museo es una malla aplastada a grosor cero. Ademas de no
  poder sombrearse, tampoco se puede intersecar: el raycast devuelve 0
  impactos en CUALQUIER punto, incluido el propio spawn. Como clamp-to-bounds
  usa esto como "¿hay suelo debajo?", el jugador quedaba congelado en su
  ultima posicion valida y no habia forma de andar con WASD.

  Se comprueba una sola vez en el spawn. Si ahi tampoco hay impacto, la malla
  no sirve como referencia y se cae a los limites rectangulares, que ya
  existen y son suficientes para no salirse de la sala.
*/
/*
  Horizontal raycast against the real wall mesh (window.MUSEO_WALL_MESHES,
  set in setup-museum-model): fired from the last known-good position toward
  the candidate position, chest-height. If it hits the wall before reaching
  the candidate, the move would cross the curved perimeter -- used by
  clamp-to-bounds to hold the player back instead of letting the rectangle-
  shaped MUSEO_BOUNDS (a coarse outer limit only) allow walking through the
  curve between two rectangle corners.
*/
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

/*
  Finds a spawn point guaranteed to be inside bounds and outside every
  peana, with some breathing room (not just technically-not-inside) so the
  first thing you see isn't a pedestal filling the screen: tries the room
  center first (the common case), then searches outward in rings — handles
  rooms where peana margins overlap near the center and a single push-out
  isn't enough. Falls back to a smaller margin, then none, if a spot with
  full breathing room can't be found (dense layouts).
*/
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
    this.lastGood = null; // lazily set from MUSEO_SPAWN on first tick (see below)
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
      // the move would cross the real curved wall mesh before reaching the
      // candidate point -- hold at the last position instead of stepping
      // through it (this is the actual perimeter, not the coarse rectangle).
      clamped.x = this.lastGood.x;
      clamped.z = this.lastGood.z;
    } else if (isGrounded(clamped.x, clamped.z, window.MUSEO_FLOOR_MESHES, refY)) {
      this.lastGood.x = clamped.x;
      this.lastGood.z = clamped.z;
    } else {
      // the rectangle-minus-obstacles pass let this point through, but
      // there's no floor mesh under it — this room's real wall curves in
      // here, past the rectangle's edge. Hold at the last position that
      // was actually over the floor instead of stepping into empty space.
      clamped.x = this.lastGood.x;
      clamped.z = this.lastGood.z;
    }

    obj.position.x = clamped.x;
    obj.position.z = clamped.z;
  }
});

/*
  Safety net for Priority 1: if the player ever ends up somewhere clamp-to-
  bounds shouldn't allow (a future bug, a teleport, falling through geometry,
  a big Y drift since there's no gravity component here) snap back to the
  measured spawn point. Checked a few times a second, not every frame.
*/
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

/* neon-support-lights removed: the GLB's own emissive neon materials
   (Neon_Purple / Neon_Turquoise / Neon_White, baked in Blender) are what
   should read as light sources. A-Frame just displays the model as
   exported -- no extra JS-created point lights simulating the neon. */

/*
  Reproduce las animaciones que vienen dentro del GLB (cuerpos de las
  bacterias, puntas de los pelitos como morph targets, y las pompas del
  reactor). A-Frame no las arranca solo: hay que crear un
  THREE.AnimationMixer sobre el modelo cargado y avanzarlo en cada tick.
  Se reproducen TODAS las clips a la vez y en bucle infinito, que es como
  estan authored en Blender (cada objeto lleva su propio desfase, asi que
  no van sincronizadas entre si).
*/
AFRAME.registerComponent('gltf-animations', {
  // fps: el mixer no necesita actualizarse a la frecuencia de refresco de la
  // pantalla para verse suave -- son respiraciones/balanceos lentos. 30 Hz
  // es indistinguible a la vista y evita recalcular 12 modulos por frame.
  // document.hidden ademas pausa el trabajo cuando la pestaña no es visible.
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
    const interval = 1000 / Math.max(1, this.data.fps);
    if (this.accumulated < interval) return;
    this.mixer.update(this.accumulated / 1000);
    this.accumulated = 0;
  }
});

/*
  Correcciones de render sobre el GLB ya cargado. No tocan geometria,
  animaciones ni el diseño: solo como se dibujan tres cosas concretas.

  1. Suelo: la malla es un plano de grosor cero y su material venia con
     FrontSide, asi que desde la altura de los ojos se veia por la cara
     de atras y desaparecia. DoubleSide lo devuelve.
  2. Bacterias: el cuerpo venia con DoubleSide y depthWrite, asi que las
     caras traseras competian con las delanteras y producian el ruido de
     pixeles sueltos. FrontSide lo limpia. Los pelitos SI necesitan
     DoubleSide (son tiras finas), asi que esos no se tocan.
  3. Neones bajo las cristaleras pequeñas: en blanco, como la linea de la
     ventana grande. El resto del lado se queda morado. Se localizan por
     posicion (el aro que hay justo debajo de cada VITRINA_Base_*), no por
     nombre, para que siga funcionando si cambia la numeracion.
*/
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
      // cuerpos de bacteria: quitar el doble cara que generaba los artefactos
      if (o.material && o.material.name === 'Bacteria_Mat') {
        o.material.side = THREE.FrontSide;
        o.material.needsUpdate = true;
      }
    });

    // El suelo ya no necesita apaño: la malla siempre tuvo sus 0,52 m de
    // grosor, lo que estaba a cero era la escala Z del objeto en Blender.
    // Restaurada y reexportada, vuelve a tener volumen real, se sombrea con
    // las luces de la escena y se puede intersecar, asi que ni el material
    // plano ni el DoubleSide hacen falta.

    // un unico material blanco compartido por todos los aros de vitrina
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
    /*
      Tubos y probetas sueltos. Los de Lab_Batch2 y Lab_Extra ya no salen del
      GLB, pero quedaban los del instrumental de laboratorio (Lab_Peana*,
      Lab_Nicho6_*, TuboGenerico*, Tube*). Se ocultan por prefijo. El
      reactor NO se toca: sus piezas se llaman Bioreactor_*, que no encaja
      con ninguno de estos prefijos.
    */
    let tubos = 0;
    mesh.traverse((o) => {
      if (o.isMesh && /^(Lab_|Tubo|Tube)/.test(o.name)) { o.visible = false; tubos++; }
    });

    /*
      Ventanas del lado de las bacterias en blanco. Se distinguen por forma,
      no por nombre: son los marcos verticales pegados a la pared, altos
      (mas de 1 m) y que arrancan cerca del suelo. Quedan fuera los aros de
      peana (planos, a ras de suelo) y los arcos de techo (arrancan por
      encima de 2,5 m), que siguen morados.
    */
    let blancoVentana = null;
    let ventanas = 0;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.name !== 'Neon_Purple') return;
      const b = new THREE.Box3().setFromObject(o);
      if ((b.min.x + b.max.x) / 2 >= 0) return;          // solo el lado bacterias
      const alto = b.max.y - b.min.y;
      if (alto < 1.0 || b.min.y > 1.0) return;           // ni aros de suelo ni arcos de techo
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


/* ==========================================================================
   CAPA CURATORIAL — contenido + interaccion por proximidad
   Un unico objeto de contenido y un unico componente reutilizado por todas
   las piezas. No toca geometria, materiales, luces ni animaciones: es una
   capa de HTML por encima del museo.
   ========================================================================== */

/*
  Sala 2 (Reactores y Aplicaciones) tiene su propio lenguaje de color: verde/
  turquesa, no el morado de la Sala 1. El tono no es inventado -- se deriva
  del propio material Neon_Turquoise ya presente en el modelo (mismo peso y
  saturacion que el morado #74349A/#805096 que sustituye en toda la
  señaletica y los acentos de interaccion del reactor), para que ambos
  sistemas de color convivan como parte del mismo museo.
*/
const ROOM2_ACCENT = '#2C8C82';         // equivalente a #74349A en Sala 2
const ROOM2_ACCENT_LIGHT = '#5A9994';   // equivalente a #805096 en Sala 2
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
  /* Sala 1 (Purple Phototrophic Bacteria). Introduccion general + las 8 cepas
     avanzan de lo general a lo especifico. Solo hay 8 anclas fisicas en esta
     sala (2 piezas "large" + 6 "small"), asi que la introduccion general y la
     cepa 01 (Rhodospirillum rubrum) comparten la primera ficha -- el propio
     texto de la introduccion termina anunciando las ocho cepas, asi que el
     salto a la cepa 01 en la misma ficha es la continuacion natural. El resto
     de cepas (02-08) sigue el mismo orden de recorrido que ya tenian las
     piezas de la sala. */
  bacteriaLarge01: {
    lead: 'Much more than photosynthesis', tags: ['PHOTOSYNTHESIS', 'METABOLIC DIVERSITY', 'PHA'], icon: 'cell',
    tier: 'primary', anchor: 'BACTERIA_MASTER',
    section: '01', title: 'PURPLE PHOTOTROPHIC BACTERIA', label: 'EXPLORE +',
    // Microscopia real de bacterias purpuras (fluorescencia + SEM), tomada de
    // los documentos fuente del proyecto -- ver brief punto 5.
    images: ['./assets/images/ppb-microscopy-overview.jpg'],
    body: 'Purple phototrophic bacteria (PPB) are a diverse group of microorganisms capable of using light as a source of energy. What makes them particularly interesting, however, is not only their photosynthetic ability, but also the extraordinary variety of metabolic strategies they can develop.\n\nDepending on the species and environmental conditions, these bacteria can modify their metabolism, fix nitrogen, transform organic compounds, use certain gases, exchange electrons with minerals or electrodes, and store carbon in the form of PHA (biopolymers with potential applications in the production of bio-based plastics). Some strains are also particularly efficient at producing hydrogen, while the biomass obtained from their cultivation is being investigated for food and feed applications.\n\nThis diversity makes purple phototrophic bacteria important both for understanding fundamental biological processes (such as the conversion of light into energy and cellular adaptation to environmental conditions) and for investigating more sustainable biotechnological processes. Their cultivation opens possibilities related to hydrogen production, bioplastics, biomass and bioelectrochemical systems.\n\nBut they do not all behave in the same way.\n\nFrom this point onwards, the exhibition focuses on eight specific strains, revealing the characteristics and capabilities that distinguish each one.\n\n01. RHODOSPIRILLUM RUBRUM\nA key bacterium for understanding photosynthesis\n\nRhodospirillum rubrum has played an important role in the history of bacterial photosynthesis research. Its relatively simple photosynthetic apparatus made it one of the first model organisms used to investigate how energy from light is transformed, through electron transfer, into energy that the cell can use.\n\nIts study has also helped researchers understand the relationship between energy production, nitrogen fixation and carbon metabolism, showing how a bacterium can coordinate different processes depending on its needs and environmental conditions.\n\nIts relevance is not limited to fundamental research. R. rubrum can accumulate PHA in the form of intracellular granules. These compounds act as carbon reserves for the bacterium and can be used in the production of bio-based and biodegradable materials. The species is also currently being investigated as a potential nutritious ingredient for food and feed applications.'
  },
  /* Pieza suspendida independiente. El componente space-mission-descent la
     registra cuando su GLB ya esta cargado y situado; por eso no busca un
     ancla dentro de los doce modulos como las bacterias convencionales. */
  spaceMission: {
    dynamic: true, tier: 'primary',
    section: 'ISS', title: 'RHODOSPIRILLUM RUBRUM IN SPACE',
    lead: 'Seven days aboard the International Space Station',
    tags: ['SPACEFLIGHT', 'MICROGRAVITY', 'CLOSED-LOOP LIFE SUPPORT'],
    images: ['./assets/images/rhodospirillum-space-mission.jpg'],
    body: 'Future space missions will need ways to produce food, recycle waste and regenerate air and water without depending on constant supplies from Earth. One possible solution is to use beneficial microorganisms inside engineered closed-loop ecosystems.\n\nIn 2015, scientists sent Rhodospirillum rubrum and several other useful bacterial species to the International Space Station for seven days. The original culture was divided into two groups: one remained on Earth while the other travelled into low Earth orbit, where it experienced microgravity and increased radiation.\n\nAfter the flight, the researchers reactivated both cultures and compared them. R. rubrum survived the journey, grew normally and continued to perform its expected biological functions. The spaceflight appeared to have little effect on its overall performance.\n\nThese results support the possibility of using this edible purple bacterium in experimental life-support systems. In the future, microorganisms such as R. rubrum could help recycle resources, reduce dependence on terrestrial resupply and perhaps contribute to feeding astronauts during long-duration missions.'
  },
  bacteriaSmall01: {
    lead: 'The machinery that converts light into energy', tags: ['REACTION CENTER', 'NOBEL PRIZE'], icon: 'form',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_base',
    section: '02', title: 'BLASTOCHLORIS VIRIDIS', label: 'VIEW +',
    images: ['./assets/images/blastochloris-viridis.png'],
    body: 'Inside photosynthetic bacteria, specialized structures capture light energy and begin its conversion into chemical energy. The photosynthetic reaction center of Blastochloris viridis occupies a particularly important place in the history of science.\n\nIt was the first membrane protein complex whose structure was resolved at atomic resolution. Observing its organization at this level of detail made it possible to better understand one of the essential processes of photosynthesis (the initial conversion of light energy into chemical energy).\n\nThis discovery went far beyond the study of a single bacterium. It opened new possibilities for investigating the structure of membrane proteins and contributed to the research recognized by the 1988 Nobel Prize in Chemistry.'
  },
  bacteriaSmall02: {
    lead: 'Changing from within to adapt', tags: ['CHROMATOPHORES', 'ADAPTATION'], icon: 'surface',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_10',
    section: '03', title: 'CEREIBACTER SPHAEROIDES', label: 'VIEW +',
    // Microscopia optica real, celulas esfericas -- coherente con "sphaeroides".
    images: ['./assets/images/cereibacter-sphaeroides-microscopy.jpg'],
    body: 'Bacteria are not static organisms. Some can modify their own cellular architecture in response to the conditions around them.\n\nCereibacter sphaeroides (formerly known as Rhodobacter sphaeroides) is one of the most extensively studied photosynthetic microorganisms and provides a particularly clear example of this ability to adapt.\n\nWhen oxygen availability decreases, the bacterium develops extensive intracellular membranes known as chromatophores. These membranes contain the machinery required for photosynthesis. As environmental conditions change, the internal organization of the cell changes as well.\n\nResearch on C. sphaeroides has helped scientists understand both the molecular mechanisms of electron transfer during photosynthesis and the way microorganisms regulate and reorganize their metabolism in response to changing environments.'
  },
  bacteriaSmall03: {
    lead: 'Coordinating light, nitrogen and energy', tags: ['NITROGEN FIXATION', 'REDOX BALANCE'], icon: 'wave',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_12',
    section: '04', title: 'RHODOBACTER CAPSULATUS', label: 'VIEW +',
    // Microscopia de fluorescencia real de bacterias purpuras.
    images: ['./assets/images/rhodobacter-capsulatus-microscopy.jpg'],
    body: 'A cell must coordinate many processes at the same time. Rhodobacter capsulatus has become an important model organism for studying how a photosynthetic bacterium maintains this balance.\n\nResearch on this species has revealed important connections between photosynthesis, nitrogen fixation and cellular redox balance. These processes are interconnected and form part of the regulatory networks controlling how the cell obtains and uses energy.\n\nMore recently, structural studies have revealed an unusually compact architecture in its light-harvesting and reaction-center complex.\n\nIts study demonstrates that even within purple phototrophic bacteria, different biological solutions exist for capturing light, managing energy and responding to changing environmental conditions.'
  },
  bacteriaLarge02: {
    lead: 'A different way to reproduce', tags: ['HYPHAE', 'BUDDING', 'LIFE CYCLE'], icon: 'transform',
    tier: 'primary', anchor: 'Exhibit_Mesh0_Capsule',
    section: '05', title: 'RHODOMICROBIUM VANNIELII', label: 'EXPLORE +',
    // Microscopia de contraste de fase real, celulas con apendices polares
    // -- coherente con la budding/hifas descritas en el cuerpo del texto.
    images: ['./assets/videos/rhodomicrobium-vannielii-animation.mp4', './assets/images/rhodomicrobium-budding.jpg'],
    body: 'We often imagine bacteria reproducing through a simple division in which one cell produces two almost identical cells. Rhodomicrobium vannielii shows that bacterial reproduction can be considerably more complex.\n\nThis bacterium develops filamentous extensions known as hyphae. New cells are formed by budding from the tips of these structures. A small bud appears, gradually grows and eventually separates to form a new cell.\n\nThis life cycle includes processes of cellular differentiation and unusual multicellular stages, making R. vannielii an important organism for studying the evolution of complex bacterial life cycles.\n\nIts distinctive morphology also provides a striking example of the extraordinary diversity found among photosynthetic bacteria.'
  },
  bacteriaSmall04: {
    lead: 'Bacteria connected to electricity', tags: ['ELECTROACTIVITY', 'BIOELECTROCHEMISTRY'], icon: 'grid',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_14',
    section: '06', title: 'RHODOVULUM', label: 'VIEW +',
    // Trabajo de laboratorio real con sondas de electrodo -- coherente con
    // la electroactividad descrita en el cuerpo del texto.
    images: ['./assets/images/rhodovulum-electroactivity.jpg'],
    body: 'Some purple phototrophic bacteria have a particularly remarkable ability (they are electroactive). This means that they can exchange electrons with elements outside the cell.\n\nSpecies of Rhodovulum (including Rhodovulum sulfidophilum and Rhodovulum visakhapatnamense) can obtain electrons from hydrogen, iron or even directly from an electrode.\n\nThese processes allow us to understand the bacterium not as an isolated organism, but as part of a system in which biological matter and conductive materials can exchange electrical charges.\n\nThe mechanisms responsible for this electroactivity are still not completely understood. For this reason, these bacteria remain an active field of research and provide new opportunities to investigate interactions between microorganisms, minerals and bioelectrochemical systems.'
  },
  bacteriaSmall05: {
    lead: 'Living from a toxic gas', tags: ['CARBON MONOXIDE', 'BIOHYDROGEN'], icon: 'scale',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_16',
    section: '07', title: 'RUBRIVIVAX GELATINOSUS', label: 'VIEW +',
    // Micrografia TEM real de bacterias purpuras.
    images: ['./assets/images/rubrivivax-gelatinosus-tem.jpg'],
    body: 'Carbon monoxide (CO) is toxic to many organisms. Rubrivivax gelatinosus, however, is able to use it as an energy source.\n\nUnder anaerobic conditions (in the absence of oxygen), some purple phototrophic bacteria can oxidize CO using specialized enzyme systems. In R. gelatinosus, this metabolism can also be linked to hydrogen production.\n\nThis ability has made the species an important model for studying both the biological conversion of carbon monoxide and potential processes for biohydrogen production.\n\nIts case illustrates one of the key ideas running throughout this room (the remarkable metabolic flexibility of purple phototrophic bacteria and their ability to exploit substances and environmental conditions that would be unfavorable for many other organisms).'
  },
  bacteriaSmall06: {
    lead: 'When a biological capability becomes an opportunity', tags: ['PHOTOFERMENTATION', 'ELECTROACTIVITY'], icon: 'transform',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_18',
    section: '08', title: 'RHODOPSEUDOMONAS PALUSTRIS', label: 'VIEW +',
    // b1/b3 reales (no el circulo/nicho): ver brief -- dos imagenes propias
    // para esta ficha, distintas del contenido del display circular.
    images: ['./assets/images/b1.png', './assets/images/b3.png'],
    body: 'Rhodopseudomonas palustris brings together several of the capabilities explored throughout the exhibition.\n\nIt can use light to support the anaerobic degradation of aromatic compounds derived from plants, contributing to the recycling of complex organic matter and to processes associated with the carbon cycle.\n\nIt is also particularly effective at producing hydrogen through photofermentation. Among the purple phototrophic bacteria studied for this process, certain strains of R. palustris (such as strain 42OL) have achieved especially high hydrogen productivity.\n\nIt has another important characteristic as well (electroactivity). Some strains can exchange electrons with electrodes and, by combining electricity and light, use these processes to generate valuable products such as PHA and certain biofuels.\n\nAt this point, we have finished looking closely at the bacteria themselves. The next step is to understand how they can be cultivated and how these capabilities can be used at a larger scale.'
  },
  /* Sala 2 (Reactors and Applications). Continua la historia de la Sala 1:
     BACTERIA -> CULTIVATION -> REACTOR -> PROCESS -> PRODUCT -> APPLICATION.
     El reactor es la pieza principal (misma ficha ya funcionaba por click,
     solo cambia el contenido); las 6 ventanas pasan de "vitrina pasiva sin
     ficha" a piezas informativas reales (ver openable, mas abajo) que abren
     el mismo panel que el resto del museo. Ninguna imagen todavia -- display
     se queda en false a proposito en las 6, ver nota en image-windows. */
  reactor01: {
    lead: 'Creating the right conditions for microbial growth',
    tags: ['CULTIVATION', 'CONTROLLED CONDITIONS', 'PROCESS'], icon: 'reactor',
    tier: 'primary', anchor: 'PEANA_Bioreactor',
    title: 'PHOTOBIOREACTOR', label: 'VIEW PROCESS +',
    // Fotobiorreactores reales de laboratorio, tomados de los documentos
    // fuente del proyecto -- ver brief punto 5 (nunca inventadas).
    images: ['./assets/images/reactor-cultivation-01.jpg', './assets/images/reactor-cultivation-02.jpg'],
    body: 'FROM BACTERIA TO BIOPROCESS\n\nIn the previous room, we discovered the remarkable metabolic diversity of purple phototrophic bacteria.\n\nBut understanding what these microorganisms can do is only the beginning. To use their capabilities, researchers need to create controlled environments where bacteria receive the appropriate light, nutrients and operating conditions. Photobioreactors make this possible.\n\nInside these systems, microorganisms can be cultivated under controlled conditions, allowing researchers to study and develop processes related to hydrogen production, bioplastics, biomass and bioelectrochemical applications.\n\nIn this room, the focus moves from the microorganism itself to the process.\n\nPHOTOBIOREACTOR\n\nA photobioreactor provides a controlled environment for cultivating photosynthetic microorganisms.\n\nThe system allows key conditions such as light, nutrient supply and circulation to be managed while the culture grows. By controlling these variables, researchers can investigate how purple phototrophic bacteria transform resources and produce compounds of potential interest.\n\nThe reactor therefore represents the transition between understanding the biology of these microorganisms and using their capabilities in technological processes.'
  },

  /* Ventanas de la pared del laboratorio. openable:true (nuevo) -- antes eran
     contenido pasivo sin ficha; ahora abren el panel de informacion como
     cualquier otra pieza (ver exhibit-info.open). display se queda en false:
     sin imagenes ni graficos todavia, los nichos quedan limpios a proposito
     -- el contenido grafico final se disenara aparte (ver image-windows). */
  window01: { display: false, tier: 'tertiary', windowIndex: 0, openable: true, icon: 'wave',
    section: '01', title: 'FROM LIGHT TO HYDROGEN', lead: 'Photofermentation',
    tags: ['HYDROGEN', 'PHOTOFERMENTATION'],
    images: ['./assets/images/photofermentation-culture.jpg'],
    body: 'Some purple phototrophic bacteria can use light energy to produce hydrogen through a process known as photofermentation.\n\nRhodopseudomonas palustris is particularly relevant in this field, with certain strains showing high hydrogen productivity.\n\nThis process illustrates how the metabolism of a microorganism can become the basis of a potential renewable energy pathway.' },
  window02: { display: false, tier: 'tertiary', windowIndex: 1, openable: true, icon: 'form',
    section: '02', title: 'FROM CARBON TO BIOPLASTIC', lead: 'PHA production',
    tags: ['PHA', 'BIOPLASTIC'],
    // Micrografia TEM real de una bacteria con granulos de PHA visibles.
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
    // SEM+EDS de un electrodo/mineral y trabajo de laboratorio con sondas de
    // electrodo -- ambas reales, de los documentos fuente del proyecto.
    images: ['./assets/images/electroactivity-electrode-sem.jpg', './assets/images/electroactivity-electrode-lab.jpg'],
    body: 'Some purple phototrophic bacteria are electroactive.\n\nThis means that they can exchange electrons with external materials, including electrodes.\n\nThese interactions allow researchers to investigate bioelectrochemical systems in which living microorganisms and conductive materials become part of the same process.\n\nElectroactivity opens new possibilities for connecting microbial metabolism with technological systems.' },
  window05: { display: false, tier: 'tertiary', windowIndex: 4, openable: true, icon: 'surface',
    section: '05', title: 'SCALE UP', lead: 'From laboratory to larger production',
    tags: ['SCALE-UP', 'PRODUCTION'],
    // Reactores de bolsa de plastico reales, en estanteria -- exactamente el
    // "low-cost plastic bag reactor" que describe el cuerpo del texto.
    images: ['./assets/images/scaleup-bag-reactors-01.jpg', './assets/images/scaleup-bag-reactors-02.jpg'],
    body: 'A successful biological process must eventually move beyond the laboratory.\n\nOne strategy for reducing production and installation costs is to cultivate purple phototrophic bacteria in low-cost plastic bag reactors using food-grade equipment.\n\nInstead of building one increasingly large reactor, production capacity can be expanded by operating several reactors in parallel.\n\nThis approach offers a flexible way of increasing cultivation capacity while keeping the system relatively simple.' },
  /* Ultima ventana del recorrido: cierra con la sintesis de la sala
     (BACTERIA -> PROCESS -> RESULT), igual que bacteriaLarge01/bacteriaSmall06
     cierran la Sala 1 dentro de su propio body -- ningun panel nuevo. */
  window06: { display: false, tier: 'tertiary', windowIndex: 5, openable: true, icon: 'transform',
    section: '06', title: 'ONE MICROORGANISM, MANY OUTPUTS', lead: 'Different processes, different possibilities',
    tags: ['HYDROGEN', 'PHA', 'BIOMASS', 'ELECTRON EXCHANGE'],
    // Infografia real del proceso completo (fermentacion -> filtracion ->
    // cultivo PPB -> separacion de biomasa), sintesis visual del recorrido.
    images: ['./assets/images/process-overview.jpg'],
    body: 'Purple phototrophic bacteria do not lead to a single product or application.\n\nDepending on the strain, cultivation conditions and process, their metabolism can be connected to different outcomes.\n\nHYDROGEN\nPHA\nBIOMASS\nELECTRON EXCHANGE\n\nThe value of these microorganisms lies precisely in this diversity.\n\nDifferent bacteria, different processes and different possibilities.\n\nBACTERIA → PROCESS → RESULT\n\nUnderstanding the microorganism is the first step. Controlling the process is what allows its capabilities to be explored at a larger scale.' }
};

// English is the canonical/default content. The Spanish file only contains
// translated text fields, so anchors, images, icons and interaction metadata
// always stay identical in both languages.
const translatedContent = window.MUSEUM_I18N
  && window.MUSEUM_I18N.content
  && window.MUSEUM_I18N.content[MUSEUM_LANGUAGE];
if (translatedContent) {
  Object.keys(translatedContent).forEach((id) => {
    if (museumContent[id]) museumContent[id] = { ...museumContent[id], ...translatedContent[id] };
  });
}

/*
  Texto del cuerpo de la ficha: de textContent plano a HTML controlado, para
  poder (a) resaltar en negrita solo los conceptos cientificos importantes
  y (b) separar parrafos reales (cada \n\n de museumContent) en su propio
  <p>, con \n simples como salto de linea dentro del mismo parrafo (para
  listas cortas como la de window06). El texto en si NO cambia -- se
  escapa primero para que nada de esto pueda romper el HTML del panel.

  La lista de terminos es la misma para todo el museo (Sala 1 y Sala 2
  comparten la ficha): son los conceptos que el propio brief señala como
  ejemplo, mas los sinonimos directos que ya aparecen en los textos
  existentes. Ordenados de mas largo a mas corto antes de construir el
  regex, para que "hydrogen production" se resalte entero en vez de dejar
  "hydrogen" suelto y "production" sin marcar.
*/
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

/* museumContent[id].body en <p> reales (parrafo = linea en blanco), con
   negrita selectiva sobre terminos clave -- nunca frases/parrafos enteros. */
function renderPanelBody(rawText) {
  const highlighted = highlightKeywords(escapeHtml(rawText || ''));
  return highlighted
    .split(/\n\n+/)
    .map((para) => `<p>${para.split('\n').join('<br>')}</p>`)
    .join('');
}

/*
  Reasigna `child` a `newParent` conservando su transformacion de MUNDO
  exacta (misma posicion/rotacion/escala vistas desde fuera, aunque cambien
  sus valores locales). Se usa para envolver cada pieza informativa en un
  "pivote" centrado en su propio volumen, de forma que el hover pueda
  escalarla ligeramente alrededor de su propio centro en vez de alrededor
  del origen (0,0,0) que comparten todos los modulos del museo -- escalar
  sobre el origen desplazaria visiblemente la pieza en vez de agrandarla en
  su sitio.
*/
function reparentPreservingWorld(child, newParent) {
  child.updateWorldMatrix(true, false);
  const worldMatrix = child.matrixWorld.clone();
  newParent.add(child);
  newParent.updateWorldMatrix(true, false);
  const parentInverse = new THREE.Matrix4().copy(newParent.matrixWorld).invert();
  const localMatrix = new THREE.Matrix4().multiplyMatrices(parentInverse, worldMatrix);
  localMatrix.decompose(child.position, child.quaternion, child.scale);
}

/*
  Orienta la entidad hacia la camara cada frame. No se usa el componente
  `look-at` de aframe-extras (esta version no lo trae cargado, ver nota en
  drag-look-controls sobre por que aframe-extras no se usa en este
  proyecto): esta version minima solo la necesita la etiqueta flotante
  "VIEW +" de exhibit-info.
*/
AFRAME.registerComponent('face-camera', {
  init() { this._target = new THREE.Vector3(); },
  tick() {
    const camera = this.el.sceneEl && this.el.sceneEl.camera;
    if (!camera) return;
    camera.getWorldPosition(this._target);
    this.el.object3D.lookAt(this._target);
  }
});

/*
  Datos crudos (sin escalar) de los 6 circulos de video de la sala violeta,
  medidos directamente sobre la malla visible de cada circulo de Blender
  (centroide y normal reales de sus vertices en espacio de mundo de
  Blender/glTF, NUNCA el origen del objeto -- los 6 objetos tienen su
  origen en 0,0,0 y toda su geometria horneada en los vertices, asi que el
  origen no sirve como referencia de posicion). Exportados directamente
  desde Blender a glTF (misma tuberia/conversion de ejes que el resto de
  modulos) y verificados con SVD sobre la nube de puntos: centroid = centro
  geometrico real; normal = normal del plano ajustado por PCA, con el signo
  corregido para que apunte hacia el interior de la sala; u_axis = un eje
  tangente del propio plano del circulo, ortogonal a la normal. radius = la
  distancia real maxima de un vertice al centroide, en las mismas unidades
  crudas. place-ppb-circle (mas abajo) aplica la escala real del museo a
  estos valores en tiempo de ejecucion.
*/
const PPB_CIRCLES = {
  PPB_VIDEO_01: { centroid: [-1.94093, 1.40719, 2.99479], normal: [0.92215, -0.38567, 0.02998], u: [0.37767, 0.88082, -0.28553], radius: 0.1904 },
  PPB_VIDEO_02: { centroid: [-1.84054, 1.39784, 2.26459], normal: [0.89861, -0.39303, 0.19501], u: [0.43474, 0.73765, -0.5166], radius: 0.1975 },
  PPB_VIDEO_03: { centroid: [-1.66489, 1.39732, 1.51321], normal: [0.89418, -0.40005, 0.20102], u: [0.4463, 0.76082, -0.47114], radius: 0.1955 },
  PPB_VIDEO_04: { centroid: [-1.97822, 1.39696, -2.11191], normal: [0.86051, -0.43998, -0.25679], u: [-0.50805, -0.70407, -0.49615], radius: 0.2058 },
  PPB_VIDEO_05: { centroid: [-2.18675, 1.40212, -2.87555], normal: [0.87692, -0.43359, -0.20738], u: [-0.48008, -0.76949, -0.42119], radius: 0.1942 },
  PPB_VIDEO_06: { centroid: [-2.30118, 1.40707, -3.61543], normal: [0.90425, -0.4241, -0.04974], u: [-0.4165, -0.85032, -0.32169], radius: 0.1944 }
};

/*
  Coloca un <a-circle> de la sala violeta usando la transformacion de mundo
  REAL del museo ya cargado (no valores fijos calculados a mano). El
  circulo NO va anidado dentro de #modelo a proposito: setup-museum-model
  aplica una escala NO uniforme (scaleXZ para ancho/fondo, scaleY aparte
  para la altura), y una rotacion combinada con una escala no uniforme del
  padre deja el circulo torcido/mal orientado aunque la rotacion en si sea
  correcta -- por eso este componente calcula el resultado final ya
  corregido y lo aplica directamente en espacio de escena (sin padre que
  vuelva a escalar nada por encima):
    - posicion: el centroide crudo se escala eje a eje (igual que cualquier
      vertice del museo).
    - normal: bajo escala no uniforme una normal se transforma con la
      inversa-traspuesta de la escala (1/sx, 1/sy, 1/sz), no con la escala
      directa, o la orientacion queda sesgada.
    - eje tangente (u): un vector CONTENIDO en la superficie si se
      transforma con la escala directa; se reortogonaliza contra la normal
      ya corregida.
    - radio: se promedia el factor de escala real a lo largo de las dos
      direcciones propias del plano del circulo (u y v), que es la longitud
      que de verdad cubre el hueco -- un a-circle no puede representar una
      elipse, así que un unico radio es la mejor aproximacion posible.
*/
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
    const forwardOffset = 0.015; // metros, ya en espacio de mundo escalado

    this.el.object3D.position.copy(worldPos).addScaledVector(worldNormal, forwardOffset);
    this.el.object3D.quaternion.copy(quat);
    this.el.setAttribute('radius', worldRadius);
  }
});

AFRAME.registerComponent('exhibit-info', {
  schema: {
    show:  { type: 'number', default: 2.0 },   // distancia a la que aparece el aviso
    close: { type: 'number', default: 3.5 }    // distancia a la que se cierra el panel
  },
  init() {
    this.items = [];
    this.active = null;      // pieza mas cercana en rango (solo para el atajo "E")
    this.openId = null;      // panel abierto
    this.nextCheck = 0;
    this.tmp = new THREE.Vector3();

    this.ui = false;

    // Estado del hover (raton): que pieza esta bajo el cursor ahora mismo.
    // Solo se usa para el lenguaje visual de las 8 cepas (ver setupHover
    // AffordanceFor / tick) -- no toca seleccion por click, que ya
    // funciona de forma independiente en drag-look-controls.trySelect.
    this.hoverId = null;
    this._hoverNdc = new THREE.Vector2();
    this._hoverRaycaster = new THREE.Raycaster();
    this._lastHoverCheck = 0;
    this.onMouseMove = (e) => this.updateHover(e.clientX, e.clientY);
    window.addEventListener('mousemove', this.onMouseMove);

    this.onKey = (e) => {
      if (e.key === 'Escape') this.close();
      // E abre la pieza mas cercana; no interfiere con WASD. Ya no hay
      // ningun boton flotante -- this.active se sigue calculando en tick()
      // solo para que este atajo de teclado siga funcionando.
      if ((e.key === 'e' || e.key === 'E') && this.active && !this.openId) this.open(this.active.id);
    };
    window.addEventListener('keydown', this.onKey);

    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },

  /*
    El HTML del panel va despues de <a-scene>, asi que cuando A-Frame llama a
    init() el navegador todavia no lo ha parseado y getElementById devuelve
    null. Por eso las referencias se resuelven aqui, de forma perezosa, en vez
    de en init(). Ya no depende de #exhibit-prompt (retirado): la ficha
    funciona con solo el panel de informacion.
  */
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
      // Mismo filtro que ya usa image-windows (afinado alli tras comprobar
      // que un filtro mas simple -- solo "alto", b.min.y > 1.2 -- tambien
      // enganchaba los arcos de neon del techo, mucho mas altos que un
      // nicho real: quedaban 13 "ventanas" candidatas en vez de las 4 que
      // hay de verdad, con huecos[] apuntando sobre todo al techo. Un unico
      // filtro consistente (lado laboratorio, altura y tamaño de nicho) para
      // las dos cosas que dependen de estos nichos: la posicion 3D de la
      // ficha interactiva (aqui) y la lamina de imagen (image-windows).
      if (c.x < 1.2 || s.y < 0.9 || s.y > 2.6 || Math.max(s.x, s.z) > 1.6) return;
      turquesaAlto.push({ o, p: c, minY: b.min.y, maxY: b.max.y });
    });

    // Las ventanas de imagen se anclan a los nichos turquesa altos de la pared
    // opuesta, agrupados por posicion. Asi no dependen de nombres concretos.
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
          // Marca cada malla de esta pieza para la seleccion directa por
          // click/tap (ver drag-look-controls.trySelect): asi el raycaster
          // solo puede tocar piezas con ficha real, nunca paredes/suelo/neon.
          o.traverse((n) => { if (n.isMesh) n.userData.museoExhibitId = id; });
          // Caso especial del reactor: su ancla (PEANA_Bioreactor) es solo la
          // peana/base, un anillo pequeño y en gran parte tapado por el
          // propio reactor que se apoya encima -- el cuerpo visible del
          // reactor (cristal, liquido, burbujas, tapa...) vive en nodos
          // hermanos con prefijo "Bioreactor_" del mismo modulo GLB, sin
          // marcar hasta ahora. Sin esto, el visitante podia pasar el raton
          // o hacer click sobre el propio reactor -- lo obvio para
          // seleccionarlo -- y no pasaba nada, solo funcionaba sobre el
          // aro estrecho de la base: es lo que hacia que "no se notara
          // seleccionable". Se marcan aqui con el mismo id para que el
          // hover/click funcionen sobre el cuerpo real del reactor.
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

    // Peanas reales (mismo prefijo que usa setup-museum-model para los
    // obstaculos de colision), medidas aqui de forma independiente: cada
    // placa fisica (createPedestalPlacard) necesita el radio y el centro
    // REAL de la peana de su propia pieza, no un valor supuesto, para
    // apoyarse justo en su superficie sin flotar ni hundirse.
    this.peanaBoxes = [];
    mesh.traverse((o) => {
      if (o.isMesh && o.name.startsWith('PEANA_')) {
        const b = new THREE.Box3().setFromObject(o);
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        // radiusX/radiusZ (medio ancho real en cada eje de mundo), ademas del
        // "radius" unico ya existente: la peana central (PEANA_Bacteria) no
        // es circular -- es una elipse suave, mas larga en Z que en X (medido
        // por geometria real) -- y createPedestalPlacard necesita ambos
        // valores por separado para esa pieza (ver isLowWidePlinth).
        this.peanaBoxes.push({
          center: c, radius: Math.max(s.x, s.z) / 2,
          radiusX: s.x / 2, radiusZ: s.z / 2,
          minY: b.min.y, maxY: b.max.y
        });
      }
    });

    // Orientacion compartida para la fila de las 6 piezas secundarias: UNA
    // sola direccion (no una calculada por pieza), desde el centro de esa
    // fila hacia la bacteria grande central. Las 6 peanas estan sobre una
    // pared curva -- calcular "hacia el centro de la sala" por separado para
    // cada una (como se hacia antes) da un angulo distinto por pieza y las
    // placas terminan mirando "de lado" unas respecto a otras. Con una unica
    // direccion compartida, las 6 quedan paralelas entre si, como una fila
    // coherente vista desde el paso del visitante. Las 2 piezas grandes no
    // forman fila: cada una calcula su propio frente hacia MUSEO_SPAWN (ver
    // createPedestalPlacard).
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

    // Lenguaje visual de interaccion (hover + placa fisica en la peana) en
    // las 8 cepas de la Sala 1 (ids que empiezan por "bacteria"). No toca el
    // reactor (Sala 2, su propia malla PEANA_Bioreactor ya quedo marcada
    // arriba con museoExhibitId y abre panel igual que siempre).
    this.items.forEach((it) => {
      if (it.data.tier === 'tertiary' || !it.id.startsWith('bacteria')) return;
      this.setupHoverAffordance(it);
    });

    // Ventanas de la Sala 2 (openable:true): antes eran contenido pasivo sin
    // ficha ni malla seleccionable. Cada una recibe ahora una pequeña placa
    // fisica de pared (setupWindowTag), pegada justo debajo de su nicho real,
    // que reutiliza exactamente el mismo lenguaje visual que las placas de
    // peana (papel, sin cristal, sin resplandor) y el mismo mecanismo de
    // hover por pivote que ya usa tick() para las 8 cepas.
    this.items.forEach((it) => {
      if (it.data.tier !== 'tertiary' || !it.data.openable) return;
      this.setupWindowTag(it);
    });

    console.log(`[exhibit-info] ${this.items.length} piezas activas, ${this.selectableMeshes.length} mallas seleccionables por click/tap, ` +
      `${this.items.filter((i) => i.pivot).length} con lenguaje visual de hover`);
  },

  /*
    Prepara UNA pieza informativa para el lenguaje visual de interaccion: un
    "pivote" (THREE.Group) centrado en su propio volumen, del que cuelga la
    entidad gltf-model que la contiene (nunca el nodo animado en si -- ver
    nota mas abajo), y una ficha compacta (numero + nombre + "VIEW +") junto
    a la peana que se atenua/enciende segun la distancia del visitante.

    Por que un pivote y no escalar la pieza directamente: cada bacteria trae
    su propia animacion de posicion/rotacion horneada en el propio nodo
    ancla (BACTERIA_MASTER, Bacteria_GRUPO_*...) -- es la respiracion/
    balanceo sutil que ya tenian. Si esta funcion tocara ese nodo, el
    AnimationMixer lo pisaria en el siguiente frame. En su lugar se reasigna
    la ENTIDAD gltf-model completa (el contenedor que A-Frame crea para el
    modulo, que la animacion nunca toca) a un pivote situado en el centro
    real de la pieza, así el hover puede escalar el pivote sin interferir
    con la animacion existente ni desplazar la pieza de su sitio.
  */
  setupHoverAffordance(it) {
    const anchorObj = it.anchorObj;
    if (!anchorObj) return;
    // sube por la jerarquia hasta la entidad A-Frame dueña de este modulo
    // (el object3D de una <a-entity> siempre lleva `.el`; los nodos internos
    // del glTF cargado no lo llevan)
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
    it.hoverT = 0;       // 0..1, suavizado (ease) de entrada/salida del hover

    // materiales emisivos de esta pieza (brillo violeta de la bacteria/
    // capsula), para el realce muy sutil al pasar el raton por encima
    const mats = new Set();
    const black = new THREE.Color(0, 0, 0);
    anchorObj.traverse((n) => {
      if (n.isMesh && n.material && n.material.emissive && !n.material.emissive.equals(black)) {
        mats.add(n.material);
      }
    });
    it.emissiveMats = Array.from(mats).map((mat) => ({ mat, base: mat.emissiveIntensity }));

    // Una unica placa fisica para las 8 cepas (ver createPedestalPlacard).
    it.placard = this.createPedestalPlacard(it);
  },

  /*
    Normal real de la pared mas cercana a "pos", apuntando hacia DENTRO de
    la sala (perpendicular a esa pared, no hacia un punto de mira que
    cambia con la posicion de cada pieza -- ver nota en setupWindowTag).
    Usa el rectangulo real de la sala (MUSEO_BOUNDS): la pared mas cercana
    es la que tiene menor distancia a cualquiera de sus 4 lados.
  */
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

  /*
    Placa fisica de pared para las ventanas de la Sala 2 (openable:true):
    misma familia visual que las placas de peana (papel, sin cristal, sin
    resplandor permanente), pero plana -- aqui no hay ninguna peana
    cilindrica que envolver, solo el nicho de neon turquesa real (this.items
    ya trae su centro/alto/bajo, medidos en onLoaded). Se cuelga justo debajo
    del nicho, ligeramente separada del muro para no pisar el marco.

    Como no hay malla de bacteria que "respire" al pasar el raton por
    encima, aqui el propio pivote de hover ES la placa: se le da un tinte
    emisivo sutil para que el mismo bucle de tick() (pensado para las 8
    cepas, solo mira it.pivot/it.emissiveMats) la haga brillar un poco al
    pasar el cursor, sin codigo nuevo en tick().
  */
  setupWindowTag(it) {
    // Direccion real del muro (normal hacia dentro de la sala), no un punto
    // de mira que cambia con la posicion de cada pieza -- ver wallFacingDir.
    const dir = this.wallFacingDir(it.pos);
    const dirX = dir.x, dirZ = dir.z;
    const yaw = Math.atan2(dirX, dirZ);

    // Mismo tamaño/proporcion que las cartelas moradas de peana secundaria
    // (Sala 1: PLACARD_HEIGHT=0.26, cuerda de arco ~0.28) -- antes esta
    // placa era mas ancha y mucho mas baja (0.30x0.165), lo que la hacia
    // sentir mas grande/torpe y desproporcionada frente al sistema morado.
    const WIDTH = 0.28, HEIGHT = 0.26;

    // Soporte de pared -> soporte de poste independiente del muro. Alinear
    // una placa exactamente al ras de un muro curvo, sin poder verificarlo
    // en un render en vivo, es fragil: la mas minima imprecision en la
    // normal real deja la placa flotando, de lado o a medio pegar (el
    // problema reportado). Un poste fino desde el suelo hasta la altura de
    // lectura, con la placa rectangular en su extremo, es el propio
    // "soporte museistico" que pide el brief y no depende de esa precision:
    // se apoya en el suelo real (MUSEO_SPAWN.y) y se separa del muro hacia
    // el interior de la sala, nunca sobre el.
    const spawn = window.MUSEO_SPAWN;
    const floorY = (spawn && typeof spawn.y === 'number')
      ? spawn.y
      : (it.bottomY !== null ? it.bottomY - 1.0 : it.pos.y - 1.2);
    const STAND_OUT = 0.40;                 // hacia el interior de la sala, lejos del muro
    const SIGN_CENTER_Y = floorY + 1.15;    // altura de lectura comoda
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

    // Mismo metodo de texto horneado que las 8 cartelas de bacteria (un
    // unico canvas con numero + nombre + cita, aplicado como textura),
    // solo que en Sala 2 con los colores verde/turquesa (ROOM2_ACCENT*) en
    // vez del morado por defecto -- misma jerarquia, misma tipografia,
    // mismo "lenguaje museo", solo cambia el acento de color.
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

    // el pivote/emisivo son los mismos campos que usa el bucle de hover de
    // tick() para las 8 cepas -- aqui el "pivote" es el soporte entero
    // (poste + placa), asi que el hover lo realza como conjunto.
    it.pivot = wrapper.object3D;
    it.hoverT = 0;
    it.emissiveMats = [{ mat: plane.material, base: plane.material.emissiveIntensity }];
    it.tag = { wrapper, plane, pole };
  },

  /*
    Textura de papel muy barata (un solo canvas en escala de grises,
    reutilizado por las 8 placas): ruido suave a baja opacidad sobre blanco,
    solo para romper la superficie perfectamente lisa de un
    MeshStandardMaterial de color plano. No es un efecto de luz -- es grano
    de papel, se ve igual con cualquier iluminacion de la sala.
  */
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

  /*
    Reparte "text" en lineas que quepan en maxWidthPx (medido con el font ya
    puesto en ctx), partiendo siempre por palabra completa -- nunca a mitad
    de palabra. Mismo criterio que ya usaba image-windows.lamina() para el
    pie de foto, reutilizado aqui para el nombre de la especie.
  */
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

  /*
    El texto de la cartela YA NO son a-text sueltos flotando delante de la
    curva (eso es lo que se veia "plano"/"proyectado", como una pegatina
    cruzando el cilindro). Aqui se pinta numero + especie + "click to
    explore" en un unico canvas -- fondo crema y grano de papel incluidos --
    y ese canvas se aplica como textura de la MISMA malla curva que ya forma
    la cartela (ver createPedestalPlacard). Al llevar el mapeado UV estandar
    de un CylinderGeometry (u recorre justo el arco generado, v la altura),
    el texto queda repartido sobre la propia superficie curva -- lee como
    impreso en la etiqueta, no como una tarjeta plana delante de ella.

    Los tamaños de fuente se calculan como fraccion de heightM (la altura
    real de la cartela en metros), no en pixeles fijos: asi la jerarquia
    numero/titulo/cita es identica, en proporcion, en una cartela pequeña o
    en la grande del pedestal principal (mucho mas baja) -- se ven a
    familia aunque su tamaño fisico absoluto sea distinto.
  */
  buildPlacardTextTexture(section, title, cueText, heightM, widthM, accentColor, cueColor) {
    // accentColor/cueColor opcionales: por defecto el morado de la Sala 1
    // (unicos valores usados hasta ahora, por las 8 cartelas de bacteria),
    // asi ese llamador no cambia. La Sala 2 (setupWindowTag) pasa
    // ROOM2_ACCENT/ROOM2_ACCENT_LIGHT para compartir EXACTAMENTE el mismo
    // metodo de texto horneado -- misma proporcion, jerarquia y tipografia
    // que las cartelas moradas -- en vez de una construccion aparte con
    // <a-text> sueltos, que es lo que las hacia sentir desproporcionadas.
    const numberColor = accentColor || '#74349A';
    const cueTextColor = cueColor || '#805096';
    const HPX = 640;
    const WPX = Math.max(64, Math.round(HPX * (widthM / heightM)));
    const c = document.createElement('canvas');
    c.width = WPX; c.height = HPX;
    const ctx = c.getContext('2d');
    const pxPerM = HPX / heightM;

    // fondo crema + grano de papel muy suave (mismo lenguaje que el resto
    // del museo), pintado aqui en vez de como mapa aparte para que quede en
    // el mismo canvas que el texto y no se dupliquen texturas.
    ctx.fillStyle = '#F7F4EE';
    ctx.fillRect(0, 0, WPX, HPX);
    const grano = Math.round((WPX * HPX) / 700);
    for (let i = 0; i < grano; i++) {
      const v = 205 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgba(${v},${v},${v},0.05)`;
      ctx.fillRect(Math.random() * WPX, Math.random() * HPX, 1, 1);
    }

    // Jerarquia (fraccion de heightM): numero visible pero no gigante,
    // especie como texto principal, cita mas pequeña y discreta. Margenes
    // generosos arriba/abajo y a los lados -- nada pegado al borde.
    const numberSizePx = heightM * 0.105 * pxPerM;
    const titleSizePx = heightM * 0.125 * pxPerM;
    const cueSizePx = heightM * 0.070 * pxPerM;
    const gap1Px = heightM * 0.050 * pxPerM;     // numero -> titulo
    const gap2Px = heightM * 0.055 * pxPerM;     // titulo -> cita
    const padSidePx = WPX * 0.09;
    const lineSpacing = 1.18;
    const maxTextWidth = WPX - padSidePx * 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.font = `600 ${titleSizePx}px Helvetica, Arial, sans-serif`;
    const lines = title ? this.wrapCanvasText(ctx, title, maxTextWidth) : [];
    const titleBlockH = lines.length * titleSizePx * lineSpacing;

    // bloque completo centrado verticalmente: un titulo de una sola linea
    // (p. ej. "RHODOVULUM") no deja la cartela descompensada hacia arriba.
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

  /*
    Cartela fisica de museo, unica para las 8 cepas. Un segmento de cilindro
    parcial -- una etiqueta de papel envuelta solo en el frente de la peana,
    no un plano plano ni un tubo completo -- centrado en el propio eje de la
    peana real mas cercana (this.peanaBoxes, medido en onLoaded), con radio
    = radio real de esa peana + 8 mm. Al compartir eje con la peana, la
    cartela queda pegada a su superficie curva en vez de flotar delante.

    Orientacion: NO face-camera, no se vuelve a tocar tras crearla. Las 6
    piezas secundarias comparten una unica direccion (this._placardRowDir,
    calculada una vez en onLoaded) para quedar todas paralelas, como una
    fila coherente -- la pared donde estan es curva, asi que calcular el
    frente pieza a pieza (como se hacia antes) producia angulos distintos y
    parecian torcidas. Las 2 piezas grandes no son fila: cada una mira hacia
    MUSEO_SPAWN (el punto real por el que entra el visitante).

    Altura: fraccion de la altura REAL de esa peana concreta (peanaMinY/
    peanaMaxY), no un valor absoluto sobre el suelo -- así queda a la altura
    del cuerpo del pedestal (tercio medio/medio-alto), con peana visible por
    encima y por debajo, en vez de cerca de la cupula de cristal.

    Caso especial -- peana principal (BACTERIA_MASTER / PEANA_Bacteria): es
    una base baja y ancha (~0.27 m de alto, ~1.4 m de diametro), no una
    columna como las demas. Usando el mismo arco/alto que el resto, la
    cartela salia enorme (mas de 1 m de cuerda) y casi tan alta como la
    propia peana. Se detecta por altura real (<0.35 m) y se usa un arco mas
    cerrado y una cartela mas baja, a medida de ESA peana -- radio y
    posicion siguen midiendose igual, solo cambian arco/alto/encaje
    vertical, y solo para esta pieza.
  */
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
      px = nearest.center.x;   // centrada en el eje REAL de la peana, no en
      pz = nearest.center.z;   // el centroide de la bacteria que lleva encima
    }

    // Direccion frontal: fila compartida para las 6 secundarias, calculo
    // propio hacia MUSEO_SPAWN para las 2 grandes (ver comentario arriba).
    let dirX = 0, dirZ = 1;
    if (it.data.tier === 'secondary' && this._placardRowDir) {
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
    // La peana principal (PEANA_Bacteria) no es circular: medida por
    // geometria real (vertices reales del mesh, no solo su caja), es una
    // elipse suave -- mas larga en Z que en X (radiusZ/radiusX ~= 1.25).
    // isLowWidePlinth ya identificaba solo esta pieza (unica peana baja y
    // ancha del museo); cuando ademas sus dos radios difieren de verdad, se
    // usa geometria elíptica real en vez de asumir un circulo.
    const isEllipticalPlinth = isLowWidePlinth &&
      Math.abs(peanaRadiusX - peanaRadiusZ) > 0.03 * Math.max(peanaRadiusX, peanaRadiusZ);

    // Geometria: medio cilindro (o media elipse) abierto, arco centrado en
    // el frente. Caso circular (7 de las 8 peanas): misma convencion de
    // siempre (yaw = atan2(dirX,dirZ) orienta el wrapper). Caso eliptico
    // (solo PEANA_Bacteria): la elipse real esta alineada con los ejes de
    // mundo X/Z (confirmado por analisis de la geometria -- eje principal a
    // ~90 grados del eje local, es decir sin giro), asi que el wrapper NO
    // se rota: el arco se construye ya en coordenadas de mundo, con
    // radiusX/radiusZ propios, y el centro del arco (thetaCenter) se calcula
    // con la formula de la normal real de una elipse (no la del circulo),
    // para que seguir apuntando hacia MUSEO_SPAWN sea correcto igual.
    const ARC_DEG = isLowWidePlinth ? 50 : 82;  // peana ancha -> arco mas cerrado, cuerda razonable
    const ARC = ARC_DEG * Math.PI / 180;
    const PLACARD_HEIGHT = isLowWidePlinth ? 0.15 : 0.26;
    const heightFrac = isLowWidePlinth ? 0.50 : 0.58;   // centrada si apenas hay peana, si no tercio medio-alto
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
      // radios reales de la superficie (peana + 8 mm en cada eje).
      const rx = peanaRadiusX + 0.008, rz = peanaRadiusZ + 0.008;
      // normal real de una elipse (x/rx)^2+(z/rz)^2=1 en el punto theta,
      // con la misma convencion seno-en-X/coseno-en-Z que usa el resto del
      // museo para "yaw": normal ∝ (rx*sin(theta), rz*cos(theta)). Se
      // resuelve theta para que esa normal apunte hacia (dirX,dirZ) --
      // cuando rx=rz esto se reduce exactamente a yaw=atan2(dirX,dirZ).
      const thetaCenter = Math.atan2(dirX * rx, dirZ * rz);
      const thetaStart = thetaCenter - ARC / 2;
      // wrapper SIN rotacion: la elipse ya esta en ejes de mundo reales.
      wrapper.object3D.rotation.set(0, 0, 0);
      curveGeo = new THREE.CylinderGeometry(1, 1, PLACARD_HEIGHT, segs, 1, true, thetaStart, ARC);
      curveGeo.scale(rx, 1, rz);
      // radio efectivo en el punto central del arco, para dimensionar el
      // texto sin estirarlo (mismo criterio que el caso circular).
      const rEff = Math.hypot(rx * Math.sin(thetaCenter), rz * Math.cos(thetaCenter));
      arcLengthM = rEff * ARC;
    } else {
      const CURVE_RADIUS = peanaRadius + 0.008;   // superficie real de la peana + 8 mm
      wrapper.object3D.rotation.set(0, yaw, 0);
      curveGeo = new THREE.CylinderGeometry(CURVE_RADIUS, CURVE_RADIUS, PLACARD_HEIGHT, segs, 1, true, -ARC / 2, ARC);
      arcLengthM = CURVE_RADIUS * ARC;   // cuerda real del arco, para no estirar el texto
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

  /*
    Hover por raton: raycast contra las mismas mallas seleccionables que ya
    usa el click (drag-look-controls.trySelect), pero en cada movimiento del
    raton en vez de al soltar. Solo cambia this.hoverId + el cursor; el
    realce visual en si (escala/brillo/etiqueta) se aplica en tick(), donde
    se anima con suavidad en vez de saltar de golpe.
  */
  updateHover(x, y) {
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - this._lastHoverCheck < 50) return;   // ~20 comprobaciones/seg, de sobra
    this._lastHoverCheck = now;

    if (!this.selectableMeshes || !this.selectableMeshes.length) return;
    const sceneEl = this.el.sceneEl;
    const canvas = sceneEl && sceneEl.canvas;
    const camera = sceneEl && sceneEl.camera;
    if (!canvas || !camera) return;

    // mientras se arrastra la camara no hay "hover": evita que la pieza que
    // queda bajo el cursor al terminar un arrastre largo se ilumine sola
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

    // Hover de las 8 cepas: sin throttle (se anima cada frame para que la
    // respiracion se vea suave). Muy barato -- 8 items como mucho, sin
    // raycasts aqui. La cartela fisica (it.placard) es estatica y ya no se
    // toca en cada frame -- solo la propia bacteria (pivote/emisivo).
    this.items.forEach((it) => {
      if (!it.pivot) return;
      const isHovered = this.hoverId === it.id;
      it.hoverT += ((isHovered ? 1 : 0) - it.hoverT) * 0.08;

      const breathe = 0.5 + 0.5 * Math.sin(time * 0.0016);
      const scale = 1 + it.hoverT * (0.015 + 0.015 * breathe);   // ~1.00 -> ~1.03
      it.pivot.scale.setScalar(scale);

      // Piezas "large" (Sala 1): su cartela fisica (it.placard) vivia fuera
      // del pivote y nunca se tocaba en hover ("la cartela es estatica" --
      // ver nota historica arriba), asi que al agrandarse la bacteria la
      // cartela se quedaba atras y la interaccion se sentia rota/desconectada.
      // Se le aplica el MISMO factor de escala, centrado en su propio
      // wrapper (ya posicionado junto a la peana real), para que bacteria y
      // cartela crezcan juntas y la cartela nunca desaparezca.
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

    // Ya no hay ningun boton flotante que actualizar: esto solo alimenta
    // this.active para el atajo de teclado "E" (abrir la pieza mas cercana).
    // Las ventanas openable cuentan igual que cualquier otra pieza real.
    let mejor = null, mejorD = Infinity;
    this.items.forEach((it) => {
      if (it.data.tier === 'tertiary' && !it.data.openable) return;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < mejorD) { mejorD = d; mejor = it; }
    });
    this.active = (mejor && mejorD <= this.data.show) ? mejor : null;

    // cerrar el panel si el visitante se aleja
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
    // cuerpo: parrafos reales + negrita solo en los conceptos clave (ver
    // renderPanelBody/highlightKeywords) -- el texto en si no cambia.
    this.panel.querySelector('.panel-body').innerHTML = renderPanelBody(d.body);
    // medios de apoyo opcionales (imagenes o videos cortos). Vacio por
    // defecto, no se muestra nada si la pieza no los trae -- nunca la imagen
    // del circulo/nicho, que es un contenido aparte.
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
    // Sala 2 (reactor/ventanas) usa el acento verde/turquesa del propio
    // sistema de color de esa sala, no el morado de la Sala 1 -- misma
    // ficha compartida, solo cambia --mus-morado (ver style.css).
    this.panel.classList.toggle('room2', id.startsWith('reactor') || id.startsWith('window') || id === 'spaceMission');
    this.panel.classList.add('visible');
    const scroll = this.panel.querySelector('.panel-scroll');
    if (scroll) scroll.scrollTop = 0;   // cada ficha nueva empieza arriba, no donde quedo la anterior
    this.openId = id;
    this.hideIntro();
    // En movil, el panel puede solapar la esquina donde vive el joystick de
    // movimiento (ver mobile-controls) en pantallas pequeñas: se oculta
    // mientras se lee una ficha (con la ficha abierta no hace falta seguir
    // moviendose) y vuelve a aparecer al cerrarla, ver style.css.
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

/*
  Estacion espacial suspendida de R. rubrum.

  La pieza se coloca a partir de la geometria real de la segunda bacteria
  grande, no mediante coordenadas fijas. Al entrar en su radio de proximidad
  baja desde el techo; al salir vuelve a subir. Dos lineas de bronce unen los
  anclajes incluidos en el GLB con el techo y crecen durante el descenso.
  La propia estacion se registra tambien en exhibit-info, asi que funciona
  con el mismo click/tap, hover y panel accesible del resto del museo.
*/
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
      // exhibit-info escucha el mismo evento. Un turno de event-loop asegura
      // que termine su registro convencional antes de añadir la pieza dinamica.
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

    // Un poco hacia el pasillo para que la estacion no atraviese la vitrina
    // de la bacteria. La altura visible queda por encima de la cabeza.
    this.basePosition.set(
      anchorPosition.x + towardVisitor.x * 0.82,
      spawn.y + 2.72,
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

/*
  Focos de exposicion. Es solo luz: no toca geometria, materiales, neones,
  animaciones ni el GLB.

  Jerarquia en tres niveles, que es lo que le da profundidad a la sala:
    - hemisferico = relleno ambiental calido, bajo, para que nada quede negro
    - directional = luz principal, marca el volumen de las paredes curvas
    - estos focos  = acentos sobre las piezas, para separarlas del fondo

  Los focos NO proyectan sombra a proposito: en una sala con esta cantidad
  de geometria cada sombra adicional cuesta un mapa de sombras entero, y el
  efecto buscado es un charco de luz suave, no una sombra marcada. La sombra
  de contacto ya la da la directional.

  Las posiciones se leen de las propias piezas del modelo ya cargado, asi que
  siguen siendo correctas aunque el modelo se reescale en tiempo real.
*/
/*
  NOTA: hubo dos intentos de "vitral" en este hueco de ventana (primero sobre
  la campana de vidrio de la bacteria grande -- se leia como una burbuja
  morada envolviendo la bacteria --, despues como una lamina de degradado
  flotando junto a la ventana -- se seguia leyendo como un panel de color
  pegado delante de la arquitectura, no como parte de ella). Los dos se han
  retirado por completo, sin sustituirlos por ninguna otra geometria: el
  hueco de la ventana queda limpio, con su neon y su arquitectura tal cual
  vienen del modulo. Si en el futuro se quiere un tratamiento de cristal de
  color ahi, se hara a mano sobre el propio material del modulo, no generado
  aqui.
*/

/*
  Ventanas-imagen. Tres de los cinco nichos altos se convierten en lightbox de
  museo: un plano finisimo dentro del hueco con una textura generada que ya
  incluye el numero, el titulo y el pie. Asi el contenido queda embebido en la
  arquitectura en lugar de ser una tarjeta blanca flotando delante.

  El marco iluminado lo pone la propia arquitectura (el neon del nicho), asi que
  aqui no se dibuja ningun borde. Si algun dia se rellena `image` en
  museumContent con una ruta, la foto se usa de fondo en lugar del patron.
*/
AFRAME.registerComponent('image-windows', {
  init() { this.el.addEventListener('museo-modules-loaded', () => this.onLoaded()); },

  lamina(d) {
    const W = 512, H = 360;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // fondo oscuro tintado: lectura de vitrina retroiluminada, no de monitor
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#161320'); g.addColorStop(1, '#241d2c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // patron celular: circulos concentricos tenues, lenguaje de microscopia
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 26; i++) {
      const x = 40 + Math.random()*(W-80), y = 30 + Math.random()*(H-120);
      const r = 8 + Math.random()*34;
      ctx.strokeStyle = 'rgba(214,196,235,' + (0.10 + Math.random()*0.22).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.stroke();
      if (r > 20) { ctx.beginPath(); ctx.arc(x, y, r*0.42, 0, 6.28); ctx.stroke(); }
    }
    // velo inferior para que el texto siempre se lea
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
    // el pie se parte en dos lineas si hace falta
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

    /*
      Los nichos de verdad son los marcos verticales de neon turquesa pegados a
      la pared del lado laboratorio. El primer intento se anclaba a grupos de
      neon altos, que resultaron ser los arcos del techo: las laminas salian
      diminutas y casi de perfil. Aqui se buscan marcos altos y pegados a la
      pared, y cada lamina se dimensiona y orienta segun su propio hueco.
    */
    const marcos = [];
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.name !== 'Neon_Turquoise') return;
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());
      // pegado a la pared, de altura de ventana y de tamaño de nicho: los arcos
      // grandes del techo cumplian las dos primeras condiciones y hacian que el
      // hueco resultante creciera hasta varios metros
      if (c.x < 1.2 || s.y < 0.9 || s.y > 2.6 || Math.max(s.x, s.z) > 1.6) return;
      marcos.push({ c, s });
    });
    // agrupar los marcos que comparten hueco y quedarse con los tres mayores
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
      // acotado: una lamina de museo, nunca un panel de varios metros
      const ancho = Math.min(Math.max(h.s.z, 0.5) * 0.8, 1.1);
      const alto = Math.min(h.s.y * 0.66, 0.85);
      const plano = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), mat);
      const p = h.c.clone();
      p.x -= 0.04;                                   // ligeramente por detras del plano del marco
      raiz.worldToLocal(p);
      plano.position.copy(p);
      plano.renderOrder = 1;
      raiz.add(plano);
      const mirar = p.clone(); mirar.x -= 3;         // de cara al centro de la sala
      plano.lookAt(mirar);
      puestas++;
    });
    console.log(`[image-windows] ${puestas} vitrinas de imagen`);
  }
});

/*
  Microinstalacion de electroactividad de RHODOVULUM.

  Es una capa museografica: no toca el GLB, ni posiciones, ni materiales
  base. Todo se deriva por MEDICION en tiempo de ejecucion de piezas reales
  del modelo -- la bacteria (anclaje curatorial bacteriaSmall04), su campana
  de cristal (VITRINA_Campana_*), la base de esa campana (VITRINA_Base_*) y
  la peana que las sostiene -- de modo que no hay ni una sola coordenada
  escrita a mano.

  Lectura buscada, desde la posicion normal del visitante:

      [ELECTRODO]  ---> e-  e-  e-  --->  [BACTERIA]

  El electrodo es una placa fina, discreta, a la DERECHA del visitante y
  ligeramente retrasada, apoyada en la tapa de la peana (fuera de la campana,
  porque la bacteria ocupa practicamente todo el diametro interior: medido,
  quedan 1.7 cm libres a cada lado, imposible meter nada sin que la propia
  bacteria lo tape). Los electrones nacen en la superficie de la placa y
  mueren dentro de la bacteria siguiendo una curva muy suave, con una guia
  casi transparente y una punta de flecha minuscula junto a la bacteria para
  que la direccion se entienda incluso en una captura fija.

  No hay ningun cartel grande: solo una microetiqueta de dos lineas que
  aparece al acercarse, siempre por debajo de la imagen circular superior.
*/
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
    this.displayT = 0;
    this.nextSpawn = 0;
    this.boostUntil = 0;
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

  /* --------------------------------------------------------------------
     MEDICION. Todo lo que sigue sale del modelo, nunca de constantes.
     -------------------------------------------------------------------- */

  // Campana de cristal que cubre a esta bacteria. Se localiza por contencion
  // real (la caja del cristal envuelve el centro de la bacteria), no por
  // indice ni por nombre exacto, para que siga funcionando si cambia la
  // numeracion de las vitrinas en Blender.
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

  // Direccion "hacia el visitante": la misma fila de cartelas que ya usa
  // exhibit-info para orientar todas las fichas de la sala.
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
    // Derecha del VISITANTE (mira hacia -front): right = (-front) x up.
    const right = new THREE.Vector3(front.z, 0, -front.x).normalize();

    // Se prueba primero la derecha; si ahi el electrodo no cabria dentro de
    // la tapa de la peana, se usa la izquierda. Nunca se fuerza una posicion
    // que se salga de la piedra.
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
        // se acerca el electrodo hasta que quepa, sin bajar de la campana
        while (lateral > bellRadius + 0.030 && !fits(pos)) {
          lateral -= 0.008;
          pos = place(sideDir, lateral);
        }
      }
    }
    pos.y = standTopY + 0.002;

    // Proporciones DERIVADAS de la bacteria: la placa mide poco mas de la
    // mitad de su altura visual, tal y como pide el guion museografico.
    const plateH = THREE.MathUtils.clamp(bacHeight * 0.58, 0.046, 0.095);
    const plateW = plateH * 0.64;
    const plateT = 0.0038;
    const plateCY = center.y - bacHeight * 0.12;   // ligeramente por debajo del centro

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

  /* --------------------------------------------------------------------
     ELECTRODO. Placa fina de grafito con un filo turquesa, sobre un pie
     minimo. Nada de torre, nada de pantalla.
     -------------------------------------------------------------------- */
  createElectrode() {
    const sceneObj = this.el.sceneEl.object3D;
    const { w, h, t, cy } = this.plateGeom;
    const base = this.electrodeBase;

    const group = new THREE.Group();
    group.name = 'rhodovulum-electrodo';
    group.position.copy(base);
    // la cara util mira a la bacteria
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

    const plateY = cy - base.y;                 // altura local del centro de placa
    const plateBottom = plateY - h / 2;

    // filo turquesa: un plano un pelin mayor detras de la placa, de modo que
    // solo asome como una linea de menos de 1 mm en todo el contorno.
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

    // zona de click comoda, invisible
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 2.6, h * 1.9),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide })
    );
    hit.position.set(0, plateY, t / 2 + 0.004);
    group.add(hit);
    hit.userData.museoExhibitId = 'electroactivityElectrode';
    hit.userData.museoAction = () => this.boostElectrons();
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

  /* --------------------------------------------------------------------
     TRAYECTORIA. Nace en la superficie de la placa, muere en la bacteria.
     -------------------------------------------------------------------- */
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

  // Guia direccional: linea finisima semitransparente + punta de flecha
  // minuscula junto a la bacteria (opcion A del guion).
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
    // la punta se coloca en el hueco visible entre placa y bacteria (medido:
    // la trayectoria entra en los pili hacia t=0.37), no dentro del cuerpo.
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
    // MUCHO mas pequenos que antes (0.013 -> 0.0038): puntos de energia, no bolas.
    const geo = new THREE.SphereGeometry(0.0045, 10, 8);
    const trailGeo = new THREE.SphereGeometry(0.0026, 8, 6);
    this.electronGeo = geo;
    this.trailGeo = trailGeo;
    for (let i = 0; i < this.data.maxElectrons; i++) {
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
      this.electrons.push({ mesh, mat, trails, active: false, t: 0, speed: 0.55, curve: i % 3 });
    }
  },

  /* --------------------------------------------------------------------
     MICROETIQUETA. Dos lineas, pequena, siempre por debajo de la imagen
     circular (se calcula con el tope real de la campana, no a ojo).
     -------------------------------------------------------------------- */
  createLabel() {
    const sceneObj = this.el.sceneEl.object3D;
    const group = new THREE.Group();
    group.name = 'rhodovulum-microetiqueta';
    const base = this.electrodeBase;
    const topPlate = this.plateGeom.cy + this.plateGeom.h / 2;
    const bellTop = this.bellBox ? this.bellBox.max.y : topPlate + 0.2;
    // se queda entre el borde superior de la placa y el tope de la campana:
    // por encima del electrodo, muy por debajo del circulo de imagen.
    const y = Math.min(topPlate + 0.048, bellTop - 0.030);
    group.position.set(base.x + this.side.x * 0.022, y, base.z + this.side.z * 0.022);
    sceneObj.add(group);

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
    // El titulo cambia de longitud con el idioma ("ELECTRON UPTAKE" /
    // "CAPTACION DE ELECTRONES"): el cuerpo se reduce hasta que la linea cabe
    // de verdad en la etiqueta, en vez de salirse por el borde.
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

  /* -------------------------------------------------------------------- */

  boostElectrons() {
    this.boostUntil = performance.now() + 3000;
    this.spawnElectron(true);
  },

  isBoosting() { return performance.now() < this.boostUntil; },

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
    // apagado: el electrodo sigue ahi pero casi no se ve (no desaparece de golpe)
    const solid = 0.22 + 0.72 * eased;
    g.graphite.opacity = solid;
    g.stemMat.opacity = solid;
    g.turquoise.opacity = (0.10 + 0.62 * eased) * (1 + boost * 0.25);
    g.graphite.emissiveIntensity = (0.02 + 0.10 * eased) * (1 + boost * 0.6);
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
      e.trails.forEach((tr, i) => {
        const bt = Math.max(0, tt - 0.05 * (i + 1));
        tr.mesh.visible = true;
        tr.mesh.position.copy(curve.getPointAt(bt));
        tr.mat.opacity = a * (0.34 - i * 0.14);
      });
      if (e.t >= 1) {
        e.active = false;
        e.mesh.visible = false;
        e.trails.forEach((tr) => { tr.mesh.visible = false; });
        this.pulseT = 1;   // llegada -> destello minimo de la bacteria
      }
    });
  },

  // Llegada: subida muy pequena de emision, 0.3 s, y vuelta exacta al valor
  // de fabrica. Nada de flashes ni de pulsos violeta.
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
    if (!this.active && d <= this.data.trigger) { this.active = true; this.nextSpawn = time + 140; }
    else if (this.active && d >= this.data.release) this.active = false;

    const dt = Math.min(0.05, Math.max(0.001, (delta || 16) / 1000));
    this.displayT += ((this.active ? 1 : 0) - this.displayT) * 0.075;
    this.setVisibleAmount(this.displayT);
    this.updateParticles(dt, time);
    this.updateBacteriaPulse(dt);
    if (this.label && this.el.sceneEl.camera) {
      this.label.group.lookAt(this.el.sceneEl.camera.getWorldPosition(this.tmp));
    }
  },

  remove() {
    this.bacteriaMats.forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    [this.electrode && this.electrode.group, this.guide && this.guide.group, this.label && this.label.group]
      .forEach((g) => { if (g && g.parent) g.parent.remove(g); });
    this.electrons.forEach((e) => {
      if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
      e.trails.forEach((tr) => { if (tr.mesh.parent) tr.mesh.parent.remove(tr.mesh); });
    });
    if (this.electronGeo) this.electronGeo.dispose();
    if (this.trailGeo) this.trailGeo.dispose();
  }
});

/* ==========================================================================
   SALA 2 -- estacion de control del reactor. Cuatro botones fisicos sobre
   la peana cuadrada ya existente (PEANA_Alta_B, sin usar hasta ahora),
   ninguna geometria/material nuevo en el reactor: solo se reescala, en
   tiempo de ejecucion, la intensidad emisiva real de sus materiales
   (Bioreactor_Bubble, Bioreactor_Liquid) y el foco que exhibit-lighting ya
   crea sobre el -- exactamente el mismo mecanismo de "escalar sobre una
   base guardada" que usa el hover de las bacterias, nunca un valor o color
   inventado. Las burbujas siguen animando siempre (gltf-animations, en
   bucle desde que carga el modulo): lo que cambia con cada boton es cuanto
   se nota esa animacion (opacidad/brillo), no si existe.
   ========================================================================== */
AFRAME.registerComponent('reactor-control', {
  init() {
    this.stage = { light: false, flow: false, nutrients: false, active: false };
    this.buttons = [];        // {id, mesh, material, ring, status, ...}
    this._hoverT = {};        // id -> 0..1, suavizado de hover por boton
    this.reactorLang = this.getReactorLang();
    this.reactorLast = { id: null, on: false };
    this.msgUntil = 0;        // el mensaje de causa-efecto vive 3.8 s y se va
    this.rewardUntil = 0;     // banner SISTEMA ACTIVO, ~2.6 s
    this.wasComplete = false; // ver checkReward(): la recompensa solo salta en la transicion
    this.rewardPulse = 0;
    this.doses = [];          // dosis de nutrientes en curso (ver injectDose)
    this.needsRedraw = false;
    this.nextLangCheck = 0;
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

  /*
    La copia del display vive en museum-i18n.js (window.MUSEUM_I18N.reactorPanel),
    el MISMO sistema ES/EN del resto del museo. REACTOR_CONTROL_I18N queda
    unicamente como red de seguridad por si ese fichero no hubiera cargado:
    no es un segundo sistema de idiomas.
  */
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

  // Mensaje de causa-efecto del ultimo control pulsado. Caduca solo: pasados
  // 3.8 s el display vuelve a mostrar unicamente los estados.
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

    // Materiales reales del reactor (un unico material por nombre: el glTF
    // los comparte entre sus mallas). Se guarda su valor de fabrica como
    // "base": los controles solo escalan esa base, nunca la sustituyen.
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

    // Cotas reales medidas del propio reactor: techo del cristal (donde
    // empieza a verse la dosis de nutrientes) y superficie del cultivo.
    this.glassBox = glassMesh ? new THREE.Box3().setFromObject(glassMesh) : null;
    this.liquidTopY = liquidMesh ? new THREE.Box3().setFromObject(liquidMesh).max.y : null;

    // Burbujas horneadas del GLB (Bioreactor_Bubbles.000-030, en bucle desde
    // que carga el modulo). Su VELOCIDAD real la controla ahora ACTIVIDAD --
    // no FLUJO: burbujas que suben son metabolismo, no circulacion, y asi
    // los dos controles dejan de leerse igual.
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
  /*
    Un canal visual por control, sin solaparse -- esa era la razon de que
    "se pulsara y no se notara nada": tres de los cuatro botones movian el
    mismo brillo.

      01 LUZ        -> iluminacion: foco de exposicion + emision del cultivo.
                       Apagado NO es negro, es una interior neutra, para que
                       ON/OFF/ON se reconozcan los dos estados.
      02 FLUJO      -> circulacion: puntos turquesa girando en horizontal
                       dentro del volumen del liquido. Ni burbujas ni brillo.
      03 NUTRIENTES -> dosis: cada pulsacion mete una tanda de gotas que
                       entran por la tapa, caen al cultivo y se dispersan.
                       Ademas el nivel del liquido sube mientras esta activo.
      04 ACTIVIDAD  -> burbujas: unico canal que enciende las burbujas reales
                       del GLB (opacidad + velocidad de su animacion) y las
                       burbujas propias que nacen abajo y suben. No enciende
                       ninguna luz.
  */
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

    // Cristal exterior: comunica que la pieza es seleccionable (hover) y
    // acompana el pulso de la recompensa. Nunca un contorno duro.
    if (this.glassMat) {
      const accent = this._room2AccentColor || (this._room2AccentColor = new THREE.Color(ROOM2_ACCENT));
      const glowMix = Math.min(1, this.hoverGlow * 0.42 + reward * 0.30);
      this.glassMat.emissive.copy(this.glassBaseEmissive).lerp(accent, glowMix);
      this.glassMat.emissiveIntensity = this.glassBaseEmissiveIntensity + this.hoverGlow * 0.55 + reward * 0.35;
    }
  },

  /*
    02 FLUJO -- circulacion. Los puntos recorren orbitas HORIZONTALES a
    cuatro alturas dentro del volumen real del cultivo y todas giran a la
    vez: se lee como liquido que se mueve, nunca como burbujas subiendo.
  */
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
    // el turquesa puro se fundia con el propio liquido: se aclara para que
    // los trazos se lean de verdad a distancia de visita.
    const color = new THREE.Color(0x8df7ef);
    const RINGS = 4, PER = 5;
    for (let r = 0; r < RINGS; r++) {
      for (let i = 0; i < PER; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0, depthWrite: false
        });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0125 - (r % 2) * 0.0025, 10, 8), mat);
        group.add(dot);
        this.flowDots.push({
          mesh: dot, mat,
          angle: (i / PER) * Math.PI * 2 + r * 0.5,
          // radio y altura fijos por anillo: la lectura es "gira", no "flota"
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
      // cada punto se estira en su direccion real de avance: en una captura
      // fija ya se lee "esto circula", y nunca se confunde con una burbuja.
      tan.set(-Math.sin(a) * d.dir, 0, Math.cos(a) * d.dir).normalize();
      d.mesh.quaternion.setFromUnitVectors(axis, tan);
      d.mesh.scale.set(3.0, 0.8, 0.8);
      d.mat.opacity += (amount - d.mat.opacity) * 0.10;
      d.mesh.visible = d.mat.opacity > 0.01;
    });
  },

  /*
    03 NUTRIENTES -- dosis. Las gotas NO nacen dentro del cultivo: aparecen
    a la altura real del techo del cristal (medida sobre Bioreactor_Glass),
    bajan por el eje del tubo central hasta la superficie real del liquido,
    entran y se dispersan en abanico mientras se desvanecen. Cada pulsacion
    del control lanza una tanda nueva, aunque el estado ON/OFF se conserve
    para el display.
  */
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

    // crema calido: el blanco frio de las burbujas se perdia sobre el
    // cultivo turquesa, y ademas asi NUTRIENTES no se confunde con ACTIVIDAD.
    const color = new THREE.Color(0xf6e9d2);
    const group = new THREE.Group();
    group.name = 'reactor-nutrient-dose';
    const N = 20;
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), mat);
      dot.visible = false;
      group.add(dot);
      this.nutrientDots.push({ mesh: dot, mat, active: false, t: 0, delay: 0, ax: 0, az: 0, drop: 0 });
    }
    // Radio de entrada: las gotas caen JUNTO al tubo central, nunca dentro.
    // El tubo es metal opaco -- ese era exactamente el motivo de que la dosis
    // no se viera: las particulas estaban escondidas en su interior.
    const tubeR = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
    this.nutrientTravel = {
      cx, cz,
      entryR: tubeR + 0.024,
      entryY: glassTop - 0.012,           // justo bajo la tapa, ya dentro del cristal
      surfaceY: liquidTop,
      depthY: liquidBottom + (liquidTop - liquidBottom) * 0.35
    };
    this.el.sceneEl.object3D.add(group);
    this.nutrientGroup = group;
  },

  // Una dosis = 10 gotas escalonadas. Se lanza en cada clic del control 03.
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
    // mientras NUTRIENTES esta encendido, un goteo lento mantiene viva la
    // lectura sin necesidad de volver a pulsar
    if (this.stage.nutrients && this.now() > (this.nextTrickle || 0)) this.injectDose();

    const tr = this.nutrientTravel;
    const fallH = tr.entryY - tr.surfaceY;
    this.nutrientDots.forEach((d) => {
      if (!d.active) { d.mat.opacity = 0; d.mesh.visible = false; return; }
      if (d.delay > 0) { d.delay -= dt; d.mat.opacity = 0; return; }
      d.t += dt * 0.42 * d.drop;
      if (d.t >= 1) { d.active = false; d.mesh.visible = false; d.mat.opacity = 0; return; }
      const fall = THREE.MathUtils.clamp(d.t / 0.34, 0, 1);      // caida por el tubo
      const spread = THREE.MathUtils.clamp((d.t - 0.34) / 0.66, 0, 1);  // dispersion
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

  /*
    04 ACTIVIDAD -- burbujas propias, con tamanos distintos, que nacen abajo,
    suben y desaparecen al llegar a la superficie. Al apagar el control cada
    burbuja TERMINA su recorrido antes de irse (no se cortan de golpe).
  */
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
    const N = 20;
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
      const size = 0.008 + ((i * 37) % 5) * 0.0035;    // tamanos variados
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
      const fadeOut = Math.min(1, (1 - b.t) / 0.16);   // desaparece en la superficie
      b.mat.opacity = Math.min(fadeIn, fadeOut) * 0.85;
    });
  },
  /*
    Encuentra la cara superior REAL de PEANA_Alta_B agrupando triangulos
    coplanares con normal ascendente. Para una tapa inclinada no sirve
    filtrar por "vertices con Y maxima": eso captura solo el borde alto y
    pierde el plano completo. Aqui se elige la mayor superficie ascendente
    coplanar de la peana, se mide su normal y su huella dentro del propio
    plano, y el panel se apoya ahi.
  */
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

    // PCA 2D DENTRO del plano ajustado: la huella real de este remate no es
    // cuadrada (PEANA_Alta_B mide ~0.32 m en su lado corto y ~0.88 m en el
    // largo), asi que ademas de la normal se mide aqui su propio eje largo/
    // corto real -- axisLong/axisShort, ortogonales entre si y a la normal,
    // con su extension real (extentLong/extentShort) -- para que
    // buildControlStand pueda ensanchar el panel por el eje que de verdad
    // tiene sitio, en vez de adivinar la orientacion con un heuristico
    // generico. Se proyecta cada punto de la "tapa" (top[], ya calculado
    // arriba) sobre una base 2D cualquiera del plano (uAxis/vAxis) y se
    // diagonaliza su matriz de covarianza 2x2 (forma cerrada, sin libreria).
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
    const lambda1 = trace / 2 + disc;   // autovalor mayor -> direccion del eje largo
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
    const onColor = '#4FE4DC';        // turquesa del museo para ON
    const offColor = 'rgba(200, 212, 210, 0.30)';
    const ink = '#F7FCFA';
    const muted = '#9FB2B0';
    const line = 'rgba(90, 153, 148, 0.32)';
    const padX = WPX * 0.048;

    // marco; cuando se completa el sistema respira en turquesa
    const pulse = rewarding ? (0.55 + 0.45 * Math.sin(this.now() / 150)) : 0;
    ctx.strokeStyle = complete
      ? `rgba(79, 228, 220, ${0.45 + pulse * 0.5})`
      : 'rgba(90, 153, 148, 0.55)';
    ctx.lineWidth = complete ? 6 : 3;
    ctx.strokeRect(padX * 0.55, HPX * 0.055, WPX - padX * 1.10, HPX * 0.885);

    // ------------------------------------------------ cabecera
    const headY = HPX * 0.115;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentLight;
    ctx.font = '800 44px Arial, Helvetica, sans-serif';
    ctx.fillText('02', padX, headY);
    ctx.fillStyle = ink;
    ctx.font = '900 62px Arial, Helvetica, sans-serif';
    ctx.fillText(copy.title, padX + 96, headY);

    // contador n / 4 -- hace evidente que se esta construyendo un estado
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

    // ------------------------------------------------ columnas de estado
    const cols = defs.length;
    const usableW = WPX - padX * 2;
    const colW = usableW / cols;
    const chipY = HPX * 0.248;
    const buttonY = HPX * 0.49;      // coincide con el boton fisico real
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

      // chip ON/OFF: turquesa encendido, gris muy tenue apagado
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

      // aro que rodea al boton fisico
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

    // ------------------------------------------------ franja inferior
    const stripY = HPX * 0.775, stripH = HPX * 0.155;
    ctx.fillStyle = rewarding ? 'rgba(79, 228, 220, 0.16)' : 'rgba(247, 252, 250, 0.06)';
    ctx.fillRect(padX, stripY, WPX - padX * 2, stripH);
    ctx.fillStyle = rewarding ? onColor : accentLight;
    ctx.fillRect(padX, stripY, 10, stripH);
    ctx.textAlign = 'left';
    if (rewarding) {
      ctx.fillStyle = onColor;
      ctx.font = '900 44px Arial, Helvetica, sans-serif';
      ctx.fillText(copy.systemActive, padX + 34, stripY + stripH * 0.34);
      ctx.fillStyle = ink;
      ctx.font = '800 34px Arial, Helvetica, sans-serif';
      ctx.fillText(copy.systemActiveText, padX + 34, stripY + stripH * 0.74);
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

  /*
    Estacion de control: una unica placa (misma familia visual que las
    cartelas del resto del museo -- papel, sin cristal, sin resplandor
    permanente), apoyada PLANA sobre el remate real de PEANA_Alta_B (no de
    pie a su lado como antes). computeTopSurface() mide la inclinacion real
    de ese remate y el panel se orienta exactamente con ella: su eje Z local
    (la cara con texto/botones) queda alineado con la normal real medida,
    su centro coincide con el centro real de esa superficie, y su eje
    "arriba" es la proyeccion sobre ese mismo plano de la direccion generica
    hacia el punto de partida del visitante (para que el texto quede leible
    de frente, en el angulo real de la piedra, no vertical).
  */
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
      // red de seguridad si la malla no trae geometria legible: se apoya
      // sobre el techo recto del Box3, normal vertical.
      const box = new THREE.Box3().setFromObject(standObj);
      origin = box.getCenter(new THREE.Vector3());
      origin.y = box.max.y;
      zAxis = new THREE.Vector3(0, 1, 0);
    }

    // direccion generica "hacia el punto de partida del visitante": antes
    // decidia DIRECTAMENTE cual eje del panel era "ancho" y cual "alto"
    // (proyectandola sobre el plano), lo que podia emparejar el ancho del
    // panel con el lado CORTO real del remate (~0.32 m de PEANA_Alta_B,
    // frente a ~0.88 m del lado largo) -- de ahi que quedara "de lado",
    // sobresaliendo por los bordes y sin apoyo completo. Ahora solo se usa
    // para fijar el SIGNO del eje corto (para que el texto quede del
    // derecho, mirando al visitante); que eje es "ancho" y cual es "alto"
    // lo decide la geometria real medida (top.axisLong/axisShort, PCA en
    // computeTopSurface), nunca este heuristico.
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
      // red de seguridad si por lo que sea no hubo PCA (mesh sin geometria
      // legible en computeTopSurface): mismo comportamiento generico de
      // siempre, proyectando "hacia el visitante" sobre el plano.
      yAxis = towardVisitor.clone();
      yAxis.addScaledVector(zAxis, -yAxis.dot(zAxis));
      if (yAxis.lengthSq() < 1e-6) yAxis.set(0, 1, 0).addScaledVector(zAxis, -zAxis.y);
    }
    yAxis.normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    yAxis.crossVectors(zAxis, xAxis).normalize();

    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    const STANDOFF = 0.002;   // separacion minima para evitar z-fighting, pegado a la tapa
    const pos = origin.clone().addScaledVector(zAxis, STANDOFF);

    const wrapper = document.createElement('a-entity');
    wrapper.object3D.position.copy(pos);
    wrapper.object3D.quaternion.copy(quat);

    // El panel necesita leerse desde la camara en perspectiva: se aprovecha
    // mucha mas tapa real que antes, manteniendo margen para no salirse del
    // remate inclinado de la peana.
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
    // el panel de fondo no es "una pieza": no abre nada ni se registra en
    // selectableMeshes, solo los 4 botones son interactivos.

    const BUTTON_Z = 0.014;

    const spacing = Math.min(WIDTH * 0.23, (WIDTH * 0.84) / (defs.length - 1));
    const startX = -spacing * (defs.length - 1) / 2;
    const BTN_R = Math.min(HEIGHT * 0.105, WIDTH * 0.043);
    const BTN_DEPTH = HEIGHT * 0.055;
    const BTN_Y = HEIGHT * 0.01;
    // (el indicador fisico sobre cada boton se retiro: ver mas abajo)

    defs.forEach((d, i) => {
      const bx = startX + i * spacing;
      // Los 4 botones son ahora interruptores independientes (ver
      // onButtonClick): ACTIVATE ya no esta bloqueado hasta que los otros
      // tres esten encendidos, asi que ya no lleva el aspecto "apagado/
      // deshabilitado" (gris oscuro, brillo minimo) que tenia antes -- los
      // 4 arrancan con el mismo aspecto neutro.
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
      btn.userData.museoExhibitId = `reactorBtn_${d.id}`;   // para el hover (setHover)
      btn.userData.museoAction = () => this.onButtonClick(d.id);
      wrapper.object3D.add(btn);
      if (exhibitInfo) exhibitInfo.selectableMeshes.push(btn);

      // El indicador fisico (plano fino sobre el boton) se ha retirado: ocupaba
      // exactamente la banda donde ahora va el chip ON/OFF impreso del display,
      // que dice mucho mas con el mismo espacio.

      this.buttons.push({
        id: d.id, mesh: btn, material, ring, ringMaterial,
        offColor: d.off, onColor: d.on, upZ, downZ, pressT: 0,
        baseEmissive: material.emissiveIntensity
      });
      this._hoverT[d.id] = 0;
    });

    // igual que las cartelas de peana/ventana: se cuelga directamente del
    // escenario (sin escala), asi que pos/quat -- ya en espacio de mundo,
    // medidos sobre la peana ya reescalada -- no se vuelven a reescalar por
    // error al colgarlo bajo #modelo (que si tiene escala).
    this.el.sceneEl.appendChild(wrapper);
    this.wrapper = wrapper;
  },

  /*
    Los 4 botones (LIGHT / FLOW / NUTRIENTS / ACTIVATE) son interruptores
    independientes: cada clic invierte SU PROPIO estado, en cualquier orden,
    sin bloqueos entre ellos. Antes solo podian encenderse (nunca apagarse)
    y ACTIVATE quedaba ademas bloqueado hasta que los otros tres estuvieran
    ya activos -- el brief pide justo lo contrario ("each button must toggle
    ON and OFF; clicking again must deactivate that state").
  */
  /*
    Los cuatro controles son interruptores independientes: cada clic invierte
    su propio estado, en cualquier orden, sin bloqueos. NUTRIENTES ademas
    funciona como ACCION -- cada pulsacion lanza una dosis visible.
  */
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

  /*
    La recompensa SISTEMA ACTIVO solo se dispara en la transicion de un
    estado incompleto a los cuatro activos (wasComplete). Si el visitante
    apaga un control el display vuelve a la normalidad, y al volver a
    completar los cuatro puede reproducirse otra vez. Nunca por frame.

    No es un protocolo cientifico: es una mecanica museografica para animar
    a explorar los cuatro elementos, y el orden es indiferente.
  */
  checkReward() {
    const complete = this.activeCount() === 4;
    if (complete && !this.wasComplete) {
      this.rewardUntil = this.now() + 2600;
      this.rewardPulse = 1;
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
    const speed = 1 - Math.pow(0.004, dt);   // ~0.5 s, la transicion que pide el guion

    const info = this.el.components['exhibit-info'];
    const hoverId = info && info.hoverId;
    this.hoverGlow += ((hoverId === 'reactor01' ? 1 : 0) - this.hoverGlow) * 0.12;

    // pulso de la recompensa (solo mientras dura el banner)
    const rewarding = this.now() < this.rewardUntil;
    const rewardTarget = rewarding ? (0.55 + 0.45 * Math.sin(this.now() / 150)) : 0;
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

    // el display se redibuja mientras dura la recompensa (late) y una vez
    // mas cuando caduca el mensaje de causa-efecto, para que vuelva solo a
    // mostrar los estados.
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

    // botones: hover minimo, hundido cuando estan ON y microrespuesta de
    // ~180 ms al recibir el clic o el tap (pressT).
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

/*
  Tres acentos puntuales, sin sombra, tomados de la version antigua del
  proyecto -- son luces reales (THREE.PointLight), no un cambio de
  material, asi que no tocan el color/emisivo de ningun objeto. Dan
  movimiento muy sutil (pulso lento) a la sala sin coste de un mapa de
  sombras adicional: la directional sigue siendo la unica fuente de sombra
  real.
*/
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
    this.spotsByAnchor = {};   // expuesto para reactor-control (foco del reactor)
    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.object3D;

    // Exactamente dos focos de exposicion, anchos y suaves (no simulacion de
    // neon, no relleno adicional): uno sobre la bacteria grande, calido y
    // neutro, con caida suave sobre el muro cercano; otro sobre el reactor,
    // neutro-frio, que conserva el turquesa del liquido y separa la pieza
    // del fondo. Angulo abierto (0.95 rad ~ 54 grados) y penumbra al maximo
    // para que se lea como un lavado amplio, no como un foco puntual.
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
      raiz.worldToLocal(c);                       // el rig del modelo esta reescalado

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

/* Attach debug logging to gltf-model entities */
AFRAME.scenes[0]?.addEventListener('loaded', () => {
  document.querySelectorAll('[gltf-model]').forEach((el) => {
    el.setAttribute('log-when-loaded', '');
  });
});

/*
  Bucle robusto de los videos circulares. `loop` en el propio <video>
  ya deberia bastar, pero se reafirma por si el navegador ignora el
  autoplay inicial (tipico si la pestaña no tenia foco) o si la textura de
  video de three.js se queda parada en el ultimo frame: se relanza al
  terminar y, si el primer intento de reproduccion es bloqueado, se
  reintenta en cuanto haya cualquier primer gesto del visitante (click,
  toque o tecla) -- el video sigue muted, asi que esos reintentos no
  chocan con las politicas de autoplay de ningun navegador.
*/
(function () {
  const videos = Array.from(document.querySelectorAll('video[id^="ppb-video-"]'));
  if (!videos.length) return;
  videos.forEach((video) => {
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
  });

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

/* ---------- Loading screen ---------- */
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

/* ---------- Controls help bar: fade to a low opacity after a few seconds ---------- */
(function () {
  const bar = document.getElementById('controls-help');
  if (!bar) return;
  setTimeout(() => bar.classList.add('faded'), 6000);
})();

/* ==========================================================================
   RUBRIVIVAX GELATINOSUS -- demostracion CO -> bacteria -> H2.

   El documento fuente lo resume asi: el monoxido de carbono es toxico para
   muchos organismos, pero R. gelatinosus puede oxidarlo en anaerobiosis y ese
   metabolismo puede ir ligado a la produccion de hidrogeno. Esta capa lo
   enseña en tres tiempos, sin añadir ni una afirmacion nueva:

        CO  ->  [RUBRIVIVAX]  ->  H2

   Toda la geometria se mide en tiempo de ejecucion sobre las piezas reales
   (la bacteria, su campana de cristal, su base y su peana), como en el resto
   de microinstalaciones: no hay coordenadas escritas a mano.

   Medido: el cuerpo de la bacteria ocupa casi todo el diametro interior de la
   campana (deja ~1.7 cm por lado), asi que el CO no cabe "dentro" de la
   vitrina como pieza aparte. Entra por el lado izquierdo del visitante,
   cruzando el cristal, y el H2 sale por el extremo opuesto de la propia
   bacteria y sube: dos comportamientos distintos que no pueden confundirse.
   ========================================================================== */
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
    this.displayT = 0;
    this.retry = 0;
    this.burstUntil = 0;
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
    // derecha del visitante (mira hacia -front) y, por tanto, su izquierda
    const right = new THREE.Vector3(front.z, 0, -front.x).normalize();
    const left = right.clone().negate();

    // El CO llega por la izquierda del visitante y el H2 sale por la derecha:
    // se lee de izquierda a derecha, como el propio rotulo CO -> H2.
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
    this.wireClick(info);

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

  // Refuerzo direccional: una linea finisima y una punta minuscula, para que
  // incluso en una captura fija se entienda de donde viene el CO.
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

  /*
    CO: moleculas etiquetadas, calidas, que avanzan en horizontal hacia la
    bacteria y se apagan al entrar. Nunca suben.
  */
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

  /*
    H2: burbujas mas pequeñas, frias, sin etiqueta, que nacen en el extremo
    opuesto de la bacteria, suben un poco y se desvanecen. Comportamiento
    deliberadamente distinto del CO para que no puedan leerse como lo mismo.
  */
  buildH2() {
    const scene = this.el.sceneEl.object3D;
    const geo = new THREE.SphereGeometry(0.005, 10, 8);
    this.h2Geo = geo;
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd6f6ff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.h2.push({ mesh, mat, active: false, t: 0, speed: 0.5, sway: 0, dx: 0, dz: 0 });
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
    // por encima de la campana y muy por debajo de la imagen circular
    // justo por encima de la bacteria y del punto de entrada del CO: a la
    // altura de la campana quedaba flotando lejos, sin relacion con la vitrina
    group.position.set(this.coStart.x, Math.min(this.bellTop - 0.030, this.center.y + 0.115), this.coStart.z);
    this.el.sceneEl.object3D.add(group);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.170, 0.046), mat));
    this.label = { group, mat };
  },

  /*
    Solo la MALLA DE LA BACTERIA lanza la secuencia. La placa curva de la
    peana ("PULSA PARA EXPLORAR") queda intacta y sigue siendo la que abre la
    ficha cientifica, como en todas las piezas del museo.

    Probado: si el tap sobre la bacteria abria tambien la ficha, el panel
    tapaba justo la mitad donde ocurre la demostracion -- el visitante lanzaba
    la interaccion y no podia verla. La placa se distingue porque no tiene
    nombre (la crea createPedestalPlacard en tiempo de ejecucion, no viene del
    glTF); las mallas de la bacteria si lo tienen.
  */
  wireClick(info) {
    (info.selectableMeshes || []).forEach((m) => {
      if (!m.userData || m.userData.museoExhibitId !== this.data.target) return;
      if (!m.name || m.userData.museoAction) return;
      m.userData.museoAction = () => this.burst();
      this._wired.push(m);
    });
  },

  now() { return (window.performance && performance.now) ? performance.now() : Date.now(); },

  burst() {
    this.active = true;
    this.burstUntil = this.now() + 3500;
    this.spawnCO(true);
  },

  spawnCO(force) {
    if (!this.ready || (!this.active && !force)) return;
    const p = this.co.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.t = 0;
    p.speed = 1 / THREE.MathUtils.randFloat(2.6, 3.6);
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
    const boosting = this.now() < this.burstUntil;
    if (this.guide) {
      this.guide.group.visible = eased > 0.01;
      this.guide.mat.opacity = (0.04 + 0.22 * eased) * (boosting ? 1.5 : 1);
    }
    if (this.label) {
      this.label.group.visible = eased > 0.03;
      this.label.mat.opacity = 0.94 * Math.max(0, (eased - 0.03) / 0.97);
    }
  },

  updateCO(dt, time) {
    const boosting = this.now() < this.burstUntil;
    if (this.active && time >= this.nextCO) {
      this.spawnCO(false);
      this.nextCO = time + (boosting ? THREE.MathUtils.randFloat(280, 380) : THREE.MathUtils.randFloat(950, 1350));
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
        this.pulseT = 1;                                   // pulso minimo de la bacteria
        this.pendingH2.push(this.now() + 250);             // el H2 sale un instante despues
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
      if (p.t >= 1) { p.active = false; p.mesh.visible = false; p.mat.opacity = 0; return; }
      const rise = this.h2Rise * p.t;
      const wob = Math.sin(p.t * 6.5) * p.sway;
      p.mesh.position.set(
        this.h2Origin.x + p.dx * (0.006 + p.t * 0.014) + wob * 0.4,
        this.h2Origin.y + rise,
        this.h2Origin.z + p.dz * (0.006 + p.t * 0.014)
      );
      p.mesh.scale.setScalar(1 + p.t * 0.45);              // la burbuja crece al subir
      const fadeIn = Math.min(1, p.t / 0.14);
      const fadeOut = Math.min(1, (1 - p.t) / 0.34);
      p.mat.opacity = 0.9 * this.displayT * Math.min(fadeIn, fadeOut);
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
    const boosting = this.now() < this.burstUntil;
    if (!this.active && d <= this.data.trigger) { this.active = true; this.nextCO = time + 200; }
    else if (this.active && !boosting && d >= this.data.release) this.active = false;

    // El descubrimiento SOLO se concede al terminar la secuencia intensa que
    // el visitante ha lanzado con su click/tap: acercarse no desbloquea nada.
    if (this.burstUntil && !boosting) {
      this.burstUntil = 0;
      if (window.unlockCapability) window.unlockCapability(this.data.capability);
    }

    const dt = Math.min(0.05, Math.max(0.001, (delta || 16) / 1000));
    this.displayT += ((this.active ? 1 : 0) - this.displayT) * 0.07;
    this.setVisibleAmount(this.displayT);
    this.updateCO(dt, time);
    this.updateH2(dt);
    this.updatePulse(dt);

    const cam = this.el.sceneEl.camera;
    if (cam) {
      const cw = cam.getWorldPosition(this.tmp);
      if (this.label) this.label.group.lookAt(cw);
      this.co.forEach((x) => { if (x.active) x.tag.lookAt(cw); });
    }
  },

  remove() {
    this.bacteriaMats.forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    this._wired.forEach((m) => { if (m.userData) delete m.userData.museoAction; });
    [this.guide && this.guide.group, this.label && this.label.group].forEach((g) => {
      if (g && g.parent) g.parent.remove(g);
    });
    this.co.concat(this.h2).forEach((x) => { if (x.mesh && x.mesh.parent) x.mesh.parent.remove(x.mesh); });
    if (this.coGeo) this.coGeo.dispose();
    if (this.h2Geo) this.h2Geo.dispose();
  }
});

/* ==========================================================================
   RHODOSPIRILLUM RUBRUM -- acumulacion de PHA.

   El documento fuente dice que R. rubrum puede acumular PHA en forma de
   granulos intracelulares, que actuan como reserva de carbono para la celula.
   Esto lo enseña, y nada mas:

        CARBONO  ->  ACUMULACION  ->  GRANULOS DE PHA

   Nada ocurre por acercarse: solo una microetiqueta muy tenue. La secuencia
   (particulas de carbono entrando + granulos apareciendo de uno en uno) la
   lanza el visitante al pulsar sobre la bacteria, y solo al completarla se
   concede la capacidad.

   Medido en la escena: Bacteria_Mat es OPACO (transparent:false, opacity 1,
   transmission 0), asi que un granulo colocado literalmente dentro del volumen
   no se veria. Cada granulo se coloca por tanto sobre la superficie que mira
   al visitante, ligeramente hundido, de modo que solo asoma su casquete: se
   lee como una inclusion bajo la membrana. No se modifica ningun material del
   GLB de forma permanente (el pulso parte de un valor guardado y se restaura).
   ========================================================================== */
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
    this.seq = -1;            // < 0 = en reposo; si no, segundos desde el click
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

    // Cuerpo celular real (no los pili): es la superficie sobre la que tienen
    // sentido las inclusiones.
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

    // Eje largo real del cuerpo, medido, no supuesto.
    const axes = [
      { v: new THREE.Vector3(1, 0, 0), len: size.x },
      { v: new THREE.Vector3(0, 1, 0), len: size.y },
      { v: new THREE.Vector3(0, 0, 1), len: size.z }
    ].sort((a, b) => b.len - a.len);
    const along = axes[0];
    /*
      De los dos ejes de la seccion, el "A" tiene que ser el que MIRA AL
      VISITANTE, no simplemente el mas largo de los dos. Ordenandolos solo por
      tamaño, en esta pieza (0.310 x 0.327 x 0.721) salia elegido el eje Y y
      los granulos aparecian en el lomo de la celula, donde no se ven desde la
      sala. Se ordena por alineacion con la direccion del visitante.
    */
    const cross = axes.slice(1).sort((a, b) => Math.abs(b.v.dot(front)) - Math.abs(a.v.dot(front)));

    // campana grande de esta pieza (para que nada se salga de ella)
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
    this.axisA = cross[0].v;                 // semiejes de la seccion
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
    this.wireClick(info);

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

  /*
    Punto sobre la superficie del cuerpo que mira al visitante. u recorre el
    eje largo (-1..1) y theta gira alrededor de ese eje; theta cerca de 0
    apunta hacia el lado del visitante. El estrechamiento (taper) evita que un
    granulo quede colgando fuera de los extremos redondeados.
  */
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
      // repartidos a lo largo del eje, ligeramente alternados arriba/abajo
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
    this.carbonGeo = geo;
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xefe0c4, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.carbon.push({ mesh, mat, active: false, t: 0, speed: 0.5, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
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
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.061), mat));
    this.label = { group, mat };
  },

  // Igual que en Rubrivivax: la secuencia la lanza la bacteria, y la placa de
  // la peana sigue abriendo la ficha cientifica sin cambios.
  wireClick(info) {
    (info.selectableMeshes || []).forEach((m) => {
      if (!m.userData || m.userData.museoExhibitId !== this.data.target) return;
      if (!m.name || m.userData.museoAction) return;
      m.userData.museoAction = () => this.start();
      this._wired.push(m);
    });
  },

  start() {
    this.seq = 0;
    this.nextCarbon = 0;
    this.granules.forEach((g) => { g.t = 0; g.mesh.visible = false; g.mat.opacity = 0; g.mesh.scale.setScalar(0.001); });
  },

  spawnCarbon() {
    const p = this.carbon.find((x) => !x.active);
    if (!p) return;
    // nace en una esfera alrededor de la celula, siempre dentro de la campana
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
  },

  updateCarbon(dt) {
    // Fase 1 de la secuencia: el carbono entra durante los ~2 primeros
    // segundos; despues deja de aparecer y solo terminan los que van de camino.
    if (this.seq >= 0 && this.seq < 2.0 && this.seq >= this.nextCarbon) {
      this.spawnCarbon();
      this.nextCarbon = this.seq + THREE.MathUtils.randFloat(0.10, 0.18);
    }
    this.carbon.forEach((p) => {
      if (!p.active) return;
      p.t += p.speed * dt;
      if (p.t >= 1) { p.active = false; p.mesh.visible = false; p.mat.opacity = 0; return; }
      const e = p.t * p.t * (3 - 2 * p.t);
      p.mesh.position.lerpVectors(p.from, p.to, e);
      const fadeIn = Math.min(1, p.t / 0.16);
      const fadeOut = Math.min(1, (1 - p.t) / 0.22);
      p.mat.opacity = 0.92 * Math.min(fadeIn, fadeOut);
    });
  },

  /*
    Fase 2: los granulos aparecen DE UNO EN UNO (1 -> 2 -> 3 ...), cada uno
    creciendo suavemente desde cero. Al terminar el ultimo se concede la
    capacidad. Pasados unos segundos todo vuelve a un estado tranquilo, pero
    el HUD conserva el descubrimiento.
  */
  updateGranules() {
    const START = 1.0, STEP = 0.42, GROW = 0.55, HOLD = 7.4, FADE = 1.6;
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
      if (this.seq > 9.4) this.seq = -1;     // vuelta al reposo
    }
    const running = this.seq >= 0;

    // Acercarse solo enciende la microetiqueta, muy tenue. Nunca desbloquea.
    this.displayT += (((this.near || running) ? 1 : 0) - this.displayT) * 0.07;
    if (this.label) {
      this.label.group.visible = this.displayT > 0.03;
      this.label.mat.opacity = this.displayT * (running ? 0.95 : 0.5);
    }

    this.updateCarbon(dt);
    const done = this.updateGranules();   // en reposo (seq < 0) devuelve 0 y los oculta

    if (running && !this.awarded && done >= this.granules.length) {
      this.awarded = true;
      if (window.unlockCapability) window.unlockCapability(this.data.capability);
    }
    if (!running) this.awarded = false;   // permite repetir la secuencia; el desbloqueo ya no se repite

    const cam = this.el.sceneEl.camera;
    if (cam && this.label) this.label.group.lookAt(cam.getWorldPosition(this.tmp));
  },

  remove() {
    (this.mats || []).forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    this._wired.forEach((m) => { if (m.userData) delete m.userData.museoAction; });
    if (this.label && this.label.group && this.label.group.parent) this.label.group.parent.remove(this.label.group);
    this.granules.concat(this.carbon).forEach((x) => { if (x.mesh && x.mesh.parent) x.mesh.parent.remove(x.mesh); });
    if (this.granuleGeo) this.granuleGeo.dispose();
    if (this.carbonGeo) this.carbonGeo.dispose();
  }
});

/* ==========================================================================
   RHODOPSEUDOMONAS PALUSTRIS -- fotoproduccion de hidrogeno.

   El documento fuente dice que R. palustris es especialmente eficaz
   produciendo hidrogeno mediante fotofermentacion. Esta capa lo enseña de la
   forma mas simple posible, sin inventar ningun protocolo quimico:

        LUZ + CULTIVO  ->  H2

   Al acercarse solo aparece un pequeño indicador H2 apagado, junto a la
   vitrina. Al pulsar, un pulso de luz sobre el cultivo enciende el indicador
   y empiezan a salir burbujas de tamaños distintos que suben despacio, con
   movimiento organico; algunas llevan un H2 minusculo y todas desaparecen
   antes de llegar al techo real de la campana. Pocas a la vez: nunca un
   jacuzzi.

   Geometria medida en tiempo de ejecucion sobre la bacteria, su campana y su
   peana reales -- ninguna coordenada escrita a mano. No se toca el GLB: el
   pulso escala un valor emisivo guardado y remove() lo restaura.
   ========================================================================== */
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
    this.seq = -1;          // < 0 = en reposo; si no, segundos desde el tap
    this.awarded = false;
    this.glow = 0;          // 0..1 del indicador
    this.pulseT = 0;
    this.nextBubble = 0;
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

    // El indicador se apoya en la tapa de la peana, a la derecha del visitante
    // (el lado por el que "sale" el gas). Si por lo que sea no cupiera dentro
    // de la piedra, se prueba el otro lado antes de acercarlo.
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
    this.plateY = center.y - 0.004;                      // a la altura del cultivo
    this.bellTop = bellTop;
    this.riseFrom = center.y + size.y * 0.18;
    this.riseTo = Math.min(bellTop - 0.035, this.riseFrom + 0.145);
    this.spreadX = size.x * 0.30;
    this.spreadZ = size.z * 0.30;

    this.collectMaterials(anchor);
    this.buildIndicator();
    this.buildBubbles();
    this.buildLabel();
    this.wireClick(info);

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

  /*
    Indicador: una placa pequeña sobre un pie minimo, de cara al visitante.
    Apagado es gris muy tenue; durante la produccion se enciende en el cian
    del propio hidrogeno. Nunca compite con la bacteria.
  */
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
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd8f7ff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      // una de cada tres lleva su H2; el resto son solo burbujas
      const tagged = (i % 3 === 0);
      let tag = null, tagMat = null;
      if (tagged) {
        tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        tag = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.014), tagMat);
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
    group.position.set(
      this.indicatorBase.x,
      Math.min(this.bellTop - 0.030, this.center.y + 0.115),
      this.indicatorBase.z
    );
    this.el.sceneEl.object3D.add(group);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.178, 0.045), mat));
    this.label = { group, mat };
  },

  // La secuencia la lanza la bacteria (o el propio indicador). La placa de la
  // peana sigue abriendo la ficha cientifica, sin tocarla.
  wireClick(info) {
    (info.selectableMeshes || []).forEach((m) => {
      if (!m.userData || m.userData.museoExhibitId !== this.data.target) return;
      if (!m.name || m.userData.museoAction) return;
      m.userData.museoAction = () => this.start();
      this._wired.push(m);
    });
  },

  start() {
    this.seq = 0;
    this.pulseT = 1;
    this.nextBubble = 0.30;
  },

  spawnBubble() {
    const b = this.bubbles.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.t = 0;
    b.r = THREE.MathUtils.randFloat(0.0035, 0.0085);      // tamaños distintos
    b.speed = 1 / THREE.MathUtils.randFloat(2.6, 4.2);    // suben despacio
    b.x = this.center.x + THREE.MathUtils.randFloatSpread(this.spreadX * 2);
    b.z = this.center.z + THREE.MathUtils.randFloatSpread(this.spreadZ * 2);
    b.sway = THREE.MathUtils.randFloat(0.003, 0.009);
    b.phase = Math.random() * Math.PI * 2;
    b.mesh.visible = true;
    b.mat.opacity = 0;
    if (b.tag) { b.tag.visible = true; b.tagMat.opacity = 0; }
  },

  updateBubbles(dt, secs) {
    // Solo salen mientras dura la secuencia; las que ya van subiendo terminan
    // su recorrido aunque la secuencia acabe (nada se corta de golpe).
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
      // movimiento organico: deriva lenta en dos ejes, no una linea recta
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
      if (this.seq > 6.4) this.seq = -1;      // vuelta al reposo
    }
    const running = this.seq >= 0;

    // Acercarse solo hace aparecer el indicador APAGADO y la etiqueta tenue.
    this.displayT += (((this.near || running) ? 1 : 0) - this.displayT) * 0.07;
    // El indicador se enciende con la produccion y se apaga al terminar.
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

    this.updateBubbles(dt, (time || 0) / 1000);
    this.updatePulse(dt);

    // Solo el tap concede la capacidad, y solo al completarse la secuencia.
    if (running && !this.awarded && this.seq >= 4.0) {
      this.awarded = true;
      if (window.unlockCapability) window.unlockCapability(this.data.capability);
    }
    if (!running) this.awarded = false;

    const cam = this.el.sceneEl.camera;
    if (cam) {
      const cw = cam.getWorldPosition(this.tmp);
      if (this.label) this.label.group.lookAt(cw);
      this.bubbles.forEach((b) => { if (b.tag && b.active) b.tag.lookAt(cw); });
    }
  },

  remove() {
    (this.mats || []).forEach(({ mat, base }) => { mat.emissiveIntensity = base; });
    this._wired.forEach((m) => { if (m.userData) delete m.userData.museoAction; });
    [this.indicator && this.indicator.group, this.label && this.label.group].forEach((g) => {
      if (g && g.parent) g.parent.remove(g);
    });
    this.bubbles.forEach((b) => {
      if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
      if (b.tag && b.tag.parent) b.tag.parent.remove(b.tag);
    });
    if (this.bubbleGeo) this.bubbleGeo.dispose();
  }
});
