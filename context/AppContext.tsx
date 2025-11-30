import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { parseNpy } from '../services/npyParser';
import { parseNpyHeader } from '../services/streamingNpyParser';
import { parseNetCdfHeader, closeNetCdfFile } from '../services/streamingNetCdfParser';
import { LazyDataset, NetCDFReader } from '../services/LazyDataset';
import { parseVrt } from '../services/vrtParser';
import { parseNetCdf4, parseTimeValues } from '../services/netcdf4Parser';
// Note: NetCDF streaming is limited - h5wasm requires full file in memory, but we defer processing
import type { DataSet, DataSlice, GeoCoordinates, VrtData, ViewState, TimeRange, PixelCoords, TimeDomain, Tool, Layer, DataLayer, BaseMapLayer, AnalysisLayer, ImageLayer, DaylightFractionHoverData, AppStateConfig, SerializableLayer, Artifact, CircleArtifact, RectangleArtifact, PathArtifact, SerializableArtifact, Waypoint, ColorStop, DteCommsLayer, LpfCommsLayer, IlluminationLayer, Event, ActivityDefinition, Activity } from '../types';
import { indexToDate, dateToIndex } from '../utils/time';
import * as analysisService from '../services/analysisService';
import { useToast } from '../components/Toast';
import { useCoordinateTransformation } from '../hooks/useCoordinateTransformation';
import { useDebounce } from '../hooks/useDebounce';
import { generateSecureId } from '../utils/crypto';
import { logger } from '../utils/logger';
import {
  DEFAULT_LAT_RANGE,
  DEFAULT_LON_RANGE,
  MAX_HISTORY_STATES,
  IMAGE_LOAD_TIMEOUT_MS,
  DEFAULT_ARTIFACT_DISPLAY_OPTIONS,
  DEFAULT_PATH_CREATION_OPTIONS,
  DEFAULT_NIGHTFALL_PLOT_Y_AXIS_RANGE
} from '../config/defaults';

// Geographic bounding box for the data
const LAT_RANGE: [number, number] = DEFAULT_LAT_RANGE;
const LON_RANGE: [number, number] = DEFAULT_LON_RANGE;

const dataUrlToImage = (dataUrl: string, timeout: number = IMAGE_LOAD_TIMEOUT_MS): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeoutId = setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, timeout);

    image.onload = () => {
      clearTimeout(timeoutId);
      resolve(image);
    };
    image.onerror = (e) => {
      clearTimeout(timeoutId);
      reject(e);
    };
    image.src = dataUrl;
  });
};

interface AppContextType {
  // State
  layers: Layer[];
  activeLayerId: string | null;
  isLoading: string | null;
  timeRange: TimeRange | null;
  currentDateIndex: number | null;
  hoveredCoords: GeoCoordinates;
  showGraticule: boolean;
  viewState: ViewState | null;
  graticuleDensity: number;
  graticuleLabelFontSize: number;
  activeTool: Tool | null;
  selectedPixel: (PixelCoords & { layerId: string; }) | null;
  timeSeriesData: { data: number[]; range: { min: number; max: number; }; } | null;
  timeZoomDomain: TimeDomain | null;
  daylightFractionHoverData: DaylightFractionHoverData | null;
  flickeringLayerId: string | null;
  showGrid: boolean;
  gridSpacing: number;
  gridColor: string;
  selectedCells: { x: number; y: number; }[];
  selectionColor: string;
  selectedCellForPlot: { x: number; y: number; } | null;
  isPlaying: boolean;
  isPaused: boolean;
  playbackSpeed: number;
  importRequest: { config: AppStateConfig; requiredFiles: string[]; } | null;
  artifacts: Artifact[];
  activeArtifactId: string | null;
  artifactCreationMode: "circle" | "rectangle" | "free_rectangle" | "path" | null;
  isAppendingWaypoints: boolean;
  draggedInfo: { artifactId: string; waypointId?: string; isActivitySymbol?: boolean; initialMousePos: [number, number]; initialCenter?: [number, number]; initialWaypointProjPositions?: [number, number][]; initialActivityOffset?: number; initialCorners?: { topLeft: [number, number]; topRight: [number, number]; bottomLeft: [number, number]; bottomRight: [number, number]; }; } | null;
  artifactDisplayOptions: { waypointDotSize: number; showSegmentLengths: boolean; labelFontSize: number; showActivitySymbols: boolean; };
  pathCreationOptions: { defaultMaxSegmentLength: number | null; };
  activityDefinitions: ActivityDefinition[];
  nightfallPlotYAxisRange: { min: number; max: number; };
  isCreatingExpression: boolean;
  events: Event[];
  activeEventId: string | null;

  // Derived State
  baseMapLayer: BaseMapLayer | undefined;
  primaryDataLayer: DataLayer | undefined;
  activeLayer: Layer | undefined;
  proj: proj4.ProjectionDefinition | null;
  fullTimeDomain: TimeDomain | null;
  getDateForIndex: (index: number) => Date;  // Layer-aware date conversion
  getIndexForDate: (date: Date) => number;  // Layer-aware inverse conversion
  coordinateTransformer: ((lat: number, lon: number) => PixelCoords) | null;
  snapToCellCorner: ((projCoords: [number, number]) => [number, number] | null) | null;
  calculateRectangleFromCellCorners: ((corner1: [number, number], corner2: [number, number]) => { center: [number, number]; width: number; height: number; rotation: number } | null) | null;

  // Setters & Handlers
  setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<string | null>>;
  setTimeRange: React.Dispatch<React.SetStateAction<TimeRange | null>>;
  setCurrentDateIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setHoveredCoords: React.Dispatch<React.SetStateAction<GeoCoordinates>>;
  setShowGraticule: React.Dispatch<React.SetStateAction<boolean>>;
  setViewState: React.Dispatch<React.SetStateAction<ViewState | null>>;
  setGraticuleDensity: React.Dispatch<React.SetStateAction<number>>;
  setGraticuleLabelFontSize: React.Dispatch<React.SetStateAction<number>>;
  onToolSelect: (tool: Tool) => void;
  setSelectedPixel: React.Dispatch<React.SetStateAction<(PixelCoords & { layerId: string; }) | null>>;
  setTimeZoomDomain: React.Dispatch<React.SetStateAction<TimeDomain | null>>;
  onToggleFlicker: (layerId: string) => void;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setGridSpacing: React.Dispatch<React.SetStateAction<number>>;
  setGridColor: React.Dispatch<React.SetStateAction<string>>;
  setSelectedCells: React.Dispatch<React.SetStateAction<{ x: number; y: number; }[]>>;
  setSelectionColor: React.Dispatch<React.SetStateAction<string>>;
  setSelectedCellForPlot: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  onPlaybackSpeedChange: (speed: number) => void;
  setImportRequest: React.Dispatch<React.SetStateAction<{ config: AppStateConfig; requiredFiles: string[]; } | null>>;
  setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>;
  setActiveArtifactId: React.Dispatch<React.SetStateAction<string | null>>;
  setArtifactCreationMode: React.Dispatch<React.SetStateAction<"circle" | "rectangle" | "path" | null>>;
  setIsAppendingWaypoints: React.Dispatch<React.SetStateAction<boolean>>;
  setDraggedInfo: React.Dispatch<React.SetStateAction<{ artifactId: string; waypointId?: string; isActivitySymbol?: boolean; initialMousePos: [number, number]; initialCenter?: [number, number]; initialWaypointProjPositions?: [number, number][]; initialActivityOffset?: number; initialCorners?: { topLeft: [number, number]; topRight: [number, number]; bottomLeft: [number, number]; bottomRight: [number, number]; }; } | null>>;
  setArtifactDisplayOptions: React.Dispatch<React.SetStateAction<{ waypointDotSize: number; showSegmentLengths: boolean; labelFontSize: number; showActivitySymbols: boolean; }>>;
  setPathCreationOptions: React.Dispatch<React.SetStateAction<{ defaultMaxSegmentLength: number | null; }>>;
  setActivityDefinitions: React.Dispatch<React.SetStateAction<ActivityDefinition[]>>;
  onNightfallPlotYAxisRangeChange: (range: { min: number; max: number; }) => void;
  setIsCreatingExpression: React.Dispatch<React.SetStateAction<boolean>>;
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  setActiveEventId: React.Dispatch<React.SetStateAction<string | null>>;
  onUpdateEvent: (id: string, updates: Partial<Event>) => void;
  onRemoveEvent: (id: string) => void;
  onAddEvent: (event: Event) => void;
  registerCanvasCacheCleaner: (cleaner: ((layerId: string) => void) | null) => void;

  clearHoverState: () => void;
  onAddDataLayer: (file: File) => void;
  onAddDteCommsLayer: (file: File) => void;
  onAddLpfCommsLayer: (file: File) => void;
  onAddIlluminationLayer: (file: File) => void;
  onAddBaseMapLayer: (pngFile: File, vrtFile: File) => void;
  onAddImageLayer: (file: File, initialPosition?: [number, number]) => Promise<void>;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
  onRemoveLayer: (id: string) => void;
  onCalculateNightfallLayer: (sourceLayerId: string) => void;
  onCalculateDaylightFractionLayer: (sourceLayerId: string) => void;
  onCreateExpressionLayer: (name: string, expression: string) => Promise<void>;
  onRecalculateExpressionLayer: (layerId: string, newExpression: string) => Promise<void>;
  handleManualTimeRangeChange: (newRange: TimeRange) => void;
  onTogglePlay: () => void;
  onUpdateArtifact: (id: string, updates: Partial<Artifact>) => void;
  onRemoveArtifact: (id: string) => void;
  onFinishArtifactCreation: () => void;
  onStartAppendWaypoints: () => void;
  onClearSelection: () => void;
  onZoomToSelection: () => void;
  onResetZoom: () => void;
  onExportConfig: () => Promise<void>;
  onImportConfig: (file: File) => void;
  handleRestoreSession: (config: AppStateConfig, files: FileList | File[]) => Promise<void>;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  latRange: [number, number];
  lonRange: [number, number];
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};

/**
 * Memoized hooks for performance optimization
 * Use these instead of useAppContext when you only need specific state slices
 * Components will only re-render when the specific slice changes
 */

/** Hook for layer-related state and operations */
export const useLayerState = () => {
  const ctx = useAppContext();
  return useMemo(() => ({
    layers: ctx.layers,
    activeLayerId: ctx.activeLayerId,
    activeLayer: ctx.activeLayer,
    baseMapLayer: ctx.baseMapLayer,
    primaryDataLayer: ctx.primaryDataLayer,
    setLayers: ctx.setLayers,
    setActiveLayerId: ctx.setActiveLayerId,
    onAddDataLayer: ctx.onAddDataLayer,
    onAddDteCommsLayer: ctx.onAddDteCommsLayer,
    onAddLpfCommsLayer: ctx.onAddLpfCommsLayer,
    onAddBaseMapLayer: ctx.onAddBaseMapLayer,
    onAddImageLayer: ctx.onAddImageLayer,
    onUpdateLayer: ctx.onUpdateLayer,
    onRemoveLayer: ctx.onRemoveLayer,
    onCalculateNightfallLayer: ctx.onCalculateNightfallLayer,
    onCalculateDaylightFractionLayer: ctx.onCalculateDaylightFractionLayer,
    onCreateExpressionLayer: ctx.onCreateExpressionLayer,
    onRecalculateExpressionLayer: ctx.onRecalculateExpressionLayer,
  }), [
    ctx.layers, ctx.activeLayerId, ctx.activeLayer, ctx.baseMapLayer, ctx.primaryDataLayer,
    ctx.setLayers, ctx.setActiveLayerId, ctx.onAddDataLayer, ctx.onAddDteCommsLayer,
    ctx.onAddLpfCommsLayer, ctx.onAddBaseMapLayer, ctx.onAddImageLayer, ctx.onUpdateLayer,
    ctx.onRemoveLayer, ctx.onCalculateNightfallLayer, ctx.onCalculateDaylightFractionLayer,
    ctx.onCreateExpressionLayer, ctx.onRecalculateExpressionLayer
  ]);
};

/** Hook for viewport and display settings */
export const useViewState = () => {
  const ctx = useAppContext();
  return useMemo(() => ({
    viewState: ctx.viewState,
    showGraticule: ctx.showGraticule,
    graticuleDensity: ctx.graticuleDensity,
    showGrid: ctx.showGrid,
    gridSpacing: ctx.gridSpacing,
    gridColor: ctx.gridColor,
    setViewState: ctx.setViewState,
    setShowGraticule: ctx.setShowGraticule,
    setGraticuleDensity: ctx.setGraticuleDensity,
    setGraticuleLabelFontSize: ctx.setGraticuleLabelFontSize,
    setShowGrid: ctx.setShowGrid,
    setGridSpacing: ctx.setGridSpacing,
    setGridColor: ctx.setGridColor,
  }), [
    ctx.viewState, ctx.showGraticule, ctx.graticuleDensity, ctx.graticuleLabelFontSize, ctx.showGrid,
    ctx.gridSpacing, ctx.gridColor, ctx.setViewState, ctx.setShowGraticule,
    ctx.setGraticuleDensity, ctx.setGraticuleLabelFontSize, ctx.setShowGrid, ctx.setGridSpacing, ctx.setGridColor
  ]);
};

/** Hook for time-related state and playback */
export const useTimeState = () => {
  const ctx = useAppContext();
  return useMemo(() => ({
    timeRange: ctx.timeRange,
    currentDateIndex: ctx.currentDateIndex,
    timeZoomDomain: ctx.timeZoomDomain,
    fullTimeDomain: ctx.fullTimeDomain,
    isPlaying: ctx.isPlaying,
    isPaused: ctx.isPaused,
    playbackSpeed: ctx.playbackSpeed,
    setTimeRange: ctx.setTimeRange,
    setCurrentDateIndex: ctx.setCurrentDateIndex,
    setTimeZoomDomain: ctx.setTimeZoomDomain,
    setIsPlaying: ctx.setIsPlaying,
    setIsPaused: ctx.setIsPaused,
    onPlaybackSpeedChange: ctx.onPlaybackSpeedChange,
    handleManualTimeRangeChange: ctx.handleManualTimeRangeChange,
    onTogglePlay: ctx.onTogglePlay,
    onZoomToSelection: ctx.onZoomToSelection,
    onResetZoom: ctx.onResetZoom,
  }), [
    ctx.timeRange, ctx.currentDateIndex, ctx.timeZoomDomain, ctx.fullTimeDomain,
    ctx.isPlaying, ctx.isPaused, ctx.playbackSpeed, ctx.setTimeRange,
    ctx.setCurrentDateIndex, ctx.setTimeZoomDomain, ctx.setIsPlaying, ctx.setIsPaused,
    ctx.onPlaybackSpeedChange, ctx.handleManualTimeRangeChange, ctx.onTogglePlay,
    ctx.onZoomToSelection, ctx.onResetZoom
  ]);
};

/** Hook for artifact and event state with undo/redo */
export const useArtifactState = () => {
  const ctx = useAppContext();
  return useMemo(() => ({
    artifacts: ctx.artifacts,
    activeArtifactId: ctx.activeArtifactId,
    artifactCreationMode: ctx.artifactCreationMode,
    isAppendingWaypoints: ctx.isAppendingWaypoints,
    draggedInfo: ctx.draggedInfo,
    artifactDisplayOptions: ctx.artifactDisplayOptions,
    pathCreationOptions: ctx.pathCreationOptions,
    events: ctx.events,
    activeEventId: ctx.activeEventId,
    canUndo: ctx.canUndo,
    canRedo: ctx.canRedo,
    setArtifacts: ctx.setArtifacts,
    setActiveArtifactId: ctx.setActiveArtifactId,
    setArtifactCreationMode: ctx.setArtifactCreationMode,
    setIsAppendingWaypoints: ctx.setIsAppendingWaypoints,
    setDraggedInfo: ctx.setDraggedInfo,
    setArtifactDisplayOptions: ctx.setArtifactDisplayOptions,
    setPathCreationOptions: ctx.setPathCreationOptions,
    setEvents: ctx.setEvents,
    setActiveEventId: ctx.setActiveEventId,
    onUpdateArtifact: ctx.onUpdateArtifact,
    onRemoveArtifact: ctx.onRemoveArtifact,
    onFinishArtifactCreation: ctx.onFinishArtifactCreation,
    onStartAppendWaypoints: ctx.onStartAppendWaypoints,
    onUpdateEvent: ctx.onUpdateEvent,
    onRemoveEvent: ctx.onRemoveEvent,
    onAddEvent: ctx.onAddEvent,
    onUndo: ctx.onUndo,
    onRedo: ctx.onRedo,
  }), [
    ctx.artifacts, ctx.activeArtifactId, ctx.artifactCreationMode, ctx.isAppendingWaypoints,
    ctx.draggedInfo, ctx.artifactDisplayOptions, ctx.pathCreationOptions, ctx.events,
    ctx.activeEventId, ctx.canUndo, ctx.canRedo, ctx.setArtifacts, ctx.setActiveArtifactId,
    ctx.setArtifactCreationMode, ctx.setIsAppendingWaypoints, ctx.setDraggedInfo,
    ctx.setArtifactDisplayOptions, ctx.setPathCreationOptions, ctx.setEvents,
    ctx.setActiveEventId, ctx.onUpdateArtifact, ctx.onRemoveArtifact,
    ctx.onFinishArtifactCreation, ctx.onStartAppendWaypoints, ctx.onUpdateEvent,
    ctx.onRemoveEvent, ctx.onAddEvent, ctx.onUndo, ctx.onRedo
  ]);
};

/** Hook for selection and hover state */
export const useSelectionState = () => {
  const ctx = useAppContext();
  return useMemo(() => ({
    selectedCells: ctx.selectedCells,
    selectionColor: ctx.selectionColor,
    selectedCellForPlot: ctx.selectedCellForPlot,
    selectedPixel: ctx.selectedPixel,
    hoveredCoords: ctx.hoveredCoords,
    timeSeriesData: ctx.timeSeriesData,
    daylightFractionHoverData: ctx.daylightFractionHoverData,
    setSelectedCells: ctx.setSelectedCells,
    setSelectionColor: ctx.setSelectionColor,
    setSelectedCellForPlot: ctx.setSelectedCellForPlot,
    setSelectedPixel: ctx.setSelectedPixel,
    setHoveredCoords: ctx.setHoveredCoords,
    clearHoverState: ctx.clearHoverState,
    onClearSelection: ctx.onClearSelection,
  }), [
    ctx.selectedCells, ctx.selectionColor, ctx.selectedCellForPlot, ctx.selectedPixel,
    ctx.hoveredCoords, ctx.timeSeriesData, ctx.daylightFractionHoverData,
    ctx.setSelectedCells, ctx.setSelectionColor, ctx.setSelectedCellForPlot,
    ctx.setSelectedPixel, ctx.setHoveredCoords, ctx.clearHoverState, ctx.onClearSelection
  ]);
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showError, showWarning, showSuccess } = useToast();
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const debouncedTimeRange = useDebounce(timeRange, 800); // Debounce expensive daylight fraction recalculations
  const [currentDateIndex, setCurrentDateIndex] = useState<number | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<GeoCoordinates>(null);
  const [showGraticule, setShowGraticule] = useState<boolean>(false);
  const [viewState, setViewState] = useState<ViewState | null>(null);
  const [graticuleDensity, setGraticuleDensity] = useState(1.0);
  const [graticuleLabelFontSize, setGraticuleLabelFontSize] = useState(14);
  const [activeTool, setActiveTool] = useState<Tool | null>('layers');

  const [selectedPixel, setSelectedPixel] = useState<PixelCoords & { layerId: string } | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<{ data: number[], range: { min: number, max: number } } | null>(null);
  const [timeZoomDomain, setTimeZoomDomain] = useState<TimeDomain | null>(null);
  const [daylightFractionHoverData, setDaylightFractionHoverData] = useState<DaylightFractionHoverData | null>(null);

  const [flickeringLayerId, setFlickeringLayerId] = useState<string | null>(null);
  const flickerIntervalRef = useRef<number | null>(null);
  const originalVisibilityRef = useRef<boolean | null>(null);

  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [gridSpacing, setGridSpacing] = useState<number>(200);
  const [gridColor, setGridColor] = useState<string>('#ffffff80');

  const [selectedCells, setSelectedCells] = useState<{ x: number, y: number }[]>([]);
  const [selectionColor, setSelectionColor] = useState<string>('#ffff00');
  const [selectedCellForPlot, setSelectedCellForPlot] = useState<{ x: number, y: number } | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(10);
  const animationFrameId = useRef<number | null>(null);
  const lastFrameTime = useRef<number>(0);
  const playbackRange = useRef<{ start: number, end: number } | null>(null);

  // Canvas cache cleaner - registered by DataCanvas component
  const canvasCacheCleanerRef = useRef<((layerId: string) => void) | null>(null);

  const [importRequest, setImportRequest] = useState<{ config: AppStateConfig, requiredFiles: string[] } | null>(null);

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [artifactCreationMode, setArtifactCreationMode] = useState<"circle" | "rectangle" | "free_rectangle" | "path" | null>(null);
  const [isAppendingWaypoints, setIsAppendingWaypoints] = useState<boolean>(false);
  const [draggedInfo, setDraggedInfo] = useState<{
    artifactId: string;
    waypointId?: string;
    isActivitySymbol?: boolean;
    initialMousePos: [number, number];
    initialCenter?: [number, number];
    initialWaypointProjPositions?: [number, number][];
    initialActivityOffset?: number;
    initialCorners?: { topLeft: [number, number]; topRight: [number, number]; bottomLeft: [number, number]; bottomRight: [number, number]; };
  } | null>(null);
  const [artifactDisplayOptions, setArtifactDisplayOptions] = useState({
    waypointDotSize: 8,
    showSegmentLengths: true,
    labelFontSize: 14,
    showActivitySymbols: true,
  });
  const [pathCreationOptions, setPathCreationOptions] = useState({
    defaultMaxSegmentLength: 200 as number | null, // in meters, null means no limit
  });

  // Load activity definitions from localStorage or use defaults
  const [activityDefinitions, setActivityDefinitions] = useState<ActivityDefinition[]>(() => {
    const STORAGE_KEY = 'lunagis_activity_definitions';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      logger.error('Error loading activity definitions:', error);
    }
    // Return default activity definitions
    return [
      { id: 'DRIVE-0', name: 'Drive-0', defaultDuration: 60 },
      { id: 'DRIVE-5', name: 'Drive-5', defaultDuration: 0 },
      { id: 'DRIVE-10', name: 'Drive-10', defaultDuration: 60 },
      { id: 'DRIVE-15', name: 'Drive-15', defaultDuration: 60 },
      { id: 'DTE_COMMS', name: 'TTC_COMMS', defaultDuration: 3600 },
      { id: 'LPF_COMMS', name: 'PL_COMMS', defaultDuration: 60 },
      { id: 'IDLE', name: 'Idle', defaultDuration: 60 },
      { id: 'SLEEP', name: 'Sleep', defaultDuration: 60 },
      { id: 'SCIENCE', name: 'Science', defaultDuration: 60 },
    ];
  });
  const [nightfallPlotYAxisRange, setNightfallPlotYAxisRange] = useState<{ min: number; max: number; }>({ min: -15, max: 15 });

  const [isCreatingExpression, setIsCreatingExpression] = useState(false);

  const [events, setEvents] = useState<Event[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  // Persist activity definitions to localStorage whenever they change
  useEffect(() => {
    const STORAGE_KEY = 'lunagis_activity_definitions';
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activityDefinitions));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to save activity definitions: ${errorMessage}`, 'Save Error');
    }
  }, [activityDefinitions, showError]);

  // Undo/Redo state (only for artifacts and events - layers contain non-serializable binary data)
  type HistoryState = {
    artifacts: Artifact[];
    events: Event[];
  };
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  // Function to save current state to undo stack (capped at MAX_HISTORY_STATES)
  const saveStateToHistory = useCallback(() => {
    const currentState: HistoryState = {
      // Deep clone artifacts and events for history
      artifacts: artifacts.map(a => {
        if (a.type === 'path') {
          return { ...a, waypoints: a.waypoints.map(w => ({ ...w, activities: w.activities ? [...w.activities] : undefined })) };
        }
        return { ...a };
      }) as Artifact[],
      events: events.map(e => ({ ...e })),
    };
    setUndoStack(prev => {
      const newStack = [...prev, currentState];
      // Cap the stack size to prevent memory issues
      if (newStack.length > MAX_HISTORY_STATES) {
        return newStack.slice(newStack.length - MAX_HISTORY_STATES);
      }
      return newStack;
    });
    setRedoStack([]); // Clear redo stack when new action is performed
  }, [artifacts, events]);

  const baseMapLayer = useMemo(() => layers.find(l => l.type === 'basemap') as BaseMapLayer | undefined, [layers]);
  const primaryDataLayer = useMemo(() =>
    layers.find(l => l.type === 'data' || l.type === 'illumination' || l.type === 'dte_comms' || l.type === 'lpf_comms') as DataLayer | undefined,
    [layers]
  );
  const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId), [layers, activeLayerId]);

  const proj = useMemo(() => (baseMapLayer ? proj4(baseMapLayer.vrt.srs) : null), [baseMapLayer]);

  const clearHoverState = () => {
    setHoveredCoords(null);
    setSelectedPixel(null);
  };

  // Register canvas cache cleaner (called by DataCanvas on mount)
  const registerCanvasCacheCleaner = useCallback((cleaner: ((layerId: string) => void) | null) => {
    canvasCacheCleanerRef.current = cleaner;
  }, []);

  // Layer-aware date conversion function
  const getDateForIndex = useCallback((index: number): Date => {
    // Use temporal info from illumination layers if available
    if (primaryDataLayer?.type === 'illumination' && primaryDataLayer.temporalInfo) {
      const { dates } = primaryDataLayer.temporalInfo;
      if (index >= 0 && index < dates.length) {
        return dates[index];
      }
    }
    // Fall back to index-based calculation
    return indexToDate(index);
  }, [primaryDataLayer]);

  // Layer-aware inverse: date to index conversion
  const getIndexForDate = useCallback((date: Date): number => {
    // Use temporal info from illumination layers if available
    if (primaryDataLayer?.type === 'illumination' && primaryDataLayer.temporalInfo) {
      const { dates } = primaryDataLayer.temporalInfo;

      // Find the closest time index by comparing timestamps
      let closestIndex = 0;
      let minDiff = Math.abs(dates[0].getTime() - date.getTime());

      for (let i = 1; i < dates.length; i++) {
        const diff = Math.abs(dates[i].getTime() - date.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }

      return closestIndex;
    }
    // Fall back to index-based calculation
    return dateToIndex(date);
  }, [primaryDataLayer]);

  const fullTimeDomain: TimeDomain | null = useMemo(() => {
    if (!primaryDataLayer) return null;

    // Use temporal info if available (from NetCDF illumination layers)
    if (primaryDataLayer.type === 'illumination' && primaryDataLayer.temporalInfo) {
      return [primaryDataLayer.temporalInfo.startDate, primaryDataLayer.temporalInfo.endDate];
    }

    // Otherwise use index-based dates
    return [indexToDate(0), indexToDate(primaryDataLayer.dimensions.time - 1)];
  }, [primaryDataLayer]);

  // Auto-update timeZoomDomain when fullTimeDomain changes (when switching between layers)
  useEffect(() => {
    if (fullTimeDomain && (!timeZoomDomain ||
      timeZoomDomain[0].getTime() !== fullTimeDomain[0].getTime() ||
      timeZoomDomain[1].getTime() !== fullTimeDomain[1].getTime())) {
      setTimeZoomDomain(fullTimeDomain);
    }
  }, [fullTimeDomain]);

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
    const [lonMin, lonMax] = LON_RANGE;
    const [latMin, latMax] = LAT_RANGE;

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

  useEffect(() => {
    // Prioritize selectedCellForPlot over selectedPixel (hover)
    if (selectedCellForPlot) {
      // Find the top visible data layer
      const topDataLayer = [...layers].reverse().find(l =>
        l.visible && (l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms' || l.type === 'illumination')
      );
      if (topDataLayer) {
        // Check if selected cell coordinates are within bounds for this layer
        if (selectedCellForPlot.y < topDataLayer.dimensions.height && selectedCellForPlot.x < topDataLayer.dimensions.width) {
          // Check if layer uses lazy loading
          if (topDataLayer.lazyDataset) {
            // Async: load time series from lazy dataset
            topDataLayer.lazyDataset.getPixelTimeSeries(selectedCellForPlot.y, selectedCellForPlot.x)
              .then(series => {
                setTimeSeriesData({ data: series, range: topDataLayer.range });
              })
              .catch(err => {
                console.error('Failed to load pixel time series:', err);
                setTimeSeriesData(null);
              });
          } else {
            // Traditional: extract from dataset array
            const series = topDataLayer.dataset.map(slice => slice?.[selectedCellForPlot.y]?.[selectedCellForPlot.x] ?? 0);
            setTimeSeriesData({ data: series, range: topDataLayer.range });
          }
        } else {
          setTimeSeriesData(null);
        }
      } else {
        setTimeSeriesData(null);
      }
    } else if (selectedPixel) {
      const layer = layers.find(l => l.id === selectedPixel.layerId);
      if (layer?.type === 'data' || (layer?.type === 'analysis') || layer?.type === 'dte_comms' || layer?.type === 'lpf_comms' || layer?.type === 'illumination') {
        // Check if selected pixel coordinates are within bounds for this layer
        if (selectedPixel.y < layer.dimensions.height && selectedPixel.x < layer.dimensions.width) {
          // Check if layer uses lazy loading
          if (layer.lazyDataset) {
            // Async: load time series from lazy dataset
            layer.lazyDataset.getPixelTimeSeries(selectedPixel.y, selectedPixel.x)
              .then(series => {
                setTimeSeriesData({ data: series, range: layer.range });
              })
              .catch(err => {
                console.error('Failed to load pixel time series:', err);
                setTimeSeriesData(null);
              });
          } else {
            // Traditional: extract from dataset array
            const series = layer.dataset.map(slice => slice?.[selectedPixel.y]?.[selectedPixel.x] ?? 0);
            setTimeSeriesData({ data: series, range: layer.range });
          }
        } else {
          setTimeSeriesData(null);
        }
      } else {
        setTimeSeriesData(null);
      }
    } else {
      setTimeSeriesData(null);
    }
  }, [selectedPixel, selectedCellForPlot, layers]);

  useEffect(() => {
    if (activeLayerId && selectedPixel && timeRange) {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer?.type === 'analysis' && activeLayer.analysisType === 'daylight_fraction') {
        const sourceLayer = layers.find(l => l.id === activeLayer.sourceLayerId) as DataLayer | undefined;
        if (sourceLayer) {
          const { x, y } = selectedPixel;
          // Check if coordinates are within bounds for source layer
          if (y >= sourceLayer.dimensions.height || x >= sourceLayer.dimensions.width) {
            setDaylightFractionHoverData(null);
            return;
          }

          const { start, end } = timeRange;
          const totalHours = end - start + 1;
          let dayHours = 0;

          let longestDay = 0, shortestDay = Infinity, dayPeriods = 0;
          let longestNight = 0, shortestNight = Infinity, nightPeriods = 0;
          let currentPeriodType: 'day' | 'night' | null = null;
          let currentPeriodLength = 0;

          for (let t = start; t <= end; t++) {
            if (t >= sourceLayer.dataset.length || !sourceLayer.dataset[t]) continue;
            const value = sourceLayer.dataset[t][y][x];
            if (value === 1) dayHours++;

            const currentType = value === 1 ? 'day' : 'night';
            if (currentPeriodType !== currentType) {
              if (currentPeriodType === 'day') {
                dayPeriods++;
                if (currentPeriodLength > longestDay) longestDay = currentPeriodLength;
                if (currentPeriodLength < shortestDay) shortestDay = currentPeriodLength;
              } else if (currentPeriodType === 'night') {
                nightPeriods++;
                if (currentPeriodLength > longestNight) longestNight = currentPeriodLength;
                if (currentPeriodLength < shortestNight) shortestNight = currentPeriodLength;
              }
              currentPeriodType = currentType;
              currentPeriodLength = 1;
            } else {
              currentPeriodLength++;
            }
          }

          if (currentPeriodType === 'day') {
            dayPeriods++;
            if (currentPeriodLength > longestDay) longestDay = currentPeriodLength;
            if (currentPeriodLength < shortestDay) shortestDay = currentPeriodLength;
          } else if (currentPeriodType === 'night') {
            nightPeriods++;
            if (currentPeriodLength > longestNight) longestNight = currentPeriodLength;
            if (currentPeriodLength < shortestNight) shortestNight = currentPeriodLength;
          }

          const nightHours = totalHours - dayHours;
          const fraction = totalHours > 0 ? (dayHours / totalHours) * 100 : 0;

          setDaylightFractionHoverData({
            fraction, dayHours, nightHours,
            longestDayPeriod: longestDay,
            shortestDayPeriod: shortestDay === Infinity ? 0 : shortestDay,
            dayPeriods,
            longestNightPeriod: longestNight,
            shortestNightPeriod: shortestNight === Infinity ? 0 : shortestNight,
            nightPeriods
          });
          return;
        }
      }
    }
    setDaylightFractionHoverData(null);
  }, [selectedPixel, activeLayerId, layers, timeRange]);

  const handleAddNpyLayer = useCallback(async (file: File, layerType: 'data' | 'dte_comms' | 'lpf_comms') => {
    if (!file) return;
    setIsLoading(`Parsing header for "${file.name}"...`);
    try {
      // Use streaming parser for large files (>100 MB)
      const useStreaming = file.size > 100 * 1024 * 1024;

      if (useStreaming) {
        // STREAMING PATH: Parse header only, create lazy dataset
        const metadata = await parseNpyHeader(file);

        if (metadata.dimensions.time === 0 || metadata.dimensions.height === 0 || metadata.dimensions.width === 0) {
          throw new Error(`Invalid dimensions: ${metadata.dimensions.time}×${metadata.dimensions.height}×${metadata.dimensions.width}`);
        }

        const { time, height, width } = metadata.dimensions;

        setIsLoading(`Creating lazy dataset (${(file.size / 1024 / 1024).toFixed(0)} MB file)...`);

        // Create lazy dataset with LRU cache
        const lazyDataset = new LazyDataset(file, metadata, {
          cacheSize: 20,          // Keep 20 time slices in memory
          preloadAdjacent: true,  // Preload nearby slices
          preloadDistance: 2      // Preload ±2 slices
        });

        // Set progress callback
        lazyDataset.setProgressCallback((progress) => {
          setIsLoading(progress.message);
        });

        setIsLoading('Loading first slice to determine range...');

        // Load first slice to determine data range
        const firstSlice = await lazyDataset.getSlice(0);
        let min = Infinity, max = -Infinity;
        for (const value of firstSlice) {
          if (value < min) min = value;
          if (value > max) max = value;
        }

        console.log(`📊 Lazy dataset created: ${time} time slices, ${(metadata.sliceSize / 1024 / 1024).toFixed(2)} MB per slice`);

        const newLayer: DataLayer | DteCommsLayer | LpfCommsLayer = {
          id: generateSecureId(layerType),
          name: file.name,
          type: layerType,
          visible: true,
          opacity: 1.0,
          fileName: file.name,
          dataset: [], // Empty - using lazy loading
          lazyDataset: lazyDataset,
          range: { min, max },
          colormap: 'Viridis',
          colormapInverted: false,
          customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
          dimensions: { time, height, width },
        };

        setLayers(prev => [...prev, newLayer]);
        setActiveLayerId(newLayer.id);

        if (layerType === 'data' && !primaryDataLayer) {
          const initialTimeRange = { start: 0, end: time - 1 };
          setTimeRange(initialTimeRange);
          setCurrentDateIndex(0);
          setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
          if (!viewState) {
            setViewState(null);
          }
        }

        console.log(`✅ NPY file loaded successfully (streaming mode)`);
      } else {
        // TRADITIONAL PATH: Load entire file (for small files < 100 MB)
        setIsLoading(`Loading "${file.name}"...`);
        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
        const arrayBuffer = await file.arrayBuffer();
        const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
        if (shape.length !== 3) throw new Error(`Expected a 3D array, but got ${shape.length} dimensions.`);

        const [height, width, time] = shape;
        let min = Infinity, max = -Infinity;
        for (const value of float32Array) { if (value < min) min = value; if (value > max) max = value; }

        const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));

        let flatIndex = 0;
        if (header.fortran_order) {
          for (let t = 0; t < time; t++) { for (let x = 0; x < width; x++) { for (let y = 0; y < height; y++) { dataset[t][y][x] = float32Array[flatIndex++]; } } if (t % 100 === 0) await yieldToMain(); }
        } else {
          for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) { for (let t = 0; t < time; t++) { dataset[t][y][x] = float32Array[flatIndex++]; } } if (y % 10 === 0) await yieldToMain(); }
        }

        const newLayer: DataLayer | DteCommsLayer | LpfCommsLayer = {
          id: generateSecureId(layerType), name: file.name, type: layerType, visible: true, opacity: 1.0,
          fileName: file.name, dataset, range: { min, max }, colormap: 'Viridis',
          colormapInverted: false,
          customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
          dimensions: { time, height, width },
        };

        setLayers(prev => [...prev, newLayer]);
        setActiveLayerId(newLayer.id);

        if (layerType === 'data' && !primaryDataLayer) {
          const initialTimeRange = { start: 0, end: time - 1 };
          setTimeRange(initialTimeRange);
          setCurrentDateIndex(0);
          setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
          if (!viewState) {
            setViewState(null);
          }
        }

        console.log(`✅ NPY file loaded successfully (traditional mode)`);
      }
    } catch (error) {
      showError(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(null);
    }
  }, [primaryDataLayer, viewState]);

  const onAddDataLayer = useCallback((file: File) => handleAddNpyLayer(file, 'data'), [handleAddNpyLayer]);
  const onAddDteCommsLayer = useCallback((file: File) => handleAddNpyLayer(file, 'dte_comms'), [handleAddNpyLayer]);
  const onAddLpfCommsLayer = useCallback((file: File) => handleAddNpyLayer(file, 'lpf_comms'), [handleAddNpyLayer]);

  const handleAddNetCdf4Layer = useCallback(async (file: File) => {
    if (!file) return;
    setIsLoading(`Parsing NetCDF4 file "${file.name}"...`);

    // Step 1: Disable all other layers and flush their cache to free up memory
    setLayers(currentLayers => {
      currentLayers.forEach(l => {
        if (l.visible && 'lazyDataset' in l && l.lazyDataset) {
          console.log(`Disabling layer ${l.name} and clearing cache to free memory`);
          l.lazyDataset.clearCache();
        }
      });
      return currentLayers.map(l => ({ ...l, visible: false }));
    });

    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Step 2: Always use lazy loading for NetCDF files to prevent OOM
      const arrayBuffer = await file.arrayBuffer();
      const { reader, shape, dimensions, metadata, coordinates } = await parseNetCdf4(arrayBuffer);
      const { time, height, width } = dimensions;

      // Calculate min/max from the first slice as an approximation
      let min = 0, max = 1;
      try {
        const firstSlice = await reader.getSlice(0);
        min = Infinity;
        max = -Infinity;
        // Sample the slice to avoid iterating everything if it's huge
        const step = Math.ceil(firstSlice.length / 10000);
        for (let i = 0; i < firstSlice.length; i += step) {
          const val = firstSlice[i];
          if (val < min) min = val;
          if (val > max) max = val;
        }
        // Ensure valid range
        if (!isFinite(min) || !isFinite(max) || min === max) {
          min = 0; max = 1;
        }
      } catch (e) {
        console.warn('Failed to calculate min/max from first slice:', e);
      }

      // Parse temporal info
      let temporalInfo: IlluminationLayer['temporalInfo'] = undefined;
      if (metadata.timeValues && metadata.timeUnit) {
        try {
          const dates = parseTimeValues(metadata.timeValues, metadata.timeUnit);
          temporalInfo = {
            dates,
            startDate: dates[0],
            endDate: dates[dates.length - 1]
          };
        } catch (error) {
          console.warn('Failed to parse temporal metadata:', error);
        }
      }

      // Calculate geospatial bounds
      let geospatial: IlluminationLayer['geospatial'] = undefined;
      if (coordinates && metadata.crs) {
        const { x: xCoords, y: yCoords } = coordinates;

        let projDef: string;
        if (metadata.crs.spatialRef) {
          projDef = metadata.crs.spatialRef;
        } else {
          projDef = '+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs';
        }

        try {
          const unproject = proj4(projDef, 'EPSG:4326');
          const xMin = xCoords[0];
          const xMax = xCoords[xCoords.length - 1];
          const yMin = yCoords[yCoords.length - 1];
          const yMax = yCoords[0];

          const tl = unproject.forward([xMin, yMax]);
          const tr = unproject.forward([xMax, yMax]);
          const bl = unproject.forward([xMin, yMin]);
          const br = unproject.forward([xMax, yMin]);

          const lons = [tl[0], tr[0], bl[0], br[0]];
          const lats = [tl[1], tr[1], bl[1], br[1]];

          geospatial = {
            projectedBounds: { xMin, xMax, yMin, yMax },
            geographicBounds: {
              lonMin: Math.min(...lons),
              lonMax: Math.max(...lons),
              latMin: Math.min(...lats),
              latMax: Math.max(...lats)
            },
            corners: {
              topLeft: { lon: tl[0], lat: tl[1] },
              topRight: { lon: tr[0], lat: tr[1] },
              bottomLeft: { lon: bl[0], lat: bl[1] },
              bottomRight: { lon: br[0], lat: br[1] }
            }
          };
        } catch (e) {
          console.warn('Failed to calculate geospatial bounds:', e);
        }
      }

      const newLayer: IlluminationLayer = {
        id: generateSecureId('illumination'),
        name: file.name,
        type: 'illumination',
        visible: true,
        opacity: 1.0,
        fileName: file.name,
        dataset: [], // Empty for lazy loading
        lazyDataset: reader,
        range: { min, max },
        colormap: 'Grayscale',
        colormapInverted: false,
        customColormap: [
          { value: min, color: '#000000' },
          { value: max, color: '#ffffff' }
        ],
        dimensions: { time, height, width },
        metadata: {
          title: metadata.title,
          institution: metadata.institution,
          source: metadata.source,
          conventions: metadata.conventions,
          variableName: metadata.variableName,
          timeUnit: metadata.timeUnit,
          timeValues: metadata.timeValues,
          crs: metadata.crs,
        },
        temporalInfo,
        geospatial,
      };

      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);

      if (!primaryDataLayer) {
        const initialTimeRange = { start: 0, end: time - 1 };
        setTimeRange(initialTimeRange);
        setCurrentDateIndex(0);

        if (temporalInfo) {
          setTimeZoomDomain([temporalInfo.startDate, temporalInfo.endDate]);
        } else {
          setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
        }

        if (!viewState && geospatial) {
          const { xMin, xMax, yMin, yMax } = geospatial.projectedBounds;
          const centerX = (xMin + xMax) / 2;
          const centerY = (yMin + yMax) / 2;
          const maxDim = Math.max(xMax - xMin, yMax - yMin);
          const scale = 800 / maxDim;
          setViewState({ center: [centerX, centerY], scale });
        } else if (!viewState) {
          setViewState(null);
        }
      }

      console.log(`✅ NetCDF file loaded successfully (lazy mode)`);
    } catch (error) {
      showError(`Error loading NetCDF4 file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(null);
    }
  }, [primaryDataLayer, viewState]);

  const onAddIlluminationLayer = useCallback((file: File) => handleAddNetCdf4Layer(file), [handleAddNetCdf4Layer]);

  const onAddBaseMapLayer = useCallback(async (pngFile: File, vrtFile: File) => {
    setIsLoading(`Loading basemap "${pngFile.name}"...`);
    try {
      const vrtContent = await vrtFile.text();
      const vrtData = parseVrt(vrtContent);

      const objectUrl = URL.createObjectURL(pngFile);
      const image = await dataUrlToImage(objectUrl);
      URL.revokeObjectURL(objectUrl);

      const newLayer: BaseMapLayer = {
        id: generateSecureId('basemap'), name: pngFile.name, type: 'basemap',
        visible: true, opacity: 1.0, image, vrt: vrtData,
        pngFileName: pngFile.name, vrtFileName: vrtFile.name,
      };

      setLayers(prev => [newLayer, ...prev]);
      setActiveLayerId(newLayer.id);
      // Only reset viewState if not already set to preserve user's zoom level
      if (!viewState) {
        setViewState(null);
      }
    } catch (error) {
      showError(`Error processing base map: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(null);
    }
  }, [viewState]);

  const onAddImageLayer = useCallback(async (file: File, initialPosition?: [number, number]) => {
    setIsLoading(`Loading image "${file.name}"...`);
    try {
      const objectUrl = URL.createObjectURL(file);
      const image = await dataUrlToImage(objectUrl);
      URL.revokeObjectURL(objectUrl);

      // Default position: center of current view or [0, 0]
      const position: [number, number] = initialPosition || (viewState ? viewState.center : [0, 0]);

      const newLayer: ImageLayer = {
        id: generateSecureId('image'),
        name: file.name,
        type: 'image',
        visible: true,
        opacity: 0.7, // Default to 70% opacity for overlay purposes
        image,
        fileName: file.name,
        position,
        scaleX: 1.0,
        scaleY: 1.0,
        rotation: 0,
        originalWidth: image.width,
        originalHeight: image.height,
      };

      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);
      showSuccess(`Image layer "${file.name}" added successfully`);
    } catch (error) {
      showError(`Error loading image: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(null);
    }
  }, [viewState, showSuccess, showError]);

  const onUpdateLayer = useCallback((id: string, updates: Partial<Layer>) => {
    setLayers(prevLayers =>
      prevLayers.map(l => (l.id === id ? ({ ...l, ...updates } as Layer) : l))
    );
  }, []);

  const onRemoveLayer = useCallback((id: string) => {
    // Find layer being removed and cleanup lazy dataset if it exists
    const layerToRemove = layers.find(l => l.id === id);
    if (layerToRemove && 'lazyDataset' in layerToRemove && layerToRemove.lazyDataset) {
      console.log(`Cleaning up lazy dataset for layer: ${layerToRemove.name}`);
      layerToRemove.lazyDataset.dispose();
    }

    // Clear canvas cache entries for this layer
    if (canvasCacheCleanerRef.current) {
      console.log(`Clearing canvas cache for layer: ${id}`);
      canvasCacheCleanerRef.current(id);
    }

    // Clear dataset array to help garbage collection
    if (layerToRemove && 'dataset' in layerToRemove) {
      (layerToRemove as DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer | IlluminationLayer).dataset = [];
      console.log(`Cleared dataset array for layer: ${layerToRemove.name}`);
    }

    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(null);

    // Hint to browser to perform garbage collection (only works in dev tools with manual GC)
    if (typeof global !== 'undefined' && (global as { gc?: () => void }).gc) {
      setTimeout(() => (global as { gc: () => void }).gc(), 100);
    }
  }, [activeLayerId, layers]);

  const onMoveLayerUp = useCallback((id: string) => {
    setLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index === -1 || index >= prev.length - 1) return prev; // Already at top or not found
      const newLayers = [...prev];
      [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
      return newLayers;
    });
  }, []);

  const onMoveLayerDown = useCallback((id: string) => {
    setLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index <= 0) return prev; // Already at bottom or not found
      const newLayers = [...prev];
      [newLayers[index - 1], newLayers[index]] = [newLayers[index], newLayers[index - 1]];
      return newLayers;
    });
  }, []);

  const onCalculateNightfallLayer = useCallback(async (sourceLayerId: string, threshold?: number) => {
    const sourceLayer = layers.find(l => l.id === sourceLayerId) as (DataLayer | IlluminationLayer) | undefined;
    if (!sourceLayer) return;

    setIsLoading(`Forecasting nightfall for "${sourceLayer.name}"...`);
    await new Promise(r => setTimeout(r, 50));

    // For illumination layers, use provided threshold or layer's default threshold
    const effectiveThreshold = sourceLayer.type === 'illumination'
      ? (threshold ?? sourceLayer.illuminationThreshold ?? 0)
      : undefined;

    const { dataset, range, maxDuration } = await analysisService.calculateNightfallDataset(sourceLayer, effectiveThreshold);

    const transparent = 'rgba(0,0,0,0)';
    const fourteenDaysInHours = 14 * 24; // 336

    const defaultCustomColormap: ColorStop[] = [
      { value: -Infinity, color: transparent },
      { value: -fourteenDaysInHours, color: 'cyan' },
      { value: 0, color: 'yellow' },
      { value: fourteenDaysInHours + 0.001, color: transparent }
    ];

    const defaultClip = Math.min(1000, Math.ceil(maxDuration / 24) * 24 || 24);

    const newLayer: AnalysisLayer = {
      id: generateSecureId('analysis'),
      name: `Nightfall Forecast for ${sourceLayer.name}`,
      type: 'analysis', analysisType: 'nightfall',
      visible: true, opacity: 1.0,
      colormap: 'Custom',
      colormapInverted: false,
      dataset, range,
      dimensions: sourceLayer.dimensions, sourceLayerId,
      customColormap: defaultCustomColormap,
      params: {
        clipValue: defaultClip,
        illuminationThreshold: effectiveThreshold
      },
    };

    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
    setIsLoading(null);
  }, [layers]);

  const onCalculateDaylightFractionLayer = useCallback((sourceLayerId: string, threshold?: number) => {
    const sourceLayer = layers.find(l => l.id === sourceLayerId) as (DataLayer | IlluminationLayer) | undefined;
    if (!sourceLayer || !timeRange) return;

    // For DataLayer, use default (1). For IlluminationLayer, use threshold or default to 0
    const effectiveThreshold = threshold !== undefined ? threshold : (sourceLayer.type === 'illumination' ? 0 : undefined);

    const { slice, range } = analysisService.calculateDaylightFraction(
      sourceLayer.dataset,
      timeRange,
      sourceLayer.dimensions,
      sourceLayer.id,
      effectiveThreshold
    );

    const resultDataset: DataSet = Array.from({ length: sourceLayer.dimensions.time }, () => slice);

    const newLayer: AnalysisLayer = {
      id: generateSecureId('analysis'),
      name: `Daylight Fraction for ${sourceLayer.name}`,
      type: 'analysis', analysisType: 'daylight_fraction',
      visible: true, opacity: 1.0, colormap: 'Turbo',
      dataset: resultDataset, range,
      dimensions: sourceLayer.dimensions, sourceLayerId,
      params: { illuminationThreshold: effectiveThreshold },
      // Copy geospatial and temporal info from illumination layers
      geospatial: sourceLayer.type === 'illumination' ? sourceLayer.geospatial : undefined,
      temporalInfo: sourceLayer.type === 'illumination' ? sourceLayer.temporalInfo : undefined,
    };

    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, [layers, timeRange]);

  const onCreateExpressionLayer = useCallback(async (name: string, expression: string) => {
    setIsLoading(`Calculating expression "${name}"...`);
    await new Promise(r => setTimeout(r, 50));
    try {
      const { dataset, range, dimensions } = await analysisService.calculateExpressionLayer(
        expression,
        layers,
        (progressMsg) => setIsLoading(progressMsg) // Pass progress callback
      );

      const newLayer: AnalysisLayer = {
        id: generateSecureId('analysis-expr'),
        name: name,
        type: 'analysis',
        analysisType: 'expression',
        visible: true,
        opacity: 1.0,
        colormap: 'Custom',
        dataset, range, dimensions,
        sourceLayerId: undefined, // Expression layers don't have a single source
        customColormap: [
          { value: -Infinity, color: 'rgba(0,0,0,0)' },
          { value: 1, color: '#ffff00' }
        ],
        params: { expression },
      };
      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);
      setIsCreatingExpression(false);
    } catch (e) {
      showError(`Expression Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(null);
    }
  }, [layers]);

  const onRecalculateExpressionLayer = useCallback(async (layerId: string, newExpression: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'analysis' || layer.analysisType !== 'expression') {
      showError('Invalid layer for expression recalculation');
      return;
    }

    setIsLoading(`Recalculating expression "${layer.name}"...`);
    await new Promise(r => setTimeout(r, 50));
    try {
      const { dataset, range, dimensions } = await analysisService.calculateExpressionLayer(
        newExpression,
        layers,
        (progressMsg) => setIsLoading(progressMsg)
      );

      // Update the existing layer with new dataset and expression
      setLayers(prev => prev.map(l => {
        if (l.id === layerId) {
          return {
            ...l,
            dataset,
            range,
            dimensions,
            params: { ...l.params, expression: newExpression }
          } as AnalysisLayer;
        }
        return l;
      }));
    } catch (e) {
      showError(`Expression Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(null);
    }
  }, [layers]);

  // Recalculate daylight fraction layers when time range changes (debounced for performance)
  useEffect(() => {
    if (!debouncedTimeRange) return;
    setLayers(currentLayers => {
      const fractionLayersToUpdate = currentLayers.filter(l => l.type === 'analysis' && l.analysisType === 'daylight_fraction');
      if (fractionLayersToUpdate.length === 0) return currentLayers;

      let hasChanged = false;
      const newLayers = currentLayers.map(l => {
        if (l.type === 'analysis' && l.analysisType === 'daylight_fraction') {
          const sourceLayer = currentLayers.find(src => src.id === l.sourceLayerId) as (DataLayer | IlluminationLayer) | undefined;
          if (sourceLayer) {
            const threshold = l.params.illuminationThreshold;
            const { slice, range } = analysisService.calculateDaylightFraction(sourceLayer.dataset, debouncedTimeRange, sourceLayer.dimensions, sourceLayer.id, threshold);
            const newDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
            hasChanged = true;
            return { ...l, dataset: newDataset, range };
          }
        }
        return l;
      });
      return hasChanged ? newLayers : currentLayers;
    });
  }, [debouncedTimeRange]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null; }
      return;
    }
    const animate = (timestamp: number) => {
      if (lastFrameTime.current === 0) lastFrameTime.current = timestamp;
      const elapsed = timestamp - lastFrameTime.current;
      const frameDuration = 1000 / playbackSpeed;
      if (elapsed >= frameDuration) {
        lastFrameTime.current = timestamp;
        setCurrentDateIndex(currentIndex => {
          if (currentIndex === null || !playbackRange.current) return currentIndex;
          let newTime = currentIndex + 1;
          if (newTime > playbackRange.current.end) newTime = playbackRange.current.start;
          return newTime;
        });
      }
      animationFrameId.current = requestAnimationFrame(animate);
    };
    animationFrameId.current = requestAnimationFrame(animate);
    return () => { if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null; lastFrameTime.current = 0; } };
  }, [isPlaying, playbackSpeed]);

  const onTogglePlay = useCallback(() => {
    const aboutToPlay = !isPlaying;
    if (aboutToPlay) {
      if (!isPaused) {
        if (!timeRange || timeRange.start >= timeRange.end) return;
        playbackRange.current = { ...timeRange };
        setCurrentDateIndex(timeRange.start);
      }
      setIsPaused(false);
      setIsPlaying(true);
    } else {
      setIsPaused(true);
      setIsPlaying(false);
    }
  }, [isPlaying, isPaused, timeRange]);

  const handleManualTimeRangeChange = (newRange: TimeRange) => {
    if (isPlaying) setIsPlaying(false);
    setIsPaused(false);
    playbackRange.current = null;
    setTimeRange(newRange);
  };

  const onUpdateArtifact = useCallback((id: string, updates: Partial<Artifact>) => {
    saveStateToHistory();
    setArtifacts(prev => prev.map(a => (a.id === id ? { ...a, ...updates } as Artifact : a)));
  }, [saveStateToHistory]);

  const onFinishArtifactCreation = useCallback(() => {
    setArtifactCreationMode(null);
    setIsAppendingWaypoints(false);
    setActiveArtifactId(null); // Clear active artifact to allow creating new paths
  }, []);

  const onStartAppendWaypoints = useCallback(() => {
    setIsAppendingWaypoints(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onFinishArtifactCreation();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onFinishArtifactCreation]);

  const onRemoveArtifact = useCallback((id: string) => {
    saveStateToHistory();
    setArtifacts(prev => prev.filter(a => a.id !== id));
    if (activeArtifactId === id) setActiveArtifactId(null);
  }, [activeArtifactId, saveStateToHistory]);

  const onUpdateEvent = useCallback((id: string, updates: Partial<Event>) => {
    saveStateToHistory();
    setEvents(prev => prev.map(e => (e.id === id ? { ...e, ...updates } as Event : e)));
  }, [saveStateToHistory]);

  const onRemoveEvent = useCallback((id: string) => {
    saveStateToHistory();
    setEvents(prev => prev.filter(e => e.id !== id));
    if (activeEventId === id) setActiveEventId(null);
  }, [activeEventId, saveStateToHistory]);

  const onAddEvent = useCallback((event: Event) => {
    saveStateToHistory();
    setEvents(prev => [...prev, event]);
    setActiveEventId(event.id);
  }, [saveStateToHistory]);

  // Helper function for cloning history state
  const cloneHistoryState = useCallback((): HistoryState => ({
    artifacts: artifacts.map(a => {
      if (a.type === 'path') {
        return { ...a, waypoints: a.waypoints.map(w => ({ ...w, activities: w.activities ? [...w.activities] : undefined })) };
      }
      return { ...a };
    }) as Artifact[],
    events: events.map(e => ({ ...e })),
  }), [artifacts, events]);

  // Undo/Redo handlers
  const onUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const currentState = cloneHistoryState();
    const previousState = undoStack[undoStack.length - 1];
    setArtifacts(previousState.artifacts);
    setEvents(previousState.events);

    setRedoStack(prev => {
      const newStack = [...prev, currentState];
      if (newStack.length > MAX_HISTORY_STATES) {
        return newStack.slice(newStack.length - MAX_HISTORY_STATES);
      }
      return newStack;
    });
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack, cloneHistoryState]);

  const onRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const currentState = cloneHistoryState();
    const nextState = redoStack[redoStack.length - 1];
    setArtifacts(nextState.artifacts);
    setEvents(nextState.events);

    setUndoStack(prev => {
      const newStack = [...prev, currentState];
      if (newStack.length > MAX_HISTORY_STATES) {
        return newStack.slice(newStack.length - MAX_HISTORY_STATES);
      }
      return newStack;
    });
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack, cloneHistoryState]);

  const onClearSelection = useCallback(() => { setSelectedCells([]); }, []);

  const onZoomToSelection = useCallback(() => {
    if (!timeRange || !fullTimeDomain) return;
    let newDomain: TimeDomain;
    if (timeRange.start === timeRange.end) {
      const centerDate = indexToDate(timeRange.start);
      const twelveHours = 12 * 60 * 60 * 1000;
      newDomain = [new Date(Math.max(fullTimeDomain[0].getTime(), centerDate.getTime() - twelveHours)), new Date(Math.min(fullTimeDomain[1].getTime(), centerDate.getTime() + twelveHours))];
    } else {
      newDomain = [indexToDate(timeRange.start), indexToDate(timeRange.end)];
    }
    setTimeZoomDomain(newDomain);
  }, [timeRange, fullTimeDomain]);

  const onResetZoom = useCallback(() => { if (fullTimeDomain) setTimeZoomDomain(fullTimeDomain); }, [fullTimeDomain]);

  const onToggleFlicker = useCallback((layerId: string) => {
    const currentlyFlickeringId = flickeringLayerId;
    if (flickerIntervalRef.current) { clearInterval(flickerIntervalRef.current); flickerIntervalRef.current = null; }
    if (currentlyFlickeringId && originalVisibilityRef.current !== null) { onUpdateLayer(currentlyFlickeringId, { visible: originalVisibilityRef.current }); }
    if (currentlyFlickeringId === layerId) { setFlickeringLayerId(null); originalVisibilityRef.current = null; }
    else {
      const layerToFlicker = layers.find(l => l.id === layerId);
      if (layerToFlicker) { originalVisibilityRef.current = layerToFlicker.visible; setFlickeringLayerId(layerId); }
    }
  }, [layers, flickeringLayerId, onUpdateLayer]);

  const onToolSelect = useCallback((tool: Tool) => {
    // Toggle: if clicking the same tool, collapse the panel
    setActiveTool(current => current === tool ? null : tool);
  }, []);

  useEffect(() => {
    if (flickeringLayerId) {
      flickerIntervalRef.current = window.setInterval(() => {
        setLayers(prevLayers => prevLayers.map(l => l.id === flickeringLayerId ? { ...l, visible: !l.visible } : l));
      }, 400);
    }
    return () => { if (flickerIntervalRef.current) { clearInterval(flickerIntervalRef.current); flickerIntervalRef.current = null; } };
  }, [flickeringLayerId]);

  const onExportConfig = useCallback(async () => {
    if (layers.length === 0) { showWarning("Cannot export an empty session."); return; }
    setIsLoading("Exporting session...");
    try {
      const serializableLayers: SerializableLayer[] = layers.map((l): SerializableLayer => {
        if (l.type === 'basemap') {
          const { image, ...rest } = l; // Omit non-serializable image element
          return rest;
        } else if (l.type === 'image') {
          // Convert image to data URL for export
          const canvas = document.createElement('canvas');
          canvas.width = l.image.width;
          canvas.height = l.image.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(l.image, 0, 0);
          const imageDataUrl = canvas.toDataURL('image/png');
          const { image, ...rest } = l;
          return { ...rest, imageDataUrl };
        } else { // data, analysis, or comms
          const { dataset, ...rest } = l; // Omit large dataset
          return rest;
        }
      });

      const config: AppStateConfig = {
        version: 1,
        layers: serializableLayers,
        activeLayerId,
        timeRange,
        timeZoomDomain: timeZoomDomain ? [timeZoomDomain[0].toISOString(), timeZoomDomain[1].toISOString()] : null,
        viewState,
        showGraticule,
        graticuleDensity,
        showGrid,
        gridSpacing,
        gridColor,
        selectedCells,
        selectionColor,
        activeTool,
        artifacts: artifacts.map(a => ({ ...a })),
        artifactDisplayOptions,
        pathCreationOptions,
        activityDefinitions,
        nightfallPlotYAxisRange,
        events: events.map(e => ({ ...e })),
      };

      const jsonString = JSON.stringify(config, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      showError(`Error exporting session: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(null);
    }
  }, [layers, activeLayerId, timeRange, timeZoomDomain, viewState, showGraticule, graticuleDensity, showGrid, gridSpacing, gridColor, selectedCells, selectionColor, activeTool, artifacts, artifactDisplayOptions, pathCreationOptions, activityDefinitions, nightfallPlotYAxisRange]);

  const onImportConfig = useCallback((file: File) => {
    setIsLoading("Reading config file...");
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target?.result as string) as AppStateConfig;
        if (config.version !== 1) { throw new Error("Unsupported config version."); }

        const requiredFiles: string[] = [];
        for (const l of config.layers) {
          if (l.type === 'data' || l.type === 'dte_comms' || l.type === 'lpf_comms') {
            requiredFiles.push(l.fileName);
          } else if (l.type === 'basemap') {
            requiredFiles.push(l.pngFileName);
            requiredFiles.push(l.vrtFileName);
          }
          // Image layers don't need separate files - they're embedded as data URLs
        }

        if (requiredFiles.length > 0) {
          setImportRequest({ config, requiredFiles });
        } else {
          handleRestoreSession(config, []); // No files required
        }
      } catch (e) {
        showError(`Error reading config file: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsLoading(null);
      }
    };
    reader.onerror = () => {
      showError("Failed to read the file.");
      setIsLoading(null);
    };
    reader.readAsText(file);
  }, []);

  const handleRestoreSession = useCallback(async (config: AppStateConfig, files: FileList | File[]) => {
    setImportRequest(null);
    setIsLoading("Restoring session...");

    try {
      const fileMap = new Map<string, File>();
      Array.from(files).forEach(f => fileMap.set(f.name, f));

      // Reset state
      setLayers([]); setTimeRange(null); setTimeZoomDomain(null); setViewState(null); setSelectedCells([]); setArtifacts([]); setEvents([]);

      let newLayers: Layer[] = [];

      // 1. Load BaseMap and Data layers
      const nonAnalysisLayers = config.layers.filter(l => l.type !== 'analysis');
      const totalNonAnalysisLayers = nonAnalysisLayers.length;
      let processedLayers = 0;

      for (const sLayer of config.layers) {
        if (sLayer.type === 'basemap') {
          processedLayers++;
          const progress = Math.floor((processedLayers / totalNonAnalysisLayers) * 100);
          setIsLoading(`Loading layer ${processedLayers} of ${totalNonAnalysisLayers}... ${progress}%`);

          const pngFile = fileMap.get(sLayer.pngFileName);
          const vrtFile = fileMap.get(sLayer.vrtFileName);
          if (!pngFile) throw new Error(`Required file "${sLayer.pngFileName}" was not provided.`);
          if (!vrtFile) throw new Error(`Required file "${sLayer.vrtFileName}" was not provided.`);

          const vrtContent = await vrtFile.text();
          const vrtData = parseVrt(vrtContent);

          const objectUrl = URL.createObjectURL(pngFile);
          const image = await dataUrlToImage(objectUrl);
          URL.revokeObjectURL(objectUrl);

          const layer: BaseMapLayer = { ...sLayer, image, vrt: vrtData };
          newLayers.push(layer);

        } else if (sLayer.type === 'data' || sLayer.type === 'dte_comms' || sLayer.type === 'lpf_comms') {
          processedLayers++;
          const progress = Math.floor((processedLayers / totalNonAnalysisLayers) * 100);
          setIsLoading(`Loading layer ${processedLayers} of ${totalNonAnalysisLayers}... ${progress}%`);

          const file = fileMap.get(sLayer.fileName);
          if (!file) throw new Error(`Required file "${sLayer.fileName}" was not provided.`);

          const arrayBuffer = await file.arrayBuffer();
          const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
          const [height, width, time] = shape;
          const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));
          let flatIndex = 0;
          if (header.fortran_order) { for (let t = 0; t < time; t++) for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) dataset[t][y][x] = float32Array[flatIndex++]; }
          else { for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let t = 0; t < time; t++) dataset[t][y][x] = float32Array[flatIndex++]; }

          const layer: DataLayer | DteCommsLayer | LpfCommsLayer = { ...sLayer, dataset };
          newLayers.push(layer);
        } else if (sLayer.type === 'image') {
          processedLayers++;
          const progress = Math.floor((processedLayers / totalNonAnalysisLayers) * 100);
          setIsLoading(`Loading layer ${processedLayers} of ${totalNonAnalysisLayers}... ${progress}%`);

          // Load image from embedded data URL
          const image = await dataUrlToImage(sLayer.imageDataUrl);
          const { imageDataUrl, ...rest } = sLayer;
          const layer: ImageLayer = { ...rest, image };
          newLayers.push(layer);
        }
      }

      // 2. Re-calculate Analysis layers in a second pass
      let finalLayers = [...newLayers];
      for (const sLayer of config.layers) {
        if (sLayer.type === 'analysis') {
          let calculatedDataset: DataSet;
          let finalAnalysisLayer: AnalysisLayer;

          if (sLayer.analysisType === 'expression' && sLayer.params.expression) {
            const { dataset } = await analysisService.calculateExpressionLayer(
              sLayer.params.expression,
              finalLayers,
              (progressMsg) => setIsLoading(progressMsg)
            );
            calculatedDataset = dataset;
            finalAnalysisLayer = { ...sLayer, dataset: calculatedDataset };
          } else {
            const sourceLayer = finalLayers.find(l => l.id === sLayer.sourceLayerId) as (DataLayer | IlluminationLayer) | undefined;
            if (!sourceLayer) throw new Error(`Source layer with ID ${sLayer.sourceLayerId} not found for analysis layer "${sLayer.name}".`);

            if (sLayer.analysisType === 'nightfall') {
              const threshold = sLayer.params.illuminationThreshold;
              const { dataset } = await analysisService.calculateNightfallDataset(sourceLayer, threshold);
              calculatedDataset = dataset;
            } else { // daylight_fraction
              const calcTimeRange = config.timeRange || { start: 0, end: sourceLayer.dimensions.time - 1 };
              const threshold = sLayer.params.illuminationThreshold;
              const { slice } = analysisService.calculateDaylightFraction(sourceLayer.dataset, calcTimeRange, sourceLayer.dimensions, sourceLayer.id, threshold);
              calculatedDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
            }
            finalAnalysisLayer = { ...sLayer, dataset: calculatedDataset };
          }
          finalLayers.push(finalAnalysisLayer);
        }
      }

      // 3. Set final state
      setLayers(finalLayers);
      setActiveLayerId(config.activeLayerId);
      setTimeRange(config.timeRange);
      setCurrentDateIndex(config.timeRange?.start ?? null);
      setViewState(config.viewState);
      setShowGraticule(config.showGraticule);
      setGraticuleDensity(config.graticuleDensity);
      setShowGrid(config.showGrid);
      setGridSpacing(config.gridSpacing);
      setGridColor(config.gridColor);
      setSelectedCells(config.selectedCells);
      setSelectionColor(config.selectionColor);
      setActiveTool(config.activeTool);
      setArtifacts(config.artifacts || []);
      setEvents(config.events || []);
      if (config.timeZoomDomain) {
        setTimeZoomDomain([new Date(config.timeZoomDomain[0]), new Date(config.timeZoomDomain[1])]);
      }
      setArtifactDisplayOptions(config.artifactDisplayOptions || { waypointDotSize: 8, showSegmentLengths: true, labelFontSize: 14, showActivitySymbols: true });
      setPathCreationOptions(config.pathCreationOptions || { defaultMaxSegmentLength: 200 });
      setActivityDefinitions(config.activityDefinitions || [
        { id: 'DRIVE-0', name: 'Drive-0', defaultDuration: 60 },
        { id: 'DRIVE-5', name: 'Drive-5', defaultDuration: 0 },
        { id: 'DRIVE-10', name: 'Drive-10', defaultDuration: 60 },
        { id: 'DRIVE-15', name: 'Drive-15', defaultDuration: 60 },
        { id: 'DTE_COMMS', name: 'TTC_COMMS', defaultDuration: 3600 },
        { id: 'LPF_COMMS', name: 'PL_COMMS', defaultDuration: 60 },
        { id: 'IDLE', name: 'Idle', defaultDuration: 60 },
        { id: 'SLEEP', name: 'Sleep', defaultDuration: 60 },
        { id: 'SCIENCE', name: 'Science', defaultDuration: 60 },
      ]);
      setNightfallPlotYAxisRange(config.nightfallPlotYAxisRange || { min: -15, max: 15 });

    } catch (e) {
      showError(`Error restoring session: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoading(null);
    }
  }, []);


  // Memoize context value to prevent unnecessary re-renders
  // Only recreate when actual dependencies change, not on every AppProvider render
  const value: AppContextType = useMemo(() => ({
    layers,
    activeLayerId,
    isLoading,
    timeRange,
    currentDateIndex,
    hoveredCoords,
    showGraticule,
    viewState,
    graticuleDensity,
    graticuleLabelFontSize,
    activeTool,
    selectedPixel,
    timeSeriesData,
    timeZoomDomain,
    daylightFractionHoverData,
    flickeringLayerId,
    showGrid,
    gridSpacing,
    gridColor,
    selectedCells,
    selectionColor,
    selectedCellForPlot,
    isPlaying,
    isPaused,
    playbackSpeed,
    importRequest,
    artifacts,
    activeArtifactId,
    artifactCreationMode,
    isAppendingWaypoints,
    draggedInfo,
    artifactDisplayOptions,
    nightfallPlotYAxisRange,
    isCreatingExpression,
    events,
    activeEventId,
    baseMapLayer,
    primaryDataLayer,
    activeLayer,
    proj,
    fullTimeDomain,
    getDateForIndex,
    getIndexForDate,
    coordinateTransformer,
    snapToCellCorner,
    calculateRectangleFromCellCorners,
    setLayers,
    setActiveLayerId,
    setIsLoading,
    setTimeRange,
    setCurrentDateIndex,
    setHoveredCoords,
    setShowGraticule,
    setViewState,
    setGraticuleDensity,
    setGraticuleLabelFontSize,
    onToolSelect,
    setSelectedPixel,
    setTimeZoomDomain,
    onToggleFlicker,
    setShowGrid,
    setGridSpacing,
    setGridColor,
    setSelectedCells,
    setSelectionColor,
    setSelectedCellForPlot,
    setIsPlaying,
    setIsPaused,
    onPlaybackSpeedChange: setPlaybackSpeed,
    setImportRequest,
    setArtifacts,
    setActiveArtifactId,
    setArtifactCreationMode,
    setIsAppendingWaypoints,
    setDraggedInfo,
    setArtifactDisplayOptions,
    pathCreationOptions,
    setPathCreationOptions,
    activityDefinitions,
    setActivityDefinitions,
    onNightfallPlotYAxisRangeChange: setNightfallPlotYAxisRange,
    setIsCreatingExpression,
    setEvents,
    setActiveEventId,
    onUpdateEvent,
    onRemoveEvent,
    onAddEvent,
    registerCanvasCacheCleaner,
    clearHoverState,
    onAddDataLayer,
    onAddDteCommsLayer,
    onAddLpfCommsLayer,
    onAddIlluminationLayer,
    onAddBaseMapLayer,
    onAddImageLayer,
    onUpdateLayer,
    onRemoveLayer,
    onMoveLayerUp,
    onMoveLayerDown,
    onCalculateNightfallLayer,
    onCalculateDaylightFractionLayer,
    onCreateExpressionLayer,
    onRecalculateExpressionLayer,
    handleManualTimeRangeChange,
    onTogglePlay,
    onUpdateArtifact,
    onRemoveArtifact,
    onFinishArtifactCreation,
    onStartAppendWaypoints,
    onClearSelection,
    onZoomToSelection,
    onResetZoom,
    onExportConfig,
    onImportConfig,
    handleRestoreSession,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    onUndo,
    onRedo,
    latRange: LAT_RANGE,
    lonRange: LON_RANGE
  }), [
    // State values
    layers, activeLayerId, isLoading, timeRange, currentDateIndex, hoveredCoords,
    showGraticule, viewState, graticuleDensity, graticuleLabelFontSize, activeTool, selectedPixel,
    timeSeriesData, timeZoomDomain, daylightFractionHoverData, flickeringLayerId,
    showGrid, gridSpacing, gridColor, selectedCells, selectionColor, selectedCellForPlot,
    isPlaying, isPaused, playbackSpeed, importRequest, artifacts, activeArtifactId,
    artifactCreationMode, isAppendingWaypoints, draggedInfo, artifactDisplayOptions,
    nightfallPlotYAxisRange, isCreatingExpression, events, activeEventId,
    // Derived values
    baseMapLayer, primaryDataLayer, activeLayer, proj, fullTimeDomain, getDateForIndex, getIndexForDate,
    coordinateTransformer, snapToCellCorner, calculateRectangleFromCellCorners,
    pathCreationOptions, activityDefinitions, undoStack.length, redoStack.length,
    // Callbacks (stable across renders due to useCallback)
    setLayers, setActiveLayerId, setIsLoading, setTimeRange, setCurrentDateIndex,
    setHoveredCoords, setShowGraticule, setViewState, setGraticuleDensity, setGraticuleLabelFontSize,
    setActiveTool, setSelectedPixel, setTimeZoomDomain, onToggleFlicker,
    setShowGrid, setGridSpacing, setGridColor, setSelectedCells, setSelectionColor,
    setSelectedCellForPlot, setIsPlaying, setIsPaused, setPlaybackSpeed,
    setImportRequest, setArtifacts, setActiveArtifactId, setArtifactCreationMode,
    setIsAppendingWaypoints, setDraggedInfo, setArtifactDisplayOptions,
    setPathCreationOptions, setActivityDefinitions, setNightfallPlotYAxisRange,
    setIsCreatingExpression, setEvents, setActiveEventId, onUpdateEvent,
    onRemoveEvent, onAddEvent, registerCanvasCacheCleaner, clearHoverState, onAddDataLayer, onAddDteCommsLayer,
    onAddLpfCommsLayer, onAddIlluminationLayer, onAddBaseMapLayer, onAddImageLayer, onUpdateLayer,
    onRemoveLayer, onMoveLayerUp, onMoveLayerDown, onCalculateNightfallLayer,
    onCalculateDaylightFractionLayer, onCreateExpressionLayer, onRecalculateExpressionLayer,
    handleManualTimeRangeChange, onTogglePlay, onUpdateArtifact, onRemoveArtifact,
    onFinishArtifactCreation, onStartAppendWaypoints, onClearSelection,
    onZoomToSelection, onResetZoom, onExportConfig, onImportConfig,
    handleRestoreSession, onUndo, onRedo
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};