import { OptimizedCanvasLRUCache } from '../utils/OptimizedLRUCache';

/**
 * Global cache for offscreen canvases used in rendering.
 * Shared between DataCanvas and other components to manage memory usage.
 */
export const canvasCache = new OptimizedCanvasLRUCache(50, 500); // 50 items, 500MB max
