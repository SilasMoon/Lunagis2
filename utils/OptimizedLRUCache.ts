import { logger } from './logger';

/**
 * Doubly-Linked List Node for LRU Cache
 */
class DLLNode<K, V> {
  key: K;
  value: V;
  prev: DLLNode<K, V> | null = null;
  next: DLLNode<K, V> | null = null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
}

/**
 * Optimized LRU (Least Recently Used) Cache implementation using Doubly-Linked List
 * Provides O(1) get, set, and delete operations
 * Automatically evicts least recently used items when capacity is reached
 */
export class OptimizedLRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, DLLNode<K, V>>;
  private head: DLLNode<K, V> | null = null; // Most recently used
  private tail: DLLNode<K, V> | null = null; // Least recently used

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Cache capacity must be positive');
    }
    this.capacity = capacity;
    this.cache = new Map();
  }

  /**
   * Get value from cache - O(1) operation
   * Updates access order by moving node to head
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);

    if (!node) {
      return undefined;
    }

    // Move accessed node to head (most recent)
    this.moveToHead(node);
    return node.value;
  }

  /**
   * Set value in cache - O(1) operation
   * Evicts least recently used item if capacity is reached
   */
  set(key: K, value: V): void {
    const existingNode = this.cache.get(key);

    // If key exists, update value and move to head
    if (existingNode) {
      existingNode.value = value;
      this.moveToHead(existingNode);
      return;
    }

    // Create new node
    const newNode = new DLLNode(key, value);

    // If at capacity, evict least recently used (tail)
    if (this.cache.size >= this.capacity) {
      this.evictLRU();
    }

    // Add new node to head
    this.addToHead(newNode);
    this.cache.set(key, newNode);
  }

  /**
   * Check if key exists in cache - O(1) operation
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete key from cache - O(1) operation
   * Fixed: Does not corrupt access order like the old implementation
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);

    if (!node) {
      return false;
    }

    // Remove from linked list
    this.removeNode(node);
    // Remove from cache map
    return this.cache.delete(key);
  }

  /**
   * Clear all items from cache
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache capacity
   */
  get maxSize(): number {
    return this.capacity;
  }

  /**
   * Get all keys in access order (least to most recent)
   */
  keys(): K[] {
    const keys: K[] = [];
    let current = this.tail;

    while (current) {
      keys.push(current.key);
      current = current.prev;
    }

    return keys;
  }

  /**
   * Get all values in access order
   */
  values(): V[] {
    const values: V[] = [];
    let current = this.tail;

    while (current) {
      values.push(current.value);
      current = current.prev;
    }

    return values;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; capacity: number; utilizationPercent: number } {
    return {
      size: this.size,
      capacity: this.capacity,
      utilizationPercent: (this.size / this.capacity) * 100
    };
  }

  /**
   * Add node to head (most recent position) - O(1)
   */
  private addToHead(node: DLLNode<K, V>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    // If this is the first node, it's also the tail
    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Remove node from linked list - O(1)
   */
  private removeNode(node: DLLNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      // Node is head
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      // Node is tail
      this.tail = node.prev;
    }
  }

  /**
   * Move node to head (mark as most recently used) - O(1)
   */
  private moveToHead(node: DLLNode<K, V>): void {
    // If already at head, nothing to do
    if (node === this.head) {
      return;
    }

    // Remove from current position
    this.removeNode(node);
    // Add to head
    this.addToHead(node);
  }

  /**
   * Evict least recently used item (tail) - O(1)
   */
  private evictLRU(): void {
    if (!this.tail) {
      return;
    }

    const lruKey = this.tail.key;
    this.removeNode(this.tail);
    this.cache.delete(lruKey);
  }
}

/**
 * Specialized LRU Cache for Canvas elements
 * Tracks total memory usage based on canvas size
 * Uses optimized doubly-linked list for O(1) operations
 */
export class OptimizedCanvasLRUCache extends OptimizedLRUCache<string, HTMLCanvasElement> {
  private maxMemoryBytes: number;
  private currentMemoryBytes: number = 0;

  constructor(maxItems: number, maxMemoryMB: number = 500) {
    super(maxItems);
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024; // Convert MB to bytes
  }

  /**
   * Calculate approximate memory usage of a canvas
   */
  private getCanvasMemorySize(canvas: HTMLCanvasElement): number {
    // Approximate: width * height * 4 bytes per pixel (RGBA)
    return canvas.width * canvas.height * 4;
  }

  /**
   * Set canvas in cache with memory tracking
   */
  set(key: string, canvas: HTMLCanvasElement): void {
    const canvasSize = this.getCanvasMemorySize(canvas);

    // Check if this canvas already exists and update memory tracking
    if (this.has(key)) {
      const oldCanvas = super.get(key);
      if (oldCanvas) {
        this.currentMemoryBytes -= this.getCanvasMemorySize(oldCanvas);
      }
    }

    // Check if adding this canvas would exceed memory limit
    if (this.currentMemoryBytes + canvasSize > this.maxMemoryBytes) {
      // Evict items until we have enough space
      while (this.currentMemoryBytes + canvasSize > this.maxMemoryBytes && this.size > 0) {
        this.evictOldest();
      }
    }

    // If canvas is too large for cache, don't store it
    if (canvasSize > this.maxMemoryBytes) {
      logger.warn(`Canvas too large for cache: ${(canvasSize / 1024 / 1024).toFixed(2)}MB`);
      return;
    }

    super.set(key, canvas);
    this.currentMemoryBytes += canvasSize;
  }

  /**
   * Delete canvas from cache with memory tracking
   * Fixed: Does not call get() which would corrupt access order
   */
  delete(key: string): boolean {
    // Access the cache map directly to avoid side effects
    const node = (this as OptimizedLRUCache<string, HTMLCanvasElement>)['cache'].get(key);

    if (node) {
      const canvas = node.value;
      this.currentMemoryBytes -= this.getCanvasMemorySize(canvas);
    }

    return super.delete(key);
  }

  /**
   * Clear all canvases and reset memory counter
   */
  clear(): void {
    super.clear();
    this.currentMemoryBytes = 0;
  }

  /**
   * Evict oldest canvas
   */
  private evictOldest(): void {
    const keys = this.keys();
    if (keys.length > 0) {
      this.delete(keys[0]);
    }
  }

  /**
   * Get cache statistics including memory usage
   */
  getStats() {
    const baseStats = super.getStats();
    return {
      ...baseStats,
      currentMemoryMB: this.currentMemoryBytes / 1024 / 1024,
      maxMemoryMB: this.maxMemoryBytes / 1024 / 1024,
      memoryUtilizationPercent: (this.currentMemoryBytes / this.maxMemoryBytes) * 100
    };
  }
}
