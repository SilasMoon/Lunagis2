import { renderHook, act } from '@testing-library/react';
import { SelectionProvider, useSelectionContext } from '../SelectionContext';
import type { PixelCoords } from '../../types';

describe('SelectionContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <SelectionProvider>{children}</SelectionProvider>
    );

    describe('Cell Selection', () => {
        it('should initialize with empty cell selection', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });
            expect(result.current.selectedCells).toEqual([]);
        });

        it('should add selected cells', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const cells = [{ x: 10, y: 20 }, { x: 15, y: 25 }];

            act(() => {
                result.current.setSelectedCells(cells);
            });

            expect(result.current.selectedCells).toEqual(cells);
        });

        it('should change selection color', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            expect(result.current.selectionColor).toBe('#ffff00');

            act(() => {
                result.current.setSelectionColor('#ff0000');
            });

            expect(result.current.selectionColor).toBe('#ff0000');
        });

        it('should set selected cell for plot', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const cell = { x: 10, y: 20 };

            act(() => {
                result.current.setSelectedCellForPlot(cell);
            });

            expect(result.current.selectedCellForPlot).toEqual(cell);
        });

        it('should clear selection', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const cells = [{ x: 10, y: 20 }];
            const plotCell = { x: 10, y: 20 };

            act(() => {
                result.current.setSelectedCells(cells);
                result.current.setSelectedCellForPlot(plotCell);
            });

            expect(result.current.selectedCells).toHaveLength(1);
            expect(result.current.selectedCellForPlot).toEqual(plotCell);

            act(() => {
                result.current.onClearSelection();
            });

            expect(result.current.selectedCells).toEqual([]);
            expect(result.current.selectedCellForPlot).toBeNull();
        });
    });

    describe('Pixel Selection', () => {
        it('should set selected pixel', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const pixel: PixelCoords & { layerId: string } = {
                x: 100,
                y: 200,
                layerId: 'layer-123',
            };

            act(() => {
                result.current.setSelectedPixel(pixel);
            });

            expect(result.current.selectedPixel).toEqual(pixel);
        });

        it('should clear selected pixel via clearHoverState', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const pixel: PixelCoords & { layerId: string } = {
                x: 100,
                y: 200,
                layerId: 'layer-123',
            };

            act(() => {
                result.current.setSelectedPixel(pixel);
            });

            expect(result.current.selectedPixel).toEqual(pixel);

            act(() => {
                result.current.clearHoverState();
            });

            expect(result.current.selectedPixel).toBeNull();
        });
    });

    describe('Hover State', () => {
        it('should track hovered coordinates', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const coords = { lon: 10.5, lat: 20.3 };

            act(() => {
                result.current.setHoveredCoords(coords);
            });

            expect(result.current.hoveredCoords).toEqual(coords);
        });

        it('should clear hover state', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const coords = { lon: 10.5, lat: 20.3 };
            const pixel: PixelCoords & { layerId: string } = {
                x: 100,
                y: 200,
                layerId: 'layer-123',
            };

            act(() => {
                result.current.setHoveredCoords(coords);
                result.current.setSelectedPixel(pixel);
            });

            expect(result.current.hoveredCoords).toEqual(coords);
            expect(result.current.selectedPixel).toEqual(pixel);

            act(() => {
                result.current.clearHoverState();
            });

            expect(result.current.hoveredCoords).toBeNull();
            expect(result.current.selectedPixel).toBeNull();
        });
    });

    describe('Time Series Data', () => {
        it('should manage time series data', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const timeSeriesData = {
                data: [1, 2, 3, 4, 5],
                range: { min: 1, max: 5 },
            };

            act(() => {
                result.current.setTimeSeriesData(timeSeriesData);
            });

            expect(result.current.timeSeriesData).toEqual(timeSeriesData);
        });

        it('should clear time series data', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const timeSeriesData = {
                data: [1, 2, 3],
                range: { min: 1, max: 3 },
            };

            act(() => {
                result.current.setTimeSeriesData(timeSeriesData);
                result.current.setTimeSeriesData(null);
            });

            expect(result.current.timeSeriesData).toBeNull();
        });
    });

    describe('Daylight Fraction Hover Data', () => {
        it('should manage daylight fraction hover data', () => {
            const { result } = renderHook(() => useSelectionContext(), { wrapper });

            const hoverData = {
                value: 0.75,
                position: { x: 100, y: 200 },
            } as any; // Simplified for test

            act(() => {
                result.current.setDaylightFractionHoverData(hoverData);
            });

            expect(result.current.daylightFractionHoverData).toEqual(hoverData);
        });
    });
});
