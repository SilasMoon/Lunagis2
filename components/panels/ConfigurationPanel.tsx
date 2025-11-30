import React from 'react';
import { useLayerContext } from '../../context/LayerContext';
import { useTimeContext } from '../../context/TimeContext';
import { useViewportContext } from '../../context/ViewportContext';
import { useSelectionContext } from '../../context/SelectionContext';
import { useArtifactContext } from '../../context/ArtifactContext';
import { useUIStateContext } from '../../context/UIStateContext';
import { Section, PlayIcon, StopIcon } from './panelUtils';

export const ConfigurationPanel: React.FC = () => {
    const { primaryDataLayer, baseMapLayer, activeLayer } = useLayerContext();

    const {
        timeRange, isPlaying, isPaused, playbackSpeed,
        onTogglePlay, onPlaybackSpeedChange
    } = useTimeContext();

    const {
        showGraticule, setShowGraticule,
        graticuleDensity, setGraticuleDensity,
        graticuleLabelFontSize, setGraticuleLabelFontSize,
        showGrid, setShowGrid,
        gridSpacing, setGridSpacing,
        gridColor, setGridColor,
    } = useViewportContext();

    const { selectedPixel } = useSelectionContext();

    const { artifactDisplayOptions, setArtifactDisplayOptions } = useArtifactContext();

    const {
        nightfallPlotYAxisRange,
        setNightfallPlotYAxisRange
    } = useUIStateContext();
    const isDataLoaded = !!primaryDataLayer || !!baseMapLayer;

    const isNightfallActive = activeLayer?.type === 'analysis' && activeLayer.analysisType === 'nightfall';

    return (
        <div className="space-y-4">
            <h2 className="text-base font-semibold text-cyan-300">Configuration</h2>

            {!isDataLoaded ? <p className="text-xs text-gray-400 mt-2">Load a data layer or import a session to see more options.</p> : (
                <>
                    {isNightfallActive && (
                        <Section title="Plot Options" defaultOpen={true}>
                            <h4 className="text-xs font-medium text-gray-300 mb-2">Nightfall Plot Y-Axis Range</h4>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-400">Min (days)</label>
                                <input type="number" step="1" value={nightfallPlotYAxisRange.min}
                                    onChange={e => setNightfallPlotYAxisRange({ ...nightfallPlotYAxisRange, min: Number(e.target.value) })}
                                    className="w-full bg-gray-700 text-white text-xs rounded-md p-1 border border-gray-600" />
                                <label className="text-xs text-gray-400">Max (days)</label>
                                <input type="number" step="1" value={nightfallPlotYAxisRange.max}
                                    onChange={e => setNightfallPlotYAxisRange({ ...nightfallPlotYAxisRange, max: Number(e.target.value) })}
                                    className="w-full bg-gray-700 text-white text-xs rounded-md p-1 border border-gray-600" />
                            </div>
                        </Section>
                    )}
                    <Section title="Time Animation">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onTogglePlay}
                                disabled={!isPlaying && !isPaused && (!timeRange || timeRange.start >= timeRange.end)}
                                className="flex items-center justify-center gap-2 w-28 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 rounded-md text-xs transition-all"
                                title={isPlaying ? "Stop" : isPaused ? "Resume Playback" : (!timeRange || timeRange.start >= timeRange.end ? "Select a time range on the slider to enable playback" : "Play")}
                            >
                                {isPlaying ? <StopIcon /> : <PlayIcon />}
                                <span>{isPlaying ? 'Stop' : isPaused ? 'Resume' : 'Play'}</span>
                            </button>
                            <div className="flex-grow">
                                <label className="block text-xs text-gray-400 mb-1">Speed: {playbackSpeed} FPS</label>
                                <input
                                    type="range"
                                    min="1"
                                    max="30"
                                    step="1"
                                    value={playbackSpeed}
                                    onChange={(e) => onPlaybackSpeedChange(Number(e.target.value))}
                                    disabled={isPlaying}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </Section>
                    <Section title="View Options" defaultOpen={true}>
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showGraticule} onChange={(e) => setShowGraticule(e.target.checked)} className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500" /><span>Show Graticule</span></label>
                        {showGraticule && (
                            <div className="pt-3 space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">Density: {graticuleDensity.toFixed(1)}x</label>
                                    <input type="range" min="0.2" max="5" step="0.1" value={graticuleDensity} onChange={(e) => setGraticuleDensity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">Label Font Size: {graticuleLabelFontSize}px</label>
                                    <input type="range" min="8" max="24" step="1" value={graticuleLabelFontSize} onChange={(e) => setGraticuleLabelFontSize(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                                </div>
                            </div>
                        )}
                    </Section>
                    <Section title="Artifact Display Options">
                        <div>
                            <label className="block text-xs font-medium text-gray-400">Waypoint Dot Size: {artifactDisplayOptions.waypointDotSize}px</label>
                            <input type="range" min="2" max="20" step="1"
                                value={artifactDisplayOptions.waypointDotSize}
                                onChange={(e) => setArtifactDisplayOptions({ ...artifactDisplayOptions, waypointDotSize: Number(e.target.value) })}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400">Label Font Size: {artifactDisplayOptions.labelFontSize}px</label>
                            <input type="range" min="8" max="24" step="1"
                                value={artifactDisplayOptions.labelFontSize}
                                onChange={(e) => setArtifactDisplayOptions({ ...artifactDisplayOptions, labelFontSize: Number(e.target.value) })}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1"
                            />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                            <input type="checkbox"
                                checked={artifactDisplayOptions.showSegmentLengths}
                                onChange={(e) => setArtifactDisplayOptions({ ...artifactDisplayOptions, showSegmentLengths: e.target.checked })}
                                className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500" />
                            <span>Show Segment Lengths</span>
                        </label>
                    </Section>
                    <Section title="Grid Overlay">
                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500" /><span>Show Grid Overlay</span></label>
                        {showGrid && (
                            <div className="pt-3 space-y-3 border-t border-gray-700/50 mt-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400">Spacing: {gridSpacing}m</label>
                                    <input type="range" min="10" max="1000" step="10" value={gridSpacing} onChange={(e) => setGridSpacing(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-gray-400">Color</label>
                                    <input type="color" value={gridColor.slice(0, 7)} onChange={(e) => setGridColor(e.target.value + '80')} className="w-10 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer" />
                                </div>
                            </div>
                        )}
                    </Section>
                    <Section title="Selected Pixel" defaultOpen={true}>
                        <div className="text-xs space-y-2">
                            <div className="flex justify-between"><span className="text-gray-400">Pixel (X, Y):</span><span className="font-mono text-green-400">{selectedPixel ? `${selectedPixel.x}, ${selectedPixel.y}` : '---'}</span></div>
                        </div>
                    </Section>
                </>
            )}
        </div>
    );
};
