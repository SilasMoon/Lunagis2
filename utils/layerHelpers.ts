/**
 * Layer type checking utilities
 * Provides type-safe helper functions for working with different layer types
 */

import type { Layer, DataLayer, DteCommsLayer, LpfCommsLayer, IlluminationLayer, AnalysisLayer, BaseMapLayer, ImageLayer } from '../types';

/**
 * Type guard: checks if layer has a dataset and grid structure
 * Includes: DataLayer, DteCommsLayer, LpfCommsLayer, IlluminationLayer, AnalysisLayer
 */
export function isDataGridLayer(layer: Layer): layer is DataLayer | DteCommsLayer | LpfCommsLayer | IlluminationLayer | AnalysisLayer {
  return layer.type === 'data' ||
         layer.type === 'analysis' ||
         layer.type === 'dte_comms' ||
         layer.type === 'lpf_comms' ||
         layer.type === 'illumination';
}

/**
 * Type guard: checks if layer is a DataLayer
 */
export function isDataLayer(layer: Layer): layer is DataLayer {
  return layer.type === 'data';
}

/**
 * Type guard: checks if layer is a DteCommsLayer
 */
export function isDteCommsLayer(layer: Layer): layer is DteCommsLayer {
  return layer.type === 'dte_comms';
}

/**
 * Type guard: checks if layer is a LpfCommsLayer
 */
export function isLpfCommsLayer(layer: Layer): layer is LpfCommsLayer {
  return layer.type === 'lpf_comms';
}

/**
 * Type guard: checks if layer is an AnalysisLayer
 */
export function isAnalysisLayer(layer: Layer): layer is AnalysisLayer {
  return layer.type === 'analysis';
}

/**
 * Type guard: checks if layer is a BaseMapLayer
 */
export function isBaseMapLayer(layer: Layer): layer is BaseMapLayer {
  return layer.type === 'basemap';
}

/**
 * Type guard: checks if layer is an ImageLayer
 */
export function isImageLayer(layer: Layer): layer is ImageLayer {
  return layer.type === 'image';
}

/**
 * Type guard: checks if layer is an IlluminationLayer
 */
export function isIlluminationLayer(layer: Layer): layer is IlluminationLayer {
  return layer.type === 'illumination';
}

/**
 * Type guard: checks if layer has colormap properties
 */
export function hasColormap(layer: Layer): layer is DataLayer | DteCommsLayer | LpfCommsLayer | IlluminationLayer | AnalysisLayer {
  return isDataGridLayer(layer);
}

/**
 * Type guard: checks if layer is a nightfall analysis
 */
export function isNightfallLayer(layer: Layer): layer is AnalysisLayer {
  return layer.type === 'analysis' && layer.analysisType === 'nightfall';
}

/**
 * Type guard: checks if layer is a daylight fraction analysis
 */
export function isDaylightFractionLayer(layer: Layer): layer is AnalysisLayer {
  return layer.type === 'analysis' && layer.analysisType === 'daylight_fraction';
}

/**
 * Type guard: checks if layer is an expression analysis
 */
export function isExpressionLayer(layer: Layer): layer is AnalysisLayer {
  return layer.type === 'analysis' && layer.analysisType === 'expression';
}

/**
 * Get the appropriate time index for a layer
 * Daylight fraction layers always use index 0, others use the provided timeIndex
 */
export function getLayerTimeIndex(layer: Layer, timeIndex: number): number {
  if (isDaylightFractionLayer(layer)) {
    return 0;
  }
  return timeIndex;
}
