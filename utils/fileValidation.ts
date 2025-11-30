/**
 * File validation utilities to prevent loading files that could crash the browser
 */

import { FILE_SIZE_LIMITS, MAX_TOTAL_FILE_SIZE } from '../config/defaults';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

// MIME type validation (optional but recommended)
const ALLOWED_MIME_TYPES = {
  '.npy': ['application/octet-stream', 'application/x-numpy'],
  '.nc': ['application/netcdf', 'application/x-netcdf', 'application/octet-stream'],
  '.nc4': ['application/netcdf', 'application/x-netcdf', 'application/octet-stream'],
  '.png': ['image/png'],
  '.vrt': ['text/xml', 'application/xml', 'text/plain'],
  '.json': ['application/json', 'text/plain'],
} as const;

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const ext = filename.toLowerCase().match(/\.[^.]+$/);
  return ext ? ext[0] : '';
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Validate file size
 */
export function validateFileSize(file: File): FileValidationResult {
  const ext = getFileExtension(file.name);
  const limit = FILE_SIZE_LIMITS[ext as keyof typeof FILE_SIZE_LIMITS];

  if (!limit) {
    return {
      valid: false,
      error: `Unsupported file type: ${ext}. Allowed types: ${Object.keys(FILE_SIZE_LIMITS).join(', ')}`,
      errorCode: 'UNSUPPORTED_FILE_TYPE'
    };
  }

  if (file.size > limit) {
    return {
      valid: false,
      error: `File "${file.name}" is too large (${formatBytes(file.size)}). Maximum size for ${ext} files is ${formatBytes(limit)}.`,
      errorCode: 'FILE_TOO_LARGE'
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: `File "${file.name}" is empty.`,
      errorCode: 'FILE_EMPTY'
    };
  }

  return { valid: true };
}

/**
 * Validate MIME type (optional - browsers can be inconsistent with MIME types)
 */
export function validateFileMimeType(file: File): FileValidationResult {
  const ext = getFileExtension(file.name);
  const allowedTypes = ALLOWED_MIME_TYPES[ext as keyof typeof ALLOWED_MIME_TYPES];

  if (!allowedTypes) {
    return { valid: true }; // Unknown extension, skip MIME check
  }

  // Note: MIME type validation can be unreliable, so we only log in development
  if (file.type && !allowedTypes.includes(file.type)) {
    // MIME type mismatch is non-critical, just for debugging
    if (process.env.NODE_ENV === 'development') {
      // File has unexpected MIME type - may be browser-specific behavior
    }
  }

  return { valid: true };
}

/**
 * Validate file name for safety
 */
export function validateFileName(file: File): FileValidationResult {
  // Check for dangerous characters
  const dangerousChars = /[<>:"|?*\x00-\x1f]/;
  if (dangerousChars.test(file.name)) {
    return {
      valid: false,
      error: `File name "${file.name}" contains invalid characters.`,
      errorCode: 'INVALID_FILE_NAME'
    };
  }

  // Check for path traversal attempts
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return {
      valid: false,
      error: `File name "${file.name}" contains path separators.`,
      errorCode: 'INVALID_FILE_NAME'
    };
  }

  // Check for excessively long names
  if (file.name.length > 255) {
    return {
      valid: false,
      error: `File name is too long (${file.name.length} characters). Maximum is 255.`,
      errorCode: 'FILE_NAME_TOO_LONG'
    };
  }

  return { valid: true };
}

/**
 * Comprehensive file validation
 */
export function validateFile(file: File): FileValidationResult {
  // Validate file name
  const nameValidation = validateFileName(file);
  if (!nameValidation.valid) return nameValidation;

  // Validate file size
  const sizeValidation = validateFileSize(file);
  if (!sizeValidation.valid) return sizeValidation;

  // Validate MIME type (warning only)
  validateFileMimeType(file);

  return { valid: true };
}

/**
 * Validate multiple files
 */
export function validateFiles(files: File[]): FileValidationResult[] {
  return files.map(validateFile);
}

/**
 * Get total size of multiple files
 */
export function getTotalFileSize(files: File[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}

/**
 * Validate that total file size doesn't exceed system limits
 */
export function validateTotalSize(files: File[], maxTotalSize: number = MAX_TOTAL_FILE_SIZE): FileValidationResult {
  const totalSize = getTotalFileSize(files);

  if (totalSize > maxTotalSize) {
    return {
      valid: false,
      error: `Total file size (${formatBytes(totalSize)}) exceeds maximum allowed (${formatBytes(maxTotalSize)}).`,
      errorCode: 'TOTAL_SIZE_EXCEEDED'
    };
  }

  return { valid: true };
}
