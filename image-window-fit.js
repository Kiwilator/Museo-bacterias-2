/* Explicit mesh-to-image mapping for ventanas_imagenes.glb. */
(() => {
  const IMAGE_BY_MESH = {
    mesh_2: {
      role: 'horizontal',
      assetId: 'window-art-horizontal',
      src: './assets/images/window-art-horizontal.png?v=20260921-images1'
    },
    mesh_0: {
      role: 'vertical-left',
      assetId: 'window-art-vertical-01',
      src: './assets/images/window-art-vertical-01.png?v=20260921-images1'
    },
    mesh_1: {
      role: 'vertical-right',
      assetId: 'window-art-vertical-02',
      src: './assets/images/window-art-vertical-02.png?v=20260921-images1'
    }
  };

  AFRAME.registerComponent('image-window-materials', {
    init() {
      this.materials = [];
      this.textures = [];
      this.geometries = [];
      this.imageListeners = [];
      this.applied = false;
      this.museumEl = this.el.closest('[setup-museum-model]');
      this.onModelLoaded = () => this.tryApply();
      this.onMuseumLoaded = () => this.tryApply();
      this.el.addEventListener('model-loaded', this.onModelLoaded);
      if (this.museumEl) this.museumEl.addEventListener('museo-modules-loaded', this.onMuseumLoaded);
      this.tryApply();
    },

    roomCenter() {
      const bounds = window.MUSEO_BOUNDS;
      if (bounds) {
        return new THREE.Vector3(
          (bounds.minX + bounds.maxX) * 0.5,
          0,
          (bounds.minZ + bounds.maxZ) * 0.5
        );
      }
      return new THREE.Vector3(0, 0, 0);
    },

    horizontalWorldAxis(points, screenCenter) {
      let meanX = 0;
      let meanZ = 0;
      points.forEach((point) => {
        meanX += point.x;
        meanZ += point.z;
      });
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
      const towardRoom = this.roomCenter().sub(screenCenter).setY(0);
      if (front.dot(towardRoom) < 0) horizontal.negate();
      return horizontal;
    },

    worldCoverGeometry(screen) {
      const geometry = screen.geometry.clone();
      const position = geometry.getAttribute('position');
      if (!position || !position.count) return null;

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

      const horizontal = this.horizontalWorldAxis(points, center);
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
        uv[i * 2] = (projected[i] - minH) / spanH;
        uv[i * 2 + 1] = (points[i].y - minY) / spanV;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

      return {
        geometry,
        aspect: spanH / spanV,
        center: center.toArray(),
        horizontal: horizontal.toArray(),
        size: [spanH, spanV]
      };
    },

    fitCover(texture, image, targetAspect) {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) return;
      const sourceAspect = sourceWidth / sourceHeight;
      let repeatX = 1;
      let repeatY = 1;
      if (sourceAspect > targetAspect) repeatX = targetAspect / sourceAspect;
      else repeatY = sourceAspect / targetAspect;
      texture.repeat.set(repeatX, repeatY);
      texture.offset.set((1 - repeatX) * 0.5, (1 - repeatY) * 0.5);
      texture.needsUpdate = true;
    },

    applyTexture(screen, config) {
      const image = document.getElementById(config.assetId);
      if (!image) return false;
      const mapped = this.worldCoverGeometry(screen);
      if (!mapped) return false;

      screen.geometry = mapped.geometry;
      this.geometries.push(mapped.geometry);

      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = true;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      const updateTexture = () => this.fitCover(texture, image, mapped.aspect);
      if (image.complete && image.naturalWidth) updateTexture();
      else {
        image.addEventListener('load', updateTexture, { once: true });
        this.imageListeners.push({ image, fn: updateTexture });
      }

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      material.name = `Museum_Image_Window_${config.role}`;
      screen.material = material;
      screen.renderOrder = 3;
      screen.castShadow = false;
      screen.receiveShadow = false;
      screen.userData.museumImageWindow = {
        role: config.role,
        source: config.src,
        center: mapped.center,
        horizontal: mapped.horizontal,
        size: mapped.size,
        aspect: mapped.aspect
      };

      this.textures.push(texture);
      this.materials.push(material);
      return true;
    },

    tryApply() {
      if (this.applied) return;
      const model = this.el.getObject3D('mesh');
      if (!model || !window.MUSEO_BOUNDS) return;

      model.updateWorldMatrix(true, true);
      const foundNames = [];
      let connected = 0;
      model.traverse((screen) => {
        if (!screen.isMesh) return;
        foundNames.push(screen.name || '(sin nombre)');
        const config = IMAGE_BY_MESH[screen.name];
        if (config && this.applyTexture(screen, config)) connected++;
      });

      if (connected !== Object.keys(IMAGE_BY_MESH).length) {
        console.error(`[image-window-materials] ${connected}/3 superficies conectadas; meshes: ${foundNames.join(', ')}`);
        return;
      }
      this.applied = true;
      window.__MUSEO_IMAGE_WINDOWS_STATUS__ = {
        connected,
        mapping: Object.fromEntries(
          Object.entries(IMAGE_BY_MESH).map(([meshName, config]) => [meshName, config.src])
        )
      };
      console.log('[image-window-materials] 3/3 superficies conectadas por nombre de mesh', window.__MUSEO_IMAGE_WINDOWS_STATUS__);
    },

    remove() {
      this.el.removeEventListener('model-loaded', this.onModelLoaded);
      if (this.museumEl) this.museumEl.removeEventListener('museo-modules-loaded', this.onMuseumLoaded);
      this.imageListeners.forEach(({ image, fn }) => image.removeEventListener('load', fn));
      this.materials.forEach((material) => material.dispose());
      this.textures.forEach((texture) => texture.dispose());
      this.geometries.forEach((geometry) => geometry.dispose());
    }
  });
})();
