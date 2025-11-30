/**
 * NetCDF4 Parser for Lunar Illumination Maps
 *
 * Parses NetCDF4 files (HDF5 backend) containing lunar surface illumination data.
 * Supports CF-1.7 conventions with polar stereographic projection.
 *
 * Expected file structure:
 * - Dimensions: time (unlimited), y (variable), x (variable)
 * - Variables: illumination[time, y, x], latitude[y, x], longitude[y, x]
 * - CRS: Polar Stereographic (South Pole Centered)
 */

import { NetCDFReader } from './LazyDataset';
import * as h5wasm from 'h5wasm';
import type { File as H5File, Dataset as H5Dataset } from 'h5wasm';

export interface NetCdf4ParseResult {
  reader: NetCDFReader;
  shape: [number, number, number]; // [time, height, width]
  dimensions: {
    time: number;
    height: number;
    width: number;
  };
  metadata: NetCdf4Metadata;
  coordinates?: {
    x: Float32Array;         // 1D projected x coordinates (meters) - REQUIRED
    y: Float32Array;         // 1D projected y coordinates (meters) - REQUIRED
    latitude?: Float32Array; // Optional: 2D auxiliary lat (for reference)
    longitude?: Float32Array; // Optional: 2D auxiliary lon (for reference)
  };
}

export interface NetCdf4Metadata {
  title?: string;
  institution?: string;
  source?: string;
  history?: string;
  conventions?: string;
  variableName: string;
  variableUnit?: string;
  variableLongName?: string;
  variableDataType?: string;  // Original data type from NetCDF (e.g., '<B', '<f4', etc.)
  timeUnit?: string;
  timeCalendar?: string;
  timeValues?: number[];
  crs?: {
    projection: string;
    latitudeOfOrigin?: number;
    centralMeridian?: number;
    semiMajorAxis?: number;
    inverseFlattening?: number;
    spatialRef?: string;  // Proj4 string from spatial_ref attribute
  };
  latitude?: {
    min: number;
    max: number;
  };
  longitude?: {
    min: number;
    max: number;
  };
}

// State
let h5wasmReady: Promise<void> | null = null;

// Initialize h5wasm
async function initH5Wasm() {
  if (!h5wasmReady) {
    h5wasmReady = h5wasm.ready.then(() => { });
  }
  return h5wasmReady;
}

// Helper to extract dimensions
function extractDimensions(file: H5File) {
  const keys = file.keys();
  const possibleDataVars = ['illumination', 'solar_illumination', 'illumination_fraction', 'data'];
  let dataVarName: string | null = null;

  for (const varName of possibleDataVars) {
    if (keys.includes(varName)) {
      dataVarName = varName;
      break;
    }
  }

  if (!dataVarName) {
    for (const key of keys) {
      try {
        const dataset = file.get(key) as any;
        if (dataset && dataset.shape && dataset.shape.length === 3) {
          dataVarName = key;
          break;
        }
      } catch (e) { }
    }
  }

  if (!dataVarName) throw new Error('Could not find 3D data variable');

  const dataset = file.get(dataVarName) as any;
  const [time, height, width] = dataset.shape;
  return { time, height, width, dataVarName };
}

// Helper to extract metadata (Robust version)
function extractMetadata(file: H5File, dataVarName: string) {
  const metadata: any = { variableName: dataVarName };

  // Global attributes
  try {
    const attrs = file.attrs as any;
    if (attrs) {
      metadata.title = attrs.title?.value;
      metadata.institution = attrs.institution?.value;
      metadata.source = attrs.source?.value;
      metadata.history = attrs.history?.value;
      metadata.conventions = attrs.Conventions?.value || attrs.conventions?.value;
    }
  } catch (e) { }

  // Variable attributes
  try {
    const dataVar = file.get(dataVarName) as any;
    if (dataVar && dataVar.attrs) {
      metadata.variableUnit = dataVar.attrs.units?.value;
      metadata.variableLongName = dataVar.attrs.long_name?.value;
    }
  } catch (e) { }

  // Time metadata
  try {
    const keys = file.keys();
    const timeVarNames = ['time', 't', 'Time'];
    for (const name of timeVarNames) {
      if (keys.includes(name)) {
        const timeVar = file.get(name) as any;
        if (timeVar) {
          if (timeVar.attrs) {
            metadata.timeUnit = timeVar.attrs.units?.value;
            metadata.timeCalendar = timeVar.attrs.calendar?.value;
          }
          try {
            const timeData = timeVar.value;
            if (timeData) {
              metadata.timeValues = Array.from(timeData);
            }
          } catch (e) { }
          break;
        }
      }
    }
  } catch (e) { }

  // CRS
  try {
    const keys = file.keys();
    const crsVarNames = ['polar_stereographic', 'crs', 'spatial_ref'];
    for (const name of crsVarNames) {
      if (keys.includes(name)) {
        const crsVar = file.get(name) as any;
        if (crsVar && crsVar.attrs) {
          const attrs = crsVar.attrs;
          metadata.crs = {
            projection: 'Polar Stereographic',
            latitudeOfOrigin: attrs.latitude_of_origin?.value || attrs.latitude_of_projection_origin?.value,
            centralMeridian: attrs.straight_vertical_longitude_from_pole?.value || attrs.central_meridian?.value,
            semiMajorAxis: attrs.semi_major_axis?.value,
            inverseFlattening: attrs.inverse_flattening?.value,
            spatialRef: attrs.spatial_ref?.value,
          };
          break;
        }
      }
    }
  } catch (e) { }

  // Lat/Lon ranges
  try {
    const keys = file.keys();
    const latVarNames = ['latitude', 'lat'];
    for (const name of latVarNames) {
      if (keys.includes(name)) {
        const latVar = file.get(name) as any;
        if (latVar && latVar.attrs) {
          const validMin = latVar.attrs.valid_min?.value || latVar.attrs.actual_min?.value;
          const validMax = latVar.attrs.valid_max?.value || latVar.attrs.actual_max?.value;
          if (validMin !== undefined && validMax !== undefined) {
            metadata.latitude = { min: Number(validMin), max: Number(validMax) };
            break;
          }
        }
      }
    }
    const lonVarNames = ['longitude', 'lon'];
    for (const name of lonVarNames) {
      if (keys.includes(name)) {
        const lonVar = file.get(name) as any;
        if (lonVar && lonVar.attrs) {
          const validMin = lonVar.attrs.valid_min?.value || lonVar.attrs.actual_min?.value;
          const validMax = lonVar.attrs.valid_max?.value || lonVar.attrs.actual_max?.value;
          if (validMin !== undefined && validMax !== undefined) {
            metadata.longitude = { min: Number(validMin), max: Number(validMax) };
            break;
          }
        }
      }
    }
  } catch (e) { }

  return metadata;
}

// Helper to extract coordinates (Robust version)
function extractCoordinates(file: H5File, width: number, height: number) {
  const keys = file.keys();
  let x: Float32Array | undefined;
  let y: Float32Array | undefined;
  let latitude: Float32Array | undefined;
  let longitude: Float32Array | undefined;

  if (keys.includes('x')) {
    const xVar = file.get('x') as any;
    if (xVar && xVar.value) x = new Float32Array(xVar.value);
  }
  if (keys.includes('y')) {
    const yVar = file.get('y') as any;
    if (yVar && yVar.value) y = new Float32Array(yVar.value);
  }

  // Optional lat/lon arrays
  if (keys.includes('latitude')) {
    const v = file.get('latitude') as any;
    if (v && v.value) latitude = new Float32Array(v.value);
  }
  if (keys.includes('longitude')) {
    const v = file.get('longitude') as any;
    if (v && v.value) longitude = new Float32Array(v.value);
  }

  if (x && y && x.length === width && y.length === height) {
    return { x, y, latitude, longitude };
  }
  return undefined;
}

// Helper to yield to the event loop
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Parse a NetCDF4 file and extract illumination data
 * @param arrayBuffer - The raw file data
 * @returns Parsed data with metadata
 */
export async function parseNetCdf4(arrayBuffer: ArrayBuffer): Promise<NetCdf4ParseResult> {
  try {
    console.log('Loading file on main thread...');
    console.log('File size:', arrayBuffer.byteLength, 'bytes');

    // Yield before starting heavy processing
    await yieldToMain();

    // Check HDF5 signature
    const signatureView = new Uint8Array(arrayBuffer, 0, 8);
    console.log('File signature:', Array.from(signatureView.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // HDF5 signature should be: 89 48 44 46 0d 0a 1a 0a
    const expectedSignature = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
    const hasValidSignature = expectedSignature.every((byte, i) => signatureView[i] === byte);

    if (!hasValidSignature) {
      throw new Error(
        'Invalid HDF5/NetCDF4 file signature. This file may not be in NetCDF-4 format. ' +
        'Expected HDF5 signature (89 48 44 46...), got: ' +
        Array.from(signatureView.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      );
    }

    console.log('Valid HDF5 signature detected');

    await initH5Wasm();

    const filename = `uploaded_file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.nc`;

    // Write to VFS
    // This is synchronous and might block for large files, but h5wasm doesn't offer async write
    h5wasm.FS.writeFile(filename, new Uint8Array(arrayBuffer));

    // Yield after writing file
    await yieldToMain();

    // Open file
    const file = new h5wasm.File(filename, 'r');
    const { time, height, width, dataVarName } = extractDimensions(file);
    const metadata = extractMetadata(file, dataVarName);
    const coordinates = extractCoordinates(file, width, height);

    console.log('File opened successfully');
    console.log('Dimensions:', { time, height, width });
    console.log('Metadata:', metadata);

    // Create lazy reader directly with the file object
    const reader = new NetCDFReader(file, filename, dataVarName);

    return {
      reader,
      shape: [time, height, width],
      dimensions: { time, height, width },
      metadata,
      coordinates,
    };

  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse NetCDF4 file: ${error.message}`);
    }
    throw new Error('Failed to parse NetCDF4 file: Unknown error');
  }
}

/**
 * Convert time values from "hours since [date]" to Date objects
 * @param timeValues - Array of numeric time values
 * @param timeUnit - Unit string like "hours since 2024-01-01T00:00:00"
 * @returns Array of Date objects
 */
export function parseTimeValues(
  timeValues: number[],
  timeUnit: string
): Date[] {
  // Parse the unit string to extract reference date and unit
  const match = timeUnit.match(/(hours|days|minutes|seconds)\s+since\s+(.+)/i);
  if (!match) {
    throw new Error(`Invalid time unit format: ${timeUnit}`);
  }

  const [, unit, referenceStr] = match;
  const referenceDate = new Date(referenceStr);

  if (isNaN(referenceDate.getTime())) {
    throw new Error(`Invalid reference date: ${referenceStr}`);
  }

  // Convert time values to milliseconds
  const unitMultipliers: Record<string, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };

  const multiplier = unitMultipliers[unit.toLowerCase()];
  if (!multiplier) {
    throw new Error(`Unknown time unit: ${unit}`);
  }

  return timeValues.map(value => {
    const ms = referenceDate.getTime() + value * multiplier;
    return new Date(ms);
  });
}
