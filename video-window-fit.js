/* Robust video fitting for the four custom museum windows. */
(() => {
  if (window.__MUSEO_VIDEO_WINDOW_CANVAS_FIX__) return;
  window.__MUSEO_VIDEO_WINDOW_CANVAS_FIX__ = true;

  const SOURCE_OVERRIDES = {
    'ppb-video-window-02': './assets/videos/biomass.mp4?v=20260920-video-fit3',
    'ppb-video-window-04': './assets/videos/rhodomicrobium-vannielii-animation.mp4?v=20260920-video-fit3'
  };

  const VIDEO_BY_MESH = {
    'Mesh_0.004': 'ppb-video-window-01',
    'Mesh_1.004': 'ppb-video-window-02',
    'Mesh_2.003': 'ppb-video-window-03',
    'Mesh_3.003': 'ppb-video-window-04'
  };

  const resources = [];

  function overrideSources() {
    Object.entries(SOURCE_OVERRIDES).forEach(([id, src]) => {
      const video = document.getElementById(id);
      if (!video) return;
      if ((video.getAttribute('src') || '') === src) return;
      video.setAttribute('src', src);
      video.load();
    });
  }

  function rebuildWindowUvs(geometry) {
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
      // Physical horizontal axis = Z. Physical vertical axis = Y.
      uv[i * 2] = (pos.getZ(i) - box.min.z) / spanZ;
      uv[i * 2 + 1] = (pos.getY(i) - box.min.y) / spanY;
    }
    cloned.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return cloned;
  }

  function targetAspect(screen) {
    const g = screen.geometry;
    g.computeBoundingBox();
    const b = g.boundingBox;
    const h = Math.max(1e-6, b.max.y - b.min.y);
    const w = Math.max(1e-6, b.max.z - b.min.z);
    return w / h;
  }

  function makeCanvasForAspect(aspect) {
    const maxSide = MUSEO_IS_MOBILE ? 384 : 640;
    let width, height;
    if (aspect >= 1) {
      width = maxSide;
      height = Math.max(256, Math.round(maxSide / aspect));
    } else {
      height = maxSide;
      width = Math.max(256, Math.round(maxSide * aspect));
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function drawCover(ctx, canvas, video, rotate90) {
    if (!video.videoWidth || !video.videoHeight) return;

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#020707';
    ctx.fillRect(0, 0, cw, ch);

    let sw = video.videoWidth;
    let sh = video.videoHeight;
    let dw, dh, dx, dy;

    if (rotate90) {
      // After rotation the effective source dimensions are exchanged.
      const rotatedAspect = sh / sw;
      const canvasAspect = cw / ch;
      if (rotatedAspect > canvasAspect) {
        dh = ch;
        dw = dh * rotatedAspect;
      } else {
        dw = cw;
        dh = dw / rotatedAspect;
      }
      dx = (cw - dw) / 2;
      dy = (ch - dh) / 2;

      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(Math.PI / 2);
      // Coordinates are now in the rotated canvas coordinate system.
      ctx.drawImage(video, -dh / 2, -dw / 2, dh, dw);
    } else {
      const videoAspect = sw / sh;
      const canvasAspect = cw / ch;
      if (videoAspect > canvasAspect) {
        dh = ch;
        dw = dh * videoAspect;
      } else {
        dw = cw;
        dh = dw / videoAspect;
      }
      dx = (cw - dw) / 2;
      dy = (ch - dh) / 2;
      ctx.drawImage(video, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  function installFramePump(video, canvas, texture, rotate90) {
    const ctx = canvas.getContext('2d', { alpha: false });
    let stopped = false;
    let fallbackTimer = 0;

    const render = () => {
      if (stopped) return;
      if (video.readyState >= 2) {
        drawCover(ctx, canvas, video, rotate90);
        texture.needsUpdate = true;
      }
    };

    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      const tick = () => {
        if (stopped) return;
        render();
        video.requestVideoFrameCallback(tick);
      };
      video.requestVideoFrameCallback(tick);
    } else {
      fallbackTimer = window.setInterval(render, 33);
    }

    render();
    return () => {
      stopped = true;
      if (fallbackTimer) window.clearInterval(fallbackTimer);
    };
  }

  function clearResources() {
    while (resources.length) {
      const r = resources.pop();
      if (r.stop) r.stop();
      if (r.material) r.material.dispose();
      if (r.texture) r.texture.dispose();
    }
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

      screen.geometry = rebuildWindowUvs(screen.geometry);
      const aspect = targetAspect(screen);
      const canvas = makeCanvasForAspect(aspect);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        toneMapped: false
      });

      const decideAndStart = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        const sourceAspect = video.videoWidth / video.videoHeight;
        const targetIsPortrait = aspect < 1;
        const sourceIsPortrait = sourceAspect < 1;
        const rotate90 = targetIsPortrait !== sourceIsPortrait;

        const old = resources.find((r) => r.screen === screen);
        if (old && old.stop) old.stop();
        const stop = installFramePump(video, canvas, texture, rotate90);
        const entry = resources.find((r) => r.screen === screen);
        if (entry) entry.stop = stop;

        console.log(`[video-window-fit] ${screen.name}: source ${video.videoWidth}x${video.videoHeight}, target aspect ${aspect.toFixed(2)}, rotate90=${rotate90}`);
      };

      screen.material = material;
      screen.userData.museumVideo = video;
      screen.renderOrder = 3;
      screen.castShadow = false;
      screen.receiveShadow = false;

      const entry = { screen, texture, material, stop: null };
      resources.push(entry);

      video.addEventListener('loadedmetadata', decideAndStart, { once: true });
      if (video.readyState >= 1) decideAndStart();

      const play = video.play();
      if (play && play.catch) play.catch(() => {});
      corrected++;
    });

    if (entity.hasAttribute('video-window-materials')) {
      entity.removeAttribute('video-window-materials');
    }

    console.log(`[video-window-fit] ${corrected}/${screens.length} ventanas usando canvas orientado`);
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
