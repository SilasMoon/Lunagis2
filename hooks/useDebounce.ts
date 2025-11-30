import { useEffect, useState } from 'react';

/**
 * Debounce a value - only updates after the specified delay
 * Useful for reducing the frequency of expensive operations
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 16ms for ~60fps)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 16): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function that cancels the timeout if value changes before delay
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounce a callback function using requestAnimationFrame
 * Perfect for render-related operations
 *
 * @returns A debounced callback wrapper
 */
export function useRAFDebounce() {
  const rafId = useRef<number | null>(null);

  const debounce = useCallback((callback: () => void) => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
    rafId.current = requestAnimationFrame(() => {
      callback();
      rafId.current = null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  return debounce;
}

import { useRef, useCallback } from 'react';

/**
 * Creates a throttled version of a function that only executes once per specified time period
 * Unlike debounce, throttle ensures the function is called at regular intervals
 *
 * @param callback - The function to throttle
 * @param delay - Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number = 16
): T {
  const lastCall = useRef<number>(0);
  const timeoutId = useRef<number | null>(null);

  const throttledFunction = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall.current;

    if (timeSinceLastCall >= delay) {
      lastCall.current = now;
      callback(...args);
    } else {
      // Schedule for later
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }
      timeoutId.current = window.setTimeout(() => {
        lastCall.current = Date.now();
        callback(...args);
        timeoutId.current = null;
      }, delay - timeSinceLastCall);
    }
  }, [callback, delay]) as T;

  return throttledFunction;
}
