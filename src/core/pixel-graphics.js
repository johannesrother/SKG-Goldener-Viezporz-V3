import * as THREE from 'three';

// This is a presentation layer, not another version of the city. Geometry,
// pathing, NPCs and quests stay entirely outside of this module.
export const PIXEL_STYLES = Object.freeze({
  modern: { label: 'Modern 3D', scale: 1, levels: 0, dither: 0 },
  soft: { label: 'Pixel Soft', scale: 0.86, levels: 6, dither: 0.035 },
  classic: { label: 'Pixel Classic', scale: 0.66, levels: 5, dither: 0.065 },
  sharp: { label: 'Pixel Sharp', scale: 0.51, levels: 5, dither: 0.09 },
});

export const PIXEL_QUALITIES = Object.freeze({
  low: { label: '2.5D Pixel – Low', scale: 0.78, shadows: false },
  medium: { label: '2.5D Pixel – Medium', scale: 0.92, shadows: true },
  high: { label: '2.5D Pixel – High', scale: 1, shadows: true },
});

export const DEFAULT_GRAPHICS = Object.freeze({ style: 'classic', quality: 'medium' });

export function normalizeGraphics(value = {}) {
  return {
    style: PIXEL_STYLES[value.style] ? value.style : DEFAULT_GRAPHICS.style,
    quality: PIXEL_QUALITIES[value.quality] ? value.quality : DEFAULT_GRAPHICS.quality,
  };
}

function quantize(value, levels) {
  return Math.round(value * (levels - 1)) / (levels - 1);
}

function rememberMaterial(material) {
  if (material.userData.skgPixelOriginal) return material.userData.skgPixelOriginal;
  const original = {
    color: material.color?.clone(),
    emissive: material.emissive?.clone(),
    magFilter: material.map?.magFilter,
    minFilter: material.map?.minFilter,
    anisotropy: material.map?.anisotropy,
  };
  material.userData.skgPixelOriginal = original;
  return original;
}

function restoreMaterial(material, original) {
  if (original.color && material.color) material.color.copy(original.color);
  if (original.emissive && material.emissive) material.emissive.copy(original.emissive);
  if (material.map && original.magFilter) {
    material.map.magFilter = original.magFilter;
    material.map.minFilter = original.minFilter;
    material.map.anisotropy = original.anisotropy;
    material.map.needsUpdate = true;
  }
  material.needsUpdate = true;
}

function pixelateMaterial(material, levels) {
  const original = rememberMaterial(material);
  if (original.color && material.color) material.color.setRGB(
    quantize(original.color.r, levels),
    quantize(original.color.g, levels),
    quantize(original.color.b, levels),
  );
  if (original.emissive && material.emissive) material.emissive.setRGB(
    quantize(original.emissive.r, levels),
    quantize(original.emissive.g, levels),
    quantize(original.emissive.b, levels),
  );
  if (material.map) {
    material.map.magFilter = THREE.NearestFilter;
    material.map.minFilter = THREE.NearestMipmapNearestFilter;
    material.map.anisotropy = 1;
    material.map.needsUpdate = true;
  }
  material.needsUpdate = true;
}

export class PixelGraphics {
  constructor(renderer, canvas, settings = DEFAULT_GRAPHICS) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.settings = normalizeGraphics(settings);
    this.fogOriginal = null;
  }

  get enabled() { return this.settings.style !== 'modern'; }
  get style() { return PIXEL_STYLES[this.settings.style]; }
  get quality() { return PIXEL_QUALITIES[this.settings.quality]; }

  pixelRatio(baseRatio) {
    return this.enabled ? Math.max(0.38, baseRatio * this.style.scale * this.quality.scale) : baseRatio;
  }

  setSettings(settings, scene) {
    this.settings = normalizeGraphics(settings);
    this.apply(scene);
  }

  apply(scene) {
    const shell = this.canvas.closest('.game-shell');
    shell?.classList.toggle('pixel-active', this.enabled);
    shell?.style.setProperty('--pixel-dither-opacity', String(this.enabled ? this.style.dither : 0));
    shell?.style.setProperty('--pixel-cell-size', this.settings.style === 'sharp' ? '3px' : this.settings.style === 'classic' ? '2px' : '1px');
    // The engine chooses whether normal 3D should receive shadows from its
    // device profile. Pixel mode only ever reduces that budget; it must never
    // accidentally turn shadows back on for a low-end phone.
    if (this.enabled) {
      this.renderer.shadowMap.enabled = this.quality.shadows;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    } else {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    scene.traverse((object) => {
      if (!object.isMesh && !object.isSprite) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        const original = rememberMaterial(material);
        if (this.enabled) pixelateMaterial(material, this.style.levels);
        else restoreMaterial(material, original);
      });
    });
    if (scene.fog) {
      if (!this.fogOriginal) this.fogOriginal = scene.fog.color.clone();
      if (this.enabled) scene.fog.color.setRGB(
        quantize(this.fogOriginal.r, this.style.levels),
        quantize(this.fogOriginal.g, this.style.levels),
        quantize(this.fogOriginal.b, this.style.levels),
      );
      else scene.fog.color.copy(this.fogOriginal);
    }
  }
}
