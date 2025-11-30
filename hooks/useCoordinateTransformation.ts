/**
 * Custom hook for coordinate transformations between lat/lon and pixel coordinates
 * Provides a memoized transformer function for efficient coordinate conversions
 */

import { useMemo } from 'react';
import type { PixelCoords, DataLayer, DteCommsLayer, LpfCommsLayer } from '../types';
import { logger } from '../utils/logger';

interface UseCoordinateTransformationParams {
  proj: typeof proj4 | null;
  primaryDataLayer: DataLayer | DteCommsLayer | LpfCommsLayer | null;
  lonRange: [number, number];
  latRange: [number, number];
}

/**
 * Hook that creates a coordinate transformation function
 * Maps from geographic (lat, lon) coordinates to pixel coordinates in the data grid
 *
 * @param proj - Proj4 projection object
 * @param primaryDataLayer - The primary data layer containing dimensions
 * @param lonRange - Longitude bounds [min, max]
 * @param latRange - Latitude bounds [min, max]
 * @returns A function that transforms (lat, lon) to pixel coordinates, or null if transformation is not possible
 */
export function useCoordinateTransformation({
  proj,
  primaryDataLayer,
  lonRange,
  latRange,
}: UseCoordinateTransformationParams): ((lat: number, lon: number) => PixelCoords) | null {
  return useMemo(() => {
    if (!primaryDataLayer || !proj) return null;

    const { width, height } = primaryDataLayer.dimensions;
    const [lonMin, lonMax] = lonRange;
    const [latMin, latMax] = latRange;

    try {
      // Calculate affine transformation matrix coefficients
      // This maps from projected coordinates to pixel coordinates
      const c_tl = proj.forward([lonMin, latMax]); // Top-left corner in projected coords
      const c_tr = proj.forward([lonMax, latMax]); // Top-right corner
      const c_bl = proj.forward([lonMin, latMin]); // Bottom-left corner

      // Affine transformation matrix: [a b e]
      //                               [c d f]
      const a = (c_tr[0] - c_tl[0]) / width;
      const b = (c_tr[1] - c_tl[1]) / width;
      const c = (c_bl[0] - c_tl[0]) / height;
      const d = (c_bl[1] - c_tl[1]) / height;
      const e = c_tl[0];
      const f = c_tl[1];

      // Check if transformation is singular (non-invertible)
      const determinant = a * d - b * c;
      if (Math.abs(determinant) < 1e-9) {
        logger.warn('Coordinate transformation matrix is singular (determinant ≈ 0)');
        return null;
      }

      // Return the transformation function
      return (lat: number, lon: number): PixelCoords => {
        try {
          // Transform lat/lon to projected coordinates
          const [projX, projY] = proj.forward([lon, lat]);

          // Apply inverse affine transformation to get pixel coordinates
          const u = (d * (projX - e) - c * (projY - f)) / determinant;
          const v = (a * (projY - f) - b * (projX - e)) / determinant;

          const pixelX = Math.round(u);
          const pixelY = Math.round(v);

          // Check if pixel coordinates are within bounds
          if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
            return { x: pixelX, y: pixelY };
          }

          return null; // Out of bounds
        } catch (error) {
          logger.warn('Error transforming coordinates:', error);
          return null;
        }
      };
    } catch (error) {
      logger.warn('Error setting up coordinate transformation:', error);
      return null;
    }
  }, [proj, primaryDataLayer, lonRange, latRange]);
}
