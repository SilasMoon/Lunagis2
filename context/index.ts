/**
 * Context Module Exports
 * 
 * This file provides convenient exports for all context providers and hooks.
 * Import from this file to access any context functionality.
 */

// Main composed provider
export { AppProvider, useApp } from './AppProvider';

// Individual context hooks
export { useLayerContext, useLayerState, useLayerOperations } from './LayerContext';
export { useViewportContext } from './ViewportContext';
export { useTimeContext } from './TimeContext';
export { useSelectionContext } from './SelectionContext';
export { useUIStateContext } from './UIStateContext';
export { useArtifactContext } from './ArtifactContext';
export { useSessionContext } from './SessionContext';

// Individual context providers (for advanced usage or testing)
export { LayerStateProvider, LayerOperationsProvider } from './LayerContext';
export { ViewportProvider } from './ViewportContext';
export { TimeProvider } from './TimeContext';
export { SelectionProvider } from './SelectionContext';
export { UIStateProvider } from './UIStateContext';
export { ArtifactProvider } from './ArtifactContext';
export { SessionProvider } from './SessionContext';

/**
 * Usage Examples:
 * 
 * 1. Using the composed provider:
 *    import { AppProvider } from './context';
 *    <AppProvider>{children}</AppProvider>
 * 
 * 2. Using individual context hooks:
 *    import { useLayerContext, useTimeContext } from './context';
 *    const { layers } = useLayerContext();
 *    const { timeRange } = useTimeContext();
 * 
 * 3. Using the convenience hook (when you need multiple contexts):
 *    import { useApp } from './context';
 *    const { layers, time, selection } = useApp();
 * 
 * 4. Using individual providers (for testing):
 *    import { LayerStateProvider } from './context';
 *    <LayerStateProvider>{testComponent}</LayerStateProvider>
 */
