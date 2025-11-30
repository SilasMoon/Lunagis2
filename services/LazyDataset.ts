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

const SLICE_CACHE_SIZE_MB = 256; // Max cache size in MB

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
  private file: H5File;
  private filename: string;
  private dataVarName: string;
  private dataset: H5Dataset;

  constructor(file: H5File, filename: string, dataVarName: string) {
    this.file = file;
    this.filename = filename;
    this.dataVarName = dataVarName;
    this.dataset = file.get(dataVarName) as H5Dataset;
  }

  async getSlice(timeIndex: number): Promise<SliceData> {
    // Check cache first
    const cached = globalSliceCache.get(this.filename, timeIndex);
    if (cached) {
      return cached;
    }

    // Yield before heavy lifting to let UI breathe
    await yieldToMain();

    const [_, height, width] = this.dataset.shape;
    const start = [timeIndex, 0, 0];
    const count = [1, height, width];

    // Read data directly
    const rawData = (this.dataset as any).slice(start, count);

    // Yield again after reading, before processing
    await yieldToMain();

    let resultData: SliceData;

    // Apply Quantization Rules
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

    const timeSteps = this.dataset.shape[0];
    const start = [0, y, x];
    const count = [timeSteps, 1, 1];

    const rawData = (this.dataset as any).slice(start, count);

    // Handle the "full dataset returned" bug check here too
    let result: number[];

    if (rawData.length === timeSteps) {
      result = Array.from(rawData);
    } else {
      // Fallback logic
      const [_, height, width] = this.dataset.shape;
      const stride = height * width;
      const offset = y * width + x;

      if (rawData.length === timeSteps * stride) {
        result = new Array(timeSteps);
        for (let t = 0; t < timeSteps; t++) {
          result[t] = rawData[t * stride + offset];
        }
      } else {
        // Try simple conversion
        result = Array.from(rawData);
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
      return cached;
    }

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
