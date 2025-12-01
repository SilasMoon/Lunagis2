// Fix: Removed invalid file header which was causing parsing errors.
// Fix: Define VrtData interface here to break the circular dependency with vrtParser.ts.

import type { ILazyDataset } from './services/LazyDataset';

export interface VrtData {
  geoTransform: number[];
  srs: string;
  width: number;
  height: number;
}

export const COLOR_MAPS = ['Viridis', 'Plasma', 'Inferno', 'Magma', 'Cividis', 'Turbo', 'Grayscale', 'Custom', 'DivergingThreshold'] as const;
export type ColorMapName = typeof COLOR_MAPS[number];

export interface DivergingThresholdConfig {
  centerValue: number;          // Value at the center of the diverging scale (e.g., 0)
  centerColor: string;          // Color at center (e.g., 'white', 'rgba(255,255,255,1)')

  // Upper gradient (center to upperThreshold)
  upperThreshold: number;       // Upper threshold value (e.g., 200)
  upperColor: string;           // Color at upper threshold (e.g., 'orange')
  upperOverflowColor: string;   // Color for values > upperThreshold (e.g., 'red')

  // Lower gradient (lowerThreshold to center)
  lowerThreshold: number;       // Lower threshold value (e.g., -200)
  lowerColor: string;           // Color at lower threshold (e.g., 'darkblue')
  lowerOverflowColor: string;   // Color for values < lowerThreshold (e.g., 'black')
}

export type DataPoint = number;
export type DataRow = DataPoint[];
export type DataSlice = DataRow[]; // A 2D slice (Height x Width)
export type DataSet = DataSlice[]; // An array of 2D slices over time (Time x Height x Width)

export interface DataWithRange {
  dataset: DataSet;
  min: number;
  max: number;
}

export type GeoCoordinates = { lat: number; lon: number } | null;
export type PixelCoords = { x: number; y: number } | null;

export interface ViewState {
  center: [number, number]; // Projected coordinates [x, y]
  scale: number; // Pixels per projected unit
}

export type TimeRange = { start: number; end: number };
export type TimeDomain = [Date, Date];
export type Tool = 'layers' | 'measurement' | 'config' | 'artifacts' | 'events';

export type ColorStop = { value: number; color: string; };

export interface DaylightFractionHoverData {
  fraction: number;
  dayHours: number;
  nightHours: number;
  longestDayPeriod: number;
  shortestDayPeriod: number;
  dayPeriods: number;
  longestNightPeriod: number;
  shortestNightPeriod: number;
  nightPeriods: number;
}


// --- Layer Architecture Types ---

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export interface BaseMapLayer extends LayerBase {
  type: 'basemap';
  image: HTMLImageElement;
  vrt: VrtData;
  pngFileName: string;
  vrtFileName: string;
}

export interface DataLayer extends LayerBase {
  type: 'data';
  dataset: DataSet;
  lazyDataset?: ILazyDataset; // Optional lazy loading for large files
  fileName: string; // Original file name for session saving
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  divergingThresholdConfig?: DivergingThresholdConfig;
  transparencyLowerThreshold?: number; // Values <= this become transparent
  transparencyUpperThreshold?: number; // Values >= this become transparent
  dimensions: { time: number; height: number; width: number };
}

export interface DteCommsLayer extends LayerBase {
  type: 'dte_comms';
  dataset: DataSet;
  lazyDataset?: ILazyDataset; // Optional lazy loading for large files
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  divergingThresholdConfig?: DivergingThresholdConfig;
  transparencyLowerThreshold?: number; // Values <= this become transparent
  transparencyUpperThreshold?: number; // Values >= this become transparent
  dimensions: { time: number; height: number; width: number };
}

export interface LpfCommsLayer extends LayerBase {
  type: 'lpf_comms';
  dataset: DataSet;
  lazyDataset?: ILazyDataset; // Optional lazy loading for large files
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  divergingThresholdConfig?: DivergingThresholdConfig;
  transparencyLowerThreshold?: number; // Values <= this become transparent
  transparencyUpperThreshold?: number; // Values >= this become transparent
  dimensions: { time: number; height: number; width: number };
}

export interface IlluminationLayer extends LayerBase {
  type: 'illumination';
  dataset: DataSet;
  lazyDataset?: ILazyDataset; // Optional lazy loading for large files
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  divergingThresholdConfig?: DivergingThresholdConfig;
  transparencyLowerThreshold?: number; // Values <= this become transparent
  transparencyUpperThreshold?: number; // Values >= this become transparent
  dimensions: { time: number; height: number; width: number };
  // NetCDF4-specific metadata
  metadata?: {
    title?: string;
    institution?: string;
    source?: string;
    conventions?: string;
    variableName?: string;
    timeUnit?: string;
    timeValues?: number[];
    crs?: {
      projection: string;
      latitudeOfOrigin?: number;
      centralMeridian?: number;
      semiMajorAxis?: number;
      spatialRef?: string;  // Proj4 string
    };
  };
  // Temporal information - parsed dates for each time index
  temporalInfo?: {
    dates: Date[];  // Array of actual dates, one per time index
    startDate: Date;  // First date
    endDate: Date;    // Last date
  };
  // Geospatial metadata - projected coordinates from NetCDF
  geospatial?: {
    // Projected coordinates in meters (from NetCDF x/y variables)
    projectedBounds: {
      xMin: number;  // meters
      xMax: number;  // meters
      yMin: number;  // meters
      yMax: number;  // meters
    };
    // Geographic bounds (computed from projected bounds using proj.inverse)
    geographicBounds: {
      latMin: number;
      latMax: number;
      lonMin: number;
      lonMax: number;
    };
    // Actual corner coordinates in lat/lon (for display with polar projections)
    corners: {
      topLeft: { lat: number; lon: number };
      topRight: { lat: number; lon: number };
      bottomLeft: { lat: number; lon: number };
      bottomRight: { lat: number; lon: number };
    };
  };
  // Debug options for axis flipping
  debugFlipX?: boolean;
  debugFlipY?: boolean;
  // Illumination threshold for daylight fraction calculation
  illuminationThreshold?: number;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  image: HTMLImageElement;
  fileName: string;
  // Transformation properties (all in projected coordinate space)
  position: [number, number]; // Center position [x, y] in projected coordinates
  scaleX: number; // Horizontal scale factor (1.0 = original size)
  scaleY: number; // Vertical scale factor (1.0 = original size)
  rotation: number; // Rotation angle in degrees
  // Original image dimensions
  originalWidth: number;
  originalHeight: number;
}

export type AnalysisType = 'nightfall' | 'daylight_fraction' | 'expression';

export interface AnalysisLayer extends LayerBase {
  type: 'analysis';
  analysisType: AnalysisType;
  dataset: DataSet;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  divergingThresholdConfig?: DivergingThresholdConfig;
  transparencyLowerThreshold?: number; // Values <= this become transparent
  transparencyUpperThreshold?: number; // Values >= this become transparent
  dimensions: { time: number; height: number; width: number };
  sourceLayerId?: string;
  params: {
    clipValue?: number;
    expression?: string;
    illuminationThreshold?: number; // Threshold for daylight fraction on illumination layers
  };
  // Geospatial metadata (inherited from source illumination layer)
  geospatial?: {
    projectedBounds: {
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
    };
    geographicBounds: {
      latMin: number;
      latMax: number;
      lonMin: number;
      lonMax: number;
    };
    corners: {
      topLeft: { lat: number; lon: number };
      topRight: { lat: number; lon: number };
      bottomLeft: { lat: number; lon: number };
      bottomRight: { lat: number; lon: number };
    };
  };
  // Temporal information (inherited from source illumination layer)
  temporalInfo?: {
    dates: Date[];
    startDate: Date;
    endDate: Date;
  };
}

export type Layer = BaseMapLayer | DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer | IlluminationLayer | ImageLayer;

// --- Artifact Types ---

export interface ActivityDefinition {
  id: string; // unique identifier (e.g., 'DRIVE-0', 'DTE_COMMS')
  name: string; // display name used in UI and YAML export (e.g., 'Drive-0', 'TTC_COMMS')
  defaultDuration: number; // default duration in seconds
}

export interface Activity {
  id: string;
  type: string; // references ActivityDefinition.id
  duration: number; // in seconds, non-negative integer
}

export interface ActivityTemplate {
  id: string;
  name: string;
  activities: Activity[];
}

export interface Waypoint {
  id: string;
  geoPosition: [number, number]; // [lon, lat]
  label: string;
  activitySymbol?: string; // Lucide icon name for activity
  activityLabel?: string; // Label for the activity
  activitySymbolSize?: number; // Size in pixels (default: 24)
  activitySymbolColor?: string; // Hex color (default: artifact color)
  activityOffset?: number; // Distance in pixels perpendicular to outgoing segment (default: 35)
  description?: string; // Optional description
  activities?: Activity[]; // Timeline of activities for this waypoint
}

export interface ArtifactBase {
  id: string;
  name: string;
  type: 'circle' | 'rectangle' | 'path';
  visible: boolean;
  color: string;
  thickness: number;
}

export interface CircleArtifact extends ArtifactBase {
  type: 'circle';
  center: [number, number]; // Projected coordinates [x, y]
  radius: number; // in meters
}

export interface RectangleArtifact extends ArtifactBase {
  type: 'rectangle';
  center: [number, number]; // Projected coordinates [x, y]
  width: number; // in meters
  height: number; // in meters
  rotation: number; // in degrees
  isFreeForm?: boolean; // If true, not constrained to grid
  corners?: {
    topLeft: [number, number];     // Projected coordinates
    topRight: [number, number];
    bottomLeft: [number, number];
    bottomRight: [number, number];
  };
}

export interface PathArtifact extends ArtifactBase {
  type: 'path';
  waypoints: Waypoint[];
}

export type Artifact = CircleArtifact | RectangleArtifact | PathArtifact;

// Serializable artifacts are the same as the main ones since coords are arrays
export type SerializableArtifact = Artifact;

// --- Event Types ---

export interface Event {
  id: string;
  name: string;
  description: string;
  dateIndex: number; // Time index in the dataset
  visible: boolean;
  color: string;
}

export type SerializableEvent = Event;


// --- Serializable Types for Session Import/Export ---

interface SerializableLayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export interface SerializableBaseMapLayer extends SerializableLayerBase {
  type: 'basemap';
  vrt: VrtData;
  pngFileName: string;
  vrtFileName: string;
}

export interface SerializableDataLayer extends SerializableLayerBase {
  type: 'data';
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  transparencyLowerThreshold?: number;
  transparencyUpperThreshold?: number;
  dimensions: { time: number; height: number; width: number };
}

export interface SerializableDteCommsLayer extends SerializableLayerBase {
  type: 'dte_comms';
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  transparencyLowerThreshold?: number;
  transparencyUpperThreshold?: number;
  dimensions: { time: number; height: number; width: number };
}

export interface SerializableLpfCommsLayer extends SerializableLayerBase {
  type: 'lpf_comms';
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  transparencyLowerThreshold?: number;
  transparencyUpperThreshold?: number;
  dimensions: { time: number; height: number; width: number };
}

export interface SerializableImageLayer extends SerializableLayerBase {
  type: 'image';
  fileName: string;
  imageDataUrl: string; // Base64-encoded image data for export/import
  position: [number, number];
  scaleX: number;
  scaleY: number;
  rotation: number;
  originalWidth: number;
  originalHeight: number;
}

export interface SerializableAnalysisLayer extends SerializableLayerBase {
  type: 'analysis';
  analysisType: AnalysisType;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  transparencyLowerThreshold?: number;
  transparencyUpperThreshold?: number;
  dimensions: { time: number; height: number; width: number };
  sourceLayerId?: string;
  params: {
    clipValue?: number;
    expression?: string;
    illuminationThreshold?: number; // Threshold for daylight fraction on illumination layers
  };
}

export interface SerializableIlluminationLayer extends SerializableLayerBase {
  type: 'illumination';
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  transparencyLowerThreshold?: number;
  transparencyUpperThreshold?: number;
  dimensions: { time: number; height: number; width: number };
  metadata?: {
    title?: string;
    institution?: string;
    source?: string;
    conventions?: string;
    variableName?: string;
    timeUnit?: string;
    timeValues?: number[];
    crs?: {
      projection: string;
      latitudeOfOrigin?: number;
      centralMeridian?: number;
      semiMajorAxis?: number;
      spatialRef?: string;
    };
  };
  temporalInfo?: {
    dates: Date[];
    startDate: Date;
    endDate: Date;
  };
  geospatial?: {
    projectedBounds: {
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
    };
    geographicBounds: {
      latMin: number;
      latMax: number;
      lonMin: number;
      lonMax: number;
    };
    corners: {
      topLeft: { lat: number; lon: number };
      topRight: { lat: number; lon: number };
      bottomLeft: { lat: number; lon: number };
      bottomRight: { lat: number; lon: number };
    };
  };
  debugFlipX?: boolean;
  debugFlipY?: boolean;
  illuminationThreshold?: number;
}

export type SerializableLayer = SerializableBaseMapLayer | SerializableDataLayer | SerializableAnalysisLayer | SerializableDteCommsLayer | SerializableLpfCommsLayer | SerializableImageLayer | SerializableIlluminationLayer;

export interface AppStateConfig {
  version: number;
  layers: SerializableLayer[];
  activeLayerId: string | null;
  timeRange: TimeRange | null;
  timeZoomDomain: [string, string] | null;
  viewState: ViewState | null;
  showGraticule: boolean;
  graticuleDensity: number;
  showGrid: boolean;
  gridSpacing: number;
  gridColor: string;
  selectedCells: { x: number, y: number }[];
  selectionColor: string;
  activeTool: Tool;
  artifacts: SerializableArtifact[];
  artifactDisplayOptions: {
    waypointDotSize: number;
    showSegmentLengths: boolean;
    labelFontSize: number;
    showActivitySymbols: boolean;
  };
  pathCreationOptions: {
    defaultMaxSegmentLength: number | null; // in meters, null means no limit
  };
  activityDefinitions: ActivityDefinition[];
  nightfallPlotYAxisRange: { min: number; max: number; };
  events: SerializableEvent[];
}

// --- WebGL Renderer Types ---

export interface WebGLLayerHandle {
  id: string;
  texture: WebGLTexture;
  width: number;
  height: number;
  currentTimeIndex: number;
  valueRange: [number, number];
  colormapTexture: WebGLTexture;
  opacity: number;
  transparencyLower?: number;
  transparencyUpper?: number;

  // For illumination layers with geospatial transforms
  transform?: {
    projectedBounds: {
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
    };
    debugFlipX?: boolean;
    debugFlipY?: boolean;
  };
}

export interface WebGLMemoryStats {
  textureMemoryMB: number;
  layerCount: number;
  totalPixels: number;
}