/**
 * User-friendly error messages catalog
 * Maps error codes and technical errors to clear, actionable messages
 */

export interface ErrorInfo {
  title: string;
  message: string;
  suggestion?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Get user-friendly error message from error code
 */
export function getErrorMessage(errorCode: string): ErrorInfo {
  const messages: Record<string, Omit<ErrorInfo, 'action'>> = {
    // File validation errors
    'FILE_TOO_LARGE': {
      title: 'File Too Large',
      message: 'The file you selected is too large to load safely.',
      suggestion: 'Try using a smaller file or compressing your data before loading.'
    },
    'FILE_EMPTY': {
      title: 'Empty File',
      message: 'The file you selected appears to be empty.',
      suggestion: 'Please check the file and try again with a valid data file.'
    },
    'UNSUPPORTED_FILE_TYPE': {
      title: 'Unsupported File Type',
      message: 'The file type you selected is not supported.',
      suggestion: 'Please select a .npy, .png, .vrt, or .json file.'
    },
    'INVALID_FILE_NAME': {
      title: 'Invalid File Name',
      message: 'The file name contains invalid characters.',
      suggestion: 'Rename the file to remove special characters and try again.'
    },
    'TOTAL_SIZE_EXCEEDED': {
      title: 'Too Many Files',
      message: 'The total size of all files exceeds the maximum allowed.',
      suggestion: 'Try loading fewer files at once.'
    },

    // Parse errors
    'NPY_PARSE_ERROR': {
      title: 'Failed to Parse Data',
      message: 'The .npy file could not be read. It may be corrupted or in an unsupported format.',
      suggestion: 'Verify the file was created correctly and try re-exporting it.'
    },
    'VRT_PARSE_ERROR': {
      title: 'Failed to Parse VRT',
      message: 'The .vrt file could not be read. The XML format may be invalid.',
      suggestion: 'Check that the VRT file is a valid XML document.'
    },
    'JSON_PARSE_ERROR': {
      title: 'Failed to Parse Configuration',
      message: 'The configuration file is not valid JSON.',
      suggestion: 'Check the file for syntax errors or try exporting a new configuration.'
    },

    // Dimension errors
    'INVALID_DIMENSIONS': {
      title: 'Invalid Data Dimensions',
      message: 'The data has unexpected dimensions. Expected a 3D array (time × height × width).',
      suggestion: 'Verify your data has the correct shape before loading.'
    },
    'DIMENSION_MISMATCH': {
      title: 'Dimension Mismatch',
      message: 'The data dimensions don\'t match the existing layers.',
      suggestion: 'Ensure all layers have compatible dimensions.'
    },

    // Analysis errors
    'EXPRESSION_SYNTAX_ERROR': {
      title: 'Expression Syntax Error',
      message: 'The mathematical expression contains a syntax error.',
      suggestion: 'Check your expression for typos and ensure all operators are valid.'
    },
    'EXPRESSION_UNDEFINED_VARIABLE': {
      title: 'Undefined Variable',
      message: 'The expression references a layer that doesn\'t exist.',
      suggestion: 'Make sure all layer variables in your expression are spelled correctly.'
    },
    'CALCULATION_FAILED': {
      title: 'Calculation Failed',
      message: 'An error occurred while performing the calculation.',
      suggestion: 'Try simplifying your expression or checking for invalid values in your data.'
    },

    // Session errors
    'SESSION_RESTORE_FAILED': {
      title: 'Failed to Restore Session',
      message: 'The session could not be restored from the configuration file.',
      suggestion: 'The configuration may be from an incompatible version. Try starting a new session.'
    },
    'MISSING_FILE': {
      title: 'Missing Required File',
      message: 'A file required by the configuration is missing.',
      suggestion: 'Make sure all files referenced in the configuration are selected.'
    },

    // Memory errors
    'OUT_OF_MEMORY': {
      title: 'Out of Memory',
      message: 'Your browser ran out of memory while processing the data.',
      suggestion: 'Try closing other tabs, using a smaller dataset, or restarting your browser.'
    },

    // Network errors
    'NETWORK_ERROR': {
      title: 'Network Error',
      message: 'A network error occurred. Check your internet connection.',
      suggestion: 'Verify you\'re connected to the internet and try again.'
    },

    // Generic errors
    'UNKNOWN_ERROR': {
      title: 'Unexpected Error',
      message: 'An unexpected error occurred.',
      suggestion: 'Try refreshing the page. If the problem persists, clear your browser cache.'
    }
  };

  return messages[errorCode] || messages['UNKNOWN_ERROR'];
}

/**
 * Extract user-friendly message from a caught error
 */
export function parseError(error: unknown): ErrorInfo {
  // Handle our custom validation errors
  if (error && typeof error === 'object' && 'errorCode' in error) {
    const errorCode = (error as { errorCode: string }).errorCode;
    return getErrorMessage(errorCode);
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    const message = error.message;

    // Check for common error patterns
    if (message.includes('dimension')) {
      return getErrorMessage('INVALID_DIMENSIONS');
    }
    if (message.includes('parse') || message.includes('JSON')) {
      return getErrorMessage('JSON_PARSE_ERROR');
    }
    if (message.includes('memory') || message.includes('allocation')) {
      return getErrorMessage('OUT_OF_MEMORY');
    }
    if (message.includes('network') || message.includes('fetch')) {
      return getErrorMessage('NETWORK_ERROR');
    }
    if (message.includes('expression')) {
      return getErrorMessage('EXPRESSION_SYNTAX_ERROR');
    }

    // Return a generic error with the original message
    return {
      title: 'Error',
      message: message,
      suggestion: 'If this problem persists, try reloading the page.'
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      title: 'Error',
      message: error,
      suggestion: 'If this problem persists, try reloading the page.'
    };
  }

  // Fallback for unknown error types
  return getErrorMessage('UNKNOWN_ERROR');
}

/**
 * Format an error for display
 */
export function formatError(error: unknown): { title: string; message: string; detail?: string } {
  const errorInfo = parseError(error);

  let detail: string | undefined;
  if (error instanceof Error) {
    detail = error.stack;
  }

  return {
    title: errorInfo.title,
    message: errorInfo.suggestion
      ? `${errorInfo.message} ${errorInfo.suggestion}`
      : errorInfo.message,
    detail
  };
}
