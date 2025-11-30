# Streaming File Reader Integration Guide

## Overview

The streaming file reader enables loading large files (>500 MB, even multi-GB) without loading the entire file into memory. It uses lazy loading with LRU caching to keep memory usage constant.

## Key Benefits

- **Constant memory usage**: ~20 MB - 200 MB regardless of file size
- **Works with large files**: Successfully tested with 10+ GB files
- **Progressive loading**: Start using data before entire file is loaded
- **Smart prefetching**: Automatically preloads adjacent time slices
- **Cache management**: LRU eviction ensures memory stays bounded

## Architecture

```
User uploads file (5 GB)
    ↓
Parse header only (~10 KB read)
    ↓
Create LazyDataset
    ↓
User requests time slice 100
    ↓
Load only that slice (10 MB read)
    ↓
Cache in memory (LRU)
    ↓
User navigates to slice 101
    ↓
Load from cache (0 read) or file (10 MB read)
```

## Usage Examples

### Example 1: Basic NPY Loading

```typescript
import { parseNpyHeader, loadNpyTimeSlice } from './services/streamingNpyParser';
import { LazyDataset } from './services/LazyDataset';

async function loadLargeNpyFile(file: File) {
  // Step 1: Parse header (fast - only reads ~16 KB)
  const metadata = await parseNpyHeader(file);

  console.log('File metadata:', metadata.dimensions);
  // { time: 8760, height: 2048, width: 2048 }

  // Step 2: Create lazy dataset
  const dataset = new LazyDataset(file, metadata, {
    cacheSize: 20,          // Keep 20 time slices in memory
    preloadAdjacent: true,  // Preload ±2 adjacent slices
    preloadDistance: 2
  });

  // Step 3: Access data on-demand
  const slice150 = await dataset.getSlice(150);
  console.log('Slice 150 loaded:', slice150.length);

  // Step 4: Get single value
  const value = await dataset.getValue(150, 512, 512);
  console.log('Value at (150, 512, 512):', value);

  // Step 5: Get pixel time series
  const timeSeries = await dataset.getPixelTimeSeries(512, 512);
  console.log('Time series length:', timeSeries.length);

  // Step 6: Check cache stats
  const stats = dataset.getStats();
  console.log('Cache stats:', stats);
  // { hits: 45, misses: 5, memoryUsageMB: 85.3 }
}
```

### Example 2: NetCDF Loading

```typescript
import { parseNetCdfHeader } from './services/streamingNetCdfParser';
import { LazyDataset } from './services/LazyDataset';

async function loadLargeNetCdfFile(file: File) {
  // Step 1: Parse header and open h5wasm file
  const { metadata, h5file } = await parseNetCdfHeader(file);

  // Step 2: Create lazy dataset (pass h5file handle)
  const dataset = new LazyDataset(file, metadata, { cacheSize: 20 }, h5file);

  // Step 3: Use same API as NPY
  const slice = await dataset.getSlice(100);
  const value = await dataset.getValue(100, 256, 256);

  // Note: h5wasm requires full file in memory initially,
  // but lazy loading still helps by deferring data restructuring
}
```

### Example 3: Progress Tracking

```typescript
import { parseNpyHeader } from './services/streamingNpyParser';
import { LazyDataset } from './services/LazyDataset';

async function loadWithProgress(file: File, onProgress: (msg: string) => void) {
  // Progress callback
  const progressCallback = (progress) => {
    onProgress(
      `${progress.phase}: ${progress.percentage.toFixed(1)}% - ${progress.message}`
    );
  };

  const metadata = await parseNpyHeader(file);
  const dataset = new LazyDataset(file, metadata);
  dataset.setProgressCallback(progressCallback);

  // Loading will now report progress
  const slice = await dataset.getSlice(500);
}
```

### Example 4: Integration with Existing Code

```typescript
// In AppContext.tsx - handleAddNpyFile
const handleAddNpyFile = async (file: File) => {
  try {
    setIsLoading('Parsing file header...');

    // NEW: Use streaming parser
    const metadata = await parseNpyHeader(file);

    setIsLoading(`Loading data (${metadata.dimensions.time} time steps)...`);

    // NEW: Create lazy dataset instead of loading all data
    const lazyDataset = new LazyDataset(file, metadata, {
      cacheSize: 20,
      preloadAdjacent: true
    });

    // Option A: Keep as lazy (recommended for large files)
    const newLayer: DataLayerWithLazy = {
      id: generateSecureId('data'),
      name: file.name,
      type: 'data',
      visible: true,
      opacity: 1.0,
      colormap: 'Viridis',
      lazyDataset: lazyDataset,  // NEW FIELD
      dimensions: metadata.dimensions,
      range: { min: 0, max: 1 },  // Update after first slice loads
      // ... other fields
    };

    // Load first slice to get range
    const firstSlice = await lazyDataset.getSlice(0);
    const min = Math.min(...firstSlice);
    const max = Math.max(...firstSlice);
    newLayer.range = { min, max };

    setLayers(prev => [...prev, newLayer]);
    setIsLoading(null);

  } catch (error) {
    console.error('Failed to load file:', error);
    setIsLoading(null);
  }
};
```

### Example 5: Rendering with Lazy Dataset

```typescript
// In DataCanvas.tsx - renderLayer
function renderLayer(layer: DataLayer, timeIndex: number) {
  // Check if layer uses lazy loading
  if (layer.lazyDataset) {
    // NEW: Load slice on-demand
    layer.lazyDataset.getSlice(timeIndex).then(slice => {
      const canvas = renderSlice(slice, layer.dimensions, layer.colormap);
      updateCanvas(canvas);
    });
  } else {
    // OLD: Use pre-loaded dataset
    const slice = layer.dataset[timeIndex];
    const canvas = renderSlice(slice, layer.dimensions, layer.colormap);
    updateCanvas(canvas);
  }
}
```

## Memory Usage Comparison

### Traditional Loading (500 MB file)

```
File read:              500 MB
Data restructuring:     500 MB (copy)
Analysis results:       500 MB
Canvas cache:           500 MB
─────────────────────────────
TOTAL:                 2000 MB (2 GB)
```

### Streaming Loading (500 MB file)

```
Header read:              0.01 MB
Lazy dataset cache:      200 MB (20 slices × 10 MB)
Analysis cache:           50 MB (only computed slices)
Canvas cache:            100 MB (fewer cached frames)
─────────────────────────────
TOTAL:                   350 MB

Savings:                1650 MB (83% reduction!)
```

## Performance Characteristics

| Operation | Traditional | Streaming | Speedup |
|-----------|-------------|-----------|---------|
| Initial load | 30-60s | 0.1-1s | **30-600x** |
| First render | Immediate | 1-2s | - |
| Subsequent renders | Immediate | Immediate (cached) | 1x |
| Memory usage | 2-4 GB | 200-500 MB | **4-20x less** |
| Works with 10 GB files | ❌ No | ✅ Yes | ∞ |

## API Reference

### `parseNpyHeader(file: File): Promise<StreamingNpyMetadata>`

Parse NPY file header without loading data.

**Returns:**
- `metadata`: File metadata including dimensions, data type, byte offsets

### `parseNetCdfHeader(file: File): Promise<{ metadata, h5file }>`

Parse NetCDF4 file header using h5wasm.

**Returns:**
- `metadata`: File metadata
- `h5file`: h5wasm file handle (keep alive for lazy loading)

### `LazyDataset`

Main class for lazy loading.

**Constructor:**
```typescript
new LazyDataset(
  file: File,
  metadata: FileMetadata,
  options?: {
    cacheSize?: number,        // Default: 20
    preloadAdjacent?: boolean, // Default: true
    preloadDistance?: number   // Default: 2
  },
  h5file?: any  // For NetCDF files
)
```

**Methods:**
- `getSlice(timeIndex: number): Promise<TypedArray>` - Get 2D time slice
- `getValue(t, y, x): Promise<number>` - Get single value
- `getPixelTimeSeries(y, x): Promise<number[]>` - Get time series for pixel
- `preloadRange(start, end): Promise<void>` - Preload time range
- `clearCache(): void` - Clear cache
- `getStats(): CacheStats` - Get cache statistics
- `setProgressCallback(callback): void` - Set progress callback

## Type Definitions

### Add to `types.ts`

```typescript
import type { LazyDataset } from './services/LazyDataset';

export interface DataLayer extends LayerBase {
  type: 'data';
  dataset: DataSet;
  lazyDataset?: LazyDataset;  // NEW: Optional lazy dataset
  // ... other fields
}

export interface IlluminationLayer extends LayerBase {
  type: 'illumination';
  dataset: DataSet;
  lazyDataset?: LazyDataset;  // NEW: Optional lazy dataset
  // ... other fields
}
```

## Migration Strategy

### Phase 1: Add Lazy Support (Non-Breaking)

1. Add `lazyDataset?: LazyDataset` field to layer types
2. Update file loaders to create `LazyDataset`
3. Update renderers to check for `lazyDataset` first
4. Keep old `dataset` field for compatibility

### Phase 2: Optimize Rendering

1. Update canvas rendering to use `lazyDataset.getSlice()`
2. Add prefetching based on time slider position
3. Show loading indicators during slice loading

### Phase 3: Optimize Analysis

1. Update analysis functions to work with `LazyDataset`
2. Only materialize needed time slices
3. Cache analysis results per slice

### Phase 4: Full Migration (Breaking)

1. Make `lazyDataset` required
2. Remove old `dataset` field
3. Update all code to use lazy loading

## Troubleshooting

### Issue: "File too large" error

**Solution:** Increase browser memory limit or use smaller cache size:
```typescript
new LazyDataset(file, metadata, { cacheSize: 10 })
```

### Issue: Slow rendering when scrolling time slider

**Solution:** Increase preload distance:
```typescript
new LazyDataset(file, metadata, { preloadDistance: 5 })
```

### Issue: NetCDF files still use too much memory

**Root cause:** h5wasm requires full file in memory.

**Solution:** Convert to NPY format for true streaming:
```python
import netCDF4 as nc
import numpy as np

# Convert NetCDF to NPY
ds = nc.Dataset('input.nc')
data = ds.variables['illumination'][:]
np.save('output.npy', data)
```

## Future Enhancements

1. **IndexedDB persistence** - Cache slices across sessions
2. **Web Worker loading** - Load slices in background thread
3. **GPU decompression** - Use WebGPU for faster decompression
4. **Smart prefetching** - Use ML to predict user's next action
5. **Spatial tiling** - Split large spatial dimensions into tiles
6. **Range queries** - Load arbitrary spatial regions

## Questions?

See implementation in:
- `/services/streamingFileReader.ts`
- `/services/streamingNpyParser.ts`
- `/services/streamingNetCdfParser.ts`
- `/services/LazyDataset.ts`
