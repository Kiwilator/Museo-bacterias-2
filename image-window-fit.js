/* Explicit mesh-to-image mapping for ventanas_imagenes2.glb. */
(() => {
  const HORIZONTAL_ART_ZOOM = 1.58;
  const IMAGE_BY_MESH = {
    mesh_2: {
      role: 'horizontal',
      assetId: 'window-art-horizontal',
      src: './assets/images/window-art-horizontal.png?v=20260921-images1',
      zoom: HORIZONTAL_ART_ZOOM
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
  const SMALL_WINDOW_FRAME = 'NEON_TURQUESA_19';

  AFRAME.registerComponent('image-window-materials', {
    init() {
      this.materials = [];
      this.textures = [];
      this.geometries = [];
      this.applied = false;
      this.smallWindow = null;
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

    projectedHorizontalAxis(points, screenCenter) {
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

    surfaceHorizontalAxis(screen, screenCenter) {
      const normalAttribute = screen.geometry.getAttribute('normal');
      if (!normalAttribute || !normalAttribute.count) return null;

      const normalMatrix = new THREE.Matrix3().getNormalMatrix(screen.matrixWorld);
      const averageNormal = new THREE.Vector3();
      const normal = new THREE.Vector3();
      for (let i = 0; i < normalAttribute.count; i++) {
        normal.fromBufferAttribute(normalAttribute, i).applyNormalMatrix(normalMatrix);
        averageNormal.add(normal);
      }

      const front = averageNormal.setY(0);
      if (front.lengthSq() < 0.000001) return null;
      front.normalize();
      const towardRoom = this.roomCenter().sub(screenCenter).setY(0);
      if (front.dot(towardRoom) < 0) front.negate();

      // horizontal × world-up must point toward the visitor. Deriving the
      // axis from the surface normal prevents vertical tilt from leaking into U.
      return new THREE.Vector3(0, 1, 0).cross(front).normalize();
    },

    worldCoverGeometry(screen, sourceAspect, useSurfaceAxis, zoom = 1) {
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

      const horizontal = (useSurfaceAxis && this.surfaceHorizontalAxis(screen, center)) ||
        this.projectedHorizontalAxis(points, center);
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
      const targetAspect = spanH / spanV;

      // Uniform cover scale in world units. One source-image unit has the
      // same physical scale on both axes; only the excess is cropped.
      let displayWidth;
      let displayHeight;
      if (sourceAspect > targetAspect) {
        displayHeight = spanV;
        displayWidth = displayHeight * sourceAspect;
      } else {
        displayWidth = spanH;
        displayHeight = displayWidth / sourceAspect;
      }
      displayWidth *= zoom;
      displayHeight *= zoom;

      const centerH = (minH + maxH) * 0.5;
      const centerY = (minY + maxY) * 0.5;
      const uv = new Float32Array(position.count * 2);
      for (let i = 0; i < position.count; i++) {
        uv[i * 2] = 0.5 + (projected[i] - centerH) / displayWidth;
        uv[i * 2 + 1] = 0.5 + (points[i].y - centerY) / displayHeight;
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

      return {
        geometry,
        sourceAspect,
        targetAspect,
        center: center.toArray(),
        horizontal: horizontal.toArray(),
        windowSize: [spanH, spanV],
        displayedImageSize: [displayWidth, displayHeight],
        visibleFraction: [spanH / displayWidth, spanV / displayHeight]
      };
    },

    createTexture(image) {
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = true;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
      texture.needsUpdate = true;
      return texture;
    },

    applyTexture(screen, config) {
      const image = document.getElementById(config.assetId);
      if (!image) return false;
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) return false;
      const mapped = this.worldCoverGeometry(
        screen,
        sourceWidth / sourceHeight,
        config.role.startsWith('vertical-'),
        config.zoom || 1
      );
      if (!mapped) return false;

      screen.geometry = mapped.geometry;
      this.geometries.push(mapped.geometry);

      const texture = this.createTexture(image);

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
        sourceAspect: mapped.sourceAspect,
        targetAspect: mapped.targetAspect,
        windowSize: mapped.windowSize,
        displayedImageSize: mapped.displayedImageSize,
        visibleFraction: mapped.visibleFraction,
        zoom: config.zoom || 1,
        uniformScale: true,
        fit: 'cover'
      };

      this.textures.push(texture);
      this.materials.push(material);
      return true;
    },

    applySmallWindow() {
      if (this.smallWindow || !this.museumEl) return !!this.smallWindow;
      const frame = this.museumEl.object3D.getObjectByName(SMALL_WINDOW_FRAME);
      const image = document.getElementById('window-art-horizontal');
      const sourceWidth = image && (image.naturalWidth || image.width);
      const sourceHeight = image && (image.naturalHeight || image.height);
      if (!frame || !sourceWidth || !sourceHeight) return false;

      frame.updateWorldMatrix(true, true);
      const frameBox = new THREE.Box3().setFromObject(frame);
      const frameSize = frameBox.getSize(new THREE.Vector3());
      const width = Math.max(frameSize.x, frameSize.z) * 0.78;
      const height = frameSize.y * 0.78;
      if (width < 0.05 || height < 0.05) return false;

      const geometry = new THREE.PlaneGeometry(width, height);
      const texture = this.createTexture(image);
      const sourceAspect = sourceWidth / sourceHeight;
      const targetAspect = width / height;
      let visibleX = 1;
      let visibleY = 1;
      if (sourceAspect > targetAspect) visibleX = targetAspect / sourceAspect;
      else visibleY = sourceAspect / targetAspect;
      visibleX /= HORIZONTAL_ART_ZOOM;
      visibleY /= HORIZONTAL_ART_ZOOM;
      texture.repeat.set(visibleX, visibleY);
      texture.offset.set((1 - visibleX) * 0.5, (1 - visibleY) * 0.5);
      texture.needsUpdate = true;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      material.name = 'Museum_Image_Window_small-horizontal';

      const plane = new THREE.Mesh(geometry, material);
      plane.name = 'Museum_Image_Window_small-horizontal';
      plane.renderOrder = 3;
      plane.castShadow = false;
      plane.receiveShadow = false;

      const root = this.museumEl.object3D;
      const position = frameBox.getCenter(new THREE.Vector3());
      position.x -= 0.04;
      root.worldToLocal(position);
      plane.position.copy(position);
      plane.lookAt(position.clone().add(new THREE.Vector3(-3, 0, 0)));
      plane.userData.museumImageWindow = {
        role: 'small-horizontal',
        source: IMAGE_BY_MESH.mesh_2.src,
        frame: SMALL_WINDOW_FRAME,
        sourceAspect,
        targetAspect,
        visibleFraction: [visibleX, visibleY],
        zoom: HORIZONTAL_ART_ZOOM,
        uniformScale: true,
        fit: 'cover'
      };
      root.add(plane);

      this.smallWindow = plane;
      this.geometries.push(geometry);
      this.textures.push(texture);
      this.materials.push(material);
      window.__MUSEO_IMAGE_WINDOWS_STATUS__ = {
        ...(window.__MUSEO_IMAGE_WINDOWS_STATUS__ || {}),
        smallWindow: IMAGE_BY_MESH.mesh_2.src,
        totalConnected: 4
      };
      console.log('[image-window-materials] ventana pequeña conectada a la imagen horizontal');
      return true;
    },

    tryApply() {
      const model = this.el.getObject3D('mesh');
      if (!model || !window.MUSEO_BOUNDS) return;

      if (!this.applied) {
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
      }

      this.applySmallWindow();
    },

    remove() {
      this.el.removeEventListener('model-loaded', this.onModelLoaded);
      if (this.museumEl) this.museumEl.removeEventListener('museo-modules-loaded', this.onMuseumLoaded);
      if (this.smallWindow && this.smallWindow.parent) this.smallWindow.parent.remove(this.smallWindow);
      this.materials.forEach((material) => material.dispose());
      this.textures.forEach((texture) => texture.dispose());
      this.geometries.forEach((geometry) => geometry.dispose());
    }
  });
})();
