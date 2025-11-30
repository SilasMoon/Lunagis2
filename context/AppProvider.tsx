import React from 'react';
import { UIStateProvider } from './UIStateContext';
import { SelectionProvider } from './SelectionContext';
import { ViewportProvider } from './ViewportContext';
import { TimeProvider } from './TimeContext';
import { ArtifactProvider } from './ArtifactContext';
import { LayerStateProvider, LayerOperationsProvider, useLayerState, useLayerOperations } from './LayerContext';
import { SessionProvider } from './SessionContext';
import { useLayerContext } from './LayerContext';
import { useViewportContext } from './ViewportContext';
import { useTimeContext } from './TimeContext';
import { useSelectionContext } from './SelectionContext';
import { useUIStateContext } from './UIStateContext';
import { useArtifactContext } from './ArtifactContext';
import { useSessionContext } from './SessionContext';

/**
 * AppProvider composes all context providers together.
 * 
 * Context Dependency Tree:
 * - LayerStateContext (base - no dependencies)
 *   ├─> ViewportContext (depends on baseMapLayer, primaryDataLayer)
 *   ├─> TimeContext (depends on primaryDataLayer)
 *   └─> ArtifactContext (independent)
 *       └─> LayerOperationsContext (depends on LayerState, Viewport, Time)
 *           └─> SelectionContext (independent)
 *               └─> UIStateContext (depends on layers, onUpdateLayer)
 *                   └─> SessionContext (depends on everything)
 */

interface AppProviderProps {
    children: React.ReactNode;
}

/**
 * Inner component that consumes LayerState and LayerOperations to provide dependencies to other contexts
 */
const InnerDependentContextsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { layers } = useLayerState();
    const { onUpdateLayer } = useLayerOperations();

    return (
        <SelectionProvider>
            <UIStateProvider
                layers={layers}
                onUpdateLayer={onUpdateLayer}
            >
                <SessionProvider>
                    {children}
                </SessionProvider>
            </UIStateProvider>
        </SelectionProvider>
    );
};

/**
 * Component that consumes LayerState to provide dependencies to Viewport, Time, and LayerOperations
 */
const DependentContextsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Access layer state to get derived state for providers
    const { baseMapLayer, primaryDataLayer } = useLayerState();

    return (
        <ViewportProvider baseMapLayer={baseMapLayer} primaryDataLayer={primaryDataLayer}>
            <TimeProvider primaryDataLayer={primaryDataLayer}>
                <ArtifactProvider>
                    <LayerOperationsProvider>
                        <InnerDependentContextsProvider>
                            {children}
                        </InnerDependentContextsProvider>
                    </LayerOperationsProvider>
                </ArtifactProvider>
            </TimeProvider>
        </ViewportProvider>
    );
};

/**
 * Main AppProvider that orchestrates all context providers
 */
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    return (
        <LayerStateProvider>
            <DependentContextsProvider>
                {children}
            </DependentContextsProvider>
        </LayerStateProvider>
    );
};

// Re-export all context hooks for convenience
export { useLayerContext } from './LayerContext';
export { useViewportContext } from './ViewportContext';
export { useTimeContext } from './TimeContext';
export { useSelectionContext } from './SelectionContext';
export { useUIStateContext } from './UIStateContext';
export { useArtifactContext } from './ArtifactContext';
export { useSessionContext } from './SessionContext';

/**
 * Convenience hook that returns all context values
 * Use this when you need access to multiple contexts
 */
export const useApp = () => ({
    layers: useLayerContext(),
    viewport: useViewportContext(),
    time: useTimeContext(),
    selection: useSelectionContext(),
    ui: useUIStateContext(),
    artifacts: useArtifactContext(),
    session: useSessionContext(),
});
