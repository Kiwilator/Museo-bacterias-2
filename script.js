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
    this.onTouchStart = (e) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY); };
    this.onTouchMove = (e) => { if (e.touches.length === 1) { move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } };
    this.onTouchEnd = () => end();

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
    body: 'Purple phototrophic bacteria (PPB) are a diverse group of microorganisms capable of using light as a source of energy. What makes them particularly interesting, however, is not only their photosynthetic ability, but also the extraordinary variety of metabolic strategies they can develop.\n\nDepending on the species and environmental conditions, these bacteria can modify their metabolism, fix nitrogen, transform organic compounds, use certain gases, exchange electrons with minerals or electrodes, and store carbon in the form of PHA (biopolymers with potential applications in the production of bio-based plastics). Some strains are also particularly efficient at producing hydrogen, while the biomass obtained from their cultivation is being investigated for food and feed applications.\n\nThis diversity makes purple phototrophic bacteria important both for understanding fundamental biological processes (such as the conversion of light into energy and cellular adaptation to environmental conditions) and for investigating more sustainable biotechnological processes. Their cultivation opens possibilities related to hydrogen production, bioplastics, biomass and bioelectrochemical systems.\n\nBut they do not all behave in the same way.\n\nFrom this point onwards, the exhibition focuses on eight specific strains, revealing the characteristics and capabilities that distinguish each one.\n\n01. RHODOSPIRILLUM RUBRUM\nA key bacterium for understanding photosynthesis\n\nRhodospirillum rubrum has played an important role in the history of bacterial photosynthesis research. Its relatively simple photosynthetic apparatus made it one of the first model organisms used to investigate how energy from light is transformed, through electron transfer, into energy that the cell can use.\n\nIts study has also helped researchers understand the relationship between energy production, nitrogen fixation and carbon metabolism, showing how a bacterium can coordinate different processes depending on its needs and environmental conditions.\n\nIts relevance is not limited to fundamental research. R. rubrum can accumulate PHA in the form of intracellular granules. These compounds act as carbon reserves for the bacterium and can be used in the production of bio-based and biodegradable materials. The species is also currently being investigated as a potential nutritious ingredient for food and feed applications.'
  },
  bacteriaSmall01: {
    lead: 'The machinery that converts light into energy', tags: ['REACTION CENTER', 'NOBEL PRIZE'], icon: 'form',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_base',
    section: '02', title: 'BLASTOCHLORIS VIRIDIS', label: 'VIEW +',
    body: 'Inside photosynthetic bacteria, specialized structures capture light energy and begin its conversion into chemical energy. The photosynthetic reaction center of Blastochloris viridis occupies a particularly important place in the history of science.\n\nIt was the first membrane protein complex whose structure was resolved at atomic resolution. Observing its organization at this level of detail made it possible to better understand one of the essential processes of photosynthesis (the initial conversion of light energy into chemical energy).\n\nThis discovery went far beyond the study of a single bacterium. It opened new possibilities for investigating the structure of membrane proteins and contributed to the research recognized by the 1988 Nobel Prize in Chemistry.'
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
    body: 'We often imagine bacteria reproducing through a simple division in which one cell produces two almost identical cells. Rhodomicrobium vannielii shows that bacterial reproduction can be considerably more complex.\n\nThis bacterium develops filamentous extensions known as hyphae. New cells are formed by budding from the tips of these structures. A small bud appears, gradually grows and eventually separates to form a new cell.\n\nThis life cycle includes processes of cellular differentiation and unusual multicellular stages, making R. vannielii an important organism for studying the evolution of complex bacterial life cycles.\n\nIts distinctive morphology also provides a striking example of the extraordinary diversity found among photosynthetic bacteria.'
  },
  bacteriaSmall04: {
    lead: 'Bacteria connected to electricity', tags: ['ELECTROACTIVITY', 'BIOELECTROCHEMISTRY'], icon: 'grid',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_14',
    section: '06', title: 'RHODOVULUM', label: 'VIEW +',
    body: 'Some purple phototrophic bacteria have a particularly remarkable ability (they are electroactive). This means that they can exchange electrons with elements outside the cell.\n\nSpecies of Rhodovulum (including Rhodovulum sulfidophilum and Rhodovulum visakhapatnamense) can obtain electrons from hydrogen, iron or even directly from an electrode.\n\nThese processes allow us to understand the bacterium not as an isolated organism, but as part of a system in which biological matter and conductive materials can exchange electrical charges.\n\nThe mechanisms responsible for this electroactivity are still not completely understood. For this reason, these bacteria remain an active field of research and provide new opportunities to investigate interactions between microorganisms, minerals and bioelectrochemical systems.'
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
    body: 'Rhodopseudomonas palustris brings together several of the capabilities explored throughout the exhibition.\n\nIt can use light to support the anaerobic degradation of aromatic compounds derived from plants, contributing to the recycling of complex organic matter and to processes associated with the carbon cycle.\n\nIt is also particularly effective at producing hydrogen through photofermentation. Among the purple phototrophic bacteria studied for this process, certain strains of R. palustris (such as strain 42OL) have achieved especially high hydrogen productivity.\n\nIt has another important characteristic as well (electroactivity). Some strains can exchange electrons with electrodes and, by combining electricity and light, use these processes to generate valuable products such as PHA and certain biofuels.\n\nAt this point, we have finished looking closely at the bacteria themselves. The next step is to understand how they can be cultivated and how these capabilities can be used at a larger scale.'
  },
  reactor01: {
    lead: 'FROM BIOLOGICAL CULTIVATION TO MATERIAL EXPERIMENTATION', tags: ['MODULAR', 'ACTIVE PROCESS', 'EXPERIMENTAL'], icon: 'reactor',
    tier: 'primary', anchor: 'PEANA_Bioreactor',
    section: '03', title: 'THE PROCESS', label: 'VIEW PROCESS +',
    body: 'This experimental device represents the transition between biological observation and material experimentation. The animated liquid and bubbles introduce the idea of an active process: matter is not presented as something fixed, but as something that can evolve, react and be transformed.'
  },

  /* Ventanas de imagen de la pared opuesta. Contenido pasivo: no abren panel.
     display:false en las cinco: los graficos generados por IA (MICROSCOPY,
     ABSTRACTION, FORM, DIGITAL MODEL, JEWELLERY) se han retirado y los nichos
     quedan limpios a proposito -- el contenido grafico final se disenara
     aparte. Para reactivar una vitrina de imagen real basta con poner
     display:true y rellenar `image` con una ruta. */
  window01: { display: false, tier: 'tertiary', windowIndex: 0, number: '01', title: 'MICROSCOPY',
    image: '', caption: 'Observation reveals structures that remain invisible at human scale.' },
  window02: { display: false, tier: 'tertiary', windowIndex: 1, number: '02', title: 'ABSTRACTION',
    image: '', caption: 'Biological information is reduced to lines, volumes, textures and patterns.' },
  window03: { display: false, tier: 'tertiary', windowIndex: 2, number: '03', title: 'FORM',
    image: '', caption: 'Selected characteristics become a new three-dimensional design vocabulary.' },
  window04: { display: false, tier: 'tertiary', windowIndex: 3, number: '04', title: 'DIGITAL MODEL',
    image: '', caption: 'The abstracted form is developed and tested within a digital design process.' },
  window05: { display: false, tier: 'tertiary', windowIndex: 4, number: '05', title: 'JEWELLERY',
    image: '', caption: 'Biological inspiration is finally translated into scale, material and wearable form.' }
};

/* Iconos monolinea de las fichas. SVG inline, sin dependencias ni peticiones. */
const PANEL_ICONS = {
  cell:      '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13"/><circle cx="20" cy="20" r="6"/><circle cx="16" cy="15" r="1.6"/></svg>',
  form:      '<svg viewBox="0 0 40 40"><path d="M8 26c0-9 6-14 12-14s12 4 12 11c0 5-5 7-10 7S8 30 8 26z"/></svg>',
  surface:   '<svg viewBox="0 0 40 40"><path d="M6 14h28M6 20h28M6 26h28"/><circle cx="14" cy="14" r="2.4"/><circle cx="26" cy="26" r="2.4"/></svg>',
  wave:      '<svg viewBox="0 0 40 40"><path d="M5 24c5-10 10 10 15 0s10 10 15 0"/></svg>',
  grid:      '<svg viewBox="0 0 40 40"><circle cx="13" cy="13" r="4"/><circle cx="27" cy="13" r="4"/><circle cx="13" cy="27" r="4"/><circle cx="27" cy="27" r="4"/></svg>',
  scale:     '<svg viewBox="0 0 40 40"><circle cx="14" cy="26" r="4"/><circle cx="27" cy="16" r="10"/></svg>',
  transform: '<svg viewBox="0 0 40 40"><circle cx="12" cy="20" r="7"/><path d="M22 20h9M27 16l4 4-4 4"/><rect x="31" y="14" width="0.1" height="0.1"/></svg>',
  reactor:   '<svg viewBox="0 0 40 40"><rect x="13" y="10" width="14" height="21" rx="3"/><path d="M13 17h14"/><circle cx="20" cy="24" r="2"/><path d="M20 10V6"/></svg>'
};

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
    this.active = null;      // pieza con el aviso visible
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
      // E abre la pieza mas cercana; no interfiere con WASD
      if ((e.key === 'e' || e.key === 'E') && this.active && !this.openId) this.open(this.active.id);
    };
    window.addEventListener('keydown', this.onKey);

    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },

  /*
    El HTML del panel va despues de <a-scene>, asi que cuando A-Frame llama a
    init() el navegador todavia no lo ha parseado y getElementById devuelve
    null. Por eso las referencias se resuelven aqui, de forma perezosa, en vez
    de en init().
  */
  wireUI() {
    if (this.ui) return true;
    this.prompt  = document.getElementById('exhibit-prompt');
    this.panel   = document.getElementById('exhibit-panel');
    this.intro   = document.getElementById('intro-msg');
    if (!this.prompt || !this.panel) return false;

    this.onPromptClick = () => this.open(this.active && this.active.id);
    this.prompt.addEventListener('click', this.onPromptClick);
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
      if (o.isMesh && o.material && o.material.name === 'Neon_Turquoise') {
        const b = new THREE.Box3().setFromObject(o);
        if (b.min.y > 1.2) turquesaAlto.push({ o, y: (b.min.y + b.max.y) / 2,
                                               p: b.getCenter(new THREE.Vector3()) });
      }
    });

    // Las ventanas de imagen se anclan a los nichos turquesa altos de la pared
    // opuesta, agrupados por posicion. Asi no dependen de nombres concretos.
    turquesaAlto.sort((a, b) => a.p.z - b.p.z);
    const huecos = [];
    turquesaAlto.forEach((n) => {
      const cerca = huecos.find((h) => Math.abs(h.p.z - n.p.z) < 0.9);
      if (cerca) { cerca.p.lerp(n.p, 0.5); } else { huecos.push({ p: n.p.clone() }); }
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
        if (h) pos = h.p.clone();
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
        }
      }
      if (pos) this.items.push({ id, data, pos, topY, bottomY, anchorObj });
      else console.warn('[exhibit-info] sin ancla:', id, data.anchor || 'ventana');
    });

    this.selectableMeshes = [];
    mesh.traverse((o) => { if (o.isMesh && o.userData.museoExhibitId) this.selectableMeshes.push(o); });

    // Lenguaje visual de interaccion (etiqueta flotante "VIEW +" + hover) en
    // las 8 cepas de la Sala 1 (ids que empiezan por "bacteria"). No toca el
    // reactor (Sala 2) ni las ventanas de imagen (pasivas, sin ficha).
    this.items.forEach((it) => {
      if (it.data.tier === 'tertiary' || !it.id.startsWith('bacteria')) return;
      this.setupHoverAffordance(it);
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
    it.labelOpacity = 0; // 0..1, suavizado de aparicion por proximidad

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

    // Las 6 cepas pequeñas (tier "secondary") usan el popup nuevo, compacto
    // y desplazado delante de la vitrina; las 2 piezas grandes conservan la
    // ficha ya existente, que no tenia el problema reportado.
    // Las 8 cepas usan el mismo popup compacto: la ficha antigua (create
    // Label, ver abajo) quedaba centrada en el eje X/Z de la propia pieza y
    // por eso se leia pegada o encima de la bacteria grande -- el mismo
    // problema que ya se corrigio para las 6 pequeñas, asi que aqui se
    // aplica el mismo popup a las 8.
    it.label = this.createSmallPopup(it);
  },

  /*
    Ficha compacta junto a la peana: numero de seccion, nombre de la pieza y,
    debajo y mas pequeño, "VIEW +" -- la misma jerarquia numero/titulo que ya
    usa el panel grande (.panel-section/.panel-title), en miniatura, pegada
    a la exhibicion en vez de flotando arriba en el hueco. Placa crema muy
    tenue detras para que se lea sobre cualquier fondo. Siempre orientada a
    la camara, hija de la escena (no del pivote, para que el escalado del
    hover no la deforme). Arranca invisible; tick() la enciende/apaga segun
    la distancia y el hover, igual que antes.
  */
  createLabel(it) {
    const baseY = (it.bottomY !== null ? it.bottomY : it.pos.y - 0.4) + 0.13;

    const wrapper = document.createElement('a-entity');
    wrapper.setAttribute('face-camera', '');
    wrapper.object3D.position.set(it.pos.x, baseY, it.pos.z);

    const bg = document.createElement('a-plane');
    bg.setAttribute('width', 0.34);
    bg.setAttribute('height', 0.21);
    bg.setAttribute('material', 'color: #faf6f0; shader: flat; opacity: 0; transparent: true; side: double');
    wrapper.appendChild(bg);

    const section = document.createElement('a-text');
    section.setAttribute('value', it.data.section || '');
    section.setAttribute('align', 'center');
    section.setAttribute('baseline', 'center');
    section.setAttribute('width', 0.5);
    section.setAttribute('letter-spacing', 3);
    section.setAttribute('color', '#7d3fa8');
    section.setAttribute('opacity', 0);
    section.object3D.position.set(0, 0.07, 0.003);
    wrapper.appendChild(section);

    const title = document.createElement('a-text');
    title.setAttribute('value', it.data.title || '');
    title.setAttribute('align', 'center');
    title.setAttribute('baseline', 'center');
    title.setAttribute('width', 0.62);
    title.setAttribute('wrap-count', 16);
    title.setAttribute('color', '#2a2622');
    title.setAttribute('opacity', 0);
    title.object3D.position.set(0, 0.015, 0.003);
    wrapper.appendChild(title);

    const cue = document.createElement('a-text');
    cue.setAttribute('value', 'VIEW +');
    cue.setAttribute('align', 'center');
    cue.setAttribute('baseline', 'center');
    cue.setAttribute('width', 0.42);
    cue.setAttribute('letter-spacing', 3);
    cue.setAttribute('color', '#7d3fa8');
    cue.setAttribute('opacity', 0);
    cue.object3D.position.set(0, -0.065, 0.003);
    wrapper.appendChild(cue);

    this.el.sceneEl.appendChild(wrapper);
    return { wrapper, bg, section, title, cue };
  },

  /*
    Textura compartida (un solo canvas, reutilizado por las 6 cepas
    pequeñas) para el resplandor suave que sustituye a la placa rectangular
    de fondo: un degradado radial, sin bordes duros, para que el popup se
    lea como luz sobre la peana en vez de como una tarjeta de interfaz.
  */
  getPopupGlowTexture() {
    if (this._popupGlowTexture) return this._popupGlowTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(250,244,234,0.95)');
    g.addColorStop(0.5, 'rgba(250,244,234,0.5)');
    g.addColorStop(1, 'rgba(250,244,234,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this._popupGlowTexture = new THREE.CanvasTexture(c);
    return this._popupGlowTexture;
  },

  /*
    Popup compacto para las 8 cepas. Sustituye a la ficha rectangular
    anterior (createLabel, mas abajo, ya sin uso), que quedaba centrada en
    el mismo eje X/Z que la propia bacteria -- por eso se leia pegada o
    encima de la pieza grande, dentro del hueco de la vitrina. Aqui el popup
    se desplaza desde el centro de la pieza hacia el centro de la sala
    (mismo criterio ya usado para orientar los circulos de video: la
    normal/direccion "hacia el centro" es la que de verdad mira al
    visitante), asi que aparece delante del cristal, nunca detras ni sobre
    la bacteria.

    La altura se mide desde el SUELO real (window.MUSEO_SPAWN.y, calculado
    en setup-museum-model), no desde la base de la propia bacteria: esa
    malla ya empieza bastante por encima del suelo (se apoya en la peana),
    asi que anclar la altura ahi dejaba el popup a la altura del cristal en
    vez de a la altura del pie de la peana. Medio metro sobre el suelo real
    lo deja pegado a la base solida de la peana, por debajo de la campana de
    cristal.

    Visualmente es deliberadamente ligero: sin placa opaca, solo el
    resplandor radial de getPopupGlowTexture() detras de tres lineas de
    texto pequeñas (numero / nombre / "Click to explore"). El disparo por
    proximidad es mucho mas corto que el de la ficha grande antigua (ver
    tick()) -- debe leerse como un gesto de interaccion al llegar a esa
    peana concreta, no como un rotulo fijo visible desde el centro de la
    sala.
  */
  createSmallPopup(it) {
    const bounds = window.MUSEO_BOUNDS;
    let ox = 0, oz = 1;
    if (bounds) {
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cz = (bounds.minZ + bounds.maxZ) / 2;
      const dx = cx - it.pos.x, dz = cz - it.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) { ox = dx / len; oz = dz / len; }
    }
    // Empujon claro hacia el frente de la peana: tiene que leerse delante
    // del tubo, no metido/fundido en su superficie. Sigue siendo la misma
    // direccion (centro de la sala), solo mas generoso que el primer ajuste.
    const OFFSET = 0.17;
    const spawn = window.MUSEO_SPAWN;
    const floorY = (spawn && typeof spawn.y === 'number')
      ? spawn.y
      : (it.bottomY !== null ? it.bottomY - 0.9 : it.pos.y - 1.2);
    const baseY = floorY + 0.5;
    const px = it.pos.x + ox * OFFSET;
    const pz = it.pos.z + oz * OFFSET;

    const wrapper = document.createElement('a-entity');
    wrapper.setAttribute('face-camera', '');
    wrapper.object3D.position.set(px, baseY, pz);

    /*
      Placa con volumen real, no un plano 2D: una porcion curva de cilindro
      (un "semi-tubo" muy abierto, como una cartela de museo ligeramente
      combada) en vez de PlaneGeometry. El arco se centra en el eje -Z local
      (delante de la camara tras el face-camera) y se retrasa su propio
      radio para que el punto mas hundido del arco quede en z=0 y los bordes
      se curven ligeramente hacia el visitante -- de ahi que el texto (mas
      abajo) se adelante un poco mas en Z que la placa.
    */
    const PLAQUE_RADIUS = 0.55;
    const PLAQUE_ARC = THREE.MathUtils.degToRad(34);
    const bgGeo = new THREE.CylinderGeometry(
      PLAQUE_RADIUS, PLAQUE_RADIUS, 0.20, 20, 1, true,
      -Math.PI / 2 - PLAQUE_ARC / 2, PLAQUE_ARC
    );
    const bg = new THREE.Mesh(
      bgGeo,
      new THREE.MeshBasicMaterial({
        map: this.getPopupGlowTexture(), transparent: true, opacity: 0,
        color: 0xe6d8c2, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
      })
    );
    bg.position.z = PLAQUE_RADIUS;
    wrapper.object3D.add(bg);

    const TEXT_Z = 0.035;   // delante del punto mas saliente de la curva

    const section = document.createElement('a-text');
    section.setAttribute('value', it.data.section || '');
    section.setAttribute('align', 'center');
    section.setAttribute('baseline', 'center');
    section.setAttribute('width', 0.34);
    section.setAttribute('letter-spacing', 2);
    section.setAttribute('color', '#7d3fa8');
    section.setAttribute('opacity', 0);
    section.object3D.position.set(0, 0.052, TEXT_Z);
    wrapper.appendChild(section);

    const title = document.createElement('a-text');
    title.setAttribute('value', it.data.title || '');
    title.setAttribute('align', 'center');
    title.setAttribute('baseline', 'center');
    title.setAttribute('width', 0.40);
    title.setAttribute('wrap-count', 20);
    title.setAttribute('color', '#3a3530');
    title.setAttribute('opacity', 0);
    title.object3D.position.set(0, 0.006, TEXT_Z);
    wrapper.appendChild(title);

    const cue = document.createElement('a-text');
    cue.setAttribute('value', 'Click to explore');
    cue.setAttribute('align', 'center');
    cue.setAttribute('baseline', 'center');
    cue.setAttribute('width', 0.30);
    cue.setAttribute('letter-spacing', 0.5);
    cue.setAttribute('color', '#8a6a9c');
    cue.setAttribute('opacity', 0);
    cue.object3D.position.set(0, -0.048, TEXT_Z);
    wrapper.appendChild(cue);

    this.el.sceneEl.appendChild(wrapper);
    return { wrapper, bg, section, title, cue, isPopup: true };
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

    // Lenguaje visual de hover/proximidad de las 8 cepas: sin throttle (se
    // anima cada frame para que el fundido y la respiracion se vean suaves).
    // Muy barato -- 8 items como mucho, sin raycasts aqui.
    this.items.forEach((it) => {
      if (!it.pivot) return;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      const isHovered = this.hoverId === it.id;
      const isPopup = !!(it.label && it.label.isPopup);

      // 1) fundido de la etiqueta segun distancia. El popup compacto de las
      // 6 cepas pequeñas usa un radio mucho mas corto que la ficha grande:
      // debe leerse como un gesto de interaccion al llegar a esa peana en
      // concreto (o al señalarla con el raton), nunca como un rotulo fijo
      // visible ya desde el centro de la sala.
      const showDist = isPopup ? 0.95 : this.data.show;
      const closeDist = isPopup ? 1.7 : this.data.close;
      const range = Math.max(0.001, closeDist - showDist);
      let targetOpacity = THREE.MathUtils.clamp((closeDist - d) / range, 0, 1);
      if (isPopup && isHovered) targetOpacity = 1;
      it.labelOpacity += (targetOpacity - it.labelOpacity) * 0.12;
      if (it.labelOpacity < 0.004) it.labelOpacity = 0;

      // 2) hover: entra/sale con una curva lenta (nada de saltos), y con una
      // respiracion muy leve mientras se mantiene el raton encima.
      it.hoverT += ((isHovered ? 1 : 0) - it.hoverT) * 0.08;

      const breathe = 0.5 + 0.5 * Math.sin(time * 0.0016);
      const scale = 1 + it.hoverT * (0.015 + 0.015 * breathe);   // ~1.00 -> ~1.03
      it.pivot.scale.setScalar(scale);

      if (it.emissiveMats.length) {
        const boost = 1 + it.hoverT * 0.35;
        it.emissiveMats.forEach(({ mat, base }) => { mat.emissiveIntensity = base * boost; });
      }

      if (it.label) {
        // En el popup pequeño, el hover ademas crece un poco y se aclara
        // hacia blanco -- señal clara de "esto es seleccionable" sin tocar
        // el tamaño de letra ni añadir movimiento brusco.
        const bgOpacity = isPopup
          ? it.labelOpacity * (0.55 + it.hoverT * 0.35)
          : it.labelOpacity * 0.82;
        const textOpacity = it.labelOpacity * (isPopup ? 0.95 : 0.9);
        const cueOpacity = isPopup
          ? it.labelOpacity * 0.75
          : it.labelOpacity * (0.82 + it.hoverT * 0.18);  // "VIEW +" algo mas brillante en hover
        if (isPopup) {
          it.label.bg.material.opacity = bgOpacity;
          if (!this._popupBaseColor) {
            this._popupBaseColor = new THREE.Color(0xe6d8c2);
            this._popupHoverColor = new THREE.Color(0xffffff);
          }
          it.label.bg.material.color.copy(this._popupBaseColor).lerp(this._popupHoverColor, it.hoverT);
          it.label.wrapper.object3D.scale.setScalar(1 + it.hoverT * 0.12);
        } else {
          it.label.bg.setAttribute('material', 'opacity', bgOpacity);
        }
        it.label.section.setAttribute('opacity', textOpacity);
        it.label.title.setAttribute('opacity', textOpacity);
        it.label.cue.setAttribute('opacity', cueOpacity);
        it.label.wrapper.object3D.visible = it.labelOpacity > 0.003;
      }
    });

    if (time < this.nextCheck) return;
    this.nextCheck = time + 180;
    if (!this.wireUI()) return;

    let mejor = null, mejorD = Infinity;
    this.items.forEach((it) => {
      if (it.data.tier === 'tertiary') return;   // las ventanas no abren panel
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < mejorD) { mejorD = d; mejor = it; }
    });

    // aviso de interaccion
    if (mejor && mejorD <= this.data.show) {
      if (!this.active || this.active.id !== mejor.id) {
        this.active = mejor;
        this.prompt.textContent = mejor.data.label;
        this.prompt.classList.add('visible');
      }
    } else if (this.active) {
      this.active = null;
      this.prompt.classList.remove('visible');
    }

    // cerrar el panel si el visitante se aleja
    if (this.openId) {
      const abierto = this.items.find((i) => i.id === this.openId);
      if (abierto && Math.hypot(abierto.pos.x - p.x, abierto.pos.z - p.z) > this.data.close) this.close();
    }

  },

  open(id) {
    if (!id || !this.wireUI()) return;
    const it = this.items.find((i) => i.id === id);
    if (!it || it.data.tier === 'tertiary') return;
    const d = it.data;
    this.panel.querySelector('.panel-section').textContent = d.section || '';
    this.panel.querySelector('.panel-section').style.display = d.section ? 'block' : 'none';
    this.panel.querySelector('.panel-icon').innerHTML = PANEL_ICONS[d.icon] || '';
    this.panel.querySelector('.panel-title').textContent = d.title;
    const lead = this.panel.querySelector('.panel-lead');
    lead.textContent = d.lead || '';
    lead.style.display = d.lead ? 'block' : 'none';
    this.panel.querySelector('.panel-body').textContent = d.body;
    const tags = this.panel.querySelector('.panel-tags');
    tags.textContent = (d.tags || []).join(' · ');
    tags.style.display = (d.tags && d.tags.length) ? 'block' : 'none';
    this.panel.classList.toggle('secondary', d.tier === 'secondary');
    this.panel.classList.add('visible');
    this.openId = id;
    this.prompt.classList.remove('visible');
    this.hideIntro();
  },

  close() {
    if (!this.openId || !this.panel) return;
    this.panel.classList.remove('visible');
    this.openId = null;
  },

  hideIntro() {
    if (this.intro) this.intro.classList.add('hidden');
  },

  remove() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('mousemove', this.onMouseMove);
    if (this.prompt) this.prompt.removeEventListener('click', this.onPromptClick);
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
      raiz.add(spot);
      raiz.add(spot.target);
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
  Bucle robusto del video del primer circulo. `loop` en el propio <video>
  ya deberia bastar, pero se reafirma por si el navegador ignora el
  autoplay inicial (tipico si la pestaña no tenia foco) o si la textura de
  video de three.js se queda parada en el ultimo frame: se relanza al
  terminar y, si el primer intento de reproduccion es bloqueado, se
  reintenta en cuanto haya cualquier primer gesto del visitante (click,
  toque o tecla) -- el video sigue muted, asi que esos reintentos no
  chocan con las politicas de autoplay de ningun navegador.
*/
(function () {
  const video = document.getElementById('ppb-video-01');
  if (!video) return;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;

  const tryPlay = () => {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  };

  video.addEventListener('ended', tryPlay);
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
