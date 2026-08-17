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
  Rescales a loaded gltf-model so its real-world footprint matches
  the given length (largest horizontal dimension, X or Z) and height (Y),
  regardless of the units the model was exported with.
*/
AFRAME.registerComponent('scale-to-real-size', {
  schema: {
    length: { type: 'number', default: 11 },
    height: { type: 'number', default: 3 }
  },
  init() {
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      if (!mesh) return;

      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);

      const horizontal = Math.max(size.x, size.z);
      if (horizontal === 0 || size.y === 0) return;

      const scaleXZ = this.data.length / horizontal;
      const scaleY = this.data.height / size.y;
      this.el.object3D.scale.set(scaleXZ, scaleY, scaleXZ);

      console.log('[scale-to-real-size] original size (m):', size,
        '-> scale applied:', { scaleXZ, scaleY });
    });
  }
});

/*
  The Blender export bakes ~46 point/directional lights into the GLB
  (LUZ_*, REBOTE_*) with raw-wattage intensities in the thousands
  (e.g. 46000+), because Blender's light power (W) isn't the same unit
  as glTF's photometric intensity (candela/lux). Left as-is they blow out
  the whole render to white regardless of the scene's own lights.
  This strips them out on load so only the scene lights (in index.html)
  illuminate the model.
*/
AFRAME.registerComponent('strip-embedded-lights', {
  init() {
    this.el.addEventListener('model-loaded', () => {
      const root = this.el.getObject3D('mesh');
      if (!root) return;
      const found = [];
      root.traverse((o) => {
        if (o.isLight) found.push(o);
      });
      found.forEach((light) => {
        light.intensity = 0;
        light.visible = false;
        if (light.parent) light.parent.remove(light);
      });
      console.log(`[strip-embedded-lights] removed ${found.length} baked lights from the model`);
    });
  }
});

// Attach to all gltf-model entities automatically
AFRAME.scenes[0]?.addEventListener('loaded', () => {
  document.querySelectorAll('[gltf-model]').forEach(el => {
    el.setAttribute('log-when-loaded', '');
  });
});
