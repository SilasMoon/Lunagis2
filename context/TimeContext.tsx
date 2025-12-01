import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { TimeRange, TimeDomain, DataLayer } from '../types';
import { indexToDate, dateToIndex } from '../utils/time';

interface TimeContextType {
    // State
    timeRange: TimeRange | null;
    currentDateIndex: number | null;
    timeZoomDomain: TimeDomain | null;
    fullTimeDomain: TimeDomain | null;
    isPlaying: boolean;
    isPaused: boolean;
    playbackSpeed: number;

    // Operations
    setTimeRange: React.Dispatch<React.SetStateAction<TimeRange | null>>;
    setCurrentDateIndex: React.Dispatch<React.SetStateAction<number | null>>;
    setTimeZoomDomain: React.Dispatch<React.SetStateAction<TimeDomain | null>>;
    handleManualTimeRangeChange: (newRange: TimeRange) => void;
    onTogglePlay: () => void;
    onPlaybackSpeedChange: (speed: number) => void;
    onZoomToSelection: () => void;
    onResetZoom: () => void;
    setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;

    // Utilities
    getDateForIndex: (index: number) => Date;
    getIndexForDate: (date: Date) => number;
}

const TimeContext = createContext<TimeContextType | null>(null);

export const useTimeContext = () => {
    const context = useContext(TimeContext);
    if (!context) {
        throw new Error('useTimeContext must be used within a TimeProvider');
    }
    return context;
};

interface TimeProviderProps {
    children: React.ReactNode;
    // Dependencies from other contexts
    primaryDataLayer?: DataLayer;
}

export const TimeProvider: React.FC<TimeProviderProps> = ({
    children,
    primaryDataLayer,
}) => {
    // Time state
    const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
    const [currentDateIndex, setCurrentDateIndex] = useState<number | null>(null);
    const [timeZoomDomain, setTimeZoomDomain] = useState<TimeDomain | null>(null);

    // Playback state
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isPaused, setIsPaused] = useState<boolean>(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(10);

    // Playback refs
    const animationFrameId = useRef<number | null>(null);
    const lastFrameTime = useRef<number>(0);
    const playbackRange = useRef<{ start: number; end: number; } | null>(null);

    // Layer-aware date conversion function
    const getDateForIndex = useCallback((index: number): Date => {
        // Use temporal info from illumination layers if available
        if (primaryDataLayer?.type === 'illumination' && primaryDataLayer.temporalInfo) {
            const { dates } = primaryDataLayer.temporalInfo;
            if (index >= 0 && index < dates.length) {
                return dates[index];
            }
        }
        // Fall back to index-based calculation
        return indexToDate(index);
    }, [primaryDataLayer]);

    // Layer-aware inverse: date to index conversion
    const getIndexForDate = useCallback((date: Date): number => {
        // Use temporal info from illumination layers if available
        if (primaryDataLayer?.type === 'illumination' && primaryDataLayer.temporalInfo) {
            const { dates } = primaryDataLayer.temporalInfo;

            // Find the closest time index by comparing timestamps
            let closestIndex = 0;
            let minDiff = Math.abs(dates[0].getTime() - date.getTime());

            for (let i = 1; i < dates.length; i++) {
                const diff = Math.abs(dates[i].getTime() - date.getTime());
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            }

            return closestIndex;
        }
        // Fall back to index-based calculation
        return dateToIndex(date);
    }, [primaryDataLayer]);

    // Compute full time domain from primary data layer
    const fullTimeDomain: TimeDomain | null = useMemo(() => {
        if (!primaryDataLayer) return null;

        // Use temporal info if available (from NetCDF illumination layers)
        if (primaryDataLayer.type === 'illumination' && primaryDataLayer.temporalInfo) {
            return [primaryDataLayer.temporalInfo.startDate, primaryDataLayer.temporalInfo.endDate];
        }

        // Otherwise use index-based dates
        return [indexToDate(0), indexToDate(primaryDataLayer.dimensions.time - 1)];
    }, [primaryDataLayer]);

    // Initialize timeZoomDomain when fullTimeDomain first becomes available
    useEffect(() => {
        if (fullTimeDomain && !timeZoomDomain) {
            setTimeZoomDomain(fullTimeDomain);
        }
    }, [fullTimeDomain]); // Removed timeZoomDomain from dependencies to prevent reset

    // Initialize currentDateIndex and timeRange when primaryDataLayer loads
    useEffect(() => {
        if (primaryDataLayer) {
            if (currentDateIndex === null) {
                setCurrentDateIndex(0);
            }
            if (timeRange === null) {
                setTimeRange({ start: 0, end: primaryDataLayer.dimensions.time - 1 });
            }
        }
    }, [primaryDataLayer, currentDateIndex, timeRange]);

    // Playback animation loop
    useEffect(() => {
        if (!isPlaying) return;

        const animate = (timestamp: number) => {
            if (lastFrameTime.current === 0) {
                lastFrameTime.current = timestamp;
            }
            const deltaTime = timestamp - lastFrameTime.current;
            const frameInterval = 1000 / playbackSpeed; // Convert fps to ms per frame

            if (deltaTime >= frameInterval) {
                lastFrameTime.current = timestamp;
                setCurrentDateIndex((prev) => {
                    const nextIndex = (prev ?? 0) + 1;
                    const maxIndex = playbackRange.current ? playbackRange.current.end : primaryDataLayer?.dimensions.time ?? 0;

                    if (nextIndex >= maxIndex) {
                        return playbackRange.current?.start ?? 0; // Loop back to start
                    }
                    return nextIndex;
                });
            }

            animationFrameId.current = requestAnimationFrame(animate);
        };

        animationFrameId.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isPlaying, playbackSpeed, primaryDataLayer]);

    // Manual time range change handler
    const handleManualTimeRangeChange = useCallback((newRange: TimeRange) => {
        setTimeRange(newRange);
    }, []);

    // Toggle play/pause
    const onTogglePlay = useCallback(() => {
        if (isPaused) {
            setIsPaused(false);
            setIsPlaying(true);
        } else if (isPlaying) {
            setIsPlaying(false);
        } else {
            // Start playing
            if (timeRange) {
                const [startDate, endDate] = timeRange;
                playbackRange.current = { start: getIndexForDate(startDate), end: getIndexForDate(endDate) };
                setCurrentDateIndex(timeRange.start);
            }
            setIsPaused(false);
            setIsPlaying(true);
        }
    }, [isPlaying, isPaused, timeRange, getIndexForDate]);

    // Playback speed change handler
    const onPlaybackSpeedChange = useCallback((speed: number) => {
        setPlaybackSpeed(speed);
    }, []);

    // Zoom to selection (sets time zoom domain to current time range)
    const onZoomToSelection = useCallback(() => {
        if (timeRange) {
            const startDate = getDateForIndex(timeRange.start);
            const endDate = getDateForIndex(timeRange.end);
            setTimeZoomDomain([startDate, endDate]);
        }
    }, [timeRange, getDateForIndex]);

    // Reset zoom (sets time zoom domain to full domain)
    const onResetZoom = useCallback(() => {
        if (fullTimeDomain) {
            setTimeZoomDomain(fullTimeDomain);
        }
    }, [fullTimeDomain]);

    const value: TimeContextType = {
        // State
        timeRange,
        currentDateIndex,
        timeZoomDomain,
        fullTimeDomain,
        isPlaying,
        isPaused,
        playbackSpeed,

        // Operations
        setTimeRange,
        setCurrentDateIndex,
        setTimeZoomDomain,
        handleManualTimeRangeChange,
        onTogglePlay,
        onPlaybackSpeedChange,
        onZoomToSelection,
        onResetZoom,
        setIsPlaying,
        setIsPaused,

        // Utilities
        getDateForIndex,
        getIndexForDate,
    };

    return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
};
