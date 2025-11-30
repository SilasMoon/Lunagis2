import { useMemo } from 'react';
import type { DataLayer, IlluminationLayer, DteCommsLayer, LpfCommsLayer } from '../types';
import { DEFAULT_LAT_RANGE, DEFAULT_LON_RANGE } from '../config/defaults';
import proj4 from 'proj4';

interface UseGridSnappingProps {
    primaryDataLayer: DataLayer | IlluminationLayer | DteCommsLayer | LpfCommsLayer | undefined;
    proj: proj4.Converter | null;
}

export const useGridSnapping = ({ primaryDataLayer, proj }: UseGridSnappingProps) => {
    // Function to snap projected coordinates to the nearest data cell corner
    const snapToCellCorner = useMemo(() => {
        if (!primaryDataLayer || !proj) return null;
        const { width, height } = primaryDataLayer.dimensions;
        const [lonMin, lonMax] = DEFAULT_LON_RANGE;
        const [latMin, latMax] = DEFAULT_LAT_RANGE;

        const c_tl = proj.forward([lonMin, latMax]); const c_tr = proj.forward([lonMax, latMax]);
        const c_bl = proj.forward([lonMin, latMin]);
        const a = (c_tr[0] - c_tl[0]) / width; const b = (c_tr[1] - c_tl[1]) / width;
        const c = (c_bl[0] - c_tl[0]) / height; const d = (c_bl[1] - c_tl[1]) / height;
        const e = c_tl[0]; const f = c_tl[1];
        const determinant = a * d - b * c;
        if (Math.abs(determinant) < 1e-9) return null;

        return (projCoords: [number, number]): [number, number] | null => {
            try {
                const [projX, projY] = projCoords;
                // Convert projected coords to cell coords (continuous values)
                const cellX = (d * (projX - e) - c * (projY - f)) / determinant;
                const cellY = (a * (projY - f) - b * (projX - e)) / determinant;

                // Round to nearest cell corner (integer coordinates)
                const snappedCellX = Math.round(cellX);
                const snappedCellY = Math.round(cellY);

                // Clamp to valid range
                const clampedCellX = Math.max(0, Math.min(width, snappedCellX));
                const clampedCellY = Math.max(0, Math.min(height, snappedCellY));

                // Convert back to projected coordinates
                const snappedProjX = a * clampedCellX + c * clampedCellY + e;
                const snappedProjY = b * clampedCellX + d * clampedCellY + f;

                return [snappedProjX, snappedProjY];
            } catch (error) {
                return null;
            }
        };
    }, [proj, primaryDataLayer]);

    // Helper function to calculate rectangle dimensions from cell corners
    const calculateRectangleFromCellCorners = useMemo(() => {
        if (!primaryDataLayer || !proj) return null;
        const { width, height } = primaryDataLayer.dimensions;
        const [lonMin, lonMax] = DEFAULT_LON_RANGE;
        const [latMin, latMax] = DEFAULT_LAT_RANGE;

        const c_tl = proj.forward([lonMin, latMax]); const c_tr = proj.forward([lonMax, latMax]);
        const c_bl = proj.forward([lonMin, latMin]);
        const a = (c_tr[0] - c_tl[0]) / width; const b = (c_tr[1] - c_tl[1]) / width;
        const c = (c_bl[0] - c_tl[0]) / height; const d = (c_bl[1] - c_tl[1]) / height;
        const e = c_tl[0]; const f = c_tl[1];
        const determinant = a * d - b * c;
        if (Math.abs(determinant) < 1e-9) return null;

        return (corner1: [number, number], corner2: [number, number]): { center: [number, number]; width: number; height: number; rotation: number } | null => {
            try {
                // Convert both corners to cell coordinates
                const cellX1 = (d * (corner1[0] - e) - c * (corner1[1] - f)) / determinant;
                const cellY1 = (a * (corner1[1] - f) - b * (corner1[0] - e)) / determinant;
                const cellX2 = (d * (corner2[0] - e) - c * (corner2[1] - f)) / determinant;
                const cellY2 = (a * (corner2[1] - f) - b * (corner2[0] - e)) / determinant;

                // Calculate cell dimensions
                const numCellsX = Math.abs(cellX2 - cellX1);
                const numCellsY = Math.abs(cellY2 - cellY1);

                // Calculate the four corners in projected coordinates
                const minCellX = Math.min(cellX1, cellX2);
                const minCellY = Math.min(cellY1, cellY2);
                const maxCellX = Math.max(cellX1, cellX2);
                const maxCellY = Math.max(cellY1, cellY2);

                const projCorner1 = [a * minCellX + c * minCellY + e, b * minCellX + d * minCellY + f];
                const projCorner2 = [a * maxCellX + c * minCellY + e, b * maxCellX + d * minCellY + f];
                const projCorner3 = [a * maxCellX + c * maxCellY + e, b * maxCellX + d * maxCellY + f];
                const projCorner4 = [a * minCellX + c * maxCellY + e, b * minCellX + d * maxCellY + f];

                // Calculate center
                const center: [number, number] = [
                    (projCorner1[0] + projCorner2[0] + projCorner3[0] + projCorner4[0]) / 4,
                    (projCorner1[1] + projCorner2[1] + projCorner3[1] + projCorner4[1]) / 4
                ];

                // Calculate width and height along the cell grid axes
                const widthVec = [a * numCellsX, b * numCellsX];
                const heightVec = [c * numCellsY, d * numCellsY];
                const rectWidth = Math.sqrt(widthVec[0] * widthVec[0] + widthVec[1] * widthVec[1]);
                const rectHeight = Math.sqrt(heightVec[0] * heightVec[0] + heightVec[1] * heightVec[1]);

                // Calculate rotation angle (angle of the x-axis of the cell grid)
                const rotation = Math.atan2(b, a) * 180 / Math.PI;

                return {
                    center,
                    width: rectWidth,
                    height: rectHeight,
                    rotation
                };
            } catch (error) {
                return null;
            }
        };
    }, [proj, primaryDataLayer]);

    return { snapToCellCorner, calculateRectangleFromCellCorners };
};
