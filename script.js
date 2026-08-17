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
    eyeHeight: { type: 'number', default: 1.6 }
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

    console.log('[setup-museum-model] world bbox', box.min, box.max,
      '-> spawn at', rig ? rig.object3D.position : null,
      '-> bounds', window.MUSEO_BOUNDS);
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
    const clampedX = THREE.MathUtils.clamp(this.worldPos.x, b.minX, b.maxX);
    const clampedZ = THREE.MathUtils.clamp(this.worldPos.z, b.minZ, b.maxZ);
    if (clampedX !== this.worldPos.x) obj.position.x += (clampedX - this.worldPos.x);
    if (clampedZ !== this.worldPos.z) obj.position.z += (clampedZ - this.worldPos.z);
  }
});

// Attach to all gltf-model entities automatically
AFRAME.scenes[0]?.addEventListener('loaded', () => {
  document.querySelectorAll('[gltf-model]').forEach(el => {
    el.setAttribute('log-when-loaded', '');
  });
});
