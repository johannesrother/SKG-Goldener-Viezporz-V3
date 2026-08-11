import * as THREE from 'three';

// Presentation settings for the Hauptmarkt art prototype.  This module never
// changes render resolution, applies a screen filter, or touches world assets.
// The actual 2.5D look lives in the material library in world/hauptmarkt-atelier.
export const PIXEL_STYLES = Object.freeze({
  modern: { label: 'Modern 3D', atelier: false },
  soft: { label: '2.5D Atelier – weich', atelier: true },
  classic: { label: '2.5D Atelier', atelier: true },
  sharp: { label: '2.5D Atelier – kontrast', atelier: true },
});

export const PIXEL_QUALITIES = Object.freeze({
  low: { label: 'Atelier – Low', shadows: false },
  medium: { label: 'Atelier – Medium', shadows: true },
  high: { label: 'Atelier – High', shadows: true },
});

export const DEFAULT_GRAPHICS = Object.freeze({ style: 'classic', quality: 'medium' });

export function normalizeGraphics(value = {}) {
  return {
    style: PIXEL_STYLES[value.style] ? value.style : DEFAULT_GRAPHICS.style,
    quality: PIXEL_QUALITIES[value.quality] ? value.quality : DEFAULT_GRAPHICS.quality,
  };
}

export class PixelGraphics {
  constructor(renderer, canvas, settings = DEFAULT_GRAPHICS) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.settings = normalizeGraphics(settings);
  }

  get enabled() { return PIXEL_STYLES[this.settings.style].atelier; }
  get style() { return PIXEL_STYLES[this.settings.style]; }
  get quality() { return PIXEL_QUALITIES[this.settings.quality]; }

  pixelRatio(baseRatio) { return baseRatio; }

  setSettings(settings) {
    this.settings = normalizeGraphics(settings);
    this.apply();
  }

  apply() {
    const shell = this.canvas.closest('.game-shell');
    shell?.classList.toggle('atelier-active', this.enabled);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
}
