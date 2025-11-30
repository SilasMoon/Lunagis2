import { renderHook, act } from '@testing-library/react';
import { TimeProvider, useTimeContext } from '../TimeContext';

describe('TimeContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TimeProvider>{children}</TimeProvider>
    );

    describe('Time State', () => {
        it('should initialize with null time range', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });
            expect(result.current.timeRange).toBeNull();
        });

        it('should initialize with null current date index', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });
            expect(result.current.currentDateIndex).toBeNull();
        });

        it('should initialize with null time zoom domain', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });
            expect(result.current.timeZoomDomain).toBeNull();
        });

        it('should initialize playback as stopped', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });
            expect(result.current.isPlaying).toBe(false);
            expect(result.current.isPaused).toBe(false);
        });

        it('should have default playback speed', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });
            expect(result.current.playbackSpeed).toBe(10);
        });
    });

    describe('Playback Speed', () => {
        it('should change playback speed', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            act(() => {
                result.current.onPlaybackSpeedChange(20);
            });

            expect(result.current.playbackSpeed).toBe(20);
        });
    });

    describe('Time Range', () => {
        it('should set time range', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            const newRange = { start: 0, end: 100 };

            act(() => {
                result.current.setTimeRange(newRange);
            });

            expect(result.current.timeRange).toEqual(newRange);
        });

        it('should handle manual time range change', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            const newRange = { start: 10, end: 50 };

            act(() => {
                result.current.handleManualTimeRangeChange(newRange);
            });

            expect(result.current.timeRange).toEqual(newRange);
        });
    });

    describe('Time Zoom', () => {
        it('should zoom to selection', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            const range = { start: 10, end: 50 };

            act(() => {
                result.current.setTimeRange(range);
            });

            // Note: zoom to selection requires date conversion which needs primaryDataLayer
            // This test verifies the operation exists
            expect(typeof result.current.onZoomToSelection).toBe('function');
        });

        it('should reset zoom', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            // Note: reset zoom needs fullTimeDomain which requires primaryDataLayer
            // This test verifies the operation exists
            expect(typeof result.current.onResetZoom).toBe('function');
        });
    });

    describe('Date Conversion', () => {
        it('should provide getDateForIndex utility', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            expect(typeof result.current.getDateForIndex).toBe('function');

            // Should return a Date object
            const date = result.current.getDateForIndex(0);
            expect(date).toBeInstanceOf(Date);
        });

        it('should provide getIndexForDate utility', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            expect(typeof result.current.getIndexForDate).toBe('function');

            // Should return a number
            const index = result.current.getIndexForDate(new Date());
            expect(typeof index).toBe('number');
        });
    });

    describe('Playback Controls', () => {
        it('should toggle play state', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            expect(result.current.isPlaying).toBe(false);

            // Note: actual playback behavior depends on timeRange
            expect(typeof result.current.onTogglePlay).toBe('function');
        });

        it('should provide playback state setters', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            expect(typeof result.current.setIsPlaying).toBe('function');
            expect(typeof result.current.setIsPaused).toBe('function');
        });
    });

    describe('Full Time Domain', () => {
        it('should compute null full time domain without data layer', () => {
            const { result } = renderHook(() => useTimeContext(), { wrapper });

            expect(result.current.fullTimeDomain).toBeNull();
        });
    });
});
