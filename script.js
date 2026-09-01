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
    const end = () => {
      this.dragging = false;
      canvas.style.cursor = 'grab';
      // Mismo gesto (mousedown/touchstart -> mouseup/touchend) que el drag-look,
      // pero si el puntero apenas se movio se interpreta como click/tap sobre
      // una pieza en vez de arrastre de camara -- ver CLICK_MAX_MOVE_PX arriba.
      const moved = Math.hypot(this.lastX - this.downX, this.lastY - this.downY);
      if (moved < CLICK_MAX_MOVE_PX) this.trySelect(this.lastX, this.lastY);
    };

    this.onMouseDown = (e) => { if (e.button === 0) start(e.clientX, e.clientY); };
    this.onMouseMove = (e) => move(e.clientX, e.clientY);
    this.onMouseUp = () => end();

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
      if (this._touchId !== null) return;   // ya hay un toque de "mirar" en curso
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
      if (this._touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._touchId) { this._touchId = null; end(); break; }
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
  trySelect(x, y) {
    const sceneEl = this.el.sceneEl;
    const canvas = sceneEl && sceneEl.canvas;
    const modelo = document.querySelector('#modelo');
    const info = modelo && modelo.components && modelo.components['exhibit-info'];
    if (!canvas || !info || !info.selectableMeshes || !info.selectableMeshes.length) return;

    const rect = canvas.getBoundingClientRect();
    if (!this._ndc) this._ndc = new THREE.Vector2();
    this._ndc.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
    const camera = sceneEl.camera;
    if (!camera) return;
    if (!this._raycaster) this._raycaster = new THREE.Raycaster();
    this._raycaster.setFromCamera(this._ndc, camera);
    const hits = this._raycaster.intersectObjects(info.selectableMeshes, false);
    if (!hits.length) return;
    // Los controles del reactor (Sala 2) no abren ficha: llevan su propia
    // accion (museoAction) en vez de museoExhibitId, y se comprueban primero.
    const action = hits[0].object.userData.museoAction;
    if (action) { action(); return; }
    const id = hits[0].object.userData.museoExhibitId;
    if (id) info.open(id);
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
    images: ['./assets/images/rhodomicrobium-budding.jpg'],
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
  'PHA'
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
      it.data.section || '', (it.data.title || '').toUpperCase(), 'CLICK TO EXPLORE',
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
      it.data.section || '', (it.data.title || '').toUpperCase(), 'CLICK TO EXPLORE',
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
    // imagenes de apoyo opcionales (museumContent[id].images = ['./ruta.jpg', ...]);
    // vacio por defecto, no se muestra nada si la pieza no las trae -- nunca
    // la imagen del circulo/nicho, que es un contenido aparte.
    const imagesEl = this.panel.querySelector('.panel-images');
    if (imagesEl) {
      imagesEl.innerHTML = '';
      (d.images || []).forEach((src) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = d.title || '';
        imagesEl.appendChild(img);
      });
    }
    const tags = this.panel.querySelector('.panel-tags');
    tags.textContent = (d.tags || []).join(' · ');
    tags.style.display = (d.tags && d.tags.length) ? 'block' : 'none';
    this.panel.classList.toggle('secondary', d.tier === 'secondary' || d.tier === 'tertiary');
    // Sala 2 (reactor/ventanas) usa el acento verde/turquesa del propio
    // sistema de color de esa sala, no el morado de la Sala 1 -- misma
    // ficha compartida, solo cambia --mus-morado (ver style.css).
    this.panel.classList.toggle('room2', id.startsWith('reactor') || id.startsWith('window'));
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
    this.buttons = [];        // {id, mesh, material, locked, baseEmissive}
    this._hoverT = {};        // id -> 0..1, suavizado de hover por boton
    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },

  onLoaded() {
    const mesh = this.el.object3D;

    // Materiales reales del reactor. Un unico material por nombre (glTF los
    // comparte entre sus mallas), asi que basta con encontrar cada uno una
    // vez y guardar su intensidad/opacidad de fabrica como "base": los
    // botones solo escalan esa base, nunca la sustituyen.
    let bubbleMat = null, liquidMat = null, liquidMesh = null, glassMat = null;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.material.name === 'Bioreactor_Bubble' && !bubbleMat) bubbleMat = o.material;
      if (o.material.name === 'Bioreactor_Liquid' && !liquidMat) { liquidMat = o.material; liquidMesh = o; }
      // "Vidrio" es el material del cristal exterior del reactor (Bioreactor_
      // Glass): sin emisivo propio en el glTF (solo transparencia), asi que
      // sirve de superficie neutra sobre la que pintar el realce de hover
      // (ver hoverGlow en tick) sin depender de que LIGHT/FLOW ya esten
      // encendidos -- el reactor debe notarse seleccionable incluso apagado.
      if (o.material.name === 'Vidrio' && !glassMat) glassMat = o.material;
    });
    this.bubbleMat = bubbleMat;
    this.liquidMat = liquidMat;
    this.glassMat = glassMat;
    this.bubbleBase = bubbleMat ? { i: bubbleMat.emissiveIntensity, o: bubbleMat.opacity } : null;
    this.liquidBase = liquidMat ? { i: liquidMat.emissiveIntensity, o: liquidMat.opacity } : null;
    this.liquidMesh = liquidMesh;
    this.captureLiquidLevel(liquidMesh);
    // base real del cristal (casi siempre negro/sin emisivo de fabrica) --
    // el realce de hover se mezcla hacia el acento de Sala 2 partiendo de
    // este valor, nunca sustituyendolo.
    this.glassBaseEmissive = glassMat && glassMat.emissive ? glassMat.emissive.clone() : new THREE.Color(0, 0, 0);
    this.glassBaseEmissiveIntensity = (glassMat && typeof glassMat.emissiveIntensity === 'number') ? glassMat.emissiveIntensity : 1;
    this.hoverGlow = 0;   // 0..1, suavizado -- ver tick()
    this.activePulseAmt = 0;   // 0..1, entra/sale con ACTIVATE -- ver tick()
    this.activePulse = 0;      // 0..1, activePulseAmt * oscilacion senoidal -- ver tick()
    // altura real de la superficie del cultivo (malla Bioreactor_Liquid_Obj),
    // punto de llegada de las gotas de NUTRIENTS -- ver buildNutrientParticles.
    this.liquidTopY = liquidMesh ? new THREE.Box3().setFromObject(liquidMesh).max.y : null;

    // 02 FLOW necesita un efecto "legible a distancia normal", no solo un
    // cambio de brillo/opacidad de las burbujas (que a distancia se nota
    // poco). Las burbujas ya llevan una animacion horneada en el propio GLB
    // (Bioreactor_Bubbles.000-030, reproducida en bucle por gltf-animations
    // sobre el modulo del bioreactor) -- FLOW controla directamente la
    // VELOCIDAD real de esa animacion (AnimationMixer.timeScale), asi que
    // encender FLOW hace que la circulacion se vea moverse de verdad, y
    // apagarlo la detiene, en vez de solo atenuar su brillo.
    const bioreactorEl = this.el.querySelector('[gltf-model="#bioreactor"]');
    this.bioreactorAnim = bioreactorEl && bioreactorEl.components && bioreactorEl.components['gltf-animations'];

    // Foco de exposicion que exhibit-lighting ya crea sobre PEANA_Bioreactor.
    const lightingComp = this.el.components['exhibit-lighting'];
    this.reactorSpot = lightingComp && lightingComp.spotsByAnchor && lightingComp.spotsByAnchor['PEANA_Bioreactor'];
    this.spotBase = (this.reactorSpot && this.reactorSpot.userData.baseIntensity) || 2.4;

    // valores actuales (se interpolan en tick hacia this.target*)
    this.curSpot = this.spotBase;
    this.curBubbleI = this.bubbleBase ? this.bubbleBase.i : 0;
    this.curBubbleO = this.bubbleBase ? this.bubbleBase.o : 0;
    this.curLiquidI = this.liquidBase ? this.liquidBase.i : 0;
    this.curFlowSpeed = 0;
    this.curNutrientLevel = 0;
    this.recomputeTargets();
    // arranca ya en el estado 0 (inactivo), sin animar desde el valor de fabrica
    this.curSpot = this.targetSpot;
    this.curBubbleI = this.targetBubbleI;
    this.curBubbleO = this.targetBubbleO;
    this.curLiquidI = this.targetLiquidI;
    this.curFlowSpeed = this.targetFlowSpeed;
    this.applyReactorState();

    this.buildNutrientParticles(mesh);
    this.buildActivityBubbles(mesh);
    this.buildControlStand();
    console.log('[reactor-control] listo -- estado 0 (reactor inactivo)');
  },

  /*
    Estado 0..1 de cada variable, a partir de que botones estan activados.
    Cada boton tiene ahora su PROPIO canal visual, sin compartir variable
    con ningun otro (antes NUTRIENTS subia el mismo brillo del liquido que
    LIGHT, y no se notaba como un efecto distinto):
      01 LIGHT      -> foco de exposicion + brillo emisivo del liquido
                       (iluminacion, tanto de la sala como del cultivo)
      02 FLOW       -> intensidad/opacidad de las burbujas (la animacion de
                       circulacion ya esta horneada y corre siempre; FLOW la
                       hace notoria en vez de crearla)
      03 NUTRIENTS  -> canal totalmente aparte, sin material: ver
                       buildNutrientParticles/updateNutrientParticles
                       (gotas visibles bajando por el tubo real del reactor)
      04 ACTIVATE   -> ya no es un multiplicador (*1.12) sobre valores que,
                       con LIGHT/FLOW apagados, ya eran muy bajos -- eso es lo
                       que hacia que "no se notara nada" al pulsarlo solo.
                       Ahora ACTIVATE aporta su PROPIO incremento aditivo en
                       los tres canales (igual que LIGHT/FLOW aportan el
                       suyo), asi que se nota encendido incluso el solo, y
                       ademas anade un pulso ritmico propio (ver activePulse
                       en tick/applyReactorState) que es la señal mas clara
                       de "actividad biologica" y no se puede confundir con
                       ningun otro boton (ni LIGHT, ni FLOW, ni NUTRIENTS son
                       pulsantes).
  */
  recomputeTargets() {
    const s = this.stage;
    const activeMult = s.active ? 1.15 : 1;

    const spotFrac = 0.34 + (s.light ? 0.54 : 0);
    this.targetSpot = this.spotBase * spotFrac;

    const liquidIFrac = 0.22 + (s.light ? 0.56 : 0) + (s.active ? 0.24 : 0);
    this.targetLiquidI = this.liquidBase ? this.liquidBase.i * liquidIFrac * activeMult : 0;

    const bubbleIFrac = 0.16 + (s.flow ? 0.68 : 0) + (s.active ? 0.34 : 0);
    const bubbleOFrac = 0.36 + (s.flow ? 0.48 : 0) + (s.active ? 0.30 : 0);
    this.targetBubbleI = this.bubbleBase ? this.bubbleBase.i * bubbleIFrac * activeMult : 0;
    this.targetBubbleO = this.bubbleBase ? Math.min(1, this.bubbleBase.o * bubbleOFrac) : 0;

    // Velocidad real de la circulacion (ver bioreactorAnim en onLoaded):
    // sigue dependiendo solo de FLOW -- si ACTIVATE por si solo tambien
    // pusiera en marcha la animacion, dejaria de poder distinguirse de
    // FLOW. ACTIVATE unicamente la refuerza un poco cuando FLOW ya esta on.
    this.targetFlowSpeed = s.flow ? (1 * (s.active ? 1.3 : 1)) : 0;
    this.targetNutrientLevel = s.nutrients ? 1 : 0;
  },

  applyReactorState() {
    // Realce sutil de hover (ver tick()): un empujon MUY modesto sobre las
    // dos superficies que ya brillan (liquido/burbujas), independiente del
    // estado de los botones -- se nota un pelin mas vivo el reactor cuando
    // el visitante pasa el raton por encima, sin competir con el efecto de
    // los botones ni resultar exagerado.
    const hoverBoost = 1 + this.hoverGlow * 0.18;
    // Pulso de ACTIVATE (ver tick(): this.activePulse, 0..1, ya con su propio
    // fundido de entrada/salida y oscilacion senoidal): un "latido" lento y
    // suave sobre foco/liquido/burbujas, solo presente cuando ACTIVATE esta
    // encendido -- es la señal que hace que el reactor "se sienta vivo" y
    // operativo, distinta de cualquier cambio estatico de brillo.
    const activePulseBoost = 1 + (this.activePulse || 0) * 0.22;
    if (this.reactorSpot) this.reactorSpot.intensity = this.curSpot * activePulseBoost;
    if (this.bubbleMat) {
      this.bubbleMat.emissiveIntensity = this.curBubbleI * hoverBoost * activePulseBoost;
      this.bubbleMat.opacity = this.curBubbleO;
    }
    if (this.liquidMat) this.liquidMat.emissiveIntensity = this.curLiquidI * hoverBoost * activePulseBoost;
    if (this.bioreactorAnim && this.bioreactorAnim.mixer) this.bioreactorAnim.mixer.timeScale = this.curFlowSpeed;
    this.applyLiquidLevel(this.curNutrientLevel || 0);
    // Cristal exterior: unico material del reactor que no depende de ningun
    // boton, asi que es el que mejor comunica "esto se puede seleccionar"
    // incluso con el reactor todavia apagado -- un tinte muy suave hacia el
    // acento de Sala 2, nunca un contorno duro ni un brillo tipo sci-fi.
    // El pulso de ACTIVATE tambien se nota aqui (un halo que respira), para
    // que el estado "operativo" se lea incluso mirando solo el cristal.
    if (this.glassMat) {
      const glowMix = Math.min(1, this.hoverGlow * 0.42 + (this.activePulse || 0) * 0.30);
      this.glassMat.emissive.copy(this.glassBaseEmissive).lerp(this._room2AccentColor || (this._room2AccentColor = new THREE.Color(ROOM2_ACCENT)), glowMix);
      this.glassMat.emissiveIntensity = this.glassBaseEmissiveIntensity + this.hoverGlow * 0.55 + (this.activePulse || 0) * 0.35;
    }
  },

  /*
    03 NUTRIENTS necesita un efecto propio, visualmente distinto de LIGHT y
    FLOW -- el brief pide "pequeñas particulas o puntos entrando en el
    cultivo". En vez de inventar un elemento nuevo, se reutiliza una pieza
    real que ya trae el reactor: Bioreactor_CenterTube, el tubo que baja
    desde la tapa hasta el liquido (confirmado por inspeccion del glTF).
    Unas gotas pequeñas, del mismo color que las burbujas reales
    (Bioreactor_Bubble), descienden por ese tubo hasta la superficie real
    del cultivo (this.liquidTopY) y se funden en el. Nada de particulas
    genericas flotando en el aire: el recorrido es la pieza fisica real.
  */
  buildNutrientParticles(mesh) {
    this.nutrientDots = [];
    const anchor = mesh.getObjectByName('Bioreactor_CenterTube') || mesh.getObjectByName('Bioreactor_InletValve');
    if (!anchor) return;
    const box = new THREE.Box3().setFromObject(anchor);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const topY = box.max.y;
    const bottomY = (this.liquidTopY !== null && this.liquidTopY < topY) ? this.liquidTopY : box.min.y;

    const dotColor = (this.bubbleMat && this.bubbleMat.color) ? this.bubbleMat.color.clone() : new THREE.Color(0xffffff);
    const dotEmissive = (this.bubbleMat && this.bubbleMat.emissive) ? this.bubbleMat.emissive.clone() : dotColor.clone();

    // El brief pide que el efecto "se lea a distancia normal de visitante" --
    // las 6 gotas de 0.009 m originales resultaban demasiado pequeñas/tenues
    // para notarse desde fuera de la sala. Mas gotas, mas grandes y mas
    // brillantes (opacidad tope tambien mas alta, ver updateNutrientParticles)
    // sin dejar de ser "pequeñas particulas" fieles al brief.
    const group = new THREE.Group();
    group.name = 'reactor-nutrient-dots';
    const N = 10;
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: dotColor, emissive: dotEmissive, emissiveIntensity: 1.8,
        roughness: 0.3, metalness: 0, transparent: true, opacity: 0, depthWrite: false
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), mat);
      dot.position.set(cx, topY, cz);
      group.add(dot);
      this.nutrientDots.push({ mat, mesh: dot, phase: i / N });
    }
    this.nutrientTravel = { topY, bottomY, cx, cz };
    // al espacio de mundo directamente (igual que las cartelas): ya viene
    // medido en coordenadas reales, no debe heredar la escala de #modelo.
    this.el.sceneEl.object3D.add(group);
    this.nutrientGroup = group;
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
      low: 0.92,
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
    const liquidBox = new THREE.Box3().setFromObject(this.liquidMesh);
    const sx = Math.max(0.02, liquidBox.max.x - liquidBox.min.x);
    const sy = Math.max(0.02, liquidBox.max.y - liquidBox.min.y);
    const sz = Math.max(0.02, liquidBox.max.z - liquidBox.min.z);
    const cx = (liquidBox.min.x + liquidBox.max.x) * 0.5;
    const cz = (liquidBox.min.z + liquidBox.max.z) * 0.5;
    const group = new THREE.Group();
    group.name = 'reactor-active-culture-bubbles';
    const color = this.bubbleMat && this.bubbleMat.color ? this.bubbleMat.color.clone() : new THREE.Color(0x73e2dc);
    const emissive = this.bubbleMat && this.bubbleMat.emissive ? this.bubbleMat.emissive.clone() : color.clone();
    const N = 18;
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color, emissive, emissiveIntensity: 1.2,
        roughness: 0.2, metalness: 0, transparent: true, opacity: 0, depthWrite: false
      });
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.012 + (i % 3) * 0.004, 10, 8), mat);
      const px = cx + (((i * 37) % 100) / 100 - 0.5) * sx * 0.46;
      const pz = cz + (((i * 61) % 100) / 100 - 0.5) * sz * 0.46;
      bubble.position.set(px, liquidBox.min.y + sy * 0.12, pz);
      group.add(bubble);
      this.activityBubbles.push({
        mesh: bubble, mat,
        baseX: px, baseZ: pz,
        phase: i / N,
        radius: 0.006 + ((i * 17) % 5) * 0.001
      });
    }
    this.activityTravel = { minY: liquidBox.min.y + sy * 0.10, maxY: liquidBox.max.y - sy * 0.08, height: sy };
    this.el.sceneEl.object3D.add(group);
    this.activityGroup = group;
  },

  updateActivityBubbles(time) {
    if (!this.activityBubbles || !this.activityBubbles.length) return;
    const active = this.stage.active;
    const t = (time || 0) / 1000;
    const travel = this.activityTravel;
    const amount = this.activePulseAmt || 0;
    this.activityBubbles.forEach((b) => {
      if (!active && b.mat.opacity < 0.01) {
        b.mat.opacity = 0;
        return;
      }
      const cycle = ((t * 0.33) + b.phase) % 1;
      const wobble = Math.sin(t * 1.7 + b.phase * Math.PI * 2);
      const rise = THREE.MathUtils.lerp(travel.minY, travel.maxY, cycle);
      b.mesh.position.set(
        b.baseX + Math.sin(t * 1.1 + b.phase * 9) * b.radius,
        rise,
        b.baseZ + wobble * b.radius
      );
      const fadeIn = Math.min(1, cycle / 0.18);
      const fadeOut = Math.min(1, (1 - cycle) / 0.22);
      const target = active ? Math.min(fadeIn, fadeOut) * 0.78 * Math.max(0.35, amount) : 0;
      b.mat.opacity += (target - b.mat.opacity) * 0.16;
      b.mat.emissiveIntensity = 1.1 + (this.activePulse || 0) * 0.8;
    });
  },

  /*
    Bucle de caida de las gotas de nutrientes: solo se mueven/se ven cuando
    NUTRIENTS esta activo (si no, se desvanecen a opacidad 0 y quedan
    quietas). Cada gota cae en bucle desde el tubo hasta la superficie real
    del liquido, con una fase distinta para que no caigan todas a la vez.
    ACTIVATE les da el mismo empujon sutil que al resto (mas visibles), sin
    crear una cuarta variable independiente.
  */
  updateNutrientParticles(time) {
    if (!this.nutrientDots || !this.nutrientDots.length) return;
    const active = this.stage.nutrients;
    const boost = this.stage.active ? 1.25 : 1;
    const travel = this.nutrientTravel;
    const period = 1.7;
    const t = (time || 0) / 1000;
    this.nutrientDots.forEach((d) => {
      if (!active) {
        d.mat.opacity += (0 - d.mat.opacity) * 0.08;
        return;
      }
      const bottomY = this.currentLiquidTopY || travel.bottomY;
      const cycle = ((t / period) + d.phase) % 1;
      d.mesh.position.set(travel.cx, THREE.MathUtils.lerp(travel.topY, bottomY, cycle), travel.cz);
      const fadeIn = Math.min(1, cycle / 0.18);
      const fadeOut = Math.min(1, (1 - cycle) / 0.30);
      // ligero "salpicon" al llegar al liquido: la gota crece un poco justo
      // antes de fundirse, para que el punto de entrada al cultivo tambien
      // se note, no solo la caida.
      const splash = 1 + Math.max(0, (cycle - 0.82) / 0.18) * 0.6;
      d.mesh.scale.setScalar(splash);
      const target = Math.min(fadeIn, fadeOut) * 1.0 * boost;
      d.mat.opacity += (target - d.mat.opacity) * 0.25;
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
    const HPX = 520;
    const WPX = Math.max(1200, Math.round(HPX * (widthM / heightM)));
    const c = document.createElement('canvas');
    c.width = WPX; c.height = HPX;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#F7F4EE';
    ctx.fillRect(0, 0, WPX, HPX);
    const grain = Math.round((WPX * HPX) / 650);
    for (let i = 0; i < grain; i++) {
      const v = 205 + Math.floor(Math.random() * 42);
      ctx.fillStyle = `rgba(${v},${v},${v},0.045)`;
      ctx.fillRect(Math.random() * WPX, Math.random() * HPX, 1, 1);
    }

    const accent = ROOM2_ACCENT;
    const ink = '#201A1E';
    const muted = '#756E69';
    const padX = WPX * 0.075;
    const topY = HPX * 0.18;

    ctx.fillStyle = accent;
    ctx.fillRect(padX, HPX * 0.145, WPX - padX * 2, 6);
    ctx.fillStyle = '#D7D0C8';
    ctx.fillRect(padX, HPX * 0.765, WPX - padX * 2, 3);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = '700 46px Arial, Helvetica, sans-serif';
    ctx.fillText('02', padX, topY);

    ctx.fillStyle = ink;
    ctx.font = '800 62px Arial, Helvetica, sans-serif';
    ctx.fillText('BIOREACTOR', padX + 92, topY);

    ctx.fillStyle = muted;
    ctx.font = '600 24px Arial, Helvetica, sans-serif';
    ctx.fillText('CONTROL STATES', padX + 92, topY + 50);

    const cols = defs.length;
    const usableW = WPX - padX * 2;
    const colW = usableW / cols;
    const labelY = HPX * 0.64;
    const cueY = HPX * 0.82;
    ctx.textAlign = 'center';
    defs.forEach((d, i) => {
      const x = padX + colW * (i + 0.5);
      const color = `#${new THREE.Color(d.on).getHexString()}`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, HPX * 0.36, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(44, 140, 130, 0.10)';
      ctx.fillRect(x - colW * 0.37, HPX * 0.505, colW * 0.74, 2);

      ctx.fillStyle = accent;
      ctx.font = '700 30px Arial, Helvetica, sans-serif';
      ctx.fillText(d.num, x, labelY - 34);

      ctx.fillStyle = ink;
      const labelFont = d.label.length > 8 ? 34 : 40;
      ctx.font = `800 ${labelFont}px Arial, Helvetica, sans-serif`;
      ctx.fillText(d.label, x, labelY + 10);

      ctx.fillStyle = muted;
      ctx.font = '600 20px Arial, Helvetica, sans-serif';
      ctx.fillText('ON / OFF', x, cueY);
    });

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
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

    // El brief nuevo es estricto: el panel completo debe quedar dentro del
    // contorno de la tapa inclinada. Se conserva el tamano anterior como
    // preferencia, pero el maximo real lo pone la huella medida.
    const fitWithin = (preferred, minimum, maximum) => {
      const max = Math.max(0.001, maximum);
      return Math.min(Math.max(preferred, Math.min(minimum, max)), max);
    };
    const WIDTH = (top && top.extentLong)
      ? fitWithin(0.60, 0.50, top.extentLong * 0.84)
      : 0.60;
    const HEIGHT = (top && top.extentShort)
      ? fitWithin(0.13, 0.105, top.extentShort * 0.72)
      : 0.13;
    const exhibitInfo = this.el.components['exhibit-info'];
    const defs = [
      { id: 'light', num: '01', label: 'LIGHT', symbol: 'LUX', off: 0xe8f7f5, on: 0x59e7e0 },
      { id: 'flow', num: '02', label: 'FLOW', symbol: 'FLOW', off: 0xe5f3ef, on: 0x35d5d3 },
      { id: 'nutrients', num: '03', label: 'NUTRIENTS', symbol: 'FEED', off: 0xeaf4de, on: 0xa9dc69 },
      { id: 'active', num: '04', label: 'ACTIVATE', symbol: 'BIO', off: 0xeee4f4, on: 0xb06ce8 }
    ];
    const controlTex = this.buildControlPanelTexture(WIDTH, HEIGHT, defs);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, HEIGHT),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, map: controlTex,
        roughness: 0.9, metalness: 0, side: THREE.DoubleSide
      })
    );
    wrapper.object3D.add(panel);
    // el panel de fondo no es "una pieza": no abre nada ni se registra en
    // selectableMeshes, solo los 4 botones son interactivos.

    const DETAIL_Z = 0.003;
    const BUTTON_Z = 0.008;

    const spacing = Math.min(WIDTH * 0.24, (WIDTH * 0.86) / (defs.length - 1));
    const startX = -spacing * (defs.length - 1) / 2;
    const BTN_R = HEIGHT * 0.145;
    const BTN_Y = -HEIGHT * 0.03;
    const STATUS_Y = BTN_Y + BTN_R + HEIGHT * 0.085;

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
      const ring = new THREE.Mesh(new THREE.RingGeometry(BTN_R * 1.10, BTN_R * 1.30, 36), ringMaterial);
      ring.position.set(bx, BTN_Y, BUTTON_Z);
      wrapper.object3D.add(ring);

      const btn = new THREE.Mesh(new THREE.CircleGeometry(BTN_R, 28), material);
      btn.position.set(bx, BTN_Y, BUTTON_Z + 0.001);
      btn.userData.museoExhibitId = `reactorBtn_${d.id}`;   // para el hover (setHover)
      btn.userData.museoAction = () => this.onButtonClick(d.id);
      wrapper.object3D.add(btn);
      if (exhibitInfo) exhibitInfo.selectableMeshes.push(btn);

      const statusMaterial = new THREE.MeshStandardMaterial({
        color: 0xc9c2bc, emissive: new THREE.Color(d.on),
        emissiveIntensity: 0.02, roughness: 0.55, metalness: 0,
        side: THREE.DoubleSide
      });
      const status = new THREE.Mesh(new THREE.PlaneGeometry(BTN_R * 1.18, HEIGHT * 0.016), statusMaterial);
      status.position.set(bx, STATUS_Y, BUTTON_Z + 0.002);
      wrapper.object3D.add(status);

      this.buttons.push({
        id: d.id, mesh: btn, material, ring, ringMaterial, status, statusMaterial,
        offColor: d.off, onColor: d.on,
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
  onButtonClick(id) {
    if (!(id in this.stage)) return;
    this.stage[id] = !this.stage[id];
    this.recomputeTargets();
    this.updateButtonLooks();
  },

  updateButtonLooks() {
    this.buttons.forEach((b) => {
      const on = this.stage[b.id];
      b.material.color.set(on ? b.onColor : b.offColor);
      b.material.emissive.set(b.onColor);
      if (b.ringMaterial) {
        b.ringMaterial.opacity = on ? 0.82 : 0.34;
        b.ringMaterial.emissiveIntensity = on ? 0.30 : 0.04;
      }
      if (b.statusMaterial) {
        b.statusMaterial.color.set(on ? b.onColor : 0xc9c2bc);
        b.statusMaterial.emissiveIntensity = on ? 0.30 : 0.02;
      }
      b.baseEmissive = on ? 0.42 : 0.14;
    });
  },

  tick(time, delta) {
    if (!this.wrapper) return;
    const dt = Math.min((delta || 16) / 1000, 0.1);
    const speed = 1 - Math.pow(0.001, dt);   // suavizado exponencial, ~0.6s

    // hover del reactor: mismo hoverId que ya calcula exhibit-info (raycast
    // sobre selectableMeshes, que ahora incluye el cuerpo real del reactor
    // -- ver "Bioreactor_" en exhibit-info.onLoaded). Se calcula ANTES de
    // applyReactorState porque esta lee this.hoverGlow para el realce del
    // cristal (ver alli).
    const info = this.el.components['exhibit-info'];
    const hoverId = info && info.hoverId;
    const reactorHovered = hoverId === 'reactor01';
    this.hoverGlow += ((reactorHovered ? 1 : 0) - this.hoverGlow) * 0.12;

    // Pulso de ACTIVATE: entra/sale con un fundido lento (~2-3 s, igual de
    // suave que el resto de transiciones del reactor -- nunca un chasquido
    // brusco), y mientras esta encendido oscila con un seno lento (periodo
    // 1.6 s) entre 0 y 1. El resultado (this.activePulse) es lo que
    // applyReactorState usa para el "latido" de foco/liquido/burbujas/cristal
    // -- la señal que distingue ACTIVATE de un simple boton "mas brillo".
    const activeOn = this.stage.active ? 1 : 0;
    this.activePulseAmt += (activeOn - this.activePulseAmt) * 0.02;
    const osc = this.activePulseAmt > 0.001 ? (Math.sin((time || 0) / 1000 * Math.PI * 2 / 1.6) * 0.5 + 0.5) : 0;
    this.activePulse = osc * this.activePulseAmt;

    this.curSpot += (this.targetSpot - this.curSpot) * speed;
    this.curBubbleI += (this.targetBubbleI - this.curBubbleI) * speed;
    this.curBubbleO += (this.targetBubbleO - this.curBubbleO) * speed;
    this.curLiquidI += (this.targetLiquidI - this.curLiquidI) * speed;
    this.curFlowSpeed += (this.targetFlowSpeed - this.curFlowSpeed) * speed;
    this.curNutrientLevel += ((this.targetNutrientLevel || 0) - this.curNutrientLevel) * speed;
    this.applyReactorState();
    this.updateNutrientParticles(time);
    this.updateActivityBubbles(time);

    // hover de los 4 botones: mismo lenguaje que el resto del museo (escala
    // + brillo muy sutiles), leyendo el hoverId que ya calcula exhibit-info.
    this.buttons.forEach((b) => {
      const isHovered = hoverId === `reactorBtn_${b.id}`;
      const t = this._hoverT[b.id] + ((isHovered ? 1 : 0) - this._hoverT[b.id]) * 0.15;
      this._hoverT[b.id] = t;
      const scale = 1 + t * 0.12;
      b.mesh.scale.setScalar(scale);
      if (b.ring) b.ring.scale.setScalar(1 + t * 0.08);
      b.material.emissiveIntensity = b.baseEmissive * (1 + t * 0.6);
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
