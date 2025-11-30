import { renderHook, act } from '@testing-library/react';
import { ArtifactProvider, useArtifactContext } from '../ArtifactContext';
import type { Artifact, Event } from '../../types';

describe('ArtifactContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ArtifactProvider>{children}</ArtifactProvider>
    );

    describe('Artifact State', () => {
        it('should initialize with empty artifacts', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.artifacts).toEqual([]);
        });

        it('should initialize with no active artifact', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.activeArtifactId).toBeNull();
        });

        it('should initialize with no creation mode', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.artifactCreationMode).toBeNull();
        });
    });

    describe('Artifact Operations', () => {
        it('should add artifacts', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });

            const artifact: Artifact = {
                id: 'artifact-1',
                type: 'circle',
                center: [0, 0],
                radius: 100,
                color: '#ff0000',
                label: 'Test',
            } as any;

            act(() => {
                result.current.setArtifacts([artifact]);
            });

            expect(result.current.artifacts).toHaveLength(1);
        });

        it('should remove artifacts', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });

            const artifact: Artifact = {
                id: 'artifact-1',
                type: 'circle',
            } as any;

            act(() => {
                result.current.setArtifacts([artifact]);
                result.current.onRemoveArtifact('artifact-1');
            });

            expect(result.current.artifacts).toEqual([]);
        });

        it('should finish artifact creation', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });

            act(() => {
                result.current.setArtifactCreationMode('circle');
                result.current.onFinishArtifactCreation();
            });

            expect(result.current.artifactCreationMode).toBeNull();
            expect(result.current.isAppendingWaypoints).toBe(false);
        });
    });

    describe('Event Operations', () => {
        it('should initialize with empty events', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.events).toEqual([]);
        });

        it('should add events', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });

            const event: Event = {
                id: 'event-1',
                name: 'Test Event',
                color: '#00ff00',
            } as any;

            act(() => {
                result.current.onAddEvent(event);
            });

            expect(result.current.events).toHaveLength(1);
            expect(result.current.activeEventId).toBe('event-1');
        });

        it('should remove events', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });

            const event: Event = {
                id: 'event-1',
                name: 'Test Event',
            } as any;

            act(() => {
                result.current.setEvents([event]);
                result.current.onRemoveEvent('event-1');
            });

            expect(result.current.events).toEqual([]);
        });
    });

    describe('Undo/Redo', () => {
        it('should not allow undo initially', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.canUndo).toBe(false);
        });

        it('should not allow redo initially', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.canRedo).toBe(false);
        });

        it('should provide undo and redo operations', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });

            expect(typeof result.current.onUndo).toBe('function');
            expect(typeof result.current.onRedo).toBe('function');
        });
    });

    describe('Activity Definitions', () => {
        it('should initialize with default activity definitions', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.activityDefinitions.length).toBeGreaterThan(0);
        });

        it('should have default nightfall plot Y-axis range', () => {
            const { result } = renderHook(() => useArtifactContext(), { wrapper });
            expect(result.current.nightfallPlotYAxisRange).toEqual({ min: -15, max: 15 });
        });
    });
});
