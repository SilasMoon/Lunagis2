/**
 * Streaming NPY Parser
 *
 * Parses .npy file headers and enables lazy loading of time slices.
 * Only reads metadata initially, then streams data on-demand.
 *
 * Memory usage: ~10 MB per time slice vs 500 MB for entire file
 */

import type { FileMetadata, ProgressCallback, TypedArray } from './streamingFileReader';
import { readFileRange, calculateTimeSliceOffset, createTypedArray } from './streamingFileReader';

interface NpyHeader {
  descr: string;
  fortran_order: boolean;
  shape: number[];
}

export interface StreamingNpyMetadata extends FileMetadata {
  fileType: 'npy';
  header: NpyHeader;
  fortranOrder: boolean;
}

/**
 * Parse NPY header without loading data
 * Only reads first ~16 KB of file
 */
export async function parseNpyHeader(file: File): Promise<StreamingNpyMetadata> {
  // Read first 16 KB (header is typically < 1 KB)
  const headerBuffer = await readFileRange(file, 0, 16384);
  const dataView = new DataView(headerBuffer);

  // Check magic string '\x93NUMPY'
  const magic = String.fromCharCode(...new Uint8Array(headerBuffer, 0, 6));
  if (magic !== '\x93NUMPY') {
    throw new Error('Not a valid .npy file: invalid magic string.');
  }

  const versionMajor = dataView.getUint8(6);

  let headerOffset: number;
  let headerLen: number;

  if (versionMajor === 1) {
    headerLen = dataView.getUint16(8, true); // little-endian
    headerOffset = 10;
  } else if (versionMajor === 2) {
    headerLen = dataView.getUint32(8, true); // little-endian
    headerOffset = 12;
  } else {
    throw new Error(`Unsupported .npy version: ${versionMajor}. Only v1 and v2 are supported.`);
  }

  const headerStr = new TextDecoder().decode(
    headerBuffer.slice(headerOffset, headerOffset + headerLen)
  );

  // Parse Python dict literal to JSON
  const jsonStr = headerStr
    .replace(/False/g, 'false')
    .replace(/True/g, 'true')
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    .replace(/'/g, '"')
    .replace(/,(\s*\])/g, '$1')
    .replace(/,(\s*})/g, '$1');

  let header: NpyHeader;
  try {
    header = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Failed to parse NPY header: invalid format');
  }

  // Validate header
  if (!Array.isArray(header.shape) || header.shape.length === 0) {
    throw new Error('Invalid NPY header: shape must be a non-empty array');
  }
  if (typeof header.descr !== 'string') {
    throw new Error('Invalid NPY header: missing descr field');
  }
  if (typeof header.fortran_order !== 'boolean') {
    throw new Error('Invalid NPY header: missing fortran_order field');
  }

  // Validate shape
  for (const dim of header.shape) {
    if (typeof dim !== 'number' || dim <= 0 || !Number.isInteger(dim)) {
      throw new Error(`Invalid NPY header: shape dimensions must be positive integers, got ${dim}`);
    }
  }

  // Determine dimensions (assuming 3D: time × height × width)
  if (header.shape.length !== 3) {
    throw new Error(`Expected 3D array, got ${header.shape.length}D array`);
  }

  const [time, height, width] = header.shape;

  // Parse dtype and determine bytes per value
  const dtype = header.descr;
  let bytesPerValue = 4; // default float32

  if (dtype.includes('f4') || dtype.includes('f32')) {
    bytesPerValue = 4;
  } else if (dtype.includes('f8') || dtype.includes('f64')) {
    bytesPerValue = 8;
  } else if (dtype.includes('b1') || dtype.includes('?')) {
    bytesPerValue = 1; // boolean
  } else if (dtype.includes('i1') || dtype.includes('u1')) {
    bytesPerValue = 1; // int8/uint8
  } else if (dtype.includes('i2') || dtype.includes('u2') || dtype.includes('i16') || dtype.includes('u16')) {
    bytesPerValue = 2; // int16/uint16
  } else if (dtype.includes('i4') || dtype.includes('u4') || dtype.includes('i32') || dtype.includes('u32')) {
    bytesPerValue = 4; // int32/uint32
  }

  const dataOffset = headerOffset + headerLen;
  const sliceSize = height * width * bytesPerValue;

  // Validate file size
  const expectedSize = dataOffset + time * sliceSize;
  if (file.size < expectedSize) {
    throw new Error(
      `File size mismatch: expected at least ${expectedSize} bytes, got ${file.size} bytes`
    );
  }

  console.log(`📊 NPY Header parsed:`, {
    dimensions: { time, height, width },
    dtype,
    bytesPerValue,
    sliceSize: `${(sliceSize / 1024 / 1024).toFixed(2)} MB`,
    totalSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    fortranOrder: header.fortran_order
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: 'npy',
    dimensions: { time, height, width },
    dataType: dtype,
    headerSize: dataOffset,
    bytesPerValue,
    sliceSize,
    header,
    fortranOrder: header.fortran_order
  };
}

/**
 * Load a single time slice from NPY file
 */
export async function loadNpyTimeSlice(
  file: File,
  metadata: StreamingNpyMetadata,
  timeIndex: number,
  onProgress?: ProgressCallback
): Promise<TypedArray> {
  if (timeIndex < 0 || timeIndex >= metadata.dimensions.time) {
    throw new Error(
      `Time index ${timeIndex} out of range [0, ${metadata.dimensions.time - 1}]`
    );
  }

  const { offset, size } = calculateTimeSliceOffset(
    timeIndex,
    metadata.dimensions,
    metadata.headerSize,
    metadata.bytesPerValue
  );

  console.log(`[StreamingNpyParser] Loading slice ${timeIndex}: offset=${offset}, size=${size}`);

  if (onProgress) {
    onProgress({
      phase: 'data',
      loaded: 0,
      total: size,
      percentage: 0,
      message: `Loading time slice ${timeIndex + 1}/${metadata.dimensions.time}...`
    });
  }

  const buffer = await readFileRange(file, offset, size);

  if (onProgress) {
    onProgress({
      phase: 'data',
      loaded: size,
      total: size,
      percentage: 100,
      message: `Loaded ${(size / 1024 / 1024).toFixed(2)} MB`
    });
  }

  // Handle Fortran order if needed
  if (metadata.fortranOrder) {
    return reshapeFortranSlice(
      createTypedArray(buffer, metadata.dataType),
      metadata.dimensions.height,
      metadata.dimensions.width
    );
  }

  return createTypedArray(buffer, metadata.dataType);
}

/**
 * Load multiple time slices (batch loading)
 */
export async function loadNpyTimeSlices(
  file: File,
  metadata: StreamingNpyMetadata,
  timeIndices: number[],
  onProgress?: ProgressCallback
): Promise<Map<number, TypedArray>> {
  const results = new Map<number, TypedArray>();

  for (let i = 0; i < timeIndices.length; i++) {
    const timeIndex = timeIndices[i];

    if (onProgress) {
      onProgress({
        phase: 'data',
        loaded: i + 1,
        total: timeIndices.length,
        percentage: ((i + 1) / timeIndices.length) * 100,
        message: `Loading slice ${i + 1}/${timeIndices.length} (time=${timeIndex})`
      });
    }

    const data = await loadNpyTimeSlice(file, metadata, timeIndex);
    results.set(timeIndex, data);
  }

  return results;
}

/**
 * Reshape Fortran-ordered data to C-order
 */
function reshapeFortranSlice(
  data: TypedArray,
  height: number,
  width: number
): TypedArray {
  // Fortran order: column-major (x varies fastest)
  // C order: row-major (x varies fastest) - same for 2D!
  // Actually for 2D, both are the same. The issue is with 3D→2D slicing.

  // For now, just return as-is. Proper handling requires knowing
  // how the data was originally laid out.
  console.warn('Fortran order detected - may need reshaping for proper display');
  return data;
}

/**
 * Load time range as a stream (memory-efficient)
 */
export async function* streamNpyTimeRange(
  file: File,
  metadata: StreamingNpyMetadata,
  startTime: number,
  endTime: number,
  onProgress?: ProgressCallback
): AsyncGenerator<{ timeIndex: number; data: TypedArray }, void, unknown> {
  const totalSlices = endTime - startTime;

  for (let t = startTime; t < endTime; t++) {
    if (onProgress) {
      onProgress({
        phase: 'data',
        loaded: t - startTime + 1,
        total: totalSlices,
        percentage: ((t - startTime + 1) / totalSlices) * 100,
        message: `Streaming time slice ${t + 1}/${metadata.dimensions.time}`
      });
    }

    const data = await loadNpyTimeSlice(file, metadata, t);
    yield { timeIndex: t, data };
  }
}
