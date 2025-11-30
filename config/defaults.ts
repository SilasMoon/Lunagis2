/**
 * Centralized configuration for Lunagis application
 * All hardcoded values should be defined here for easy maintenance
 */

// =============================================================================
// TIME CONFIGURATION
// =============================================================================

/** Default start date for time calculations */
export const DEFAULT_START_DATE = new Date('2030-01-01T00:00:00Z');

// =============================================================================
// COORDINATE SYSTEM CONFIGURATION
// =============================================================================

/** Default latitude range for the application [min, max] */
export const DEFAULT_LAT_RANGE: [number, number] = [-85.505, -85.26];

/** Default longitude range for the application [min, max] */
export const DEFAULT_LON_RANGE: [number, number] = [28.97, 32.53];

/** Default graticule density */
export const DEFAULT_GRATICULE_DENSITY = 1.0;

/** Default grid spacing in pixels */
export const DEFAULT_GRID_SPACING = 10;

/** Default grid color */
export const DEFAULT_GRID_COLOR = '#444444';

// =============================================================================
// FILE SIZE LIMITS (in bytes)
// =============================================================================

export const FILE_SIZE_LIMITS = {
  '.npy': 500 * 1024 * 1024,  // 500MB for data files
  '.nc': 500 * 1024 * 1024,   // 500MB for NetCDF4 files
  '.nc4': 500 * 1024 * 1024,  // 500MB for NetCDF4 files (alternative extension)
  '.png': 50 * 1024 * 1024,   // 50MB for basemap images
  '.vrt': 10 * 1024 * 1024,   // 10MB for VRT files
  '.json': 20 * 1024 * 1024,  // 20MB for config files
} as const;

/** Maximum total file size for imports (1GB) */
export const MAX_TOTAL_FILE_SIZE = 1024 * 1024 * 1024;

// =============================================================================
// PERFORMANCE TUNING
// =============================================================================

/** Maximum number of undo/redo history states */
export const MAX_HISTORY_STATES = 50;

/** Number of pixels to process before yielding to main thread */
export const PIXELS_PER_YIELD = 50000;

/** Maximum time in ms before yielding to main thread */
export const MAX_FRAME_TIME_MS = 16;

/** Cache size for analysis results */
export const ANALYSIS_CACHE_SIZE = 10;

/** Maximum points to render in time series plot (for performance) */
export const MAX_TIME_SERIES_POINTS = 500;

// =============================================================================
// UI TIMING CONFIGURATION
// =============================================================================

/** Default toast duration in ms */
export const DEFAULT_TOAST_DURATION = 5000;

/** Error toast duration in ms */
export const ERROR_TOAST_DURATION = 8000;

/** Warning toast duration in ms */
export const WARNING_TOAST_DURATION = 6000;

/** Debounce delay for graticule density changes */
export const GRATICULE_DEBOUNCE_MS = 100;

/** Debounce delay for grid changes */
export const GRID_DEBOUNCE_MS = 50;

/** Timeout for file operations in ms */
export const FILE_OPERATION_TIMEOUT_MS = 30000;

/** Timeout for image loading in ms */
export const IMAGE_LOAD_TIMEOUT_MS = 5000;

/** Error boundary reset delay in ms */
export const ERROR_BOUNDARY_RESET_DELAY_MS = 2000;

// =============================================================================
// DATA GENERATOR DEFAULTS (for mock data)
// =============================================================================

export const MOCK_DATA_DIMENSIONS = {
  TIME_STEPS: 8761,
  HEIGHT: 64,
  WIDTH: 76,
} as const;

// =============================================================================
// ARTIFACT DISPLAY DEFAULTS
// =============================================================================

export const DEFAULT_ARTIFACT_DISPLAY_OPTIONS = {
  waypointDotSize: 6,
  showSegmentLengths: true,
  labelFontSize: 12,
  showActivitySymbols: true,
} as const;

export const DEFAULT_PATH_CREATION_OPTIONS = {
  defaultMaxSegmentLength: null as number | null,
} as const;

// =============================================================================
// SELECTION DEFAULTS
// =============================================================================

export const DEFAULT_SELECTION_COLOR = '#00ffff';

// =============================================================================
// CANVAS RENDERING CONFIGURATION
// =============================================================================

/** Number of points to sample along graticule lines */
export const GRATICULE_SAMPLE_POINTS = 100;

/** Maximum dimension for raster validation */
export const MAX_RASTER_DIMENSION = 100000;

// =============================================================================
// EXPRESSION EVALUATOR
// =============================================================================

/** Epsilon for floating point comparison in expressions */
export const EXPRESSION_EPSILON = 1e-10;

// =============================================================================
// NIGHTFALL PLOT DEFAULTS
// =============================================================================

export const DEFAULT_NIGHTFALL_PLOT_Y_AXIS_RANGE = {
  min: 0,
  max: 24,
} as const;
