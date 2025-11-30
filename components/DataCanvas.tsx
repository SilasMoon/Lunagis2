// Fix: Removed invalid file header which was causing parsing errors.
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { DataSlice, GeoCoordinates, ViewState, Layer, BaseMapLayer, DataLayer, AnalysisLayer, ImageLayer, TimeRange, Tool, Artifact, DteCommsLayer, LpfCommsLayer, Waypoint, PathArtifact, CircleArtifact, RectangleArtifact } from '../types';
import { getColorScale } from '../services/colormap';
import { ZoomControls } from './ZoomControls';
import { useAppContext } from '../context/AppContext';
import { OptimizedCanvasLRUCache } from '../utils/OptimizedLRUCache';
import { isDataGridLayer, isNightfallLayer, isDaylightFractionLayer, getLayerTimeIndex, isIlluminationLayer } from '../utils/layerHelpers';
import { useDebounce } from '../hooks/useDebounce';
import { WaypointEditModal } from './WaypointEditModal';
import { ActivityTimelineModal } from './ActivityTimelineModal';
import { ActivitySymbolsOverlay } from './ActivitySymbolsOverlay';
import { useToast } from './Toast';
import { logger } from '../utils/logger';
import { useWaypointOperations } from '../hooks/useWaypointOperations';
import { WaypointContextMenu } from './WaypointContextMenu';
import { exportMapAsImage } from '../utils/exportMap';
import { WebGLRenderer } from '../services/WebGLRenderer';
import * as d3 from 'd3-color';

// ========== WebGL Feature Flag ==========
// Set to true to enable GPU-accelerated rendering for data/illumination/analysis layers
// Set to false to use traditional Canvas 2D rendering
const USE_WEBGL_RENDERER = true;
// ========================================

/**
 * Fast hash function for custom colormap
 * Replaces expensive JSON.stringify for cache key generation
 */
const hashColormap = (colormap: Array<{ value: number; color: string }> | undefined): string => {
  if (!colormap || colormap.length === 0) return '';
  return colormap.map(s => `${s.value}:${s.color}`).join('|');
};

/**
 * Create a pre-computed color lookup table
 * This replaces 1M+ d3.color() calls with 256 calls + fast array lookups
 * @param colorScale - D3 color scale function
 * @param colorDomain - [min, max] value range
 * @param steps - Number of lookup table entries (default 256)
 * @returns Uint8ClampedArray with RGBA values (4 bytes per color)
 */
const createColorLookupTable = (
  colorScale: (value: number) => string,
  colorDomain: [number, number],
  steps: number = 256
): Uint8ClampedArray => {
  const table = new Uint8ClampedArray(steps * 4);
  const [minVal, maxVal] = colorDomain;
  const range = maxVal - minVal;

  for (let i = 0; i < steps; i++) {
    // Map lookup index to actual data value
    const value = minVal + (range * i) / (steps - 1);
    const color = d3.color(colorScale(value));

    if (color) {
      const rgb = color.rgb();
      const baseIdx = i * 4;
      table[baseIdx] = rgb.r;
      table[baseIdx + 1] = rgb.g;
      table[baseIdx + 2] = rgb.b;
      table[baseIdx + 3] = rgb.opacity * 255;
    }
  }

  return table;
};

/**
 * Calculate the Haversine distance between two geographic coordinates
 * @param coord1 - [lon, lat] in degrees
 * @param coord2 - [lon, lat] in degrees
 * @returns Distance in meters
 */
const calculateGeoDistance = (coord1: [number, number], coord2: [number, number]): number => {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-gray-400">
    <svg className="animate-spin h-10 w-10 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <p className="mt-4">Rendering...</p>
  </div>
);

/**
 * Draw a waypoint symbol on canvas
 * @param ctx - Canvas rendering context
 * @param symbol - Symbol type (from Lucide icon names)
 * @param x - X position
 * @param y - Y position
 * @param size - Size of the symbol
 */
const drawWaypointSymbol = (ctx: CanvasRenderingContext2D, symbol: string, x: number, y: number, size: number) => {
  ctx.save();
  ctx.translate(x, y);

  const halfSize = size / 2;

  switch (symbol) {
    case 'drill':
      // Draw drill as triangle pointing down
      ctx.beginPath();
      ctx.moveTo(0, -halfSize);
      ctx.lineTo(halfSize, halfSize);
      ctx.lineTo(-halfSize, halfSize);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'pause':
      // Draw pause as two vertical bars
      ctx.fillRect(-halfSize * 0.6, -halfSize, halfSize * 0.4, size);
      ctx.fillRect(halfSize * 0.2, -halfSize, halfSize * 0.4, size);
      break;

    case 'target':
      // Draw target as concentric circles
      ctx.beginPath();
      ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, halfSize * 0.6, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, halfSize * 0.2, 0, 2 * Math.PI);
      ctx.fill();
      break;

    case 'flag':
      // Draw flag as triangle on pole
      ctx.fillRect(-halfSize * 0.9, -halfSize, halfSize * 0.15, size * 1.5);
      ctx.beginPath();
      ctx.moveTo(-halfSize * 0.75, -halfSize);
      ctx.lineTo(halfSize * 0.5, -halfSize * 0.5);
      ctx.lineTo(-halfSize * 0.75, 0);
      ctx.closePath();
      ctx.fill();
      break;

    case 'satellite':
      // Draw satellite as square with antennas
      ctx.fillRect(-halfSize * 0.4, -halfSize * 0.4, size * 0.8, size * 0.8);
      ctx.strokeRect(-halfSize, -halfSize, halfSize * 0.3, halfSize * 0.3);
      ctx.strokeRect(halfSize * 0.7, halfSize * 0.7, halfSize * 0.3, halfSize * 0.3);
      break;

    case 'crosshair':
      // Draw crosshair as circle with cross
      ctx.beginPath();
      ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -halfSize);
      ctx.lineTo(0, halfSize);
      ctx.moveTo(-halfSize, 0);
      ctx.lineTo(halfSize, 0);
      ctx.stroke();
      break;

    case 'moon':
      // Draw moon as crescent
      ctx.beginPath();
      ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(halfSize * 0.3, -halfSize * 0.3, halfSize * 0.8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;

    case 'sunset':
      // Draw sunset as semi-circle with rays
      ctx.beginPath();
      ctx.arc(0, halfSize * 0.2, halfSize * 0.7, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * i) / 7 + Math.PI;
        ctx.beginPath();
        ctx.moveTo(0, halfSize * 0.2);
        ctx.lineTo(Math.cos(angle) * halfSize * 1.2, halfSize * 0.2 + Math.sin(angle) * halfSize * 1.2);
        ctx.stroke();
      }
      break;

    case 'message':
      // Draw message as speech bubble
      ctx.beginPath();
      ctx.roundRect(-halfSize * 0.8, -halfSize * 0.6, size * 1.6, size * 1.0, halfSize * 0.2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-halfSize * 0.3, halfSize * 0.4);
      ctx.lineTo(-halfSize * 0.5, halfSize * 1.0);
      ctx.lineTo(0, halfSize * 0.4);
      ctx.closePath();
      ctx.fill();
      break;

    case 'binoculars':
      // Draw binoculars as two circles connected
      ctx.beginPath();
      ctx.arc(-halfSize * 0.4, 0, halfSize * 0.5, 0, 2 * Math.PI);
      ctx.arc(halfSize * 0.4, 0, halfSize * 0.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-halfSize * 0.1, -halfSize * 0.3);
      ctx.lineTo(halfSize * 0.1, -halfSize * 0.3);
      ctx.stroke();
      break;

    default:
      // Default: draw simple circle
      ctx.beginPath();
      ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      break;
  }

  ctx.restore();
};

export const DataCanvas: React.FC = () => {
  const {
    layers, timeRange, currentDateIndex, setHoveredCoords, setSelectedPixel, onFinishArtifactCreation, onUpdateArtifact,
    clearHoverState, latRange, lonRange, showGraticule, graticuleDensity, graticuleLabelFontSize, proj, viewState,
    setViewState, primaryDataLayer, baseMapLayer, showGrid, gridSpacing, gridColor, activeTool, selectedCells,
    selectionColor, artifacts, artifactCreationMode, draggedInfo, setDraggedInfo, artifactDisplayOptions,
    isAppendingWaypoints, coordinateTransformer, snapToCellCorner, calculateRectangleFromCellCorners,
    setActiveArtifactId, setArtifacts, setSelectedCells, activeLayerId, onUpdateLayer, pathCreationOptions,
    activityDefinitions, activeArtifactId, setSelectedCellForPlot, selectedCellForPlot, registerCanvasCacheCleaner
  } = useAppContext();
  const { showError } = useToast();

  const timeIndex = currentDateIndex ?? 0;
  const debouncedTimeRange = timeRange;
  const isDataLoaded = !!primaryDataLayer || !!baseMapLayer;

  // Helper function to create default activities for new waypoints
  const createDefaultActivities = useCallback(() => {
    const dteComms = activityDefinitions.find(a => a.id === 'DTE_COMMS');
    const drive5 = activityDefinitions.find(a => a.id === 'DRIVE-5');

    return [
      {
        id: `act-${Date.now()}-${Math.random()}`,
        type: 'DTE_COMMS',
        duration: dteComms?.defaultDuration ?? 3600
      },
      {
        id: `act-${Date.now()}-${Math.random()}`,
        type: 'DRIVE-5',
        duration: drive5?.defaultDuration ?? 0
      },
    ];
  }, [activityDefinitions]);

  // Debounce non-critical rendering dependencies to reduce re-render frequency
  // Use short delay for pan/zoom (smooth interaction), longer for less critical changes
  const debouncedGraticuleDensity = useDebounce(graticuleDensity, 100);
  const debouncedShowGrid = useDebounce(showGrid, 50);
  const debouncedGridSpacing = useDebounce(gridSpacing, 100);

  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const dataCanvasRef = useRef<HTMLCanvasElement>(null);
  const artifactCanvasRef = useRef<HTMLCanvasElement>(null);
  const graticuleCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const webglRendererRef = useRef<WebGLRenderer | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  // Track current WebGL layer state to avoid recreating textures every frame
  const webglLayerStateRef = useRef<Map<string, { timeIndex: number; visible: boolean }>>(new Map());

  const [isRendering, setIsRendering] = useState(false);
  const [editingWaypoint, setEditingWaypoint] = useState<{ artifactId: string; waypoint: Waypoint } | null>(null);
  const [editingWaypointActivities, setEditingWaypointActivities] = useState<{ artifactId: string; waypoint: Waypoint } | null>(null);
  // LRU cache: max 50 canvases or 500MB, whichever is hit first
  // Using optimized doubly-linked list implementation for O(1) operations
  const offscreenCanvasCache = useRef(new OptimizedCanvasLRUCache(50, 500)).current;

  // Calculate combined bounds for all layers - defined before graticule cache to avoid initialization issues
  const combinedBounds = useMemo(() => {
    if (!primaryDataLayer && !baseMapLayer) return null;
    let dataProjBounds = null;
    if (primaryDataLayer && proj) {
      const [lonMin, lonMax] = lonRange; const [latMin, latMax] = latRange;
      const corners = [[lonMin, latMin], [lonMax, latMin], [lonMax, latMax], [lonMin, latMax]].map(c => proj.forward(c));
      dataProjBounds = {
        minX: Math.min(...corners.map(c => c[0])), maxX: Math.max(...corners.map(c => c[0])),
        minY: Math.min(...corners.map(c => c[1])), maxY: Math.max(...corners.map(c => c[1])),
      };
    }

    let baseMapProjBounds = null;
    if (baseMapLayer) {
      const gt = baseMapLayer.vrt.geoTransform;
      baseMapProjBounds = { minX: gt[0], maxX: gt[0] + baseMapLayer.vrt.width * gt[1], minY: gt[3] + baseMapLayer.vrt.height * gt[5], maxY: gt[3] };
    }

    if (dataProjBounds && baseMapProjBounds) return {
      minX: Math.min(dataProjBounds.minX, baseMapProjBounds.minX), maxX: Math.max(dataProjBounds.maxX, baseMapProjBounds.maxX),
      minY: Math.min(dataProjBounds.minY, baseMapProjBounds.minY), maxY: Math.max(dataProjBounds.maxY, baseMapProjBounds.maxY),
    };
    return dataProjBounds || baseMapProjBounds;
  }, [primaryDataLayer, baseMapLayer, proj, lonRange, latRange]);

  // Cache graticule projected points - only recalculates when layers/projection/density change
  const graticuleLinesCache = useMemo(() => {
    if (!proj || !combinedBounds || !debouncedGraticuleDensity || debouncedGraticuleDensity <= 0) return null;

    try {
      const { minX, maxX, minY, maxY } = combinedBounds;

      // Add padding to viewport bounds to include lines just outside view
      const padding = Math.max(maxX - minX, maxY - minY) * 0.1;
      const viewportBounds = {
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding
      };

      // Sample bounds to determine appropriate step size
      const samplePoints = [
        [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]
      ];
      const geoPoints = samplePoints.map(p => {
        try { return proj4('EPSG:4326', proj).inverse(p as [number, number]) as [number, number]; }
        catch (e) { return null; }
      }).filter((p): p is [number, number] => p !== null);

      let lonSpan = 360, latSpan = 180;
      let viewLonMin = -180, viewLonMax = 180, viewLatMin = -90, viewLatMax = 90;

      if (geoPoints.length > 0) {
        viewLonMin = Math.min(...geoPoints.map(p => p[0]));
        viewLonMax = Math.max(...geoPoints.map(p => p[0]));
        viewLatMin = Math.min(...geoPoints.map(p => p[1]));
        viewLatMax = Math.max(...geoPoints.map(p => p[1]));
        lonSpan = Math.abs(viewLonMax - viewLonMin);
        if (lonSpan > 180) lonSpan = 360 - lonSpan;
        latSpan = Math.abs(viewLatMax - viewLatMin);
      }

      const calcStep = (span: number) => {
        if (span <= 0) return 1;
        const r = span / (5 * debouncedGraticuleDensity);
        if (r <= 0) return 1;
        const p = Math.pow(10, Math.floor(Math.log10(r)));
        const m = r / p;
        if (m < 1.5) return p;
        if (m < 3.5) return 2 * p;
        if (m < 7.5) return 5 * p;
        return 10 * p;
      };

      const lonStep = calcStep(lonSpan);
      const latStep = calcStep(latSpan);

      // Adaptive point density based on visible span
      const calcPointCount = (span: number, isLon: boolean) => {
        // Fewer points when zoomed out, more when zoomed in
        if (span > 90) return isLon ? 20 : 40; // Very zoomed out
        if (span > 45) return isLon ? 30 : 60; // Zoomed out
        if (span > 20) return isLon ? 40 : 80; // Medium
        return isLon ? 50 : 100; // Zoomed in
      };

      const lonPointCount = calcPointCount(latSpan, true); // meridians span latitude
      const latPointCount = calcPointCount(lonSpan, false); // parallels span longitude

      // Helper to clip a line to the viewport bounds
      // Returns only the points that are reasonably close to the viewport
      const clipLineToViewport = (points: Array<[number, number]>) => {
        if (points.length === 0) return [];

        // Expanded bounds for clipping (5x viewport size to catch nearby segments)
        const clipMargin = Math.max(
          viewportBounds.maxX - viewportBounds.minX,
          viewportBounds.maxY - viewportBounds.minY
        ) * 2;

        const clipBounds = {
          minX: viewportBounds.minX - clipMargin,
          maxX: viewportBounds.maxX + clipMargin,
          minY: viewportBounds.minY - clipMargin,
          maxY: viewportBounds.maxY + clipMargin
        };

        const clippedPoints: Array<[number, number]> = [];

        for (const [x, y] of points) {
          // Only include points within reasonable distance of viewport
          if (x >= clipBounds.minX && x <= clipBounds.maxX &&
            y >= clipBounds.minY && y <= clipBounds.maxY) {
            clippedPoints.push([x, y]);
          }
        }

        return clippedPoints;
      };

      // Pre-calculate graticule lines, only if they intersect viewport
      const lonLines: Array<{ lon: number; points: Array<[number, number]> }> = [];
      const latLines: Array<{ lat: number; points: Array<[number, number]> }> = [];

      // Calculate longitude lines (meridians) - only in visible longitude range
      const lonStart = Math.floor(viewLonMin / lonStep) * lonStep;
      const lonEnd = Math.ceil(viewLonMax / lonStep) * lonStep;

      // Add padding to latitude range for meridian sampling
      const latPadding = Math.max(5, latSpan * 0.2); // At least 5° padding
      const meridianLatMin = Math.max(-90, viewLatMin - latPadding);
      const meridianLatMax = Math.min(90, viewLatMax + latPadding);

      console.log('Generating longitude lines:', {
        lonStart, lonEnd, lonStep, lonPointCount,
        viewLonMin, viewLonMax,
        meridianLatMin, meridianLatMax,
        viewLatMin, viewLatMax
      });

      for (let lon = lonStart; lon <= lonEnd; lon += lonStep) {
        if (lon < -180 || lon > 180) continue;

        const allPoints: Array<[number, number]> = [];

        // Sample the meridian ONLY in the visible latitude range (with padding)
        for (let i = 0; i <= lonPointCount; i++) {
          const lat = meridianLatMin + (i / lonPointCount) * (meridianLatMax - meridianLatMin);
          try {
            const pt = proj.forward([lon, lat]);
            if (isFinite(pt[0]) && isFinite(pt[1])) {
              allPoints.push([pt[0], pt[1]]);
            }
          } catch (err) {
            // Skip invalid points
          }
        }

        // Clip the line to viewport bounds to avoid extreme coordinates
        const clippedPoints = clipLineToViewport(allPoints);

        // Log details for first longitude line
        if (lon === lonStart) {
          console.log(`First lon line (${lon}°):`, {
            totalPoints: allPoints.length,
            clippedPoints: clippedPoints.length,
            firstPoint: allPoints[0],
            lastPoint: allPoints[allPoints.length - 1],
            firstClipped: clippedPoints[0],
            lastClipped: clippedPoints[clippedPoints.length - 1],
            viewportBounds
          });
        }

        // Only include lines that have clipped points
        if (clippedPoints.length >= 2) {
          lonLines.push({ lon, points: clippedPoints });
        }
      }

      // Calculate latitude lines (parallels) - only in visible latitude range
      const latStart = Math.floor(viewLatMin / latStep) * latStep;
      const latEnd = Math.ceil(viewLatMax / latStep) * latStep;

      for (let lat = latStart; lat <= latEnd; lat += latStep) {
        if (lat < -90 || lat > 90) continue;

        const allPoints: Array<[number, number]> = [];

        for (let i = 0; i <= latPointCount; i++) {
          const lon = -180 + (i / latPointCount) * 360;
          try {
            const pt = proj.forward([lon, lat]);
            if (isFinite(pt[0]) && isFinite(pt[1])) {
              allPoints.push([pt[0], pt[1]]);
            }
          } catch (err) {
            // Skip invalid points
          }
        }

        // Clip the line to viewport bounds
        const clippedPoints = clipLineToViewport(allPoints);

        // Only include lines that have clipped points
        if (clippedPoints.length >= 2) {
          latLines.push({ lat, points: clippedPoints });
        }
      }

      // Debug logging
      console.log('Graticule cache updated:', {
        lonLines: lonLines.length,
        latLines: latLines.length,
        lonStep,
        latStep,
        lonPointCount,
        latPointCount,
        viewBounds: { lonMin: viewLonMin, lonMax: viewLonMax, latMin: viewLatMin, latMax: viewLatMax }
      });

      return { lonLines, latLines, lonStep, latStep };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to calculate graticule: ${errorMessage}`, 'Graticule Error');
      return null;
    }
  }, [proj, combinedBounds, debouncedGraticuleDensity, showError]);

  const initialViewCalculated = useRef(false);

  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [initialViewState, setInitialViewState] = useState<ViewState | null>(null);
  const [hoveredArtifactId, setHoveredArtifactId] = useState<string | null>(null);
  const [hoveredWaypointInfo, setHoveredWaypointInfo] = useState<{ artifactId: string; waypointId: string } | null>(null);
  const [rectangleFirstCorner, setRectangleFirstCorner] = useState<[number, number] | null>(null);
  const [currentMouseProjCoords, setCurrentMouseProjCoords] = useState<[number, number] | null>(null);

  // Delete artifact handler
  const onDeleteArtifact = useCallback((artifactId: string) => {
    setArtifacts(prev => prev.filter(a => a.id !== artifactId));
  }, [setArtifacts]);

  // Add artifact handler
  const onAddArtifact = useCallback((artifact: Artifact) => {
    setArtifacts(prev => [...prev, artifact]);
  }, [setArtifacts]);

  // Waypoint context menu operations
  const {
    contextMenu,
    handleContextMenu,
    handleInsertWaypointAfter,
    handleDeleteWaypoint,
    handleDisconnectAfter,
    handleConnectToPath,
    availablePathsToConnect,
  } = useWaypointOperations({
    artifacts,
    hoveredWaypointInfo,
    onUpdateArtifact,
    onDeleteArtifact,
    onAddArtifact,
  });

  // Image layer transformation state
  const [imageLayerDragInfo, setImageLayerDragInfo] = useState<{
    layerId: string;
    handleType: 'center' | 'corner' | 'edge';
    handleIndex?: number; // 0-3 for corners or edges
    initialMouseProj: [number, number];
    initialPosition: [number, number];
    initialScaleX: number;
    initialScaleY: number;
    initialRotation: number;
  } | null>(null);

  // Clear rectangle first corner when exiting rectangle creation mode
  useEffect(() => {
    if (artifactCreationMode !== 'rectangle' && artifactCreationMode !== 'free_rectangle') {
      setRectangleFirstCorner(null);
    }
  }, [artifactCreationMode]);

  useEffect(() => {
    const canvas = graticuleCanvasRef.current;
    if (!combinedBounds || !canvas || (viewState && initialViewCalculated.current)) return;

    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;

    const projWidth = combinedBounds.maxX - combinedBounds.minX;
    const projHeight = combinedBounds.maxY - combinedBounds.minY;
    const scale = Math.min(clientWidth / projWidth, clientHeight / projHeight) * 0.95;
    const center: [number, number] = [combinedBounds.minX + projWidth / 2, combinedBounds.minY + projHeight / 2];

    const newInitialViewState = { center, scale };
    setInitialViewState(newInitialViewState);
    setViewState(newInitialViewState);
    initialViewCalculated.current = true;
  }, [combinedBounds, setViewState, viewState]);

  // Track layer IDs to detect when layers are added/removed (not just property changes)
  const layerIds = useMemo(() => layers.map(l => l.id).join(','), [layers]);
  useEffect(() => { initialViewCalculated.current = false; }, [layerIds]);

  // Register canvas cache cleaner with context on mount
  useEffect(() => {
    const cleaner = (layerId: string) => {
      // Remove all cache entries for the specified layer ID
      const allKeys = offscreenCanvasCache.keys();
      const keysToDelete = allKeys.filter(key => key.startsWith(`${layerId}-`));
      keysToDelete.forEach(key => offscreenCanvasCache.delete(key));
      console.log(`🗑️ Cleared ${keysToDelete.length} canvas cache entries for layer: ${layerId}`);
    };

    registerCanvasCacheCleaner(cleaner);

    return () => {
      registerCanvasCacheCleaner(null);
    };
  }, [registerCanvasCacheCleaner, offscreenCanvasCache]);

  // Initialize WebGL renderer (if enabled)
  useEffect(() => {
    if (!USE_WEBGL_RENDERER) return;

    if (webglCanvasRef.current && !webglRendererRef.current) {
      try {
        webglRendererRef.current = new WebGLRenderer(webglCanvasRef.current);
        console.log('✅ WebGL renderer initialized successfully');
        showError('GPU rendering enabled', 'success');
      } catch (error) {
        console.error('Failed to initialize WebGL renderer:', error);
        showError(
          `WebGL initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
          'Falling back to Canvas 2D. Set USE_WEBGL_RENDERER to false to suppress this message.',
          'error'
        );
      }
    }

    return () => {
      if (webglRendererRef.current) {
        webglRendererRef.current.dispose();
        webglRendererRef.current = null;
        console.log('🗑️ WebGL renderer disposed');
      }
    };
  }, [showError]);

  // Clear LazyDataset cache when layers become invisible to free memory
  useEffect(() => {
    layers.forEach(layer => {
      if (!layer.visible && 'lazyDataset' in layer && layer.lazyDataset) {
        // Clear cache for invisible layers to save memory
        const stats = layer.lazyDataset.getStats();
        if (stats.currentSize > 0) {
          console.log(`💾 Clearing LazyDataset cache for invisible layer: ${layer.name} (freeing ${stats.memoryUsageMB.toFixed(1)} MB)`);
          layer.lazyDataset.clearCache();
        }
      }
    });
  }, [layers]);

  // Update WebGL layer properties (opacity, colormap) without recreating textures
  useEffect(() => {
    if (!USE_WEBGL_RENDERER || !webglRendererRef.current) return;

    const renderer = webglRendererRef.current;

    layers.forEach(layer => {
      if (layer.visible && isDataGridLayer(layer)) {
        // Update opacity (cheap operation)
        renderer.updateLayerOpacity(layer.id, layer.opacity);

        // Update colormap (regenerates colormap texture, but not data texture)
        renderer.updateLayerColormap(layer.id, layer);
      }
    });
  }, [layers]);

  const canvasToProjCoords = useCallback((canvasX: number, canvasY: number): [number, number] | null => {
    const canvas = graticuleCanvasRef.current;
    if (!canvas || !viewState) return null;
    // Validate canvas has been properly sized before using dimensions
    if (canvas.width === 0 || canvas.height === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const { center, scale } = viewState;
    const projX = (canvasX * dpr - canvas.width / 2) / (scale * dpr) + center[0];
    const projY = -(canvasY * dpr - canvas.height / 2) / (scale * dpr) + center[1];
    return [projX, projY];
  }, [viewState]);

  // Helper function to check if clicking on an image layer handle
  const getImageLayerHandle = useCallback((projCoords: [number, number]): { layerId: string; handleType: 'center' | 'corner' | 'edge'; handleIndex?: number } | null => {
    try {
      if (!viewState || !activeLayerId || !projCoords) return null;
      const activeImageLayer = layers.find(l => l.id === activeLayerId && l.type === 'image');
      if (!activeImageLayer || activeImageLayer.type !== 'image') return null;

      const layer = activeImageLayer;
      if (!layer.originalWidth || !layer.originalHeight || !layer.scaleX || !layer.scaleY || !layer.position) return null;

      const displayWidth = layer.originalWidth * layer.scaleX;
      const displayHeight = layer.originalHeight * layer.scaleY;
      const handleSize = 12 / viewState.scale;

      // Transform point to layer's local coordinates
      const dx = projCoords[0] - layer.position[0];
      const dy = projCoords[1] - layer.position[1];
      const rotationRad = (layer.rotation * Math.PI) / 180;
      const cosR = Math.cos(-rotationRad);
      const sinR = Math.sin(-rotationRad);
      const localX = dx * cosR - dy * sinR;
      const localY = dx * sinR + dy * cosR;

      // Check center handle
      if (Math.abs(localX) < handleSize && Math.abs(localY) < handleSize) {
        return { layerId: layer.id, handleType: 'center' };
      }

      // Check corner handles
      const corners = [
        [-displayWidth / 2, -displayHeight / 2],
        [displayWidth / 2, -displayHeight / 2],
        [displayWidth / 2, displayHeight / 2],
        [-displayWidth / 2, displayHeight / 2]
      ];
      for (let i = 0; i < corners.length; i++) {
        const [cx, cy] = corners[i];
        if (Math.abs(localX - cx) < handleSize && Math.abs(localY - cy) < handleSize) {
          return { layerId: layer.id, handleType: 'corner', handleIndex: i };
        }
      }

      // Check edge handles
      const edges = [
        [0, -displayHeight / 2],
        [displayWidth / 2, 0],
        [0, displayHeight / 2],
        [-displayWidth / 2, 0]
      ];
      for (let i = 0; i < edges.length; i++) {
        const [ex, ey] = edges[i];
        if (Math.abs(localX - ex) < handleSize && Math.abs(localY - ey) < handleSize) {
          return { layerId: layer.id, handleType: 'edge', handleIndex: i };
        }
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to get image layer handle: ${errorMessage}`, 'Image Layer Error');
      return null;
    }
  }, [viewState, layers, activeLayerId, showError]);

  // Attach wheel event listener with passive: false to allow preventDefault()
  // Keep viewState ref updated for event handlers
  const viewStateRef = useRef(viewState);
  useEffect(() => { viewStateRef.current = viewState; }, [viewState]);

  // Attach wheel event listener with passive: false to allow preventDefault()
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const currentViewState = viewStateRef.current;
      if (!currentViewState) return;

      // Check if the wheel event originated from inside a modal
      const target = e.target as HTMLElement;
      if (target && target.closest('[data-modal="true"]')) {
        return; // Let the modal handle scrolling
      }

      // Prevent default scrolling behavior
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      // Inline canvasToProjCoords logic to avoid dependency
      const canvas = graticuleCanvasRef.current;
      if (!canvas || canvas.width === 0 || canvas.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const { center, scale } = currentViewState;
      const projX = (offsetX * dpr - canvas.width / 2) / (scale * dpr) + center[0];
      const projY = -(offsetY * dpr - canvas.height / 2) / (scale * dpr) + center[1];
      const mouseProjBefore = [projX, projY];

      const zoomFactor = 1 - e.deltaY * 0.001;
      const newScale = currentViewState.scale * zoomFactor;

      const newCenter: [number, number] = [
        mouseProjBefore[0] - ((offsetX) * dpr - container.offsetWidth * dpr / 2) / (newScale * dpr),
        mouseProjBefore[1] + ((offsetY) * dpr - container.offsetHeight * dpr / 2) / (newScale * dpr)
      ];
      setViewState({ scale: newScale, center: newCenter });
    };

    // Register with passive: false to allow preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [setViewState]); // Only re-run if setViewState changes (stable)

  useEffect(() => {
    const canvases = [baseCanvasRef.current, dataCanvasRef.current, graticuleCanvasRef.current];
    if (canvases.some(c => !c) || !viewState) return;
    if (!isDataLoaded) return;

    setIsRendering(true);
    const renderStartTime = performance.now();

    const [baseCanvas, dataCanvas, graticuleCanvas] = canvases as HTMLCanvasElement[];
    const dpr = window.devicePixelRatio || 1;

    [baseCanvas, dataCanvas, graticuleCanvas].forEach(canvas => {
      if (!canvas.parentElement) return; // Guard against null parentElement
      const { clientWidth, clientHeight } = canvas.parentElement;
      canvas.width = clientWidth * dpr; canvas.height = clientHeight * dpr;
    });

    const baseCtx = baseCanvas.getContext('2d');
    const dataCtx = dataCanvas.getContext('2d');
    const gratCtx = graticuleCanvas.getContext('2d');
    if (!baseCtx || !dataCtx || !gratCtx) return; // Guard against null contexts
    const contexts = [baseCtx, dataCtx, gratCtx];

    const { center, scale } = viewState;
    contexts.forEach(ctx => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.save();
      ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
      const effectiveScale = scale * dpr; ctx.scale(effectiveScale, -effectiveScale);
      ctx.translate(-center[0], -center[1]); ctx.imageSmoothingEnabled = false;
    });

    // --- Render Layers ---
    layers.forEach(layer => {
      if (!layer.visible) return;

      // Skip WebGL-compatible layers if WebGL renderer is enabled
      if (USE_WEBGL_RENDERER && webglRendererRef.current && isDataGridLayer(layer)) {
        return; // Will be rendered by WebGL
      }

      if (layer.type === 'basemap') {
        const gt = layer.vrt.geoTransform;
        baseCtx.save(); baseCtx.globalAlpha = layer.opacity;
        baseCtx.transform(gt[1], gt[4], gt[2], gt[5], gt[0], gt[3]);
        baseCtx.drawImage(layer.image, 0, 0);
        baseCtx.restore();
      }
      else if (layer.type === 'image') {
        // Render image layer with transformation
        baseCtx.save();
        baseCtx.globalAlpha = layer.opacity;

        // Move to the image position
        baseCtx.translate(layer.position[0], layer.position[1]);

        // Apply rotation
        const rotationRad = (layer.rotation * Math.PI) / 180;
        baseCtx.rotate(rotationRad);

        // Flip Y-axis back since the global context has inverted Y
        baseCtx.scale(1, -1);

        // Apply scaling
        const displayWidth = layer.originalWidth * layer.scaleX;
        const displayHeight = layer.originalHeight * layer.scaleY;

        // Draw image centered at position
        baseCtx.drawImage(
          layer.image,
          -displayWidth / 2,
          -displayHeight / 2,
          displayWidth,
          displayHeight
        );

        baseCtx.restore();
      }
      else if (isDataGridLayer(layer) && proj) {
        let cacheKey: string;
        const invertedStr = !!layer.colormapInverted;
        let baseKey: string;

        if (isDaylightFractionLayer(layer) && debouncedTimeRange) {
          baseKey = `${layer.id}-${debouncedTimeRange.start}-${debouncedTimeRange.end}-${layer.colormap}-${invertedStr}`;
        } else {
          baseKey = `${layer.id}-${timeIndex}-${layer.colormap}-${invertedStr}-${layer.range.min}-${layer.range.max}`;
          if (isNightfallLayer(layer)) {
            baseKey += `-${layer.params.clipValue}`;
          }
        }
        if (layer.colormap === 'Custom') {
          baseKey += `-${hashColormap(layer.customColormap)}`;
        }
        // Include transparency thresholds in cache key
        if (layer.transparencyLowerThreshold !== undefined) {
          baseKey += `-lt${layer.transparencyLowerThreshold}`;
        }
        if (layer.transparencyUpperThreshold !== undefined) {
          baseKey += `-ut${layer.transparencyUpperThreshold}`;
        }
        cacheKey = baseKey;

        let offscreenCanvas = offscreenCanvasCache.get(cacheKey);

        if (!offscreenCanvas) {
          // Handle lazy loading or traditional dataset
          const actualTimeIndex = getLayerTimeIndex(layer, timeIndex);
          let slice: number[][] | undefined;
          let flatSlice: Float32Array | undefined;

          if ('lazyDataset' in layer && layer.lazyDataset) {
            // Lazy loading: check cache first
            flatSlice = layer.lazyDataset.getCachedSlice(actualTimeIndex);

            if (!flatSlice) {
              // Slice not yet loaded - trigger async load
              layer.lazyDataset.getSlice(actualTimeIndex).then(() => {
                // Data is now in cache, invalidate canvas cache to trigger re-render
                offscreenCanvasCache.delete(cacheKey);
                // Force re-render (hacky but needed if state doesn't change)
                setIsRendering(prev => !prev);
              }).catch(err => {
                if (err.message && err.message.includes('cancelled')) {
                  // Ignore cancelled requests (due to debouncing)
                  return;
                }
                console.error('Failed to load lazy slice:', err);
              });
              // Skip rendering this frame
              return;
            }
          } else {
            // Traditional dataset: synchronous access
            slice = layer.dataset[actualTimeIndex];
            if (!slice) return;
          }

          const { width, height } = layer.dimensions;
          offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = width; offscreenCanvas.height = height;
          const offscreenCtx = offscreenCanvas.getContext('2d')!;

          let colorDomain: [number, number];
          const isThreshold = layer.colormap === 'Custom';

          if (isNightfallLayer(layer)) {
            colorDomain = [layer.range.min, layer.params.clipValue ?? layer.range.max];
          } else {
            colorDomain = [layer.range.min, layer.range.max];
          }

          const colorScale = getColorScale(
            layer.colormap,
            colorDomain,
            layer.colormapInverted,
            layer.customColormap,
            isThreshold,
            layer.divergingThresholdConfig
          );
          const imageData = offscreenCtx.createImageData(width, height);

          // Use Uint32Array view for faster pixel manipulation (little-endian: ABGR)
          const data32 = new Uint32Array(imageData.data.buffer);

          // Pre-compute color lookup table (256 colors)
          // Format as Uint32 for direct assignment: 0xAABBGGRR (little-endian)
          const colorLUT32 = new Uint32Array(256);
          const tempLUT = createColorLookupTable(colorScale, colorDomain, 256);
          for (let i = 0; i < 256; i++) {
            const r = tempLUT[i * 4];
            const g = tempLUT[i * 4 + 1];
            const b = tempLUT[i * 4 + 2];
            const a = tempLUT[i * 4 + 3];
            // Pack into 32-bit integer (ABGR for little-endian)
            colorLUT32[i] = (a << 24) | (b << 16) | (g << 8) | r;
          }

          const [minVal, maxVal] = colorDomain;
          const valueRange = maxVal - minVal;
          const invValueRange = valueRange !== 0 ? 1 / valueRange : 0;

          // Optimized rendering loop
          if (flatSlice) {
            // Render from Float32Array (flat)
            for (let i = 0; i < width * height; i++) {
              const value = flatSlice[i];

              // Map value to lookup table index (0-255)
              let normalized = (value - minVal) * invValueRange;
              // Fast clamp
              if (normalized < 0) normalized = 0;
              if (normalized > 1) normalized = 1;

              const lutIdx = (normalized * 255) | 0; // Fast floor
              let pixel = colorLUT32[lutIdx];

              // Apply transparency thresholds
              if (layer.transparencyLowerThreshold !== undefined && value <= layer.transparencyLowerThreshold) {
                pixel = 0; // Transparent
              } else if (layer.transparencyUpperThreshold !== undefined && value >= layer.transparencyUpperThreshold) {
                pixel = 0; // Transparent
              }

              data32[i] = pixel;
            }
          } else if (slice) {
            // Render from number[][] (legacy)
            let i = 0;
            for (let y = 0; y < height; y++) {
              const row = slice[y];
              for (let x = 0; x < width; x++) {
                const value = row[x];

                let normalized = (value - minVal) * invValueRange;
                if (normalized < 0) normalized = 0;
                if (normalized > 1) normalized = 1;

                const lutIdx = (normalized * 255) | 0;
                let pixel = colorLUT32[lutIdx];

                if (layer.transparencyLowerThreshold !== undefined && value <= layer.transparencyLowerThreshold) {
                  pixel = 0;
                } else if (layer.transparencyUpperThreshold !== undefined && value >= layer.transparencyUpperThreshold) {
                  pixel = 0;
                }

                data32[i++] = pixel;
              }
            }
          }

          offscreenCtx.putImageData(imageData, 0, 0);
          offscreenCanvasCache.set(cacheKey, offscreenCanvas);
        }

        dataCtx.save(); dataCtx.globalAlpha = layer.opacity;

        // For layers with projected coordinates (illumination or analysis with geospatial info), use them directly!
        // Geographic bounds are curved in polar projections - don't use them for transformation
        let c_tl, c_tr, c_bl;

        const hasGeospatialInfo = (isIlluminationLayer(layer) || layer.type === 'analysis') && layer.geospatial;

        if (hasGeospatialInfo) {
          // Use PROJECTED bounds directly (they form a rectangle in projected space)
          let { xMin, xMax, yMin, yMax } = layer.geospatial.projectedBounds;

          // Apply debug axis flips in PROJECTED space (only for illumination layers)
          if (isIlluminationLayer(layer) && layer.debugFlipX) {
            [xMin, xMax] = [xMax, xMin];
          }
          if (isIlluminationLayer(layer) && layer.debugFlipY) {
            [yMin, yMax] = [yMax, yMin];
          }

          // Corners in projected space (no conversion needed!)
          c_tl = [xMin, yMax];  // Top-left
          c_tr = [xMax, yMax];  // Top-right
          c_bl = [xMin, yMin];  // Bottom-left

          console.log('Layer with geospatial transform (PROJECTED):', {
            layerType: layer.type,
            layerName: layer.name,
            projectedBounds: { xMin, xMax, yMin, yMax },
            flips: isIlluminationLayer(layer) ? { flipX: layer.debugFlipX, flipY: layer.debugFlipY } : undefined,
            canvasSize: { width: offscreenCanvas.width, height: offscreenCanvas.height },
            projCorners: { tl: c_tl, tr: c_tr, bl: c_bl }
          });
        } else {
          // For other layers, use geographic bounds and convert to projected
          let layerLonMin, layerLonMax, layerLatMin, layerLatMax;
          [layerLonMin, layerLonMax] = lonRange;
          [layerLatMin, layerLatMax] = latRange;

          c_tl = proj.forward([layerLonMin, layerLatMax]);
          c_tr = proj.forward([layerLonMax, layerLatMax]);
          c_bl = proj.forward([layerLonMin, layerLatMin]);
        }

        // Compute affine transformation matrix from 3 corners
        const a = (c_tr[0] - c_tl[0]) / offscreenCanvas.width;
        const b = (c_tr[1] - c_tl[1]) / offscreenCanvas.width;
        const c = (c_bl[0] - c_tl[0]) / offscreenCanvas.height;
        const d = (c_bl[1] - c_tl[1]) / offscreenCanvas.height;
        const e = c_tl[0];
        const f = c_tl[1];

        if (hasGeospatialInfo) {
          console.log('Transform matrix:', { a, b, c, d, e, f });
        }

        dataCtx.transform(a, b, c, d, e, f);
        dataCtx.drawImage(offscreenCanvas, 0, 0);
        dataCtx.restore();
      }
    });

    const { clientWidth, clientHeight } = graticuleCanvas;
    const p_tl = canvasToProjCoords(0, 0);
    const p_br = canvasToProjCoords(clientWidth * (window.devicePixelRatio || 1), clientHeight * (window.devicePixelRatio || 1));

    if (p_tl && p_br) {
      const [projXMin, projYMin] = [p_tl[0], p_br[1]];
      const [projXMax, projYMax] = [p_br[0], p_tl[1]];

      // --- Render Grid Overlay ---
      if (debouncedShowGrid) {
        gratCtx.strokeStyle = gridColor;
        gratCtx.lineWidth = 0.8 / (scale * dpr);

        const startX = Math.ceil(projXMin / debouncedGridSpacing) * debouncedGridSpacing;
        const startY = Math.ceil(projYMin / debouncedGridSpacing) * debouncedGridSpacing;

        gratCtx.beginPath();
        for (let x = startX; x <= projXMax; x += debouncedGridSpacing) {
          gratCtx.moveTo(x, projYMin);
          gratCtx.lineTo(x, projYMax);
        }
        for (let y = startY; y <= projYMax; y += debouncedGridSpacing) {
          gratCtx.moveTo(projXMin, y);
          gratCtx.lineTo(projXMax, y);
        }
        gratCtx.stroke();
      }

      // --- Render Graticule from cached points ---
      if (showGraticule && proj && graticuleLinesCache) {
        const { lonLines, latLines, lonStep, latStep } = graticuleLinesCache;

        // Calculate anchor position for labels
        let anchorLon = 0, anchorLat = 0;
        try {
          const centerGeo = proj4('EPSG:4326', proj).inverse(viewState.center);
          anchorLon = Math.round(centerGeo[0] / lonStep) * lonStep;
          anchorLat = Math.round(centerGeo[1] / latStep) * latStep;
        } catch (e) {
          anchorLon = 0;
          anchorLat = 0;
        }

        // Label collision detection - track occupied label regions
        const labelRegions: Array<{ x: number; y: number; width: number; height: number }> = [];
        const minLabelDistance = 40; // Minimum distance in screen pixels between labels

        const checkLabelCollision = (x: number, y: number, width: number, height: number): boolean => {
          for (const region of labelRegions) {
            // Check if bounding boxes overlap with padding
            if (x < region.x + region.width + minLabelDistance &&
              x + width + minLabelDistance > region.x &&
              y < region.y + region.height + minLabelDistance &&
              y + height + minLabelDistance > region.y) {
              return true; // Collision detected
            }
          }
          return false; // No collision
        };

        const drawLabel = (text: string, p: [number, number]): boolean => {
          // Convert to screen coordinates for collision detection
          const screenX = (p[0] - viewState.center[0]) * scale * dpr + gratCtx.canvas.width / 2;
          const screenY = -(p[1] - viewState.center[1]) * scale * dpr + gratCtx.canvas.height / 2;

          const estimatedWidth = text.length * graticuleLabelFontSize * 0.6; // Rough estimate
          const estimatedHeight = graticuleLabelFontSize * 1.2;

          if (checkLabelCollision(screenX, screenY, estimatedWidth, estimatedHeight)) {
            return false; // Skip label due to collision
          }

          // Add to collision regions
          labelRegions.push({ x: screenX, y: screenY, width: estimatedWidth, height: estimatedHeight });

          // Draw the label
          gratCtx.save();
          gratCtx.translate(p[0], p[1]);
          const invScale = 1 / (scale * dpr);
          gratCtx.scale(invScale, -invScale);
          gratCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          gratCtx.font = `${graticuleLabelFontSize}px sans-serif`;
          gratCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
          gratCtx.lineWidth = 3;
          gratCtx.textAlign = 'left';
          gratCtx.textBaseline = 'top';
          gratCtx.strokeText(text, 5, 5);
          gratCtx.fillText(text, 5, 5);
          gratCtx.restore();
          return true;
        };

        let lonLinesDrawn = 0, latLinesDrawn = 0;

        // Draw all lines in white
        gratCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        gratCtx.lineWidth = 1.5 / (scale * dpr);

        // Draw longitude lines (meridians) from cached points
        for (const { lon, points } of lonLines) {
          if (points.length < 2) continue;

          gratCtx.beginPath();
          gratCtx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) {
            gratCtx.lineTo(points[i][0], points[i][1]);
          }
          gratCtx.stroke();
          lonLinesDrawn++;

          // Draw label if no collision
          try {
            const p = proj.forward([lon, anchorLat]);
            if (isFinite(p[0]) && isFinite(p[1]) && p[0] >= projXMin && p[0] <= projXMax && p[1] >= projYMin && p[1] <= projYMax) {
              drawLabel(`${lon.toFixed(1)}°E`, p);
            }
          } catch (e) { }
        }

        // Draw latitude lines (parallels) from cached points
        for (const { lat, points } of latLines) {
          if (points.length < 2) continue;

          gratCtx.beginPath();
          gratCtx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) {
            gratCtx.lineTo(points[i][0], points[i][1]);
          }
          gratCtx.stroke();
          latLinesDrawn++;

          // Draw label if no collision
          try {
            const p = proj.forward([anchorLon, lat]);
            if (isFinite(p[0]) && isFinite(p[1]) && p[0] >= projXMin && p[0] <= projXMax && p[1] >= projYMin && p[1] <= projYMax) {
              drawLabel(`${lat.toFixed(1)}°N`, p);
            }
          } catch (e) { }
        }

        // Debug logging (throttled to avoid spam)
        if (Math.random() < 0.02) { // Log ~2% of frames
          console.log('Graticule rendered:', {
            lonLinesDrawn,
            latLinesDrawn,
            labelsDrawn: labelRegions.length,
            fontSize: graticuleLabelFontSize
          });
        }
      }
    }

    // --- WebGL Rendering ---
    // OPTIMIZED: Only update layers that have changed to avoid recreating textures every frame
    if (USE_WEBGL_RENDERER && webglRendererRef.current && viewState) {
      try {
        const renderer = webglRendererRef.current;
        const currentState = webglLayerStateRef.current;

        // Get current visible WebGL layers
        const webglLayers = layers.filter(layer =>
          layer.visible && isDataGridLayer(layer)
        );

        // Build new state map
        const newState = new Map<string, { timeIndex: number; visible: boolean }>();
        webglLayers.forEach(layer => {
          const layerTimeIndex = getLayerTimeIndex(layer, timeIndex);
          newState.set(layer.id, { timeIndex: layerTimeIndex, visible: true });
        });

        // Find layers to remove (no longer visible or deleted)
        currentState.forEach((_, layerId) => {
          if (!newState.has(layerId)) {
            console.log(`🗑️ Removing WebGL layer: ${layerId}`);
            renderer.removeLayer(layerId);
          }
        });

        // Add or update layers
        webglLayers.forEach(layer => {
          const layerTimeIndex = getLayerTimeIndex(layer, timeIndex);
          const oldState = currentState.get(layer.id);

          if (!oldState) {
            // New layer - add it
            console.log(`✨ Adding WebGL layer: ${layer.name}`);
            renderer.addLayer(layer, layerTimeIndex);
          } else if (oldState.timeIndex !== layerTimeIndex) {
            // Time index changed - update texture
            console.log(`🔄 Updating WebGL layer time: ${layer.name} (t=${layerTimeIndex})`);
            renderer.updateLayerTime(layer.id, layer, layerTimeIndex);
          }
          // Note: Opacity, colormap updates are handled separately in a different effect
        });

        // Update state ref
        webglLayerStateRef.current = newState;

        // Render with WebGL
        const layerOrder = webglLayers.map(l => l.id);
        renderer.render(viewState, layerOrder);

        // Log memory stats occasionally
        if (Math.random() < 0.01) {
          const stats = renderer.getMemoryStats();
          console.log('WebGL Stats:', {
            memory: `${stats.textureMemoryMB.toFixed(1)} MB`,
            layers: stats.layerCount,
            pixels: `${(stats.totalPixels / 1000000).toFixed(1)}M`
          });
        }
      } catch (error) {
        console.error('WebGL rendering error:', error);
      }
    }

    contexts.forEach(ctx => ctx.restore());
    if (performance.now() - renderStartTime > 16) requestAnimationFrame(() => setIsRendering(false)); else setIsRendering(false);
  }, [layers, timeIndex, showGraticule, proj, viewState, isDataLoaded, latRange, lonRange, canvasToProjCoords, debouncedTimeRange, debouncedShowGrid, debouncedGridSpacing, gridColor, graticuleLinesCache, graticuleLabelFontSize]);

  // Helper function to get the 4 corners of a rectangle artifact in projected coordinates
  const getRectangleCorners = useCallback((artifact: RectangleArtifact): [number, number][] | null => {
    if (!primaryDataLayer || !proj) return null;

    const { width, height } = primaryDataLayer.dimensions;
    const [lonMin, lonMax] = lonRange;
    const [latMin, latMax] = latRange;

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

    try {
      // Convert center back to cell coordinates
      const centerCellX = (d * (artifact.center[0] - e) - c * (artifact.center[1] - f)) / determinant;
      const centerCellY = (a * (artifact.center[1] - f) - b * (artifact.center[0] - e)) / determinant;

      // Calculate dimensions in cell units
      // The stored width/height are in projected units, convert to cell units
      const cellWidth = artifact.width / Math.sqrt(a * a + b * b);
      const cellHeight = artifact.height / Math.sqrt(c * c + d * d);

      // Calculate 4 corners in cell coordinates
      const halfCellWidth = cellWidth / 2;
      const halfCellHeight = cellHeight / 2;

      // Round to integer cell coordinates to align with actual cell corners
      const minCellX = Math.round(centerCellX - halfCellWidth);
      const maxCellX = Math.round(centerCellX + halfCellWidth);
      const minCellY = Math.round(centerCellY - halfCellHeight);
      const maxCellY = Math.round(centerCellY + halfCellHeight);

      const corners: [number, number][] = [
        [minCellX, minCellY], // bottom-left
        [maxCellX, minCellY], // bottom-right
        [maxCellX, maxCellY], // top-right
        [minCellX, maxCellY], // top-left
      ];

      // Convert corners to projected coordinates
      return corners.map(([cx, cy]) => [
        a * cx + c * cy + e,
        b * cx + d * cy + f
      ]);
    } catch (error) {
      return null;
    }
  }, [primaryDataLayer, proj, lonRange, latRange]);

  // Effect for drawing artifacts
  useEffect(() => {
    const canvas = artifactCanvasRef.current;
    if (!canvas || !viewState || !proj) {
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    };

    const dpr = window.devicePixelRatio || 1;
    if (!canvas.parentElement) return; // Guard against null parentElement
    const { clientWidth, clientHeight } = canvas.parentElement;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // Guard against null context
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { center, scale } = viewState;
    ctx.save();
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
    const effectiveScale = scale * dpr;
    ctx.scale(effectiveScale, -effectiveScale);
    ctx.translate(-center[0], -center[1]);

    artifacts.forEach(artifact => {
      if (!artifact.visible) return;

      ctx.strokeStyle = artifact.color;
      ctx.fillStyle = artifact.color;

      if (artifact.type === 'circle') {
        const radiusInProjUnits = artifact.radius;
        ctx.lineWidth = artifact.thickness / effectiveScale;
        ctx.beginPath();
        ctx.arc(artifact.center[0], artifact.center[1], radiusInProjUnits, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (artifact.type === 'rectangle') {
        let corners: [number, number][] | null = null;

        // For free rectangles, use stored corners directly
        if (artifact.isFreeForm && artifact.corners) {
          corners = [
            artifact.corners.topLeft,
            artifact.corners.topRight,
            artifact.corners.bottomRight,
            artifact.corners.bottomLeft
          ];
        } else {
          // For grid-aligned rectangles, calculate corners
          corners = getRectangleCorners(artifact);
        }

        if (corners && corners.length === 4) {
          ctx.lineWidth = artifact.thickness / effectiveScale;
          ctx.beginPath();
          ctx.moveTo(corners[0][0], corners[0][1]);
          ctx.lineTo(corners[1][0], corners[1][1]);
          ctx.lineTo(corners[2][0], corners[2][1]);
          ctx.lineTo(corners[3][0], corners[3][1]);
          ctx.closePath();
          ctx.stroke();
        }
      } else if (artifact.type === 'path') {
        if (artifact.waypoints.length === 0) return;

        const projectedWaypoints = artifact.waypoints.map(wp => {
          // Validate geoPosition before projection
          if (!wp.geoPosition ||
            !Array.isArray(wp.geoPosition) ||
            wp.geoPosition.length !== 2 ||
            !isFinite(wp.geoPosition[0]) ||
            !isFinite(wp.geoPosition[1])) {
            logger.warn('DataCanvas: Invalid waypoint geoPosition during rendering', wp);
            return { ...wp, projPos: null };
          }
          try {
            const projPos = proj.forward(wp.geoPosition) as [number, number];
            // Validate projection result
            if (!projPos || !Array.isArray(projPos) || projPos.length !== 2 ||
              !isFinite(projPos[0]) || !isFinite(projPos[1])) {
              logger.warn('DataCanvas: Invalid projection result for waypoint', wp);
              return { ...wp, projPos: null };
            }
            return { ...wp, projPos };
          } catch (e) {
            logger.warn('DataCanvas: Failed to project waypoint during rendering', wp, e);
            return { ...wp, projPos: null };
          }
        }).filter(p => p.projPos !== null);

        // Draw segments
        if (projectedWaypoints.length > 1) {
          ctx.lineWidth = artifact.thickness / effectiveScale;
          ctx.beginPath();
          ctx.moveTo(projectedWaypoints[0].projPos![0], projectedWaypoints[0].projPos![1]);
          for (let i = 1; i < projectedWaypoints.length; i++) {
            ctx.lineTo(projectedWaypoints[i].projPos![0], projectedWaypoints[i].projPos![1]);
          }
          ctx.stroke();
        }

        // Draw waypoint dots and labels
        projectedWaypoints.forEach((pwp) => {
          // Draw waypoint dot
          ctx.beginPath();
          const dotRadius = (artifactDisplayOptions.waypointDotSize / 2) / effectiveScale;
          ctx.arc(pwp.projPos![0], pwp.projPos![1], dotRadius, 0, 2 * Math.PI);
          ctx.fill();

          // Draw waypoint label
          ctx.save();
          ctx.translate(pwp.projPos![0], pwp.projPos![1]);
          ctx.scale(1 / effectiveScale, -1 / effectiveScale);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${artifactDisplayOptions.labelFontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 2.5;
          ctx.strokeText(pwp.label, 0, - (artifactDisplayOptions.waypointDotSize / 2 + 2));
          ctx.fillText(pwp.label, 0, - (artifactDisplayOptions.waypointDotSize / 2 + 2));
          ctx.restore();
        });

        // Draw segment lengths
        if (artifactDisplayOptions.showSegmentLengths && projectedWaypoints.length > 1) {
          for (let i = 0; i < projectedWaypoints.length - 1; i++) {
            const pwp1 = projectedWaypoints[i];
            const pwp2 = projectedWaypoints[i + 1];

            const dx = pwp2.projPos![0] - pwp1.projPos![0];
            const dy = pwp2.projPos![1] - pwp1.projPos![1];
            const distance = Math.sqrt(dx * dx + dy * dy);

            const midPointProj: [number, number] = [(pwp1.projPos![0] + pwp2.projPos![0]) / 2, (pwp1.projPos![1] + pwp2.projPos![1]) / 2];
            const label = `${distance.toFixed(0)} m`;

            ctx.save();
            ctx.translate(midPointProj[0], midPointProj[1]);

            let angle = Math.atan2(pwp2.projPos![1] - pwp1.projPos![1], pwp2.projPos![0] - pwp1.projPos![0]);
            if (angle < -Math.PI / 2 || angle > Math.PI / 2) {
              angle += Math.PI;
            }

            ctx.rotate(angle);
            ctx.scale(1 / effectiveScale, -1 / effectiveScale);

            ctx.font = `${artifactDisplayOptions.labelFontSize}px sans-serif`;
            const textMetrics = ctx.measureText(label);
            const padding = 4;
            const textHeight = artifactDisplayOptions.labelFontSize;
            const rectHeight = textHeight + padding;
            const rectWidth = textMetrics.width + padding * 2;

            const verticalOffset = -(textHeight / 2 + 5);

            ctx.fillStyle = 'rgba(26, 32, 44, 0.7)';
            ctx.fillRect(-rectWidth / 2, verticalOffset - rectHeight / 2, rectWidth, rectHeight);

            ctx.fillStyle = '#fafafa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 0, verticalOffset);
            ctx.restore();
          }
        }
      }

      ctx.save();
      let centerPos = null;
      if (artifact.type === 'path') {
        // Validate first waypoint geoPosition before projecting
        if (artifact.waypoints.length > 0) {
          const firstWaypoint = artifact.waypoints[0];
          if (firstWaypoint.geoPosition &&
            Array.isArray(firstWaypoint.geoPosition) &&
            firstWaypoint.geoPosition.length === 2 &&
            isFinite(firstWaypoint.geoPosition[0]) &&
            isFinite(firstWaypoint.geoPosition[1])) {
            try {
              centerPos = proj.forward(firstWaypoint.geoPosition);
            } catch (e) {
              logger.warn('DataCanvas: Failed to project first waypoint for label', e);
            }
          }
        }
      } else {
        centerPos = artifact.center;
      }

      if (centerPos) {
        ctx.translate(centerPos[0], centerPos[1]);
        ctx.scale(1 / effectiveScale, -1 / effectiveScale);
        ctx.fillStyle = artifact.color;
        ctx.font = `bold ${artifactDisplayOptions.labelFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(artifact.name, 0, -10);
        ctx.fillText(artifact.name, 0, -10);
      }
      ctx.restore();
    });

    // Draw preview rectangle if in rectangle creation mode with first corner set
    if (rectangleFirstCorner && currentMouseProjCoords && artifactCreationMode === 'rectangle' && snapToCellCorner && calculateRectangleFromCellCorners && primaryDataLayer) {
      const snappedSecondCorner = snapToCellCorner(currentMouseProjCoords);
      if (snappedSecondCorner) {
        // Calculate rectangle parameters with correct orientation
        const rectParams = calculateRectangleFromCellCorners(rectangleFirstCorner, snappedSecondCorner);

        if (rectParams) {
          // Create a temporary artifact to get its corners
          const tempArtifact: RectangleArtifact = {
            id: 'preview',
            type: 'rectangle',
            name: 'Preview',
            visible: true,
            color: '#ff00ff',
            thickness: 2,
            center: rectParams.center,
            width: rectParams.width,
            height: rectParams.height,
            rotation: rectParams.rotation
          };

          const corners = getRectangleCorners(tempArtifact);

          if (corners && corners.length === 4) {
            ctx.save();
            ctx.strokeStyle = '#ff00ff';
            ctx.setLineDash([5 / effectiveScale, 5 / effectiveScale]);
            ctx.lineWidth = 2 / effectiveScale;

            // Draw preview rectangle as quadrilateral
            ctx.beginPath();
            ctx.moveTo(corners[0][0], corners[0][1]);
            ctx.lineTo(corners[1][0], corners[1][1]);
            ctx.lineTo(corners[2][0], corners[2][1]);
            ctx.lineTo(corners[3][0], corners[3][1]);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            // Draw corner markers at snapped positions
            ctx.save();
            ctx.fillStyle = '#ff00ff';
            const markerSize = 10 / effectiveScale;
            [rectangleFirstCorner, snappedSecondCorner].forEach(corner => {
              ctx.fillRect(corner[0] - markerSize / 2, corner[1] - markerSize / 2, markerSize, markerSize);
            });
            ctx.restore();
          }
        }
      }
    }

    // Draw preview for free rectangle creation
    if (rectangleFirstCorner && currentMouseProjCoords && artifactCreationMode === 'free_rectangle') {
      ctx.save();
      ctx.strokeStyle = '#ff00ff';
      ctx.setLineDash([5 / effectiveScale, 5 / effectiveScale]);
      ctx.lineWidth = 2 / effectiveScale;

      // Draw preview rectangle
      const [x1, y1] = rectangleFirstCorner;
      const [x2, y2] = currentMouseProjCoords;

      ctx.beginPath();
      ctx.rect(
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.abs(x2 - x1),
        Math.abs(y2 - y1)
      );
      ctx.stroke();
      ctx.restore();

      // Draw corner markers
      ctx.save();
      ctx.fillStyle = '#ff00ff';
      const markerSize = 10 / effectiveScale;
      ctx.fillRect(x1 - markerSize / 2, y1 - markerSize / 2, markerSize, markerSize);
      ctx.fillRect(x2 - markerSize / 2, y2 - markerSize / 2, markerSize, markerSize);
      ctx.restore();
    }

    // Draw path creation preview (dashed circle and preview line)
    if ((artifactCreationMode === 'path' || isAppendingWaypoints) && currentMouseProjCoords && proj && activeArtifactId) {
      const pathBeingDrawn = artifacts.find(a => a.id === activeArtifactId && a.type === 'path') as PathArtifact | undefined;

      if (pathBeingDrawn && pathBeingDrawn.waypoints.length > 0) {
        const lastWaypoint = pathBeingDrawn.waypoints[pathBeingDrawn.waypoints.length - 1];
        const lastWaypointProj = proj.forward(lastWaypoint.geoPosition);
        const maxLength = pathCreationOptions.defaultMaxSegmentLength;

        let previewEndProj = currentMouseProjCoords; // Default: preview to cursor
        let radiusProj: number | null = null;
        let distance = 0;
        let isOverLimit = false;

        // Calculate radius and bounded preview point if max length is set
        if (maxLength) {
          try {
            const lastWaypointGeo = lastWaypoint.geoPosition;

            // Use maxLength directly as radius in projected units (meters)
            // This matches how circle artifacts work - the projected coordinate system is in meters
            radiusProj = maxLength;

            // Calculate distance in projected space from last waypoint to cursor
            const dx = currentMouseProjCoords[0] - lastWaypointProj[0];
            const dy = currentMouseProjCoords[1] - lastWaypointProj[1];
            const distProj = Math.sqrt(dx * dx + dy * dy);

            // Check if cursor is beyond circle boundary in projected space
            isOverLimit = distProj > radiusProj;

            // Use Euclidean distance for display (matches segment length calculation)
            distance = distProj;

            // Always clamp preview to circle boundary if cursor is beyond it
            if (distProj > radiusProj) {
              // Clamp to circle boundary in direction of cursor
              const ratio = radiusProj / distProj;
              previewEndProj = [
                lastWaypointProj[0] + dx * ratio,
                lastWaypointProj[1] + dy * ratio
              ];
            }
          } catch (e) {
            // Ignore calculation errors, keep preview at cursor
          }
        }

        // Draw dashed preview line from last waypoint to preview end point
        ctx.save();
        ctx.strokeStyle = pathBeingDrawn.color;
        ctx.setLineDash([10 / effectiveScale, 10 / effectiveScale]);
        ctx.lineWidth = pathBeingDrawn.thickness / effectiveScale;
        ctx.beginPath();
        ctx.moveTo(lastWaypointProj[0], lastWaypointProj[1]);
        ctx.lineTo(previewEndProj[0], previewEndProj[1]);
        ctx.stroke();
        ctx.restore();

        // Draw preview waypoint dot at the end of the preview line
        ctx.save();
        ctx.fillStyle = pathBeingDrawn.color;
        ctx.globalAlpha = 0.6;
        const dotRadius = (artifactDisplayOptions.waypointDotSize / 2) / effectiveScale;
        ctx.beginPath();
        ctx.arc(previewEndProj[0], previewEndProj[1], dotRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();

        // Draw dashed circle around last waypoint if max segment length is set
        if (maxLength && radiusProj) {
          ctx.save();
          ctx.strokeStyle = pathBeingDrawn.color;
          ctx.setLineDash([15 / effectiveScale, 10 / effectiveScale]);
          ctx.lineWidth = 1 / effectiveScale;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(lastWaypointProj[0], lastWaypointProj[1], radiusProj, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore();

          // Display distance from last waypoint to cursor (at cursor, not at preview end)
          try {
            ctx.save();
            ctx.translate(currentMouseProjCoords[0], currentMouseProjCoords[1]);
            ctx.scale(1 / effectiveScale, -1 / effectiveScale);

            const label = `${distance.toFixed(0)} m`;
            ctx.fillStyle = isOverLimit ? '#ff5555' : '#ffffff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 2.5;
            ctx.strokeText(label, 10, -10);
            ctx.fillText(label, 10, -10);
            ctx.restore();
          } catch (e) {
            // Ignore projection errors
          }
        }
      }
    }

    // Draw interactive handles for active image layer
    if (activeLayerId) {
      const activeImageLayer = layers.find(l => l.id === activeLayerId && l.type === 'image');
      if (activeImageLayer && activeImageLayer.type === 'image') {
        const layer = activeImageLayer;
        const displayWidth = layer.originalWidth * layer.scaleX;
        const displayHeight = layer.originalHeight * layer.scaleY;

        ctx.save();
        ctx.translate(layer.position[0], layer.position[1]);
        const rotationRad = (layer.rotation * Math.PI) / 180;
        ctx.rotate(rotationRad);

        // Draw bounding box
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2 / effectiveScale;
        ctx.strokeRect(-displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);

        // Draw corner handles for scaling
        const handleSize = 12 / effectiveScale;
        ctx.fillStyle = '#00ffff';
        const corners = [
          [-displayWidth / 2, -displayHeight / 2], // Top-left
          [displayWidth / 2, -displayHeight / 2],  // Top-right
          [displayWidth / 2, displayHeight / 2],   // Bottom-right
          [-displayWidth / 2, displayHeight / 2]   // Bottom-left
        ];
        corners.forEach(corner => {
          ctx.fillRect(corner[0] - handleSize / 2, corner[1] - handleSize / 2, handleSize, handleSize);
        });

        // Draw edge handles for rotation
        ctx.fillStyle = '#ffff00';
        const edges = [
          [0, -displayHeight / 2],  // Top
          [displayWidth / 2, 0],    // Right
          [0, displayHeight / 2],   // Bottom
          [-displayWidth / 2, 0]    // Left
        ];
        edges.forEach(edge => {
          ctx.beginPath();
          ctx.arc(edge[0], edge[1], handleSize / 2, 0, 2 * Math.PI);
          ctx.fill();
        });

        // Draw center handle for moving
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(0, 0, handleSize / 2, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
      }
    }

    ctx.restore();
  }, [artifacts, viewState, proj, artifactDisplayOptions, rectangleFirstCorner, currentMouseProjCoords, artifactCreationMode, snapToCellCorner, calculateRectangleFromCellCorners, getRectangleCorners, primaryDataLayer, layers, activeLayerId, isAppendingWaypoints, activeArtifactId, pathCreationOptions]);


  useEffect(() => {
    const canvas = selectionCanvasRef.current;
    if (!canvas || !viewState || !primaryDataLayer || !proj) return;

    const dpr = window.devicePixelRatio || 1;
    if (!canvas.parentElement) return; // Guard against null parentElement
    const { clientWidth, clientHeight } = canvas.parentElement;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return; // Guard against null context
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (selectedCells.length === 0 && !selectedCellForPlot) return;

    ctx.save();
    const { center, scale } = viewState;
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
    const effectiveScale = scale * dpr;
    ctx.scale(effectiveScale, -effectiveScale);
    ctx.translate(-center[0], -center[1]);

    const [lonMin, lonMax] = lonRange;
    const [latMin, latMax] = latRange;
    const c_tl = proj.forward([lonMin, latMax]); const c_tr = proj.forward([lonMax, latMax]); const c_bl = proj.forward([lonMin, latMin]);
    const { width, height } = primaryDataLayer.dimensions;
    const a = (c_tr[0] - c_tl[0]) / width; const b = (c_tr[1] - c_tl[1]) / width;
    const c = (c_bl[0] - c_tl[0]) / height; const d = (c_bl[1] - c_tl[1]) / height;
    const e = c_tl[0]; const f = c_tl[1];

    // Draw selectedCellForPlot (layer management mode) with cyan color and thicker border
    if (selectedCellForPlot) {
      ctx.strokeStyle = '#00ffff'; // Cyan color
      ctx.lineWidth = 3 / (scale * dpr); // Thicker border
      ctx.beginPath();

      const u = selectedCellForPlot.x;
      const v = selectedCellForPlot.y;

      const p0 = [a * u + c * v + e, b * u + d * v + f];
      const p1 = [a * (u + 1) + c * v + e, b * (u + 1) + d * v + f];
      const p2 = [a * (u + 1) + c * (v + 1) + e, b * (u + 1) + d * (v + 1) + f];
      const p3 = [a * u + c * (v + 1) + e, b * u + d * (v + 1) + f];

      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();

      ctx.stroke();
    }

    // Draw selectedCells (measurement tool) with configured color
    if (selectedCells.length > 0) {
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 2 / (scale * dpr);
      ctx.beginPath();

      for (const cell of selectedCells) {
        const u = cell.x;
        const v = cell.y;

        const p0 = [a * u + c * v + e, b * u + d * v + f];
        const p1 = [a * (u + 1) + c * v + e, b * (u + 1) + d * v + f];
        const p2 = [a * (u + 1) + c * (v + 1) + e, b * (u + 1) + d * (v + 1) + f];
        const p3 = [a * u + c * (v + 1) + e, b * u + d * (v + 1) + f];

        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.closePath();
      }

      ctx.stroke();
    }

    ctx.restore();

  }, [selectedCells, selectionColor, selectedCellForPlot, viewState, primaryDataLayer, proj, lonRange, latRange]);

  // Helper function to convert lat/lon to pixel coordinates for any layer type
  const getPixelCoordsForLayer = useCallback((layer: Layer, lat: number, lon: number): { x: number; y: number } | null => {
    if (!proj) return null;

    // Check if this is an illumination or analysis layer with its own geospatial bounds
    const hasGeospatialInfo = (layer.type === 'illumination' || layer.type === 'analysis') && layer.geospatial;

    if (hasGeospatialInfo) {
      // Use the layer's projected bounds to compute pixel coordinates
      const { projectedBounds } = layer.geospatial;
      let { xMin, xMax, yMin, yMax } = projectedBounds;

      // Apply debug axis flips if this is an illumination layer
      if (layer.type === 'illumination') {
        if (layer.debugFlipX) {
          [xMin, xMax] = [xMax, xMin];
        }
        if (layer.debugFlipY) {
          [yMin, yMax] = [yMax, yMin];
        }
      }

      try {
        // Convert lat/lon to projected coordinates
        const [projX, projY] = proj.forward([lon, lat]);

        // Check if projected coords are within layer bounds
        if (projX < Math.min(xMin, xMax) || projX > Math.max(xMin, xMax) ||
          projY < Math.min(yMin, yMax) || projY > Math.max(yMin, yMax)) {
          return null; // Outside layer bounds
        }

        // Map projected coords to pixel coords using affine transformation
        const { width, height } = layer.dimensions;

        // Calculate pixel coordinates
        // X: interpolate between 0 and width based on position between xMin and xMax
        // Y: interpolate between 0 and height based on position between yMax and yMin (flipped for image coordinates)
        const pixelX = Math.round(((projX - xMin) / (xMax - xMin)) * width);
        const pixelY = Math.round(((yMax - projY) / (yMax - yMin)) * height);

        // Check bounds
        if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
          return { x: pixelX, y: pixelY };
        }

        return null; // Out of pixel bounds
      } catch (error) {
        console.warn('Error converting coordinates for illumination layer:', error);
        return null;
      }
    } else {
      // Use the standard coordinate transformer for regular data layers
      return coordinateTransformer ? coordinateTransformer(lat, lon) : null;
    }
  }, [proj, coordinateTransformer]);

  const onCellHover = useCallback((coords: GeoCoordinates) => {
    setHoveredCoords(coords);
    if (!coords) { setSelectedPixel(null); return; }

    // Find the topmost visible data layer
    const topDataLayer = [...layers].reverse().find(l =>
      l.visible && (l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms' || l.type === 'illumination')
    );

    if (!topDataLayer) {
      setSelectedPixel(null);
      return;
    }

    // Get pixel coordinates using the appropriate transformation for this layer
    const pixel = getPixelCoordsForLayer(topDataLayer, coords.lat, coords.lon);

    if (pixel) {
      setSelectedPixel({ ...pixel, layerId: topDataLayer.id });
    } else {
      setSelectedPixel(null);
    }
  }, [layers, setHoveredCoords, setSelectedPixel, getPixelCoordsForLayer]);

  const onMapClick = useCallback((coords: GeoCoordinates, projCoords: [number, number]) => {
    if (!coords) return;

    if (artifactCreationMode === 'path') {
      const pathBeingDrawn = artifacts.find(a => a.id === activeArtifactId && a.type === 'path') as PathArtifact | undefined;
      if (pathBeingDrawn) {
        // Add waypoint to existing path-in-progress
        let waypointGeoPosition: [number, number] = [coords.lon, coords.lat];

        // Clamp to max distance if configured
        const maxLength = pathCreationOptions.defaultMaxSegmentLength;
        if (maxLength && pathBeingDrawn.waypoints.length > 0) {
          const lastWaypoint = pathBeingDrawn.waypoints[pathBeingDrawn.waypoints.length - 1];
          const lastWaypointProj = proj.forward(lastWaypoint.geoPosition);

          // Calculate distance in projected space
          const dx = projCoords[0] - lastWaypointProj[0];
          const dy = projCoords[1] - lastWaypointProj[1];
          const distProj = Math.sqrt(dx * dx + dy * dy);

          // If beyond max distance, clamp to circle boundary
          if (distProj > maxLength) {
            const ratio = maxLength / distProj;
            const clampedProjCoords: [number, number] = [
              lastWaypointProj[0] + dx * ratio,
              lastWaypointProj[1] + dy * ratio
            ];
            // Convert back to geographic coordinates
            const clampedGeo = proj4('EPSG:4326', proj).inverse(clampedProjCoords);
            waypointGeoPosition = [clampedGeo[0], clampedGeo[1]];
          }
        }

        const newWaypoint: Waypoint = {
          id: `wp-${Date.now()}`,
          geoPosition: waypointGeoPosition,
          label: `WP${pathBeingDrawn.waypoints.length + 1}`,
          activities: createDefaultActivities(),
        };
        onUpdateArtifact(activeArtifactId, { waypoints: [...pathBeingDrawn.waypoints, newWaypoint] });
      } else {
        // First click: create the path
        // Find the next available path number
        const pathNumbers = artifacts
          .filter(a => a.type === 'path')
          .map(a => {
            const match = a.id.match(/^path-(\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
          });
        const nextPathNumber = pathNumbers.length > 0 ? Math.max(...pathNumbers) + 1 : 1;
        const newId = `path-${nextPathNumber}`;

        const newWaypoint: Waypoint = {
          id: `wp-${Date.now()}`,
          geoPosition: [coords.lon, coords.lat],
          label: 'WP1',
          activities: createDefaultActivities(),
        };
        const newArtifact: PathArtifact = { id: newId, type: 'path', name: `Path ${nextPathNumber}`, visible: true, color: '#ffff00', thickness: 2, waypoints: [newWaypoint] };
        setArtifacts(prev => [...prev, newArtifact]);
        setActiveArtifactId(newId);
      }
    } else if (artifactCreationMode) { // Circle or Rectangle
      const newId = `${artifactCreationMode}-${Date.now()}`;
      if (artifactCreationMode === 'circle') {
        const newArtifact: CircleArtifact = { id: newId, type: 'circle', name: `Circle ${artifacts.length + 1}`, visible: true, color: '#00ffff', thickness: 2, center: projCoords, radius: 500 };
        setArtifacts(prev => [...prev, newArtifact]);
        setActiveArtifactId(newId);
        onFinishArtifactCreation();
      } else if (artifactCreationMode === 'rectangle') {
        if (!rectangleFirstCorner) {
          // First click: Store the snapped first corner
          const snappedCorner = snapToCellCorner ? snapToCellCorner(projCoords) : projCoords;
          setRectangleFirstCorner(snappedCorner);
        } else {
          // Second click: Create rectangle from first corner to snapped second corner
          const snappedSecondCorner = snapToCellCorner ? snapToCellCorner(projCoords) : projCoords;

          // Calculate rectangle dimensions following cell grid orientation
          if (calculateRectangleFromCellCorners) {
            const rectParams = calculateRectangleFromCellCorners(rectangleFirstCorner, snappedSecondCorner);

            // Only create rectangle if it has non-zero dimensions
            if (rectParams && rectParams.width > 0 && rectParams.height > 0) {
              const newArtifact: RectangleArtifact = {
                id: newId, type: 'rectangle', name: `Rectangle ${artifacts.length + 1}`,
                visible: true, color: '#ff00ff', thickness: 2,
                center: rectParams.center,
                width: rectParams.width,
                height: rectParams.height,
                rotation: rectParams.rotation
              };
              setArtifacts(prev => [...prev, newArtifact]);
              setActiveArtifactId(newId);
            }
          }

          setRectangleFirstCorner(null);
          onFinishArtifactCreation();
        }
      } else if (artifactCreationMode === 'free_rectangle') {
        if (!rectangleFirstCorner) {
          // First click: Store the first corner (no snapping)
          setRectangleFirstCorner(projCoords);
        } else {
          // Second click: Create free rectangle from first corner to second corner
          const [x1, y1] = rectangleFirstCorner;
          const [x2, y2] = projCoords;

          // Calculate rectangle parameters
          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;

          // Only create rectangle if it has non-zero dimensions
          if (width > 0 && height > 0) {
            // Calculate corner coordinates (in projected space)
            const corners = {
              topLeft: [Math.min(x1, x2), Math.max(y1, y2)] as [number, number],
              topRight: [Math.max(x1, x2), Math.max(y1, y2)] as [number, number],
              bottomRight: [Math.max(x1, x2), Math.min(y1, y2)] as [number, number],
              bottomLeft: [Math.min(x1, x2), Math.min(y1, y2)] as [number, number],
            };

            const newArtifact: RectangleArtifact = {
              id: newId,
              type: 'rectangle',
              name: `Free Rect ${artifacts.filter(a => a.type === 'rectangle' && (a as RectangleArtifact).isFreeForm).length + 1}`,
              visible: true,
              color: '#ff00ff',
              thickness: 2,
              center: [centerX, centerY],
              width: width,
              height: height,
              rotation: 0,
              isFreeForm: true,
              corners: corners
            };
            setArtifacts(prev => [...prev, newArtifact]);
            setActiveArtifactId(newId);
          }

          setRectangleFirstCorner(null);
          onFinishArtifactCreation();
        }
      }
    } else if (isAppendingWaypoints) {
      const activeArtifact = artifacts.find(a => a.id === activeArtifactId) as PathArtifact | undefined;
      if (activeArtifact && activeArtifact.type === 'path') {
        let waypointGeoPosition: [number, number] = [coords.lon, coords.lat];

        // Clamp to max distance if configured
        const maxLength = pathCreationOptions.defaultMaxSegmentLength;
        if (maxLength && activeArtifact.waypoints.length > 0) {
          const lastWaypoint = activeArtifact.waypoints[activeArtifact.waypoints.length - 1];
          const lastWaypointProj = proj.forward(lastWaypoint.geoPosition);

          // Calculate distance in projected space
          const dx = projCoords[0] - lastWaypointProj[0];
          const dy = projCoords[1] - lastWaypointProj[1];
          const distProj = Math.sqrt(dx * dx + dy * dy);

          // If beyond max distance, clamp to circle boundary
          if (distProj > maxLength) {
            const ratio = maxLength / distProj;
            const clampedProjCoords: [number, number] = [
              lastWaypointProj[0] + dx * ratio,
              lastWaypointProj[1] + dy * ratio
            ];
            // Convert back to geographic coordinates
            const clampedGeo = proj4('EPSG:4326', proj).inverse(clampedProjCoords);
            waypointGeoPosition = [clampedGeo[0], clampedGeo[1]];
          }
        }

        const newWaypoint: Waypoint = {
          id: `wp-${Date.now()}`,
          geoPosition: waypointGeoPosition,
          label: `WP${activeArtifact.waypoints.length + 1}`,
          activities: createDefaultActivities(),
        };
        onUpdateArtifact(activeArtifactId, { waypoints: [...activeArtifact.waypoints, newWaypoint] });
      }
    } else if (activeTool === 'measurement') {
      const pixel = coordinateTransformer ? coordinateTransformer(coords.lat, coords.lon) : null;
      if (pixel) {
        setSelectedCells(prev => {
          const index = prev.findIndex(p => p.x === pixel.x && p.y === pixel.y);
          if (index > -1) {
            return [...prev.slice(0, index), ...prev.slice(index + 1)]; // Deselect
          } else {
            return [...prev, pixel]; // Select
          }
        });
      }
    } else if (activeTool === 'layers') {
      // Cell selection for layer management mode - now handled by double-click
      // Single click does nothing in layer mode
    } else {
      // Logic for selecting an artifact by clicking on it
      if (hoveredArtifactId) {
        setActiveArtifactId(hoveredArtifactId);
      } else if (!hoveredWaypointInfo) { // Don't deselect if clicking a waypoint
        setActiveArtifactId(null);
      }
    }
  }, [
    artifactCreationMode, isAppendingWaypoints, activeTool, artifacts, activeArtifactId, onFinishArtifactCreation, setArtifacts,
    setActiveArtifactId, onUpdateArtifact, coordinateTransformer, setSelectedCells, hoveredArtifactId, hoveredWaypointInfo,
    rectangleFirstCorner, snapToCellCorner, calculateRectangleFromCellCorners, pathCreationOptions, proj, setSelectedCellForPlot
  ]);

  const onArtifactDragStart = useCallback((info: { artifactId: string; waypointId?: string }, projCoords: [number, number]) => {
    if (isAppendingWaypoints) return;
    const artifact = artifacts.find(a => a.id === info.artifactId);
    if (!artifact || !proj) return;

    if (info.waypointId) {
      setDraggedInfo({
        artifactId: info.artifactId,
        waypointId: info.waypointId,
        initialMousePos: projCoords,
      });
    } else {
      if (artifact.type === 'circle' || artifact.type === 'rectangle') {
        // For free rectangles, also store initial corners
        const initialCorners = (artifact.type === 'rectangle' && artifact.isFreeForm && artifact.corners)
          ? artifact.corners
          : undefined;

        setDraggedInfo({
          artifactId: info.artifactId,
          initialMousePos: projCoords,
          initialCenter: artifact.center,
          initialCorners
        });
      } else if (artifact.type === 'path') {
        // Validate and project waypoints for drag operation
        const initialWaypointProjPositions = artifact.waypoints.map(wp => {
          if (!wp.geoPosition ||
            !Array.isArray(wp.geoPosition) ||
            wp.geoPosition.length !== 2 ||
            !isFinite(wp.geoPosition[0]) ||
            !isFinite(wp.geoPosition[1])) {
            logger.warn('DataCanvas: Invalid waypoint geoPosition during drag initialization', wp);
            return [0, 0] as [number, number];
          }
          try {
            return proj.forward(wp.geoPosition) as [number, number];
          } catch (e) {
            logger.warn('DataCanvas: Failed to project waypoint during drag initialization', wp, e);
            return [0, 0] as [number, number];
          }
        });
        setDraggedInfo({ artifactId: info.artifactId, initialMousePos: projCoords, initialWaypointProjPositions });
      }
    }
    setActiveArtifactId(info.artifactId);
  }, [artifacts, proj, isAppendingWaypoints, setDraggedInfo, setActiveArtifactId]);

  const onArtifactDrag = useCallback((projCoords: [number, number]) => {
    if (!draggedInfo || !proj) return;

    if (draggedInfo.waypointId) {
      setArtifacts(prev => prev.map(a => {
        if (a.id === draggedInfo.artifactId && a.type === 'path') {
          try {
            const newGeoPos = proj.inverse(projCoords);
            const newWaypoints = a.waypoints.map(wp =>
              wp.id === draggedInfo.waypointId ? { ...wp, geoPosition: newGeoPos as [number, number] } : wp
            );
            return { ...a, waypoints: newWaypoints };
          } catch (e) {
            return a;
          }
        }
        return a;
      }));
    } else {
      const dx = projCoords[0] - draggedInfo.initialMousePos[0];
      const dy = projCoords[1] - draggedInfo.initialMousePos[1];

      setArtifacts(prev => prev.map(a => {
        if (a.id === draggedInfo.artifactId) {
          if ((a.type === 'circle' || a.type === 'rectangle') && draggedInfo.initialCenter) {
            const newCenter: [number, number] = [draggedInfo.initialCenter[0] + dx, draggedInfo.initialCenter[1] + dy];

            // For free rectangles, move all corners from their initial positions
            if (a.type === 'rectangle' && a.isFreeForm && draggedInfo.initialCorners) {
              const newCorners = {
                topLeft: [draggedInfo.initialCorners.topLeft[0] + dx, draggedInfo.initialCorners.topLeft[1] + dy] as [number, number],
                topRight: [draggedInfo.initialCorners.topRight[0] + dx, draggedInfo.initialCorners.topRight[1] + dy] as [number, number],
                bottomRight: [draggedInfo.initialCorners.bottomRight[0] + dx, draggedInfo.initialCorners.bottomRight[1] + dy] as [number, number],
                bottomLeft: [draggedInfo.initialCorners.bottomLeft[0] + dx, draggedInfo.initialCorners.bottomLeft[1] + dy] as [number, number],
              };
              return { ...a, center: newCenter, corners: newCorners };
            }

            // Apply snapping for grid-aligned rectangles to maintain cell grid alignment
            if (a.type === 'rectangle' && !a.isFreeForm && snapToCellCorner && calculateRectangleFromCellCorners) {
              // Calculate the corners based on current center, width, height, and rotation
              const rotRad = a.rotation * Math.PI / 180;
              const cosR = Math.cos(rotRad);
              const sinR = Math.sin(rotRad);

              // Top-left corner in local coordinates
              const localTL = [-a.width / 2, -a.height / 2];
              // Rotate and translate to get projected coordinates
              const topLeftProj: [number, number] = [
                newCenter[0] + localTL[0] * cosR - localTL[1] * sinR,
                newCenter[1] + localTL[0] * sinR + localTL[1] * cosR
              ];

              // Snap top-left corner
              const snappedTopLeft = snapToCellCorner(topLeftProj);

              if (snappedTopLeft) {
                // Calculate bottom-right corner from the dimensions
                const localBR = [a.width / 2, a.height / 2];
                const bottomRightProj: [number, number] = [
                  newCenter[0] + localBR[0] * cosR - localBR[1] * sinR,
                  newCenter[1] + localBR[0] * sinR + localBR[1] * cosR
                ];

                // Snap bottom-right corner
                const snappedBottomRight = snapToCellCorner(bottomRightProj);

                if (snappedBottomRight) {
                  // Recalculate rectangle with both corners snapped
                  const rectParams = calculateRectangleFromCellCorners(snappedTopLeft, snappedBottomRight);
                  if (rectParams) {
                    return {
                      ...a,
                      center: rectParams.center,
                      width: rectParams.width,
                      height: rectParams.height,
                      rotation: rectParams.rotation
                    };
                  }
                }
              }
            }

            return { ...a, center: newCenter };
          } else if (a.type === 'path' && draggedInfo.initialWaypointProjPositions) {
            const newWaypoints = a.waypoints.map((wp, i) => {
              const initialProjPos = draggedInfo.initialWaypointProjPositions![i];
              const newProjPos: [number, number] = [initialProjPos[0] + dx, initialProjPos[1] + dy];
              try {
                const newGeoPos = proj.inverse(newProjPos);
                return { ...wp, geoPosition: newGeoPos };
              } catch (e) {
                return wp;
              }
            });
            return { ...a, waypoints: newWaypoints };
          }
        }
        return a;
      }));
    }
  }, [draggedInfo, proj, setArtifacts, snapToCellCorner, calculateRectangleFromCellCorners]);

  const onArtifactDragEnd = useCallback(() => {
    setDraggedInfo(null);
  }, [setDraggedInfo]);


  const handleInteractionMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const projCoords = canvasToProjCoords(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setCurrentMouseProjCoords(projCoords);

    // Handle image layer transformation
    try {
      if (imageLayerDragInfo && projCoords) {
        const dragInfo = imageLayerDragInfo;
        const layer = layers.find(l => l.id === dragInfo.layerId && l.type === 'image');
        if (layer && layer.type === 'image') {
          if (dragInfo.handleType === 'center') {
            // Move the image
            const dx = projCoords[0] - dragInfo.initialMouseProj[0];
            const dy = projCoords[1] - dragInfo.initialMouseProj[1];
            onUpdateLayer(dragInfo.layerId, {
              position: [dragInfo.initialPosition[0] + dx, dragInfo.initialPosition[1] + dy]
            });
          } else if (dragInfo.handleType === 'corner' && dragInfo.handleIndex !== undefined) {
            // Scale the image
            const rotationRad = (dragInfo.initialRotation * Math.PI) / 180;
            const cosR = Math.cos(-rotationRad);
            const sinR = Math.sin(-rotationRad);

            // Transform current and initial mouse positions to local coordinates
            const dx0 = dragInfo.initialMouseProj[0] - dragInfo.initialPosition[0];
            const dy0 = dragInfo.initialMouseProj[1] - dragInfo.initialPosition[1];
            const initialLocal = [dx0 * cosR - dy0 * sinR, dx0 * sinR + dy0 * cosR];

            const dx1 = projCoords[0] - dragInfo.initialPosition[0];
            const dy1 = projCoords[1] - dragInfo.initialPosition[1];
            const currentLocal = [dx1 * cosR - dy1 * sinR, dx1 * sinR + dy1 * cosR];

            // Calculate scale change
            const cornerIndex = dragInfo.handleIndex;
            const initialDisplayWidth = layer.originalWidth * dragInfo.initialScaleX;
            const initialDisplayHeight = layer.originalHeight * dragInfo.initialScaleY;

            // Determine which dimension(s) to scale based on corner
            let newScaleX = dragInfo.initialScaleX;
            let newScaleY = dragInfo.initialScaleY;

            if (cornerIndex === 0 || cornerIndex === 3) { // Left corners
              newScaleX = dragInfo.initialScaleX * (1 - 2 * (currentLocal[0] - initialLocal[0]) / initialDisplayWidth);
            } else { // Right corners
              newScaleX = dragInfo.initialScaleX * (1 + 2 * (currentLocal[0] - initialLocal[0]) / initialDisplayWidth);
            }

            if (cornerIndex === 0 || cornerIndex === 1) { // Top corners
              newScaleY = dragInfo.initialScaleY * (1 - 2 * (currentLocal[1] - initialLocal[1]) / initialDisplayHeight);
            } else { // Bottom corners
              newScaleY = dragInfo.initialScaleY * (1 + 2 * (currentLocal[1] - initialLocal[1]) / initialDisplayHeight);
            }

            // Clamp scales to reasonable values
            newScaleX = Math.max(0.1, Math.min(10, newScaleX));
            newScaleY = Math.max(0.1, Math.min(10, newScaleY));

            onUpdateLayer(dragInfo.layerId, { scaleX: newScaleX, scaleY: newScaleY });
          } else if (dragInfo.handleType === 'edge' && dragInfo.handleIndex !== undefined) {
            // Rotate the image
            const dx = projCoords[0] - dragInfo.initialPosition[0];
            const dy = projCoords[1] - dragInfo.initialPosition[1];
            const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;

            const dx0 = dragInfo.initialMouseProj[0] - dragInfo.initialPosition[0];
            const dy0 = dragInfo.initialMouseProj[1] - dragInfo.initialPosition[1];
            const initialAngle = Math.atan2(dy0, dx0) * 180 / Math.PI;

            let newRotation = dragInfo.initialRotation + (currentAngle - initialAngle);
            // Normalize to [-180, 180]
            while (newRotation > 180) newRotation -= 360;
            while (newRotation < -180) newRotation += 360;

            onUpdateLayer(dragInfo.layerId, { rotation: newRotation });
          }
        }
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to transform image layer: ${errorMessage}`, 'Image Transformation Error');
    }

    if (!!draggedInfo && projCoords) {
      onArtifactDrag(projCoords);
      return;
    }

    if (isPanning.current && viewState) {
      const dx = e.clientX - lastMousePos.current.x; const dy = e.clientY - lastMousePos.current.y;
      const dpr = window.devicePixelRatio || 1;
      const newCenter: [number, number] = [viewState.center[0] - dx / (viewState.scale * dpr), viewState.center[1] + dy / (viewState.scale * dpr)];
      setViewState({ ...viewState, center: newCenter });
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }

    if (projCoords && proj && viewState) {
      let newHoveredWaypointInfo = null;
      let newHoveredArtifactId = null;

      if (artifactCreationMode === null && !isAppendingWaypoints) {
        const dpr = window.devicePixelRatio || 1;
        const effectiveScale = viewState.scale * dpr;
        const hitRadiusPx = artifactDisplayOptions.waypointDotSize * 0.75;
        const hitRadiusProj = hitRadiusPx / effectiveScale;

        for (let i = artifacts.length - 1; i >= 0; i--) {
          const artifact = artifacts[i];
          if (!artifact.visible) continue;

          let waypointHit = false;
          if (artifact.type === 'path') {
            for (const waypoint of artifact.waypoints) {
              // Validate geoPosition before projection
              if (!waypoint.geoPosition ||
                !Array.isArray(waypoint.geoPosition) ||
                waypoint.geoPosition.length !== 2 ||
                !isFinite(waypoint.geoPosition[0]) ||
                !isFinite(waypoint.geoPosition[1])) {
                continue; // Skip invalid waypoints
              }
              try {
                const wpProjPos = proj.forward(waypoint.geoPosition);
                if (!wpProjPos || !Array.isArray(wpProjPos) || wpProjPos.length !== 2 ||
                  !isFinite(wpProjPos[0]) || !isFinite(wpProjPos[1])) {
                  continue; // Skip invalid projections
                }
                const dist = Math.sqrt(Math.pow(projCoords[0] - wpProjPos[0], 2) + Math.pow(projCoords[1] - wpProjPos[1], 2));
                if (dist < hitRadiusProj) {
                  newHoveredWaypointInfo = { artifactId: artifact.id, waypointId: waypoint.id };
                  waypointHit = true;
                  break;
                }
              } catch (err) {
                // Skip waypoints that fail to project
                continue;
              }
            }
          }
          if (waypointHit) break;

          let artifactHit = false;
          if (artifact.type === 'circle') {
            const dist = Math.sqrt(Math.pow(projCoords[0] - artifact.center[0], 2) + Math.pow(projCoords[1] - artifact.center[1], 2));
            if (dist <= artifact.radius) artifactHit = true;
          } else if (artifact.type === 'rectangle') {
            if (artifact.isFreeForm && artifact.corners) {
              // Point-in-polygon test for free rectangles
              const corners = [
                artifact.corners.topLeft,
                artifact.corners.topRight,
                artifact.corners.bottomRight,
                artifact.corners.bottomLeft
              ];
              const [px, py] = projCoords;
              let inside = false;
              for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
                const [xi, yi] = corners[i];
                const [xj, yj] = corners[j];
                const intersect = ((yi > py) !== (yj > py)) &&
                  (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
              }
              if (inside) artifactHit = true;
            } else {
              // Rotated rectangle hit test for grid-aligned rectangles
              const w = artifact.width; const h = artifact.height;
              const angle = -artifact.rotation * Math.PI / 180;
              const dx = projCoords[0] - artifact.center[0]; const dy = projCoords[1] - artifact.center[1];
              const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle);
              const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
              if (Math.abs(rotatedX) <= w / 2 && Math.abs(rotatedY) <= h / 2) artifactHit = true;
            }
          } else if (artifact.type === 'path') { }
          if (artifactHit) {
            newHoveredArtifactId = artifact.id;
            break;
          }
        }
      }

      setHoveredWaypointInfo(newHoveredWaypointInfo);
      setHoveredArtifactId(newHoveredWaypointInfo ? null : newHoveredArtifactId);

      try { const [lon, lat] = proj4('EPSG:4326', proj).inverse(projCoords); onCellHover({ lat, lon }); } catch (e) { clearHoverState(); }
    } else { clearHoverState(); setHoveredArtifactId(null); setHoveredWaypointInfo(null); }
  }, [viewState, setViewState, canvasToProjCoords, proj, onCellHover, clearHoverState, draggedInfo, onArtifactDrag, artifacts, artifactCreationMode, artifactDisplayOptions, isAppendingWaypoints, imageLayerDragInfo, layers, onUpdateLayer]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    const projCoords = canvasToProjCoords(e.nativeEvent.offsetX, e.nativeEvent.offsetY);

    if (!projCoords) return;

    if (e.button === 0) { // Left mouse button
      // Check for image layer handle click
      try {
        const handleInfo = getImageLayerHandle(projCoords);
        if (handleInfo) {
          const layer = layers.find(l => l.id === handleInfo.layerId && l.type === 'image');
          if (layer && layer.type === 'image') {
            setImageLayerDragInfo({
              layerId: handleInfo.layerId,
              handleType: handleInfo.handleType,
              handleIndex: handleInfo.handleIndex,
              initialMouseProj: projCoords,
              initialPosition: layer.position,
              initialScaleX: layer.scaleX,
              initialScaleY: layer.scaleY,
              initialRotation: layer.rotation
            });
            return;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showError(`Failed to check image layer handle: ${errorMessage}`, 'Image Layer Error');
      }

      // Only allow artifact dragging when in artifact mode
      if (activeTool === 'artifacts') {
        if (hoveredWaypointInfo) {
          onArtifactDragStart({ artifactId: hoveredWaypointInfo.artifactId, waypointId: hoveredWaypointInfo.waypointId }, projCoords);
        } else if (hoveredArtifactId) {
          onArtifactDragStart({ artifactId: hoveredArtifactId }, projCoords);
        } else {
          isPanning.current = true;
        }
      } else {
        isPanning.current = true;
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const wasClick = isPanning.current && (Math.abs(e.clientX - lastMousePos.current.x) < 2) && (Math.abs(e.clientY - lastMousePos.current.y) < 2);

    const wasPanning = isPanning.current;
    isPanning.current = false;

    // Clear image layer drag info
    if (imageLayerDragInfo) {
      setImageLayerDragInfo(null);
      return;
    }

    if (!!draggedInfo) {
      onArtifactDragEnd();
      return;
    }

    if (wasPanning && wasClick) {
      const projCoords = canvasToProjCoords(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      const geoCoords = proj && projCoords ? (() => { try { const [lon, lat] = proj4('EPSG:4326', proj).inverse(projCoords); return { lat, lon }; } catch (e) { return null; } })() : null;

      if (projCoords && geoCoords) {
        onMapClick(geoCoords, projCoords);
      }
    }
  };
  const handleMouseLeave = () => {
    isPanning.current = false;
    clearHoverState();
    if (imageLayerDragInfo) setImageLayerDragInfo(null);
    if (!!draggedInfo) onArtifactDragEnd();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const projCoords = canvasToProjCoords(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    const geoCoords = proj && projCoords ? (() => { try { const [lon, lat] = proj4('EPSG:4326', proj).inverse(projCoords); return { lat, lon }; } catch (e) { return null; } })() : null;

    // Handle layer management mode - double-click to select cell
    if (activeTool === 'layers' && geoCoords) {
      const pixel = coordinateTransformer ? coordinateTransformer(geoCoords.lat, geoCoords.lon) : null;
      if (pixel) {
        setSelectedCellForPlot(prev => {
          // Toggle selection: if clicking the same cell, deselect it
          if (prev && prev.x === pixel.x && prev.y === pixel.y) {
            return null; // Deselect
          } else {
            return pixel; // Select
          }
        });
      }
      return;
    }

    // Only handle waypoint double-clicks in artifact mode
    if (activeTool !== 'artifacts' || !hoveredWaypointInfo) return;

    const artifact = artifacts.find(a => a.id === hoveredWaypointInfo.artifactId);
    if (!artifact || artifact.type !== 'path') return;

    const waypoint = artifact.waypoints.find(wp => wp.id === hoveredWaypointInfo.waypointId);
    if (!waypoint) return;

    // Validate waypoint has valid geoPosition [lon, lat] before opening modal
    if (!waypoint.geoPosition ||
      !Array.isArray(waypoint.geoPosition) ||
      waypoint.geoPosition.length !== 2 ||
      !isFinite(waypoint.geoPosition[0]) ||
      !isFinite(waypoint.geoPosition[1])) {
      logger.error('DataCanvas: Cannot edit waypoint with invalid geoPosition', waypoint);
      return;
    }

    setEditingWaypointActivities({ artifactId: artifact.id, waypoint });
  };

  const handleWaypointEditSave = (updates: Partial<Waypoint>) => {
    if (!editingWaypoint) return;

    const artifact = artifacts.find(a => a.id === editingWaypoint.artifactId);
    if (!artifact || artifact.type !== 'path') return;

    const waypointIndex = artifact.waypoints.findIndex(wp => wp.id === editingWaypoint.waypoint.id);
    if (waypointIndex === -1) return;

    const newWaypoints = [...artifact.waypoints];
    newWaypoints[waypointIndex] = { ...newWaypoints[waypointIndex], ...updates };
    onUpdateArtifact(artifact.id, { waypoints: newWaypoints });
  };

  const handleWaypointActivitiesSave = (updates: Partial<Waypoint>) => {
    if (!editingWaypointActivities) return;

    const artifact = artifacts.find(a => a.id === editingWaypointActivities.artifactId);
    if (!artifact || artifact.type !== 'path') return;

    const waypointIndex = artifact.waypoints.findIndex(wp => wp.id === editingWaypointActivities.waypoint.id);
    if (waypointIndex === -1) return;

    const newWaypoints = [...artifact.waypoints];
    newWaypoints[waypointIndex] = { ...newWaypoints[waypointIndex], ...updates };
    onUpdateArtifact(artifact.id, { waypoints: newWaypoints });
  };

  const handleZoomAction = useCallback((factor: number) => { if (!viewState) return; setViewState({ ...viewState, scale: viewState.scale * factor }); }, [viewState, setViewState]);
  const handleResetView = useCallback(() => { if (initialViewState) { setViewState(initialViewState); } }, [initialViewState, setViewState]);

  const handleExportMap = useCallback(() => {
    if (!viewState || !proj || !containerRef.current) return;

    exportMapAsImage({
      baseCanvas: baseCanvasRef.current,
      dataCanvas: dataCanvasRef.current,
      artifactCanvas: artifactCanvasRef.current,
      graticuleCanvas: graticuleCanvasRef.current,
      selectionCanvas: selectionCanvasRef.current,
      currentDateIndex,
      viewState,
      proj,
      containerWidth: containerRef.current.clientWidth,
      containerHeight: containerRef.current.clientHeight,
    });
  }, [viewState, proj, currentDateIndex]);

  const cursorStyle = useMemo(() => {
    if (artifactCreationMode || isAppendingWaypoints) return 'crosshair';
    if (imageLayerDragInfo) {
      if (imageLayerDragInfo.handleType === 'center') return 'move';
      if (imageLayerDragInfo.handleType === 'corner') return 'nwse-resize';
      if (imageLayerDragInfo.handleType === 'edge') return 'grab';
    }
    if (!!draggedInfo) return 'grabbing';
    if (hoveredWaypointInfo || hoveredArtifactId) return 'grab';
    if (activeTool === 'measurement') return 'copy';
    if (isPanning.current) return 'grabbing';
    return 'default';
  }, [artifactCreationMode, isAppendingWaypoints, draggedInfo, hoveredWaypointInfo, hoveredArtifactId, activeTool, isPanning.current, imageLayerDragInfo]);

  if (!isDataLoaded) {
    return (<div className="w-full h-full flex items-center justify-center text-center text-gray-400 bg-gray-900/50 rounded-lg"><div><h3 className="text-xl font-semibold">No Data Loaded</h3><p className="mt-2">Use the Layers panel to load a basemap or data file.</p></div></div>);
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleInteractionMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      style={{ cursor: cursorStyle }}
    >
      {isRendering && <div className="absolute inset-0 flex items-center justify-center bg-gray-800/50 z-50"><LoadingSpinner /></div>}
      <canvas ref={baseCanvasRef} className="pixelated absolute inset-0 w-full h-full z-0" />
      <canvas ref={dataCanvasRef} className="pixelated absolute inset-0 w-full h-full z-10" />
      {USE_WEBGL_RENDERER && <canvas ref={webglCanvasRef} className="absolute inset-0 w-full h-full z-15 pointer-events-none" />}
      <canvas ref={artifactCanvasRef} className="absolute inset-0 w-full h-full z-20 pointer-events-none" />
      <canvas ref={graticuleCanvasRef} className="absolute inset-0 w-full h-full z-30 pointer-events-none" />
      <canvas ref={selectionCanvasRef} className="absolute inset-0 w-full h-full z-40 pointer-events-none" />
      <ActivitySymbolsOverlay
        artifacts={artifacts.filter(a => a.type === 'path') as PathArtifact[]}
        proj={proj}
        viewState={viewState}
        containerWidth={containerRef.current?.clientWidth || 0}
        containerHeight={containerRef.current?.clientHeight || 0}
        showActivitySymbols={artifactDisplayOptions.showActivitySymbols}
      />
      <ZoomControls onZoomIn={() => handleZoomAction(1.5)} onZoomOut={() => handleZoomAction(1 / 1.5)} onResetView={handleResetView} onExportMap={handleExportMap} />
      {editingWaypoint && (() => {
        const artifact = artifacts.find(a => a.id === editingWaypoint.artifactId);
        const defaultColor = artifact?.color || '#ef4444';
        return (
          <WaypointEditModal
            isOpen={true}
            waypoint={editingWaypoint.waypoint}
            defaultColor={defaultColor}
            onClose={() => setEditingWaypoint(null)}
            onSave={handleWaypointEditSave}
          />
        );
      })()}
      {editingWaypointActivities && (
        <ActivityTimelineModal
          isOpen={true}
          waypoint={editingWaypointActivities.waypoint}
          onClose={() => setEditingWaypointActivities(null)}
          onSave={handleWaypointActivitiesSave}
        />
      )}
      {hoveredWaypointInfo && (() => {
        const artifact = artifacts.find(a => a.id === hoveredWaypointInfo.artifactId);
        const waypoint = artifact && artifact.type === 'path' ? artifact.waypoints.find(wp => wp.id === hoveredWaypointInfo.waypointId) : null;

        if (!waypoint) return null;

        const getActivityName = (typeId: string) => {
          const def = activityDefinitions.find(d => d.id === typeId);
          return def?.name || typeId;
        };

        const formatDuration = (seconds: number) => {
          if (seconds === 0) return '0s';
          if (seconds < 60) return `${seconds}s`;
          const hours = Math.floor(seconds / 3600);
          const mins = Math.floor((seconds % 3600) / 60);
          const secs = seconds % 60;
          const parts = [];
          if (hours > 0) parts.push(`${hours}h`);
          if (mins > 0) parts.push(`${mins}m`);
          if (secs > 0) parts.push(`${secs}s`);
          return parts.join(' ');
        };

        return (
          <div className="absolute bottom-4 left-4 bg-gray-800/95 border border-gray-600 rounded-lg p-3 shadow-lg z-50 pointer-events-none max-w-sm">
            <div className="text-sm space-y-1">
              <div className="font-semibold text-white border-b border-gray-600 pb-1 mb-2">
                {waypoint.label || 'Waypoint'}
              </div>
              <div className="text-gray-300">
                <span className="text-gray-400">Coordinates:</span> {waypoint.geoPosition[1].toFixed(6)}, {waypoint.geoPosition[0].toFixed(6)}
              </div>
              {waypoint.activitySymbol && (
                <div className="text-gray-300">
                  <span className="text-gray-400">Activity:</span> {waypoint.activityLabel || waypoint.activitySymbol}
                </div>
              )}
              {waypoint.activities && waypoint.activities.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="text-gray-400 text-xs font-semibold mb-1">Activity Plan:</div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {waypoint.activities.map((activity, idx) => (
                      <div key={activity.id} className="text-xs text-gray-300 flex justify-between gap-2">
                        <span className="truncate">{idx + 1}. {getActivityName(activity.type)}</span>
                        <span className="text-gray-500 flex-shrink-0">{formatDuration(activity.duration)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {waypoint.description && (
                <div className="text-gray-300 text-xs mt-2 pt-2 border-t border-gray-700">
                  <div className="text-gray-400 font-semibold mb-1">Description:</div>
                  <div className="whitespace-pre-wrap">{waypoint.description}</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {contextMenu && (
        <WaypointContextMenu
          contextMenu={contextMenu}
          onInsertAfter={handleInsertWaypointAfter}
          onDelete={handleDeleteWaypoint}
          onDisconnectAfter={handleDisconnectAfter}
          onConnectToPath={handleConnectToPath}
          availablePathsToConnect={availablePathsToConnect}
        />
      )}
    </div>
  );
};