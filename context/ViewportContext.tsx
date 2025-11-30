import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import proj4 from 'proj4';
import type { ViewState, PixelCoords, DataLayer, BaseMapLayer } from '../types';
import { useCoordinateTransformation } from '../hooks/useCoordinateTransformation';
import {
    DEFAULT_LAT_RANGE,
    DEFAULT_LON_RANGE,
} from '../config/defaults';

const LAT_RANGE: [number, number] = DEFAULT_LAT_RANGE;
const LON_RANGE: [number, number] = DEFAULT_LON_RANGE;

interface ViewportContextType {
    // State
    viewState: ViewState | null;
    showGraticule: boolean;
    graticuleDensity: number;
    graticuleLabelFontSize: number;
    showGrid: boolean;
    gridSpacing: number;
    gridColor: string;
    latRange: [number, number];
    lonRange: [number, number];

    // Derived state (from baseMapLayer and primaryDataLayer)
    proj: proj4.ProjectionDefinition | null;
    coordinateTransformer: ((lat: number, lon: number) => PixelCoords) | null;
    snapToCellCorner: ((projCoords: [number, number]) => [number, number] | null) | null;
    calculateRectangleFromCellCorners: ((corner1: [number, number], corner2: [number, number]) => RectangleData | null) | null;

    // Operations
    setViewState: React.Dispatch<React.SetStateAction<ViewState | null>>;
    setShowGraticule: React.Dispatch<React.SetStateAction<boolean>>;
    setGraticuleDensity: React.Dispatch<React.SetStateAction<number>>;
    setGraticuleLabelFontSize: React.Dispatch<React.SetStateAction<number>>;
    setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
    setGridSpacing: React.Dispatch<React.SetStateAction<number>>;
    setGridColor: React.Dispatch<React.SetStateAction<string>>;
}

type RectangleData = { center: [number, number]; width: number; height: number; rotation: number };

const ViewportContext = createContext<ViewportContextType | null>(null);

export const useViewportContext = () => {
    const context = useContext(ViewportContext);
    if (!context) {
        throw new Error('useViewportContext must be used within a ViewportProvider');
    }
    return context;
};

interface ViewportProviderProps {
    children: React.ReactNode;
    // Dependencies from other contexts
    baseMapLayer?: BaseMapLayer;
    primaryDataLayer?: DataLayer;
}

export const ViewportProvider: React.FC<ViewportProviderProps> = ({
    children,
    baseMapLayer,
    primaryDataLayer,
}) => {
    // Viewport state
    const [viewState, setViewState] = useState<ViewState | null>(null);

    // Graticule settings
    const [showGraticule, setShowGraticule] = useState<boolean>(false);
    const [graticuleDensity, setGraticuleDensity] = useState(1.0);
    const [graticuleLabelFontSize, setGraticuleLabelFontSize] = useState(14);

    // Grid settings
    const [showGrid, setShowGrid] = useState<boolean>(false);
    const [gridSpacing, setGridSpacing] = useState<number>(200);
    const [gridColor, setGridColor] = useState<string>('#ffffff80');

    // Derived: projection from baseMapLayer
    const proj = useMemo(
        () => (baseMapLayer ? proj4(baseMapLayer.vrt.srs) : null),
        [baseMapLayer]
    );

    // Coordinate transformer
    const coordinateTransformer = useCoordinateTransformation({
        proj,
        primaryDataLayer,
        lonRange: LON_RANGE,
        latRange: LAT_RANGE,
    });

    // Function to snap projected coordinates to the nearest data cell corner
    const snapToCellCorner = useMemo(() => {
        if (!primaryDataLayer || !proj) return null;
        const { width, height } = primaryDataLayer.dimensions;
        const [lonMin, lonMax] = LON_RANGE;
        const [latMin, latMax] = LAT_RANGE;

        const c_tl = proj.forward([lonMin, latMax]);
        const c_tr = proj.forward([lonMax, latMax]);
        const c_bl = proj.forward([lonMin, latMin]);
        const a = (c_tr[0] - c_tl[0]) / width;
        const b = (c_tr[1] - c_tl[1]) / width;
        const c = (c_bl[0] - c_tl[0]) / height;
        const d = (c_bl[1] - c_tl[1]) / height;
        const e = c_tl[0];
        const f = c_tl[1];
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
        const [lonMin, lonMax] = LON_RANGE;
        const [latMin, latMax] = LAT_RANGE;

        const c_tl = proj.forward([lonMin, latMax]);
        const c_tr = proj.forward([lonMax, latMax]);
        const c_bl = proj.forward([lonMin, latMin]);
        const a = (c_tr[0] - c_tl[0]) / width;
        const b = (c_tr[1] - c_tl[1]) / width;
        const c = (c_bl[0] - c_tl[0]) / height;
        const d = (c_bl[1] - c_tl[1]) / height;
        const e = c_tl[0];
        const f = c_tl[1];
        const determinant = a * d - b * c;
        if (Math.abs(determinant) < 1e-9) return null;

        return (corner1: [number, number], corner2: [number, number]): RectangleData | null => {
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
                const centerX = (projCorner1[0] + projCorner3[0]) / 2;
                const centerY = (projCorner1[1] + projCorner3[1]) / 2;

                // Calculate width and height in projected coords
                const rectWidth = Math.sqrt(
                    Math.pow(projCorner2[0] - projCorner1[0], 2) + Math.pow(projCorner2[1] - projCorner1[1], 2)
                );
                const rectHeight = Math.sqrt(
                    Math.pow(projCorner4[0] - projCorner1[0], 2) + Math.pow(projCorner4[1] - projCorner1[1], 2)
                );

                // Calculate rotation (angle of bottom edge)
                const rotation = Math.atan2(projCorner2[1] - projCorner1[1], projCorner2[0] - projCorner1[0]);

                return {
                    center: [centerX, centerY],
                    width: rectWidth,
                    height: rectHeight,
                    rotation,
                };
            } catch (error) {
                return null;
            }
        };
    }, [proj, primaryDataLayer]);

    const value: ViewportContextType = {
        // State
        viewState,
        showGraticule,
        graticuleDensity,
        graticuleLabelFontSize,
        showGrid,
        gridSpacing,
        gridColor,
        latRange: LAT_RANGE,
        lonRange: LON_RANGE,

        // Derived
        proj,
        coordinateTransformer,
        snapToCellCorner,
        calculateRectangleFromCellCorners,

        // Operations
        setViewState,
        setShowGraticule,
        setGraticuleDensity,
        setGraticuleLabelFontSize,
        setShowGrid,
        setGridSpacing,
        setGridColor,
    };

    return <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>;
};
