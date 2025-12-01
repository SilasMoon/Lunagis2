// Fix: Removed invalid file header which was causing parsing errors.
import React, { useState } from 'react';
import { ToolBar } from './components/TopBar';
import { SidePanel } from './components/ControlPanel';
import { DataCanvas } from './components/DataCanvas';
import { TimeSlider } from './components/TimeSlider';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { ImportFilesModal } from './components/ImportFilesModal';
import { UserManualModal } from './components/UserManualModal';
import { useLayerContext, useTimeContext, useUIStateContext, useArtifactContext, useSessionContext } from './context';
import { StatusBar } from './components/StatusBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProgressOverlay } from './components/ProgressOverlay';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const App: React.FC = () => {
  const { primaryDataLayer, baseMapLayer, isLoading } = useLayerContext();
  const { timeRange, onTogglePlay, handleManualTimeRangeChange } = useTimeContext();
  const {
    activeTool,
    onToolSelect,
    importRequest,
    setImportRequest,
  } = useUIStateContext();
  const { onImportConfig, onExportConfig, handleRestoreSession } = useSessionContext();
  const { canUndo, canRedo, onUndo, onRedo } = useArtifactContext();

  // User Manual modal state
  const [showUserManual, setShowUserManual] = useState(false);

  // Parse progress from loading message (e.g., "Calculating... 45%")
  const loadingProgress = React.useMemo(() => {
    if (!isLoading) return undefined;
    const match = isLoading.match(/(\d+)%/);
    return match ? parseInt(match[1], 10) : undefined;
  }, [isLoading]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: ' ',
      description: 'Play/Pause time animation',
      action: () => {
        if (primaryDataLayer && timeRange) {
          onTogglePlay();
        }
      }
    },
    {
      key: 'ArrowLeft',
      description: 'Previous time step',
      action: () => {
        if (timeRange && timeRange.start > 0) {
          handleManualTimeRangeChange({
            start: timeRange.start - 1,
            end: timeRange.start - 1
          });
        }
      }
    },
    {
      key: 'ArrowRight',
      description: 'Next time step',
      action: () => {
        if (timeRange && primaryDataLayer && timeRange.start < primaryDataLayer.dimensions.time - 1) {
          handleManualTimeRangeChange({
            start: timeRange.start + 1,
            end: timeRange.start + 1
          });
        }
      }
    },
    {
      key: '1',
      description: 'Switch to Layers tool',
      action: () => onToolSelect('layers')
    },
    {
      key: '2',
      description: 'Switch to Pan tool',
      action: () => onToolSelect('pan')
    },
    {
      key: '3',
      description: 'Switch to Zoom tool',
      action: () => onToolSelect('zoom')
    },
    {
      key: '4',
      description: 'Switch to Cell Select tool',
      action: () => onToolSelect('cellSelect')
    },
    {
      key: '5',
      description: 'Switch to Multi-Cell Select tool',
      action: () => onToolSelect('multiCellSelect')
    }
  ], !isLoading); // Disable shortcuts while loading

  return (
    <div className="h-screen bg-gray-900 text-gray-200 flex flex-row font-sans overflow-hidden">
      {importRequest && <ImportFilesModal requiredFiles={importRequest.requiredFiles} onCancel={() => setImportRequest(null)} onConfirm={(files) => handleRestoreSession(importRequest.config, files)} />}
      <UserManualModal isOpen={showUserManual} onClose={() => setShowUserManual(false)} />
      <ProgressOverlay
        show={!!isLoading}
        message={isLoading || ''}
        progress={loadingProgress}
      />
      <ToolBar
        activeTool={activeTool}
        onToolSelect={onToolSelect}
        onUserManualClick={() => setShowUserManual(true)}
        onImportConfig={onImportConfig}
        onExportConfig={onExportConfig}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        isDataLoaded={!!primaryDataLayer || !!baseMapLayer}
      />

      <SidePanel />

      <main className="flex-grow flex flex-col min-w-0">
        <section className="flex-grow flex items-center justify-center bg-black/20 p-4 sm:p-6 lg:p-8 relative">
          <ErrorBoundary
            fallback={
              <div className="text-center p-8">
                <p className="text-red-500 text-xl mb-4">Canvas Error</p>
                <p className="text-gray-400">The map canvas encountered an error. Try reloading the page.</p>
              </div>
            }
          >
            <DataCanvas />
          </ErrorBoundary>
        </section>

        {primaryDataLayer && (
          <>
            <ErrorBoundary fallback={<div className="h-8 bg-gray-800"></div>}>
              <StatusBar />
            </ErrorBoundary>
            <ErrorBoundary fallback={<div className="h-48 bg-gray-800"></div>}>
              <TimeSeriesPlot />
            </ErrorBoundary>
            <ErrorBoundary fallback={<div className="h-20 bg-gray-800"></div>}>
              <TimeSlider />
            </ErrorBoundary>
          </>
        )}
      </main>
    </div>
  );
};

export default App;