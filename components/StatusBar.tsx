import React, { useState, useEffect } from 'react';
// NEW: Migrated to use modular contexts instead of monolithic AppContext
import { useSelectionContext } from '../context/SelectionContext';
import { useTimeContext } from '../context/TimeContext';
import { useLayerContext } from '../context/LayerContext';
import { useArtifactContext } from '../context/ArtifactContext';
import { canvasCache } from '../services/canvasCache';

const InfoItem: React.FC<{ label: string; value: string | number; }> = ({ label, value }) => (
    <div className="flex items-center gap-2">
        <span className="text-gray-400 text-xs">{label}:</span>
        <span className="font-mono text-cyan-300 text-xs">{value}</span>
    </div>
);

const formatDateToString = (date: Date): string => {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
    }).replace(',', '');
};

export const StatusBar: React.FC = () => {
    // NEW: Use modular contexts
    const { hoveredCoords, timeSeriesData } = useSelectionContext();
    const { timeRange, currentDateIndex, getDateForIndex } = useTimeContext();
    const { primaryDataLayer, layers } = useLayerContext();
    const { artifactDisplayOptions, setArtifactDisplayOptions } = useArtifactContext();
    const [cacheUsageMB, setCacheUsageMB] = useState<number>(0);

    // Poll cache usage every 2 seconds
    useEffect(() => {
        const updateCacheStats = () => {
            let totalMB = 0;

            // Analysis cache (approximate, assuming mostly small objects but let's count items)
            // Note: AnalysisCache doesn't track bytes, but we can assume some overhead.
            // For now, let's focus on the heavy hitters: Canvas and LazyDataset.

            // Canvas cache
            const canvasStats = canvasCache.getStats();
            totalMB += canvasStats.currentMemoryMB;

            // LazyDataset caches
            layers.forEach(layer => {
                if ('lazyDataset' in layer && layer.lazyDataset) {
                    const stats = layer.lazyDataset.getStats();
                    // Fix: Use totalSizeMB instead of memoryUsageMB (which is undefined)
                    totalMB += (stats.totalSizeMB || 0);
                }
            });

            setCacheUsageMB(totalMB || 0);
        };

        updateCacheStats(); // Initial update
        const interval = setInterval(updateCacheStats, 2000);
        return () => clearInterval(interval);
    }, [layers]);

    if (!primaryDataLayer) {
        return null;
    }

    // Get current value for the current date
    const currentValue = timeSeriesData && currentDateIndex !== null && currentDateIndex < timeSeriesData.data.length
        ? timeSeriesData.data[currentDateIndex]
        : null;

    const toggleActivitySymbols = () => {
        setArtifactDisplayOptions(prev => ({
            ...prev,
            showActivitySymbols: !prev.showActivitySymbols
        }));
    };

    return (
        <section className="bg-gray-800/70 border-y border-gray-700 w-full flex-shrink-0 z-40 px-4 py-1 flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
            <div className="flex items-center gap-x-4">
                <InfoItem label="Lat" value={hoveredCoords ? hoveredCoords.lat.toFixed(4) : '---'} />
                <InfoItem label="Lon" value={hoveredCoords ? hoveredCoords.lon.toFixed(4) : '---'} />
                {currentValue !== null && currentValue !== undefined && !isNaN(currentValue) && (
                    <InfoItem label="Value" value={currentValue.toFixed(2)} />
                )}
            </div>

            {timeRange ? (
                <div className="flex items-center gap-x-4">
                    <InfoItem label="Current" value={currentDateIndex !== null ? formatDateToString(getDateForIndex(currentDateIndex)) : '---'} />
                    <InfoItem label="Start" value={formatDateToString(getDateForIndex(timeRange.start))} />
                    <InfoItem label="End" value={formatDateToString(getDateForIndex(timeRange.end))} />
                    <InfoItem label="Duration" value={`${timeRange.end - timeRange.start + 1} hrs`} />
                </div>
            ) : (
                <div className="flex items-center gap-x-4">
                    <InfoItem label="Current" value={'---'} />
                    <InfoItem label="Start" value={'---'} />
                    <InfoItem label="End" value={'---'} />
                    <InfoItem label="Duration" value={'---'} />
                </div>
            )}

            <div className="flex items-center gap-x-4">
                <InfoItem label="Cache" value={`${cacheUsageMB.toFixed(1)} MB`} />
                <button
                    onClick={toggleActivitySymbols}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${artifactDisplayOptions.showActivitySymbols
                        ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}
                    title={artifactDisplayOptions.showActivitySymbols ? 'Hide activity symbols' : 'Show activity symbols'}
                >
                    {artifactDisplayOptions.showActivitySymbols ? '👁️ Activities' : '👁️‍🗨️ Activities'}
                </button>
            </div>
        </section>
    );
};