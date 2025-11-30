import { renderHook } from '@testing-library/react';
import { ViewportProvider, useViewportContext } from '../ViewportContext';

describe('ViewportContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ViewportProvider>{children}</ViewportProvider>
    );

    describe('Viewport State', () => {
        it('should initialize with null viewState', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.viewState).toBeNull();
        });

        it('should provide latRange and lonRange', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.latRange).toBeDefined();
            expect(result.current.lonRange).toBeDefined();
            expect(result.current.latRange).toHaveLength(2);
            expect(result.current.lonRange).toHaveLength(2);
        });
    });

    describe('Graticule Settings', () => {
        it('should initialize with graticule disabled', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.showGraticule).toBe(false);
        });

        it('should have default graticule density', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.graticuleDensity).toBe(1.0);
        });

        it('should have default graticule label font size', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.graticuleLabelFontSize).toBe(14);
        });
    });

    describe('Grid Settings', () => {
        it('should initialize with grid disabled', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.showGrid).toBe(false);
        });

        it('should have default grid spacing', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.gridSpacing).toBe(200);
        });

        it('should have default grid color', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.gridColor).toBe('#ffffff80');
        });
    });

    describe('Projection and Coordinate Systems', () => {
        it('should have null projection without baseMapLayer', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.proj).toBeNull();
        });

        it('should have null coordinate transformer without dependencies', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.coordinateTransformer).toBeNull();
        });

        it('should have null snapToCellCorner without dependencies', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.snapToCellCorner).toBeNull();
        });

        it('should have null calculateRectangleFromCellCorners without dependencies', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });
            expect(result.current.calculateRectangleFromCellCorners).toBeNull();
        });
    });

    describe('Setters', () => {
        it('should provide all required setters', () => {
            const { result } = renderHook(() => useViewportContext(), { wrapper });

            expect(typeof result.current.setViewState).toBe('function');
            expect(typeof result.current.setShowGraticule).toBe('function');
            expect(typeof result.current.setGraticuleDensity).toBe('function');
            expect(typeof result.current.setGraticuleLabelFontSize).toBe('function');
            expect(typeof result.current.setShowGrid).toBe('function');
            expect(typeof result.current.setGridSpacing).toBe('function');
            expect(typeof result.current.setGridColor).toBe('function');
        });
    });
});
