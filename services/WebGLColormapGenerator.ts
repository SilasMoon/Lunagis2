/**
 * WebGLColormapGenerator
 *
 * Generates colormap textures for WebGL rendering.
 * Supports built-in colormaps (Viridis, Plasma, etc.) and custom color stops.
 */

import type { ColorMapName, ColorStop, DivergingThresholdConfig } from '../types';
import { color as d3Color } from 'd3-color';
import { interpolate } from 'd3-interpolate';
import {
  interpolateViridis,
  interpolatePlasma,
  interpolateInferno,
  interpolateMagma,
  interpolateCividis,
  interpolateTurbo,
  interpolateGreys
} from 'd3-scale-chromatic';

export class WebGLColormapGenerator {
  private gl: WebGLRenderingContext;
  private cache: Map<string, WebGLTexture>;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.cache = new Map();
  }

  /**
   * Get or create a colormap texture
   *
   * @param name - Colormap name (Viridis, Plasma, etc.)
   * @param inverted - Reverse the colormap
   * @param customStops - Custom color stops (for Custom colormap)
   * @param isThreshold - Use threshold/discrete colormap
   * @param divergingConfig - Configuration for DivergingThreshold colormap
   * @param valueRange - The min/max data range for proper colormap scaling
   * @returns WebGL texture containing the colormap
   */
  getColormapTexture(
    name: ColorMapName,
    inverted?: boolean,
    customStops?: ColorStop[],
    isThreshold?: boolean,
    divergingConfig?: DivergingThresholdConfig,
    valueRange?: [number, number]
  ): WebGLTexture {
    const cacheKey = this.generateCacheKey(name, inverted, customStops, isThreshold, divergingConfig, valueRange);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const colors = this.generateColormap(name, inverted, customStops, isThreshold, divergingConfig, valueRange);
    const texture = this.createColormapTexture(colors);

    this.cache.set(cacheKey, texture);
    console.log(`✅ Created colormap texture: ${name}${inverted ? ' (inverted)' : ''}`);

    return texture;
  }

  /**
   * Generate cache key for colormap configuration
   */
  private generateCacheKey(
    name: ColorMapName,
    inverted?: boolean,
    customStops?: ColorStop[],
    isThreshold?: boolean,
    divergingConfig?: DivergingThresholdConfig,
    valueRange?: [number, number]
  ): string {
    const parts = [name, inverted ? 'inv' : 'norm'];
    if (customStops) {
      parts.push(JSON.stringify(customStops));
    }
    if (isThreshold) {
      parts.push('threshold');
    }
    if (divergingConfig) {
      parts.push(JSON.stringify(divergingConfig));
    }
    if (valueRange) {
      parts.push(valueRange.join(','));
    }
    return parts.join('|');
  }

  /**
   * Generate colormap as Uint8Array (256 RGBA colors)
   */
  private generateColormap(
    name: ColorMapName,
    inverted?: boolean,
    customStops?: ColorStop[],
    isThreshold?: boolean,
    divergingConfig?: DivergingThresholdConfig,
    valueRange?: [number, number]
  ): Uint8Array {
    if (name === 'DivergingThreshold' && divergingConfig && valueRange) {
      return this.generateDivergingThresholdColormap(divergingConfig, valueRange);
    }

    if (name === 'Custom' && customStops && customStops.length > 0) {
      return this.generateCustomColormap(customStops, inverted, isThreshold);
    }

    return this.generateBuiltInColormap(name, inverted);
  }

  /**
   * Generate built-in colormap using d3 interpolators
   */
  private generateBuiltInColormap(name: ColorMapName, inverted?: boolean): Uint8Array {
    const interpolator = this.getD3Interpolator(name);
    const colors: number[] = [];

    for (let i = 0; i < 256; i++) {
      const t = inverted ? 1 - i / 255 : i / 255;
      const colorObj = d3Color(interpolator(t));

      if (colorObj) {
        const rgb = colorObj.rgb();
        colors.push(
          Math.floor(rgb.r),
          Math.floor(rgb.g),
          Math.floor(rgb.b),
          255
        );
      } else {
        // Fallback for invalid color
        colors.push(0, 0, 0, 255);
      }
    }

    return new Uint8Array(colors);
  }

  /**
   * Get d3 interpolator for colormap name
   */
  private getD3Interpolator(name: ColorMapName): (t: number) => string {
    switch (name) {
      case 'Viridis':
        return interpolateViridis;
      case 'Plasma':
        return interpolatePlasma;
      case 'Inferno':
        return interpolateInferno;
      case 'Magma':
        return interpolateMagma;
      case 'Cividis':
        return interpolateCividis;
      case 'Turbo':
        return interpolateTurbo;
      case 'Grayscale':
        return interpolateGreys;
      default:
        return interpolateViridis;
    }
  }

  /**
   * Generate custom colormap from color stops
   */
  private generateCustomColormap(
    stops: ColorStop[],
    inverted?: boolean,
    isThreshold?: boolean
  ): Uint8Array {
    const sortedStops = [...stops].sort((a, b) => a.value - b.value);
    const finalStops = inverted ? [...sortedStops].reverse() : sortedStops;

    if (isThreshold) {
      return this.generateThresholdColormap(finalStops);
    }

    return this.generateLinearColormap(finalStops);
  }

  /**
   * Generate linear interpolated colormap
   */
  private generateLinearColormap(stops: ColorStop[]): Uint8Array {
    const colors: number[] = [];

    // Normalize stop values to [0, 1]
    const minValue = stops[0].value;
    const maxValue = stops[stops.length - 1].value;
    const range = maxValue - minValue;

    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const value = minValue + t * range;

      // Find surrounding color stops
      let color: string;
      if (value <= stops[0].value) {
        color = stops[0].color;
      } else if (value >= stops[stops.length - 1].value) {
        color = stops[stops.length - 1].color;
      } else {
        // Linear interpolation between stops
        let lowerStop = stops[0];
        let upperStop = stops[stops.length - 1];

        for (let j = 0; j < stops.length - 1; j++) {
          if (value >= stops[j].value && value <= stops[j + 1].value) {
            lowerStop = stops[j];
            upperStop = stops[j + 1];
            break;
          }
        }

        const localT = (value - lowerStop.value) / (upperStop.value - lowerStop.value);
        color = interpolate(lowerStop.color, upperStop.color)(localT) as string;
      }

      const rgb = d3Color(color);
      if (rgb) {
        const rgbObj = rgb.rgb();
        colors.push(
          Math.floor(rgbObj.r),
          Math.floor(rgbObj.g),
          Math.floor(rgbObj.b),
          255
        );
      } else {
        colors.push(0, 0, 0, 255);
      }
    }

    return new Uint8Array(colors);
  }

  /**
   * Generate threshold (discrete) colormap
   */
  private generateThresholdColormap(stops: ColorStop[]): Uint8Array {
    const colors: number[] = [];

    if (stops.length === 1) {
      // Single color
      const rgb = d3Color(stops[0].color);
      if (rgb) {
        const rgbObj = rgb.rgb();
        for (let i = 0; i < 256; i++) {
          colors.push(Math.floor(rgbObj.r), Math.floor(rgbObj.g), Math.floor(rgbObj.b), 255);
        }
      } else {
        for (let i = 0; i < 256; i++) {
          colors.push(0, 0, 0, 255);
        }
      }
    } else {
      // Discrete ranges
      const minValue = stops[0].value;
      const maxValue = stops[stops.length - 1].value;
      const range = maxValue - minValue;

      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        const value = minValue + t * range;

        // Find which threshold range this value falls into
        let colorIndex = 0;
        for (let j = 1; j < stops.length; j++) {
          if (value >= stops[j].value) {
            colorIndex = j;
          } else {
            break;
          }
        }

        const rgb = d3Color(stops[colorIndex].color);
        if (rgb) {
          const rgbObj = rgb.rgb();
          colors.push(Math.floor(rgbObj.r), Math.floor(rgbObj.g), Math.floor(rgbObj.b), 255);
        } else {
          colors.push(0, 0, 0, 255);
        }
      }
    }

    return new Uint8Array(colors);
  }

  /**
   * Generate diverging threshold colormap
   */
  private generateDivergingThresholdColormap(
    config: DivergingThresholdConfig,
    valueRange: [number, number]
  ): Uint8Array {
    const {
      centerValue,
      centerColor,
      upperThreshold,
      upperColor,
      upperOverflowColor,
      lowerThreshold,
      lowerColor,
      lowerOverflowColor
    } = config;

    const [minValue, maxValue] = valueRange;
    const colors: number[] = [];

    // Generate 256 colors for the colormap texture
    // Each color corresponds to a normalized value [0, 1]
    // which maps to [minValue, maxValue] in the actual data

    for (let i = 0; i < 256; i++) {
      const t = i / 255; // Normalized position [0, 1]

      // Map normalized position to actual data value
      const value = minValue + t * (maxValue - minValue);

      // Determine color based on thresholds
      let rgb: ReturnType<typeof d3Color>;
      if (value > upperThreshold) {
        // Above upper threshold → overflow color
        rgb = d3Color(upperOverflowColor);
      } else if (value >= centerValue && value <= upperThreshold) {
        // Upper gradient (center to upper threshold)
        const localT = (value - centerValue) / (upperThreshold - centerValue);
        const interpolatedColor = interpolate(centerColor, upperColor)(localT);
        rgb = d3Color(interpolatedColor);
      } else if (value >= lowerThreshold && value < centerValue) {
        // Lower gradient (lower threshold to center)
        const localT = (value - lowerThreshold) / (centerValue - lowerThreshold);
        const interpolatedColor = interpolate(lowerColor, centerColor)(localT);
        rgb = d3Color(interpolatedColor);
      } else {
        // Below lower threshold → overflow color
        rgb = d3Color(lowerOverflowColor);
      }

      if (rgb) {
        const rgbObj = rgb.rgb();
        colors.push(
          Math.floor(rgbObj.r),
          Math.floor(rgbObj.g),
          Math.floor(rgbObj.b),
          Math.floor(rgbObj.opacity * 255) // Support transparency
        );
      } else {
        colors.push(0, 0, 0, 255);
      }
    }

    return new Uint8Array(colors);
  }

  /**
   * Create WebGL texture from color data
   */
  private createColormapTexture(colors: Uint8Array): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();

    if (!texture) {
      throw new Error('Failed to create colormap texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,  // width: 256 colors
      1,    // height: 1 row
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      colors
    );

    // Use linear filtering for smooth gradients
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture;
  }

  /**
   * Clear the colormap cache
   */
  clearCache(): void {
    this.cache.forEach((texture) => {
      this.gl.deleteTexture(texture);
    });
    this.cache.clear();
    console.log('🗑️ Colormap cache cleared');
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    this.clearCache();
    console.log('🗑️ WebGLColormapGenerator disposed');
  }
}
