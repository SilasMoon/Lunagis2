import type { DataSet, DataSlice, TimeRange } from '../types';
import { OptimizedLRUCache } from '../utils/OptimizedLRUCache';

/**
 * Cache key generator for analysis results
 */
export class AnalysisCacheKey {
  /**
   * Generate cache key for expression layer calculation
   */
  static forExpression(expression: string, layerIds: string[]): string {
    return `expr:${expression}:${layerIds.sort().join(',')}`;
  }

  /**
   * Generate cache key for nightfall dataset calculation
   */
  static forNightfall(sourceLayerId: string, datasetHash: string): string {
    return `nightfall:${sourceLayerId}:${datasetHash}`;
  }

  /**
   * Generate cache key for daylight fraction calculation
   */
  static forDaylightFraction(
    sourceLayerId: string,
    datasetHash: string,
    timeRange: TimeRange,
    threshold?: number
  ): string {
    const thresholdStr = threshold !== undefined ? `:${threshold}` : '';
    return `daylight:${sourceLayerId}:${datasetHash}:${timeRange.start}-${timeRange.end}${thresholdStr}`;
  }

  /**
   * Simple hash function for dataset to detect changes
   * Uses dimensions and first/last timestep samples
   */
  static hashDataset(dataset: DataSet, dimensions: { time: number; height: number; width: number }): string {
    const { time, height, width } = dimensions;

    // Sample a few pixels from first and last timestep to create a fingerprint
    let hash = `${time}x${height}x${width}`;

    if (time > 0 && height > 0 && width > 0) {
      // Sample corners and center from first timestep
      const firstSlice = dataset[0];
      hash += `-${firstSlice[0][0]}`;
      hash += `-${firstSlice[0][width - 1]}`;
      hash += `-${firstSlice[height - 1][0]}`;
      hash += `-${firstSlice[height - 1][width - 1]}`;
      hash += `-${firstSlice[Math.floor(height / 2)][Math.floor(width / 2)]}`;

      // Sample from last timestep
      if (time > 1) {
        const lastSlice = dataset[time - 1];
        hash += `-${lastSlice[0][0]}`;
        hash += `-${lastSlice[height - 1][width - 1]}`;
      }
    }

    return hash;
  }
}

/**
 * Result type for expression layer calculation
 */
export interface ExpressionResult {
  dataset: DataSet;
  range: { min: number; max: number };
  dimensions: { time: number; height: number; width: number };
}

/**
 * Result type for nightfall calculation
 */
export interface NightfallResult {
  dataset: DataSet;
  range: { min: number; max: number };
  maxDuration: number;
}

/**
 * Result type for daylight fraction calculation
 */
export interface DaylightFractionResult {
  slice: DataSlice;
  range: { min: number; max: number };
}

/**
 * Union type for all cached analysis results
 */
type AnalysisResult = ExpressionResult | NightfallResult | DaylightFractionResult;

/**
 * LRU Cache for expensive analysis calculations
 * Prevents redundant computation of expression layers, nightfall datasets, etc.
 */
export class AnalysisResultCache {
  private cache: OptimizedLRUCache<string, AnalysisResult>;
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * @param maxItems - Maximum number of cached results (default: 10)
   * Each result can be quite large (millions of numbers), so keep this modest
   */
  constructor(maxItems: number = 10) {
    this.cache = new OptimizedLRUCache<string, AnalysisResult>(maxItems);
  }

  /**
   * Get cached result for expression layer
   */
  getExpression(key: string): ExpressionResult | null {
    const result = this.cache.get(key);
    if (result) {
      this.cacheHits++;
      return result as ExpressionResult;
    }
    this.cacheMisses++;
    return null;
  }

  /**
   * Cache result for expression layer
   */
  setExpression(key: string, result: ExpressionResult): void {
    this.cache.set(key, result);
  }

  /**
   * Get cached result for nightfall calculation
   */
  getNightfall(key: string): NightfallResult | null {
    const result = this.cache.get(key);
    if (result) {
      this.cacheHits++;
      return result as NightfallResult;
    }
    this.cacheMisses++;
    return null;
  }

  /**
   * Cache result for nightfall calculation
   */
  setNightfall(key: string, result: NightfallResult): void {
    this.cache.set(key, result);
  }

  /**
   * Get cached result for daylight fraction calculation
   */
  getDaylightFraction(key: string): DaylightFractionResult | null {
    const result = this.cache.get(key);
    if (result) {
      this.cacheHits++;
      return result as DaylightFractionResult;
    }
    this.cacheMisses++;
    return null;
  }

  /**
   * Cache result for daylight fraction calculation
   */
  setDaylightFraction(key: string, result: DaylightFractionResult): void {
    this.cache.set(key, result);
  }

  /**
   * Clear specific cache entry
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const baseStats = this.cache.getStats();
    const totalRequests = this.cacheHits + this.cacheMisses;
    const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;

    return {
      ...baseStats,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: hitRate,
      totalRequests: totalRequests
    };
  }
}

// Global singleton instance
export const analysisCache = new AnalysisResultCache(10);
