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
  init() {
    this.mixer = null;
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
    if (this.mixer && timeDelta) this.mixer.update(timeDelta / 1000);
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
  bacteriaLarge01: {
    lead: 'FORMS THAT EXIST BELOW THE THRESHOLD OF SIGHT', tags: ['MICROSCOPIC', 'OBSERVATION', 'SCALE'], icon: 'cell',
    tier: 'primary', anchor: 'BACTERIA_MASTER',
    section: '01', title: 'INVISIBLE LIFE', label: 'EXPLORE +',
    body: 'An invisible world surrounds us. Microorganisms form complex structures, surfaces and patterns that are normally hidden from the human eye. Enlarged beyond their natural scale, these forms become a new visual landscape and a starting point for observation, experimentation and design.'
  },
  bacteriaSmall01: {
    lead: 'SILHOUETTE AS A DESIGN VOCABULARY', tags: ['CONTOUR', 'VOLUME'], icon: 'form',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_base',
    title: 'FORM', label: 'VIEW +',
    body: 'Simple biological volumes can produce surprisingly complex silhouettes. Curves, extensions and irregular contours become a vocabulary of forms that can later be translated into objects and jewellery.'
  },
  bacteriaSmall02: {
    lead: 'TEXTURE CARRIES VISUAL IDENTITY', tags: ['MEMBRANE', 'RELIEF'], icon: 'surface',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_10',
    title: 'SURFACE', label: 'VIEW +',
    body: 'At microscopic scale, a surface is never completely neutral. Texture, membrane, pattern and small irregularities create a visual identity that can inspire material finishes, reliefs and detailed geometries.'
  },
  bacteriaSmall03: {
    lead: 'A LANGUAGE BUILT ON MOTION, NOT ON FIXED GEOMETRY', tags: ['OSCILLATION', 'ORIENTATION'], icon: 'wave',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_12',
    title: 'MOVEMENT', label: 'VIEW +',
    body: 'Biological form is not entirely static. Subtle oscillations, extensions and changes in orientation suggest a design language based on movement rather than on fixed geometry.'
  },
  bacteriaLarge02: {
    lead: 'SELECT, SIMPLIFY, REINTERPRET', tags: ['TRANSLATION', 'PROPORTION', 'STRUCTURE'], icon: 'transform',
    tier: 'primary', anchor: 'Exhibit_Mesh0_Capsule',
    section: '02', title: 'FROM BIOLOGY TO FORM', label: 'EXPLORE +',
    body: 'Observation becomes design when biological characteristics are selected, simplified and reinterpreted. The aim is not to reproduce a microorganism literally, but to transform its visual logic into new proportions, structures and relationships.'
  },
  bacteriaSmall04: {
    lead: 'ONE DETAIL BECOMES A MODULE', tags: ['MODULE', 'PATTERN'], icon: 'grid',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_14',
    title: 'REPETITION', label: 'VIEW +',
    body: 'Repeated units can generate rhythm and structure. A small biological detail can become a module, multiplied to construct larger patterns, surfaces or ornamental systems.'
  },
  bacteriaSmall05: {
    lead: 'PERCEPTION CHANGES WITH SCALE', tags: ['ENLARGEMENT', 'ABSTRACTION'], icon: 'scale',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_16',
    title: 'SCALE', label: 'VIEW +',
    body: 'Changing scale changes perception. A microscopic detail enlarged many times can stop being recognisable as biology and become an abstract form suitable for experimentation and design.'
  },
  bacteriaSmall06: {
    lead: 'EXAGGERATE, SIMPLIFY, RECOMBINE', tags: ['METHOD', 'GEOMETRY'], icon: 'transform',
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_18',
    title: 'TRANSFORMATION', label: 'VIEW +',
    body: 'Design begins with transformation: selecting a characteristic, exaggerating it, simplifying it and combining it with new geometries until the biological reference becomes something new.'
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
      if (data.tier === 'tertiary') {
        const h = huecos[data.windowIndex];
        if (h) pos = h.p.clone();
      } else {
        const o = byName[data.anchor];
        if (o) {
          pos = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
          // Marca cada malla de esta pieza para la seleccion directa por
          // click/tap (ver drag-look-controls.trySelect): asi el raycaster
          // solo puede tocar piezas con ficha real, nunca paredes/suelo/neon.
          o.traverse((n) => { if (n.isMesh) n.userData.museoExhibitId = id; });
        }
      }
      if (pos) this.items.push({ id, data, pos });
      else console.warn('[exhibit-info] sin ancla:', id, data.anchor || 'ventana');
    });

    this.selectableMeshes = [];
    mesh.traverse((o) => { if (o.isMesh && o.userData.museoExhibitId) this.selectableMeshes.push(o); });

    console.log(`[exhibit-info] ${this.items.length} piezas activas, ${this.selectableMeshes.length} mallas seleccionables por click/tap`);
  },

  tick(time) {
    if (time < this.nextCheck || !this.items.length) return;
    this.nextCheck = time + 180;
    if (!this.wireUI()) return;

    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp);

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
  Vitral arquitectonico. UNA sola ventana de la sala (lado bacterias) recibe
  un cristal con degradado violeta/magenta -- "coloured architectural glass /
  scientific membrane", nunca un objeto flotando delante de una pieza.

  NOTA: una version anterior aplicaba este mismo degradado sobre la campana
  de vidrio de la bacteria grande (VITRINA_Campana_Bacteria). Al ser una
  cupula cerrada, con emissive y una luz puntual dentro, se leia como una
  burbuja/esfera morada envolviendo la bacteria -- exactamente lo que no se
  queria. Se ha retirado por completo: la campana ya no se toca aqui y se ve
  con su vidrio original, tal cual viene del modulo. El vitral se instala en
  su lugar en un hueco de ventana real de la arquitectura (mismo criterio
  geometrico que web-fixes usa para localizar esas ventanas: marco vertical,
  lado bacterias, entre el suelo y ~1 m), como una lamina fina flush con el
  marco -- no invade la zona de paso.

  El degradado es una CanvasTexture generada en memoria (sin peticiones ni
  archivos). El movimiento es un desplazamiento minimo de la textura con
  periodo de 24 s -- a esa velocidad no se percibe como animacion, solo como
  material vivo.
*/
AFRAME.registerComponent('feature-glass', {
  init() { this.el.addEventListener('museo-modules-loaded', () => this.onLoaded()); },

  gradiente() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    // violeta -> purpura -> magenta contenido -> transicion fria al final
    g.addColorStop(0.00, '#3a1258');
    g.addColorStop(0.28, '#7b2fb5');
    g.addColorStop(0.52, '#a63ad0');
    g.addColorStop(0.72, '#b8489e');
    g.addColorStop(0.90, '#4a5fb0');
    g.addColorStop(1.00, '#2f7f9e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
    // veteado suave, para que no sea un degradado perfecto de software
    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random()*64, Math.random()*256, 6+Math.random()*16, 3+Math.random()*8, Math.random()*3, 0, 6.28);
      ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#1b0b2a';
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  /*
    Localiza los marcos de ventana del lado de las bacterias por geometria,
    igual que web-fixes (posicion x<0, marco vertical >1m de alto, arranca
    cerca del suelo) -- no por nombre de material, porque web-fixes puede
    haber corrido antes y ya haberlos renombrado a 'Neon_Blanco_Ventana'.
    Agrupa los marcos que comparten hueco (mismo Z, como en image-windows) y
    devuelve el hueco de mayor superficie: ESA es la ventana protagonista.
  */
  buscarVentana(mesh) {
    const marcos = [];
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const n = o.material.name;
      if (n !== 'Neon_Purple' && n !== 'Neon_Blanco_Ventana') return;
      const b = new THREE.Box3().setFromObject(o);
      const c = b.getCenter(new THREE.Vector3());
      if (c.x >= 0) return;                              // solo lado bacterias
      const s = b.getSize(new THREE.Vector3());
      if (s.y < 1.0 || b.min.y > 1.0) return;             // ni aros de peana ni arcos de techo
      marcos.push({ box: b, center: c, size: s });
    });
    if (!marcos.length) return null;

    const huecos = [];
    marcos.forEach((m) => {
      const h = huecos.find((h) => Math.abs(h.center.z - m.center.z) < 0.6);
      if (h) {
        h.box.union(m.box);
        h.box.getCenter(h.center);
        h.box.getSize(h.size);
      } else {
        huecos.push({ box: m.box.clone(), center: m.center.clone(), size: m.size.clone() });
      }
    });
    huecos.sort((a, b) => (b.size.y * Math.max(b.size.x, b.size.z)) - (a.size.y * Math.max(a.size.x, a.size.z)));
    return huecos[0];
  },

  onLoaded() {
    const mesh = this.el.object3D;
    const raiz = this.el.object3D;
    if (!mesh) return;

    const hueco = this.buscarVentana(mesh);
    if (!hueco) { console.warn('[feature-glass] no se encontro ninguna ventana del lado de las bacterias'); return; }

    this.tex = this.gradiente();

    // ancho = a lo largo del marco (el eje horizontal mas grande del hueco);
    // acotado al 82% del hueco para quedar dentro del marco, nunca sobre el muro.
    const anchoHueco = Math.max(hueco.size.x, hueco.size.z);
    const ancho = anchoHueco * 0.82;
    const alto = hueco.size.y * 0.82;

    const mat = new THREE.MeshStandardMaterial({
      map: this.tex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.30,                 // translucido: la arquitectura de detras se sigue leyendo
      roughness: 0.85,
      metalness: 0.0,
      emissive: new THREE.Color(0x2a1040),
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), mat);
    plano.renderOrder = 1;

    const p = hueco.center.clone();
    raiz.worldToLocal(p);
    plano.position.copy(p);
    // el hueco es mas ancho en X que en Z (marco encastrado en la pared curva):
    // el plano por defecto mira a +Z, asi que se gira 90 grados para quedar
    // en el mismo plano que el marco en vez de atravesarlo hacia la sala.
    if (hueco.size.x >= hueco.size.z) plano.rotation.y = Math.PI / 2;
    raiz.add(plano);
    this.plano = plano;

    // una sola luz de contaminacion violeta, muy baja, junto al vitral -- sin
    // geometria visible, sin esfera, sin varios focos de neon falsos.
    const luz = new THREE.PointLight(0x9a4fd6, 0.5, 1.8, 2);
    luz.position.copy(p);
    luz.castShadow = false;
    raiz.add(luz);

    console.log('[feature-glass] vitral instalado en la ventana protagonista', hueco.center);
  },

  tick(time) {
    if (!this.tex) return;
    // ciclo de 24 s; el recorrido es de una sola altura de textura
    this.tex.offset.y = (time / 24000) % 1;
  }
});

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

AFRAME.registerComponent('exhibit-lighting', {
  init() {
    this.el.addEventListener('museo-modules-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.object3D;

    // piezas principales (mas presencia) y secundarias (acento discreto)
    // Maximo tres luces, muy suaves. Son luces de museo, no simulacion de neon:
    // el visitante debe notar que las piezas tienen volumen, no ver las lamparas.
    const focos = [
      { anchor: 'BACTERIA_MASTER',  intensidad: 3.4, alcance: 7.5, angulo: 0.62, color: 0xfff0dc },
      { anchor: 'PEANA_Bioreactor', intensidad: 3.0, alcance: 7.0, angulo: 0.60, color: 0xe8f2ff },
      { anchor: 'PEANA_Bacteria',   intensidad: 1.1, alcance: 9.0, angulo: 0.95, color: 0xfff4e4 }
    ];

    const raiz = this.el.object3D;
    let puestos = 0;
    focos.forEach((f) => {
      const o = mesh.getObjectByName(f.anchor);
      if (!o) return;
      const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      raiz.worldToLocal(c);                       // el rig del modelo esta reescalado

      const spot = new THREE.SpotLight(f.color, f.intensidad, f.alcance, f.angulo, 0.9, 1.4);
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
