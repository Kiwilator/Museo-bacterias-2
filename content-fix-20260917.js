/* Load the reviewed museum content/image fixes. */
(() => {
  /* Remove the old controls guide from the loading screen. The standalone
     onboarding popup is the only controls tutorial and appears after load. */
  const removeLoadingControls = () => {
    document.querySelectorAll('#loading-screen .controls-loading-guide').forEach((node) => node.remove());
  };

  const loadingControlsStyle = document.createElement('style');
  loadingControlsStyle.textContent = `
    #loading-screen .controls-loading-guide {
      display: none !important;
    }
  `;
  document.head.appendChild(loadingControlsStyle);

  if (document.body) {
    removeLoadingControls();
    const observer = new MutationObserver(removeLoadingControls);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  const base = document.createElement('script');
  base.src = './content-fix-base-20260917.js?v=6';
  base.onerror = () => console.error('[content-fix] could not load base content fixes');
  document.head.appendChild(base);

  /* Keep the LOOK arrows visually separated from the mouse illustration. */
  const controlsSpacingFix = document.createElement('style');
  controlsSpacingFix.textContent = `
    #controls-popup .controls-drag-arrows {
      bottom: -8px !important;
    }
  `;
  document.head.appendChild(controlsSpacingFix);

  /* Room 2 signage: anchor each placard to the media it actually explains.
     This avoids a placard sitting in front of a neighbouring image when the
     media windows are stacked or use different proportions. */
  const ROOM2_SIGN_MEDIA = {
    window02: { videoId: 'ppb-video-window-03' }, // Flow & Mixing
    window03: { videoId: 'ppb-video-window-01' }, // Nutrients
    window04: { videoId: 'ppb-video-window-02' }, // Biomass
    window05: { imageRole: 'bag-small-horizontal' } // Bag Reactor
  };

  const mediaObjectFor = (definition) => {
    const root = document.getElementById('video-window-model');
    const model = root && root.getObject3D('mesh');
    if (!model) return null;
    let found = null;
    model.traverse((node) => {
      if (found || !node.isMesh) return;
      if (definition.videoId && node.userData.museumVideo && node.userData.museumVideo.id === definition.videoId) {
        found = node;
        return;
      }
      if (definition.imageRole && node.userData.museumImageWindow &&
          node.userData.museumImageWindow.role === definition.imageRole) {
        found = node;
      }
    });
    return found;
  };

  const projectedHalfWidth = (box, tangent) => {
    const size = box.getSize(new THREE.Vector3());
    return 0.5 * (Math.abs(tangent.x) * size.x + Math.abs(tangent.z) * size.z);
  };

  const updatePoleAndPlaneHeight = (tag, floorY, signCenterY) => {
    if (!tag || !tag.plane || !tag.pole) return;
    const planeHeight = (tag.plane.geometry && tag.plane.geometry.parameters && tag.plane.geometry.parameters.height) || 0.26;
    const desiredPoleHeight = Math.max(0.30, signCenterY - floorY - planeHeight * 0.5);
    const sourcePoleHeight = (tag.pole.geometry && tag.pole.geometry.parameters && tag.pole.geometry.parameters.height) || desiredPoleHeight;
    tag.pole.scale.y = desiredPoleHeight / Math.max(sourcePoleHeight, 0.0001);
    tag.pole.position.y = desiredPoleHeight * 0.5;
    tag.plane.position.y = desiredPoleHeight + planeHeight * 0.5;
  };

  const applyRoom2SignageLayout = () => {
    const museum = document.getElementById('modelo');
    const info = museum && museum.components && museum.components['exhibit-info'];
    const spawn = window.MUSEO_SPAWN;
    if (!museum || !info || !info.items || !spawn || typeof spawn.x !== 'number') return false;

    const entries = Object.entries(ROOM2_SIGN_MEDIA).map(([id, definition]) => {
      const item = info.items.find((candidate) => candidate.id === id);
      const media = mediaObjectFor(definition);
      if (!item || !item.tag || !media) return null;
      const box = new THREE.Box3().setFromObject(media);
      if (box.isEmpty()) return null;
      return {
        id,
        item,
        media,
        box,
        center: box.getCenter(new THREE.Vector3()),
        size: box.getSize(new THREE.Vector3())
      };
    }).filter(Boolean);

    if (entries.length !== Object.keys(ROOM2_SIGN_MEDIA).length) return false;

    const averageCenter = new THREE.Vector3();
    entries.forEach((entry) => averageCenter.add(entry.center));
    averageCenter.multiplyScalar(1 / entries.length);
    const frontRef = new THREE.Vector3(spawn.x - averageCenter.x, 0, spawn.z - averageCenter.z);
    if (frontRef.lengthSq() < 0.000001) frontRef.set(0, 0, 1);
    frontRef.normalize();
    const tangentRef = new THREE.Vector3(frontRef.z, 0, -frontRef.x).normalize();

    const mediaRects = entries.map((entry) => ({
      id: entry.id,
      u: entry.center.dot(tangentRef),
      halfU: projectedHalfWidth(entry.box, tangentRef),
      minY: entry.box.min.y,
      maxY: entry.box.max.y
    }));

    const floorY = typeof spawn.y === 'number' ? spawn.y : 0;
    const signHeight = 0.26;
    const signGap = 0.075;
    const minSignCenterY = floorY + 0.76;
    const maxSignCenterY = floorY + 1.00;
    const placedSigns = [];

    const collidesWithMedia = (entryId, u, centerY, halfSignU) => {
      const minY = centerY - signHeight * 0.5;
      const maxY = centerY + signHeight * 0.5;
      return mediaRects.some((rect) => {
        if (rect.id === entryId) return false;
        const overlapY = maxY > rect.minY - 0.055 && minY < rect.maxY + 0.055;
        const overlapU = Math.abs(u - rect.u) < halfSignU + rect.halfU + 0.085;
        return overlapY && overlapU;
      });
    };

    const collidesWithSign = (u, centerY, halfSignU) => placedSigns.some((other) => {
      const overlapY = Math.abs(centerY - other.centerY) < signHeight + 0.06;
      const overlapU = Math.abs(u - other.u) < halfSignU + other.halfU + 0.09;
      return overlapY && overlapU;
    });

    entries.forEach((entry) => {
      const tag = entry.item.tag;
      const planeWidth = (tag.plane.geometry && tag.plane.geometry.parameters && tag.plane.geometry.parameters.width) || 0.28;
      const halfSignU = planeWidth * 0.5;
      const originalU = entry.center.dot(tangentRef);
      let targetU = originalU;
      const targetCenterY = THREE.MathUtils.clamp(
        entry.box.min.y - signGap - signHeight * 0.5,
        minSignCenterY,
        maxSignCenterY
      );

      /* If "below" would cover another media window, move the placard to the
         nearest free side instead. This is what keeps the stacked right-hand
         exhibits readable without assigning a sign to the wrong picture. */
      if (collidesWithMedia(entry.id, targetU, targetCenterY, halfSignU) ||
          collidesWithSign(targetU, targetCenterY, halfSignU)) {
        const step = 0.12;
        let resolved = false;
        for (let ring = 1; ring <= 8 && !resolved; ring += 1) {
          const candidates = [originalU - step * ring, originalU + step * ring];
          for (const candidateU of candidates) {
            if (!collidesWithMedia(entry.id, candidateU, targetCenterY, halfSignU) &&
                !collidesWithSign(candidateU, targetCenterY, halfSignU)) {
              targetU = candidateU;
              resolved = true;
              break;
            }
          }
        }
      }

      const lateralShift = targetU - originalU;
      const front = new THREE.Vector3(spawn.x - entry.center.x, 0, spawn.z - entry.center.z);
      if (front.lengthSq() < 0.000001) front.copy(frontRef);
      front.normalize();
      const standOut = 0.43;
      const target = entry.center.clone()
        .addScaledVector(front, standOut)
        .addScaledVector(tangentRef, lateralShift);

      const wrapper = tag.wrapper.object3D;
      wrapper.position.set(target.x, floorY, target.z);
      wrapper.rotation.set(0, Math.atan2(front.x, front.z), 0);
      updatePoleAndPlaneHeight(tag, floorY, targetCenterY);
      if (tag.plane.material) tag.plane.material.side = THREE.FrontSide;
      wrapper.updateMatrixWorld(true);

      placedSigns.push({ id: entry.id, u: targetU, centerY: targetCenterY, halfU: halfSignU });
    });

    window.__MUSEO_ROOM2_SIGNAGE_STATUS__ = {
      aligned: entries.map((entry) => entry.id),
      mediaAnchored: true,
      collisionAvoidance: true
    };
    console.log('[room2-signage] carteles 02-05 alineados con su contenido multimedia', window.__MUSEO_ROOM2_SIGNAGE_STATUS__);
    return true;
  };

  const installRoom2Signage = () => {
    let attempts = 0;
    const tryApply = () => {
      attempts += 1;
      if (applyRoom2SignageLayout() || attempts >= 50) return;
      window.setTimeout(tryApply, 100);
    };
    tryApply();
  };

  const museum = document.getElementById('modelo');
  if (museum) {
    museum.addEventListener('museo-modules-loaded', () => window.setTimeout(installRoom2Signage, 120));
    window.setTimeout(installRoom2Signage, 500);
  }

  /* Very subtle Ken Burns-style movement for static wall illustrations.
     Existing videos keep their own motion. The zoom only moves inward from
     the fitted crop, so it never exposes an empty edge. */
  if (window.AFRAME && !AFRAME.components['subtle-static-window-zoom']) {
    AFRAME.registerComponent('subtle-static-window-zoom', {
      init() {
        this.tracks = [];
        this.nextScan = 0;
        this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      },
      scan() {
        const seen = new Set(this.tracks.map((track) => track.texture));
        this.el.object3D.traverse((node) => {
          if (!node.isMesh || !node.userData.museumImageWindow || !node.material || !node.material.map) return;
          const texture = node.material.map;
          if (seen.has(texture)) return;
          seen.add(texture);
          this.tracks.push({
            texture,
            repeatX: texture.repeat.x,
            repeatY: texture.repeat.y,
            phase: this.tracks.length * 1.73
          });
        });
      },
      tick(time) {
        if (this.reduced) return;
        if (time >= this.nextScan) {
          this.nextScan = time + 1000;
          this.scan();
        }
        const seconds = time * 0.001;
        this.tracks.forEach((track) => {
          const zoom = 1 + 0.014 * (0.5 + 0.5 * Math.sin(seconds * 0.62 + track.phase));
          track.texture.repeat.x = track.repeatX / zoom;
          track.texture.repeat.y = track.repeatY / zoom;
          track.texture.needsUpdate = true;
        });
      }
    });
  }

  const installStaticZoom = () => {
    ['image-window-model', 'video-window-model'].forEach((id) => {
      const entity = document.getElementById(id);
      if (entity && !entity.hasAttribute('subtle-static-window-zoom')) {
        entity.setAttribute('subtle-static-window-zoom', '');
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installStaticZoom, { once: true });
  else installStaticZoom();

})();
