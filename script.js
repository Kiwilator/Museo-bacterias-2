/*
  Look: click-and-drag to look around, release to stop — not pointer lock.
  Pointer lock (look-controls' pointerLockEnabled) captures the cursor on
  click and needs ESC to let go, which read as "stuck"/uncomfortable.
  This never captures the cursor at all: hold the left mouse button (or one
  finger on touch) and drag, release and looking stops, cursor free the
  whole time. No ESC, nothing to "get out of".
*/
AFRAME.registerComponent('drag-look-controls', {
  schema: {
    sensitivity: { type: 'number', default: 0.2 } // degrees per pixel of drag
  },
  init() {
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
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
    this.el.addEventListener('model-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.getObject3D('mesh');
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
    if (isGrounded(clamped.x, clamped.z, window.MUSEO_FLOOR_MESHES, refY)) {
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
    this.el.addEventListener('model-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.getObject3D('mesh');
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
    tier: 'primary', anchor: 'BACTERIA_MASTER',
    section: '01', title: 'INVISIBLE LIFE', label: 'EXPLORE +',
    body: 'An invisible world surrounds us. Microorganisms form complex structures, surfaces and patterns that are normally hidden from the human eye. Enlarged beyond their natural scale, these forms become a new visual landscape and a starting point for observation, experimentation and design.'
  },
  bacteriaSmall01: {
    tier: 'secondary', anchor: 'Bacteria_GRUPO_base',
    title: 'FORM', label: 'VIEW +',
    body: 'Simple biological volumes can produce surprisingly complex silhouettes. Curves, extensions and irregular contours become a vocabulary of forms that can later be translated into objects and jewellery.'
  },
  bacteriaSmall02: {
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_10',
    title: 'SURFACE', label: 'VIEW +',
    body: 'At microscopic scale, a surface is never completely neutral. Texture, membrane, pattern and small irregularities create a visual identity that can inspire material finishes, reliefs and detailed geometries.'
  },
  bacteriaSmall03: {
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_12',
    title: 'MOVEMENT', label: 'VIEW +',
    body: 'Biological form is not entirely static. Subtle oscillations, extensions and changes in orientation suggest a design language based on movement rather than on fixed geometry.'
  },
  bacteriaLarge02: {
    tier: 'primary', anchor: 'Exhibit_Mesh0_Capsule',
    section: '02', title: 'FROM BIOLOGY TO FORM', label: 'EXPLORE +',
    body: 'Observation becomes design when biological characteristics are selected, simplified and reinterpreted. The aim is not to reproduce a microorganism literally, but to transform its visual logic into new proportions, structures and relationships.'
  },
  bacteriaSmall04: {
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_14',
    title: 'REPETITION', label: 'VIEW +',
    body: 'Repeated units can generate rhythm and structure. A small biological detail can become a module, multiplied to construct larger patterns, surfaces or ornamental systems.'
  },
  bacteriaSmall05: {
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_16',
    title: 'SCALE', label: 'VIEW +',
    body: 'Changing scale changes perception. A microscopic detail enlarged many times can stop being recognisable as biology and become an abstract form suitable for experimentation and design.'
  },
  bacteriaSmall06: {
    tier: 'secondary', anchor: 'Bacteria_GRUPO_Mesh_18',
    title: 'TRANSFORMATION', label: 'VIEW +',
    body: 'Design begins with transformation: selecting a characteristic, exaggerating it, simplifying it and combining it with new geometries until the biological reference becomes something new.'
  },
  reactor01: {
    tier: 'primary', anchor: 'PEANA_Bioreactor',
    section: '03', title: 'THE PROCESS', label: 'VIEW PROCESS +',
    body: 'This experimental device represents the transition between biological observation and material experimentation. The animated liquid and bubbles introduce the idea of an active process: matter is not presented as something fixed, but as something that can evolve, react and be transformed.'
  },

  /* Ventanas de imagen de la pared opuesta. Contenido pasivo: no abren panel.
     Para poner las imagenes basta con rellenar `image` con una ruta. */
  window01: { tier: 'tertiary', windowIndex: 0, number: '01', title: 'MICROSCOPY',
    image: '', caption: 'Observation reveals structures that remain invisible at human scale.' },
  window02: { tier: 'tertiary', windowIndex: 1, number: '02', title: 'ABSTRACTION',
    image: '', caption: 'Biological information is reduced to lines, volumes, textures and patterns.' },
  window03: { tier: 'tertiary', windowIndex: 2, number: '03', title: 'FORM',
    image: '', caption: 'Selected characteristics become a new three-dimensional design vocabulary.' },
  window04: { tier: 'tertiary', windowIndex: 3, number: '04', title: 'DIGITAL MODEL',
    image: '', caption: 'The abstracted form is developed and tested within a digital design process.' },
  window05: { tier: 'tertiary', windowIndex: 4, number: '05', title: 'JEWELLERY',
    image: '', caption: 'Biological inspiration is finally translated into scale, material and wearable form.' }
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

    this.el.addEventListener('model-loaded', () => this.onLoaded());
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
    this.caption = document.getElementById('exhibit-caption');
    this.intro   = document.getElementById('intro-msg');
    if (!this.prompt || !this.panel || !this.caption) return false;

    this.onPromptClick = () => this.open(this.active && this.active.id);
    this.prompt.addEventListener('click', this.onPromptClick);
    this.panel.querySelector('.panel-close').addEventListener('click', () => this.close());
    setTimeout(() => this.hideIntro(), 6500);
    this.ui = true;
    return true;
  },

  onLoaded() {
    const mesh = this.el.getObject3D('mesh');
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
        if (o) pos = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      }
      if (pos) this.items.push({ id, data, pos });
      else console.warn('[exhibit-info] sin ancla:', id, data.anchor || 'ventana');
    });
    console.log(`[exhibit-info] ${this.items.length} piezas activas`);
  },

  tick(time) {
    if (time < this.nextCheck || !this.items.length) return;
    this.nextCheck = time + 180;
    if (!this.wireUI()) return;

    const rig = document.getElementById('rig');
    if (!rig) return;
    const p = rig.object3D.getWorldPosition(this.tmp);

    let mejor = null, mejorD = Infinity, mejorTer = null, mejorTerD = Infinity;
    this.items.forEach((it) => {
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (it.data.tier === 'tertiary') {
        if (d < mejorTerD) { mejorTerD = d; mejorTer = it; }
      } else if (d < mejorD) { mejorD = d; mejor = it; }
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

    // ventanas: contenido pasivo, sin panel ni boton
    if (mejorTer && mejorTerD <= this.data.show + 0.6) {
      if (this.captionId !== mejorTer.id) {
        this.captionId = mejorTer.id;
        const d = mejorTer.data;
        this.caption.querySelector('.cap-num').textContent = d.number;
        this.caption.querySelector('.cap-title').textContent = d.title;
        this.caption.querySelector('.cap-text').textContent = d.caption;
        const img = this.caption.querySelector('.cap-img');
        if (d.image) { img.src = d.image; img.style.display = 'block'; }
        else { img.removeAttribute('src'); img.style.display = 'none'; }
        this.caption.classList.add('visible');
      }
    } else if (this.captionId) {
      this.captionId = null;
      this.caption.classList.remove('visible');
    }
  },

  open(id) {
    if (!id || !this.wireUI()) return;
    const it = this.items.find((i) => i.id === id);
    if (!it || it.data.tier === 'tertiary') return;
    const d = it.data;
    this.panel.querySelector('.panel-section').textContent = d.section || '';
    this.panel.querySelector('.panel-section').style.display = d.section ? 'block' : 'none';
    this.panel.querySelector('.panel-title').textContent = d.title;
    this.panel.querySelector('.panel-body').textContent = d.body;
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
AFRAME.registerComponent('exhibit-lighting', {
  init() {
    this.el.addEventListener('model-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;

    // piezas principales (mas presencia) y secundarias (acento discreto)
    const focos = [
      { anchor: 'BACTERIA_MASTER',       intensidad: 3.2, alcance: 7, angulo: 0.55, color: 0xfff0dc },
      { anchor: 'Exhibit_Mesh0_Capsule', intensidad: 2.6, alcance: 6, angulo: 0.55, color: 0xfff0dc },
      { anchor: 'PEANA_Bioreactor',      intensidad: 3.0, alcance: 7, angulo: 0.5,  color: 0xf2f6ff },
      { anchor: 'VITRINA_Campana_1',     intensidad: 1.3, alcance: 4, angulo: 0.45, color: 0xfff2e0 },
      { anchor: 'VITRINA_Campana_2',     intensidad: 1.3, alcance: 4, angulo: 0.45, color: 0xfff2e0 },
      { anchor: 'VITRINA_Campana_3',     intensidad: 1.3, alcance: 4, angulo: 0.45, color: 0xfff2e0 },
      { anchor: 'VITRINA_Campana_4',     intensidad: 1.3, alcance: 4, angulo: 0.45, color: 0xfff2e0 },
      { anchor: 'VITRINA_Campana_5',     intensidad: 1.3, alcance: 4, angulo: 0.45, color: 0xfff2e0 },
      { anchor: 'VITRINA_Campana_6',     intensidad: 1.3, alcance: 4, angulo: 0.45, color: 0xfff2e0 }
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
