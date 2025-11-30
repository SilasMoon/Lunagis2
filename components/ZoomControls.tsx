// Fix: Removed invalid file header which was causing parsing errors.
import React from 'react';

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onExportMap?: () => void;
}

const BUTTON_STYLE = "w-9 h-9 bg-gray-800/80 hover:bg-gray-700/90 text-gray-200 rounded-md flex items-center justify-center text-xl font-mono transition-colors shadow-lg border border-gray-600/50";

export const ZoomControls: React.FC<ZoomControlsProps> = ({ onZoomIn, onZoomOut, onResetView, onExportMap }) => {
  return (
    <div className="absolute top-3 left-3 z-30 flex flex-col gap-1.5">
      <button onClick={onZoomIn} className={BUTTON_STYLE} aria-label="Zoom In" title="Zoom In">+</button>
      <button onClick={onZoomOut} className={BUTTON_STYLE} aria-label="Zoom Out" title="Zoom Out">-</button>
      <button onClick={onResetView} className={BUTTON_STYLE} aria-label="Reset View" title="Reset View">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5" />
        </svg>
      </button>
      {onExportMap && (
        <button onClick={onExportMap} className={BUTTON_STYLE} aria-label="Export Map" title="Export Map as Image">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      )}
    </div>
  );
};