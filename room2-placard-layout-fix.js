/* Room 2 placard layout correction.
   Keeps the existing interaction system but repositions the window placards
   so they read as museum labels instead of covering the media. */
(() => {
  if (window.__ROOM2_PLACARD_LAYOUT_FIX__) return;
  window.__ROOM2_PLACARD_LAYOUT_FIX__ = true;

  const TARGET_IDS = ['window01', 'window02', 'window03', 'window04', 'window05', 'window06'];
  const TARGET_HEIGHT = 0.26;
  const TARGET_WIDTH = 0.28;
  const SIGN_CENTER_ABOVE_FLOOR = 0.93;
  const STAND_OUT = 0.40;
  const WINDOW05_SIDE_SHIFT = 0.34;

  function floorYFor(it) {
    const spawn = window.MUSEO_SPAWN;
    if (spawn && typeof spawn.y === 'number') return spawn.y;
    if (it && it.bottomY !== null && typeof it.bottomY === 'number') return it.bottomY - 1.0;
    return (it && it.pos ? it.pos.y : 1.2) - 1.2;
  }

  /* All placards in this window row must stay parallel to one another.
     Derive one shared facing direction from the row toward the room interior,
     instead of making every placard point independently toward the spawn. */
  function sharedFacingYaw(info, items) {
    const rowItems = items.filter((it) => ['window02', 'window03', 'window04', 'window05'].includes(it.id));
    const source = rowItems.length ? rowItems : items;
    const center = source.reduce((acc, it) => acc.add(it.pos), new THREE.Vector3())
      .multiplyScalar(1 / Math.max(source.length, 1));

    let dir = info.wallFacingDir ? info.wallFacingDir(center) : null;
    if (!dir || (!dir.x && !dir.z)) {
      const bounds = window.MUSEO_BOUNDS;
      if (bounds) {
        const roomCenterX = (bounds.minX + bounds.maxX) * 0.5;
        const roomCenterZ = (bounds.minZ + bounds.maxZ) * 0.5;
        const dx = roomCenterX - center.x;
        const dz = roomCenterZ - center.z;
        const len = Math.hypot(dx, dz) || 1;
        dir = { x: dx / len, z: dz / len };
      } else {
        dir = { x: 0, z: 1 };
      }
    }
    return Math.atan2(dir.x, dir.z);
  }

  function rebuildPlacardPlane(info, it) {
    const tag = it && it.tag;
    if (!tag || !tag.plane || !info || typeof info.buildPlacardTextTexture !== 'function') return;

    const plane = tag.plane;
    if (plane.geometry) plane.geometry.dispose();
    plane.geometry = new THREE.PlaneGeometry(TARGET_WIDTH, TARGET_HEIGHT);

    const oldMap = plane.material && plane.material.map;
    const texture = info.buildPlacardTextTexture(
      it.data.section || '',
      (it.data.title || '').toUpperCase(),
      window.getMuseumUiText ? window.getMuseumUiText('clickToExplore') : 'CLICK TO EXPLORE',
      TARGET_HEIGHT,
      TARGET_WIDTH,
      typeof ROOM2_ACCENT !== 'undefined' ? ROOM2_ACCENT : '#74349A',
      typeof ROOM2_ACCENT_LIGHT !== 'undefined' ? ROOM2_ACCENT_LIGHT : '#805096'
    );
    if (plane.material) {
      plane.material.map = texture;
      plane.material.side = THREE.FrontSide;
      plane.material.needsUpdate = true;
    }
    if (oldMap && oldMap !== texture && oldMap.dispose) oldMap.dispose();
  }

  function setPoleHeight(it) {
    const tag = it && it.tag;
    if (!tag || !tag.pole || !tag.plane) return;

    const floorY = floorYFor(it);
    const centerY = floorY + SIGN_CENTER_ABOVE_FLOOR;
    const poleH = Math.max(0.34, centerY - floorY - TARGET_HEIGHT * 0.5);
    const originalH = (tag.pole.geometry && tag.pole.geometry.parameters && tag.pole.geometry.parameters.height) || poleH;

    tag.pole.scale.y = poleH / Math.max(originalH, 0.0001);
    tag.pole.position.y = poleH / 2;
    tag.plane.position.y = poleH + TARGET_HEIGHT * 0.5;
  }

  function basePlacement(info, it) {
    const dir = info.wallFacingDir ? info.wallFacingDir(it.pos) : { x: 0, z: 1 };
    return {
      x: it.pos.x + dir.x * STAND_OUT,
      z: it.pos.z + dir.z * STAND_OUT,
      dir
    };
  }

  function shiftWindow05AwayFromBiomass(info, items, it, placement) {
    const biomass = items.find((entry) => entry.id === 'window04');
    if (!biomass) return placement;

    const tangent = new THREE.Vector3(placement.dir.z, 0, -placement.dir.x).normalize();
    const a = new THREE.Vector3(placement.x, 0, placement.z).addScaledVector(tangent, WINDOW05_SIDE_SHIFT);
    const b = new THREE.Vector3(placement.x, 0, placement.z).addScaledVector(tangent, -WINDOW05_SIDE_SHIFT);
    const ref = new THREE.Vector3(biomass.pos.x, 0, biomass.pos.z);
    const chosen = a.distanceTo(ref) >= b.distanceTo(ref) ? a : b;
    return { x: chosen.x, z: chosen.z, dir: placement.dir };
  }

  function applyFix() {
    const museum = document.getElementById('modelo');
    const info = museum && museum.components && museum.components['exhibit-info'];
    if (!info || !Array.isArray(info.items) || !info.items.length) return false;

    const items = info.items.filter((it) => TARGET_IDS.includes(it.id));
    if (!items.length || items.some((it) => !it.tag || !it.tag.wrapper)) return false;

    const rowYaw = sharedFacingYaw(info, items);

    items.forEach((it) => {
      rebuildPlacardPlane(info, it);
      setPoleHeight(it);

      let placement = basePlacement(info, it);
      if (it.id === 'window05') placement = shiftWindow05AwayFromBiomass(info, items, it, placement);

      const floorY = floorYFor(it);
      it.tag.wrapper.object3D.position.set(placement.x, floorY, placement.z);
      it.tag.wrapper.object3D.rotation.set(0, rowYaw, 0);
    });

    window.__ROOM2_PLACARD_LAYOUT_STATUS__ = {
      applied: true,
      ids: items.map((it) => it.id),
      centerAboveFloor: SIGN_CENTER_ABOVE_FLOOR,
      width: TARGET_WIDTH,
      height: TARGET_HEIGHT,
      window05SideShift: WINDOW05_SIDE_SHIFT,
      sharedRowYaw: rowYaw
    };

    console.log('[room2-placards] layout corrected', window.__ROOM2_PLACARD_LAYOUT_STATUS__);
    return true;
  }

  function install() {
    let attempts = 0;
    const tryApply = () => {
      attempts += 1;
      if (applyFix()) return;
      if (attempts < 80) window.setTimeout(tryApply, 100);
      else console.warn('[room2-placards] could not find generated placards to reposition');
    };

    const museum = document.getElementById('modelo');
    if (museum) museum.addEventListener('museo-modules-loaded', () => window.setTimeout(tryApply, 0), { once: true });
    tryApply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
