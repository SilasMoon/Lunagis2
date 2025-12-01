import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { Tool, AppStateConfig } from '../types';
import { useToast } from '../components/Toast';

interface UIStateContextType {
    // State
    activeTool: Tool | null;
    flickeringLayerId: string | null;
    importRequest: { config: AppStateConfig; requiredFiles: string[]; } | null;
    isCreatingExpression: boolean;
    activityDefinitions: Array<{ id: string; name: string; defaultDuration: number; }>;

    // Operations
    onToolSelect: (tool: Tool) => void;
    onToggleFlicker: (layerId: string) => void;
    setActiveTool: React.Dispatch<React.SetStateAction<Tool | null>>;
    setImportRequest: React.Dispatch<React.SetStateAction<{ config: AppStateConfig; requiredFiles: string[]; } | null>>;
    setIsCreatingExpression: React.Dispatch<React.SetStateAction<boolean>>;
    setActivityDefinitions: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string; defaultDuration: number; }>>>;
    onExportConfig: () => Promise<void>;
    onImportConfig: (file: File) => void;
    handleRestoreSession: (config: AppStateConfig, files: FileList | File[]) => Promise<void>;
    nightfallPlotYAxisRange: { min: number; max: number; };
    setNightfallPlotYAxisRange: React.Dispatch<React.SetStateAction<{ min: number; max: number; }>>;
}

const UIStateContext = createContext<UIStateContextType | null>(null);

export const useUIStateContext = () => {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIStateContext must be used within a UIStateProvider');
    }
    return context;
};

interface UIStateProviderProps {
    children: React.ReactNode;
    // Dependencies from other contexts
    layers?: any[]; // Will be properly typed when integrated
    onUpdateLayer?: (id: string, updates: any) => void;
    onExportConfigCallback?: () => Promise<void>;
    onImportConfigCallback?: (file: File) => void;
    onRestoreSessionCallback?: (config: AppStateConfig, files: FileList | File[]) => Promise<void>;
}

export const UIStateProvider: React.FC<UIStateProviderProps> = ({
    children,
    layers = [],
    onUpdateLayer,
    onExportConfigCallback,
    onImportConfigCallback,
    onRestoreSessionCallback,
}) => {
    const { showWarning } = useToast();

    // State
    const [activeTool, setActiveTool] = useState<Tool | null>('layers');
    const [flickeringLayerId, setFlickeringLayerId] = useState<string | null>(null);
    const [importRequest, setImportRequest] = useState<{ config: AppStateConfig; requiredFiles: string[]; } | null>(null);
    const [isCreatingExpression, setIsCreatingExpression] = useState(false);
    const [nightfallPlotYAxisRange, setNightfallPlotYAxisRange] = useState<{ min: number; max: number; }>({ min: 0, max: 100 });
    const [activityDefinitions, setActivityDefinitions] = useState([
        { id: 'DRIVE-0', name: 'Drive-0', defaultDuration: 60 },
        { id: 'DRIVE-5', name: 'Drive-5', defaultDuration: 0 },
        { id: 'DRIVE-10', name: 'Drive-10', defaultDuration: 60 },
        { id: 'DRIVE-15', name: 'Drive-15', defaultDuration: 60 },
        { id: 'DTE_COMMS', name: 'TTC_COMMS', defaultDuration: 3600 },
        { id: 'LPF_COMMS', name: 'PL_COMMS', defaultDuration: 60 },
        { id: 'IDLE', name: 'Idle', defaultDuration: 60 },
        { id: 'SLEEP', name: 'Sleep', defaultDuration: 60 },
        { id: 'SCIENCE', name: 'Science', defaultDuration: 60 },
    ]);

    // Flicker animation state
    const flickerIntervalRef = useRef<number | null>(null);
    const originalVisibilityRef = useRef<boolean | null>(null);

    // Tool selection handler
    const onToolSelect = useCallback((tool: Tool) => {
        setActiveTool(tool);

        // Stop flickering when changing tools
        if (flickeringLayerId) {
            if (flickerIntervalRef.current) {
                clearInterval(flickerIntervalRef.current);
                flickerIntervalRef.current = null;
            }
            setFlickeringLayerId(null);
        }
    }, [flickeringLayerId]);

    // Flicker toggle handler
    const onToggleFlicker = useCallback((layerId: string) => {
        const currentlyFlickeringId = flickeringLayerId;

        // If already flickering this layer, stop flickering
        if (currentlyFlickeringId === layerId) {
            setFlickeringLayerId(null);
            return;
        }

        // Stop any existing flicker
        if (flickeringLayerId) {
            setFlickeringLayerId(null);
        }

        // Start flickering the new layer
        setFlickeringLayerId(layerId);
    }, [flickeringLayerId]);

    // Flicker animation effect
    useEffect(() => {
        if (!flickeringLayerId || !onUpdateLayer) return;

        // Start flicker interval
        flickerIntervalRef.current = window.setInterval(() => {
            if (flickeringLayerId) {
                // Toggle visibility
                if (onUpdateLayer) {
                    const layer = layers.find(l => l.id === flickeringLayerId);
                    if (layer) {
                        onUpdateLayer(flickeringLayerId, { visible: !layer.visible });
                    }
                }
            }
        }, 500); // Toggle every 500ms

        return () => {
            if (flickerIntervalRef.current) {
                clearInterval(flickerIntervalRef.current);
                flickerIntervalRef.current = null;
            }
        };
    }, [flickeringLayerId, layers, onUpdateLayer]);

    // Export config handler
    const onExportConfig = useCallback(async () => {
        if (onExportConfigCallback) {
            await onExportConfigCallback();
        }
    }, [onExportConfigCallback]);

    // Import config handler
    const onImportConfig = useCallback((file: File) => {
        if (onImportConfigCallback) {
            onImportConfigCallback(file);
        }
    }, [onImportConfigCallback]);

    // Restore session handler
    const handleRestoreSession = useCallback(async (config: AppStateConfig, files: FileList | File[]) => {
        if (onRestoreSessionCallback) {
            await onRestoreSessionCallback(config, files);
        }
    }, [onRestoreSessionCallback]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Stop any ongoing flicker animation
            if (flickerIntervalRef.current) {
                clearInterval(flickerIntervalRef.current);
            }
        };
    }, []);

    const value: UIStateContextType = {
        // State
        activeTool,
        flickeringLayerId,
        importRequest,
        isCreatingExpression,
        activityDefinitions,

        // Operations
        onToolSelect,
        onToggleFlicker,
        setActiveTool,
        setImportRequest,
        setIsCreatingExpression,
        setActivityDefinitions,
        onExportConfig,
        onImportConfig,
        handleRestoreSession,
        nightfallPlotYAxisRange,
        setNightfallPlotYAxisRange,
    };

    return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
};
