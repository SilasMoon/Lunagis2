/**
 * Streaming NetCDF Parser
 *
 * Note: h5wasm requires loading the entire file into its virtual filesystem,
 * so we can't do true streaming like with NPY files. However, we can still
 * provide lazy loading by:
 *
 * 1. Load file once into h5wasm virtual FS
 * 2. Parse metadata immediately
 * 3. Keep h5wasm file handle open
 * 4. Read variables/time slices on-demand
 *
 * This provides memory savings by avoiding the full data restructuring
 * until actually needed.
 */

import * as h5wasm from 'h5wasm';
import type { File as H5File, H5Module } from 'h5wasm';
import type { FileMetadata, ProgressCallback, TypedArray } from './streamingFileReader';
import type { NetCdf4Metadata } from './netcdf4Parser';

export interface StreamingNetCdfMetadata extends FileMetadata {
  fileType: 'netcdf';
  netcdfMetadata: NetCdf4Metadata;
  variableName: string;
  h5wasmFilename: string; // Filename in virtual FS
}

// Global h5wasm state
let h5wasmReady: Promise<H5Module> | null = null;
let fileCounter = 0;

async function getH5Wasm(): Promise<H5Module> {
  if (!h5wasmReady) {
    h5wasmReady = h5wasm.ready;
  }
  return h5wasmReady;
}

/**
 * Parse NetCDF4 header and metadata without loading full dataset
 */
export async function parseNetCdfHeader(
  file: File,
  onProgress?: ProgressCallback
): Promise<{ metadata: StreamingNetCdfMetadata; h5file: H5File }> {
  try {
    const h5 = await getH5Wasm();

    if (onProgress) {
      onProgress({
        phase: 'header',
        loaded: 0,
        total: file.size,
        percentage: 0,
        message: 'Initializing h5wasm...'
      });
    }

    // Validate HDF5 signature
    const signatureBuffer = await file.slice(0, 8).arrayBuffer();
    const signatureView = new Uint8Array(signatureBuffer);
    const expectedSignature = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
    const hasValidSignature = expectedSignature.every((byte, i) => signatureView[i] === byte);

    if (!hasValidSignature) {
      throw new Error(
        'Invalid HDF5/NetCDF4 file signature. This file may not be in NetCDF-4 format.'
      );
    }

    if (onProgress) {
      onProgress({
        phase: 'header',
        loaded: file.size,
        total: file.size,
        percentage: 50,
        message: 'Loading file into h5wasm virtual filesystem...'
      });
    }

    // Load entire file into h5wasm virtual FS
    // (Unfortunately required by h5wasm architecture)
    const uint8Array = new Uint8Array(await file.arrayBuffer());

    const filename = `streaming_${fileCounter++}_${Date.now()}.nc`;
    h5wasm.FS.writeFile(filename, uint8Array);

    if (onProgress) {
      onProgress({
        phase: 'metadata',
        loaded: 0,
        total: 100,
        percentage: 75,
        message: 'Opening NetCDF file...'
      });
    }

    const h5file = new h5wasm.File(filename, 'r') as H5File;

    // Extract dimensions
    const dimensions = extractDimensions(h5file);

    // Find data variable
    const variableName = findDataVariable(h5file);

    // Get variable dtype info
    const dataset = h5file.get(variableName);
    const dtype = dataset.dtype;

    // Calculate bytes per value
    let bytesPerValue = 4;
    if (dtype === '<B' || dtype === '|u1' || dtype === '|i1') {
      bytesPerValue = 1;
    } else if (dtype === '<H' || dtype === '<h') {
      bytesPerValue = 2;
    } else if (dtype === '<f8' || dtype === '<d') {
      bytesPerValue = 8;
    }

    const sliceSize = dimensions.height * dimensions.width * bytesPerValue;

    // Extract metadata
    const netcdfMetadata = extractNetCdfMetadata(h5file, variableName, dimensions, dtype);

    if (onProgress) {
      onProgress({
        phase: 'metadata',
        loaded: 100,
        total: 100,
        percentage: 100,
        message: 'Metadata loaded'
      });
    }

    console.log(`📊 NetCDF Header parsed:`, {
      dimensions,
      variableName,
      dtype,
      sliceSize: `${(sliceSize / 1024 / 1024).toFixed(2)} MB`,
      totalSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`
    });

    const metadata: StreamingNetCdfMetadata = {
      fileName: file.name,
      fileSize: file.size,
      fileType: 'netcdf',
      dimensions,
      dataType: dtype,
      headerSize: 0, // Not applicable for NetCDF
      bytesPerValue,
      sliceSize,
      netcdfMetadata,
      variableName,
      h5wasmFilename: filename
    };

    return { metadata, h5file };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse NetCDF4 header: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Load a single time slice from NetCDF using h5wasm
 */
export async function loadNetCdfTimeSlice(
  h5file: H5File,
  metadata: StreamingNetCdfMetadata,
  timeIndex: number,
  onProgress?: ProgressCallback
): Promise<TypedArray> {
  if (timeIndex < 0 || timeIndex >= metadata.dimensions.time) {
    throw new Error(
      `Time index ${timeIndex} out of range [0, ${metadata.dimensions.time - 1}]`
    );
  }

  if (onProgress) {
    onProgress({
      phase: 'data',
      loaded: 0,
      total: metadata.sliceSize,
      percentage: 0,
      message: `Loading time slice ${timeIndex + 1}/${metadata.dimensions.time}...`
    });
  }

  try {
    const dataset = h5file.get(metadata.variableName);

    // For h5wasm, we need to read the entire dataset (limitation of h5wasm API)
    // Then extract the specific time slice
    // TODO: Investigate if h5wasm supports hyperslab selection for partial reads

    const fullData = dataset.value;
    const { height, width } = metadata.dimensions;
    const sliceSize = height * width;

    // Extract time slice from full data
    const start = timeIndex * sliceSize;
    const end = start + sliceSize;
    const sliceData = fullData.slice(start, end);

    if (onProgress) {
      onProgress({
        phase: 'data',
        loaded: metadata.sliceSize,
        total: metadata.sliceSize,
        percentage: 100,
        message: `Loaded ${(metadata.sliceSize / 1024 / 1024).toFixed(2)} MB`
      });
    }

    // Convert to appropriate TypedArray
    if (sliceData instanceof Float32Array ||
        sliceData instanceof Uint8Array ||
        sliceData instanceof Uint16Array ||
        sliceData instanceof Int16Array) {
      return sliceData;
    } else if (sliceData instanceof Float64Array) {
      return new Float32Array(sliceData);
    } else {
      return new Float32Array(sliceData);
    }
  } catch (error) {
    throw new Error(`Failed to load time slice ${timeIndex}: ${error}`);
  }
}

/**
 * Close h5wasm file and clean up
 */
export function closeNetCdfFile(h5file: H5File, filename: string): void {
  try {
    h5file.close();
    // Try to delete from virtual FS (may not be supported)
    try {
      h5wasm.FS.unlink(filename);
    } catch (e) {
      // Ignore - file cleanup not critical
    }
  } catch (error) {
    console.warn('Failed to close NetCDF file:', error);
  }
}

// ========== Helper functions (from original parser) ==========

function extractDimensions(file: H5File): {
  time: number;
  height: number;
  width: number;
} {
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
        const dataset = file.get(key);
        if (dataset && dataset.shape && dataset.shape.length === 3) {
          dataVarName = key;
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }

  if (!dataVarName) {
    throw new Error(`Could not find a 3D data variable. Available: ${keys.join(', ')}`);
  }

  const dataset = file.get(dataVarName);
  if (!dataset || !dataset.shape || dataset.shape.length !== 3) {
    throw new Error(`Variable "${dataVarName}" is not a 3D array`);
  }

  const [time, height, width] = dataset.shape;

  if (time === 0 || height === 0 || width === 0) {
    throw new Error(`Invalid dimensions: time=${time}, height=${height}, width=${width}`);
  }

  return { time, height, width };
}

function findDataVariable(file: H5File): string {
  const keys = file.keys();
  const possibleNames = ['illumination', 'solar_illumination', 'illumination_fraction', 'data'];

  for (const name of possibleNames) {
    if (keys.includes(name)) {
      return name;
    }
  }

  for (const key of keys) {
    try {
      const dataset = file.get(key);
      if (dataset && dataset.shape && dataset.shape.length === 3) {
        return key;
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error(`Could not find data variable. Available: ${keys.join(', ')}`);
}

function extractNetCdfMetadata(
  file: H5File,
  dataVariableName: string,
  dimensions: { time: number; height: number; width: number },
  dataType?: string
): NetCdf4Metadata {
  const metadata: NetCdf4Metadata = {
    variableName: dataVariableName,
    variableDataType: dataType
  };

  // Extract global attributes
  try {
    const attrs = file.attrs;
    if (attrs) {
      metadata.title = attrs.title?.value;
      metadata.institution = attrs.institution?.value;
      metadata.source = attrs.source?.value;
      metadata.history = attrs.history?.value;
      metadata.conventions = attrs.Conventions?.value || attrs.conventions?.value;
    }
  } catch (error) {
    // Attributes might not exist
  }

  // Extract variable attributes
  try {
    const dataVar = file.get(dataVariableName);
    if (dataVar && dataVar.attrs) {
      metadata.variableUnit = dataVar.attrs.units?.value;
      metadata.variableLongName = dataVar.attrs.long_name?.value;
    }
  } catch (error) {
    // Variable attributes might not exist
  }

  // Extract time metadata
  try {
    const keys = file.keys();
    const timeVarNames = ['time', 't', 'Time'];
    for (const name of timeVarNames) {
      if (keys.includes(name)) {
        const timeVar = file.get(name);
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
          } catch (e) {
            // Time values might not be readable
          }
          break;
        }
      }
    }
  } catch (error) {
    // Time metadata might not exist
  }

  return metadata;
}
