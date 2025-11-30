// Fix: Removed invalid file header which was causing parsing errors.
import type { ColorMapName, ColorStop, DivergingThresholdConfig } from '../types';
import { scaleLinear, scaleThreshold, scaleSequential } from 'd3-scale';
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

export function getColorScale(
  name: ColorMapName,
  domain: [number, number],
  inverted?: boolean,
  customStops?: ColorStop[],
  isThreshold?: boolean,
  divergingConfig?: DivergingThresholdConfig
): (value: number) => string {
  // Handle diverging threshold colormap
  if (name === 'DivergingThreshold' && divergingConfig) {
    const {
      centerValue,
      centerColor,
      upperThreshold,
      upperColor,
      upperOverflowColor,
      lowerThreshold,
      lowerColor,
      lowerOverflowColor
    } = divergingConfig;

    return (value: number): string => {
      if (value > upperThreshold) {
        // Above upper threshold
        return upperOverflowColor;
      } else if (value >= centerValue && value <= upperThreshold) {
        // Upper gradient (center to upper threshold)
        const t = (value - centerValue) / (upperThreshold - centerValue);
        return interpolate(centerColor, upperColor)(t) as string;
      } else if (value >= lowerThreshold && value < centerValue) {
        // Lower gradient (lower threshold to center)
        const t = (value - lowerThreshold) / (centerValue - lowerThreshold);
        return interpolate(lowerColor, centerColor)(t) as string;
      } else {
        // Below lower threshold
        return lowerOverflowColor;
      }
    };
  }
  if (name === 'Custom' && customStops && customStops.length > 0) {
    const sortedStops = [...customStops].sort((a, b) => a.value - b.value);

    // Threshold scale for discrete color ranges
    if (isThreshold) {
      if (sortedStops.length === 1) {
        return () => sortedStops[0].color;
      }
      // For a threshold scale, the domain is the upper bound of each range (excluding the first)
      // and the range is the color for that range.
      const scaleDomain = sortedStops.map(s => s.value).slice(1);
      const scaleRange = sortedStops.map(s => s.color);
      
      const scale = scaleThreshold<number, string>()
        .domain(scaleDomain)
        .range(scaleRange);
      return scale;
    }

    // Original linear gradient scale
    const stops = inverted ? [...customStops].reverse() : customStops;
    if (stops.length === 1) {
      return () => stops[0].color;
    }

    const scale = scaleLinear<string, string>()
      .domain(stops.map(s => s.value))
      .range(stops.map(s => s.color))
      .clamp(true);

    return scale;
  }

  const interpolator = (() => {
    switch (name) {
      case 'Viridis': return interpolateViridis;
      case 'Plasma': return interpolatePlasma;
      case 'Inferno': return interpolateInferno;
      case 'Magma': return interpolateMagma;
      case 'Cividis': return interpolateCividis;
      case 'Turbo': return interpolateTurbo;
      case 'Grayscale': return interpolateGreys;
      default: return interpolateViridis;
    }
  })();

  const finalInterpolator = inverted ? (t: number) => interpolator(1 - t) : interpolator;

  return scaleSequential(domain, finalInterpolator);
}