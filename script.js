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
    this.pitch = this.el.object3D.rotation.x;
    this.yaw = this.el.object3D.rotation.y;
    const maxPitch = Math.PI / 2 - 0.05;

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
    const floorY = box.min.y;

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
      const footprint = Math.max(objSize.x, objSize.z);
      const restsOnFloor = (objBox.min.y - floorY) < 0.6;
      const looksLikeFurniture = footprint >= 0.3 && footprint <= 3 &&
        objSize.y >= 0.15 && objSize.y <= 2.2;
      if (restsOnFloor && looksLikeFurniture) {
        objBox.getCenter(objCenter);
        const id = `peana-${peanaIndex++}`;
        o.userData.museoType = 'peana';
        o.userData.museoId = id;
        o.name = o.name || id;
        obstacles.push({
          minX: objBox.min.x - this.data.wallMargin, maxX: objBox.max.x + this.data.wallMargin,
          minZ: objBox.min.z - this.data.wallMargin, maxZ: objBox.max.z + this.data.wallMargin,
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

    // 4b) real floor meshes (children of the 'suelo' node), for an actual
    // ground-collision check. This room's outer wall is a curved/organic
    // shape, not a rectangle, so MUSEO_BOUNDS above is only a coarse outer
    // limit — plenty of points inside that rectangle are past the real
    // wall, over nothing. clamp-to-bounds raycasts against these meshes to
    // catch that (see isGrounded below) instead of letting the player walk
    // off the edge of the model into empty space.
    const floorRoot = mesh.getObjectByName('suelo');
    const floorMeshes = [];
    if (floorRoot) {
      floorRoot.traverse((o) => { if (o.isMesh) floorMeshes.push(o); });
    }
    window.MUSEO_FLOOR_MESHES = floorMeshes;
    if (!floorMeshes.length) {
      console.warn('[setup-museum-model] no floor mesh found under "suelo" — ground-collision check disabled, falling back to rectangle bounds only');
    }

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
function isGrounded(x, z, floorMeshes, refY) {
  if (!floorMeshes || !floorMeshes.length) return true;
  groundRayOrigin.set(x, refY + 5, z);
  groundRaycaster.set(groundRayOrigin, groundRayDir);
  groundRaycaster.far = 10;
  return groundRaycaster.intersectObjects(floorMeshes, false).length > 0;
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

/*
  A handful of short-range, no-shadow point lights near the LED strips, so
  the emissive geometry (the real "light source") lightly contaminates the
  floor / peana base / nearby wall instead of glowing in isolation.
  Deliberately restrained (16, not 40+): the emissive strips themselves
  carry the visual read, these are just a soft supporting bounce. Positions
  are the real bounding-box centers of the matching Neon_Ring_Mesh and
  Neon_Window_Batch2 / Neon_Window_Extra meshes in museo_bacterias.glb
  (measured directly from the exported glTF, not eyeballed), so they land
  on the actual geometry, not the old test model's floor plan.
  Generated from one array (not duplicated per-light HTML) so the count/
  values are easy to retune from a single place.
*/
AFRAME.registerComponent('neon-support-lights', {
  init() {
    this.el.addEventListener('model-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const purple = 0x9b5cff;
    const turquoise = 0x28d7e5;
    const configs = [
      // anillos de suelo bajo cada peana — morados (alcance corto)
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-0.920, 0.050, -3.683] },
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-0.676, 0.050, -0.337] },
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-2.482, 0.050, -3.626] },
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-2.403, 0.050, -2.853] },
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-2.215, 0.050, -2.113] },
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-1.871, 0.050, 1.498] },
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-2.057, 0.050, 2.253] },
      { color: purple, intensity: 2.1, distance: 2.9, pos: [-2.130, 0.050, 3.013] },
      // anillos de suelo — turquesa (alcance corto)
      { color: turquoise, intensity: 2.1, distance: 2.9, pos: [0.976, 0.050, -0.835] },
      { color: turquoise, intensity: 2.1, distance: 2.9, pos: [0.722, 0.050, -3.598] },
      // nichos repartidos por altura/pared — turquesa (rebote suave)
      { color: turquoise, intensity: 1.7, distance: 3.2, pos: [0.495, 2.679, -4.973] },
      { color: turquoise, intensity: 1.7, distance: 3.2, pos: [0.798, 5.305, 3.080] },
      { color: turquoise, intensity: 1.7, distance: 3.2, pos: [1.538, 1.363, 1.241] },
      { color: turquoise, intensity: 1.7, distance: 3.2, pos: [2.250, 1.288, -3.618] },
      // tira larga del techo (Neon_Window_CeilingWindow, ~8m) — un par de
      // puntos de rebote a lo largo de su recorrido
      { color: purple, intensity: 2.1, distance: 3.8, pos: [-0.868, 3.865, -3.090] },
      { color: purple, intensity: 2.1, distance: 3.8, pos: [-0.868, 3.865, 1.690] }
    ];

    configs.forEach(({ color, intensity, distance, pos }) => {
      const light = new THREE.PointLight(color, intensity, distance, 2);
      light.position.set(pos[0], pos[1], pos[2]);
      light.castShadow = false;
      this.el.object3D.add(light);
    });
    console.log(`[neon-support-lights] added ${configs.length} support lights`);
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
