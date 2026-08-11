import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SIDE_QUESTS } from '../data/chapter-one.js';
import pavementLibraryUrl from '../assets/trier-pavement-material-library-v1.png';
import slateRoofUrl from '../assets/trier-slate-roof.png';
import { createHauptmarktAtelier } from './hauptmarkt-atelier.js';

const PALETTE = {
  sandstone: [0xd6b27f, 0xc99165, 0xe0c599, 0xb98762, 0xd3a876],
  roof: [0x817b72, 0x756f68, 0x897b70, 0x6d7470],
  leaf: [0x42613e, 0x587448, 0x35523c, 0x6d824e],
  flower: [0xd67175, 0xe9b35c, 0xc65c8c, 0xf2ded0],
  // Deliberately readable from a high isometric camera: the city feels
  // cohesive, but a jacket is never mistaken for the next person's hoodie.
  outfit: [0x315e4c, 0x31557c, 0x9a573e, 0xac7b2e, 0x62516b, 0x607540, 0x814653, 0xad6645],
  trousers: [0x263c58, 0x45565d, 0x4b403b, 0x273139, 0x6a5547, 0x45504b],
  hair: [0x291c18, 0x553524, 0x8c633d, 0x3a2a22],
  skin: [0xf0bf91, 0xd99668, 0xb97452, 0xf3cfaa],
};

const shared = {
  leg: new THREE.CapsuleGeometry(0.098, 0.43, 7, 10),
  torso: new THREE.CapsuleGeometry(0.255, 0.45, 7, 14),
  head: new THREE.SphereGeometry(0.225, 18, 14),
  hair: new THREE.SphereGeometry(0.238, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.86),
  arm: new THREE.CapsuleGeometry(0.064, 0.37, 6, 10),
  hand: new THREE.SphereGeometry(0.078, 10, 8),
  shoe: new THREE.SphereGeometry(0.13, 12, 8),
  eye: new THREE.SphereGeometry(0.046, 10, 8),
  pupil: new THREE.SphereGeometry(0.024, 8, 6),
  nose: new THREE.SphereGeometry(0.042, 9, 7),
  ear: new THREE.SphereGeometry(0.048, 9, 7),
  brow: new THREE.CapsuleGeometry(0.014, 0.094, 5, 7),
  eyelid: new THREE.SphereGeometry(0.052, 10, 7),
  hairLock: new THREE.SphereGeometry(0.085, 10, 8),
  hairCurl: new THREE.SphereGeometry(0.064, 9, 7),
  beard: new THREE.SphereGeometry(0.15, 12, 8),
  collar: new THREE.TorusGeometry(0.118, 0.018, 6, 12),
  hood: new THREE.TorusGeometry(0.19, 0.042, 7, 14),
  belt: new THREE.TorusGeometry(0.16, 0.012, 6, 14),
  button: new THREE.SphereGeometry(0.016, 7, 6),
  shoeLace: new THREE.CapsuleGeometry(0.008, 0.09, 4, 6),
  clothingTrim: new THREE.CylinderGeometry(0.011, 0.011, 0.24, 6),
  pigeon: new THREE.SphereGeometry(0.075, 9, 7),
};

let roofTexture;
let romanStoneTexture;
let stuccoTexture;
let fabricTexture;
let pavementAtlasImage;
let pavementAtlasLoading = false;
let pavementPbrMaps;
const pavementTileCache = new Map();
const characterMaterialCache = new Map();
const boxGeometryCache = new Map();

// Every profile occupies one cell of the hand-painted Trier material atlas.
// Their hues deliberately overlap so moving across the city feels continuous,
// while the stone scale and laying patterns make every district readable.
const PAVEMENT_PROFILES = Object.freeze({
  hauptmarkt: { cell: [0, 0], scale: 4.4, fallback: ['#d6a66f', '#f0ca90'] },
  domfreihof: { cell: [1, 0], scale: 4.7, fallback: ['#b5ab95', '#e0d2b5'] },
  porta: { cell: [2, 0], scale: 4.1, fallback: ['#d7b273', '#f2d69b'] },
  simeon: { cell: [0, 1], scale: 4.0, fallback: ['#8d8777', '#c7b89c'] },
  kornmarkt: { cell: [1, 1], scale: 3.15, fallback: ['#4a4a43', '#827765'] },
  fleisch: { cell: [2, 1], scale: 2.25, fallback: ['#7b776c', '#b6ad98'] },
  brot: { cell: [0, 2], scale: 2.55, fallback: ['#b58d57', '#e4c586'] },
  christoph: { cell: [1, 2], scale: 4.5, fallback: ['#b7aa90', '#ded0b6'] },
  margareten: { cell: [2, 2], scale: 2.8, fallback: ['#564937', '#8a7658'] },
});

function roundedBoxGeometry(w, h, d, bevel = 0) {
  // Most façade parts reuse only a handful of dimensions.  Sharing their
  // geometry keeps the visual bevel without multiplying GPU allocations.
  const rounded = bevel > .008 && Math.min(w, h, d) > .12;
  const key = `${rounded ? 'r' : 'b'}:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${bevel.toFixed(3)}`;
  const cached = boxGeometryCache.get(key);
  if (cached) return cached;
  const geometry = rounded
    ? new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, Math.min(w, h, d) * .18))
    : new THREE.BoxGeometry(w, h, d);
  boxGeometryCache.set(key, geometry);
  return geometry;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.76,
    metalness: 0.02,
    envMapIntensity: .42,
    ...options,
  });
}

// These materials are deliberately shared by every citizen. The colour tint
// supplies the wardrobe variety while the restrained roughness keeps the
// scene cohesive and inexpensive enough for a crowd in the browser.
function characterMaterial(color, kind = 'fabric') {
  const key = `${kind}-${color}`;
  const cached = characterMaterialCache.get(key);
  if (cached) return cached;
  const options = kind === 'fabric' || kind === 'denim'
    ? { roughness: kind === 'denim' ? .91 : .84, metalness: 0 }
    : kind === 'hair'
      ? { roughness: .82, metalness: 0 }
      : kind === 'skin'
        ? { roughness: .67, metalness: 0, emissive: new THREE.Color(color).multiplyScalar(.025) }
        : kind === 'eye'
          ? { roughness: .24, metalness: .04, emissive: 0x16120e, emissiveIntensity: .08 }
          : kind === 'iris'
            ? { roughness: .32, metalness: .02, emissive: new THREE.Color(color).multiplyScalar(.07) }
            : kind === 'leather'
              ? { roughness: .48, metalness: .03 }
              : { roughness: .72, metalness: 0 };
  const result = new THREE.MeshStandardMaterial({
    color,
    map: kind === 'fabric' || kind === 'denim' ? getFabricTexture() : null,
    envMapIntensity: .24,
    ...options,
  });
  characterMaterialCache.set(key, result);
  return result;
}

function characterMesh(geometry, meshMaterial) {
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

function hash(seed) {
  const value = Math.sin(seed * 91.173 + 17.41) * 15321.731;
  return value - Math.floor(value);
}

function choose(values, seed) {
  return values[Math.floor(hash(seed) * values.length) % values.length];
}

function addBox(parent, { x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, color = 0xffffff, bevel, ...options }) {
  const defaultBevel = Math.min(.075, Math.max(.012, Math.min(w, h, d) * .075));
  const mesh = new THREE.Mesh(roundedBoxGeometry(w, h, d, bevel ?? defaultBevel), material(color, options));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, { x = 0, y = 0, z = 0, rTop = 0.5, rBottom = rTop, h = 1, sides = 10, color = 0xffffff, ...options }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, sides), material(color, options));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Collision shapes live on authored root groups rather than on every visual
// child mesh.  That keeps collisions predictable and affordable while still
// making buildings, props and people feel solid to the player.
function markSolid(group, shape, { cameraFade = false } = {}) {
  const shapes = Array.isArray(shape) ? shape : [shape];
  group.userData.collisionShapes = shapes;
  group.userData.cameraFade = cameraFade;
  return group;
}

function addLabel(parent, text, x, y, z, scale = 1, accent = '#f0c56f') {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 176;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(17, 25, 24, .91)';
  context.roundRect(12, 12, 696, 152, 25);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.roundRect(12, 12, 696, 152, 25);
  context.stroke();
  context.fillStyle = '#f6dfaf';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '600 65px Georgia, serif';
  context.fillText(text, 360, 91);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sign.position.set(x, y, z);
  sign.scale.set(scale * 2.05, scale * 0.5, 1);
  parent.add(sign);
  return sign;
}

function roofHeightFor(w, d) {
  // Street houses in Trier have a relatively restrained slate roof profile.
  // Keeping this shallow reveals the façades instead of making every block
  // read like the same oversized toy roof from the isometric camera.
  return Math.min(.88, .28 + Math.max(w, d) * .055);
}

function makeRoof(w, d, wallHeight, color) {
  const halfW = w / 2 + 0.14;
  const halfD = d / 2 + 0.14;
  const roofHeight = roofHeightFor(w, d);
  const positions = new Float32Array([
    -halfW, wallHeight, -halfD, halfW, wallHeight, -halfD, halfW, wallHeight + roofHeight, 0,
    -halfW, wallHeight, -halfD, halfW, wallHeight + roofHeight, 0, -halfW, wallHeight + roofHeight, 0,
    -halfW, wallHeight, halfD, -halfW, wallHeight + roofHeight, 0, halfW, wallHeight + roofHeight, 0,
    -halfW, wallHeight, halfD, halfW, wallHeight + roofHeight, 0, halfW, wallHeight, halfD,
    -halfW, wallHeight, -halfD, -halfW, wallHeight, halfD, -halfW, wallHeight + roofHeight, 0,
    halfW, wallHeight, -halfD, halfW, wallHeight + roofHeight, 0, halfW, wallHeight, halfD,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Every roof side receives its own UV island. The slate asset is a material on
  // actual pitched geometry, not a flat scene backdrop, so it keeps its texture
  // when the camera follows the player.
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 1, 1,  0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1,  0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1,  0, 0, 1, 1, 0, 1,
  ]), 2));
  geometry.computeVertexNormals();
  const roof = new THREE.Mesh(geometry, material(color, {
    map: getRoofTexture(),
    roughness: 0.88,
    // The source slate is deliberately dark, but must still retain its
    // texture in the warm evening shade instead of collapsing to black.
    emissive: 0x6a645e,
    emissiveIntensity: 0.26,
    side: THREE.DoubleSide,
  }));
  roof.castShadow = true;
  roof.receiveShadow = true;
  return roof;
}

function addRoofDetails(parent, { w, d, h, seed }) {
  const roofHeight = roofHeightFor(w, d);
  const chimneyCount = hash(seed + 44) > .58 ? 2 : 1;
  const chimneyMaterial = choose([0x7d6653, 0x876b56, 0x6e6258], seed + 67);
  for (let index = 0; index < chimneyCount; index += 1) {
    const direction = index === 0 ? -1 : 1;
    const chimneyX = direction * (w * (.18 + hash(seed + index * 9) * .16));
    const chimneyZ = (hash(seed + index * 13) - .5) * d * .24;
    const chimneyHeight = .62 + hash(seed + index * 17) * .26;
    addBox(parent, {
      x: chimneyX, y: h + roofHeight * .42, z: chimneyZ,
      w: .24, h: chimneyHeight, d: .28, color: chimneyMaterial, roughness: .75,
    });
    addBox(parent, {
      x: chimneyX, y: h + roofHeight * .42 + chimneyHeight,
      z: chimneyZ, w: .34, h: .07, d: .37, color: 0x554a42, roughness: .68,
    });
  }
  // A few discreet roof windows break long, repeating roof planes without
  // turning the historic streets into a fantasy skyline.
  if (hash(seed + 78) > .38) {
    const count = w > 5.4 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const x = count === 1 ? 0 : (index ? .2 : -.2) * w;
      const skylight = new THREE.Mesh(
        new THREE.BoxGeometry(.45, .05, .7),
        material(0x263b44, { metalness: .25, roughness: .28, emissive: 0x10242e, emissiveIntensity: .22 }),
      );
      skylight.position.set(x, h + roofHeight * .58, d * .16);
      skylight.rotation.x = -.42;
      skylight.castShadow = true;
      parent.add(skylight);
    }
  }
}

function getRoofTexture() {
  if (roofTexture) return roofTexture;
  roofTexture = new THREE.TextureLoader().load(slateRoofUrl);
  roofTexture.colorSpace = THREE.SRGBColorSpace;
  roofTexture.wrapS = THREE.RepeatWrapping;
  roofTexture.wrapT = THREE.RepeatWrapping;
  roofTexture.repeat.set(2.3, 2.3);
  roofTexture.anisotropy = 6;
  return roofTexture;
}

function getStuccoTexture() {
  if (stuccoTexture) return stuccoTexture;
  // A lightweight painted plaster grain: it is generated once, avoids a
  // repeated photographic tile, and still gives every warm façade a little
  // handmade material variation on mobile as well as desktop.
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ead2ac';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 2300; index += 1) {
    const seed = index * 7.31;
    const tone = 153 + Math.floor(hash(seed) * 62);
    const alpha = .025 + hash(seed + 3) * .07;
    context.fillStyle = `rgba(${tone + 18}, ${tone}, ${Math.max(80, tone - 24)}, ${alpha})`;
    const size = .6 + hash(seed + 5) * 2.2;
    context.fillRect(hash(seed + 8) * canvas.width, hash(seed + 11) * canvas.height, size, size);
  }
  for (let wash = 0; wash < 30; wash += 1) {
    context.fillStyle = `rgba(114, 80, 55, ${.01 + hash(wash + 53) * .025})`;
    context.fillRect(0, hash(wash + 31) * canvas.height, canvas.width, 2 + hash(wash + 61) * 9);
  }
  stuccoTexture = new THREE.CanvasTexture(canvas);
  stuccoTexture.colorSpace = THREE.SRGBColorSpace;
  stuccoTexture.wrapS = THREE.RepeatWrapping;
  stuccoTexture.wrapT = THREE.RepeatWrapping;
  // The hand-painted source is intentionally stretched across an entire
  // facade rather than tiled into an obvious wallpaper pattern.
  stuccoTexture.repeat.set(.92, 1.18);
  stuccoTexture.anisotropy = 6;
  return stuccoTexture;
}

function getFabricTexture() {
  if (fabricTexture) return fabricTexture;
  // A painted weave gives hoodies, denim and jackets a tactile finish without
  // adding a texture download per character. Tinting supplies the individual
  // wardrobe colours while this one small canvas supplies the fibre detail.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#a59c90';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let thread = -256; thread < 512; thread += 7) {
    context.strokeStyle = thread % 14 === 0 ? 'rgba(55, 47, 42, .17)' : 'rgba(246, 230, 203, .10)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(thread, 0);
    context.lineTo(thread - 256, 256);
    context.stroke();
  }
  for (let thread = -256; thread < 512; thread += 9) {
    context.strokeStyle = 'rgba(74, 65, 58, .095)';
    context.beginPath();
    context.moveTo(thread, 256);
    context.lineTo(thread - 256, 0);
    context.stroke();
  }
  for (let fleck = 0; fleck < 980; fleck += 1) {
    const seed = fleck * 11.71;
    const light = 116 + Math.floor(hash(seed) * 72);
    context.fillStyle = `rgba(${light + 14}, ${light + 7}, ${Math.max(58, light - 2)}, ${.025 + hash(seed + 4) * .065})`;
    const size = .45 + hash(seed + 8) * 1.9;
    context.fillRect(hash(seed + 12) * canvas.width, hash(seed + 15) * canvas.height, size, size);
  }
  fabricTexture = new THREE.CanvasTexture(canvas);
  fabricTexture.colorSpace = THREE.SRGBColorSpace;
  fabricTexture.wrapS = THREE.RepeatWrapping;
  fabricTexture.wrapT = THREE.RepeatWrapping;
  fabricTexture.repeat.set(1.45, 1.45);
  fabricTexture.anisotropy = 4;
  return fabricTexture;
}

function getRomanStoneTexture() {
  if (romanStoneTexture) return romanStoneTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#4f4b46';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const rowHeight = 30;
  for (let row = 0; row < 18; row += 1) {
    const offset = row % 2 ? -31 : 0;
    for (let col = 0; col < 9; col += 1) {
      const seed = row * 29 + col * 7;
      const tone = 86 + Math.floor(hash(seed) * 42);
      const red = Math.floor(tone * 1.04);
      const green = Math.floor(tone * .99);
      const blue = Math.floor(tone * .91);
      context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      context.fillRect(offset + col * 63 + 1, row * rowHeight + 1, 60, rowHeight - 3);
      context.fillStyle = 'rgba(255, 222, 166, .055)';
      context.fillRect(offset + col * 63 + 3, row * rowHeight + 3, 55, 2);
    }
  }
  for (let index = 0; index < 900; index += 1) {
    context.fillStyle = hash(index + 22) > .5 ? 'rgba(25, 22, 20, .12)' : 'rgba(230, 204, 161, .08)';
    const size = .5 + hash(index + 31) * 2.1;
    context.fillRect(hash(index + 14) * canvas.width, hash(index + 18) * canvas.height, size, size);
  }
  romanStoneTexture = new THREE.CanvasTexture(canvas);
  romanStoneTexture.colorSpace = THREE.SRGBColorSpace;
  romanStoneTexture.wrapS = THREE.RepeatWrapping;
  romanStoneTexture.wrapT = THREE.RepeatWrapping;
  romanStoneTexture.repeat.set(2.35, 3.15);
  romanStoneTexture.anisotropy = 4;
  return romanStoneTexture;
}

function addWindow(parent, x, y, z, side, width = 0.42, height = 0.62, lit = true) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, height + 0.08, 0.075), material(0x263238, { roughness: 0.42 }));
  frame.position.set(x, y, z + side * 0.045);
  frame.castShadow = true;
  parent.add(frame);
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    material(lit ? 0xffcf84 : 0x70847a, { emissive: lit ? 0xa75e24 : 0x17332f, emissiveIntensity: lit ? 1.05 : 0.18, roughness: 0.3, metalness: 0.14, side: THREE.DoubleSide }),
  );
  pane.position.set(x, y, z + side * 0.09);
  if (side < 0) pane.rotation.y = Math.PI;
  parent.add(pane);
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.032, height, 0.03), material(0x243139));
  mullion.position.copy(frame.position);
  mullion.position.z += side * 0.055;
  parent.add(mullion);
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.028, 0.032), material(0x243139));
  crossbar.position.copy(mullion.position);
  parent.add(crossbar);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.055, 0.12), material(0xe5c99f, { roughness: .58 }));
  sill.position.set(x, y - height / 2 - .04, z + side * .1);
  sill.castShadow = true;
  parent.add(sill);
}

function addShutters(parent, x, y, z, side, width, height, seed) {
  if (hash(seed + 9) < .43) return;
  const shutterColor = choose([0x536b63, 0x7a6251, 0x6e4b43, 0x4a5f72], seed + 14);
  for (const direction of [-1, 1]) addBox(parent, {
    x: x + direction * (width / 2 + .045),
    y: y - height / 2,
    z: z + side * .125,
    w: .065,
    h: height + .04,
    d: .035,
    color: shutterColor,
    roughness: .54,
  });
}

// `addWindow` above is for the front/back of a house.  The long streets are
// viewed diagonally, though, so their narrow street-facing sides need the same
// treatment.  Without this, an isometric camera only sees blank plaster blocks.
function addSideWindow(parent, x, y, z, side, width = 0.42, height = 0.62, lit = true) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.075, height + 0.08, width + 0.08), material(0x263238, { roughness: 0.42 }));
  frame.position.set(x + side * 0.045, y, z);
  frame.castShadow = true;
  parent.add(frame);
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    material(lit ? 0xffcf84 : 0x70847a, { emissive: lit ? 0xa75e24 : 0x17332f, emissiveIntensity: lit ? 1.05 : 0.18, roughness: 0.3, metalness: 0.14, side: THREE.DoubleSide }),
  );
  pane.position.set(x + side * 0.09, y, z);
  pane.rotation.y = Math.PI / 2;
  parent.add(pane);
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.03, height, 0.032), material(0x243139));
  mullion.position.set(x + side * 0.1, y, z);
  parent.add(mullion);
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, width), material(0x243139));
  crossbar.position.copy(mullion.position);
  parent.add(crossbar);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, width + 0.16), material(0xe5c99f, { roughness: .58 }));
  sill.position.set(x + side * .1, y - height / 2 - .04, z);
  sill.castShadow = true;
  parent.add(sill);
}

function addPlanter(parent, x, z, rotation = 0, flowers = 0xd67175) {
  const planter = new THREE.Group();
  planter.position.set(x, 0, z);
  planter.rotation.y = rotation;
  addBox(planter, { w: 0.95, h: 0.28, d: 0.42, color: 0x76513b });
  addBox(planter, { y: 0.28, w: 0.78, h: 0.08, d: 0.32, color: 0x453827 });
  const foliage = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), material(choose(PALETTE.leaf, i + x * 5)));
    leaf.position.set(-0.29 + i * 0.19, 0.48 + (i % 2) * 0.06, (i % 2 ? .08 : -.06));
    foliage.add(leaf);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), material(i % 2 ? flowers : 0xf4c86f));
    bloom.position.set(leaf.position.x + .03, leaf.position.y + .12, leaf.position.z);
    foliage.add(bloom);
  }
  planter.add(foliage);
  planter.userData.wind = { target: foliage, phase: x * .57 + z * .21, sway: .026 };
  parent.add(planter);
  return markSolid(planter, { type: 'box', width: .95, depth: .42, height: .62, padding: .08 });
}

function addWindowBox(parent, { x, y, z, side, flowers, seed }) {
  const box = new THREE.Group();
  box.position.set(x, y, z + side * .14);
  const wood = choose([0x6d503c, 0x7b5e43, 0x4f6159, 0x805844], seed);
  addBox(box, { w: .62, h: .17, d: .22, color: wood, roughness: .64 });
  addBox(box, { y: .17, w: .53, h: .08, d: .17, color: 0x324b36, roughness: .82 });
  const foliage = new THREE.Group();
  for (let index = 0; index < 4; index += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.1 + hash(seed + index) * .025, 8, 6), material(choose(PALETTE.leaf, seed + index * 5)));
    leaf.position.set(-.2 + index * .13, .31 + (index % 2) * .045, (index % 2 ? .035 : -.02));
    foliage.add(leaf);
    if (index !== 1 || hash(seed + 90) > .35) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(.042, 7, 5), material(index % 2 ? flowers : 0xf0c57e));
      bloom.position.set(leaf.position.x + .02, leaf.position.y + .08, leaf.position.z);
      foliage.add(bloom);
    }
  }
  box.add(foliage);
  box.userData.wind = { target: foliage, phase: seed * .39, sway: .018 };
  parent.add(box);
}

function addFacadeGutters(parent, { w, h, d, seed }) {
  const metal = choose([0x4c5654, 0x61645c, 0x755e48], seed + 112);
  const front = -d / 2 - .17;
  const gutter = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, w + .08, 8), material(metal, { metalness: .42, roughness: .45 }));
  gutter.position.set(0, h + .015, front);
  gutter.rotation.z = Math.PI / 2;
  parent.add(gutter);
  const downpipeX = hash(seed + 116) > .5 ? -w / 2 + .16 : w / 2 - .16;
  addCylinder(parent, { x: downpipeX, y: .18, z: front, rTop: .032, rBottom: .032, h: Math.max(1.1, h - .36), sides: 8, color: metal, metalness: .38, roughness: .46 });
  // A few copper details keep the rainy-day hardware from disappearing into
  // the façade and add warmth without becoming a fantasy ornament.
  if (hash(seed + 118) > .69) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), material(0xa86b42, { metalness: .46, roughness: .36 }));
    cap.position.set(downpipeX, h - .12, front);
    parent.add(cap);
  }
}

function addBayWindow(parent, { x, y, z, facade, seed }) {
  const bay = new THREE.Group();
  bay.position.set(x, y, z - .18);
  const trim = choose([0xe3c99d, 0xd6b58c, 0xc69a72], seed + 130);
  addBox(bay, { w: .92, h: .78, d: .3, color: facade, roughness: .68 });
  addBox(bay, { y: .74, w: 1.02, h: .07, d: .38, color: trim, roughness: .56 });
  addWindow(bay, 0, .42, -.18, -1, .47, .44, hash(seed + 137) > .36);
  for (const side of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(.2, .43), material(0x63818a, { metalness: .12, roughness: .25, emissive: 0x17333a, emissiveIntensity: .18, side: THREE.DoubleSide }));
    pane.position.set(side * .475, .42, 0);
    pane.rotation.y = side * Math.PI / 2;
    bay.add(pane);
  }
  parent.add(bay);
}

function addClimbingVine(parent, { x, z, h, side, seed }) {
  const vine = new THREE.Group();
  vine.position.set(x, .36, z + side * .085);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.017, .024, h, 5), material(0x405039, { roughness: .82 }));
  stem.position.y = h / 2;
  vine.add(stem);
  const leaves = new THREE.Group();
  for (let index = 0; index < 8; index += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.1 + hash(seed + index) * .035, 7, 5), material(choose(PALETTE.leaf, seed + index * 3)));
    leaf.position.set((index % 2 ? .1 : -.1) + (hash(seed + index * 7) - .5) * .07, .22 + index * (h / 8.7), side * .028);
    leaf.scale.z = .55;
    leaves.add(leaf);
  }
  vine.add(leaves);
  vine.userData.wind = { target: leaves, phase: seed * .43, sway: .022 };
  parent.add(vine);
}

function createTownhouse(parent, spec) {
  const { x, z, w, h, d, rotation = 0, facade, roof, seed, sign } = spec;
  const building = new THREE.Group();
  building.position.set(x, 0, z);
  building.rotation.y = rotation;
  addBox(building, { w, h, d, color: facade, map: getStuccoTexture(), roughness: .79, bevel: .065 });
  const stories = h > 4 ? 3 : 2;
  const facadeTrim = hash(seed + 33) > .5 ? 0xd6b894 : 0xb98c72;
  // Fine floor bands and edge pilasters wrap the building, so the elevations
  // retain their character from the street and from the diagonal view.
  for (let level = 1; level < stories; level += 1) {
    addBox(building, { y: h * (.34 + level * .25), w: w + .08, h: .055, d: d + .08, color: facadeTrim, roughness: .62 });
  }
  for (const edgeX of [-w / 2 + .08, w / 2 - .08]) {
    addBox(building, { x: edgeX, y: .08, w: .08, h: h - .16, d: d + .06, color: facadeTrim, roughness: .63 });
  }
  const cornice = addBox(building, { y: h - .13, w: w + .14, h: .16, d: d + .1, color: 0xe8cb9c });
  cornice.castShadow = true;
  building.add(makeRoof(w, d, h, roof));
  addRoofDetails(building, { w, d, h, seed });
  addFacadeGutters(building, { w, h, d, seed });
  const front = -d / 2 - .02;
  const rear = d / 2 + .02;
  const columns = Math.max(2, Math.floor(w / .72));
  // Darker, recessed ground floors make shops and cafés read as spaces with
  // depth rather than decorative rectangles glued to a building.
  const hasShopfront = hash(seed + 71) > .28;
  if (!hasShopfront && hash(seed + 146) > .72) addBayWindow(building, {
    x: w * (hash(seed + 147) > .5 ? -.22 : .22), y: h * .42, z: front, facade, seed,
  });
  if (hash(seed + 151) > .73) addClimbingVine(building, {
    x: hash(seed + 152) > .5 ? -w / 2 + .18 : w / 2 - .18, z: front, h: h * .68, side: -1, seed,
  });
  if (hasShopfront) {
    const shopWidth = Math.min(w * .72, Math.max(1.1, w - .82));
    const shopTone = choose([0x263c3e, 0x3b4c4a, 0x5a3a32, 0x44413a], seed + 79);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(shopWidth, 1.12, .055),
      material(shopTone, { metalness: .16, roughness: .2, emissive: 0x12272d, emissiveIntensity: .34 }),
    );
    glass.position.set(-w * .13, .78, front - .072);
    building.add(glass);
    const awningColor = choose([0x546f65, 0x9c5e4b, 0xb98553, 0x506674], seed + 93);
    const awning = addBox(building, { x: -w * .13, y: 1.36, z: front - .19, w: shopWidth + .16, h: .09, d: .34, color: awningColor, roughness: .44 });
    awning.rotation.x = -.09;
    for (let stripe = -1; stripe <= 1; stripe += 1) addBox(building, {
      x: -w * .13 + stripe * (shopWidth / 3), y: 1.46, z: front - .215,
      w: .045, h: .05, d: .355, color: 0xe7c37d, roughness: .48,
    });
  }
  for (let story = 0; story < stories; story += 1) {
    const y = h * .38 + story * (h * .26);
    for (let column = 0; column < columns; column += 1) {
      const windowX = -w / 2 + (column + .5) * (w / columns);
      const windowWidth = Math.min(.4, w / columns - .16);
      addWindow(building, windowX, y, front, -1, windowWidth, .52, hash(seed + story * 7 + column) > .52);
      addShutters(building, windowX, y, front, -1, windowWidth, .52, seed + story * 19 + column);
      // The rear elevation is often what an isometric view sees along a street.
      // It receives a quieter window rhythm than the shop front, but is never a
      // blank box.
      if (column % 2 === 0 || story > 0) addWindow(building, windowX, y, rear, 1, Math.min(.38, w / columns - .18), .5, hash(seed + 101 + story * 7 + column) > .58);
      if (story === 0 && column % 2 === 0 && hash(seed + column * 19) > .38) addWindowBox(building, {
        x: windowX, y: y - .36, z: front, side: -1,
        flowers: choose(PALETTE.flower, seed + column), seed: seed + column * 31,
      });
    }
    // The visible side elevations create the dense urban rhythm of the real
    // Simeonstraße: windows, sills and light instead of a run of empty walls.
    const sideBays = Math.max(2, Math.floor(d / 1.45));
    for (let bay = 0; bay < sideBays; bay += 1) {
      const sideZ = -d / 2 + (bay + .5) * (d / sideBays);
      const sideWidth = Math.min(.46, d / sideBays - .18);
      const lit = hash(seed + 48 + story * 11 + bay) > .24;
      addSideWindow(building, -w / 2 - .02, y, sideZ, -1, sideWidth, .52, lit);
      addSideWindow(building, w / 2 + .02, y, sideZ, 1, sideWidth, .52, hash(seed + 79 + story * 11 + bay) > .29);
    }
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(.58, 1.04, .08), material(0x413329, { roughness: .38 }));
  door.position.set(w * (hash(seed) > .5 ? .26 : -.26), .52, front - .045);
  building.add(door);
  const doorSurround = new THREE.Mesh(new THREE.BoxGeometry(.76, 1.23, .048), material(0xd6b989, { roughness: .56 }));
  doorSurround.position.set(door.position.x, .61, front - .035);
  building.add(doorSurround);
  // Place the actual door forward of its surround to create a small, readable
  // recess at street level.
  door.position.z = front - .095;
  const transom = new THREE.Mesh(new THREE.BoxGeometry(.42, .15, .045), material(0xffcb7a, { emissive: 0x9b4f1e, emissiveIntensity: .7 }));
  transom.position.set(door.position.x, 1.08, front - .09);
  building.add(transom);
  if (hash(seed + 5) > .34) {
    const timber = 0x4c3429;
    for (const y of [h * .31, h * .58]) addBox(building, { y, z: front - .035, w: w * .94, h: .075, d: .055, color: timber });
    for (let trim = 1; trim < columns; trim += 1) addBox(building, { x: -w / 2 + trim * (w / columns), y: h * .31, z: front - .04, w: .07, h: h * .63, d: .055, color: timber });
    const diagonal = new THREE.Mesh(new THREE.BoxGeometry(w * .52, .065, .055), material(timber));
    diagonal.position.set(0, h * .49, front - .07);
    diagonal.rotation.z = -.54;
    building.add(diagonal);
  }
  if (hash(seed + 17) > .48) {
    const dormer = new THREE.Group();
    dormer.position.set(w * (hash(seed + 21) > .5 ? .18 : -.18), h + .26, -.03);
    addBox(dormer, { w: .68, h: .55, d: .52, color: facade });
    dormer.add(makeRoof(.68, .52, .55, roof));
    addWindow(dormer, 0, .32, -.29, -1, .28, .28, true);
    building.add(dormer);
  }
  if (hash(seed + 27) > .62 && w > 4.9) {
    const dormer = new THREE.Group();
    dormer.position.set(w * -.28, h + .2, d * .16);
    addBox(dormer, { w: .62, h: .48, d: .46, color: facade });
    dormer.add(makeRoof(.62, .46, .48, roof));
    addWindow(dormer, 0, .28, -.26, -1, .24, .24, hash(seed + 28) > .3);
    building.add(dormer);
  }
  if (hash(seed + 3) > .34) {
    const balcony = addBox(building, { x: w * .18, y: h * .42, z: front - .12, w: Math.min(1.15, w * .42), h: .08, d: .25, color: 0x343d3d, metalness: .25 });
    for (let rail = -2; rail <= 2; rail += 1) addCylinder(building, { x: balcony.position.x + rail * .17, y: h * .42 + .08, z: front - .18, rTop: .016, rBottom: .016, h: .32, sides: 5, color: 0x283033 });
    addPlanter(building, balcony.position.x, front - .29, 0, choose(PALETTE.flower, seed + 11));
  }
  if (sign) addLabel(building, sign, 0, 1.72, front - .13, Math.min(1.05, w * .22));
  parent.add(building);
  return markSolid(building, { type: 'box', width: w, depth: d, height: h + roofHeightFor(w, d), padding: .06 });
}

// The next three landmarks are deliberately modelled from the distinctive rhythm of
// Trier's Hauptmarkt: the Steipe, St. Gangolf's tower and the ornate gabled houses.
// They make the square legible as Trier rather than a generic old town.
function addGableFace(parent, { w, wallHeight, gableHeight, front, color, timber = false }) {
  const positions = new Float32Array([
    -w / 2, wallHeight, front, w / 2, wallHeight, front, 0, wallHeight + gableHeight, front,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const gable = new THREE.Mesh(geometry, material(color, { roughness: .68, side: THREE.DoubleSide }));
  parent.add(gable);
  if (timber) {
    addBox(parent, { y: wallHeight + gableHeight * .38, z: front - .025, w: w * .72, h: .07, d: .045, color: 0x563a2d });
    const diagonal = new THREE.Mesh(new THREE.BoxGeometry(w * .58, .06, .045), material(0x563a2d));
    diagonal.position.set(0, wallHeight + gableHeight * .43, front - .045);
    diagonal.rotation.z = -.64;
    parent.add(diagonal);
  }
}

function addArcade(parent, x, z, width = .72, height = 1.35, side = -1, color = 0x7d5b45) {
  const depth = .08;
  addBox(parent, { x: x - width / 2, y: .02, z, w: .12, h: height * .72, d: depth, color });
  addBox(parent, { x: x + width / 2, y: .02, z, w: .12, h: height * .72, d: depth, color });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(width / 2, .065, 6, 18, Math.PI), material(color, { roughness: .55 }));
  arch.position.set(x, height * .72, z + side * .02);
  arch.rotation.z = 0;
  parent.add(arch);
}

function createGabledHouse(parent, spec) {
  const { x, z, w, h, d = 3.8, facade, roof = 0xaab2b3, seed, sign, rotation = 0, ornate = false } = spec;
  const house = new THREE.Group();
  house.position.set(x, 0, z);
  house.rotation.y = rotation;
  addBox(house, { w, h, d, color: facade, map: getStuccoTexture(), roughness: .74, bevel: .065 });
  const front = -d / 2 - .035;
  // Narrow pilasters and floor bands give the stylised facades a real, built
  // rhythm instead of a single flat coloured block.
  for (const edge of [-w / 2 + .12, w / 2 - .12]) {
    addBox(house, { x: edge, y: .15, z: front - .03, w: .1, h: h - .18, d: .07, color: ornate ? 0xa65d51 : 0xe8cfaa });
  }
  for (let story = 0; story < 3; story += 1) {
    const y = 1.18 + story * 1.02;
    for (let col = 0; col < Math.max(2, Math.floor(w / .72)); col += 1) {
      const colW = w / Math.max(2, Math.floor(w / .72));
      const windowX = -w / 2 + colW * (col + .5);
      addWindow(house, windowX, y, front, -1, Math.min(.43, colW - .16), .58, true);
      if (story === 0 && col % 2 === 0) addWindowBox(house, {
        x: windowX, y: y - .4, z: front, side: -1,
        flowers: choose(PALETTE.flower, seed + col), seed: seed + col * 17,
      });
    }
    if (story < 2) addBox(house, { y: y + .38, z: front - .035, w: w * .94, h: .055, d: .06, color: ornate ? 0xf1d4b4 : 0xe3c59a });
  }
  addGableFace(house, { w: w + .1, wallHeight: h, gableHeight: Math.min(2.15, w * .43), front: front - .05, color: facade, timber: ornate });
  const roofMesh = makeRoof(w, d, h, roof);
  house.add(roofMesh);
  addRoofDetails(house, { w, d, h, seed });
  addFacadeGutters(house, { w, h, d, seed });
  if (!ornate && hash(seed + 146) > .72) addBayWindow(house, {
    x: w * (hash(seed + 147) > .5 ? -.2 : .2), y: h * .43, z: front, facade, seed,
  });
  if (hash(seed + 151) > .75) addClimbingVine(house, {
    x: hash(seed + 152) > .5 ? -w / 2 + .18 : w / 2 - .18, z: front, h: h * .65, side: -1, seed,
  });
  if (!ornate && hash(seed + 54) > .43) {
    const storefront = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(w * .64, w - .72), 1.02, .06),
      material(choose([0x30474b, 0x493e37, 0x3a514a], seed + 64), { metalness: .13, roughness: .22, emissive: 0x14242a, emissiveIntensity: .25 }),
    );
    storefront.position.set(-w * .13, .76, front - .075);
    house.add(storefront);
    const awning = addBox(house, { x: -w * .13, y: 1.31, z: front - .18, w: Math.min(w * .69, w - .55), h: .085, d: .3, color: choose([0x617b70, 0x9e604c, 0xb98553], seed + 73), roughness: .45 });
    awning.rotation.x = -.08;
  }
  const portal = new THREE.Mesh(new THREE.BoxGeometry(.72, 1.18, .09), material(ornate ? 0x74473a : 0x4a3d36, { roughness: .42 }));
  portal.position.set(ornate ? -.16 : .12, .59, front - .07);
  house.add(portal);
  if (ornate) {
    const crest = new THREE.Mesh(new THREE.CircleGeometry(.17, 12), material(0xf0c57e, { metalness: .22, roughness: .4 }));
    crest.position.set(0, h + .58, front - .085);
    house.add(crest);
    for (const windowY of [h + .48, h + .98]) {
      const gableWindow = new THREE.Mesh(new THREE.CircleGeometry(.13, 10), material(0xffcf83, { emissive: 0x6e3e1f, emissiveIntensity: .5 }));
      gableWindow.position.set(0, windowY, front - .082);
      house.add(gableWindow);
    }
  }
  if (sign) addLabel(house, sign, 0, 1.72, front - .14, Math.min(1.02, w * .22));
  parent.add(house);
  return markSolid(house, { type: 'box', width: w, depth: d, height: h + roofHeightFor(w, d), padding: .06 });
}

function addSteipe(parent, x, z) {
  const steipe = new THREE.Group();
  steipe.name = 'Steipe – Trierer Hauptmarkt';
  steipe.position.set(x, 0, z);
  const facade = 0xf0e4cf;
  const accent = 0x9a483d;
  addBox(steipe, { w: 6.2, h: 5.55, d: 3.9, color: facade, roughness: .63 });
  const front = -2.01;
  for (let bay = -2; bay <= 2; bay += 1) addArcade(steipe, bay * 1.12, front - .045, .78, 1.45, -1, accent);
  for (let story = 0; story < 3; story += 1) {
    for (let bay = -2; bay <= 2; bay += 1) {
      addWindow(steipe, bay * 1.08, 2.08 + story * .9, front - .01, -1, .5, .58, true);
      if (story === 0) {
        const hood = new THREE.Mesh(new THREE.ConeGeometry(.35, .17, 4), material(accent));
        hood.position.set(bay * 1.08, 2.43, front - .12);
        hood.rotation.x = Math.PI / 4;
        steipe.add(hood);
      }
    }
  }
  addBox(steipe, { y: 5.4, w: 6.45, h: .17, d: 4.1, color: 0xd5bc99 });
  for (let crenel = -2.65; crenel <= 2.65; crenel += .66) addBox(steipe, { x: crenel, y: 5.57, z: front + .15, w: .3, h: .35, d: .32, color: accent });
  steipe.add(makeRoof(6.2, 3.9, 5.55, 0xa8b0b1));
  for (const towerX of [-2.52, 2.52]) {
    const turret = new THREE.Group();
    turret.position.set(towerX, 5.53, front + .18);
    addCylinder(turret, { rTop: .29, rBottom: .34, h: .68, sides: 8, color: facade });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.48, .92, 6), material(0xaab2b1, { map: getRoofTexture(), roughness: .78 }));
    cap.position.y = .99;
    turret.add(cap);
    steipe.add(turret);
  }
  addLabel(steipe, 'STEIPE', 0, 1.68, front - .2, .86, '#f0c56f');
  parent.add(steipe);
  return markSolid(steipe, { type: 'box', width: 6.45, depth: 4.15, height: 6.8, padding: .1 });
}

function addGangolfTower(parent, x, z) {
  const tower = new THREE.Group();
  tower.name = 'St. Gangolf – Hauptmarkt';
  tower.position.set(x, 0, z);
  const stone = 0xc8a779;
  addBox(tower, { w: 2.85, h: 7.4, d: 2.85, color: stone, roughness: .73 });
  addBox(tower, { y: 4.2, w: 3.1, h: .18, d: 3.1, color: 0xe1c69b });
  for (const y of [3.15, 5.02, 5.98]) {
    for (const xOffset of [-.7, .7]) addWindow(tower, xOffset, y, -1.47, -1, .42, .83, y > 5 ? false : true);
  }
  for (let battlement = -1.1; battlement <= 1.1; battlement += .55) addBox(tower, { x: battlement, y: 7.28, z: -1.18, w: .25, h: .38, d: .3, color: 0xb58c60 });
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.42, 5.55, 4), material(0xa4afb2, { map: getRoofTexture(), roughness: .8 }));
  spire.position.y = 10.1;
  spire.rotation.y = Math.PI / 4;
  spire.castShadow = true;
  tower.add(spire);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(.08, .85, .08), material(0xd2b06f, { metalness: .32 }));
  cross.position.y = 13.05;
  tower.add(cross);
  const crossBar = new THREE.Mesh(new THREE.BoxGeometry(.45, .08, .08), material(0xd2b06f, { metalness: .32 }));
  crossBar.position.set(0, 13.28, 0);
  tower.add(crossBar);
  parent.add(tower);
  return markSolid(tower, { type: 'circle', radius: 1.5, height: 13.8, padding: .1 });
}

function addTree(parent, x, z, scale = 1, seed = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  addCylinder(tree, { rTop: .11 * scale, rBottom: .17 * scale, h: 1.52 * scale, sides: 8, color: 0x65452c });
  const canopy = new THREE.Group();
  const first = new THREE.Mesh(new THREE.SphereGeometry(.72 * scale, 14, 10), material(choose(PALETTE.leaf, seed)));
  first.position.set(-.13 * scale, 1.72 * scale, .04 * scale);
  const second = new THREE.Mesh(new THREE.SphereGeometry(.62 * scale, 14, 10), material(choose(PALETTE.leaf, seed + 1)));
  second.position.set(.37 * scale, 1.83 * scale, -.05 * scale);
  canopy.add(first, second);
  const distantCanopy = new THREE.Mesh(new THREE.OctahedronGeometry(.86 * scale, 0), material(choose(PALETTE.leaf, seed)));
  distantCanopy.position.set(.08 * scale, 1.75 * scale, 0);
  const lod = new THREE.LOD();
  lod.addLevel(canopy, 0);
  lod.addLevel(distantCanopy, 55);
  tree.add(lod);
  tree.userData.wind = { target: lod, phase: seed * .67, sway: .018 + hash(seed + 9) * .018 };
  parent.add(tree);
  return markSolid(tree, { type: 'circle', radius: .18 + scale * .13, height: 1.6 * scale, padding: .08 });
}

function addLamp(parent, x, z, glow = true) {
  const lamp = new THREE.Group();
  lamp.position.set(x, 0, z);
  addCylinder(lamp, { rTop: .052, rBottom: .095, h: 3.1, sides: 8, color: 0x252d30, metalness: .36, roughness: .46 });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.52, .06, .06), material(0x252d30, { metalness: .35 }));
  arm.position.set(.22, 2.72, 0);
  lamp.add(arm);
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(.23, 0), material(0xffce74, { emissive: 0xa35c20, emissiveIntensity: 1.55, roughness: .3 }));
  lantern.position.set(.47, 2.57, 0);
  lamp.add(lantern);
  if (glow) {
    const point = new THREE.PointLight(0xffb45f, .76, 8, 2.1);
    point.position.set(.47, 2.55, 0);
    lamp.add(point);
  }
  parent.add(lamp);
  return markSolid(lamp, { type: 'circle', radius: .12, height: 3.1, padding: .06 });
}

function addBench(parent, x, z, rotation = 0) {
  const bench = new THREE.Group();
  bench.position.set(x, 0, z);
  bench.rotation.y = rotation;
  addBox(bench, { z: .08, w: 1.45, h: .09, d: .32, color: 0x744b2b });
  addBox(bench, { z: -.13, y: .39, w: 1.45, h: .085, d: .085, color: 0x744b2b });
  for (const legX of [-.51, .51]) addBox(bench, { x: legX, z: .08, w: .075, h: .43, d: .09, color: 0x252d30 });
  parent.add(bench);
  return markSolid(bench, { type: 'box', width: 1.52, depth: .5, height: .5, padding: .1 });
}

function addBicycle(parent, x, z, rotation = 0) {
  const bicycle = new THREE.Group();
  bicycle.position.set(x, .38, z);
  bicycle.rotation.y = rotation;
  const wheelMaterial = material(0x252b2f, { metalness: .35, roughness: .42 });
  for (const wheelX of [-.38, .38]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.28, .027, 5, 14), wheelMaterial);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.x = wheelX;
    bicycle.add(wheel);
  }
  const frame = new THREE.Mesh(new THREE.TorusGeometry(.29, .028, 5, 3), material(0xc47c36, { metalness: .25 }));
  frame.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  bicycle.add(frame);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .32, 5), wheelMaterial);
  handle.position.set(.35, .28, 0);
  handle.rotation.z = -.45;
  bicycle.add(handle);
  parent.add(bicycle);
  return markSolid(bicycle, { type: 'circle', radius: .42, height: .75, padding: .08 });
}

// Small shared street props break up long stretches of paving without adding
// another district or changing any navigation. Their simple meshes keep the
// extra detail cheap on mobile browsers.
function addStreetBin(parent, x, z, rotation = 0) {
  const bin = new THREE.Group();
  bin.position.set(x, 0, z);
  bin.rotation.y = rotation;
  addCylinder(bin, { rTop: .18, rBottom: .21, h: .58, sides: 10, color: 0x37413f, metalness: .35, roughness: .42 });
  addCylinder(bin, { y: .58, rTop: .19, rBottom: .19, h: .07, sides: 10, color: 0x253031, metalness: .42, roughness: .34 });
  addBox(bin, { y: .38, z: -.208, w: .15, h: .11, d: .018, color: 0xc8a66a, emissive: 0x4b351b, emissiveIntensity: .15 });
  parent.add(bin);
  return markSolid(bin, { type: 'circle', radius: .22, height: .7, padding: .05 });
}

function addBikeRack(parent, x, z, rotation = 0) {
  const rack = new THREE.Group();
  rack.position.set(x, 0, z);
  rack.rotation.y = rotation;
  const metal = material(0x3f4b49, { metalness: .58, roughness: .35 });
  for (const offset of [-.42, 0, .42]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(.23, .025, 5, 10, Math.PI), metal);
    hoop.rotation.z = Math.PI / 2;
    hoop.position.set(offset, .24, 0);
    rack.add(hoop);
  }
  parent.add(rack);
  return markSolid(rack, { type: 'box', width: 1.35, depth: .18, height: .5, padding: .08 });
}

function addPostBox(parent, x, z, rotation = 0) {
  const box = new THREE.Group();
  box.position.set(x, 0, z);
  box.rotation.y = rotation;
  addCylinder(box, { rTop: .07, rBottom: .09, h: .77, sides: 8, color: 0x36473e, metalness: .28, roughness: .48 });
  addBox(box, { y: .83, w: .38, h: .38, d: .26, color: 0x416f63, roughness: .45, metalness: .18 });
  addBox(box, { y: .89, z: -.136, w: .24, h: .055, d: .018, color: 0xf0c56c, roughness: .34 });
  parent.add(box);
  return markSolid(box, { type: 'circle', radius: .22, height: 1.3, padding: .08 });
}

function addBarrelCluster(parent, x, z, seed = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  for (let index = 0; index < 2; index += 1) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.23, .25, .5, 10), material(choose([0x714725, 0x855632, 0x65452b], seed + index), { roughness: .66 }));
    barrel.position.set(index * .42, .25, index % 2 ? .14 : 0);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.25, .018, 5, 10), material(0x313b3a, { metalness: .5, roughness: .36 }));
    band.position.copy(barrel.position);
    band.rotation.x = Math.PI / 2;
    group.add(band);
  }
  parent.add(group);
  return markSolid(group, { type: 'box', width: .9, depth: .68, height: .55, padding: .08 });
}

function addMarketCrates(parent, x, z, seed = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  for (let index = 0; index < 3; index += 1) {
    const crate = new THREE.Group();
    crate.position.set((index % 2) * .42, .16 + (index === 2 ? .28 : 0), Math.floor(index / 2) * .34);
    crate.rotation.y = (hash(seed + index) - .5) * .2;
    addBox(crate, { w: .38, h: .29, d: .3, color: choose([0x8a5d32, 0x755136, 0x9a6b3c], seed + index), roughness: .7 });
    for (let fruit = 0; fruit < 3; fruit += 1) {
      const item = new THREE.Mesh(new THREE.SphereGeometry(.055, 7, 5), material(choose([0xc46146, 0xf0b84d, 0x6e8551], seed + index * 7 + fruit)));
      item.position.set(-.1 + fruit * .1, .18, (fruit % 2 ? .04 : -.035));
      crate.add(item);
    }
    group.add(crate);
  }
  parent.add(group);
  return markSolid(group, { type: 'box', width: .95, depth: .72, height: .62, padding: .08 });
}

function addStreetSign(parent, x, z, label, rotation = 0) {
  const sign = new THREE.Group();
  sign.position.set(x, 0, z);
  sign.rotation.y = rotation;
  addCylinder(sign, { rTop: .032, rBottom: .042, h: 1.55, sides: 6, color: 0x2c3939, metalness: .45, roughness: .36 });
  addBox(sign, { y: 1.33, w: .74, h: .25, d: .05, color: 0x31564e, roughness: .4, metalness: .18 });
  addLabel(sign, label, 0, 1.33, -.03, .26, '#f2d398');
  parent.add(sign);
  return markSolid(sign, { type: 'circle', radius: .1, height: 1.65, padding: .04 });
}

function addWindFlag(parent, x, z, color, rotation = 0, seed = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  addCylinder(group, { rTop: .03, rBottom: .04, h: 2.9, sides: 6, color: 0x394442, metalness: .42, roughness: .38 });
  const geometry = new THREE.PlaneGeometry(.76, .48, 4, 3);
  const flag = new THREE.Mesh(geometry, material(color, { roughness: .72, side: THREE.DoubleSide }));
  flag.position.set(.4, 2.53, 0);
  flag.userData.flagWind = { base: Array.from(geometry.attributes.position.array), phase: seed * .71 };
  group.add(flag);
  parent.add(group);
  return group;
}

function addWineStand(parent, x, z) {
  const stand = new THREE.Group();
  stand.position.set(x, 0, z);
  addBox(stand, { w: 3.35, h: 1.32, d: 1.32, color: 0x6b4429 });
  addBox(stand, { y: 1.33, w: 3.65, h: .12, d: 1.58, color: 0x293332 });
  addBox(stand, { y: 2.46, w: 3.82, h: .1, d: 1.78, color: 0x315048, roughness: .5 });
  for (let pole = -1; pole <= 1; pole += 2) addCylinder(stand, { x: pole * 1.45, z: -.57, rTop: .055, rBottom: .075, h: 2.7, sides: 6, color: 0x3a3026 });
  for (let stripe = -3; stripe <= 3; stripe += 1) addBox(stand, { x: stripe * .5, y: 2.69, z: -.57, w: .48, h: .11, d: .1, color: stripe % 2 ? 0xb66244 : 0xf2d29a });
  for (const offset of [-1.06, -.53, 0, .53, 1.06]) {
    const bottle = addCylinder(stand, { x: offset, y: 1.38, z: -.4, rTop: .07, rBottom: .1, h: .42, sides: 7, color: offset % 1 ? 0x704a27 : 0x45644b, roughness: .35 });
    bottle.castShadow = false;
  }
  for (const offset of [-1.2, 1.2]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .58, 10), material(0x80532e));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(offset, .4, .76);
    stand.add(barrel);
  }
  // Friday evening light strings make the Viez stand the social heart of the square.
  const bulbMaterial = material(0xffd887, { emissive: 0xff9d36, emissiveIntensity: 1.8, roughness: .25 });
  for (let bulb = -6; bulb <= 6; bulb += 1) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), bulbMaterial);
    lamp.position.set(bulb * .24, 2.36 - Math.abs(bulb) * .025, -.82);
    stand.add(lamp);
  }
  for (const [tableX, tableZ] of [[-1.7, 1.55], [1.55, 1.62], [2.3, .85]]) {
    addCylinder(stand, { x: tableX, z: tableZ, rTop: .28, rBottom: .28, h: .58, sides: 12, color: 0x68432e });
    addCylinder(stand, { x: tableX, y: .58, z: tableZ, rTop: .42, rBottom: .42, h: .055, sides: 12, color: 0xd2a36a, roughness: .42 });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(.05, .075, .14, 8), material(0xe8dbc2, { transparent: true, opacity: .7, roughness: .16 }));
    glass.position.set(tableX + .09, .74, tableZ);
    stand.add(glass);
  }
  addLabel(stand, 'VIEZ · WEIN', 0, 2.2, -.76, 1.05);
  parent.add(stand);
  return markSolid(stand, { type: 'box', width: 4.05, depth: 3.55, height: 2.8, padding: .12 });
}

function addCafeTerrace(parent, x, z) {
  const cafe = new THREE.Group();
  cafe.position.set(x, 0, z);
  addBox(cafe, { w: 4.7, h: 2.75, d: 2.25, color: 0x9e6949 });
  cafe.add(makeRoof(4.7, 2.25, 2.75, 0x303b43));
  for (let i = -2; i <= 2; i += 1) addWindow(cafe, i * .78, 1.55, -1.16, -1, .5, .72, true);
  addLabel(cafe, 'CAFÉ AM MARKT', 0, 2.13, -1.29, .85);
  for (const row of [-.98, .25]) {
    for (let column = -1; column <= 1; column += 1) {
      const table = new THREE.Group();
      table.position.set(column * 1.1, .02, row - 1.8);
      addCylinder(table, { rTop: .31, rBottom: .31, h: .65, sides: 12, color: 0x785037 });
      addCylinder(table, { y: .65, rTop: .48, rBottom: .48, h: .055, sides: 12, color: 0xd4a86a, roughness: .42 });
      if (row < 0) {
        const umbrella = new THREE.Mesh(new THREE.ConeGeometry(.75, .13, 16), material(column % 2 ? 0xe4c07a : 0x9b5a4a));
        umbrella.position.y = 1.72;
        umbrella.scale.y = .6;
        table.add(umbrella);
      }
      cafe.add(table);
    }
  }
  parent.add(cafe);
  return markSolid(cafe, { type: 'box', width: 5.05, depth: 5.0, height: 2.85, padding: .12 });
}

function addMarketStall(parent, x, z, title, canopyA, canopyB) {
  const stall = new THREE.Group();
  stall.position.set(x, 0, z);
  addBox(stall, { w: 2.45, h: 1.05, d: 1.18, color: 0x784b2c });
  addBox(stall, { y: 1.09, w: 2.7, h: .08, d: 1.43, color: 0x303b36 });
  for (const poleX of [-1.05, 1.05]) addCylinder(stall, { x: poleX, z: -.47, rTop: .042, rBottom: .06, h: 2.3, sides: 6, color: 0x352a22 });
  for (let stripe = -2; stripe <= 2; stripe += 1) addBox(stall, { x: stripe * .54, y: 2.27, z: -.47, w: .53, h: .1, d: .09, color: stripe % 2 ? canopyA : canopyB });
  for (let item = -3; item <= 3; item += 1) {
    const produce = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), material(item % 2 ? 0xd36a51 : 0x91a84e));
    produce.position.set(item * .28, 1.18 + (item % 2 ? .06 : 0), -.42);
    stall.add(produce);
  }
  addLabel(stall, title, 0, 1.74, -.72, .7);
  parent.add(stall);
  return markSolid(stall, { type: 'box', width: 2.78, depth: 1.52, height: 2.4, padding: .12 });
}

function addStreetMusicCorner(parent, x, z) {
  const corner = new THREE.Group();
  corner.position.set(x, 0, z);
  const caseMesh = new THREE.Mesh(new THREE.TorusGeometry(.42, .11, 7, 18, Math.PI), material(0x4b3326, { roughness: .43 }));
  caseMesh.rotation.x = -Math.PI / 2;
  caseMesh.position.set(.44, .08, -.42);
  corner.add(caseMesh);
  const speaker = new THREE.Mesh(new THREE.BoxGeometry(.42, .58, .27), material(0x263037, { roughness: .38 }));
  speaker.position.set(-.54, .3, .22);
  corner.add(speaker);
  const cone = new THREE.Mesh(new THREE.CircleGeometry(.12, 12), material(0xd3a560, { emissive: 0x563719, emissiveIntensity: .3 }));
  cone.position.set(-.54, .3, .37);
  corner.add(cone);
  addLabel(corner, 'LIVE', .1, 1.65, .14, .48, '#e4b964');
  parent.add(corner);
  return markSolid(corner, { type: 'circle', radius: .62, height: 1.3, padding: .1 });
}

function addFountain(parent) {
  const fountain = new THREE.Group();
  fountain.name = 'Petrusbrunnen – Hauptmarkt';
  addCylinder(fountain, { rTop: 2.62, rBottom: 2.84, h: .24, sides: 48, color: 0xd8c09a, roughness: .56 });
  addCylinder(fountain, { y: .23, rTop: 2.38, rBottom: 2.38, h: .14, sides: 48, color: 0x3b8290, metalness: .22, roughness: .18, transparent: true, opacity: .92 });
  addCylinder(fountain, { y: .34, rTop: .72, rBottom: .94, h: .42, sides: 16, color: 0xd0b17d, roughness: .62 });
  addCylinder(fountain, { y: .76, rTop: .38, rBottom: .55, h: 2.1, sides: 12, color: 0xc6a674, roughness: .67 });
  addCylinder(fountain, { y: 2.78, rTop: .78, rBottom: .41, h: .2, sides: 20, color: 0xd9bd8c });
  const statue = new THREE.Group();
  statue.position.y = 2.98;
  const robe = new THREE.Mesh(new THREE.ConeGeometry(.34, 1.05, 9), material(0x926b47, { metalness: .16, roughness: .55 }));
  robe.position.y = .44;
  statue.add(robe);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), material(0x9b714b, { metalness: .16, roughness: .5 }));
  torso.position.y = .98;
  statue.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 10, 8), material(0xb78b59, { metalness: .13, roughness: .5 }));
  head.position.y = 1.28;
  statue.add(head);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.33, 6), material(0xd4b873, { metalness: .46, roughness: .3 }));
  staff.position.set(.26, .7, 0);
  staff.rotation.z = -.13;
  statue.add(staff);
  fountain.add(statue);
  const waterMaterial = new THREE.MeshBasicMaterial({ color: 0xd8f2eb, transparent: true, opacity: .56, depthWrite: false });
  for (let i = 0; i < 6; i += 1) {
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(.022, .045, 1.16, 7, 1, true), waterMaterial);
    stream.position.set(Math.cos(i * Math.PI / 3) * .46, 2.22, Math.sin(i * Math.PI / 3) * .46);
    stream.rotation.z = (i % 2 ? -.18 : .18);
    fountain.add(stream);
  }
  parent.add(fountain);
  return markSolid(fountain, { type: 'circle', radius: 2.84, height: 4.35, padding: .12 });
}

// A Romanesque, sandstone interpretation of Trier Cathedral. Its broad nave,
// paired massing and restrained tower caps deliberately avoid the silhouette of
// a generic Gothic/fantasy cathedral.
function addTrierDom(parent, x, z, quality, rotation = Math.PI) {
  const dom = new THREE.Group();
  dom.name = 'Trierer Dom – Domfreihof';
  dom.position.set(x, 0, z);
  dom.rotation.y = rotation;
  const sandstone = 0xc99f72;
  const lightStone = 0xe0bf91;
  const darkRoof = 0x5a6267;
  addBox(dom, { w: 14.2, h: 10.1, d: 10.8, color: sandstone, roughness: .7 });
  addBox(dom, { y: 8.5, w: 14.7, h: .24, d: 11.15, color: lightStone });
  dom.add(makeRoof(14.2, 10.8, 10.1, darkRoof));
  // Broad transept and a semi-octagonal eastern choir make the footprint feel
  // specific to the Romanesque Trier landmark rather than a narrow church.
  addBox(dom, { y: 3.15, w: 18.2, h: 6.2, d: 4.3, color: 0xd4ae80 });
  dom.add(makeRoof(18.2, 4.3, 6.2, darkRoof));
  const choir = new THREE.Group();
  choir.position.set(0, 0, 5.95);
  addCylinder(choir, { rTop: 4.15, rBottom: 4.15, h: 8.4, sides: 8, color: 0xd2ab7d });
  choir.add(makeRoof(8.1, 6.2, 8.35, darkRoof));
  dom.add(choir);
  for (const towerX of [-5.45, 5.45]) {
    const tower = new THREE.Group();
    tower.position.set(towerX, 0, -5.9);
    addBox(tower, { w: 3.65, h: 16.1, d: 4.25, color: lightStone, roughness: .68 });
    for (const band of [4.4, 9.0, 13.2]) addBox(tower, { y: band, w: 3.95, h: .16, d: 4.52, color: 0xb98d62 });
    for (const y of [6.1, 10.7, 13.8]) {
      addWindow(tower, -.72, y, -2.18, -1, .55, y > 12 ? .95 : .72, false);
      addWindow(tower, .72, y, -2.18, -1, .55, y > 12 ? .95 : .72, false);
    }
    for (let crenel = -1.35; crenel <= 1.35; crenel += .55) addBox(tower, { x: crenel, y: 15.95, z: -1.7, w: .26, h: .5, d: .32, color: 0xb78960 });
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.15, 2.35, 4), material(0x697278, { map: getRoofTexture(), roughness: .85 }));
    cap.position.y = 17.55;
    cap.rotation.y = Math.PI / 4;
    cap.castShadow = true;
    tower.add(cap);
    dom.add(tower);
  }
  const front = -5.48;
  addBox(dom, { y: .02, z: front - .08, w: 8.2, h: 1.12, d: .28, color: 0xb98960 });
  for (const doorX of [-2.4, 0, 2.4]) {
    const portal = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.6, .16), material(0x4b3b32, { roughness: .46 }));
    portal.position.set(doorX, 1.3, front - .1);
    dom.add(portal);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(.72, .12, 8, 18, Math.PI), material(0xb7865e));
    arch.position.set(doorX, 2.58, front - .2);
    dom.add(arch);
  }
  const rose = new THREE.Mesh(new THREE.CircleGeometry(.82, 16), material(0x9ec7d1, { emissive: 0x446a75, emissiveIntensity: .4, roughness: .3 }));
  rose.position.set(0, 6.65, front - .13);
  dom.add(rose);
  for (const xOffset of [-4.5, -2.5, 2.5, 4.5]) addWindow(dom, xOffset, 5.1, front, -1, .58, 1.18, true);
  if (quality !== 'low') {
    for (let candle = -3; candle <= 3; candle += 1) {
      const glow = new THREE.PointLight(0xffb862, .2, 6, 2);
      glow.position.set(candle * 1.4, 3.1, front - .7);
      dom.add(glow);
    }
  }
  addLabel(dom, 'HOHER DOM ZU TRIER', 0, 3.85, front - .46, 1.16, '#efcb7d');
  parent.add(dom);
  return markSolid(dom, { type: 'box', width: 18.5, depth: 12.3, height: 19.8, padding: .15 }, { cameraFade: true });
}

function addRomanAperture(parent, { x, y, z, width, height, stone = 0x887b6d, darkness = 0x232729 }) {
  const radius = width / 2;
  const archHeight = Math.min(radius, height * .42);
  const wallHeight = height - archHeight;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(-radius, wallHeight);
  shape.absarc(0, wallHeight, radius, Math.PI, 0, false);
  shape.lineTo(radius, 0);
  shape.closePath();
  const opening = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(darkness, { roughness: .92, side: THREE.DoubleSide }));
  opening.position.set(x, y, z);
  parent.add(opening);
  for (const side of [-1, 1]) addBox(parent, { x: x + side * (radius + .16), y, z, w: .3, h: wallHeight, d: .42, color: stone, roughness: .83 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, .15, 7, 18, Math.PI), material(stone, { roughness: .77 }));
  rim.position.set(x, y + wallHeight, z - .03);
  parent.add(rim);
  return opening;
}

function addPortaWindow(parent, x, y, z, width = .72, height = 1.08) {
  const radius = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(-radius, height - radius);
  shape.absarc(0, height - radius, radius, Math.PI, 0, false);
  shape.lineTo(radius, 0);
  shape.closePath();
  const aperture = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(0x202528, { roughness: .95, side: THREE.DoubleSide }));
  aperture.position.set(x, y, z);
  parent.add(aperture);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, .055, 6, 14, Math.PI), material(0x8b8174, { roughness: .82 }));
  rim.position.set(x, y + height - radius, z - .018);
  parent.add(rim);
}

function addPortaTowerWindow(parent, towerX, angle, y, width = .62, height = 1.04) {
  const radius = 2.98;
  const halfWidth = width / 2;
  const wallHeight = height - halfWidth;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(-halfWidth, wallHeight);
  shape.absarc(0, wallHeight, halfWidth, Math.PI, 0, false);
  shape.lineTo(halfWidth, 0);
  shape.closePath();
  const opening = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(0x202528, { roughness: .95, side: THREE.DoubleSide }));
  opening.position.set(towerX + Math.sin(angle) * radius, y, Math.cos(angle) * radius);
  opening.rotation.y = angle;
  parent.add(opening);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(halfWidth, .06, 6, 14, Math.PI), material(0x8b8174, { roughness: .82 }));
  rim.position.set(towerX + Math.sin(angle) * (radius + .025), y + wallHeight, Math.cos(angle) * (radius + .025));
  rim.rotation.y = angle;
  parent.add(rim);
}

function addSimeonAwning(parent, x, z, width, side, color) {
  const awning = new THREE.Mesh(new THREE.BoxGeometry(.58, .11, width), material(color, { roughness: .46 }));
  awning.position.set(x, 1.58, z);
  awning.rotation.z = side * .2;
  awning.castShadow = true;
  parent.add(awning);
  const shopWindow = new THREE.Mesh(new THREE.BoxGeometry(.055, 1.08, Math.max(.86, width - .42)), material(0x37505a, { emissive: 0x183742, emissiveIntensity: .42, roughness: .24, metalness: .12 }));
  shopWindow.position.set(x - side * .04, .77, z);
  parent.add(shopWindow);
}

function addSimeonCafeTables(parent, x, z, count = 3) {
  for (let index = 0; index < count; index += 1) {
    const table = new THREE.Group();
    table.position.set(x + (index % 2) * .86, 0, z + Math.floor(index / 2) * .88);
    addCylinder(table, { rTop: .22, rBottom: .22, h: .52, sides: 12, color: 0x69452f });
    addCylinder(table, { y: .52, rTop: .35, rBottom: .35, h: .06, sides: 12, color: 0xd6ab70, roughness: .4 });
    for (const side of [-1, 1]) addBox(table, { x: side * .43, z: .06, y: .02, w: .25, h: .42, d: .26, color: 0x3d534d });
    parent.add(table);
    markSolid(table, { type: 'circle', radius: .52, height: .64, padding: .08 });
  }
}

// The Porta is a deliberately non-fantasy Roman landmark: faceted round towers,
// stacked stone courses and two genuine gate voids instead of a single dark block.
function addPortaNigra(parent, x, z, quality) {
  const porta = new THREE.Group();
  porta.name = 'Porta Nigra – Trier';
  porta.position.set(x, 0, z);
  // Trier sandstone is dark and weathered, not a silhouette. These warmer
  // values keep the Roman courses visible during Golden Hour.
  const stone = 0x81766a;
  const edge = 0xb09b82;
  const course = 0x968a7b;
  for (const towerX of [-5.3, 5.3]) {
    addCylinder(porta, { x: towerX, rTop: 2.78, rBottom: 2.94, h: 15.6, sides: 14, color: stone, map: getRomanStoneTexture(), roughness: .9 });
    for (const y of [1.85, 4.65, 7.45, 10.25, 13.05]) {
      addCylinder(porta, { x: towerX, y, rTop: 2.88, rBottom: 2.88, h: .13, sides: 14, color: course, roughness: .87 });
    }
    for (const faceZ of [-2.78, 2.78]) {
      for (const y of [3.0, 6.0, 9.0, 12.0]) {
        const offset = y % 2 ? .78 : -.78;
        addPortaWindow(porta, towerX + offset, y, faceZ, .66, 1.02);
      }
    }
    // The circular towers also carry apertures on their outward flanks. These
    // are important from the southern, isometric approach to the monument.
    for (const angle of [-Math.PI / 2, Math.PI / 2]) {
      for (const y of [2.85, 5.75, 8.65, 11.55]) addPortaTowerWindow(porta, towerX, angle, y, .62, 1.02);
    }
    addCylinder(porta, { x: towerX, y: 15.45, rTop: 3.05, rBottom: 2.92, h: .38, sides: 14, color: edge, roughness: .8 });
  }
  // Ground floor stays open, making the gate a visible passage from the forecourt
  // into Simeonstraße. The upper bridge carries the recognisable arcaded rhythm.
  for (const faceZ of [-3.06, 3.06]) {
    for (const archX of [-2.0, 2.0]) addRomanAperture(porta, { x: archX, y: .02, z: faceZ, width: 2.15, height: 4.55, stone: edge });
    for (const windowX of [-3.65, -1.2, 1.2, 3.65]) addPortaWindow(porta, windowX, 6.25, faceZ + (faceZ < 0 ? -.08 : .08), .74, 1.16);
    for (const windowX of [-3.65, -1.2, 1.2, 3.65]) addPortaWindow(porta, windowX, 9.1, faceZ + (faceZ < 0 ? -.08 : .08), .72, 1.1);
  }
  addBox(porta, { y: 4.42, w: 9.35, h: 1.12, d: 6.0, color: stone, map: getRomanStoneTexture(), roughness: .87 });
  addBox(porta, { y: 7.55, w: 9.45, h: 3.75, d: 5.72, color: 0x8b7f72, map: getRomanStoneTexture(), roughness: .88 });
  addBox(porta, { y: 11.55, w: 10.25, h: .35, d: 5.95, color: edge, roughness: .8 });
  addBox(porta, { y: 11.9, w: 9.6, h: 2.9, d: 5.45, color: 0x80766b, map: getRomanStoneTexture(), roughness: .9 });
  addBox(porta, { y: 14.72, w: 10.45, h: .34, d: 6.0, color: edge, roughness: .8 });
  for (let step = 0; step < 5; step += 1) addBox(porta, { y: step * .14, z: -4.1 - step * .2, w: 13.4 + step * .5, h: .14, d: .7, color: 0x8f8170, roughness: .86 });
  if (quality !== 'low') {
    const lateSun = new THREE.PointLight(0xffb86e, .86, 18, 1.8);
    lateSun.position.set(-6.5, 6.8, -7.5);
    porta.add(lateSun);
  }
  parent.add(porta);
  // The central gateway deliberately stays open: only the two Roman towers
  // block movement, so the player can really pass through the Porta.
  return markSolid(porta, [
    { type: 'box', x: -5.3, z: 0, width: 5.8, depth: 5.9, height: 15.9, padding: .12 },
    { type: 'box', x: 5.3, z: 0, width: 5.8, depth: 5.9, height: 15.9, padding: .12 },
  ], { cameraFade: true });
}

function addModernBus(parent, x, z) {
  const bus = new THREE.Group();
  bus.position.set(x, 0, z);
  addBox(bus, { w: 2.5, h: 2.2, d: 6.2, color: 0xf2eee3, roughness: .42 });
  addBox(bus, { y: 1.2, z: -3.13, w: 2.2, h: .66, d: .08, color: 0x284958, metalness: .2, roughness: .28 });
  for (const side of [-1, 1]) for (const offset of [-1.65, -.55, .55, 1.65]) addCylinder(bus, { x: side * 1.15, z: offset, rTop: .34, rBottom: .34, h: .14, sides: 12, color: 0x202628 });
  parent.add(bus);
  return markSolid(bus, { type: 'box', width: 2.55, depth: 6.25, height: 2.25, padding: .12 });
}

function addSimeonBlockFabric(parent) {
  // The 3D city model makes the important urban fact very clear: Simeonstraße
  // is embedded in continuous blocks, not surrounded by a large empty plaza.
  // A second, lower roofline turns the playable street into a dense city fabric
  // while keeping the walking axis readable and performant.
  const westBlock = [
    [-14.6, 22.6, 6.7, 3.85, 351], [-14.6, 30.2, 7.1, 4.15, 352],
    [-14.6, 38.0, 7.25, 3.75, 353], [-14.6, 45.5, 6.9, 4.05, 354],
    [-14.6, 53.1, 6.85, 3.8, 355],
  ];
  const eastBlock = [
    [14.6, 22.4, 6.6, 3.75, 361], [14.6, 29.8, 7.0, 4.0, 362],
    [14.6, 37.4, 6.95, 3.7, 363], [14.6, 44.8, 6.7, 4.1, 364],
    [14.6, 52.2, 6.55, 3.8, 365],
  ];
  westBlock.forEach(([x, z, w, h, seed]) => createTownhouse(parent, {
    x, z, w, h, d: 4.8, facade: choose([0xc7a084, 0xd5bf9e, 0xb97866, 0xd09170], seed),
    roof: choose([0x6e777a, 0x87827f, 0x657075], seed), seed, rotation: -Math.PI / 2,
  }));
  eastBlock.forEach(([x, z, w, h, seed]) => createTownhouse(parent, {
    x, z, w, h, d: 4.8, facade: choose([0xc99b7f, 0xd9c8b1, 0xc67868, 0xd39876], seed),
    roof: choose([0x737e82, 0x918a86, 0x687277], seed), seed, rotation: Math.PI / 2,
  }));
  // Tiny courtyard pockets preserve a hint of greenery without opening the
  // compact historic fabric into a park.
  [[-11.6, 26.5], [-11.6, 42.1], [11.65, 33.4], [11.65, 48.6]].forEach(([x, z], index) => {
    addTree(parent, x, z, .68 + (index % 2) * .08, index + 710);
    addPlanter(parent, x + (x < 0 ? 1.0 : -1.0), z + .65, Math.PI / 2, choose(PALETTE.flower, index + 720));
  });
}

function addPortaForecourt(parent, quality) {
  const forecourt = new THREE.Group();
  forecourt.name = 'Porta Nigra – Vorplatz';

  // The Porta needs the generous civic room visible in the reference photos.
  // The broad square sits to the left of the continuing Simeonstraße, so its
  // empty centre frames the monument instead of reading as another street.
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(31.6, 29.2), pavingMaterial(31.6, 29.2, 0xd6bd94, 381, .86, 'porta'));
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(-4.2, -.018, 70.1);
  forecourt.add(paving);
  const centralWalk = new THREE.Mesh(new THREE.PlaneGeometry(13.1, 25.8), pavingMaterial(13.1, 25.8, 0xdcc49d, 382, .84, 'porta'));
  centralWalk.rotation.x = -Math.PI / 2;
  centralWalk.position.set(-4.1, -.012, 70.25);
  forecourt.add(centralWalk);
  for (const x of [-10.85, 2.65]) {
    const line = addBox(forecourt, { x, y: -.015, z: 70.1, w: .075, h: .04, d: 24.2, color: 0x837769, roughness: .78, bevel: .008 });
    line.castShadow = false;
  }

  // Furniture hugs the perimeter. The whole middle remains a clear viewing
  // corridor from the square to the twin gates, like the real Porta forecourt.
  [[-15.6, 60.1, .12], [-15.6, 72.4, .12], [-14.6, 80.9, Math.PI], [3.6, 58.9, -.08], [3.7, 80.8, Math.PI]].forEach(([x, z, rotation]) => addBench(forecourt, x, z, rotation));
  [[-17.4, 61.8], [-17.35, 76.6], [-11.85, 57.9], [4.65, 61.1], [4.6, 78.0], [-11.7, 82.3]].forEach(([x, z], index) => addPlanter(forecourt, x, z, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, 760 + index)));
  [[-16.4, 66.1, .93, 771], [-16.2, 74.0, .84, 772], [-13.7, 81.1, .76, 773], [4.1, 74.7, .7, 774]].forEach(([x, z, scale, seed]) => addTree(forecourt, x, z, scale, seed));
  [[-12.6, 59.4], [-12.8, 78.7], [1.5, 59.5], [1.45, 80.2]].forEach(([x, z], index) => addLamp(forecourt, x, z, quality !== 'low' && index < 2));
  addBikeRack(forecourt, -17.5, 69.2, Math.PI / 2);
  addBicycle(forecourt, -17.2, 70.25, .16);
  addBicycle(forecourt, 3.85, 64.0, -.24);
  addStreetBin(forecourt, -14.9, 63.6, .2);
  addStreetBin(forecourt, 1.5, 63.1, -.2);
  addStreetMusicCorner(forecourt, -15.2, 71.9);
  addStreetSign(forecourt, 4.5, 57.9, 'SIMEONSTRASSE', 0);
  // The western exit is deliberately signposted at eye level.  It is the
  // readable start of the long Christophstraße rather than a hidden route
  // behind the Porta's left tower.
  addStreetSign(forecourt, -18.25, 80.15, 'CHRISTOPHSTRASSE', Math.PI / 2);
  addLabel(forecourt, 'ZUM HAUPTBAHNHOF  ←', -17.4, 3.35, 82.15, .52, '#efc979');
  addWindFlag(forecourt, -18.2, 58.0, 0xa96445, .12, 81);
  addWindFlag(forecourt, 4.75, 58.0, 0x547164, -.12, 82);
  parent.add(forecourt);
  return forecourt;
}

function addPortaSimeonEdge(parent, quality) {
  const street = new THREE.Group();
  street.name = 'Simeonstraße – östliche Platzkante';

  // Seen from the Vorplatz, Simeonstraße now runs clearly along the right-hand
  // edge. A gentle diagonal links it to the existing southern shopping street
  // without turning the square into a maze of rigid, game-like corridors.
  const connector = new THREE.Mesh(new THREE.PlaneGeometry(7.55, 15.0), pavingMaterial(7.55, 15.0, 0xd4b98e, 386, .88, 'simeon'));
  // A PlaneGeometry starts upright.  Turning it on Y after pitching it over
  // tilts its normal back into the air; use Z for the diagonal instead so the
  // connector always remains flush with the paving at the Porta forecourt.
  connector.rotation.set(-Math.PI / 2, 0, 1.01);
  connector.position.set(6.0, -.015, 58.3);
  street.add(connector);
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 30.2), pavingMaterial(7.6, 30.2, 0xd3b88f, 387, .88, 'simeon'));
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(12.6, -.016, 68.2);
  street.add(paving);
  for (const sidewalkX of [9.3, 15.9]) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 29.6), pavingMaterial(1.02, 29.6, 0xa89f92, 388 + (sidewalkX > 12 ? 1 : 0), .93, 'simeon'));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(sidewalkX, -.01, 68.25);
    street.add(sidewalk);
  }
  for (const x of [8.95, 16.25]) addBox(street, { x, y: -.01, z: 68.25, w: .065, h: .04, d: 29.5, color: 0x756d62, roughness: .78, bevel: .008 });

  // This continuous eastern frontage is the missing visual cue: while walking
  // north, the player always reads the historic houses to their right.
  [[19.35, 57.0, 5.15, 4.85, 431, 'KONDITOREI'], [19.35, 63.0, 4.85, 4.45, 432, 'BUCH & KULTUR'], [19.35, 77.6, 5.15, 4.75, 433, 'ATELIER'], [19.35, 83.2, 4.65, 4.45, 434, 'GALERIE']].forEach(([x, z, w, h, seed, sign]) => {
    createTownhouse(street, { x, z, w, h, d: 4.25, facade: choose([0xd9c7ad, 0xcd9877, 0xe0cfb6, 0xc47c67], seed), roof: choose(PALETTE.roof, seed + 2), seed, sign, rotation: Math.PI / 2 });
  });
  [[10.3, 55.7], [15.7, 60.8], [15.75, 74.6], [10.1, 80.2]].forEach(([x, z], index) => {
    addPlanter(street, x, z, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, 810 + index));
    addLamp(street, x + (index % 2 ? -.32 : .32), z + .48, quality !== 'low' && index === 1);
  });
  addSimeonCafeTables(street, 17.3, 60.0, 2);
  addBicycle(street, 16.8, 73.5, Math.PI / 2);
  addBikeRack(street, 17.1, 75.2, Math.PI / 2);
  addStreetSign(street, 16.8, 66.8, 'SIMEONSTRASSE', Math.PI / 2);
  parent.add(street);
  return street;
}

function addChristophstrasse(parent) {
  const street = new THREE.Group();
  street.name = 'Margaretengäßchen – Vorplatz-Erweiterung';

  // At the north-east corner of the Vorplatz, Simeonstraße visibly turns right
  // into Margaretengäßchen. The short continuation is enough to establish the
  // city beyond the gate, without diluting this slice with a second district.
  const eastbound = new THREE.Mesh(new THREE.PlaneGeometry(26.6, 7.4), pavingMaterial(26.6, 7.4, 0xd3b88f, 391, .9, 'margareten'));
  eastbound.rotation.x = -Math.PI / 2;
  eastbound.position.set(28.9, -.016, 69.3);
  street.add(eastbound);
  const southbound = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 18.0), pavingMaterial(7.4, 18.0, 0xd0b38a, 392, .91, 'margareten'));
  southbound.rotation.x = -Math.PI / 2;
  southbound.position.set(39.0, -.016, 61.0);
  street.add(southbound);
  for (const z of [66.05, 72.55]) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(26.1, 1.08), pavingMaterial(26.1, 1.08, 0xa89f92, 393 + (z > 69 ? 1 : 0), .93, 'margareten'));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(28.9, -.01, z);
    street.add(sidewalk);
  }
  for (const x of [35.7, 42.3]) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 16.7), pavingMaterial(1.04, 16.7, 0xa89f92, 395 + (x > 39 ? 1 : 0), .93, 'margareten'));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(x, -.01, 61.0);
    street.add(sidewalk);
  }
  [[23.4, 75.5, 4.8, 4.7, 401, 'CAFÉ'], [28.9, 75.5, 5.2, 4.45, 402, 'TRIERER HANDWERK'], [34.5, 75.5, 4.9, 4.9, 403, 'GALERIE']].forEach(([x, z, w, h, seed, sign]) => {
    createTownhouse(street, { x, z, w, h, d: 4.4, facade: choose([0xd9c7ad, 0xd09a76, 0xc57d68, 0xe0cfb6], seed), roof: choose(PALETTE.roof, seed + 2), seed, sign });
  });
  [[24.4, 62.9, 4.65, 4.25, 411, 'EIS'], [29.9, 62.9, 4.9, 4.6, 412, 'BÄCKEREI'], [45.1, 63.0, 5.0, 4.55, 413, 'STUDIO'], [45.1, 56.5, 4.65, 4.3, 414, 'KAFFEE']].forEach(([x, z, w, h, seed, sign]) => {
    createTownhouse(street, { x, z, w, h, d: 4.1, facade: choose([0xe0d2bc, 0xc98970, 0xd4ac83, 0xc08b79], seed), roof: choose(PALETTE.roof, seed + 4), seed, sign, rotation: Math.PI });
  });
  [[32.2, 56.5, 5.3, 4.45, 421, -Math.PI / 2, 'ATELIER'], [32.2, 49.9, 4.9, 4.7, 422, -Math.PI / 2, null], [45.8, 56.0, 5.05, 4.5, 423, Math.PI / 2, 'MARKT'], [45.8, 50.0, 4.7, 4.35, 424, Math.PI / 2, null]].forEach(([x, z, w, h, seed, rotation, sign]) => {
    createTownhouse(street, { x, z, w, h, d: 4.2, facade: choose([0xd4b795, 0xd6a080, 0xe0d3c0, 0xc8806d], seed), roof: choose(PALETTE.roof, seed + 3), seed, sign, rotation });
  });
  [[19.4, 67.0], [34.0, 72.9], [39.0, 66.9], [39.1, 51.0]].forEach(([x, z], index) => addPlanter(street, x, z, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, 790 + index)));
  [[20.8, 72.8], [29.6, 66.4], [38.0, 53.0], [42.0, 67.0]].forEach(([x, z], index) => addLamp(street, x, z, index < 2));
  addSimeonCafeTables(street, 21.0, 67.3, 3);
  addSimeonCafeTables(street, 37.9, 65.0, 2);
  addBicycle(street, 26.0, 72.0, .22);
  addBikeRack(street, 41.8, 67.6, Math.PI / 2);
  addStreetSign(street, 18.3, 69.2, 'MARGARETENGÄSSCHEN', Math.PI / 2);
  parent.add(street);
  return street;
}

function addHauptbahnhof(parent, x, z, quality) {
  const station = new THREE.Group();
  station.name = 'Hauptbahnhof Trier';
  station.position.set(x, 0, z);
  // The façade faces east towards the station square and the arriving street.
  station.rotation.y = -Math.PI / 2;
  const sandstone = 0xd5bc94;
  const trim = 0xe6d2ac;
  const slate = 0x5f696a;
  const front = -3.58;

  addBox(station, { w: 24.0, h: 7.0, d: 7.0, color: sandstone, map: getStuccoTexture(), roughness: .7, bevel: .08 });
  addBox(station, { y: 6.9, w: 24.7, h: .34, d: 7.5, color: trim, roughness: .58, bevel: .03 });
  addBox(station, { y: 7.22, w: 25.1, h: .22, d: 7.8, color: slate, metalness: .16, roughness: .58, bevel: .03 });
  for (const wing of [-9.0, 9.0]) {
    addBox(station, { x: wing, y: 7.1, w: 5.2, h: .75, d: 7.35, color: slate, roughness: .68, bevel: .05 });
  }
  for (const column of [-10.3, -7.1, -3.9, 3.9, 7.1, 10.3]) {
    addBox(station, { x: column, y: .12, z: front - .09, w: .28, h: 4.65, d: .28, color: trim, roughness: .58, bevel: .025 });
  }
  for (const column of [-8.7, -5.5, -2.3, 2.3, 5.5, 8.7]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.82, 2.05, .075), material(0x29444d, { metalness: .22, roughness: .2, emissive: 0x193a42, emissiveIntensity: .46 }));
    glass.position.set(column, 4.32, front - .05);
    station.add(glass);
    addBox(station, { x: column, y: 3.2, z: front - .09, w: 2.06, h: .12, d: .12, color: trim, roughness: .52, bevel: .02 });
  }
  for (const entry of [-2.1, 2.1]) {
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(2.55, 3.12, .11), material(0x20363b, { metalness: .22, roughness: .24, emissive: 0x1c3a3d, emissiveIntensity: .48 }));
    doorway.position.set(entry, 1.55, front - .08);
    station.add(doorway);
    addBox(station, { x: entry, y: 3.1, z: front - .14, w: 2.88, h: .18, d: .28, color: trim, roughness: .5, bevel: .025 });
  }
  const canopy = addBox(station, { y: 3.52, z: front - .63, w: 7.35, h: .18, d: 1.36, color: 0x354b4e, metalness: .35, roughness: .36, bevel: .03 });
  canopy.rotation.x = -.05;
  for (const postX of [-3.1, 3.1]) addCylinder(station, { x: postX, z: front - 1.18, rTop: .06, rBottom: .07, h: 3.3, sides: 8, color: 0x334346, metalness: .42, roughness: .4 });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(.78, 24), material(0xf0e4c9, { roughness: .48 }));
  clock.position.set(0, 5.57, front - .1);
  clock.rotation.y = Math.PI;
  station.add(clock);
  const clockHand = new THREE.Mesh(new THREE.BoxGeometry(.055, .53, .035), material(0x384143, { metalness: .35 }));
  clockHand.position.set(0, 5.72, front - .14);
  clockHand.rotation.z = -.52;
  station.add(clockHand);
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(.045, .38, .035), material(0x384143, { metalness: .35 }));
  minuteHand.position.set(.14, 5.55, front - .15);
  minuteHand.rotation.z = Math.PI / 2;
  station.add(minuteHand);
  addLabel(station, 'TRIER HAUPTBAHNHOF', 0, 6.65, front - .18, 1.02, '#f1ce7e');
  if (quality !== 'low') {
    const glow = new THREE.PointLight(0xffbd70, .9, 18, 2);
    glow.position.set(0, 4.1, front - 2.4);
    station.add(glow);
  }
  parent.add(station);
  return markSolid(station, { type: 'box', width: 24.2, depth: 7.3, height: 8.0, padding: .12 }, { cameraFade: true });
}

function addMargaretengaesschenToStation(parent, quality) {
  const district = new THREE.Group();
  district.name = 'Christophstraße – Porta Nigra zum Hauptbahnhof';

  // The long Christophstraße deliberately grows from the opposite side of
  // the Porta. It keeps the previously built eastern branch intact while
  // giving the western side the proper city-scale connection requested here.
  // A real, broad L-turn begins at the left edge of the Porta forecourt. The
  // previous diagonal only touched the district visually, which made the
  // station connection easy to miss while playing. This lane stays clear of
  // the Porta's west tower and physically overlaps both pieces of paving.
  const connector = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 18.0), pavingMaterial(9.4, 18.0, 0xd1b38b, 441, .88, 'christoph'));
  connector.rotation.x = -Math.PI / 2;
  connector.position.set(-18.1, -.016, 83.4);
  district.add(connector);
  for (const connectorX of [-22.65, -13.55]) addBox(district, { x: connectorX, y: -.01, z: 83.4, w: .065, h: .04, d: 17.6, color: 0x756d62, roughness: .78, bevel: .008 });
  const street = new THREE.Mesh(new THREE.PlaneGeometry(44.5, 8.55), pavingMaterial(44.5, 8.55, 0xd4b88e, 442, .86, 'christoph'));
  street.rotation.x = -Math.PI / 2;
  street.position.set(-41.6, -.016, 90.0);
  district.add(street);
  for (const z of [86.15, 93.85]) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(43.8, 1.02), pavingMaterial(43.8, 1.02, 0xa79e90, 443 + (z > 90 ? 1 : 0), .93, 'christoph'));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(-41.6, -.01, z);
    district.add(sidewalk);
  }
  for (const z of [85.53, 94.47]) addBox(district, { x: -41.6, y: -.01, z, w: 43.7, h: .04, d: .065, color: 0x756d62, roughness: .78, bevel: .008 });

  const southFrontage = [[-25.1, 81.9, 4.95, 4.6, 451, 'CAFÉ'], [-30.7, 81.9, 5.2, 4.95, 452, 'KIOSK'], [-36.6, 81.9, 4.8, 4.45, 453, 'BÄCKEREI'], [-42.0, 81.9, 5.0, 4.8, 454, 'BUCH'], [-47.7, 81.9, 5.15, 4.55, 455, null], [-53.4, 81.9, 4.85, 4.9, 456, 'TRIER']];
  const northFrontage = [[-25.0, 98.1, 5.0, 4.75, 461, 'APOTHEKE'], [-30.7, 98.1, 4.9, 4.45, 462, 'BLUMEN'], [-36.2, 98.1, 5.15, 4.95, 463, null], [-42.0, 98.1, 5.0, 4.55, 464, 'REISE'], [-47.6, 98.1, 4.85, 4.8, 465, 'EIS'], [-53.1, 98.1, 4.9, 4.45, 466, null]];
  southFrontage.forEach(([x, z, w, h, seed, sign]) => createTownhouse(district, { x, z, w, h, d: 4.55, facade: choose([0xd3a27e, 0xe0cdb2, 0xc47c67, 0xd5b18b], seed), roof: choose(PALETTE.roof, seed + 2), seed, sign, rotation: Math.PI }));
  northFrontage.forEach(([x, z, w, h, seed, sign]) => createTownhouse(district, { x, z, w, h, d: 4.55, facade: choose([0xd9cbb8, 0xc89170, 0xe2d5c2, 0xc58068], seed), roof: choose(PALETTE.roof, seed + 3), seed, sign }));
  [[-23.0, 86.0], [-29.2, 94.0], [-35.6, 86.0], [-42.3, 94.0], [-49.1, 86.0], [-56.3, 93.9]].forEach(([x, z], index) => {
    addPlanter(district, x, z, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, 830 + index));
    addLamp(district, x + (index % 2 ? .42 : -.42), z + (index % 2 ? -.42 : .42), quality !== 'low' && index < 4);
  });
  addSimeonCafeTables(district, -27.5, 86.55, 3);
  addSimeonCafeTables(district, -44.5, 93.25, 2);
  addBicycle(district, -34.5, 86.2, .1);
  addBikeRack(district, -48.6, 94.0, Math.PI / 2);
  addStreetSign(district, -18.0, 87.8, 'CHRISTOPHSTRASSE', -Math.PI / 2);
  addLabel(district, 'HAUPTBAHNHOF  ←', -21.7, 3.2, 86.4, .5, '#efc979');

  // The street releases into a dedicated station square. Its broad paving and
  // clear gap in front of the façade make the Hauptbahnhof a destination, not
  // merely another façade at the end of a corridor.
  const stationSquare = new THREE.Mesh(new THREE.PlaneGeometry(22.5, 25.5), pavingMaterial(22.5, 25.5, 0xd8bd93, 475, .84, 'christoph'));
  stationSquare.rotation.x = -Math.PI / 2;
  stationSquare.position.set(-69.2, -.019, 90.0);
  district.add(stationSquare);
  const arrivalPath = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 7.0), pavingMaterial(13.2, 7.0, 0xdcc7a6, 476, .88, 'christoph'));
  arrivalPath.rotation.x = -Math.PI / 2;
  arrivalPath.position.set(-76.0, -.012, 90.0);
  district.add(arrivalPath);
  [[-63.3, 81.7, .86, 481], [-63.3, 98.4, .86, 482], [-71.8, 79.5, .72, 483], [-71.8, 100.4, .72, 484]].forEach(([x, z, scale, seed]) => addTree(district, x, z, scale, seed));
  [[-62.4, 85.0, 0], [-62.4, 95.0, Math.PI], [-73.0, 82.0, 0], [-73.0, 98.0, Math.PI]].forEach(([x, z, rotation]) => addBench(district, x, z, rotation));
  [[-64.8, 82.8], [-64.8, 97.1], [-74.0, 84.6], [-74.0, 95.4]].forEach(([x, z], index) => addPlanter(district, x, z, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, 850 + index)));
  [[-60.0, 84.0], [-60.0, 96.0], [-74.2, 82.6], [-74.2, 97.4]].forEach(([x, z], index) => addLamp(district, x, z, quality !== 'low' && index < 2));
  addBicycle(district, -65.6, 85.8, .2);
  addBikeRack(district, -66.0, 84.5, Math.PI / 2);
  addModernBus(district, -67.4, 101.4);
  addStreetBin(district, -61.8, 89.0, .1);
  addStreetSign(district, -60.2, 90.0, 'HAUPTBAHNHOF', -Math.PI / 2);
  addHauptbahnhof(district, -83.0, 90.0, quality);
  parent.add(district);
  return district;
}

function addSimeonstrasse(parent, quality) {
  const street = new THREE.Group();
  street.name = 'Simeonstraße – Porta Nigra zum Hauptmarkt';
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 45), pavingMaterial(10.2, 45, 0xd6bd94, 301, .87, 'simeon'));
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(0, -.012, 37.5);
  street.add(paving);
  // Two subtle pavement strips make the long pedestrian axis legible and give
  // the storefronts a proper threshold instead of letting cobbles run wall to wall.
  for (const sidewalkX of [-4.35, 4.35]) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 44.7), pavingMaterial(1.28, 44.7, 0xa89f92, 320 + (sidewalkX > 0 ? 1 : 0), .93, 'simeon'));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(sidewalkX, -.006, 37.5);
    street.add(sidewalk);
  }
  for (const curbX of [-3.67, 3.67]) addBox(street, { x: curbX, y: -.01, z: 37.5, w: .07, h: .045, d: 44.7, color: 0x756d62, roughness: .78 });
  // The street arrives at the middle of the northern Hauptmarkt edge. The
  // opening deliberately lines up with the fountain and reads as a real route.
  const marketMouth = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 8.5), pavingMaterial(10.8, 8.5, 0xd7bb91, 342, .87, 'hauptmarkt'));
  marketMouth.rotation.x = -Math.PI / 2;
  marketMouth.position.set(0, -.014, 17.2);
  street.add(marketMouth);
  const west = [[-7.0, 20.2, 4.9, 4.65, 301, 'EIS'], [-7.0, 26.0, 5.2, 5.05, 302, 'BÄCKEREI'], [-7.0, 32.2, 5.0, 4.55, 303, null], [-7.0, 38.1, 5.45, 5.05, 304, 'TRIER'], [-7.0, 44.3, 5.1, 4.7, 305, 'BUCHLADEN'], [-7.0, 50.1, 4.9, 5.1, 306, null], [-7.0, 55.8, 4.5, 4.55, 307, 'CAFÉ']];
  const east = [[7.0, 20.3, 4.95, 4.85, 311, 'SOUVENIRS'], [7.0, 26.2, 5.05, 4.55, 312, null], [7.0, 32.0, 5.0, 5.15, 313, 'CAFÉ'], [7.0, 38.1, 5.35, 4.75, 314, null], [7.0, 44.0, 5.05, 5.05, 315, 'MARKT'], [7.0, 50.0, 4.9, 4.7, 316, null]];
  west.forEach(([bx, bz, w, h, seed, sign]) => createTownhouse(street, { x: bx, z: bz, w: w + .52, h, d: 5.0, facade: choose([0xd0b89d, 0xc07865, 0xd89a70, 0xc7a07e], seed), roof: choose([0x778185, 0x8d8884, 0x687177], seed + 3), seed, rotation: -Math.PI / 2, sign }));
  east.forEach(([bx, bz, w, h, seed, sign]) => createTownhouse(street, { x: bx, z: bz, w: w + .52, h, d: 5.0, facade: choose([0xd8c6b0, 0xb86e60, 0xd3916c, 0xc49a7b], seed), roof: choose([0x7d878b, 0x938d89, 0x647076], seed + 7), seed, rotation: Math.PI / 2, sign }));
  addSimeonBlockFabric(street);
  west.forEach(([, bz, w], index) => addSimeonAwning(street, -4.42, bz, Math.min(2.3, w * .56), 1, choose([0x6a806d, 0xc67b59, 0xd6b169], index + 84)));
  east.forEach(([, bz, w], index) => addSimeonAwning(street, 4.42, bz, Math.min(2.3, w * .56), -1, choose([0x6a806d, 0x4f6f7a, 0xb76757], index + 93)));
  [[-4.05, 23.1], [4.05, 28.8], [-4.05, 35.0], [4.05, 41.4], [-4.05, 47.5], [4.05, 53.0]].forEach(([px, pz], index) => {
    addPlanter(street, px, pz, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, index + 640));
    addLamp(street, px + (index % 2 ? .35 : -.35), pz + .65, false);
  });
  [[-3.9, 30.2, .2], [4.1, 38.3, -.2], [-3.9, 46.3, .1], [4.1, 51.9, -.25]].forEach(([bx, bz, rot]) => addBicycle(street, bx, bz, rot));
  addSimeonCafeTables(street, 2.35, 32.7, 3);
  addSimeonCafeTables(street, -2.95, 45.7, 2);
  [[-3.8, 18.6, Math.PI / 2], [4.2, 18.7, -Math.PI / 2], [2.2, 15.2, 0]].forEach(([bx, bz, rot]) => addBench(street, bx, bz, rot));
  addModernBus(street, -18.8, 60.7);
  addPortaForecourt(street, quality);
  addPortaSimeonEdge(street, quality);
  addChristophstrasse(street);
  addMargaretengaesschenToStation(street, quality);
  // The larger civic forecourt leaves a full visual breath before the Roman
  // gate. Its offset keeps the monument dominant while opening the east edge
  // for the actual Simeonstraße / Margaretengäßchen junction.
  addPortaNigra(street, -4.1, 90.0, quality);
  parent.add(street);
  return street;
}

function addSouthernStreet(parent, { name, x, seed, signs, accent }) {
  const street = new THREE.Group();
  street.name = `${name} – südlich vom Hauptmarkt`;
  const pavementProfile = name === 'Fleischstraße' ? 'fleisch' : 'brot';
  // Brot- und Fleischstraße are deliberately narrow, continuous urban
  // corridors. The 3D city model shows that this part of Trier is made of
  // dense blocks and shop façades rather than detached buildings.
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 42.5), pavingMaterial(7.3, 42.5, 0xd3b68e, seed + 14, .9, pavementProfile));
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(x, -.014, -34.1);
  street.add(paving);
  for (const sidewalkX of [x - 3.03, x + 3.03]) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 42.1), pavingMaterial(1.08, 42.1, 0xa79d90, seed + 30 + (sidewalkX > x ? 1 : 0), .93, pavementProfile));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(sidewalkX, -.007, -34.1);
    street.add(sidewalk);
  }
  for (const curbX of [x - 2.45, x + 2.45]) addBox(street, { x: curbX, y: -.01, z: -34.1, w: .07, h: .045, d: 42.1, color: 0x756d62, roughness: .78 });
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(8.3, 9.2), pavingMaterial(8.3, 9.2, 0xd7bb91, seed + 44, .88, pavementProfile));
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(x, -.015, -16.7);
  street.add(mouth);

  const addresses = [-17.4, -23.0, -28.6, -34.2, -39.8, -45.4, -50.4];
  addresses.forEach((z, index) => {
    const houseWidth = 4.75 + hash(seed + index * 7) * .65;
    const westHouse = createTownhouse(street, {
      x: x - 5.08, z, w: houseWidth, h: 4.15 + hash(seed + index * 3) * 1.05, d: 4.55,
      facade: choose([0xd2b895, 0xc97b66, 0xe1d3be, 0xb97866, 0xd69a75], seed + index),
      roof: choose([0x6b7377, 0x858583, 0x626c70], seed + index + 2),
      seed: seed + index, rotation: -Math.PI / 2, sign: index % 2 === 0 ? signs[index] : null,
    });
    const eastHouse = createTownhouse(street, {
      x: x + 5.08, z: z + (index % 2 ? .12 : -.12), w: houseWidth + .15, h: 4.25 + hash(seed + index * 5 + 40) * .95, d: 4.55,
      facade: choose([0xe4d8c5, 0xd5a17a, 0xc87568, 0xe7c9a4, 0xc4a287], seed + index + 40),
      roof: choose([0x788185, 0x8b8580, 0x657176], seed + index + 43),
      seed: seed + index + 40, rotation: Math.PI / 2, sign: index % 2 === 1 ? signs[index] : null,
    });
    // Keep a small living threshold in front of alternating shops.
    if (index < 6) {
      addSimeonAwning(street, x - 2.82, z, Math.min(2.5, houseWidth * .54), 1, choose([accent, 0x687b73, 0xc47658], seed + index));
      if (index % 2 === 0) addPlanter(street, x + 2.82, z + .7, Math.PI / 2, choose(PALETTE.flower, seed + index + 90));
    }
    // Name the buildings to retain useful scene structure for later quests.
    westHouse.name = `${name} Westseite ${index + 1}`;
    eastHouse.name = `${name} Ostseite ${index + 1}`;
  });
  [[x - 2.7, -20.2], [x + 2.7, -26.3], [x - 2.7, -32.5], [x + 2.7, -38.5], [x - 2.7, -44.7], [x + 2.7, -49.2]].forEach(([px, pz], index) => {
    addLamp(street, px, pz, false);
    if (index % 2 === 0) addPlanter(street, px + (px < x ? .52 : -.52), pz - .55, 0, choose(PALETTE.flower, seed + index + 120));
  });
  [[x - 1.55, -21.8, .2], [x + 1.85, -35.6, -.3], [x - 1.7, -47.5, .12]].forEach(([px, pz, rotation]) => addBicycle(street, px, pz, rotation));
  addSimeonCafeTables(street, x + .65, -24.6, 2);
  addSimeonCafeTables(street, x - 1.55, -42.8, 2);
  parent.add(street);
  return street;
}

function addSouthernBlockFabric(parent) {
  // These rooflines close the gap between both streets and stop the southern
  // extension from reading like two isolated corridors on a flat plane.
  [-21.0, -30.0, -39.0, -48.0].forEach((z, index) => createGabledHouse(parent, {
    x: 0, z, w: 6.4, h: 4.15 + (index % 2) * .45, d: 5.25,
    facade: choose([0xd0b497, 0xc77d6c, 0xe0d2bd], index + 830),
    roof: choose(PALETTE.roof, index + 840), seed: index + 830, rotation: Math.PI,
    ornate: index === 1,
  }));
  [-20.4, 20.4].forEach((x, side) => {
    [-22.0, -31.2, -40.3, -49.0].forEach((z, index) => createTownhouse(parent, {
      x, z, w: 7.1, h: 3.85 + (index % 3) * .34, d: 4.9,
      facade: choose(side ? [0xd9c2a6, 0xc98771, 0xe3d8c9] : [0xc8a887, 0xd0806c, 0xe1c8a5], index + side * 30 + 850),
      roof: choose(PALETTE.roof, index + side * 30 + 860), seed: index + side * 30 + 850,
      rotation: side ? Math.PI / 2 : -Math.PI / 2,
    }));
  });
}

function addKornmarktFountain(parent, x, z) {
  const fountain = new THREE.Group();
  fountain.name = 'Kornmarktbrunnen – Trier';
  fountain.position.set(x, 0, z);
  addCylinder(fountain, { rTop: 1.72, rBottom: 1.9, h: .22, sides: 40, color: 0xd3b78c, roughness: .62 });
  addCylinder(fountain, { y: .22, rTop: 1.55, rBottom: 1.55, h: .12, sides: 40, color: 0x4d8f9b, metalness: .18, roughness: .2, transparent: true, opacity: .9 });
  addCylinder(fountain, { y: .38, rTop: .5, rBottom: .66, h: .46, sides: 16, color: 0xc5a576, roughness: .63 });
  addCylinder(fountain, { y: .96, rTop: .22, rBottom: .36, h: 1.4, sides: 12, color: 0xbc9366, roughness: .64 });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.66, .31, .15, 18), material(0xd6ba8b, { roughness: .53 }));
  bowl.position.y = 1.72;
  fountain.add(bowl);
  parent.add(fountain);
  return fountain;
}

function addKornmarkt(parent) {
  const market = new THREE.Group();
  market.name = 'Kornmarkt – Trier';
  // Both southern streets release sideways into this calmer, broader end
  // point. Its proportions are compressed for playability, but the dense
  // perimeter follows the city-model's continuous urban fabric.
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(38, 25), pavingMaterial(38, 25, 0xdfc79e, 1101, .93, 'kornmarkt'));
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, -.012, -66.0);
  market.add(surface);
  addKornmarktFountain(market, 0, -66.1);
  [
    [-20.0, -57.7, 5.35, 4.55, 1001, 'KORNMARKT'],
    [-20.0, -63.8, 5.55, 4.25, 1002, 'CAFÉ'],
    [-20.0, -70.0, 5.25, 4.75, 1003, null],
    [-20.0, -75.3, 4.8, 4.35, 1004, 'KULTUR'],
  ].forEach(([x, z, w, h, seed, sign]) => createTownhouse(market, {
    x, z, w, h, d: 4.8, facade: choose([0xd5b794, 0xc77b68, 0xe2d7c5, 0xd09a75], seed),
    roof: choose([0x667074, 0x818486, 0x5d686d], seed), seed, rotation: -Math.PI / 2, sign,
  }));
  [
    [20.0, -57.8, 5.2, 4.4, 1011, 'BISTRO'],
    [20.0, -63.9, 5.45, 4.7, 1012, null],
    [20.0, -70.0, 5.3, 4.3, 1013, 'KORNMARKT'],
    [20.0, -75.2, 4.75, 4.55, 1014, null],
  ].forEach(([x, z, w, h, seed, sign]) => createTownhouse(market, {
    x, z, w, h, d: 4.8, facade: choose([0xe4d7c5, 0xd29a74, 0xc77f6c, 0xe8cfaa], seed),
    roof: choose([0x738085, 0x898783, 0x657075], seed), seed, rotation: Math.PI / 2, sign,
  }));
  [
    [-13.7, -77.3, 4.9, 4.35, 1021, null], [-8.5, -77.3, 4.8, 4.6, 1022, 'FEINKOST'],
    [-3.3, -77.3, 4.75, 4.25, 1023, null], [1.9, -77.3, 4.7, 4.55, 1024, 'KORNMARKT'],
    [7.0, -77.3, 4.8, 4.3, 1025, null], [12.2, -77.3, 4.85, 4.6, 1026, 'VIEZ'],
  ].forEach(([x, z, w, h, seed, sign]) => createGabledHouse(market, {
    x, z, w, h, d: 4.2, facade: choose([0xd5b695, 0xc7836e, 0xe4d7c5, 0xd5a176], seed),
    roof: choose(PALETTE.roof, seed), seed, rotation: Math.PI, ornate: seed % 3 === 0, sign,
  }));
  [[-15.7, -59.3], [-15.8, -72.6], [15.7, -59.5], [15.8, -72.4], [-7.0, -57.1], [8.1, -57.2]].forEach(([x, z], index) => addTree(market, x, z, .78 + (index % 2) * .1, index + 1040));
  [[-8.8, -62.0, .15], [8.9, -62.2, -.18], [-8.2, -71.5, Math.PI], [8.4, -71.1, Math.PI], [-2.6, -59.2, Math.PI / 2], [3.1, -72.7, -Math.PI / 2]].forEach(([x, z, rotation]) => addBench(market, x, z, rotation));
  [[-13.7, -60.3], [13.6, -60.1], [-13.6, -71.8], [13.7, -71.8], [-5.2, -74.1], [5.0, -74.2]].forEach(([x, z], index) => addPlanter(market, x, z, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, index + 1060)));
  [[-14.2, -64.8], [14.3, -64.6], [-10.2, -74.0], [10.3, -74.1]].forEach(([x, z], index) => addLamp(market, x, z, index % 2 === 0));
  addMarketStall(market, -5.2, -65.0, 'REGIONAL', 0x5d806e, 0xf0d7a4);
  addMarketStall(market, 5.0, -69.2, 'BLUMEN', 0xd47078, 0xf0d7a4);
  addStreetMusicCorner(market, -4.8, -72.4);
  addSimeonCafeTables(market, 8.2, -58.8, 3);
  [[-11.0, -65.0, .25], [10.8, -70.3, -.3], [-8.5, -73.2, .1]].forEach(([x, z, rotation]) => addBicycle(market, x, z, rotation));
  parent.add(market);
  return market;
}

function addSternstrasse(parent) {
  const street = new THREE.Group();
  street.name = 'Sternstraße – Verbindung zum Domfreihof';
  // Sternstraße leaves the centre of the western Hauptmarkt edge. It is kept
  // opposite to the previously placed opening, so its direction agrees with
  // the player's orientation on the plaza.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(20.5, 7.4), pavingMaterial(20.5, 7.4, 0xd8bd91, 1201, .88, 'domfreihof'));
  road.rotation.x = -Math.PI / 2;
  road.position.set(-31.0, -.015, 1.1);
  street.add(road);
  for (const sidewalkZ of [-2.05, 4.25]) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(20.3, 1.12), pavingMaterial(20.3, 1.12, 0xa9a093, 1210 + (sidewalkZ > 0 ? 1 : 0), .93, 'domfreihof'));
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(-31.0, -.006, sidewalkZ);
    street.add(sidewalk);
  }
  const north = [
    [-25.4, 6.7, 4.7, 4.7, 201, 'BUCH & KULTUR'], [-30.6, 6.7, 4.9, 4.35, 202, 'KAFFEE'],
    [-35.8, 6.7, 4.5, 4.75, 203, null],
  ];
  const south = [
    [-25.4, -4.5, 4.7, 4.45, 211, 'STERNSTRASSE'], [-30.6, -4.5, 4.9, 4.8, 212, null],
    [-35.8, -4.5, 4.5, 4.35, 213, 'CAFÉ'],
  ];
  north.forEach(([bx, bz, w, h, seed, sign]) => createTownhouse(street, { x: bx, z: bz, w, h, d: 3.6, facade: choose([0xe3d5c0, 0xd18b75, 0xedbc84, 0xc98572], seed), roof: choose([0x687076, 0x777f82], seed), seed, sign }));
  south.forEach(([bx, bz, w, h, seed, sign]) => createTownhouse(street, { x: bx, z: bz, w, h, d: 3.6, facade: choose([0xe4d9c9, 0xc97968, 0xe0ad7c, 0xd2b390], seed), roof: choose([0x626b72, 0x767d80], seed), seed, rotation: Math.PI, sign }));
  [[-24.0, 3.95], [-29.0, -1.8], [-34.0, 3.95], [-38.5, -1.8]].forEach(([px, pz], index) => {
    addPlanter(street, px, pz, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, index + 410));
    addLamp(street, px, index % 2 ? pz - .42 : pz + .42, false);
  });
  [[-27.2, 2.8, -.3], [-33.1, -.9, .35], [-38.2, 2.7, -.2]].forEach(([px, pz, rotation]) => addBicycle(street, px, pz, rotation));
  parent.add(street);
  return street;
}

function addDomfreihof(parent, quality) {
  const court = new THREE.Group();
  court.name = 'Domfreihof – Trier';
  // A deliberately generous court lets the sky open up beyond the narrow
  // Sternstraße. Its eastern edge stays open toward the Hauptmarkt.
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(38, 34), pavingMaterial(38, 34, 0xe2cba4, 1231, .86, 'domfreihof'));
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(-53, -.012, 1);
  court.add(surface);
  addTrierDom(court, -64, 1.2, quality, -Math.PI / 2);
  [
    [-43.0, 12.4, 4.8, 4.65, 231, 'DOMFREIHOF'], [-43.0, -10.3, 4.65, 4.7, 232, null],
    [-52.0, 13.2, 4.5, 4.7, 233, 'CAFÉ DOM'], [-52.0, -11.1, 4.3, 4.55, 234, null],
  ].forEach(([bx, bz, w, h, seed, sign]) => createGabledHouse(court, { x: bx, z: bz, w, h, d: 4.2, facade: choose([0xe5dac8, 0xd3ab80, 0xe9d6ba], seed), roof: 0x677078, seed, sign, rotation: bz > 0 ? 0 : Math.PI, ornate: seed % 2 === 0 }));
  [[-42.5, 9.9], [-42.8, -7.8], [-48.0, 9.2], [-48.6, -8.4], [-55.0, 10.1], [-55.4, -9.2]].forEach(([tx, tz], index) => addTree(court, tx, tz, .82 + (index % 2) * .1, index + 510));
  [[-43.8, 4.8, Math.PI / 2], [-47.4, -4.4, -Math.PI / 2], [-50.4, 7.4, 0], [-51.4, -6.1, 0], [-57.0, 5.4, Math.PI / 2], [-58.2, -5.2, -Math.PI / 2]].forEach(([bx, bz, rot]) => addBench(court, bx, bz, rot));
  [[-42.1, 6.8, -.3], [-48.5, -4.8, .4], [-53.2, 7.9, -.1], [-56.0, -3.0, .2]].forEach(([px, pz, rot]) => addBicycle(court, px, pz, rot));
  [[-41.7, 8.7], [-42.1, -7.1], [-48.8, 8.0], [-49.7, -7.7], [-55.7, 8.8], [-56.4, -7.9]].forEach(([px, pz], index) => addPlanter(court, px, pz, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, index + 550)));
  parent.add(court);
  return court;
}

const WARDROBE_VARIANTS = ['hoodie', 'jacket', 'tee', 'overshirt', 'pullover', 'cardigan'];
const HAIRSTYLE_VARIANTS = ['swept', 'ponytail', 'curly', 'bob', 'bun'];

function variantFrom(value, variants, seed) {
  if (typeof value === 'string' && variants.includes(value)) return value;
  if (Number.isInteger(value)) return variants[Math.abs(value) % variants.length];
  return variants[Math.floor(hash(seed) * variants.length) % variants.length];
}

function createCitizen(index, options = {}) {
  const scale = options.scale || (.74 + hash(index + 4) * .34);
  const build = options.build || (.88 + hash(index + 41) * .22);
  const detail = options.detail || (index >= 500 ? 'hero' : 'crowd');
  const isHero = detail === 'hero';
  const wardrobe = variantFrom(options.wardrobe, WARDROBE_VARIANTS, index + 97);
  const hairstyle = variantFrom(options.hairstyle, HAIRSTYLE_VARIANTS, index + 59);
  const person = new THREE.Group();
  person.name = options.name || `Marktbesucher ${index + 1}`;
  const skin = characterMaterial(options.skin ?? choose(PALETTE.skin, index + 1), 'skin');
  const outfit = characterMaterial(options.outfit ?? choose(PALETTE.outfit, index + 7), 'fabric');
  const shirt = characterMaterial(options.shirt ?? choose([0xe5d6bd, 0xd2d5ca, 0xc9b08b, 0xd5a99c, 0xb8c7bd], index + 111), 'fabric');
  const accent = characterMaterial(options.accent ?? choose([0xf0d3a1, 0xd99062, 0xa8c09b, 0xc9aec3, 0x9fb8c5], index + 121), 'fabric');
  const hair = characterMaterial(options.hair ?? choose(PALETTE.hair, index + 21), 'hair');
  const trousers = characterMaterial(options.trousers ?? choose(PALETTE.trousers, index + 3), 'denim');
  const shoeMaterial = characterMaterial(options.shoes ?? choose([0xf0e0bd, 0x38413e, 0x8d6047, 0x4a515e, 0xd2b17d], index + 91), 'leather');
  const eyeWhite = characterMaterial(0xf9efe2, 'eye');
  const iris = characterMaterial(options.eyes ?? choose([0x5b7167, 0x7c5234, 0x466584, 0x7f8050], index + 131), 'iris');
  const pupil = characterMaterial(0x201b1a, 'pupil');
  const eyeCatch = characterMaterial(0xfff4df, 'eye');
  const mouth = characterMaterial(options.lips ?? 0x8c5045, 'mouth');
  const brow = characterMaterial(options.hair ?? choose(PALETTE.hair, index + 21), 'hair');
  const limbs = { arms: [], legs: [], eyes: [], brows: [], body: null, bodyScaleY: scale, head: null };
  const armsBySide = {};

  // Legs, hips and footwear use rounded parts instead of cubes. A small cuff
  // and laces give the model a recognisable modern silhouette at close range.
  for (const side of [-1, 1]) {
    const legRoot = new THREE.Group();
    legRoot.position.set(side * .135 * scale, .87 * scale, 0);
    const leg = characterMesh(shared.leg, trousers);
    leg.scale.setScalar(scale);
    leg.position.y = -.45 * scale;
    legRoot.add(leg);
    if (isHero) {
      const cuff = characterMesh(shared.collar, shirt);
      cuff.rotation.x = Math.PI / 2;
      cuff.scale.set(.48 * scale, .48 * scale, .48 * scale);
      cuff.position.y = -.64 * scale;
      legRoot.add(cuff);
    }
    const shoe = characterMesh(shared.shoe, shoeMaterial);
    shoe.scale.set(.98 * scale, .59 * scale, 1.48 * scale);
    shoe.position.set(0, -.75 * scale, .05 * scale);
    legRoot.add(shoe);
    if (isHero) {
      const lace = characterMesh(shared.shoeLace, characterMaterial(0xf2e0c8, 'fabric'));
      lace.rotation.z = Math.PI / 2;
      lace.position.set(0, -.735 * scale, .132 * scale);
      legRoot.add(lace);
    }
    person.add(legRoot);
    limbs.legs.push(legRoot);
  }

  const hips = characterMesh(shared.head, trousers);
  hips.scale.set(.86 * scale * build, .45 * scale, .67 * scale);
  hips.position.y = .86 * scale;
  person.add(hips);
  if (isHero) {
    const belt = characterMesh(shared.belt, characterMaterial(0x493a30, 'leather'));
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(.93 * scale * build, .67 * scale, .75 * scale * build);
    belt.position.y = .97 * scale;
    person.add(belt);
  }

  const bodyMaterial = wardrobe === 'tee' ? shirt : outfit;
  const sleeveMaterial = wardrobe === 'tee' ? shirt : outfit;
  const body = characterMesh(shared.torso, bodyMaterial);
  body.scale.set(scale * build, scale, scale * build);
  body.position.y = 1.12 * scale;
  person.add(body);
  limbs.body = body;

  // Each clothing archetype has its own silhouette. The trim and soft layers
  // communicate fabric, not armour, and are limited to a few shared meshes.
  if (wardrobe === 'hoodie') {
    const hood = characterMesh(shared.hood, outfit);
    hood.rotation.x = Math.PI / 2;
    hood.position.set(0, 1.4 * scale, -.15 * scale);
    hood.scale.setScalar(scale * build);
    person.add(hood);
    const pocket = characterMesh(shared.head, outfit);
    pocket.scale.set(.47 * scale * build, .13 * scale, .052 * scale);
    pocket.position.set(0, 1.0 * scale, .255 * scale);
    person.add(pocket);
    for (const side of [-1, 1]) {
      const drawstring = characterMesh(shared.clothingTrim, accent);
      drawstring.position.set(side * .065 * scale, 1.34 * scale, .273 * scale);
      person.add(drawstring);
    }
  } else if (wardrobe === 'jacket') {
    const shirtFront = characterMesh(shared.head, shirt);
    shirtFront.scale.set(.25 * scale * build, .37 * scale, .057 * scale);
    shirtFront.position.set(0, 1.15 * scale, .252 * scale);
    person.add(shirtFront);
    for (const side of [-1, 1]) {
      const lapel = characterMesh(shared.arm, outfit);
      lapel.scale.set(.5 * scale, .72 * scale, .44 * scale);
      lapel.position.set(side * .16 * scale, 1.25 * scale, .28 * scale);
      lapel.rotation.z = side * .25;
      person.add(lapel);
    }
    const zipper = characterMesh(shared.clothingTrim, characterMaterial(0xc9ad7b, 'zipper'));
    zipper.position.set(0, 1.13 * scale, .325 * scale);
    person.add(zipper);
  } else if (wardrobe === 'tee') {
    const collar = characterMesh(shared.collar, accent);
    collar.rotation.x = Math.PI / 2;
    collar.scale.setScalar(scale);
    collar.position.y = 1.48 * scale;
    person.add(collar);
    const hem = characterMesh(shared.clothingTrim, accent);
    hem.rotation.z = Math.PI / 2;
    hem.scale.y = 2.2 * scale * build;
    hem.position.set(0, .96 * scale, .244 * scale);
    person.add(hem);
  } else if (wardrobe === 'overshirt') {
    const coatTail = characterMesh(shared.torso, outfit);
    coatTail.scale.set(.93 * scale * build, .78 * scale, .82 * scale);
    coatTail.position.y = .92 * scale;
    person.add(coatTail);
    const collar = characterMesh(shared.collar, shirt);
    collar.rotation.x = Math.PI / 2;
    collar.scale.setScalar(1.07 * scale);
    collar.position.y = 1.47 * scale;
    person.add(collar);
    for (let button = 0; button < 3; button += 1) {
      const fastener = characterMesh(shared.button, accent);
      fastener.position.set(0, (1.29 - button * .13) * scale, .29 * scale);
      person.add(fastener);
    }
  } else if (wardrobe === 'pullover') {
    const collar = characterMesh(shared.collar, accent);
    collar.rotation.x = Math.PI / 2;
    collar.scale.setScalar(1.1 * scale);
    collar.position.y = 1.46 * scale;
    person.add(collar);
    for (const side of [-1, 1]) {
      const knitLine = characterMesh(shared.clothingTrim, accent);
      knitLine.rotation.z = side * .36;
      knitLine.position.set(side * .135 * scale, 1.18 * scale, .274 * scale);
      person.add(knitLine);
    }
  } else {
    const cardiganFront = characterMesh(shared.head, outfit);
    cardiganFront.scale.set(.54 * scale * build, .7 * scale, .06 * scale);
    cardiganFront.position.set(0, 1.13 * scale, .257 * scale);
    person.add(cardiganFront);
    const shirtOpening = characterMesh(shared.clothingTrim, shirt);
    shirtOpening.position.set(0, 1.16 * scale, .326 * scale);
    person.add(shirtOpening);
    for (let button = 0; button < 3; button += 1) {
      const fastener = characterMesh(shared.button, accent);
      fastener.position.set(0, (1.28 - button * .13) * scale, .333 * scale);
      person.add(fastener);
    }
  }

  // Arm roots keep the existing animation system, but a short sleeve and a
  // softly shaped hand make a T-shirt read differently from a jacket.
  for (const side of [-1, 1]) {
    const armRoot = new THREE.Group();
    armRoot.position.set(side * .305 * scale * build, 1.39 * scale, 0);
    armRoot.rotation.z = side * .1;
    const sleeve = characterMesh(shared.arm, sleeveMaterial);
    const sleeveLength = wardrobe === 'tee' ? .58 : 1;
    sleeve.scale.set(scale, scale * sleeveLength, scale);
    sleeve.position.y = -.2 * scale;
    armRoot.add(sleeve);
    if (wardrobe === 'tee') {
      const forearm = characterMesh(shared.arm, skin);
      forearm.scale.set(scale * .78, scale * .42, scale * .78);
      forearm.position.y = -.38 * scale;
      armRoot.add(forearm);
    }
    const hand = characterMesh(shared.hand, skin);
    hand.scale.set(.84 * scale, scale, .83 * scale);
    hand.position.set(0, -.455 * scale, .02 * scale);
    armRoot.add(hand);
    if (isHero) {
      const thumb = characterMesh(shared.hand, skin);
      thumb.scale.set(.38 * scale, .57 * scale, .33 * scale);
      thumb.position.set(side * .058 * scale, -.43 * scale, .072 * scale);
      armRoot.add(thumb);
    }
    person.add(armRoot);
    limbs.arms.push(armRoot);
    armsBySide[side] = armRoot;
  }

  // Eyes are built in their own small roots. That lets them blink and glance
  // without introducing a skeleton or an expensive character animation clip.
  const headRoot = new THREE.Group();
  headRoot.position.y = 1.67 * scale;
  const faceWidth = options.faceWidth || (.94 + hash(index + 52) * .12);
  const head = characterMesh(shared.head, skin);
  head.scale.set(scale * faceWidth, scale, scale * faceWidth);
  headRoot.add(head);
  if (isHero) {
    const blush = characterMaterial(options.blush ?? 0xbf735f, 'skin');
    for (const side of [-1, 1]) {
      const cheek = characterMesh(shared.hairLock, blush);
      cheek.scale.set(.34 * scale, .16 * scale, .055 * scale);
      cheek.position.set(side * .125 * scale, -.07 * scale, .22 * scale);
      headRoot.add(cheek);
    }
  }
  for (const side of [-1, 1]) {
    const eyeRoot = new THREE.Group();
    eyeRoot.position.set(side * .078 * scale, .045 * scale, .207 * scale);
    const eye = characterMesh(shared.eye, eyeWhite);
    eye.scale.setScalar(scale);
    eyeRoot.add(eye);
    const eyePupil = characterMesh(shared.pupil, pupil);
    eyePupil.scale.set(isHero ? .72 * scale : .94 * scale, isHero ? .72 * scale : .94 * scale, .62 * scale);
    eyePupil.position.z = isHero ? .059 * scale : .043 * scale;
    if (isHero) {
      const eyeIris = characterMesh(shared.pupil, iris);
      eyeIris.scale.set(1.17 * scale, 1.17 * scale, .7 * scale);
      eyeIris.position.z = .039 * scale;
      eyeRoot.add(eyeIris);
    }
    eyeRoot.add(eyePupil);
    if (isHero) {
      const highlight = characterMesh(shared.pupil, eyeCatch);
      highlight.scale.set(.28 * scale, .28 * scale, .2 * scale);
      highlight.position.set(side * -.01 * scale, .012 * scale, .074 * scale);
      eyeRoot.add(highlight);
    }
    headRoot.add(eyeRoot);
    limbs.eyes.push(eyeRoot);
    if (isHero) {
      const eyebrow = characterMesh(shared.brow, brow);
      eyebrow.rotation.z = side * -.2;
      eyebrow.scale.setScalar(scale);
      eyebrow.position.set(side * .082 * scale, .112 * scale, .22 * scale);
      headRoot.add(eyebrow);
      limbs.brows.push(eyebrow);
    }
    const ear = characterMesh(shared.ear, skin);
    ear.scale.set(.62 * scale, scale, .55 * scale);
    ear.position.set(side * .222 * scale * faceWidth, -.01 * scale, 0);
    headRoot.add(ear);
  }
  const nose = characterMesh(shared.nose, skin);
  nose.scale.set(.78 * scale, 1.1 * scale, .9 * scale);
  nose.position.set(0, -.035 * scale, .23 * scale);
  headRoot.add(nose);
  const upperLip = characterMesh(shared.hand, mouth);
  upperLip.scale.set(.43 * scale, .105 * scale, .16 * scale);
  upperLip.position.set(0, -.105 * scale, .226 * scale);
  headRoot.add(upperLip);
  const lowerLip = characterMesh(shared.hand, mouth);
  lowerLip.scale.set(.34 * scale, .07 * scale, .12 * scale);
  lowerLip.position.set(0, -.13 * scale, .228 * scale);
  headRoot.add(lowerLip);

  const hairCap = characterMesh(shared.hair, hair);
  hairCap.scale.setScalar(scale * 1.035);
  hairCap.position.y = .05 * scale;
  headRoot.add(hairCap);
  if (hairstyle === 'swept') {
    for (const [x, y, z] of [[-.12, .085, .17], [-.035, .13, .2], [.07, .1, .185], [.145, .055, .145]]) {
      const lock = characterMesh(shared.hairLock, hair);
      lock.scale.set(.74 * scale, .9 * scale, .5 * scale);
      lock.position.set(x * scale, y * scale, z * scale);
      headRoot.add(lock);
    }
  } else if (hairstyle === 'ponytail') {
    for (const [x, y, z] of [[-.1, .07, .16], [0, .11, .18], [.1, .07, .16]]) {
      const lock = characterMesh(shared.hairLock, hair);
      lock.scale.set(.72 * scale, .82 * scale, .48 * scale);
      lock.position.set(x * scale, y * scale, z * scale);
      headRoot.add(lock);
    }
    const ponytail = characterMesh(shared.hairLock, hair);
    ponytail.scale.set(.94 * scale, 1.3 * scale, .76 * scale);
    ponytail.position.set(.02 * scale, -.04 * scale, -.22 * scale);
    headRoot.add(ponytail);
  } else if (hairstyle === 'curly') {
    [[-.11, .1, .14], [0, .15, .17], [.11, .1, .14], [-.15, .035, .07], [.15, .035, .07]].forEach(([x, y, z]) => {
      const curl = characterMesh(shared.hairCurl, hair);
      curl.scale.set(.9 * scale, 1.06 * scale, .76 * scale);
      curl.position.set(x * scale, y * scale, z * scale);
      headRoot.add(curl);
    });
  } else if (hairstyle === 'bob') {
    for (const side of [-1, 1]) {
      const sideLock = characterMesh(shared.hairLock, hair);
      sideLock.scale.set(.82 * scale, 1.28 * scale, .64 * scale);
      sideLock.position.set(side * .18 * scale, -.045 * scale, .015 * scale);
      headRoot.add(sideLock);
    }
    const fringe = characterMesh(shared.hairLock, hair);
    fringe.scale.set(1.35 * scale, .75 * scale, .45 * scale);
    fringe.position.set(-.025 * scale, .08 * scale, .18 * scale);
    headRoot.add(fringe);
  } else {
    const fringe = characterMesh(shared.hairLock, hair);
    fringe.scale.set(1.36 * scale, .58 * scale, .45 * scale);
    fringe.position.set(0, .1 * scale, .175 * scale);
    headRoot.add(fringe);
    const bun = characterMesh(shared.hairLock, hair);
    bun.scale.set(.88 * scale, .95 * scale, .72 * scale);
    bun.position.set(0, .12 * scale, -.21 * scale);
    headRoot.add(bun);
  }
  const facialHair = options.facialHair || (!isHero && hash(index + 83) > .69 ? 'short' : 'none');
  if (facialHair === 'short' || facialHair === 'beard') {
    const beard = characterMesh(shared.beard, hair);
    beard.scale.set(.84 * scale, facialHair === 'beard' ? .72 * scale : .46 * scale, .3 * scale);
    beard.position.set(0, -.13 * scale, .198 * scale);
    headRoot.add(beard);
  }
  if (options.accessory === 'glasses') {
    const glasses = characterMaterial(0x3a3430, 'leather');
    for (const side of [-1, 1]) {
      const frame = characterMesh(new THREE.TorusGeometry(.054, .008, 5, 10), glasses);
      frame.scale.setScalar(scale);
      frame.position.set(side * .078 * scale, .047 * scale, .257 * scale);
      headRoot.add(frame);
    }
    const bridge = characterMesh(shared.clothingTrim, glasses);
    bridge.rotation.z = Math.PI / 2;
    bridge.scale.y = .56 * scale;
    bridge.position.set(0, .047 * scale, .257 * scale);
    headRoot.add(bridge);
  }
  person.add(headRoot);
  limbs.head = headRoot;

  if (options.accessory === 'bag') {
    const satchel = characterMesh(roundedBoxGeometry(.22, .22, .075, .025), characterMaterial(0x6d5038, 'leather'));
    satchel.position.set(.28 * scale * build, .96 * scale, .2 * scale);
    person.add(satchel);
    const strap = characterMesh(shared.hood, characterMaterial(0x6d5038, 'leather'));
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(.85 * scale, 1.18 * scale, .85 * scale);
    strap.position.set(.04 * scale, 1.18 * scale, .03 * scale);
    person.add(strap);
  }
  if (options.phone) {
    const phone = characterMesh(roundedBoxGeometry(.07, .14, .02, .008), characterMaterial(0x15202a, 'phone'));
    phone.position.set(.02 * scale, -.42 * scale, .08 * scale);
    phone.rotation.z = -.45;
    armsBySide[1].add(phone);
  }
  if (options.drink) {
    const cup = characterMesh(new THREE.CylinderGeometry(.055, .065, .16, 10), characterMaterial(0xf3e5c9, 'cup'));
    cup.position.set(.02 * scale, -.5 * scale, .08 * scale);
    armsBySide[-1].add(cup);
  }
  if (options.guitar) {
    const guitar = characterMesh(new THREE.SphereGeometry(.19, 14, 10), characterMaterial(0xbd7431, 'leather'));
    guitar.scale.set(.78, 1.12, .28);
    guitar.position.set(.16 * scale, 1.0 * scale, .25 * scale);
    person.add(guitar);
  }
  if (options.bike) {
    const bike = new THREE.Group();
    bike.position.set(.44 * scale, .34 * scale, .08);
    const wheelMaterial = material(0x253038, { metalness: .32, roughness: .45 });
    for (const wheelX of [-.21, .21]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(.15, .016, 5, 12), wheelMaterial);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.x = wheelX;
      bike.add(wheel);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(.39, .035, .035), material(0xc67b39, { metalness: .22 }));
    frame.rotation.z = -.35;
    bike.add(frame);
    person.add(bike);
  }
  const outfitMeshes = [];
  const hairMeshes = [];
  const playerOutfitMaterials = new Set([outfit, bodyMaterial, sleeveMaterial]);
  person.traverse((object) => {
    if (!object.isMesh) return;
    if (playerOutfitMaterials.has(object.material)) outfitMeshes.push(object);
    if (object.material === hair) hairMeshes.push(object);
  });
  person.userData = {
    mode: options.mode || 'stand', phase: index * .79, route: options.route || [], home: options.home || new THREE.Vector3(), limbs, detail,
    style: { outfitMeshes, hairMeshes },
  };
  return person;
}

// A small procedural pose layer produces breathing, glances and walking
// without loading a heavyweight animation system for every person on screen.
export function animateCharacterPose(person, time, walking = false) {
  const { limbs, phase = 0 } = person.userData;
  if (!limbs) return;
  const stride = Math.sin(time * 8.2 + phase);
  limbs.legs.forEach((leg, index) => {
    const direction = index === 0 ? 1 : -1;
    leg.rotation.x = walking ? direction * stride * .42 : Math.sin(time * 1.45 + phase + index) * .014;
    leg.rotation.z = direction * .012;
  });
  limbs.arms.forEach((arm, index) => {
    const direction = index === 0 ? 1 : -1;
    arm.rotation.x = walking ? -direction * stride * .48 : Math.sin(time * 1.25 + phase + index) * .035;
    arm.rotation.z = direction * .1 + Math.sin(time * 1.5 + phase + index) * .012;
  });
  limbs.body.rotation.z = walking ? Math.sin(time * 8.2 + phase) * .035 : Math.sin(time * 1.35 + phase) * .012;
  limbs.body.scale.y = limbs.bodyScaleY * (walking ? 1 : 1 + Math.sin(time * 1.55 + phase) * .006);
  limbs.head.rotation.y = walking ? Math.sin(time * 2.3 + phase) * .035 : Math.sin(time * .52 + phase) * .13;
  limbs.head.rotation.x = walking ? .015 : Math.sin(time * .75 + phase) * .018;
  // A tiny, deterministic blink cycle and a slower eye drift make the face
  // feel present even while the player simply watches the square. It remains
  // procedural, so every citizen avoids a separate animation clip.
  const blinkCycle = (time * .235 + phase * .037) % 1;
  const blink = blinkCycle < .058 ? 1 - Math.sin((blinkCycle / .058) * Math.PI) * .86 : 1;
  const gaze = walking ? Math.sin(time * 1.7 + phase) * .025 : Math.sin(time * .47 + phase) * .055;
  limbs.eyes?.forEach((eye) => {
    eye.scale.y = blink;
    eye.rotation.y = gaze;
  });
  limbs.brows?.forEach((brow, index) => {
    brow.rotation.z = (index === 0 ? .2 : -.2) + Math.sin(time * .52 + phase + index) * .018;
  });
}

function applyCitizenActivity(person, time) {
  const { mode, limbs, phase = 0 } = person.userData;
  if (!limbs) return;
  const gesture = Math.sin(time * 1.7 + phase) * .055;
  if (mode === 'phone') {
    limbs.arms[1].rotation.x = -.78 + gesture;
    limbs.head.rotation.x = .16;
  } else if (mode === 'photo' || mode === 'tourist') {
    limbs.arms[0].rotation.x = -.67 + gesture;
    limbs.arms[1].rotation.x = -.7 - gesture;
    limbs.head.rotation.x = -.07;
  } else if (mode === 'drink' || mode === 'shop') {
    limbs.arms[0].rotation.x = -.56 + gesture;
    limbs.head.rotation.y = Math.sin(time * .65 + phase) * .18;
  } else if (mode === 'serve') {
    limbs.arms[0].rotation.x = -.48 + gesture;
    limbs.arms[1].rotation.x = -.22 - gesture;
  } else if (mode === 'listen' || mode === 'look') {
    limbs.head.rotation.y = Math.sin(time * .6 + phase) * .24;
  } else if (mode === 'talk' || mode === 'laugh') {
    limbs.arms[0].rotation.x = -.22 + Math.sin(time * 2.2 + phase) * .14;
  }
}

export function makePerson({ name = 'Spieler', outfit = 0x506b42, hair = 0x553524, scale = 1 } = {}) {
  const player = createCitizen(500, {
    name, outfit, hair, scale, mode: 'player', detail: 'hero', wardrobe: 'hoodie', hairstyle: 'swept',
    accent: 0xd6ba82, trousers: 0x304357, shoes: 0x3e3a35, eyes: 0x586d5a,
  });
  // The subtle selection ring is a classic isometric-RPG cue. It gives the
  // player a reliable visual anchor without turning the world into an arcade.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(.38, .56, 28),
    new THREE.MeshBasicMaterial({ color: 0xf3c96f, transparent: true, opacity: .86, side: THREE.DoubleSide, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = .025;
  player.add(marker);
  player.userData.playerMarker = marker;
  return player;
}

// Only the player is restyled at runtime. NPCs continue to share their
// material cache, while the menu can update the real 3D preview instantly.
export function setPersonStyle(person, { outfit, hair } = {}) {
  const style = person?.userData?.style;
  if (!style) return;
  if (Number.isFinite(outfit)) {
    const nextOutfit = characterMaterial(outfit, 'fabric');
    style.outfitMeshes.forEach((mesh) => { mesh.material = nextOutfit; });
  }
  if (Number.isFinite(hair)) {
    const nextHair = characterMaterial(hair, 'hair');
    style.hairMeshes.forEach((mesh) => { mesh.material = nextHair; });
  }
}

function createPigeons(parent, x, z) {
  const pigeons = [];
  const pigeonMaterial = material(0x52616b, { roughness: .55 });
  for (let i = 0; i < 12; i += 1) {
    const pigeon = new THREE.Mesh(shared.pigeon, pigeonMaterial);
    pigeon.position.set(x + (hash(i + 1) - .5) * 3.3, .09, z + (hash(i + 14) - .5) * 2.1);
    pigeon.castShadow = true;
    pigeon.userData = { baseX: pigeon.position.x, baseZ: pigeon.position.z, phase: i * .71 };
    parent.add(pigeon);
    pigeons.push(pigeon);
  }
  return pigeons;
}

function createQuestFriend(root, definition) {
  const {
    id, name, spot, x, z, outfit, scale, seed, drink = false,
    hair, shirt, accent, trousers, shoes, eyes, wardrobe, hairstyle,
    facialHair, accessory, build, skin, faceWidth,
  } = definition;
  const friend = createCitizen(seed, {
    name,
    outfit,
    scale,
    mode: 'quest',
    home: new THREE.Vector3(x, 0, z),
    drink,
    hair,
    shirt,
    accent,
    trousers,
    shoes,
    eyes,
    wardrobe,
    hairstyle,
    facialHair,
    accessory,
    build,
    skin,
    faceWidth,
    detail: 'hero',
  });
  friend.position.set(x, 0, z);
  friend.rotation.y = Math.PI;
  // Weber's inherited Porz is intentionally humble: it only becomes visible
  // during the wine-stand story, so the later second Porz still feels earned.
  const heirloomPorz = id === 'weber' ? createOldViezporz() : null;
  if (heirloomPorz) {
    heirloomPorz.position.set(.22 * scale, 1.08 * scale, .27 * scale);
    heirloomPorz.rotation.y = -.48;
    heirloomPorz.visible = false;
    friend.add(heirloomPorz);
  }
  const nameplate = addLabel(friend, `${name} · ${spot}`, 0, 2.56 * scale, 0, .58, '#f3cb70');
  nameplate.visible = false;
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(.37 * scale, .026, 7, 20),
    new THREE.MeshBasicMaterial({ color: 0xf7c85c, transparent: true, opacity: .95, depthWrite: false }),
  );
  marker.rotation.x = Math.PI / 2;
  marker.position.y = .025;
  marker.visible = false;
  friend.add(marker);
  const beacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(.14 * scale, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd46e, transparent: true, opacity: .98, depthWrite: false }),
  );
  beacon.position.y = 2.13 * scale;
  beacon.visible = false;
  friend.add(beacon);
  friend.userData.questFriend = {
    id, name, home: new THREE.Vector3(x, 0, z), recruited: false, settled: false, nameplate, marker, beacon, scale, seat: null, heirloomPorz,
  };
  root.add(friend);
  return friend;
}

function createOldViezporz() {
  const porz = new THREE.Group();
  const porcelain = material(0xd0bea1, { roughness: .64, metalness: .03, emissive: 0x4d321c, emissiveIntensity: .1 });
  const paintedRim = material(0x6c6658, { roughness: .58, metalness: .06 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.095, .11, .23, 12), porcelain);
  body.position.y = .115;
  porz.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.095, .012, 6, 12), paintedRim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .23;
  porz.add(rim);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.06, .012, 6, 10), paintedRim);
  handle.rotation.y = Math.PI / 2;
  handle.position.set(.105, .13, 0);
  porz.add(handle);
  return porz;
}

function createQuestFriends(root) {
  return {
    // Each meeting point is deliberately a clear patch of paving just in
    // front of its landmark – never inside a stand, fountain or façade.
    johannes: createQuestFriend(root, {
      id: 'johannes', name: 'Johannes', spot: 'WEINSTAND', x: -10.2, z: .15, outfit: 0x3f6a4f, shirt: 0xd5c5a9,
      accent: 0xd9b16a, trousers: 0x2f4557, shoes: 0x4a4039, hair: 0x5b3827, eyes: 0x556a48,
      wardrobe: 'hoodie', hairstyle: 'swept', accessory: 'bag', scale: 1.05, build: 1.02, seed: 701, drink: true,
    }),
    marc: createQuestFriend(root, {
      id: 'marc', name: 'Marc', spot: 'DOMFREIHOF', x: -47.0, z: 2.8, outfit: 0x36465d, shirt: 0xd4d8d0,
      accent: 0x9da9a1, trousers: 0x30363d, shoes: 0x3a3632, hair: 0x2f2524, eyes: 0x516b72,
      wardrobe: 'jacket', hairstyle: 'swept', facialHair: 'short', accessory: 'glasses', scale: 1.1, build: 1.08, seed: 702,
    }),
    // Jürgen deliberately waits in the quiet eastern side street.  This keeps
    // his encounter distinct from the busy north–south Simeonstraße and makes
    // Margaretengäßchen a real stop in the evening walk.
    juergen: createQuestFriend(root, {
      id: 'juergen', name: 'Jürgen', spot: 'MARGARETENGÄSSCHEN', x: 27.0, z: 69.0, outfit: 0x716754, shirt: 0xc7c1ad,
      accent: 0x8d9c8b, trousers: 0x4a4a43, shoes: 0x60483b, hair: 0x45352c, eyes: 0x6b6549,
      wardrobe: 'overshirt', hairstyle: 'bob', accessory: 'bag', scale: .98, build: .93, seed: 703,
    }),
    charly: createQuestFriend(root, {
      id: 'charly', name: 'Charly', spot: 'KORNMARKT', x: 4.0, z: -69.0, outfit: 0xa66f31, shirt: 0xe0d4bc,
      accent: 0x5c725b, trousers: 0x303f55, shoes: 0xe0d5bb, hair: 0x6b3d29, eyes: 0x5d7351,
      wardrobe: 'tee', hairstyle: 'curly', scale: 1.04, build: .97, seed: 704, drink: true,
    }),
    weber: createQuestFriend(root, {
      id: 'weber', name: 'Weber', spot: 'FLEISCHSTRASSE', x: 12.0, z: -27.8, outfit: 0x5f5951, shirt: 0xcfc5b3,
      accent: 0xb89f6d, trousers: 0x3f4341, shoes: 0x4c4038, hair: 0x777269, eyes: 0x647063,
      wardrobe: 'cardigan', hairstyle: 'bun', facialHair: 'beard', accessory: 'glasses', scale: 1.08, build: 1.04, seed: 705,
    }),
  };
}

function addSideQuestLabel(parent, title, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 920;
  canvas.height = 224;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(17, 25, 24, .92)';
  context.roundRect(12, 12, 896, 200, 28);
  context.fill();
  context.strokeStyle = '#e9bd61';
  context.lineWidth = 4;
  context.roundRect(12, 12, 896, 200, 28);
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#efc76d';
  context.font = '700 35px Inter, Arial, sans-serif';
  context.fillText('OPTIONALE NEBENQUEST', 460, 67);
  context.fillStyle = '#f5e3bc';
  context.font = '600 47px Georgia, serif';
  context.fillText(title.toUpperCase(), 460, 143);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  label.position.set(0, 3.78 * scale, 0);
  label.scale.set(3.15 * scale, .77 * scale, 1);
  label.visible = false;
  parent.add(label);
  return label;
}

function createSideQuestMarker(parent, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  context.shadowColor = 'rgba(50, 28, 9, .72)';
  context.shadowBlur = 14;
  context.fillStyle = '#f1c466';
  context.beginPath();
  context.roundRect(22, 20, 148, 124, 47);
  context.fill();
  context.beginPath();
  context.moveTo(74, 132);
  context.lineTo(89, 165);
  context.lineTo(111, 141);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
  context.lineWidth = 9;
  context.strokeStyle = '#5b3d1d';
  context.beginPath();
  context.roundRect(22, 20, 148, 124, 47);
  context.stroke();
  context.fillStyle = '#29312b';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '800 102px Georgia, serif';
  context.fillText('!', 96, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  marker.position.set(0, 3.16 * scale, 0);
  marker.scale.set(1.05 * scale, 1.05 * scale, 1);
  parent.add(marker);
  return marker;
}

function createSideQuestTarget(root, point, radius = .9, label = '') {
  const marker = new THREE.Group();
  marker.position.set(point.x, .026, point.z);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * .7, radius, 28),
    new THREE.MeshBasicMaterial({ color: 0xf1c568, transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  marker.add(ring);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(radius * .11, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe1a0, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = .008;
  marker.add(inner);
  if (label) {
    const canvas = document.createElement('canvas');
    canvas.width = 560;
    canvas.height = 120;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(18, 29, 26, .9)';
    context.roundRect(10, 10, 540, 100, 28);
    context.fill();
    context.strokeStyle = '#edc66f';
    context.lineWidth = 4;
    context.roundRect(10, 10, 540, 100, 28);
    context.stroke();
    context.fillStyle = '#f5e3bc';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 37px Inter, Arial, sans-serif';
    context.fillText(label, 280, 60);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const waypoint = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    waypoint.position.y = 1.45;
    waypoint.scale.set(2.7, .58, 1);
    marker.add(waypoint);
  }
  marker.userData = { ring, inner, radius };
  marker.visible = false;
  root.add(marker);
  return marker;
}

function createSideQuestCharacters(root) {
  const details = {
    'porta-photo': {
      seed: 811, outfit: 0x75564c, shirt: 0xe2d0b5, accent: 0xb8a37a, hair: 0x4e3326, eyes: 0x5f725e,
      wardrobe: 'jacket', hairstyle: 'bob', accessory: 'bag', mode: 'photo', phone: true, scale: 1.02,
    },
    'lost-plectrum': {
      seed: 812, outfit: 0x3f635d, shirt: 0xd9d3c1, accent: 0xc98b45, hair: 0x34221d, eyes: 0x64748b,
      wardrobe: 'overshirt', hairstyle: 'curly', mode: 'music', guitar: true, scale: 1.05,
    },
    'find-the-dom': {
      seed: 813, outfit: 0x586b87, shirt: 0xe0d2bb, accent: 0xc89a62, hair: 0x764b31, eyes: 0x786344,
      wardrobe: 'pullover', hairstyle: 'ponytail', accessory: 'bag', mode: 'tourist', phone: true, scale: 1.0,
    },
  };
  return Object.fromEntries(SIDE_QUESTS.map((definition) => {
    const look = details[definition.id];
    const person = createCitizen(look.seed, {
      name: definition.npc,
      outfit: look.outfit,
      hair: look.hair,
      mode: look.mode,
      phone: look.phone,
      guitar: look.guitar,
      scale: look.scale,
      shirt: look.shirt,
      accent: look.accent,
      eyes: look.eyes,
      wardrobe: look.wardrobe,
      hairstyle: look.hairstyle,
      accessory: look.accessory,
      detail: 'hero',
      home: new THREE.Vector3(definition.point.x, 0, definition.point.z),
    });
    person.name = `${definition.npc} – optionale Nebenquest`;
    person.position.set(definition.point.x, 0, definition.point.z);
    person.rotation.y = definition.id === 'porta-photo' ? -.15 : Math.PI;
    const marker = createSideQuestMarker(person, look.scale);
    const label = addSideQuestLabel(person, definition.shortTitle, look.scale);
    const homeMarker = createSideQuestTarget(root, definition.point, 1.1);
    const targetMarker = createSideQuestTarget(
      root,
      definition.target,
      definition.id === 'lost-plectrum' ? 2.25 : definition.id === 'find-the-dom' ? 1.65 : 1.0,
      definition.id === 'find-the-dom' ? 'DOMFREIHOF' : '',
    );
    let plectrum = null;
    if (definition.id === 'lost-plectrum') {
      plectrum = new THREE.Group();
      plectrum.position.set(definition.target.x, .045, definition.target.z);
      const pick = new THREE.Mesh(
        new THREE.CircleGeometry(.115, 7),
        new THREE.MeshStandardMaterial({ color: 0xd08a37, emissive: 0x5f3210, emissiveIntensity: .22, roughness: .42, side: THREE.DoubleSide }),
      );
      pick.rotation.x = -Math.PI / 2;
      pick.rotation.z = .42;
      plectrum.add(pick);
      const glint = new THREE.PointLight(0xffc66d, .28, 2.1, 2);
      glint.position.y = .2;
      plectrum.add(glint);
      plectrum.visible = false;
      root.add(plectrum);
    }
    person.userData.sideQuest = {
      id: definition.id,
      home: new THREE.Vector3(definition.point.x, 0, definition.point.z),
      target: new THREE.Vector3(definition.target.x, 0, definition.target.z),
      state: 'available',
      escorting: false,
      marker,
      label,
      homeMarker,
      targetMarker,
      plectrum,
      scale: look.scale,
    };
    root.add(person);
    return [definition.id, person];
  }));
}

function createGoldenLight(root) {
  const group = new THREE.Group();
  group.name = 'Der Goldene Viezporz';
  // The last scene happens below the southern arch of the Porta Nigra, not in
  // an arbitrary side lane. It is deliberately small and grounded: a cup in
  // warm light rather than a fantasy effect.
  group.position.set(-2.0, 0, 86.35);
  group.visible = false;
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(.56, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc34f, transparent: true, opacity: .58, side: THREE.DoubleSide, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = .03;
  group.add(pool);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(.16, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffcf67, emissive: 0xff9e23, emissiveIntensity: 2.4, roughness: .32 }),
  );
  glow.position.y = .42;
  group.add(glow);
  const porz = new THREE.Group();
  const porcelain = material(0xe7d6b4, { roughness: .42, metalness: .08, emissive: 0x9e6b1f, emissiveIntensity: .28 });
  const rim = material(0xffe6ad, { roughness: .32, metalness: .12, emissive: 0xb46f18, emissiveIntensity: .48 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.145, .17, .34, 14), porcelain);
  body.position.y = .205;
  body.castShadow = true;
  porz.add(body);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(.145, .018, 6, 14), rim);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = .38;
  porz.add(lip);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.095, .018, 6, 12), rim);
  handle.rotation.y = Math.PI / 2;
  handle.position.set(.16, .23, 0);
  porz.add(handle);
  porz.rotation.y = -.38;
  group.add(porz);
  const light = new THREE.PointLight(0xffb53e, 0, 8, 2);
  light.position.y = .9;
  group.add(light);
  root.add(group);
  return { group, pool, glow, light };
}

function addFlowerDrifts(parent) {
  const flowerGeometry = new THREE.SphereGeometry(.075, 6, 5);
  const flowerMaterials = PALETTE.flower.map((color) => material(color));
  const locations = [
    [-20, -9, 5.8, 2.2], [-18, 10, 5.2, 1.4], [19, -10, 5.6, 1.8], [21, 10, 4.8, 1.4],
    [-5, 12.8, 13.5, .65], [6, -12.8, 15.5, .7], [0, -3.2, 2.5, .5],
  ];
  flowerMaterials.forEach((flowerMaterial, materialIndex) => {
    const mesh = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, 70);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 70; i += 1) {
      const patch = locations[(i + materialIndex * 2) % locations.length];
      const seed = i * 3.17 + materialIndex * 12;
      dummy.position.set(patch[0] + (hash(seed) - .5) * patch[2], .18 + hash(seed + 8) * .18, patch[1] + (hash(seed + 5) - .5) * patch[3]);
      const scale = .55 + hash(seed + 10) * .7;
      dummy.scale.setScalar(scale);
      dummy.rotation.set(hash(seed + 4), hash(seed + 3) * Math.PI, hash(seed + 5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
  });
}

function profileForPaving(profile) {
  return PAVEMENT_PROFILES[profile] || PAVEMENT_PROFILES.hauptmarkt;
}

function drawFallbackPavingTile(context, profile) {
  const [dark, light] = profile.fallback;
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(1, light);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 92; index += 1) {
    const seed = index * 8.13 + profile.scale * 10;
    const x = hash(seed) * 520 - 4;
    const y = hash(seed + 2) * 520 - 4;
    const w = 26 + hash(seed + 5) * 72;
    const h = 22 + hash(seed + 7) * 54;
    context.fillStyle = hash(seed + 4) > .52 ? 'rgba(255, 236, 191, .11)' : 'rgba(64, 47, 35, .12)';
    context.fillRect(x, y, w, h);
    context.strokeStyle = 'rgba(61, 53, 43, .26)';
    context.lineWidth = 1.5;
    context.strokeRect(x, y, w, h);
  }
}

function redrawPavementTile(entry) {
  const { canvas, context, profile, texture } = entry;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (pavementAtlasImage) {
    const cellWidth = pavementAtlasImage.width / 3;
    const cellHeight = pavementAtlasImage.height / 3;
    const inset = Math.max(3, Math.floor(cellWidth * .012));
    const [column, row] = profile.cell;
    context.drawImage(
      pavementAtlasImage,
      column * cellWidth + inset,
      row * cellHeight + inset,
      cellWidth - inset * 2,
      cellHeight - inset * 2,
      0, 0, canvas.width, canvas.height,
    );
  } else {
    drawFallbackPavingTile(context, profile);
  }

  // A shared, transparent sandstone wash ties the nine local materials
  // together. It keeps a lane change readable without producing the hard
  // colour cuts of a texture test scene.
  context.fillStyle = 'rgba(212, 184, 138, .075)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Fine sun-faded variation keeps the painted atlas from looking stamped.
  for (let index = 0; index < 48; index += 1) {
    const seed = index * 11.71 + profile.scale;
    context.fillStyle = hash(seed) > .5 ? 'rgba(255, 231, 180, .045)' : 'rgba(55, 47, 39, .045)';
    context.beginPath();
    context.arc(hash(seed + 2) * 512, hash(seed + 4) * 512, 2 + hash(seed + 6) * 9, 0, Math.PI * 2);
    context.fill();
  }
  texture.needsUpdate = true;
}

function loadPavementAtlas() {
  if (pavementAtlasImage || pavementAtlasLoading) return;
  pavementAtlasLoading = true;
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    pavementAtlasImage = image;
    pavementTileCache.forEach(redrawPavementTile);
  };
  image.onerror = () => { pavementAtlasLoading = false; };
  image.src = pavementLibraryUrl;
}

function pavingTile(profileName) {
  const profile = profileForPaving(profileName);
  const key = profileName in PAVEMENT_PROFILES ? profileName : 'hauptmarkt';
  const cached = pavementTileCache.get(key);
  if (cached) return cached.texture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  const entry = { canvas, context: canvas.getContext('2d'), profile, texture };
  pavementTileCache.set(key, entry);
  redrawPavementTile(entry);
  loadPavementAtlas();
  return texture;
}

function createPavementPbrMaps() {
  if (pavementPbrMaps) return pavementPbrMaps;
  const createMap = (draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    draw(canvas.getContext('2d'));
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  };
  const normal = createMap((context) => {
    context.fillStyle = '#8080ff';
    context.fillRect(0, 0, 128, 128);
    for (let index = 0; index < 46; index += 1) {
      const seed = index * 3.41;
      context.strokeStyle = index % 2 ? '#7b84ff' : '#8580ff';
      context.lineWidth = 1 + hash(seed + 2);
      context.beginPath();
      context.moveTo(hash(seed) * 128, hash(seed + 4) * 128);
      context.lineTo(hash(seed + 7) * 128, hash(seed + 9) * 128);
      context.stroke();
    }
  });
  const roughness = createMap((context) => {
    context.fillStyle = '#d8d8d8';
    context.fillRect(0, 0, 128, 128);
    for (let index = 0; index < 130; index += 1) {
      const tone = 180 + Math.floor(hash(index * 7.9) * 54);
      context.fillStyle = `rgb(${tone}, ${tone}, ${tone})`;
      context.fillRect(hash(index + 4) * 128, hash(index + 14) * 128, 2 + hash(index + 2) * 8, 2 + hash(index + 6) * 7);
    }
  });
  const ao = createMap((context) => {
    context.fillStyle = '#eeeeee';
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = '#b8b8b8';
    context.lineWidth = 2;
    for (let position = 6; position < 128; position += 23) {
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position - 9, 128);
      context.stroke();
    }
  });
  pavementPbrMaps = { normal, roughness, ao };
  return pavementPbrMaps;
}

function pavingTexture(width, depth, seed = 0, profile = 'hauptmarkt') {
  const texture = pavingTile(profile).clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const scale = profileForPaving(profile).scale;
  // Scaling by the actual surface dimensions keeps the profile's stone size
  // believable on a square, a pedestrian street and a tiny alley alike.
  texture.repeat.set(Math.max(.8, width / scale), Math.max(.8, depth / scale));
  texture.offset.set(hash(seed + 17), hash(seed + 31));
  texture.anisotropy = 6;
  texture.needsUpdate = true;
  return texture;
}

function pavingMaterial(width, depth, color, seed = 0, roughness = .9, profile = 'hauptmarkt') {
  const pbr = createPavementPbrMaps();
  const scale = profileForPaving(profile).scale;
  const repeatX = Math.max(.8, width / scale);
  const repeatY = Math.max(.8, depth / scale);
  const configurePbrMap = (texture, xOffset, yOffset) => {
    const map = texture.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeatX, repeatY);
    map.offset.set(hash(seed + xOffset), hash(seed + yOffset));
    map.needsUpdate = true;
    return map;
  };
  const unifiedTint = new THREE.Color(color).lerp(new THREE.Color(0xffffff), .46);
  return material(unifiedTint, {
    map: pavingTexture(width, depth, seed, profile),
    normalMap: configurePbrMap(pbr.normal, 53, 61),
    normalScale: new THREE.Vector2(.17, .17),
    roughnessMap: configurePbrMap(pbr.roughness, 71, 89),
    aoMap: configurePbrMap(pbr.ao, 97, 107),
    aoMapIntensity: .28,
    roughness,
    metalness: 0,
  });
}

function createPavingVariation() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  for (let i = 0; i < 430; i += 1) {
    const seed = i * 13.37;
    const x = hash(seed) * canvas.width;
    const y = hash(seed + 4) * canvas.height;
    const width = 7 + hash(seed + 8) * 25;
    const height = 5 + hash(seed + 12) * 18;
    context.fillStyle = hash(seed + 1) > .52 ? 'rgba(91, 63, 37, .11)' : 'rgba(255, 232, 180, .09)';
    context.beginPath();
    context.roundRect(x, y, width, height, 3 + hash(seed + 5) * 5);
    context.fill();
  }
  for (let i = 0; i < 44; i += 1) {
    context.strokeStyle = 'rgba(74, 57, 40, .18)';
    context.lineWidth = 1 + hash(i) * 2;
    context.beginPath();
    context.moveTo(hash(i * 3) * canvas.width, hash(i * 9) * canvas.height);
    context.lineTo(hash(i * 14) * canvas.width, hash(i * 17) * canvas.height);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addPavingVariation(parent) {
  const overlay = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 170),
    new THREE.MeshBasicMaterial({ map: createPavingVariation(), transparent: true, opacity: .9, depthWrite: false }),
  );
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = -.017;
  parent.add(overlay);
  return overlay;
}

// A single instanced layer of small repaired stones stops the painted paving
// from reading as one perfectly repeated surface. It deliberately stays sparse
// so walking paths remain calm and legible from the isometric camera.
function addPavingRepairs(parent) {
  const geometry = new THREE.BoxGeometry(.24, .018, .18);
  const repairs = [
    [-1, 2, 36, 23, 46], [0, 37, 5.2, 38, 30], [-12, -32, 5.2, 36, 24],
    [12, -32, 5.2, 36, 24], [0, -66, 28, 17, 36], [-49, 1, 32, 21, 30],
  ];
  const amount = repairs.reduce((total, [, , , , count]) => total + count, 0);
  const mesh = new THREE.InstancedMesh(geometry, material(0xb9976d, { roughness: .94, vertexColors: true }), amount);
  const dummy = new THREE.Object3D();
  const colors = [0x987653, 0xc3a076, 0x775f4c, 0xd2b187, 0x846c57];
  let index = 0;
  repairs.forEach(([x, z, width, depth, count], zone) => {
    for (let item = 0; item < count; item += 1) {
      const seed = index * 5.73 + zone * 71.2;
      dummy.position.set(x + (hash(seed) - .5) * width, -.004, z + (hash(seed + 3) - .5) * depth);
      dummy.rotation.set(0, hash(seed + 8) * Math.PI, (hash(seed + 12) - .5) * .025);
      const scale = .6 + hash(seed + 4) * 1.25;
      dummy.scale.set(scale, 1, .65 + hash(seed + 9) * .85);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(choose(colors, seed + 16)));
      index += 1;
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createFlyingBirds(parent) {
  const birds = [];
  const wingMaterial = material(0x3d4747, { roughness: .78, side: THREE.DoubleSide });
  for (let index = 0; index < 7; index += 1) {
    const bird = new THREE.Group();
    const leftWing = new THREE.Mesh(new THREE.ConeGeometry(.075, .38, 4), wingMaterial);
    leftWing.rotation.z = Math.PI / 2;
    leftWing.position.x = -.12;
    const rightWing = leftWing.clone();
    rightWing.rotation.z = -Math.PI / 2;
    rightWing.position.x = .12;
    const body = new THREE.Mesh(new THREE.SphereGeometry(.055, 6, 5), wingMaterial);
    bird.add(leftWing, rightWing, body);
    bird.userData.flight = { centerX: index % 2 ? -42 : 1.5, centerZ: index % 2 ? 2 : 53, radius: 3 + (index % 3) * 1.2, height: 8 + (index % 4) * .55, phase: index * .83, leftWing, rightWing };
    parent.add(bird);
    birds.push(bird);
  }
  return birds;
}

function collisionShapeInWorld(node, shape) {
  const nodePosition = node.getWorldPosition(new THREE.Vector3());
  const nodeQuaternion = node.getWorldQuaternion(new THREE.Quaternion());
  const nodeScale = node.getWorldScale(new THREE.Vector3());
  const localOffset = new THREE.Vector3(shape.x || 0, 0, shape.z || 0).applyQuaternion(nodeQuaternion);
  const orientation = new THREE.Euler().setFromQuaternion(nodeQuaternion, 'YXZ').y;
  const padding = shape.padding || 0;
  if (shape.type === 'circle') {
    return {
      type: 'circle', x: nodePosition.x + localOffset.x, z: nodePosition.z + localOffset.z,
      radius: shape.radius * Math.max(nodeScale.x, nodeScale.z) + padding,
      height: (shape.height || 1) * nodeScale.y, node,
    };
  }
  return {
    type: 'box', x: nodePosition.x + localOffset.x, z: nodePosition.z + localOffset.z,
    halfWidth: shape.width * nodeScale.x / 2 + padding,
    halfDepth: shape.depth * nodeScale.z / 2 + padding,
    height: (shape.height || 1) * nodeScale.y,
    rotation: orientation, node,
  };
}

function pushCircleOutsideCircle(point, radius, collider) {
  const dx = point.x - collider.x;
  const dz = point.z - collider.z;
  const minimum = radius + collider.radius;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= minimum * minimum) return false;
  const distance = Math.sqrt(distanceSq);
  const normalX = distance > .0001 ? dx / distance : 1;
  const normalZ = distance > .0001 ? dz / distance : 0;
  const adjustment = minimum - distance + .001;
  point.x += normalX * adjustment;
  point.z += normalZ * adjustment;
  return true;
}

function pushCircleOutsideBox(point, radius, collider) {
  const cos = Math.cos(collider.rotation || 0);
  const sin = Math.sin(collider.rotation || 0);
  const dx = point.x - collider.x;
  const dz = point.z - collider.z;
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const closestX = THREE.MathUtils.clamp(localX, -collider.halfWidth, collider.halfWidth);
  const closestZ = THREE.MathUtils.clamp(localZ, -collider.halfDepth, collider.halfDepth);
  let normalX = localX - closestX;
  let normalZ = localZ - closestZ;
  const distanceSq = normalX * normalX + normalZ * normalZ;
  if (distanceSq >= radius * radius) return false;
  let distance = Math.sqrt(distanceSq);
  if (distance < .0001) {
    // The player entered the broad phase exactly.  Use the nearest side so
    // the result is a smooth slide along a wall instead of a random jump.
    const toX = collider.halfWidth - Math.abs(localX);
    const toZ = collider.halfDepth - Math.abs(localZ);
    if (toX < toZ) {
      normalX = localX < 0 ? -1 : 1;
      normalZ = 0;
      distance = -toX;
    } else {
      normalX = 0;
      normalZ = localZ < 0 ? -1 : 1;
      distance = -toZ;
    }
  } else {
    normalX /= distance;
    normalZ /= distance;
  }
  const adjustment = radius - distance + .001;
  const worldX = normalX * cos - normalZ * sin;
  const worldZ = normalX * sin + normalZ * cos;
  point.x += worldX * adjustment;
  point.z += worldZ * adjustment;
  return true;
}

function pointNearSegment(point, from, to, radius) {
  const lineX = to.x - from.x;
  const lineZ = to.z - from.z;
  const lengthSq = lineX * lineX + lineZ * lineZ;
  if (lengthSq < .0001) return false;
  const t = THREE.MathUtils.clamp(((point.x - from.x) * lineX + (point.z - from.z) * lineZ) / lengthSq, 0, 1);
  const px = from.x + lineX * t;
  const pz = from.z + lineZ * t;
  const dx = point.x - px;
  const dz = point.z - pz;
  return { t, distanceSq: dx * dx + dz * dz, radius };
}

export function createWorld(scene, quality = 'medium') {
  const root = new THREE.Group();
  root.name = 'Hauptmarkt Trier – Golden Hour';
  scene.add(root);
  const citizens = [];
  const pigeons = [];
  const recruitedFriends = [];
  let activeQuestFriend = null;
  let lastUpdateTime = 0;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 170),
    pavingMaterial(150, 170, 0xf3d39d, 1401, .88, 'hauptmarkt'),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -.03, 5);
  ground.receiveShadow = true;
  root.add(ground);
  addPavingRepairs(root);

  // The first playable sight is the Porta Nigra; the street then leads south
  // into the existing Hauptmarkt without loading another scene.
  addSimeonstrasse(root, quality);

  // Hauptmarkt façade sequence: the north side keeps a deliberately central
  // opening for Simeonstraße, while St. Gangolf and the Steipe remain anchors.
  addGangolfTower(root, -20.5, 14.8);
  [
    [-16.3, 4.0, 4.55, 0xb55e50, 31, 'BROTSTRASSE', false],
    [-12.0, 4.1, 4.18, 0xe5d7b6, 32, null, false],
    [-8.2, 3.4, 4.8, 0xd89689, 33, null, true],
  ].forEach(([x, w, h, facade, seed, sign, ornate]) => createGabledHouse(root, { x, z: 14.7, w, h, facade, roof: choose(PALETTE.roof, seed), seed, sign, ornate }));
  addSteipe(root, 10.5, 14.55);
  [
    [16.0, 3.7, 4.45, 0xe7e0d1, 41, null, false],
    [19.95, 3.95, 4.78, 0xd1a276, 42, 'FLEISCHSTRASSE', false],
    [23.8, 3.4, 4.3, 0xe7ded0, 43, null, false],
  ].forEach(([x, w, h, facade, seed, sign, ornate]) => createGabledHouse(root, { x, z: 14.7, w, h, facade, roof: choose(PALETTE.roof, seed), seed, sign, ornate }));

  [
    [-22.5, 4.4, 4.5, 0xca8b69, 51, null],
    [-3.9, 4.4, 4.5, 0xc79a7d, 55, null], [1.0, 4.95, 4.8, 0xe7e4db, 56, 'MARKTCAFÉ'],
    [20.3, 4.15, 4.1, 0xdca782, 60, null],
  ].forEach(([x, w, h, facade, seed, sign]) => createGabledHouse(root, { x, z: -17.7, w, h, facade, roof: choose(PALETTE.roof, seed), seed, sign, rotation: Math.PI, ornate: seed % 3 === 0 }));

  [
    [-22.8, -9.5, 4.0, 4.2, 0xd8b48c, 71], [-22.8, 8.7, 4.1, 4.25, 0xe3d6bf, 74],
  ].forEach(([x, z, w, h, facade, seed]) => createGabledHouse(root, { x, z, w, h, d: 4.5, facade, roof: choose(PALETTE.roof, seed), seed, rotation: -Math.PI / 2, ornate: seed % 2 === 0 }));
  [
    [23.0, -9.6, 4.15, 4.25, 0xe4d7c2, 81], [23.0, -3.4, 4.8, 4.65, 0xc88770, 82],
    [23.0, 3.1, 4.2, 4.25, 0xf0e7d9, 83], [23.0, 9.1, 4.1, 4.45, 0xd29f79, 84],
  ].forEach(([x, z, w, h, facade, seed]) => createGabledHouse(root, { x, z, w, h, d: 4.5, facade, roof: choose(PALETTE.roof, seed), seed, rotation: Math.PI / 2, ornate: seed % 2 === 0 }));

  addFountain(root);
  addWineStand(root, -12.9, 2.1);
  addCafeTerrace(root, 13.6, 2.25);
  addMarketStall(root, 7.4, -3.2, 'BLUMEN', 0xd9707b, 0xf0d7a4);
  addMarketStall(root, -9.6, -4.2, 'REGIONAL', 0x5c7d59, 0xf0d7a4);
  addStreetMusicCorner(root, -2.7, -7.35);

  // The market exits naturally into Sternstraße and then opens onto
  // Domfreihof. All three spaces share this same scene and navigation surface.
  addSternstrasse(root);
  addDomfreihof(root, quality);
  // The street names are deliberately swapped here: Fleischstraße now leaves
  // to the east and Brotstraße to the west, matching the user's visual
  // orientation from the Hauptmarkt.
  addSouthernStreet(root, {
    name: 'Fleischstraße', x: 12, seed: 900, accent: 0xc47658,
    signs: ['FLEISCHSTRASSE', 'VIEZ & WEIN', 'KLEINE KÜCHE', 'MANUFAKTUR', 'CAFÉ', 'FEINKOST', 'STUDIO'],
  });
  addSouthernStreet(root, {
    name: 'Brotstraße', x: -12, seed: 950, accent: 0x627c70,
    signs: ['BROTSTRASSE', 'KONDITOREI', 'VINYL', 'TRIERER KÄSE', 'BÜCHER', 'BLUMEN', 'ATELIER'],
  });
  addSouthernBlockFabric(root);
  addKornmarkt(root);

  // The little side alleys keep the market legible while making the plaza feel larger than real life.
  for (const [x, z, rotation] of [[-20.4, 8.5, .2], [-20.2, -7.9, -.2], [20.2, 8.3, -.3], [19.7, -8.4, .22]]) {
    addBicycle(root, x, z, rotation);
    addPlanter(root, x + .8, z + .45, rotation, choose(PALETTE.flower, x * 3));
  }
  [[-15, -5.7, 0], [-8.2, 6.4, Math.PI / 2], [7.5, -6.7, Math.PI], [16.8, -7.6, Math.PI / 2], [3.7, 8, .3]].forEach(([x, z, rotation]) => addBench(root, x, z, rotation));
  [[-18, -7], [-16, 7.4], [-8.7, -9.2], [-6.6, 9], [7.7, 8.7], [10.1, -8.3], [18, 7.3], [18.3, -5.6], [-18.8, 4.4], [-11.8, 10.2], [4.2, 10.1], [14.9, -9.7], [20.1, 4.6]].forEach(([x, z], index) => addTree(root, x, z, .82 + (index % 3) * .1, index + 120));
  [[-20, -12], [-14.5, -12.3], [-8, -12.3], [-1, -12], [6.2, -12.4], [13, -12.4], [20, -12], [-19, 12.5], [-11, 12.5], [-3, 12.6], [5, 12.5], [13, 12.6], [20, 12.4]].forEach(([x, z], index) => addPlanter(root, x, z, index % 2 ? Math.PI / 2 : 0, choose(PALETTE.flower, index + 300)));
  addFlowerDrifts(root);

  // A handful of practical city details – grouped around edges rather than
  // scattered through routes – make every existing district feel inhabited.
  addMarketCrates(root, -14.7, 4.5, 4);
  addBarrelCluster(root, -14.9, .4, 9);
  addStreetBin(root, 19.2, -7.4, .2);
  addStreetBin(root, -18.8, 7.6, -.2);
  addBikeRack(root, 18.1, 6.45, Math.PI / 2);
  addPostBox(root, -19.1, -6.8, -.18);
  addStreetSign(root, -18.8, 12.1, 'BROTSTRASSE', 0);
  addStreetSign(root, 18.8, 12.1, 'FLEISCHSTRASSE', Math.PI);
  addStreetSign(root, -25.7, 7.2, 'STERNSTRASSE', Math.PI / 2);
  addWindFlag(root, -18.5, 3.9, 0x9b5b42, .25, 11);
  addWindFlag(root, 18.6, -1.2, 0x496e61, -.3, 17);
  addWindFlag(root, -43.8, 8.1, 0xc28b4e, .1, 23);
  addPlanter(root, 5.8, -11.4, Math.PI / 2, 0xe9b35c);
  addPlanter(root, -4.7, 11.55, Math.PI / 2, 0xc65c8c);
  addMarketCrates(root, 10.8, -49.8, 42);
  addBarrelCluster(root, -9.5, -50.2, 55);
  addStreetBin(root, 13.8, -39.5, Math.PI / 2);
  addStreetBin(root, -13.8, -39.5, -Math.PI / 2);
  addBikeRack(root, 6.8, -60.2, .15);
  addPostBox(root, -5.5, 34.5, Math.PI / 2);
  addWindFlag(root, 4.7, 44.6, 0x506e5a, -.2, 31);

  const lampPositions = [[-18, -3], [-13, 8], [-8, -5], [-4, 9], [5, -7], [9, 8], [17, -3], [19, 8], [-2.8, -9], [2, 9.6]];
  lampPositions.forEach(([x, z], index) => addLamp(root, x, z, index % 2 === 0));

  // 36 market visitors: walkers, seated guests, photography, music, drinks and pigeon feeding.
  const placement = [
    [-10.8, .2, 'serve'], [-9.4, .45, 'drink'], [-13.5, .8, 'stand'], [-14.3, 3.1, 'stand'], [-12.3, 4.1, 'drink'],
    [11.6, -1.2, 'sit'], [12.7, -2.8, 'sit'], [14.2, -3.6, 'drink'], [15.4, -2.1, 'sit'], [16.6, -3.5, 'drink'], [14.7, -.6, 'serve'],
    [-2.7, -7.2, 'music'], [-1.7, -6.3, 'listen'], [-3.8, -6.4, 'listen'], [-.4, -7.6, 'phone'], [1.2, -6.3, 'stand'],
    [-4.4, 2.6, 'photo'], [-5.4, 1.5, 'photo'], [3.2, 3.5, 'stand'], [4.1, 2.3, 'drink'], [6.8, 4.8, 'stand'],
    [-15, -5.6, 'sit'], [-16.1, -5.7, 'sit'], [7.4, -6.8, 'sit'], [8.6, -6.9, 'stand'], [17.8, 4, 'phone'],
    [-7.4, -1.9, 'feed'], [-6.6, -1.4, 'feed'], [-5.7, -2.3, 'stand'], [8.9, 6.6, 'stand'], [10.2, 7, 'phone'],
    [-18.8, 1.6, 'walk'], [18.2, -1.1, 'walk'], [4.3, -3.6, 'walk'], [-1.6, 7.2, 'walk'], [2.4, -8.4, 'walk'],
    [-11.7, 4.9, 'talk'], [-10.9, 5.2, 'laugh'], [11.7, 4.9, 'photo'], [13.0, 5.2, 'talk'],
    [17.1, 1.6, 'bike'], [-17.1, -1.9, 'bike'], [1.8, 7.9, 'walk'],
    [-25.2, 1.2, 'walk'], [-28.4, 2.2, 'shop'], [-31.5, .1, 'talk'], [-35.6, -1.1, 'bike'],
    [-38.2, 2.7, 'photo'], [-41.5, 4.8, 'walk'], [-43.0, -4.2, 'photo'], [-46.0, 5.5, 'tourist'],
    [-49.0, -4.5, 'tourist'], [-45.2, -.4, 'talk'], [-47.2, -3.0, 'sit'], [-48.5, 6.3, 'photo'],
    [-44.2, 7.0, 'look'], [-46.4, -5.6, 'look'], [-40.0, 1.0, 'walk'], [-50.1, -1.7, 'bike'],
    [12.2, -20.2, 'walk'], [10.7, -25.6, 'shop'], [13.7, -30.5, 'talk'], [11.6, -35.5, 'bike'],
    [13.5, -41.2, 'photo'], [10.3, -47.6, 'walk'], [-12.1, -20.8, 'walk'], [-10.5, -26.0, 'shop'],
    [-13.8, -31.0, 'talk'], [-11.4, -36.3, 'bike'], [-13.4, -41.5, 'photo'], [-10.1, -47.2, 'walk'],
    [-8.5, -61.1, 'sit'], [-5.3, -64.5, 'shop'], [-1.8, -68.7, 'photo'], [2.3, -63.1, 'talk'],
    [5.3, -69.1, 'walk'], [8.8, -72.5, 'bike'], [11.2, -60.2, 'tourist'], [-11.2, -72.0, 'look'],
    [0.3, -74.0, 'walk'], [-2.8, -58.8, 'drink'],
    [-1.4, 55.7, 'photo'], [2.2, 57.0, 'tourist'], [-3.2, 49.2, 'walk'], [2.6, 44.4, 'shop'],
    [-2.4, 39.3, 'phone'], [2.7, 34.7, 'walk'], [-2.8, 29.2, 'talk'], [3.0, 24.6, 'bike'],
    // A lively, much broader forecourt gives the Roman gate a proper arrival
    // moment. The crowd stays mostly around the perimeter and preserves the
    // monument's long, open view corridor.
    [-8.2, 57.9, 'tourist'], [-5.4, 59.7, 'photo'], [-1.1, 58.9, 'talk'], [2.4, 60.1, 'walk'],
    [-10.4, 61.5, 'phone'], [-13.0, 64.9, 'tourist'], [-7.8, 65.2, 'walk'], [1.8, 64.0, 'bike'],
    [-13.2, 76.5, 'shop'], [1.4, 76.8, 'talk'],
    [-14.1, 71.8, 'music'], [-12.9, 71.6, 'listen'], [-12.0, 70.8, 'listen'],
    [-6.8, 73.1, 'photo'], [-1.7, 74.2, 'photo'], [-5.2, 78.4, 'tourist'], [1.9, 70.7, 'talk'],
    [-7.2, 68.2, 'child'], [-5.9, 69.0, 'child'], [-2.7, 67.9, 'feed'], [10.8, 66.6, 'walk'],
    [12.5, 61.8, 'walk'], [14.7, 65.9, 'shop'], [12.5, 75.3, 'talk'], [15.2, 78.8, 'tourist'],
    [25.3, 69.2, 'photo'], [38.9, 59.4, 'phone'], [41.0, 67.6, 'bike'], [38.8, 52.7, 'walk'],
    // Christophstraße on the west side now leads through a longer shopping
    // stretch to the station. The people thin out slightly in the terminal
    // square, leaving the station façade readable from the street.
    [-23.4, 88.0, 'walk'], [-27.8, 92.0, 'shop'], [-32.5, 87.5, 'talk'], [-38.4, 92.0, 'bike'],
    [-44.0, 87.6, 'photo'], [-49.4, 92.2, 'tourist'], [-54.8, 88.4, 'walk'],
    [-61.2, 87.2, 'tourist'], [-63.8, 93.8, 'photo'], [-68.0, 90.7, 'walk'], [-71.4, 87.3, 'sit'],
    [-74.5, 94.0, 'phone'], [-77.2, 90.3, 'tourist'], [-79.0, 86.5, 'talk'],
  ];
  // A readable crowd matters more than rendering every single citizen at
  // once. The trimmed variants retain every activity type while substantially
  // reducing character animation and shadow work on browsers.
  const activePlacement = quality === 'low'
    ? placement.filter((_, index) => index % 2 === 0)
    : quality === 'medium'
      ? placement.filter((_, index) => index % 3 !== 1)
      : placement.filter((_, index) => index % 4 !== 1);
  activePlacement.forEach(([x, z, mode], index) => {
    const routes = [
      [new THREE.Vector3(-17, -0, -4.8), new THREE.Vector3(-3.4, 0, -4.9), new THREE.Vector3(5.8, 0, -4.2), new THREE.Vector3(18, 0, -3.8)],
      [new THREE.Vector3(-16, 0, 5.3), new THREE.Vector3(-4, 0, 6.5), new THREE.Vector3(7, 0, 5.6), new THREE.Vector3(17, 0, 5.8)],
      [new THREE.Vector3(-24, 0, 1), new THREE.Vector3(-30, 0, 1), new THREE.Vector3(-36, 0, 1), new THREE.Vector3(-45, 0, 1)],
      [new THREE.Vector3(0, 0, 55), new THREE.Vector3(0, 0, 44), new THREE.Vector3(0, 0, 33), new THREE.Vector3(0, 0, 19)],
      [new THREE.Vector3(12, 0, -17), new THREE.Vector3(12, 0, -27), new THREE.Vector3(12, 0, -38), new THREE.Vector3(12, 0, -49)],
      [new THREE.Vector3(-12, 0, -17), new THREE.Vector3(-12, 0, -27), new THREE.Vector3(-12, 0, -38), new THREE.Vector3(-12, 0, -49)],
      [new THREE.Vector3(12, 0, -49), new THREE.Vector3(12, 0, -59), new THREE.Vector3(0, 0, -68), new THREE.Vector3(-12, 0, -59), new THREE.Vector3(-12, 0, -49)],
      [new THREE.Vector3(-5.4, 0, 58.8), new THREE.Vector3(2.0, 0, 60.4), new THREE.Vector3(12.5, 0, 62.0), new THREE.Vector3(12.5, 0, 69.2), new THREE.Vector3(23.0, 0, 69.2), new THREE.Vector3(38.9, 0, 69.2), new THREE.Vector3(39.0, 0, 61.0)],
      [new THREE.Vector3(-6.0, 0, 61.0), new THREE.Vector3(-4.1, 0, 69.8), new THREE.Vector3(-4.1, 0, 78.6), new THREE.Vector3(-4.1, 0, 86.0)],
      [new THREE.Vector3(-18.0, 0, 84.2), new THREE.Vector3(-25.0, 0, 90.0), new THREE.Vector3(-39.0, 0, 90.0), new THREE.Vector3(-55.0, 0, 90.0), new THREE.Vector3(-68.5, 0, 90.0), new THREE.Vector3(-76.0, 0, 90.0)],
    ];
    const citizen = createCitizen(index, {
      mode,
      home: new THREE.Vector3(x, 0, z),
      route: routes[index % routes.length],
      phone: mode === 'phone' || mode === 'photo' || mode === 'tourist',
      drink: mode === 'drink' || mode === 'sit' || mode === 'shop',
      guitar: mode === 'music',
      bike: mode === 'bike',
      scale: mode === 'child' ? .56 + hash(index + 207) * .08 : undefined,
      outfit: mode === 'serve' ? 0x293c37 : undefined,
    });
    citizen.position.set(x, 0, z);
    if (mode === 'sit') {
      citizen.position.y = -.27;
      citizen.rotation.x = -.1;
      citizen.scale.set(.94, .84, .94);
    }
    if (mode === 'music') citizen.rotation.y = .4;
    if (mode === 'photo') citizen.rotation.y = -2.25;
    // The crowd keeps its silhouettes and animation, but medium and low
    // profiles do not spend a full shadow-map pass on every distant person.
    if (quality !== 'high') citizen.traverse((object) => {
      if (object.isMesh) object.castShadow = false;
    });
    root.add(citizen);
    citizens.push(citizen);
  });
  pigeons.push(...createPigeons(root, -6.6, -1.65));
  pigeons.push(...createPigeons(root, 1.7, -66.8));
  pigeons.push(...createPigeons(root, -4.7, 69.5));
  pigeons.push(...createPigeons(root, -68.5, 91.0));
  const flyingBirds = createFlyingBirds(root);
  // These five people are the only authored quest figures. They use the same
  // shared character system as the crowd, so adding the story costs no new
  // world geometry or heavyweight character pipeline.
  const questFriends = createQuestFriends(root);
  const hauptmarktAtelier = createHauptmarktAtelier(root, citizens, questFriends);
  // Optional encounters have their own compact presentation. They are not
  // part of the five-person story group and therefore never alter formation
  // or the main quest's target marker.
  const sideQuestCharacters = createSideQuestCharacters(root);
  const goldenLight = createGoldenLight(root);
  const wineStandPoint = new THREE.Vector3(-10.2, 0, .15);
  const arrivalPoint = new THREE.Vector3(-72.0, 0, 90.0);

  const warmSky = new THREE.Color(0xc79061);
  const nightSky = new THREE.Color(0x1c2940);
  scene.background = warmSky;
  scene.fog = new THREE.Fog(0xc79061, 46, 142);
  const hemisphere = new THREE.HemisphereLight(0xf7d7ad, 0x455d52, 1.62);
  const ambient = new THREE.AmbientLight(0xffd1a0, .36);
  scene.add(hemisphere);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffb064, 3.22);
  sun.position.set(-28, 30, 14);
  sun.castShadow = true;
  const shadowSize = quality === 'high' ? 1536 : quality === 'medium' ? 768 : 512;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -104;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 76;
  sun.shadow.camera.bottom = -90;
  sun.shadow.bias = -.00025;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x789784, .26);
  fill.position.set(16, 10, -24);
  scene.add(fill);
  const warmBounce = new THREE.DirectionalLight(0xffc27b, .18);
  warmBounce.position.set(-8, 7, 10);
  scene.add(warmBounce);

  // Build a compact collision world from the authored root groups.  Complex
  // visual meshes are represented by one or two coarse shapes each, which is
  // much more reliable than raycasting thousands of façade details every frame.
  root.updateMatrixWorld(true);
  const staticColliders = [];
  const cameraOccluders = [];
  root.traverse((object) => {
    if (!object.userData.collisionShapes) return;
    const shapes = object.userData.collisionShapes.map((shape) => collisionShapeInWorld(object, shape));
    staticColliders.push(...shapes);
    if (object.userData.cameraFade) {
      const materials = new Set();
      object.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const source = Array.isArray(child.material) ? child.material : [child.material];
        source.forEach((meshMaterial) => {
          if (!meshMaterial.transparent) materials.add(meshMaterial);
        });
      });
      cameraOccluders.push({ shapes, materials, fade: 0 });
    }
  });

  // Evening is controlled by the story rather than a real-time clock. This
  // keeps the Golden-Hour-to-night transition readable in a 30–45 minute
  // playthrough without punishing anyone who pauses to explore.
  const eveningPointLights = [];
  const eveningEmissives = new Map();
  root.traverse((object) => {
    if (object.isPointLight && object !== goldenLight.light) {
      eveningPointLights.push({ light: object, base: object.intensity });
    }
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((meshMaterial) => {
      if (meshMaterial.emissive && meshMaterial.emissiveIntensity > .16 && !eveningEmissives.has(meshMaterial)) {
        eveningEmissives.set(meshMaterial, meshMaterial.emissiveIntensity);
      }
    });
  });
  let eveningTarget = 0;
  let eveningProgress = 0;

  function applyEvening(progress) {
    scene.background.copy(warmSky).lerp(nightSky, progress);
    scene.fog.color.copy(scene.background);
    scene.fog.near = THREE.MathUtils.lerp(46, 34, progress);
    scene.fog.far = THREE.MathUtils.lerp(142, 110, progress);
    sun.intensity = THREE.MathUtils.lerp(3.22, .34, progress);
    sun.position.y = THREE.MathUtils.lerp(30, 10, progress);
    hemisphere.intensity = THREE.MathUtils.lerp(1.62, .74, progress);
    ambient.intensity = THREE.MathUtils.lerp(.36, .68, progress);
    fill.intensity = THREE.MathUtils.lerp(.26, .5, progress);
    warmBounce.intensity = THREE.MathUtils.lerp(.18, .06, progress);
    eveningPointLights.forEach(({ light, base }) => { light.intensity = base * THREE.MathUtils.lerp(.72, 1.78, progress); });
    eveningEmissives.forEach((base, meshMaterial) => { meshMaterial.emissiveIntensity = base + progress * .44; });
  }

  function updateEvening(delta) {
    eveningProgress += (eveningTarget - eveningProgress) * (1 - Math.exp(-delta * 1.2));
    applyEvening(eveningProgress);
  }

  function dynamicColliders(position) {
    const people = [...citizens, ...Object.values(questFriends), ...Object.values(sideQuestCharacters)];
    const nearby = [];
    people.forEach((person) => {
      if (!person.visible || person.position.distanceToSquared(position) > 16) return;
      nearby.push({ type: 'circle', x: person.position.x, z: person.position.z, radius: .28 * person.scale.x, height: 1.85, node: person });
    });
    return nearby;
  }

  function resolvePosition(position, radius, includePeople = true) {
    const resolved = position.clone();
    const colliders = includePeople ? [...staticColliders, ...dynamicColliders(position)] : staticColliders;
    for (let pass = 0; pass < 3; pass += 1) {
      let corrected = false;
      colliders.forEach((collider) => {
        corrected = (collider.type === 'circle'
          ? pushCircleOutsideCircle(resolved, radius, collider)
          : pushCircleOutsideBox(resolved, radius, collider)) || corrected;
      });
      if (!corrected) break;
    }
    // The station lies beyond the west end of Christophstraße. These limits
    // must include its whole forecourt; the old prototype bounds stopped the
    // player several metres before the road and made the Bahnhof unreachable.
    resolved.x = THREE.MathUtils.clamp(resolved.x, -96.0, 63.6);
    resolved.z = THREE.MathUtils.clamp(resolved.z, -75.6, 106.0);
    return resolved;
  }

  function moveWithCollisions(start, movement, radius = .34) {
    // Resolve X and Z independently first.  When the player meets a wall at
    // an angle, the free component survives and naturally becomes a slide.
    const horizontal = resolvePosition(new THREE.Vector3(start.x + movement.x, 0, start.z), radius);
    const slid = resolvePosition(new THREE.Vector3(horizontal.x, 0, horizontal.z + movement.z), radius);
    const direct = resolvePosition(new THREE.Vector3(start.x + movement.x, 0, start.z + movement.z), radius);
    const slideDistance = slid.distanceToSquared(start);
    const directDistance = direct.distanceToSquared(start);
    return directDistance > slideDistance * 1.04 ? direct : slid;
  }

  function getSafeCameraPosition(desired) {
    const safe = desired.clone();
    staticColliders.forEach((collider) => {
      if (collider.type === 'circle') {
        const dx = safe.x - collider.x;
        const dz = safe.z - collider.z;
        if (dx * dx + dz * dz < collider.radius * collider.radius && safe.y < collider.height + 1.5) safe.y = Math.max(safe.y, collider.height + 2.2);
        return;
      }
      const cos = Math.cos(collider.rotation || 0);
      const sin = Math.sin(collider.rotation || 0);
      const dx = safe.x - collider.x;
      const dz = safe.z - collider.z;
      const localX = dx * cos + dz * sin;
      const localZ = -dx * sin + dz * cos;
      if (Math.abs(localX) < collider.halfWidth && Math.abs(localZ) < collider.halfDepth && safe.y < collider.height + 1.5) {
        safe.y = Math.max(safe.y, collider.height + 2.2);
      }
    });
    return safe;
  }

  function updateCameraOcclusion(camera, playerPosition, delta) {
    const player = { x: playerPosition.x, z: playerPosition.z };
    const cameraPoint = { x: camera.position.x, z: camera.position.z };
    cameraOccluders.forEach((occluder) => {
      const hidden = occluder.shapes.some((shape) => {
        const reach = shape.type === 'circle'
          ? shape.radius + .65
          : Math.hypot(shape.halfWidth, shape.halfDepth) + .6;
        const proximity = pointNearSegment({ x: shape.x, z: shape.z }, player, cameraPoint, reach);
        const playerDistanceSq = (shape.x - player.x) ** 2 + (shape.z - player.z) ** 2;
        // Only the immediate foreground can hide the hero.  Fading every
        // façade along the long isometric sightline makes a city look ghostly
        // rather than opening a useful little viewing window.
        return proximity
          && proximity.t > .08 && proximity.t < .38
          && proximity.distanceSq < reach * reach
          && playerDistanceSq < (reach + 3.6) ** 2;
      });
      const target = hidden ? .48 : 1;
      occluder.fade += (target - occluder.fade) * (1 - Math.exp(-delta * 8));
      const opacity = THREE.MathUtils.lerp(1, .48, occluder.fade);
      occluder.materials.forEach((meshMaterial) => {
        meshMaterial.transparent = opacity < .995;
        meshMaterial.opacity = opacity;
        meshMaterial.depthWrite = opacity > .7;
        meshMaterial.needsUpdate = true;
      });
    });
  }

  const windActors = [];
  const windFlags = [];
  const crowdDrawDistance = quality === 'high' ? 54 : quality === 'medium' ? 42 : 32;
  const crowdDrawDistanceSq = crowdDrawDistance * crowdDrawDistance;
  root.traverse((object) => {
    if (object.userData.wind) windActors.push(object);
    if (object.userData.flagWind) windFlags.push(object);
  });

  function update(time, playerPosition = new THREE.Vector3(), playerFacing = null) {
    const delta = Math.min(Math.max(time - lastUpdateTime, 0), .05);
    lastUpdateTime = time;
    updateEvening(delta);
    const walkers = [];
    citizens.forEach((citizen, index) => {
      const { mode, phase, route, home } = citizen.userData;
      if (mode === 'walk') {
        const travel = (time * .18 + phase * .12) % (route.length - 1);
        const leg = Math.floor(travel);
        const amount = travel - leg;
        const from = route[leg];
        const to = route[leg + 1];
        citizen.position.lerpVectors(from, to, amount);
        citizen.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        citizen.position.y = Math.abs(Math.sin(time * 7 + phase)) * .028;
        walkers.push(citizen);
      } else {
        citizen.position.x = home.x + Math.sin(time * (.18 + (index % 3) * .03) + phase) * .025;
        citizen.position.z = home.z + Math.cos(time * .22 + phase) * .018;
        citizen.position.y = (mode === 'sit' ? -.27 : 0) + Math.sin(time * 1.6 + phase) * .012;
        if (mode === 'listen' || mode === 'feed' || mode === 'talk' || mode === 'laugh') citizen.rotation.y = Math.sin(time * .44 + phase) * .35 + .3;
        if (mode === 'laugh') citizen.position.y += Math.max(0, Math.sin(time * 3.4 + phase)) * .035;
      }
      const dx = citizen.position.x - playerPosition.x;
      const dz = citizen.position.z - playerPosition.z;
      const nearby = dx * dx + dz * dz <= crowdDrawDistanceSq;
      citizen.visible = nearby;
      if (!nearby) return;
      animateCharacterPose(citizen, time, mode === 'walk');
      applyCitizenActivity(citizen, time);
    });
    // The authored route network keeps people in walkable alleys; the small
    // steering pass below prevents the handful of moving NPCs from stacking
    // on the same segment or walking through the player.
    for (let first = 0; first < walkers.length; first += 1) {
      const person = walkers[first];
      const playerDx = person.position.x - playerPosition.x;
      const playerDz = person.position.z - playerPosition.z;
      const playerDistance = Math.hypot(playerDx, playerDz);
      if (playerDistance < .7) {
        const distance = Math.max(playerDistance, .001);
        person.position.x += (playerDx / distance) * (.7 - playerDistance);
        person.position.z += (playerDz / distance) * (.7 - playerDistance);
      }
      for (let second = first + 1; second < walkers.length; second += 1) {
        const other = walkers[second];
        const dx = person.position.x - other.position.x;
        const dz = person.position.z - other.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= .46) continue;
        const normalX = distance > .001 ? dx / distance : (first % 2 ? -1 : 1);
        const normalZ = distance > .001 ? dz / distance : 0;
        const push = (.46 - distance) * .5;
        person.position.x += normalX * push;
        person.position.z += normalZ * push;
        other.position.x -= normalX * push;
        other.position.z -= normalZ * push;
      }
      person.position.copy(resolvePosition(person.position, .2, false));
    }
    Object.values(questFriends).forEach((friend, index) => {
      const quest = friend.userData.questFriend;
      const { marker, nameplate, beacon } = quest;
      if (quest.settled && quest.seat) {
        friend.position.lerp(quest.seat, 1 - Math.exp(-delta * 4.8));
        friend.position.y = -.23 + Math.sin(time * 1.35 + index) * .008;
        friend.rotation.y = Math.atan2(wineStandPoint.x - friend.position.x, wineStandPoint.z - friend.position.z);
        animateCharacterPose(friend, time, false);
      } else if (quest.recruited) {
        const column = recruitedFriends.indexOf(friend);
        // The player always leads the walk. Each companion takes a loose
        // place behind the current movement direction, never in front.
        const formation = [[-.78, 1.15], [.78, 1.15], [-1.2, 2.1], [1.2, 2.1], [0, 3.0]];
        const [side, behind] = formation[column % formation.length];
        const facing = playerFacing?.clone?.() || new THREE.Vector3(0, 0, 1);
        facing.y = 0;
        if (facing.lengthSq() < .001) facing.set(0, 0, 1);
        facing.normalize();
        const right = new THREE.Vector3(facing.z, 0, -facing.x);
        const desired = new THREE.Vector3()
          .copy(playerPosition)
          .addScaledVector(facing, -behind)
          .addScaledVector(right, side);
        const dx = desired.x - friend.position.x;
        const dz = desired.z - friend.position.z;
        const moving = dx * dx + dz * dz > .018;
        if (moving) friend.rotation.y = Math.atan2(dx, dz);
        friend.position.lerp(desired, 1 - Math.exp(-delta * 4.5));
        friend.position.copy(resolvePosition(friend.position, .24, false));
        friend.position.y = moving ? Math.abs(Math.sin(time * 7.5 + index)) * .025 : Math.sin(time * 1.55 + index) * .008;
        animateCharacterPose(friend, time, moving);
      } else {
        friend.position.x = quest.home.x + Math.sin(time * .35 + index) * .035;
        friend.position.z = quest.home.z + Math.cos(time * .28 + index) * .028;
        friend.position.y = Math.sin(time * 1.45 + index) * .008;
        animateCharacterPose(friend, time, false);
      }
      const isActiveTarget = activeQuestFriend === quest.id && !quest.recruited;
      marker.visible = isActiveTarget;
      marker.rotation.z = time * 1.25;
      const pulse = 1 + Math.sin(time * 3.8) * .08;
      marker.scale.setScalar(pulse);
      nameplate.visible = isActiveTarget;
      beacon.visible = isActiveTarget;
      beacon.rotation.y = time * 2.2;
      beacon.position.y = 2.13 * quest.scale + Math.sin(time * 3.4) * .08;
    });
    Object.values(sideQuestCharacters).forEach((person, index) => {
      const quest = person.userData.sideQuest;
      const followsPlayer = quest.state === 'active' && quest.escorting
        && (quest.id === 'porta-photo' || quest.id === 'find-the-dom');
      const settlesAtTarget = quest.state === 'completed' && (quest.id === 'porta-photo' || quest.id === 'find-the-dom');
      if (followsPlayer) {
        const facing = playerFacing?.clone?.() || new THREE.Vector3(0, 0, 1);
        facing.y = 0;
        if (facing.lengthSq() < .001) facing.set(0, 0, 1);
        facing.normalize();
        const right = new THREE.Vector3(facing.z, 0, -facing.x);
        const side = quest.id === 'porta-photo' ? -.76 : .78;
        const desired = new THREE.Vector3()
          .copy(playerPosition)
          .addScaledVector(facing, -1.22)
          .addScaledVector(right, side);
        const dx = desired.x - person.position.x;
        const dz = desired.z - person.position.z;
        const moving = dx * dx + dz * dz > .012;
        if (moving) person.rotation.y = Math.atan2(dx, dz);
        person.position.lerp(desired, 1 - Math.exp(-delta * 4.4));
        person.position.copy(resolvePosition(person.position, .23, false));
        person.position.y = moving ? Math.abs(Math.sin(time * 7.2 + index)) * .024 : Math.sin(time * 1.5 + index) * .008;
        animateCharacterPose(person, time, moving);
      } else {
        const destination = settlesAtTarget ? quest.target : quest.home;
        person.position.lerp(destination, 1 - Math.exp(-delta * 3.6));
        person.position.y = Math.sin(time * 1.45 + index) * .009;
        if (settlesAtTarget) person.rotation.y = Math.atan2(quest.target.x - playerPosition.x, quest.target.z - playerPosition.z);
        animateCharacterPose(person, time, false);
      }
      applyCitizenActivity(person, time);
      const isAvailable = quest.state === 'available' || quest.state === 'discovered';
      quest.marker.visible = isAvailable;
      quest.marker.position.y = 3.16 * quest.scale + Math.sin(time * 2.2 + index) * .07;
      const iconPulse = 1 + Math.sin(time * 3.1 + index) * .09;
      quest.marker.scale.set(1.05 * quest.scale * iconPulse, 1.05 * quest.scale * iconPulse, 1);
      // A side quest is an invitation in the city, not a hidden proximity
      // trigger. Keep its nameplate together with the exclamation mark so it
      // stays recognisable at the Porta, on the Hauptmarkt and at the Dom.
      quest.label.visible = isAvailable;
      quest.homeMarker.visible = isAvailable;
      if (isAvailable) {
        const homePulse = 1 + Math.sin(time * 2.7 + index) * .06;
        quest.homeMarker.scale.setScalar(homePulse);
        quest.homeMarker.userData.inner.material.opacity = .67 + Math.sin(time * 3.4 + index) * .14;
      }
      const targetVisible = quest.state === 'active'
        || (quest.state === 'discovered' && (quest.id === 'porta-photo' || quest.id === 'find-the-dom'));
      quest.targetMarker.visible = targetVisible;
      if (targetVisible) {
        const pulse = 1 + Math.sin(time * 2.4 + index) * .075;
        quest.targetMarker.scale.setScalar(pulse);
        quest.targetMarker.userData.inner.material.opacity = .74 + Math.sin(time * 3.4) * .16;
      }
      if (quest.plectrum) {
        quest.plectrum.visible = quest.state === 'active';
        quest.plectrum.rotation.y = time * .46;
        quest.plectrum.position.y = .052 + Math.sin(time * 2.5) * .012;
      }
    });
    if (goldenLight.group.visible) {
      const pulse = .8 + Math.sin(time * 4.2) * .2;
      goldenLight.pool.scale.setScalar(pulse);
      goldenLight.glow.position.y = .38 + Math.sin(time * 2.5) * .08;
      goldenLight.light.intensity = 2.8 + Math.sin(time * 4.2) * .55;
    }
    pigeons.forEach((pigeon) => {
      const { baseX, baseZ, phase } = pigeon.userData;
      pigeon.position.x = baseX + Math.sin(time * .7 + phase) * .14;
      pigeon.position.z = baseZ + Math.cos(time * .52 + phase) * .12;
      pigeon.position.y = .09 + Math.abs(Math.sin(time * 3 + phase)) * .018;
    });
    windActors.forEach((actor) => {
      const { target, phase, sway } = actor.userData.wind;
      target.rotation.z = Math.sin(time * .78 + phase) * sway;
      target.rotation.x = Math.cos(time * .54 + phase) * sway * .42;
    });
    windFlags.forEach((flag) => {
      const { base, phase } = flag.userData.flagWind;
      const positions = flag.geometry.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        const baseX = base[vertex * 3];
        const baseY = base[vertex * 3 + 1];
        const edge = THREE.MathUtils.clamp((baseX + .38) / .76, 0, 1);
        positions.setZ(vertex, base[vertex * 3 + 2] + Math.sin(time * 2.2 + baseY * 8 + phase) * .075 * edge);
      }
      positions.needsUpdate = true;
    });
    flyingBirds.forEach((bird) => {
      const { centerX, centerZ, radius, height, phase, leftWing, rightWing } = bird.userData.flight;
      const angle = time * .22 + phase;
      bird.position.set(centerX + Math.cos(angle) * radius, height + Math.sin(time * 1.7 + phase) * .18, centerZ + Math.sin(angle) * radius * .58);
      bird.rotation.y = -angle + Math.PI / 2;
      leftWing.rotation.y = Math.sin(time * 9 + phase) * .34;
      rightWing.rotation.y = -Math.sin(time * 9 + phase) * .34;
    });
  }

  return {
    root,
    citizens,
    visitorCount: citizens.length + Object.keys(sideQuestCharacters).length,
    questFriends,
    setHauptmarktAtelier(enabled, player) { hauptmarktAtelier.setEnabled(enabled, player); },
    sideQuestCharacters,
    wineStandPoint,
    arrivalPoint,
    portaFinalePoint: goldenLight.group.position,
    goldenLightPosition: goldenLight.group.position,
    update,
    get recruitedCount() { return recruitedFriends.length; },
    setQuestTarget(id) { activeQuestFriend = id; },
    setSideQuestState(id, state = 'available', { escorting = false } = {}) {
      const person = sideQuestCharacters[id];
      if (!person) return;
      person.userData.sideQuest.state = state;
      person.userData.sideQuest.escorting = Boolean(escorting);
    },
    getSideQuestState(id) {
      return sideQuestCharacters[id]?.userData.sideQuest.state || 'available';
    },
    isSideQuestFollowerNearby(id, point, radius = 2.65) {
      const person = sideQuestCharacters[id];
      if (!person || !point) return false;
      return person.position.distanceToSquared(point) <= radius * radius;
    },
    recruitFriend(id, playerPosition = wineStandPoint) {
      const friend = questFriends[id];
      if (!friend || friend.userData.questFriend.recruited) return;
      const quest = friend.userData.questFriend;
      quest.recruited = true;
      const order = recruitedFriends.length;
      const offsets = [[-1.15, .8], [1.15, .8], [-1.55, -.35], [1.55, -.35], [0, 1.55]];
      const [offsetX, offsetZ] = offsets[order % offsets.length];
      friend.position.set(playerPosition.x + offsetX, 0, playerPosition.z + offsetZ);
      recruitedFriends.push(friend);
      activeQuestFriend = null;
    },
    seatFriendsAtWine() {
      const seats = [[-13.0, 1.0], [-11.7, .35], [-10.3, 1.1], [-12.9, 2.65], [-10.2, 2.55]];
      recruitedFriends.forEach((friend, index) => {
        const [x, z] = seats[index] || seats[0];
        const quest = friend.userData.questFriend;
        quest.settled = true;
        quest.seat = new THREE.Vector3(x, 0, z);
      });
    },
    releaseFriendsFromWine() {
      recruitedFriends.forEach((friend) => {
        const quest = friend.userData.questFriend;
        quest.settled = false;
        quest.seat = null;
      });
    },
    revealWebersPorz() {
      const porz = questFriends.weber?.userData.questFriend.heirloomPorz;
      if (porz) porz.visible = true;
    },
    setEveningProgress(value = 0) {
      eveningTarget = THREE.MathUtils.clamp(value, 0, 1);
    },
    revealGoldenLight() { goldenLight.group.visible = true; },
    staticColliderCount: staticColliders.length,
    moveWithCollisions,
    getSafeCameraPosition,
    updateCameraOcclusion,
    clampPosition(position) {
      position.x = THREE.MathUtils.clamp(position.x, -96, 64);
      position.z = THREE.MathUtils.clamp(position.z, -76, 106);
      return position;
    },
    getLocation(position) {
      if (position.x < -56 && position.x > -96 && position.z > 75 && position.z < 106) return { name: 'Hauptbahnhof Trier', zone: 'hauptbahnhof' };
      // Covers both the wide left-hand exit from the Porta forecourt and the
      // long western shopping street, so the HUD never falls back to
      // Hauptmarkt while the player is already on Christophstraße.
      if (position.x < -12 && position.x > -62 && position.z > 72 && position.z < 101) return { name: 'Christophstraße', zone: 'christophstrasse' };
      if (position.x > 13 && position.x < 52 && position.z > 47 && position.z < 79) return { name: 'Margaretengäßchen', zone: 'margaretengaesschen' };
      if (position.x > 8 && position.x < 18 && position.z > 51 && position.z < 86) return { name: 'Simeonstraße', zone: 'simeonstrasse' };
      if (position.x > -21 && position.x < 9 && position.z > 57) return { name: 'Porta Nigra', zone: 'porta' };
      if (Math.abs(position.x) < 9 && position.z > 17) return { name: 'Simeonstraße', zone: 'simeonstrasse' };
      if (position.x > -21 && position.x < 21 && position.z < -53 && position.z > -76) return { name: 'Kornmarkt', zone: 'kornmarkt' };
      if (position.x > 5 && position.x < 19 && position.z < -12 && position.z > -53) return { name: 'Fleischstraße', zone: 'fleischstrasse' };
      if (position.x < -5 && position.x > -19 && position.z < -12 && position.z > -53) return { name: 'Brotstraße', zone: 'brotstrasse' };
      if (position.x < -40 && position.x > -73 && Math.abs(position.z - 1) < 19) return { name: 'Domfreihof', zone: 'domfreihof' };
      if (position.x < -20 && position.x >= -42 && Math.abs(position.z - 1) < 8) return { name: 'Sternstraße', zone: 'sternstrasse' };
      return { name: 'Hauptmarkt', zone: 'hauptmarkt' };
    },
  };
}
