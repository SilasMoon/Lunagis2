import { loadNpyTimeSlice, StreamingNpyMetadata } from './streamingNpyParser';
import { readFileRange, createTypedArray } from './streamingFileReader';
import * as h5wasm from 'h5wasm';
import type { File as H5File, Dataset as H5Dataset } from 'h5wasm';

export type SliceData = Float32Array | Uint8Array | Int16Array | Uint32Array;

export interface ILazyDataset {
  getSlice(timeIndex: number): Promise<SliceData>;
  getCachedSlice(timeIndex: number): SliceData | undefined;
  getPixelTimeSeries(y: number, x: number): Promise<number[]>;
  dispose(): void;
  clearCache(): void;
  getStats(): { cacheSize: number; totalSizeMB: number };
  setProgressCallback?(callback: (progress: { message: string }) => void): void;
}

const SLICE_CACHE_SIZE_MB = 1024; // Max cache size in MB (increased for full dataset caching)

class SliceCache {
  private cache = new Map<string, { data: SliceData; lastAccess: number }>();
  private currentSizeMB = 0;

  getKey(fileId: string, timeIndex: number): string {
    return `${fileId}:${timeIndex}`;
  }

  get(fileId: string, timeIndex: number): SliceData | undefined {
    const key = this.getKey(fileId, timeIndex);
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.data;
    }
    return undefined;
  }

  set(fileId: string, timeIndex: number, data: SliceData) {
    const key = this.getKey(fileId, timeIndex);
    const sizeMB = data.byteLength / (1024 * 1024);

    // Evict if needed
    while (this.currentSizeMB + sizeMB > SLICE_CACHE_SIZE_MB && this.cache.size > 0) {
      this.evictLRU();
    }

    this.cache.set(key, { data, lastAccess: Date.now() });
    this.currentSizeMB += sizeMB;
  }

  private evictLRU() {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.currentSizeMB -= entry.data.byteLength / (1024 * 1024);
      this.cache.delete(oldestKey);
    }
  }

  clearForFile(fileId: string) {
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${fileId}:`)) {
        this.currentSizeMB -= entry.data.byteLength / (1024 * 1024);
        this.cache.delete(key);
      }
    }
  }

  getStatsForFile(fileId: string) {
    let count = 0;
    let sizeMB = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${fileId}:`)) {
        count++;
        sizeMB += entry.data.byteLength / (1024 * 1024);
      }
    }
    return { cacheSize: count, totalSizeMB: sizeMB };
  }
}

export const globalSliceCache = new SliceCache();

// Helper to yield to the event loop
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

// Optimized helper to pack binary data (0/1) into Uint8Array
// Uses 32-bit integers for processing chunks of 32 booleans at once if possible,
// but since input is usually Float32/Int8, we iterate element by element.
// We unroll the loop slightly for performance.
function packBinaryData(data: Int8Array | Uint8Array | Float32Array): Uint8Array {
  const length = data.length;
  const packedLength = Math.ceil(length / 8);
  const packed = new Uint8Array(packedLength);

  // Process 8 items at a time to form one byte
  const mainLoopLimit = length - (length % 8);

  for (let i = 0; i < mainLoopLimit; i += 8) {
    let byte = 0;
    if (data[i]) byte |= 1;
    if (data[i + 1]) byte |= 2;
    if (data[i + 2]) byte |= 4;
    if (data[i + 3]) byte |= 8;
    if (data[i + 4]) byte |= 16;
    if (data[i + 5]) byte |= 32;
    if (data[i + 6]) byte |= 64;
    if (data[i + 7]) byte |= 128;
    packed[i >>> 3] = byte;
  }

  // Handle remaining items
  for (let i = mainLoopLimit; i < length; i++) {
    if (data[i]) {
      const byteIndex = i >>> 3;
      const bitIndex = i & 7;
      packed[byteIndex] |= (1 << bitIndex);
    }
  }

  return packed;
}

export class NetCDFLazyDataset implements ILazyDataset {
  private latestRequestedTimeIndex: number = -1;

  constructor(file: H5File, filename: string, dataVarName: string) {
    this.file = file;
    this.filename = filename;
    this.dataVarName = dataVarName;
    this.dataset = file.get(dataVarName) as H5Dataset;
  }

  async getSlice(timeIndex: number): Promise<SliceData> {
    this.latestRequestedTimeIndex = timeIndex;

    // Check cache first
    const cached = globalSliceCache.get(this.filename, timeIndex);
    if (cached) {
      return cached;
    }

    // Yield before heavy lifting to let UI breathe
    await yieldToMain();

    // STALENESS CHECK: If the user has requested a newer time index while we were waiting,
    // abort this request to prevent blocking the main thread with obsolete work.
    if (this.latestRequestedTimeIndex !== timeIndex) {
      throw new Error('Request cancelled: stale time index');
    }

    const [timeSteps, height, width] = this.dataset.shape;
    const start = [timeIndex, 0, 0];
    const count = [1, height, width];

    // Read data directly
    let rawData = (this.dataset as any).slice(start, count);

    // Check if we got the full 3D volume instead of 1 slice (h5wasm bug/feature)
    const expectedLength = height * width;

    if (rawData.length > expectedLength) {
      console.log(`[NetCDFLazyDataset] Full dataset returned (${rawData.length}). Caching all ${timeSteps} slices.`);

      const sliceSize = height * width;

      // Process and cache ALL slices
      for (let t = 0; t < timeSteps; t++) {
        const offset = t * sliceSize;
        let slice: any;

        if (rawData.subarray) {
          slice = rawData.subarray(offset, offset + sliceSize);
        } else {
          slice = rawData.slice(offset, offset + sliceSize);
        }

        // Apply quantization/conversion
        let processedSlice: SliceData;

        if (this.dataVarName === 'illumination' || this.dataVarName === 'orbiter_visibility') {
          processedSlice = (slice instanceof Uint8Array) ? slice : new Uint8Array(slice);
        } else if (this.dataVarName === 'dte_visibility' || this.dataVarName === 'night_flag') {
          const input = (slice instanceof Float32Array || slice instanceof Int8Array || slice instanceof Uint8Array)
            ? slice
            : new Float32Array(slice);
          processedSlice = packBinaryData(input as any);
        } else if (this.dataVarName === 'darkness_duration') {
          processedSlice = (slice instanceof Int16Array) ? slice : new Int16Array(slice);
        } else {
          processedSlice = (slice instanceof Float32Array) ? slice : new Float32Array(slice);
        }

        // Cache every slice
        globalSliceCache.set(this.filename, t, processedSlice);

        // Yield occasionally to keep UI responsive during bulk processing
        if (t % 10 === 0) await yieldToMain();
      }

      // Return the requested slice from cache
      return globalSliceCache.get(this.filename, timeIndex)!;
    }

    // Yield again after reading, before processing
    await yieldToMain();

    let resultData: SliceData;

    // Apply Quantization Rules (Single Slice Fallback)
    if (this.dataVarName === 'illumination' || this.dataVarName === 'orbiter_visibility') {
      // Rule 1: Uint8
      if (rawData instanceof Uint8Array) {
        resultData = rawData;
      } else {
        resultData = new Uint8Array(rawData);
      }
    } else if (this.dataVarName === 'dte_visibility' || this.dataVarName === 'night_flag') {
      // Rule 2: 1-bit Bit-Packed
      // Ensure we have a typed array to iterate over
      const input = (rawData instanceof Float32Array || rawData instanceof Int8Array || rawData instanceof Uint8Array)
        ? rawData
        : new Float32Array(rawData);
      resultData = packBinaryData(input as any);
    } else if (this.dataVarName === 'darkness_duration') {
      // Rule 3: Int16
      if (rawData instanceof Int16Array) {
        resultData = rawData;
      } else {
        resultData = new Int16Array(rawData);
      }
    } else {
      // Rule 4: Float32 (Default)
      if (rawData instanceof Float32Array) {
        resultData = rawData;
      } else {
        resultData = new Float32Array(rawData);
      }
    }

    // Cache it
    globalSliceCache.set(this.filename, timeIndex, resultData);
    return resultData;
  }

  getCachedSlice(timeIndex: number): SliceData | undefined {
    return globalSliceCache.get(this.filename, timeIndex);
  }

  async getPixelTimeSeries(y: number, x: number): Promise<number[]> {
    // Yield before starting
    await yieldToMain();

    const [timeSteps, height, width] = this.dataset.shape;
    const offset = y * width + x;
    const result = new Array(timeSteps);
    let missingCount = 0;

    // Try to fill from cache first
    for (let t = 0; t < timeSteps; t++) {
      const slice = globalSliceCache.get(this.filename, t);
      if (slice) {
        result[t] = slice[offset];
      } else {
        missingCount++;
      }
    }

    // If we found everything in cache, return immediately
    if (missingCount === 0) {
      return result;
    }

    // If we're missing data, fall back to reading from file
    // Note: If the file was fully cached, we shouldn't reach here.
    // If we do reach here, it means we have a mix or no cache.

    const start = [0, y, x];
    const count = [timeSteps, 1, 1];

    const rawData = (this.dataset as any).slice(start, count);

    // Handle the "full dataset returned" bug check here too
    // If h5wasm returns the full 3D array instead of the column
    if (rawData.length > timeSteps) {
      // If we got the full dataset, we might as well cache it all if we haven't already
      // But this is a heavy operation. For now, just extract the column we need.
      // (The getSlice method handles the bulk caching)

      const sliceSize = height * width;
      // Re-populate result from the raw full dataset
      for (let t = 0; t < timeSteps; t++) {
        result[t] = rawData[t * sliceSize + offset];
      }
      return result;
    }

    if (rawData.length === timeSteps) {
      // Correctly returned the column
      // Fill in the missing spots in our result (or just overwrite)
      for (let t = 0; t < timeSteps; t++) {
        // If we didn't have it in cache, use the file data
        if (result[t] === undefined) {
          result[t] = rawData[t];
        }
      }
      return result;
    } else {
      // Fallback logic for unexpected shapes
      const stride = height * width;

      if (rawData.length === timeSteps * stride) {
        // It returned a full volume? (Handled above, but just in case logic differs)
        for (let t = 0; t < timeSteps; t++) {
          result[t] = rawData[t * stride + offset];
        }
      } else {
        // Try simple conversion
        return Array.from(rawData);
      }
    }
    return result;
  }

  dispose() {
    // Clear cache
    globalSliceCache.clearForFile(this.filename);

    try {
      this.file.close();
      h5wasm.FS.unlink(this.filename);
    } catch (e) {
      console.error('Error closing file:', e);
    }
    console.log(`🗑️ Closed file ${this.filename}`);
  }

  clearCache() {
    globalSliceCache.clearForFile(this.filename);
  }

  getStats() {
    return globalSliceCache.getStatsForFile(this.filename);
  }
}

export class NpyLazyDataset implements ILazyDataset {
  private file: File; // Browser File object
  private metadata: StreamingNpyMetadata;
  private fileId: string;
  private progressCallback?: (progress: { message: string }) => void;

  constructor(file: H5File | File, metadata: StreamingNpyMetadata | string, options?: any) {
    // Handle overload for backward compatibility if needed, but strictly:
    if (file instanceof File) {
      this.file = file;
      this.metadata = metadata as StreamingNpyMetadata;
      this.fileId = file.name;
    } else {
      throw new Error("Invalid arguments for NpyLazyDataset");
    }
  }

  setProgressCallback(callback: (progress: { message: string }) => void) {
    this.progressCallback = callback;
  }

  async getSlice(timeIndex: number): Promise<SliceData> {
    // Check cache
    const cached = globalSliceCache.get(this.fileId, timeIndex);
    if (cached) {
      console.log(`[LazyDataset] Cache hit for ${this.fileId} at time ${timeIndex}`);
      return cached;
    }
    console.log(`[LazyDataset] Cache miss for ${this.fileId} at time ${timeIndex}`);

    // Yield before loading
    await yieldToMain();

    // Load from file
    try {
      const data = await loadNpyTimeSlice(this.file, this.metadata, timeIndex);

      // Convert TypedArray to Float32Array if needed
      let floatData: Float32Array;
      if (data instanceof Float32Array) {
        floatData = data;
      } else {
        floatData = new Float32Array(data);
      }

      // Cache it
      globalSliceCache.set(this.fileId, timeIndex, floatData);
      return floatData;
    } catch (error) {
      console.error(`Failed to load NPY slice ${timeIndex}:`, error);
      throw error;
    }
  }

  getCachedSlice(timeIndex: number): SliceData | undefined {
    return globalSliceCache.get(this.fileId, timeIndex);
  }

  async getPixelTimeSeries(y: number, x: number): Promise<number[]> {
    const { time, height, width } = this.metadata.dimensions;
    const { headerSize, bytesPerValue, dataType } = this.metadata;

    // Helper to read single value
    const readValue = async (t: number): Promise<number> => {
      // Calculate offset for pixel (y, x) at time t
      // C-order: time * sliceSize + y * rowSize + x * bytesPerValue
      const offset = headerSize +
        (t * height * width * bytesPerValue) +
        (y * width * bytesPerValue) +
        (x * bytesPerValue);

      const buffer = await readFileRange(this.file, offset, bytesPerValue);
      const typedArray = createTypedArray(buffer, dataType);
      return typedArray[0];
    };

    // Batch requests to avoid overwhelming the browser/OS
    // Batch size of 50
    const results: number[] = new Array(time);
    const batchSize = 50;

    for (let i = 0; i < time; i += batchSize) {
      // Yield every batch
      await yieldToMain();

      const batchPromises: Promise<void>[] = [];
      for (let j = 0; j < batchSize && i + j < time; j++) {
        const t = i + j;
        batchPromises.push(readValue(t).then(val => { results[t] = val; }));
      }
      await Promise.all(batchPromises);
    }

    return results;
  }

  dispose() {
    globalSliceCache.clearForFile(this.fileId);
  }

  clearCache() {
    globalSliceCache.clearForFile(this.fileId);
  }

  getStats() {
    return globalSliceCache.getStatsForFile(this.fileId);
  }
}

// Export NpyLazyDataset as LazyDataset for backward compatibility with AppContext
export { NpyLazyDataset as LazyDataset };
// Export NetCDFLazyDataset as NetCDFReader for backward compatibility
export { NetCDFLazyDataset as NetCDFReader };
