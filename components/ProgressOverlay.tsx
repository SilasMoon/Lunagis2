import React from 'react';

export interface ProgressOverlayProps {
  message: string;
  progress?: number; // 0-100, undefined for indeterminate
  onCancel?: () => void;
  show: boolean;
}

/**
 * Full-screen progress overlay with visual progress bar
 * Replaces simple text-only loading messages
 */
export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  message,
  progress,
  onCancel,
  show
}) => {
  if (!show) return null;

  const isIndeterminate = progress === undefined;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-8 max-w-md w-full mx-4 border border-gray-700">
        {/* Spinner for indeterminate progress */}
        {isIndeterminate && (
          <div className="flex justify-center mb-6">
            <svg
              className="animate-spin h-12 w-12 text-cyan-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}

        {/* Message */}
        <p className="text-lg text-gray-200 text-center mb-4">{message}</p>

        {/* Progress bar for determinate progress */}
        {!isIndeterminate && (
          <>
            <div className="w-full bg-gray-700 rounded-full h-3 mb-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300 ease-out rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="text-sm text-gray-400 text-center">{Math.round(progress)}%</p>
          </>
        )}

        {/* Cancel button if cancellation is supported */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-6 w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Inline progress bar for smaller UI areas
 */
export const InlineProgress: React.FC<{
  progress?: number;
  message?: string;
  className?: string;
}> = ({ progress, message, className = '' }) => {
  const isIndeterminate = progress === undefined;

  return (
    <div className={`space-y-2 ${className}`}>
      {message && (
        <p className="text-sm text-gray-400">{message}</p>
      )}
      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
        {isIndeterminate ? (
          <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 animate-pulse" />
        ) : (
          <div
            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300 ease-out rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        )}
      </div>
      {!isIndeterminate && (
        <p className="text-xs text-gray-500 text-right">{Math.round(progress)}%</p>
      )}
    </div>
  );
};

/**
 * Circular progress indicator
 */
export const CircularProgress: React.FC<{
  progress?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}> = ({ progress, size = 48, strokeWidth = 4, className = '' }) => {
  const isIndeterminate = progress === undefined;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = isIndeterminate ? 0 : circumference - (progress / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        className={isIndeterminate ? 'animate-spin' : ''}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background circle */}
        <circle
          className="text-gray-700"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className="text-cyan-500 transition-all duration-300 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%'
          }}
        />
      </svg>
      {!isIndeterminate && (
        <span className="absolute text-xs font-semibold text-gray-200">
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
};
