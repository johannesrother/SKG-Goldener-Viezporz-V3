import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PixelGraphics, normalizeGraphics } from './pixel-graphics.js';
import { animateCharacterPose, createWorld, makePerson, setPersonStyle } from '../world/world.js';

const OUTFITS = {
  beige: 0xc1a17b,
  dunkelgruen: 0x365a47,
  weinrot: 0x783f43,
  dunkelblau: 0x344c6b,
  anthrazit: 0x3e454a,
  // Older saved profiles remain readable after the menu redesign.
  wald: 0x365a47,
  blau: 0x344c6b,
  kupfer: 0x783f43,
};

const HAIR = {
  schwarz: 0x211b1b,
  braun: 0x603c27,
  blond: 0xba8641,
  rot: 0x8f4632,
  grau: 0x7d7a70,
  dunkel: 0x211b1b,
  hell: 0xba8641,
};

// A relaxed evening stroll should still feel immediately responsive.  Keeping
// these values together makes the pace easy to tune without changing the
// camera or collision behaviour.
const WALK_SPEED = 5.35;
const WALK_ACCELERATION = 15;
const WALK_DECELERATION = 11;

export class GameEngine {
  constructor(canvas, profile, callbacks = {}, graphics = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.graphics = normalizeGraphics(graphics);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 120);
    this.camera.position.set(15, 22, 17);
    this.baseZoom = window.innerWidth < 620 ? .9 : 1.0;
    this.manualZoomOffset = 0;
    this.camera.zoom = this.baseZoom;
    this.isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.qualityProfile = this.chooseQualityProfile();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.qualityProfile !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // A quieter grade preserves the warm evening mood while giving the scene
    // the richer, less plastic contrast of a classic isometric RPG.
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = this.qualityProfile !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.pixelGraphics = new PixelGraphics(this.renderer, canvas, this.graphics);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelGraphics.pixelRatio(this.pixelRatio())));
    this.composer = this.createPostProcessing();
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.walkPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.destination = null;
    this.cameraFocus = new THREE.Vector3(0, 0, 0);
    this.location = { name: 'Hauptmarkt', zone: 'hauptmarkt' };
    this.keys = new Set();
    this.joystick = new THREE.Vector2();
    this.playerVelocity = new THREE.Vector3();
    this.running = true;
    this.inputEnabled = true;
    this.cinematic = null;
    this.marketIntro = null;
    this.wineMoment = null;
    this.menuPresentation = false;
    this.menuFocus = new THREE.Vector3(0, 0, .3);
    this.profile = profile;
    this.world = createWorld(this.scene, this.qualityProfile);
    this.player = makePerson({
      name: profile.name,
      outfit: OUTFITS[profile.outfit] || OUTFITS.dunkelgruen,
      hair: HAIR[profile.hair] || HAIR.braun,
      scale: 1.08,
    });
    // Chapter 1 starts with arriving in Trier. The station square is an
    // existing, safely walkable part of the same continuous world.
    this.player.position.copy(this.world.arrivalPoint || new THREE.Vector3(-72, 0, 90));
    this.world.root.add(this.player);
    this.pixelGraphics.apply();
    this.world.setHauptmarktAtelier?.(this.pixelGraphics.enabled, this.player);
    this.resize();
    this.bindInput();
    this.animate();
  }

  createPostProcessing() {
    // Bloom is deliberately reserved for powerful desktop GPUs.  It gives
    // lanterns, windows and the late sun a soft cinematic lift without
    // compromising the responsive mobile profile.
    if (this.qualityProfile !== 'high') return null;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), .19, .38, .86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return composer;
  }

  chooseQualityProfile() {
    // Phones have a high device pixel ratio but a much tighter heat and battery
    // budget than a desktop. Keep their fill-rate predictable, even in
    // landscape where the viewport can be wider than a tablet.
    if (this.isTouchDevice) return window.innerWidth < 900 ? 'low' : 'medium';
    if (window.innerWidth < 560 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)) return 'low';
    // The city is intentionally dense. Reserve the post-processing profile
    // for genuinely powerful wide-screen desktops; most laptops now use the
    // smoother medium profile instead of spending their frame budget on bloom.
    return window.innerWidth >= 1180
      && window.devicePixelRatio <= 2
      && (navigator.hardwareConcurrency || 4) >= 12
      ? 'high'
      : 'medium';
  }

  pixelRatio() {
    // The isometric view still reads crisply at these caps, while the lower
    // fill rate keeps the busy square responsive on notebooks and phones.
    return this.qualityProfile === 'high' ? 1.28 : this.qualityProfile === 'medium' ? (this.isTouchDevice ? .9 : 1.05) : .82;
  }

  setGraphicsSettings(graphics) {
    this.graphics = normalizeGraphics(graphics);
    this.pixelGraphics.setSettings(this.graphics);
    this.world.setHauptmarktAtelier?.(this.pixelGraphics.enabled, this.player);
    this.composer?.dispose();
    this.composer = this.createPostProcessing();
    this.resize();
  }

  getPosition() {
    return { x: this.player.position.x, z: this.player.position.z };
  }

  setDestination(x, z) {
    if (!this.inputEnabled) return;
    this.destination = this.world.clampPosition(new THREE.Vector3(x, 0, z));
  }

  setJoystick(x, y) {
    if (!this.inputEnabled) return;
    this.joystick.set(x, y);
    if (this.joystick.lengthSq() > .015) this.destination = null;
  }

  beginCinematic(target, duration = 5.6) {
    this.destination = null;
    this.keys.clear();
    this.joystick.set(0, 0);
    this.inputEnabled = false;
    this.cinematic = { target: new THREE.Vector3(target.x, 0, target.z), endsAt: this.clock.elapsedTime + duration };
  }

  beginMarketIntro(duration = 5.2) {
    this.destination = null;
    this.keys.clear();
    this.joystick.set(0, 0);
    this.inputEnabled = false;
    this.marketIntro = {
      startedAt: this.clock.elapsedTime,
      duration,
      fromPosition: new THREE.Vector3(20, 27, 25),
      toPosition: new THREE.Vector3(this.player.position.x + 10.8, 14.8, this.player.position.z + 17.4),
      fromFocus: new THREE.Vector3(-2.2, 0, -1.2),
      toFocus: this.player.position.clone(),
    };
    this.camera.position.copy(this.marketIntro.fromPosition);
    this.cameraFocus.copy(this.marketIntro.fromFocus);
  }

  beginStationIntro(duration = 4.4) {
    this.destination = null;
    this.keys.clear();
    this.joystick.set(0, 0);
    this.inputEnabled = false;
    const arrival = this.player.position.clone();
    this.marketIntro = {
      startedAt: this.clock.elapsedTime,
      duration,
      fromPosition: new THREE.Vector3(arrival.x + 17, 25, arrival.z + 21),
      toPosition: new THREE.Vector3(arrival.x + 10.8, 17.2, arrival.z + 17.4),
      fromFocus: new THREE.Vector3(arrival.x + 3.6, 0, arrival.z),
      toFocus: arrival,
    };
    this.camera.position.copy(this.marketIntro.fromPosition);
    this.cameraFocus.copy(this.marketIntro.fromFocus);
  }

  beginWineMoment(target) {
    this.destination = null;
    this.keys.clear();
    this.joystick.set(0, 0);
    this.inputEnabled = false;
    this.wineMoment = { target: new THREE.Vector3(target.x, 0, target.z) };
  }

  endWineMoment() {
    this.wineMoment = null;
    this.inputEnabled = true;
  }

  resumeExploration() {
    this.cinematic = null;
    this.wineMoment = null;
    this.marketIntro = null;
    this.inputEnabled = true;
  }

  setMenuPresentation(active = true) {
    this.menuPresentation = active;
    this.inputEnabled = !active;
    this.destination = null;
    this.keys.clear();
    this.joystick.set(0, 0);
    if (active) {
      // Offset the hero from the market centre so the menu can remain calm on
      // the left while the actual game model reads as a character preview.
      this.player.position.set(-5.15, 0, 3.15);
      this.player.rotation.y = .72;
      this.menuFocus.set(0, 0, .35);
    }
  }

  setPreviewStyle(profile = {}) {
    this.profile = { ...this.profile, ...profile };
    setPersonStyle(this.player, {
      outfit: OUTFITS[this.profile.outfit] || OUTFITS.dunkelgruen,
      hair: HAIR[this.profile.hair] || HAIR.braun,
    });
  }

  bindInput() {
    this.onResize = () => this.resize();
    this.onViewportResize = () => this.resize();
    this.onKeyDown = (event) => {
      if (event.code === 'KeyE' || event.code === 'Enter') {
        this.callbacks.onInteract?.(this.getPosition());
        event.preventDefault();
        return;
      }
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
      if (!this.inputEnabled) return;
      this.keys.add(event.code);
      this.destination = null;
      event.preventDefault();
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onPointerDown = (event) => {
      if (event.button > 0) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.walkPlane, hit)) this.setDestination(hit.x, hit.z);
    };
    this.onWheel = (event) => {
      this.manualZoomOffset = THREE.MathUtils.clamp(this.manualZoomOffset - event.deltaY * .00065, -.22, .24);
    };
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onViewportResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.baseZoom = width < 620 ? .86 : this.isTouchDevice && width < 900 ? .93 : 1.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelGraphics.pixelRatio(this.pixelRatio())));
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    // A closer default makes the real façades, tables and visitors legible;
    // the whole square remains available through the gentle scroll zoom.
    const viewHeight = width < 620 ? 19.6 : this.isTouchDevice && width < 900 ? 21 : 22.4;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelGraphics.pixelRatio(this.pixelRatio())));
      this.composer.setSize(width, height);
    }
  }

  keyboardVector() {
    const vector = new THREE.Vector2();
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) vector.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) vector.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) vector.y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) vector.y -= 1;
    return vector;
  }

  cameraRelativeMovement(input, speed) {
    // Movement follows the screen, rather than the world's fixed axes. This
    // keeps W/A/S/D intuitive when the soft isometric camera changes its
    // follow position between streets and plazas.
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    return forward.multiplyScalar(input.y).addScaledVector(right, input.x).normalize().multiplyScalar(speed);
  }

  updatePlayer(delta, time) {
    const keyboard = this.inputEnabled ? this.keyboardVector() : new THREE.Vector2();
    // Touch input is measured downwards by the browser, so invert its Y axis
    // once before applying the same screen-relative movement as the keyboard.
    const joystick = new THREE.Vector2(this.joystick.x, -this.joystick.y);
    const input = keyboard.lengthSq() > 0 ? keyboard : joystick;
    let targetVelocity = new THREE.Vector3();
    if (this.inputEnabled && input.lengthSq() > .005) {
      targetVelocity = this.cameraRelativeMovement(input, WALK_SPEED);
    } else if (this.inputEnabled && this.destination) {
      const distance = this.destination.clone().sub(this.player.position);
      distance.y = 0;
      if (distance.length() < .1) this.destination = null;
      else targetVelocity = distance.normalize().multiplyScalar(Math.min(WALK_SPEED, Math.max(.78, distance.length() * 4.8)));
    }
    const responsiveness = targetVelocity.lengthSq() > 0 ? WALK_ACCELERATION : WALK_DECELERATION;
    this.playerVelocity.lerp(targetVelocity, 1 - Math.exp(-delta * responsiveness));
    if (!this.inputEnabled) this.playerVelocity.multiplyScalar(Math.exp(-delta * 14));
    if (this.playerVelocity.lengthSq() < .00006) this.playerVelocity.set(0, 0, 0);
    const movement = this.playerVelocity.clone().multiplyScalar(delta);
    if (movement.lengthSq() > 0) {
      const before = this.player.position.clone();
      const resolved = this.world.moveWithCollisions(before, movement, .34);
      resolved.y = this.player.position.y;
      this.player.position.copy(resolved);
      const actual = resolved.clone().sub(before);
      actual.y = 0;
      if (actual.lengthSq() < movement.lengthSq() * .14) this.playerVelocity.multiplyScalar(.3);
      if (actual.lengthSq() > .000002) {
        const desiredRotation = Math.atan2(actual.x, actual.z);
        const rotationDelta = Math.atan2(Math.sin(desiredRotation - this.player.rotation.y), Math.cos(desiredRotation - this.player.rotation.y));
        this.player.rotation.y += rotationDelta * (1 - Math.exp(-delta * 15));
        this.callbacks.onMove?.(this.getPosition());
      }
      this.player.position.y = Math.abs(Math.sin(time * 8.2)) * Math.min(.03, actual.length() * .12 + .012);
    } else {
      this.player.position.y = Math.sin(time * 1.75) * .008;
    }
    animateCharacterPose(this.player, time, movement.lengthSq() > 0);
    if (this.player.userData.playerMarker) {
      const pulse = 1 + Math.sin(time * 3.2) * .045;
      this.player.userData.playerMarker.scale.setScalar(pulse);
    }
  }

  updateCamera(delta) {
    if (this.marketIntro) {
      const intro = this.marketIntro;
      const progress = THREE.MathUtils.clamp((this.clock.elapsedTime - intro.startedAt) / intro.duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      this.cameraFocus.lerpVectors(intro.fromFocus, intro.toFocus, eased);
      this.camera.position.lerpVectors(intro.fromPosition, intro.toPosition, eased);
      this.camera.lookAt(this.cameraFocus.x, .42, this.cameraFocus.z);
      if (progress >= 1) {
        this.marketIntro = null;
        this.inputEnabled = true;
        this.callbacks.onIntroEnd?.();
      }
      return;
    }
    if (this.cinematic) {
      const target = this.cinematic.target;
      this.cameraFocus.lerp(target, 1 - Math.exp(-delta * 2.1));
      const desired = new THREE.Vector3(target.x + 9.2, 12.2, target.z + 12.8);
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * 1.75));
      this.camera.lookAt(this.cameraFocus.x, .45, this.cameraFocus.z);
      if (this.clock.elapsedTime >= this.cinematic.endsAt) {
        this.cinematic = null;
        this.inputEnabled = true;
        this.callbacks.onCinematicEnd?.();
      }
      return;
    }
    if (this.wineMoment) {
      const target = this.wineMoment.target;
      this.cameraFocus.lerp(target, 1 - Math.exp(-delta * 2.5));
      const desired = new THREE.Vector3(target.x + 7.4, 10.8, target.z + 12.2);
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * 2.2));
      this.camera.lookAt(this.cameraFocus.x, .45, this.cameraFocus.z);
      return;
    }
    if (this.menuPresentation) {
      this.cameraFocus.lerp(this.menuFocus, 1 - Math.exp(-delta * 1.35));
      const desired = new THREE.Vector3(this.menuFocus.x + 10.6, 14.6, this.menuFocus.z + 17.7);
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * 1.15));
      this.camera.lookAt(this.cameraFocus.x, .55, this.cameraFocus.z);
      // The preview remains the real in-game character and therefore shares
      // its idle animation, materials and silhouette with play mode.
      this.player.rotation.y += delta * .16;
      return;
    }
    this.location = this.world.getLocation(this.player.position);
    const streetZone = ['porta', 'simeonstrasse', 'brotstrasse', 'fleischstrasse', 'christophstrasse', 'margaretengaesschen'].includes(this.location.zone);
    const plazaZone = ['hauptmarkt', 'domfreihof', 'kornmarkt', 'hauptbahnhof'].includes(this.location.zone);
    const portraitMobile = this.isTouchDevice && window.innerHeight > window.innerWidth;
    // The player's position is the camera target in every playable area.
    // Landmarks may influence height and zoom, but never move the hero away
    // from the middle of the screen.
    this.cameraFocus.set(this.player.position.x, 0, this.player.position.z);
    // Keep the hero visible: a classic RPG camera is high enough to read the
    // walking space, but retains enough tilt for façades and landmarks.
    const cameraHeight = this.location.zone === 'simeonstrasse' || this.location.zone === 'brotstrasse' || this.location.zone === 'fleischstrasse' || this.location.zone === 'christophstrasse' || this.location.zone === 'margaretengaesschen' ? 13.4 : this.location.zone === 'sternstrasse' ? 14.1 : this.location.zone === 'domfreihof' || this.location.zone === 'kornmarkt' || this.location.zone === 'hauptbahnhof' ? 17.2 : this.location.zone === 'porta' ? 14.4 : 14.8;
    const desired = streetZone
      // Sitting close to the middle of a street prevents the nearest house
      // row from covering the player, while still keeping an oblique view.
      ? new THREE.Vector3(this.cameraFocus.x + 3.6, cameraHeight, this.cameraFocus.z - 19.8)
      : new THREE.Vector3(this.cameraFocus.x + 10.8, cameraHeight, this.cameraFocus.z + 17.4);
    const safeDesired = this.world.getSafeCameraPosition(desired);
    this.camera.position.lerp(safeDesired, 1 - Math.exp(-delta * (portraitMobile ? 4.6 : 2.35)));
    this.camera.lookAt(this.cameraFocus.x, .3, this.cameraFocus.z);
    this.world.updateCameraOcclusion(this.camera, this.player.position, delta);
    // A gentle, automatic widening at the three plazas lets their landmarks
    // breathe. The player's wheel zoom remains an offset, so it is never
    // overridden while they explore.
    const zoneZoom = portraitMobile ? (plazaZone ? .94 : streetZone ? 1 : .97) : plazaZone ? .91 : streetZone ? 1.025 : .97;
    const desiredZoom = THREE.MathUtils.clamp(this.baseZoom * zoneZoom + this.manualZoomOffset, .76, 1.25);
    const zoomAlpha = 1 - Math.exp(-delta * 1.7);
    if (Math.abs(this.camera.zoom - desiredZoom) > .0001) {
      this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, desiredZoom, zoomAlpha);
      this.camera.updateProjectionMatrix();
    }
  }

  animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this.animate());
    // Do not let a short rendering hiccup make walking visibly slower.  The
    // clamp still prevents a tab returning from the background from causing a
    // large collision step.
    const delta = Math.min(this.clock.getDelta(), .06);
    const time = this.clock.elapsedTime;
    this.updatePlayer(delta, time);
    this.updateCamera(delta);
    // Keep recruited friends behind the player in a walking formation.
    const playerFacing = new THREE.Vector3(
      Math.sin(this.player.rotation.y),
      0,
      Math.cos(this.player.rotation.y),
    );
    this.world.update(time, this.player.position, playerFacing);
    this.callbacks.onFrame?.({
      time,
      position: this.getPosition(),
      visitorCount: this.world.visitorCount,
      location: this.location,
      playerFacing: { x: playerFacing.x, z: playerFacing.z },
    });
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.running = false;
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onViewportResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
