import { useCallback } from 'react';
import { validateFile, formatBytes } from '../utils/fileValidation';
import { parseError } from '../utils/errorMessages';
import { useToast } from '../components/Toast';

/**
 * Enhanced file handling hook with validation and user-friendly error messages
 * Wraps file operations to add validation and proper error handling
 */
export function useEnhancedFileHandling() {
  const toast = useToast();

  /**
   * Validate and handle a file before processing
   * Returns true if validation passed, false otherwise
   */
  const validateAndNotify = useCallback((file: File): boolean => {
    const validation = validateFile(file);

    if (!validation.valid) {
      const error = parseError({ errorCode: validation.errorCode });
      toast.showError(validation.error || error.message, error.title);
      return false;
    }

    return true;
  }, [toast]);

  /**
   * Show a user-friendly error message
   */
  const showError = useCallback((error: unknown, context?: string) => {
    const errorInfo = parseError(error);
    const message = context
      ? `${context}: ${errorInfo.message}`
      : errorInfo.message;

    const fullMessage = errorInfo.suggestion
      ? `${message} ${errorInfo.suggestion}`
      : message;

    toast.showError(fullMessage, errorInfo.title);
  }, [toast]);

  /**
   * Show a success message
   */
  const showSuccess = useCallback((message: string, title?: string) => {
    toast.showSuccess(message, title);
  }, [toast]);

  /**
   * Show a warning message
   */
  const showWarning = useCallback((message: string, title?: string) => {
    toast.showWarning(message, title);
  }, [toast]);

  return {
    validateAndNotify,
    showError,
    showSuccess,
    showWarning,
  };
}
