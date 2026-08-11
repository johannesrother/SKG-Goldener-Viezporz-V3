import * as THREE from 'three';

// This file intentionally changes assets, not the final frame.  The world
// stays 3D; only the Hauptmarkt prototype receives a compact, painted 2.5D
// material library.  It is deliberately separate from the route/collision
// code so the art test cannot change navigation or quests.

const textureCache = new Map();
const workPosition = new THREE.Vector3();

const PALETTE = {
  mortar: '#5b4938',
  stone: ['#c48f57', '#d7a96c', '#e0bd83', '#a87548', '#efcf95'],
  slate: ['#384852', '#4d6270', '#2d3940', '#61727b', '#7c8a8c'],
  leaf: ['#34583d', '#4f7147', '#6f814b', '#2b4937', '#889454'],
  cloth: ['#3f6256', '#4e6680', '#8a5049', '#a97a45', '#595466'],
  window: ['#263d50', '#365269', '#4c6573', '#d49b57', '#f2c67a'],
};

function hash(value) {
  const result = Math.sin(value * 91.173 + 17.41) * 15321.731;
  return result - Math.floor(result);
}

function colorToHex(color) {
  return `#${color.getHexString()}`;
}

function colorFromHex(hex) {
  return new THREE.Color(hex);
}

function paintTexture(key, size, painter) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  painter(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

function pixelPavementTexture() {
  return paintTexture('hauptmarkt-pavement-v2', 128, (context, size) => {
    context.fillStyle = '#c68d53';
    context.fillRect(0, 0, size, size);
    const rowHeight = 11;
    for (let row = 0; row < 13; row += 1) {
      const offset = row % 2 ? -9 : 0;
      for (let column = 0; column < 12; column += 1) {
        const seed = row * 29 + column * 7;
        const x = offset + column * 13;
        const y = row * rowHeight;
        const color = PALETTE.stone[Math.floor(hash(seed) * PALETTE.stone.length)];
        context.fillStyle = '#6b5039';
        context.fillRect(x, y, 12, 10);
        context.fillStyle = color;
        context.fillRect(x + 1, y + 1, 10, 8);
        context.fillStyle = 'rgba(255,242,193,.30)';
        context.fillRect(x + 2, y + 2, 6 + Math.floor(hash(seed + 3) * 3), 1);
        if (hash(seed + 5) > .48) {
          context.fillStyle = 'rgba(84,58,41,.34)';
          context.fillRect(x + 2 + Math.floor(hash(seed + 8) * 6), y + 6, 2, 1);
        }
      }
    }
    // A few deliberately painted repaired stones keep the repeat from reading
    // like a photograph that was merely made smaller.
    for (let mark = 0; mark < 12; mark += 1) {
      const x = Math.floor(hash(mark + 203) * 120);
      const y = Math.floor(hash(mark + 231) * 120);
      context.fillStyle = mark % 2 ? '#a6744c' : '#e1ba7c';
      context.fillRect(x, y, 3 + (mark % 3), 2);
    }
  });
}

function facadeTexture(base, seed) {
  const key = `facade-${base}-${seed % 9}`;
  return paintTexture(key, 128, (context, size) => {
    const baseColor = colorFromHex(base);
    const shade = baseColor.clone().multiplyScalar(.78);
    const light = baseColor.clone().lerp(new THREE.Color(0xffe1ad), .24);
    context.fillStyle = colorToHex(baseColor);
    context.fillRect(0, 0, size, size);
    // Broad washes are intentionally clustered, instead of high-frequency
    // noise. They read as a painted historic façade from the game camera.
    for (let patch = 0; patch < 34; patch += 1) {
      const x = Math.floor(hash(seed + patch * 11) * 124);
      const y = Math.floor(hash(seed + patch * 17) * 124);
      const w = 5 + Math.floor(hash(seed + patch * 23) * 17);
      const h = 2 + Math.floor(hash(seed + patch * 31) * 7);
      context.fillStyle = patch % 3 ? `rgba(${Math.round(light.r * 255)},${Math.round(light.g * 255)},${Math.round(light.b * 255)},.18)` : `rgba(${Math.round(shade.r * 255)},${Math.round(shade.g * 255)},${Math.round(shade.b * 255)},.16)`;
      context.fillRect(x, y, w, h);
    }
    context.fillStyle = `rgba(${Math.round(shade.r * 255)},${Math.round(shade.g * 255)},${Math.round(shade.b * 255)},.28)`;
    for (let y = 16; y < size; y += 28) context.fillRect(0, y, size, 2);
    context.fillStyle = 'rgba(255,235,194,.24)';
    context.fillRect(3, 3, size - 6, 2);
  });
}

function roofTexture() {
  return paintTexture('hauptmarkt-slate-v2', 128, (context, size) => {
    context.fillStyle = PALETTE.slate[1];
    context.fillRect(0, 0, size, size);
    for (let row = 0; row < 16; row += 1) {
      const y = row * 8;
      const offset = row % 2 ? -5 : 0;
      for (let column = 0; column < 18; column += 1) {
        const seed = row * 41 + column * 13;
        const x = offset + column * 8;
        context.fillStyle = '#26333a';
        context.fillRect(x, y, 7, 7);
        context.fillStyle = PALETTE.slate[Math.floor(hash(seed) * PALETTE.slate.length)];
        context.fillRect(x + 1, y + 1, 5, 5);
        context.fillStyle = 'rgba(206,224,219,.26)';
        context.fillRect(x + 1, y + 1, 4, 1);
      }
    }
  });
}

function foliageTexture() {
  return paintTexture('hauptmarkt-foliage-v2', 64, (context, size) => {
    context.fillStyle = '#34543b';
    context.fillRect(0, 0, size, size);
    for (let cluster = 0; cluster < 46; cluster += 1) {
      const x = Math.floor(hash(cluster * 7.1) * 60);
      const y = Math.floor(hash(cluster * 11.3) * 60);
      context.fillStyle = PALETTE.leaf[cluster % PALETTE.leaf.length];
      context.fillRect(x, y, 3 + (cluster % 3), 3 + ((cluster + 1) % 3));
      if (cluster % 4 === 0) {
        context.fillStyle = 'rgba(238,210,128,.45)';
        context.fillRect(x + 1, y, 2, 1);
      }
    }
  });
}

function fabricTexture() {
  return paintTexture('hauptmarkt-cloth-v2', 64, (context, size) => {
    context.fillStyle = '#89938a';
    context.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      for (let x = (y / 4) % 2 ? 2 : 0; x < size; x += 4) {
        context.fillStyle = (x + y) % 3 ? 'rgba(49,57,53,.24)' : 'rgba(246,231,190,.16)';
        context.fillRect(x, y, 2, 1);
      }
    }
  });
}

function windowTexture(warm = false) {
  return paintTexture(`hauptmarkt-window-${warm ? 'warm' : 'blue'}`, 32, (context, size) => {
    context.fillStyle = warm ? '#b77337' : '#294655';
    context.fillRect(0, 0, size, size);
    context.fillStyle = warm ? '#f0c56e' : '#557b86';
    context.fillRect(3, 3, 11, 11);
    context.fillRect(18, 3, 11, 11);
    context.fillRect(3, 18, 11, 11);
    context.fillRect(18, 18, 11, 11);
    context.fillStyle = '#17292e';
    context.fillRect(14, 0, 4, size);
    context.fillRect(0, 14, size, 4);
    context.fillStyle = warm ? 'rgba(255,239,178,.55)' : 'rgba(207,227,215,.27)';
    context.fillRect(4, 4, 8, 2);
  });
}

function isHauptmarktObject(object) {
  object.getWorldPosition(workPosition);
  return workPosition.x > -27 && workPosition.x < 27 && workPosition.z > -19 && workPosition.z < 17;
}

function isCharacterMesh(object) {
  let parent = object.parent;
  while (parent) {
    if (parent.userData?.limbs) return true;
    parent = parent.parent;
  }
  return false;
}

function isLargeWorldGround(object) {
  const position = object.geometry?.attributes?.position;
  if (!position) return false;
  object.geometry.computeBoundingBox?.();
  const bounds = object.geometry.boundingBox;
  return bounds && Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ) > 55;
}

function nearestCityColor(color) {
  const candidates = ['#d8b17c', '#c58c63', '#e5d2ad', '#78614e', '#495e55', '#3a474b', '#8a5950', '#685c65'];
  let winner = candidates[0];
  let distance = Infinity;
  candidates.forEach((hex) => {
    const candidate = colorFromHex(hex);
    // THREE.Color deliberately has no Vector-style distanceToSquared helper.
    // Keep the palette lookup explicit so loading the art prototype can never
    // prevent the WebGL scene from starting.
    const next = (color.r - candidate.r) ** 2
      + (color.g - candidate.g) ** 2
      + (color.b - candidate.b) ** 2;
    if (next < distance) { winner = hex; distance = next; }
  });
  return colorFromHex(winner);
}

function materialKind(meshMaterial) {
  const image = meshMaterial.map?.image;
  if (image?.src?.includes('trier-slate-roof')) return 'roof';
  if (image?.width === 384 && image?.height === 384) return 'facade';
  if (meshMaterial.emissive && meshMaterial.emissiveIntensity > .16) return 'window';
  const color = meshMaterial.color;
  if (color && color.g > color.r * 1.08 && color.g > color.b * 1.08) return 'foliage';
  return 'solid';
}

function makeAtelierMaterial(original, kind, seed) {
  const color = nearestCityColor(original.color || new THREE.Color(0xffffff));
  let map = null;
  if (kind === 'roof') map = roofTexture();
  if (kind === 'facade') map = facadeTexture(colorToHex(color), seed);
  if (kind === 'foliage') map = foliageTexture();
  if (kind === 'window') map = windowTexture(Boolean(original.emissiveIntensity > .55));
  const next = new THREE.MeshLambertMaterial({
    color,
    map,
    transparent: original.transparent,
    opacity: original.opacity,
    side: original.side,
    depthWrite: original.depthWrite,
    alphaTest: original.alphaTest || 0,
    emissive: kind === 'window' ? (original.emissive?.clone() || new THREE.Color(0x8b5a32)) : new THREE.Color(0x000000),
    emissiveIntensity: kind === 'window' ? Math.min(1.2, Math.max(.18, original.emissiveIntensity || .32)) : 0,
    flatShading: kind !== 'window',
  });
  next.name = `${original.name || 'material'}-atelier`;
  return next;
}

function applyMeshMaterial(mesh, index, enabled) {
  if (!enabled) {
    if (mesh.userData.atelierMaterial) {
      mesh.material = mesh.userData.atelierMaterial;
      delete mesh.userData.atelierMaterial;
    }
    return;
  }
  if (mesh.userData.atelierMaterial || !mesh.material) return;
  const original = mesh.material;
  const materials = Array.isArray(original) ? original : [original];
  mesh.userData.atelierMaterial = original;
  const replacements = materials.map((entry, materialIndex) => makeAtelierMaterial(entry, materialKind(entry), index * 17 + materialIndex * 7));
  mesh.material = Array.isArray(original) ? replacements : replacements[0];
}

function applyCharacter(person, enabled) {
  if (!person) return;
  const style = person.userData.atelierCharacter;
  if (!enabled) {
    if (!style) return;
    style.meshes.forEach(({ mesh, material }) => { mesh.material = material; });
    style.head.scale.copy(style.headScale);
    style.arms.forEach(({ arm, scale }) => arm.scale.copy(scale));
    delete person.userData.atelierCharacter;
    return;
  }
  if (style) return;
  const meshes = [];
  person.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const original = object.material;
    const materials = Array.isArray(original) ? original : [original];
    const replacements = materials.map((entry, index) => {
      const image = entry.map?.image;
      const isFabric = image?.width === 256 && image?.height === 256;
      const next = new THREE.MeshLambertMaterial({
        color: nearestCityColor(entry.color || new THREE.Color(0xffffff)),
        map: isFabric ? fabricTexture() : null,
        emissive: entry.emissive?.clone() || new THREE.Color(0),
        emissiveIntensity: Math.min(entry.emissiveIntensity || 0, .18),
        transparent: entry.transparent,
        opacity: entry.opacity,
        side: entry.side,
        flatShading: true,
      });
      return next;
    });
    meshes.push({ mesh: object, material: original });
    object.material = Array.isArray(original) ? replacements : replacements[0];
  });
  const limbs = person.userData.limbs;
  const headScale = limbs?.head?.scale.clone() || new THREE.Vector3(1, 1, 1);
  const arms = (limbs?.arms || []).map((arm) => ({ arm, scale: arm.scale.clone() }));
  if (limbs?.head) limbs.head.scale.multiplyScalar(1.12);
  arms.forEach(({ arm }) => arm.scale.set(1.04, 1.02, 1.04));
  person.userData.atelierCharacter = { meshes, head: limbs?.head, headScale, arms };
}

function makeGroundOverlay(root) {
  const group = new THREE.Group();
  group.name = 'Hauptmarkt – 2.5D Atelier-Prototyp';
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50.5, 35.5),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: pixelPavementTexture(), side: THREE.DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, .009, -1.2);
  ground.userData.atelierOverlay = true;
  ground.receiveShadow = true;
  group.add(ground);
  group.visible = false;
  root.add(group);
  return group;
}

export function createHauptmarktAtelier(root, citizens, questFriends) {
  const overlay = makeGroundOverlay(root);
  const prototypePeople = [
    questFriends?.johannes,
    ...citizens.filter((person) => person.position.x > -18 && person.position.x < 18 && person.position.z > -9 && person.position.z < 9).slice(0, 5),
  ].filter(Boolean);
  let enabled = false;

  function setEnabled(next, player) {
    if (enabled === next) {
      if (next) applyCharacter(player, true);
      return;
    }
    enabled = next;
    root.updateMatrixWorld(true);
    overlay.visible = next;
    let materialSeed = 1;
    root.traverse((object) => {
      if (!object.isMesh || object.userData.atelierOverlay || isCharacterMesh(object) || !isHauptmarktObject(object) || isLargeWorldGround(object)) return;
      applyMeshMaterial(object, materialSeed, next);
      materialSeed += 1;
    });
    prototypePeople.forEach((person) => applyCharacter(person, next));
    applyCharacter(player, next);
  }

  return { setEnabled, prototypePeople };
}
