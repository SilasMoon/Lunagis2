// Fix: Removed invalid file header which was causing parsing errors.
import React, { useRef } from 'react';
import type { Tool } from '../types';
import logoUrl from '../utils/LunaGis_logo.svg?url';
// NEW: Migrated to use modular contexts
import { useUIStateContext } from '../context/UIStateContext';
import { useArtifactContext } from '../context/ArtifactContext';
import { useLayerContext } from '../context/LayerContext';
import { useSessionContext } from '../context/SessionContext';

interface ToolBarProps {
  onUserManualClick?: () => void;
}

interface ToolButtonProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ label, icon, isActive, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-current={isActive ? 'page' : undefined}
    className={`w-full flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 ${isActive
      ? 'bg-cyan-500/20 text-cyan-300'
      : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
      }`}
  >
    {icon}
    <span className="text-xs mt-1">{label}</span>
  </button>
);

const LayersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v2m14 0V9" />
  </svg>
);

const MeasurementIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 12h8M12 8v8" />
  </svg>
);

const ConfigIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ArtifactsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" />
  </svg>
);

const EventsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
  </svg>
);

const UserManualIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const ImportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
  </svg>
);

const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
  </svg>
);

const UndoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
);

const RedoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
  </svg>
);

export const ToolBar: React.FC<ToolBarProps> = ({ onUserManualClick }) => {
  // NEW: Use modular contexts instead of props
  const { activeTool, onToolSelect } = useUIStateContext();
  const { onImportConfig, onExportConfig } = useSessionContext();
  const { canUndo, canRedo, onUndo, onRedo } = useArtifactContext();
  const { primaryDataLayer, baseMapLayer } = useLayerContext();

  const isDataLoaded = !!primaryDataLayer || !!baseMapLayer;

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => importInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onImportConfig(e.target.files[0]);
      e.target.value = ''; // Reset input to allow selecting the same file again
    }
  };

  return (
    <aside className="bg-gray-800/50 border-r border-gray-700 py-2 flex-shrink-0 flex flex-col items-center gap-4" style={{ width: '75x' }} role="navigation" aria-label="Main navigation">
      <div className="w-full flex items-center justify-center" aria-label="Lunagis logo">
        <img src={logoUrl} alt="LunaGis" className="h-auto object-contain" style={{ width: '50px' }} />
      </div>
      <ToolButton label="Layers" icon={<LayersIcon />} isActive={activeTool === 'layers'} onClick={() => onToolSelect('layers')} />
      <ToolButton label="Artifacts" icon={<ArtifactsIcon />} isActive={activeTool === 'artifacts'} onClick={() => onToolSelect('artifacts')} />
      <ToolButton label="Events" icon={<EventsIcon />} isActive={activeTool === 'events'} onClick={() => onToolSelect('events')} />
      <ToolButton label="Measure" icon={<MeasurementIcon />} isActive={activeTool === 'measurement'} onClick={() => onToolSelect('measurement')} />
      <ToolButton label="Config" icon={<ConfigIcon />} isActive={activeTool === 'config'} onClick={() => onToolSelect('config')} />

      {/* Divider */}
      <div className="w-full border-t border-gray-700" />

      {/* Import/Export Buttons */}
      <input type="file" ref={importInputRef} onChange={handleFileSelect} accept=".json" style={{ display: 'none' }} />
      <button
        onClick={handleImportClick}
        title="Import Config"
        aria-label="Import Config"
        className="w-full flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 text-gray-400 hover:bg-indigo-700/50 hover:text-indigo-300"
      >
        <ImportIcon />
        <span className="text-xs mt-1">Import</span>
      </button>
      <button
        onClick={onExportConfig}
        disabled={!isDataLoaded}
        title="Export Config"
        aria-label="Export Config"
        className="w-full flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 text-gray-400 hover:bg-teal-700/50 hover:text-teal-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        <ExportIcon />
        <span className="text-xs mt-1">Export</span>
      </button>

      {/* Undo/Redo Buttons */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className="w-full flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 text-gray-400 hover:bg-purple-700/50 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        <UndoIcon />
        <span className="text-xs mt-1">Undo</span>
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
        className="w-full flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 text-gray-400 hover:bg-purple-700/50 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        <RedoIcon />
        <span className="text-xs mt-1">Redo</span>
      </button>

      {/* Spacer to push User Manual button to bottom */}
      <div className="flex-grow" />

      {/* User Manual Button */}
      {onUserManualClick && (
        <button
          onClick={onUserManualClick}
          title="User Manual"
          aria-label="User Manual"
          className="w-full flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 text-gray-400 hover:bg-cyan-700/50 hover:text-cyan-300 border border-gray-700 hover:border-cyan-600"
        >
          <UserManualIcon />
          <span className="text-xs mt-1">Manual</span>
        </button>
      )}
    </aside>
  );
};
