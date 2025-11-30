/**
 * Cryptographically secure utilities
 */

/**
 * Generate a cryptographically secure random ID
 * Uses Web Crypto API for secure random generation
 */
export function generateSecureId(prefix: string = ''): string {
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}_${hex}` : hex;
}

/**
 * Generate a secure ID with timestamp prefix for sortability
 */
export function generateTimestampId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = generateSecureId();
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Generate a hash for caching purposes using SHA-256
 * Note: This is async because crypto.subtle.digest is async
 */
export async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous hash for simple caching (faster but less secure)
 * Uses a simple djb2 hash algorithm
 */
export function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
