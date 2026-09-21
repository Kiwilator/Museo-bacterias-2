/* Single source of truth for the four GLB media-window meshes. */
(() => {
  if (window.__MUSEO_VIDEO_WINDOW_FIT__) return;
  window.__MUSEO_VIDEO_WINDOW_FIT__ = true;

  const MEDIA_BY_MESH = {
    'Mesh_0.004': {
      videoId: 'ppb-video-window-01',
      src: './assets/videos/nutrientes.mp4?v=20260921-final1',
      invertV: false
    },
    'Mesh_1.004': {
      videoId: 'ppb-video-window-02',
      src: './assets/videos/biomass.mp4?v=20260921-final1',
      invertV: true
    },
    'Mesh_2.003': {
      videoId: 'ppb-video-window-03',
      src: './assets/videos/flow-mixing.mp4?v=20260921-final1',
      invertV: true
    },
    'Mesh_3.003': {
      imageId: 'window-art-horizontal',
      src: './assets/images/window-art-horizontal.png?v=20260921-images1',
      invertV: false,
      zoom: 1.58
    }
  };

  const configByRuntimeName = new Map(
    Object.entries(MEDIA_BY_MESH).map(([meshName, config]) => [
      meshName.replace(/[^A-Za-z0-9]/g, ''),
      { meshName, ...config }
    ])
  );
  const materials = [];
  const textures = [];
  const geometries = [];
  const listeners = [];
  let appliedModel = null;

  function roomCenter() {
    const bounds = window.MUSEO_BOUNDS;
    if (bounds) {
      return new THREE.Vector3(
        (bounds.minX + bounds.maxX) * 0.5,
        0,
        (bounds.minZ + bounds.maxZ) * 0.5
      );
    }
    return new THREE.Vector3(0, 0, 0);
  }

  function horizontalWorldAxis(points, screenCenter) {
    let meanX = 0;
    let meanZ = 0;
    points.forEach((point) => { meanX += point.x; meanZ += point.z; });
    meanX /= points.length;
    meanZ /= points.length;

    let xx = 0;
    let xz = 0;
    let zz = 0;
    points.forEach((point) => {
      const x = point.x - meanX;
      const z = point.z - meanZ;
      xx += x * x;
      xz += x * z;
      zz += z * z;
    });

    const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
    const horizontal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
    const front = horizontal.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const towardRoom = roomCenter().sub(screenCenter).setY(0);
    if (front.dot(towardRoom) < 0) horizontal.negate();
    return horizontal;
  }

  function worldCoverGeometry(screen, invertV) {
    const geometry = screen.geometry.clone();
    const position = geometry.getAttribute('position');
    if (!position || !position.count) return { geometry, aspect: 1 };

    screen.updateWorldMatrix(true, false);
    const points = [];
    const point = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(screen.matrixWorld);
      points.push(point.clone());
      center.add(point);
    }
    center.multiplyScalar(1 / points.length);

    const horizontal = horizontalWorldAxis(points, center);
    let minH = Infinity;
    let maxH = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const projected = points.map((worldPoint) => {
      const h = worldPoint.dot(horizontal);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      minY = Math.min(minY, worldPoint.y);
      maxY = Math.max(maxY, worldPoint.y);
      return h;
    });

    const spanH = Math.max(0.000001, maxH - minH);
    const spanV = Math.max(0.000001, maxY - minY);
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      const v = (points[i].y - minY) / spanV;
      uv[i * 2] = (projected[i] - minH) / spanH;
      uv[i * 2 + 1] = invertV ? 1 - v : v;
    }

    const currentUv = geometry.getAttribute('uv');
    if (currentUv && currentUv.itemSize === 2 && currentUv.count === position.count) {
      currentUv.array.set(uv);
      currentUv.needsUpdate = true;
    } else {
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }

    return { geometry, aspect: spanH / spanV };
  }

  function fitCover(texture, media, targetAspect, zoom = 1) {
    const sourceWidth = media.videoWidth || media.naturalWidth || media.width;
    const sourceHeight = media.videoHeight || media.naturalHeight || media.height;
    if (!sourceWidth || !sourceHeight) return;
    const sourceAspect = sourceWidth / sourceHeight;
    let repeatX = 1;
    let repeatY = 1;
    if (sourceAspect > targetAspect) repeatX = targetAspect / sourceAspect;
    else repeatY = sourceAspect / targetAspect;
    repeatX /= zoom;
    repeatY /= zoom;
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set((1 - repeatX) * 0.5, (1 - repeatY) * 0.5);
    texture.needsUpdate = true;
  }

  function prepareVideo(video, src) {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    if ((video.getAttribute('src') || '') !== src) {
      video.setAttribute('src', src);
      video.load();
    }
  }

  function playWhenReady(video, texture, updateFit) {
    const start = () => {
      updateFit();
      texture.needsUpdate = true;
      const play = video.play();
      if (play && play.catch) play.catch(() => {});
    };
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) start();
    else {
      video.addEventListener('canplay', start, { once: true });
      listeners.push({ video, type: 'canplay', fn: start });
    }
  }

  function clearResources() {
    listeners.splice(0).forEach(({ video, type, fn }) => video.removeEventListener(type, fn));
    materials.splice(0).forEach((material) => material.dispose());
    textures.splice(0).forEach((texture) => texture.dispose());
    geometries.splice(0).forEach((geometry) => geometry.dispose());
  }

  function applyVideos() {
    const entity = document.getElementById('video-window-model');
    const model = entity && entity.getObject3D('mesh');
    if (!model) return false;
    if (appliedModel === model) return true;

    clearResources();
    model.updateWorldMatrix(true, true);
    let connected = 0;

    model.traverse((screen) => {
      if (!screen.isMesh) return;
      const runtimeName = (screen.name || '').replace(/[^A-Za-z0-9]/g, '');
      const config = configByRuntimeName.get(runtimeName);
      if (!config) return;
      const video = config.videoId && document.getElementById(config.videoId);
      const image = config.imageId && document.getElementById(config.imageId);
      const media = image || video;
      if (!media) return;

      if (video) prepareVideo(video, config.src);
      const mapped = worldCoverGeometry(screen, config.invertV);
      screen.geometry = mapped.geometry;
      geometries.push(mapped.geometry);

      const texture = video ? new THREE.VideoTexture(video) : new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = !video;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      const updateFit = () => fitCover(texture, media, mapped.aspect, config.zoom || 1);
      if (video) {
        video.addEventListener('loadedmetadata', updateFit);
        video.addEventListener('resize', updateFit);
        listeners.push({ video, type: 'loadedmetadata', fn: updateFit });
        listeners.push({ video, type: 'resize', fn: updateFit });
      }
      updateFit();
      texture.needsUpdate = true;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      material.name = `${video ? 'Museum_Video' : 'Museum_Image'}_${config.meshName}`;
      screen.material = material;
      if (video) screen.userData.museumVideo = video;
      else {
        delete screen.userData.museumVideo;
        screen.userData.museumImageWindow = {
          role: 'bag-small-horizontal',
          source: config.src,
          zoom: config.zoom || 1,
          uniformScale: true,
          fit: 'cover'
        };
      }
      screen.renderOrder = 3;
      screen.castShadow = false;
      screen.receiveShadow = false;

      textures.push(texture);
      materials.push(material);
      if (video) playWhenReady(video, texture, updateFit);
      connected++;
    });

    if (connected !== configByRuntimeName.size) {
      console.error(`[video-window-fit] ${connected}/${configByRuntimeName.size} pantallas conectadas`);
      return false;
    }
    appliedModel = model;
    console.log(`[video-window-fit] ${connected}/${configByRuntimeName.size} pantallas multimedia conectadas por nombre de malla`);
    return true;
  }

  function install() {
    const entity = document.getElementById('video-window-model');
    const museum = document.getElementById('modelo');
    if (!entity || !museum) {
      window.setTimeout(install, 100);
      return;
    }

    let modelReady = !!entity.getObject3D('mesh');
    let museumReady = !!window.MUSEO_BOUNDS;
    const tryApply = () => {
      if (modelReady && museumReady) window.setTimeout(applyVideos, 0);
    };
    entity.addEventListener('model-loaded', () => { modelReady = true; tryApply(); });
    museum.addEventListener('museo-modules-loaded', () => { museumReady = true; tryApply(); });
    tryApply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
