/* Preserve video aspect ratio in the four custom museum windows and correct the window assignments. */
(() => {
  if (window.__MUSEO_VIDEO_WINDOW_FIT__) return;
  window.__MUSEO_VIDEO_WINDOW_FIT__ = true;

  const SOURCE_OVERRIDES = {
    // Upper-right window: biomass belongs here.
    'ppb-video-window-02': './assets/videos/biomass.mp4?v=20260920-video-fit2',
    // Lower-right window: restore the video that occupied this screen before biomass was moved here.
    'ppb-video-window-04': './assets/videos/rhodomicrobium-vannielii-animation.mp4?v=20260920-video-fit2'
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
      const current = video.getAttribute('src') || '';
      if (current === src) return;
      video.setAttribute('src', src);
      video.load();
    });
  }

  function normalizeAndOrientUvs(geometry) {
    if (!geometry) return geometry;
    const cloned = geometry.clone();
    const uv = cloned.getAttribute('uv');
    if (!uv || !uv.count) return cloned;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }

    const spanU = Math.max(1e-6, maxU - minU);
    const spanV = Math.max(1e-6, maxV - minV);

    for (let i = 0; i < uv.count; i++) {
      const u = (uv.getX(i) - minU) / spanU;
      const v = (uv.getY(i) - minV) / spanV;

      // Rhino/Blender exported these window UVs with the image axes exchanged:
      // U follows the physical vertical axis and V the horizontal one. Rotate
      // the UV coordinates 90 degrees clockwise so portrait videos stay upright.
      uv.setXY(i, v, 1 - u);
    }

    uv.needsUpdate = true;
    return cloned;
  }

  function screenAspectFor(screen) {
    const geometry = screen.geometry;
    if (!geometry) return 1;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const height = Math.max(1e-6, box.max.y - box.min.y);
    const width = Math.max(1e-6, box.max.z - box.min.z);
    return width / height;
  }

  function fitVideoTexture(texture, video, screenAspect) {
    if (!texture || !video) return;
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) return;

    const videoAspect = vw / vh;
    let repeatX = 1;
    let repeatY = 1;

    // Equivalent to CSS object-fit: cover. It fills the whole irregular window,
    // crops only the excess and never stretches the video.
    if (videoAspect > screenAspect) {
      repeatX = Math.max(1e-6, screenAspect / videoAspect);
    } else {
      repeatY = Math.max(1e-6, videoAspect / screenAspect);
    }

    texture.repeat.set(repeatX, repeatY);
    texture.offset.set((1 - repeatX) * 0.5, (1 - repeatY) * 0.5);
    texture.needsUpdate = true;
  }

  function disposePreviousCustomResources() {
    while (fitHandlers.length) {
      const { video, handler } = fitHandlers.pop();
      video.removeEventListener('loadedmetadata', handler);
      video.removeEventListener('resize', handler);
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

    disposePreviousCustomResources();

    const screens = [];
    model.traverse((object) => {
      if (object.isMesh) screens.push(object);
    });

    let corrected = 0;
    screens.forEach((screen) => {
      const videoId = VIDEO_BY_MESH[screen.name];
      if (!videoId) return;
      const video = document.getElementById(videoId);
      if (!video) return;

      // Normalize the exported UV range and rotate it to the real window
      // orientation before applying the aspect-ratio crop.
      screen.geometry = normalizeAndOrientUvs(screen.geometry);
      const screenAspect = screenAspectFor(screen);

      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      const updateFit = () => fitVideoTexture(texture, video, screenAspect);
      updateFit();
      video.addEventListener('loadedmetadata', updateFit);
      video.addEventListener('resize', updateFit);
      fitHandlers.push({ video, handler: updateFit });

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      material.name = `Museum_Video_Fitted_${screen.name}`;

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

    // The original component is no longer needed. Removing it disposes its old,
    // stretched materials/textures while leaving the fitted replacements above.
    if (entity.hasAttribute('video-window-materials')) {
      entity.removeAttribute('video-window-materials');
    }

    console.log(`[video-window-fit] ${corrected}/${screens.length} ventanas corregidas, proporcionadas y orientadas`);
    return corrected > 0;
  }

  function install() {
    const entity = document.getElementById('video-window-model');
    if (!entity) {
      window.setTimeout(install, 100);
      return;
    }

    entity.addEventListener('model-loaded', () => {
      window.setTimeout(applyFix, 0);
    });

    if (!applyFix()) {
      window.setTimeout(applyFix, 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
