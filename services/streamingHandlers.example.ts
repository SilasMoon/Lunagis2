/**
 * Example integration of streaming file loaders
 *
 * This file shows how to integrate the streaming file reader into your
 * existing AppContext handlers. Copy the relevant parts into your actual
 * handlers.
 *
 * USAGE:
 * 1. Add `lazyDataset?: LazyDataset` field to DataLayer/IlluminationLayer types
 * 2. Replace file loading logic with streaming versions below
 * 3. Update rendering code to use lazyDataset.getSlice()
 */

import type { DataLayer, IlluminationLayer, Layer } from '../types';
import { parseNpyHeader } from './streamingNpyParser';
import { parseNetCdfHeader, closeNetCdfFile } from './streamingNetCdfParser';
import { LazyDataset, materializeLazyDataset } from './LazyDataset';
import { parseTimeValues } from './netcdf4Parser';
import { generateSecureId } from '../utils/idGenerator';

/**
 * Example 1: Loading NPY file with streaming
 */
export async function handleAddNpyFileStreaming(
  file: File,
  setIsLoading: (msg: string | null) => void,
  setLayers: (updater: (prev: Layer[]) => Layer[]) => void
): Promise<void> {
  try {
    setIsLoading('Parsing file header...');

    // Parse header only (fast - reads ~16 KB)
    const metadata = await parseNpyHeader(file);

    console.log('📊 NPY file metadata:', {
      dimensions: metadata.dimensions,
      dataType: metadata.dataType,
      sliceSize: `${(metadata.sliceSize / 1024 / 1024).toFixed(2)} MB`,
      totalSize: `${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB`
    });

    setIsLoading('Creating lazy dataset...');

    // Create lazy dataset
    const lazyDataset = new LazyDataset(file, metadata, {
      cacheSize: 20,          // Keep 20 time slices in memory (~200 MB)
      preloadAdjacent: true,  // Automatically preload nearby slices
      preloadDistance: 2      // Preload ±2 slices
    });

    // Set progress callback
    lazyDataset.setProgressCallback((progress) => {
      setIsLoading(progress.message);
    });

    setIsLoading('Loading first slice to determine range...');

    // Load first slice to calculate data range
    const firstSlice = await lazyDataset.getSlice(0);
    const min = Math.min(...firstSlice);
    const max = Math.max(...firstSlice);

    console.log(`📈 Data range: ${min} to ${max}`);

    // Create layer with lazy dataset
    const newLayer: Partial<DataLayer> = {
      id: generateSecureId('data'),
      name: file.name,
      type: 'data',
      visible: true,
      opacity: 1.0,
      colormap: 'Viridis',
      colormapInverted: false,
      dataset: [], // Empty for now - will use lazyDataset instead
      // @ts-ignore - Add lazyDataset field
      lazyDataset: lazyDataset,
      range: { min, max },
      dimensions: metadata.dimensions
    };

    setLayers(prev => [...prev, newLayer as DataLayer]);
    setIsLoading(null);

    console.log('✅ NPY file loaded successfully (lazy mode)');
  } catch (error) {
    console.error('Failed to load NPY file:', error);
    setIsLoading(null);
    throw error;
  }
}

/**
 * Example 2: Loading NetCDF file with streaming
 */
export async function handleAddNetCdfFileStreaming(
  file: File,
  setIsLoading: (msg: string | null) => void,
  setLayers: (updater: (prev: Layer[]) => Layer[]) => void
): Promise<void> {
  try {
    setIsLoading('Parsing NetCDF header...');

    // Parse header and open h5wasm file
    const { metadata, h5file } = await parseNetCdfHeader(file, (progress) => {
      setIsLoading(progress.message);
    });

    console.log('📊 NetCDF file metadata:', {
      dimensions: metadata.dimensions,
      variable: metadata.variableName,
      dataType: metadata.dataType
    });

    setIsLoading('Creating lazy dataset...');

    // Create lazy dataset (pass h5file for NetCDF)
    const lazyDataset = new LazyDataset(
      file,
      metadata,
      {
        cacheSize: 20,
        preloadAdjacent: true,
        preloadDistance: 2
      },
      h5file  // Important: pass h5wasm file handle
    );

    setIsLoading('Loading first slice...');

    // Load first slice for range
    const firstSlice = await lazyDataset.getSlice(0);
    const min = Math.min(...firstSlice);
    const max = Math.max(...firstSlice);

    // Parse temporal info
    let temporalInfo;
    if (metadata.netcdfMetadata.timeUnit && metadata.netcdfMetadata.timeValues) {
      try {
        const dates = parseTimeValues(
          metadata.netcdfMetadata.timeValues,
          metadata.netcdfMetadata.timeUnit
        );
        temporalInfo = {
          dates,
          startDate: dates[0],
          endDate: dates[dates.length - 1]
        };
      } catch (e) {
        console.warn('Failed to parse time values:', e);
      }
    }

    // Create illumination layer
    const newLayer: Partial<IlluminationLayer> = {
      id: generateSecureId('illumination'),
      name: file.name,
      type: 'illumination',
      visible: true,
      opacity: 1.0,
      colormap: 'Viridis',
      colormapInverted: false,
      dataset: [], // Empty - using lazy loading
      // @ts-ignore - Add lazyDataset field
      lazyDataset: lazyDataset,
      range: { min, max },
      dimensions: metadata.dimensions,
      fileName: file.name,
      metadata: metadata.netcdfMetadata,
      temporalInfo,
      illuminationThreshold: 0
    };

    setLayers(prev => [...prev, newLayer as IlluminationLayer]);
    setIsLoading(null);

    console.log('✅ NetCDF file loaded successfully (lazy mode)');
  } catch (error) {
    console.error('Failed to load NetCDF file:', error);
    setIsLoading(null);
    throw error;
  }
}

/**
 * Example 3: Converting lazy dataset to traditional format (compatibility)
 */
export async function convertLazyToTraditional(
  lazyDataset: LazyDataset,
  setIsLoading: (msg: string | null) => void
): Promise<number[][][]> {
  setIsLoading('Converting lazy dataset to traditional format...');

  const dataset = await materializeLazyDataset(lazyDataset, (progress) => {
    setIsLoading(
      `Loading data: ${progress.percentage.toFixed(1)}% (${progress.loaded}/${progress.total})`
    );
  });

  setIsLoading(null);
  return dataset;
}

/**
 * Example 4: Rendering a layer with lazy dataset
 */
export async function renderLayerWithLazy(
  layer: DataLayer,
  timeIndex: number,
  renderSlice: (slice: Float32Array | number[], width: number, height: number) => HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  // @ts-ignore - Check for lazyDataset field
  if (layer.lazyDataset) {
    // Lazy loading path
    // @ts-ignore
    const slice = await layer.lazyDataset.getSlice(timeIndex);
    return renderSlice(slice, layer.dimensions.width, layer.dimensions.height);
  } else {
    // Traditional path
    const slice = layer.dataset[timeIndex];
    const flatSlice = slice.flat();
    return renderSlice(flatSlice, layer.dimensions.width, layer.dimensions.height);
  }
}

/**
 * Example 5: Getting time series with lazy dataset
 */
export async function getTimeSeriesWithLazy(
  layer: DataLayer,
  x: number,
  y: number
): Promise<number[]> {
  // @ts-ignore - Check for lazyDataset field
  if (layer.lazyDataset) {
    // Lazy loading path
    // @ts-ignore
    return layer.lazyDataset.getPixelTimeSeries(y, x);
  } else {
    // Traditional path
    return layer.dataset.map(slice => slice[y][x]);
  }
}

/**
 * Example 6: Preloading time range for smooth playback
 */
export async function preloadTimeRange(
  layer: DataLayer,
  startTime: number,
  endTime: number,
  setIsLoading: (msg: string | null) => void
): Promise<void> {
  // @ts-ignore - Check for lazyDataset field
  if (!layer.lazyDataset) {
    console.log('Layer does not use lazy loading');
    return;
  }

  setIsLoading(`Preloading time range ${startTime} to ${endTime}...`);

  // @ts-ignore
  await layer.lazyDataset.preloadRange(startTime, endTime);

  setIsLoading(null);
  console.log(`✅ Preloaded ${endTime - startTime} time slices`);
}

/**
 * Example 7: Getting cache statistics
 */
export function getCacheStats(layer: DataLayer): string {
  // @ts-ignore - Check for lazyDataset field
  if (!layer.lazyDataset) {
    return 'Layer does not use lazy loading';
  }

  // @ts-ignore
  const stats = layer.lazyDataset.getStats();

  const hitRate = stats.hits / (stats.hits + stats.misses) * 100;

  return `
Cache Statistics:
- Hit rate: ${hitRate.toFixed(1)}% (${stats.hits} hits, ${stats.misses} misses)
- Memory usage: ${stats.memoryUsageMB.toFixed(2)} MB
- Cache size: ${stats.currentSize}/${stats.maxSize} slices
- Evictions: ${stats.evictions}
  `.trim();
}
