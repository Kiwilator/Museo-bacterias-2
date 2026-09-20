/* Video windows: preserve each MP4 exactly as encoded. No source rotation. */
(() => {
  if (window.__MUSEO_VIDEO_WINDOW_WORLD_FIT__) return;
  window.__MUSEO_VIDEO_WINDOW_WORLD_FIT__ = true;

  const SOURCE_OVERRIDES = {
    'ppb-video-window-02': './assets/videos/biomass.mp4?v=20260920-video-fit5',
    'ppb-video-window-04': './assets/videos/rhodomicrobium-vannielii-animation.mp4?v=20260920-video-fit5'
  };

  const VIDEO_BY_MESH = {
    'Mesh_0.004': 'ppb-video-window-01',
    'Mesh_1.004': 'ppb-video-window-02', // upper right
    'Mesh_2.003': 'ppb-video-window-03', // left / flow + mixing
    'Mesh_3.003': 'ppb-video-window-04'  // lower right
  };

  const liveMaterials = [];
  const liveTextures = [];
  const fitHandlers = [];

  function overrideSources() {
    Object.entries(SOURCE_OVERRIDES).forEach(([id, src]) => {
      const video = document.getElementById(id);
      if (!video) return;
      if ((video.getAttribute('src') || '') === src) return;
      video.setAttribute('src', src);
      video.load();
    });
  }

  function clearResources() {
    while (fitHandlers.length) {
      const { video, fn } = fitHandlers.pop();
      video.removeEventListener('loadedmetadata', fn);
      video.removeEventListener('resize', fn);
    }
    while (liveMaterials.length) liveMaterials.pop().dispose();
    while (liveTextures.length) liveTextures.pop().dispose();
  }

  function worldPlanarUvs(screen) {
    const source = screen.geometry;
    if (!source) return { geometry: source, aspect: 1 };

    const geometry = source.clone();
    const pos = geometry.getAttribute('position');
    if (!pos || !pos.count) return { geometry, aspect: 1 };

    screen.updateWorldMatrix(true, false);
    const world = [];
    const p = new THREE.Vector3();

    let cx = 0, cz = 0;
    let minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < pos.count; i++) {
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(screen.matrixWorld);
      const q = p.clone();
      world.push(q);
      cx += q.x;
      cz += q.z;
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }

    cx /= world.length;
    cz /= world.length;

    // Find the real horizontal direction of the window in WORLD XZ space.
    // This removes any local rotation inherited from Rhino/Blender nodes.
    let cxx = 0, cxz = 0, czz = 0;
    world.forEach((q) => {
      const dx = q.x - cx;
      const dz = q.z - cz;
      cxx += dx * dx;
      cxz += dx * dz;
      czz += dz * dz;
    });

    let hx = 1, hz = 0;
    if (Math.abs(cxz) > 1e-9 || Math.abs(cxx - czz) > 1e-9) {
      const theta = 0.5 * Math.atan2(2 * cxz, cxx - czz);
      hx = Math.cos(theta);
      hz = Math.sin(theta);
    }

    // Stable sign only prevents random mirroring between reloads.
    if ((Math.abs(hx) >= Math.abs(hz) && hx < 0) ||
        (Math.abs(hz) > Math.abs(hx) && hz < 0)) {
      hx = -hx;
      hz = -hz;
    }

    let minH = Infinity, maxH = -Infinity;
    const hValues = world.map((q) => {
      const h = (q.x - cx) * hx + (q.z - cz) * hz;
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      return h;
    });

    const spanH = Math.max(1e-6, maxH - minH);
    const spanV = Math.max(1e-6, maxY - minY);
    const uv = new Float32Array(pos.count * 2);

    for (let i = 0; i < pos.count; i++) {
      // Literal mapping requested:
      // video horizontal -> real horizontal of the window
      // video vertical   -> real vertical of the museum
      uv[i * 2] = (hValues[i] - minH) / spanH;
      uv[i * 2 + 1] = (world[i].y - minY) / spanV;
    }

    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return { geometry, aspect: spanH / spanV };
  }

  function fitCover(texture, video, targetAspect) {
    if (!video.videoWidth || !video.videoHeight) return;
    const sourceAspect = video.videoWidth / video.videoHeight;
    let repeatX = 1;
    let repeatY = 1;

    // Scale only. No rotation, no axis swap, no non-uniform distortion.
    if (sourceAspect > targetAspect) {
      repeatX = Math.max(1e-6, targetAspect / sourceAspect);
    } else {
      repeatY = Math.max(1e-6, sourceAspect / targetAspect);
    }

    texture.repeat.set(repeatX, repeatY);
    texture.offset.set((1 - repeatX) * 0.5, (1 - repeatY) * 0.5);
    texture.needsUpdate = true;
  }

  function applyFix() {
    overrideSources();

    const entity = document.getElementById('video-window-model');
    if (!entity) return false;
    const model = entity.getObject3D('mesh');
    if (!model) return false;

    clearResources();
    model.updateWorldMatrix(true, true);

    const screens = [];
    model.traverse((o) => { if (o.isMesh) screens.push(o); });

    let corrected = 0;
    screens.forEach((screen) => {
      const videoId = VIDEO_BY_MESH[screen.name];
      const video = videoId && document.getElementById(videoId);
      if (!video) return;

      const mapped = worldPlanarUvs(screen);
      screen.geometry = mapped.geometry;

      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      const updateFit = () => fitCover(texture, video, mapped.aspect);
      video.addEventListener('loadedmetadata', updateFit);
      video.addEventListener('resize', updateFit);
      fitHandlers.push({ video, fn: updateFit });
      updateFit();

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      material.name = `Museum_Video_WorldUpright_${screen.name}`;

      screen.material = material;
      screen.userData.museumVideo = video;
      screen.renderOrder = 3;
      screen.castShadow = false;
      screen.receiveShadow = false;

      liveTextures.push(texture);
      liveMaterials.push(material);
      corrected++;

      const play = video.play();
      if (play && play.catch) play.catch(() => {});
    });

    if (entity.hasAttribute('video-window-materials')) {
      entity.removeAttribute('video-window-materials');
    }

    console.log(`[video-window-fit] ${corrected}/${screens.length}: source unchanged, world-upright projection, cover only`);
    return corrected > 0;
  }

  function install() {
    const entity = document.getElementById('video-window-model');
    if (!entity) { window.setTimeout(install, 100); return; }

    const reapply = () => window.setTimeout(applyFix, 40);
    entity.addEventListener('model-loaded', reapply);

    const scene = document.querySelector('a-scene');
    if (scene) {
      scene.addEventListener('loaded', reapply);
      scene.addEventListener('renderstart', reapply, { once: true });
      scene.addEventListener('museo-ready', reapply);
    }

    // One late pass catches the room widening/repositioning done after GLB load.
    window.setTimeout(applyFix, 1200);
    if (!applyFix()) window.setTimeout(applyFix, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();