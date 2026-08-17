/* Basic helpers for positioning + quick debug in console */
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
     whole render out to white regardless of the scene's own lights.
  2. Rescales the model so its real-world footprint matches `length`
     (largest horizontal dimension) and `height`, regardless of the units
     it was exported with.
  3. Re-measures the world-space bounding box AFTER scaling, and:
     - moves the camera rig (#rig) to spawn at the model's real floor
       (box.min.y) + eye height, centered horizontally — so you start
       inside the space instead of outside it, and at head height instead
       of near the ceiling.
     - stores the horizontal bounds (shrunk by `wallMargin`) on
       window.MUSEO_BOUNDS so the `clamp-to-bounds` component can keep the
       camera from walking through the walls.
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
    console.log(`[setup-museum-model] removed ${lights.length} baked lights`);

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
    console.log('[setup-museum-model] original size (m):', size);

    // 3) re-measure in world space after scaling, spawn camera + set bounds
    this.el.object3D.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const rig = document.querySelector('#rig');
    if (rig) {
      rig.object3D.position.set(center.x, box.min.y + this.data.eyeHeight, center.z);
    }

    const m = this.data.wallMargin;
    window.MUSEO_BOUNDS = {
      minX: box.min.x + m, maxX: box.max.x - m,
      minZ: box.min.z + m, maxZ: box.max.z - m
    };

    // 4) detect free-standing "blocks" (peanas, vitrinas...) to collide with:
    // any individual mesh whose own footprint/height looks like furniture
    // resting on the floor, as opposed to the walls/floor/ceiling shell
    // (which are one big continuous mesh spanning most of the room).
    const obstacles = [];
    const floorY = box.min.y;
    const objBox = new THREE.Box3();
    const objSize = new THREE.Vector3();
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      objBox.setFromObject(o);
      objBox.getSize(objSize);
      const footprint = Math.max(objSize.x, objSize.z);
      const restsOnFloor = (objBox.min.y - floorY) < 0.6;
      const looksLikeFurniture = footprint >= 0.3 && footprint <= 3 &&
        objSize.y >= 0.15 && objSize.y <= 2.2;
      if (restsOnFloor && looksLikeFurniture) {
        obstacles.push({
          minX: objBox.min.x - this.data.wallMargin, maxX: objBox.max.x + this.data.wallMargin,
          minZ: objBox.min.z - this.data.wallMargin, maxZ: objBox.max.z + this.data.wallMargin,
          name: o.name
        });
      }
    });
    window.MUSEO_OBSTACLES = obstacles;

    console.log('[setup-museum-model] world bbox', box.min, box.max,
      '-> spawn at', rig ? rig.object3D.position : null,
      '-> bounds', window.MUSEO_BOUNDS,
      `-> ${obstacles.length} obstacles`, obstacles.map(o => o.name));
  }
});

/*
  Keeps the entity it's on (the camera, moved by wasd-controls) from
  leaving window.MUSEO_BOUNDS — set once setup-museum-model has measured
  the model. This is a simple horizontal bounding-box clamp, not real mesh
  collision, but it's enough to stop you from walking through the outer
  walls of a single continuous room like this one.
*/
AFRAME.registerComponent('clamp-to-bounds', {
  init() {
    this.worldPos = new THREE.Vector3();
  },
  tick() {
    const b = window.MUSEO_BOUNDS;
    if (!b) return;
    const obj = this.el.object3D;
    obj.getWorldPosition(this.worldPos);
    let x = this.worldPos.x;
    let z = this.worldPos.z;

    // outer walls
    x = THREE.MathUtils.clamp(x, b.minX, b.maxX);
    z = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);

    // individual blocks (peanas, vitrinas...) — push back out to the
    // nearest edge if we ended up inside one
    const obstacles = window.MUSEO_OBSTACLES;
    if (obstacles) {
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
      }
    }

    if (x !== this.worldPos.x) obj.position.x += (x - this.worldPos.x);
    if (z !== this.worldPos.z) obj.position.z += (z - this.worldPos.z);
  }
});

/*
  Fixes the emissive LED strips (CINTA_Peana_Mesh_* on the peanas, and
  CONTORNO_Nicho_Mesh_* on the niche rims — 23-50 turquoise, 51 purple) and
  adds a fake glow/halo:

  1. MATERIAL FIX: the baked material's emissiveFactor for the turquoise
     strips is ~(0.03, 1.0, 0.95) — two channels almost maxed. Under
     ACESFilmic tone mapping that reads as near-white regardless of scene
     lighting, which is why the niches showed no visible color at all.
     Fix: give each strip its own black-albedo material with a hand-picked
     saturated emissive color and `toneMapped = false`, so it renders that
     exact color always, independent of the room's general brightness —
     this is also what lets "iluminación general" and "neón visible" stop
     fighting each other.
  2. FAKE GLOW: clones the strip's geometry, slightly larger, unlit +
     additive + low opacity, to fake a bloom halo since there's no real
     bloom post-process. Cheap: ~39 extra unlit transparent draw calls,
     no extra lights.
*/
AFRAME.registerComponent('fake-glow-test', {
  init() {
    this.el.addEventListener('model-loaded', () => this.onLoaded());
  },
  onLoaded() {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;

    const purple = 0x8a3ff0;
    const turquoise = 0x00e0b0;
    const targets = [
      { name: 'CINTA_Peana_Mesh_0', color: purple },
      { name: 'CINTA_Peana_Mesh_1', color: purple },
      { name: 'CINTA_Peana_Mesh_2', color: purple },
      { name: 'CINTA_Peana_Mesh_3', color: purple },
      { name: 'CINTA_Peana_Mesh_4', color: purple },
      { name: 'CINTA_Peana_Mesh_5', color: purple },
      { name: 'CINTA_Peana_Mesh_6', color: purple },
      { name: 'CINTA_Peana_Mesh_7', color: purple },
      { name: 'CINTA_Peana_Mesh_20', color: turquoise },
      { name: 'CINTA_Peana_Mesh_21', color: turquoise }
    ];
    for (let i = 23; i <= 50; i++) targets.push({ name: `CONTORNO_Nicho_Mesh_${i}`, color: turquoise });
    targets.push({ name: 'CONTORNO_Nicho_Mesh_51', color: purple });

    targets.forEach(({ name, color }) => {
      const strip = mesh.getObjectByName(name);
      if (!strip || !strip.isMesh) {
        console.warn(`[fake-glow-test] strip not found: ${name}`);
        return;
      }

      // 1) material fix — saturated, tone-mapping-proof emissive
      strip.material = strip.material.clone();
      strip.material.color.setHex(0x000000);
      strip.material.emissive.setHex(color);
      strip.material.emissiveIntensity = 1.0;
      strip.material.toneMapped = false;
      strip.material.needsUpdate = true;

      // 2) fake glow halo
      const geo = strip.geometry.clone();
      geo.computeBoundingBox();
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z);

      const glowMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const glow = new THREE.Mesh(geo, glowMat);
      glow.name = name + '_glow_TEST';
      glow.position.copy(strip.position).add(
        center.clone().applyQuaternion(strip.quaternion).multiply(strip.scale)
      );
      glow.quaternion.copy(strip.quaternion);
      glow.scale.copy(strip.scale).multiplyScalar(1.18);
      glow.renderOrder = 1;

      strip.parent.add(glow);
    });
    console.log(`[fake-glow-test] fixed material + glow on ${targets.length} strips`);
  }
});

// Attach to all gltf-model entities automatically
AFRAME.scenes[0]?.addEventListener('loaded', () => {
  document.querySelectorAll('[gltf-model]').forEach(el => {
    el.setAttribute('log-when-loaded', '');
  });
});
