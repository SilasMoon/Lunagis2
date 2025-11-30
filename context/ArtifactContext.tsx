import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Artifact, Event, ActivityDefinition, DragInfo, ArtifactDisplayOptions, PathCreationOptions } from '../types';
import { logger } from '../utils/logger';
import { useToast } from '../components/Toast';
import { MAX_HISTORY_STATES } from '../config/defaults';

interface ArtifactContextType {
    // Artifact state
    artifacts: Artifact[];
    activeArtifactId: string | null;
    artifactCreationMode: "circle" | "rectangle" | "free_rectangle" | "path" | null;
    isAppendingWaypoints: boolean;
    draggedInfo: DragInfo | null;
    artifactDisplayOptions: ArtifactDisplayOptions;
    pathCreationOptions: PathCreationOptions;

    // Event state
    events: Event[];
    activeEventId: string | null;

    // Activity state
    activityDefinitions: ActivityDefinition[];
    nightfallPlotYAxisRange: { min: number; max: number; };

    // Undo/Redo
    canUndo: boolean;
    canRedo: boolean;

    // Artifact operations
    setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>;
    setActiveArtifactId: React.Dispatch<React.SetStateAction<string | null>>;
    setArtifactCreationMode: React.Dispatch<React.SetStateAction<"circle" | "rectangle" | "free_rectangle" | "path" | null>>;
    setIsAppendingWaypoints: React.Dispatch<React.SetStateAction<boolean>>;
    setDraggedInfo: React.Dispatch<React.SetStateAction<DragInfo | null>>;
    setArtifactDisplayOptions: React.Dispatch<React.SetStateAction<ArtifactDisplayOptions>>;
    setPathCreationOptions: React.Dispatch<React.SetStateAction<PathCreationOptions>>;
    onUpdateArtifact: (id: string, updates: Partial<Artifact>) => void;
    onRemoveArtifact: (id: string) => void;
    onFinishArtifactCreation: () => void;
    onStartAppendWaypoints: () => void;

    // Event operations
    setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
    setActiveEventId: React.Dispatch<React.SetStateAction<string | null>>;
    onUpdateEvent: (id: string, updates: Partial<Event>) => void;
    onRemoveEvent: (id: string) => void;
    onAddEvent: (event: Event) => void;

    // Activity operations
    setActivityDefinitions: React.Dispatch<React.SetStateAction<ActivityDefinition[]>>;
    onNightfallPlotYAxisRangeChange: (range: { min: number; max: number; }) => void;

    // Undo/Redo operations
    onUndo: () => void;
    onRedo: () => void;
}

const ArtifactContext = createContext<ArtifactContextType | null>(null);

export const useArtifactContext = () => {
    const context = useContext(ArtifactContext);
    if (!context) {
        throw new Error('useArtifactContext must be used within an ArtifactProvider');
    }
    return context;
};

interface ArtifactProviderProps {
    children: React.ReactNode;
}

export const ArtifactProvider: React.FC<ArtifactProviderProps> = ({ children }) => {
    const { showError } = useToast();

    // Artifact state
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
    const [artifactCreationMode, setArtifactCreationMode] = useState<"circle" | "rectangle" | "free_rectangle" | "path" | null>(null);
    const [isAppendingWaypoints, setIsAppendingWaypoints] = useState<boolean>(false);
    const [draggedInfo, setDraggedInfo] = useState<DragInfo | null>(null);
    const [artifactDisplayOptions, setArtifactDisplayOptions] = useState<ArtifactDisplayOptions>({
        waypointDotSize: 8,
        showSegmentLengths: true,
        labelFontSize: 14,
        showActivitySymbols: true,
    });
    const [pathCreationOptions, setPathCreationOptions] = useState<PathCreationOptions>({
        defaultMaxSegmentLength: 200 as number | null,
    });

    // Event state
    const [events, setEvents] = useState<Event[]>([]);
    const [activeEventId, setActiveEventId] = useState<string | null>(null);

    // Activity definitions (loaded from localStorage)
    const [activityDefinitions, setActivityDefinitions] = useState<ActivityDefinition[]>(() => {
        const STORAGE_KEY = 'lunagis_activity_definitions';
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            logger.error('Error loading activity definitions:', error);
        }
        // Return default activity definitions
        return [
            { id: 'DRIVE-0', name: 'Drive-0', defaultDuration: 60 },
            { id: 'DRIVE-5', name: 'Drive-5', defaultDuration: 0 },
            { id: 'DRIVE-10', name: 'Drive-10', defaultDuration: 60 },
            { id: 'DRIVE-15', name: 'Drive-15', defaultDuration: 60 },
            { id: 'DTE_COMMS', name: 'TTC_COMMS', defaultDuration: 3600 },
            { id: 'LPF_COMMS', name: 'PL_COMMS', defaultDuration: 60 },
            { id: 'IDLE', name: 'Idle', defaultDuration: 60 },
            { id: 'SLEEP', name: 'Sleep', defaultDuration: 60 },
            { id: 'SCIENCE', name: 'Science', defaultDuration: 60 },
        ];
    });

    const [nightfallPlotYAxisRange, setNightfallPlotYAxisRange] = useState<{ min: number; max: number; }>({ min: -15, max: 15 });

    // Persist activity definitions to localStorage
    useEffect(() => {
        const STORAGE_KEY = 'lunagis_activity_definitions';
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(activityDefinitions));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showError(`Failed to save activity definitions: ${errorMessage}`, 'Save Error');
        }
    }, [activityDefinitions, showError]);

    // Undo/Redo state (only for artifacts and events)
    type HistoryState = {
        artifacts: Artifact[];
        events: Event[];
    };
    const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

    // Save current state to undo stack
    const saveStateToHistory = useCallback(() => {
        const currentState: HistoryState = {
            artifacts: artifacts.map(a => {
                if (a.type === 'path') {
                    return { ...a, waypoints: a.waypoints.map(w => ({ ...w, activities: w.activities ? [...w.activities] : undefined })) };
                }
                return { ...a };
            }) as Artifact[],
            events: events.map(e => ({ ...e })),
        };
        setUndoStack(prev => {
            const newStack = [...prev, currentState];
            if (newStack.length > MAX_HISTORY_STATES) {
                return newStack.slice(newStack.length - MAX_HISTORY_STATES);
            }
            return newStack;
        });
        setRedoStack([]);
    }, [artifacts, events]);

    // Artifact operations
    const onUpdateArtifact = useCallback((id: string, updates: Partial<Artifact>) => {
        saveStateToHistory();
        setArtifacts(prev => prev.map(a => (a.id === id ? { ...a, ...updates } as Artifact : a)));
    }, [saveStateToHistory]);

    const onRemoveArtifact = useCallback((id: string) => {
        saveStateToHistory();
        setArtifacts(prev => prev.filter(a => a.id !== id));
        if (activeArtifactId === id) {
            setActiveArtifactId(null);
        }
    }, [saveStateToHistory, activeArtifactId]);

    const onFinishArtifactCreation = useCallback(() => {
        setArtifactCreationMode(null);
        setIsAppendingWaypoints(false);
        setActiveArtifactId(null);
    }, []);

    const onStartAppendWaypoints = useCallback(() => {
        setIsAppendingWaypoints(true);
    }, []);

    // Event operations
    const onUpdateEvent = useCallback((id: string, updates: Partial<Event>) => {
        saveStateToHistory();
        setEvents(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
    }, [saveStateToHistory]);

    const onRemoveEvent = useCallback((id: string) => {
        saveStateToHistory();
        setEvents(prev => prev.filter(e => e.id !== id));
        if (activeEventId === id) {
            setActiveEventId(null);
        }
    }, [saveStateToHistory, activeEventId]);

    const onAddEvent = useCallback((event: Event) => {
        saveStateToHistory();
        setEvents(prev => [...prev, event]);
        setActiveEventId(event.id);
    }, [saveStateToHistory]);

    // Nightfall plot Y-axis range handler
    const onNightfallPlotYAxisRangeChange = useCallback((range: { min: number; max: number; }) => {
        setNightfallPlotYAxisRange(range);
    }, []);

    // Undo/Redo operations
    const onUndo = useCallback(() => {
        if (undoStack.length === 0) return;

        const currentState: HistoryState = {
            artifacts: artifacts.map(a => {
                if (a.type === 'path') {
                    return { ...a, waypoints: a.waypoints.map(w => ({ ...w, activities: w.activities ? [...w.activities] : undefined })) };
                }
                return { ...a };
            }) as Artifact[],
            events: events.map(e => ({ ...e })),
        };

        const previousState = undoStack[undoStack.length - 1];
        setArtifacts(previousState.artifacts);
        setEvents(previousState.events);
        setUndoStack(prev => prev.slice(0, -1));
        setRedoStack(prev => [...prev, currentState]);
    }, [undoStack, artifacts, events]);

    const onRedo = useCallback(() => {
        if (redoStack.length === 0) return;

        const currentState: HistoryState = {
            artifacts: artifacts.map(a => {
                if (a.type === 'path') {
                    return { ...a, waypoints: a.waypoints.map(w => ({ ...w, activities: w.activities ? [...w.activities] : undefined })) };
                }
                return { ...a };
            }) as Artifact[],
            events: events.map(e => ({ ...e })),
        };

        const nextState = redoStack[redoStack.length - 1];
        setArtifacts(nextState.artifacts);
        setEvents(nextState.events);
        setRedoStack(prev => prev.slice(0, -1));
        setUndoStack(prev => [...prev, currentState]);
    }, [redoStack, artifacts, events]);

    const value: ArtifactContextType = {
        // State
        artifacts,
        activeArtifactId,
        artifactCreationMode,
        isAppendingWaypoints,
        draggedInfo,
        artifactDisplayOptions,
        pathCreationOptions,
        events,
        activeEventId,
        activityDefinitions,
        nightfallPlotYAxisRange,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,

        // Artifact operations
        setArtifacts,
        setActiveArtifactId,
        setArtifactCreationMode,
        setIsAppendingWaypoints,
        setDraggedInfo,
        setArtifactDisplayOptions,
        setPathCreationOptions,
        onUpdateArtifact,
        onRemoveArtifact,
        onFinishArtifactCreation,
        onStartAppendWaypoints,

        // Event operations
        setEvents,
        setActiveEventId,
        onUpdateEvent,
        onRemoveEvent,
        onAddEvent,

        // Activity operations
        setActivityDefinitions,
        onNightfallPlotYAxisRangeChange,

        // Undo/Redo
        onUndo,
        onRedo,
    };

    return <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>;
};
