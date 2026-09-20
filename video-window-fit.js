/* Video windows: use each source video exactly as encoded. No rotation, no canvas orientation changes. */
(() => {
  if (window.__MUSEO_VIDEO_WINDOW_DIRECT_FIT__) return;
  window.__MUSEO_VIDEO_WINDOW_DIRECT_FIT__ = true;

  const SOURCE_OVERRIDES = {
    'ppb-video-window-02': './assets/videos/biomass.mp4?v=20260920-video-fit4',
    'ppb-video-window-04': './assets/videos/rhodomicrobium-vannielii-animation.mp4?v=20260920-video-fit4'
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

  function buildPlanarUvs(geometry) {
    if (!geometry) return geometry;
    const cloned = geometry.clone();
    const pos = cloned.getAttribute('position');
    if (!pos) return cloned;

    cloned.computeBoundingBox();
    const box = cloned.boundingBox;
    const spanY = Math.max(1e-6, box.max.y - box.min.y);
    const spanZ = Math.max(1e-6, box.max.z - box.min.z);
    const uv = new Float32Array(pos.count * 2);

    for (let i = 0; i < pos.count; i++) {
      // Video axes are preserved exactly: horizontal video axis -> horizontal
      // window axis (Z), vertical video axis -> vertical window axis (Y).
      const u = (pos.getZ(i) - box.min.z) / spanZ;
      const v = (pos.getY(i) - box.min.y) / spanY;
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
    }

    cloned.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return cloned;
  }

  function screenAspect(screen) {
    const g = screen.geometry;
    g.computeBoundingBox();
    const b = g.boundingBox;
    const width = Math.max(1e-6, b.max.z - b.min.z);
    const height = Math.max(1e-6, b.max.y - b.min.y);
    return width / height;
  }

  function fitCover(texture, video, targetAspect) {
    if (!texture || !video || !video.videoWidth || !video.videoHeight) return;

    const sourceAspect = video.videoWidth / video.videoHeight;
    let repeatX = 1;
    let repeatY = 1;

    // CSS object-fit: cover equivalent. Fill the complete window and crop only
    // the excess. No rotation and no non-uniform stretching are ever applied.
    if (sourceAspect > targetAspect) {
      repeatX = Math.max(1e-6, targetAspect / sourceAspect);
    } else {
      repeatY = Math.max(1e-6, sourceAspect / targetAspect);
    }

    texture.repeat.set(repeatX, repeatY);
    texture.offset.set((1 - repeatX) * 0.5, (1 - repeatY) * 0.5);
    texture.needsUpdate = true;
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

  function applyFix() {
    overrideSources();

    const entity = document.getElementById('video-window-model');
    if (!entity) return false;
    const model = entity.getObject3D('mesh');
    if (!model) return false;

    clearResources();

    const screens = [];
    model.traverse((o) => { if (o.isMesh) screens.push(o); });

    let corrected = 0;
    screens.forEach((screen) => {
      const videoId = VIDEO_BY_MESH[screen.name];
      const video = videoId && document.getElementById(videoId);
      if (!video) return;

      // Ignore the exported UV orientation completely. The video is projected
      // directly in the physical Y/Z plane of the window, with no rotation.
      screen.geometry = buildPlanarUvs(screen.geometry);
      const targetAspect = screenAspect(screen);

      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = true;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      const updateFit = () => fitCover(texture, video, targetAspect);
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
      material.name = `Museum_Video_Direct_${screen.name}`;

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

    console.log(`[video-window-fit] ${corrected}/${screens.length}: direct video, no rotation, cover only`);
    return corrected > 0;
  }

  function install() {
    const entity = document.getElementById('video-window-model');
    if (!entity) { window.setTimeout(install, 100); return; }
    entity.addEventListener('model-loaded', () => window.setTimeout(applyFix, 0));
    if (!applyFix()) window.setTimeout(applyFix, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
