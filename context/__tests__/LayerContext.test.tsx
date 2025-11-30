import { renderHook, act } from '@testing-library/react';
import { LayerProvider, useLayerContext } from '../LayerContext';
import type { Layer } from '../../types';

describe('LayerContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LayerProvider>{children}</LayerProvider>
    );

    describe('Layer State', () => {
        it('should initialize with empty layers', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });
            expect(result.current.layers).toEqual([]);
        });

        it('should initialize with no active layer', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });
            expect(result.current.activeLayerId).toBeNull();
        });

        it('should initialize with no loading state', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });
            expect(result.current.isLoading).toBeNull();
        });
    });

    describe('Layer Operations', () => {
        it('should add layers', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const layer: Layer = {
                id: 'layer-1',
                name: 'Test Layer',
                type: 'data',
                visible: true,
            } as any;

            act(() => {
                result.current.setLayers([layer]);
            });

            expect(result.current.layers).toHaveLength(1);
        });

        it('should update layers', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const layer: Layer = {
                id: 'layer-1',
                name: 'Test Layer',
                visible: true,
            } as any;

            act(() => {
                result.current.setLayers([layer]);
                result.current.onUpdateLayer('layer-1', { visible: false });
            });

            expect(result.current.layers[0].visible).toBe(false);
        });

        it('should remove layers', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const layer: Layer = {
                id: 'layer-1',
                name: 'Test Layer',
            } as any;

            act(() => {
                result.current.setLayers([layer]);
                result.current.onRemoveLayer('layer-1');
            });

            expect(result.current.layers).toEqual([]);
        });

        it('should clear active layer when removed', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const layer: Layer = {
                id: 'layer-1',
                name: 'Test Layer',
            } as any;

            act(() => {
                result.current.setLayers([layer]);
                result.current.setActiveLayerId('layer-1');
            });

            expect(result.current.activeLayerId).toBe('layer-1');

            act(() => {
                result.current.onRemoveLayer('layer-1');
            });

            expect(result.current.activeLayerId).toBeNull();
        });
    });

    describe('Derived State', () => {
        it('should compute baseMapLayer', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const baseMap: Layer = {
                id: 'basemap-1',
                type: 'basemap',
            } as any;

            act(() => {
                result.current.setLayers([baseMap]);
            });

            expect(result.current.baseMapLayer).toBeDefined();
            expect(result.current.baseMapLayer?.id).toBe('basemap-1');
        });

        it('should compute primaryDataLayer', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const dataLayer: Layer = {
                id: 'data-1',
                type: 'data',
            } as any;

            act(() => {
                result.current.setLayers([dataLayer]);
            });

            expect(result.current.primaryDataLayer).toBeDefined();
            expect(result.current.primaryDataLayer?.id).toBe('data-1');
        });

        it('should compute activeLayer', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const layer: Layer = {
                id: 'layer-1',
                name: 'Test',
            } as any;

            act(() => {
                result.current.setLayers([layer]);
                result.current.setActiveLayerId('layer-1');
            });

            expect(result.current.activeLayer).toBeDefined();
            expect(result.current.activeLayer?.id).toBe('layer-1');
        });
    });

    describe('Canvas Cache Cleaner', () => {
        it('should register canvas cache cleaner', () => {
            const { result } = renderHook(() => useLayerContext(), { wrapper });

            const mockCleaner = jest.fn();

            act(() => {
                result.current.registerCanvasCacheCleaner(mockCleaner);
            });

            // Test is successful if no errors thrown
            expect(typeof result.current.registerCanvasCacheCleaner).toBe('function');
        });
    });
});
