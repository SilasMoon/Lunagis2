import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { ColorMapName, GeoCoordinates, PixelCoords, TimeRange, Tool, Layer, DataLayer, AnalysisLayer, ImageLayer, ColorStop, DaylightFractionHoverData, Artifact, ArtifactBase, CircleArtifact, RectangleArtifact, PathArtifact, Waypoint, DteCommsLayer, LpfCommsLayer, IlluminationLayer, Event, DivergingThresholdConfig } from '../../types';
import { COLOR_MAPS } from '../../types';
import { Colorbar } from '../Colorbar';
import { DivergingThresholdEditor } from '../DivergingThresholdEditor';
import { sanitizeLayerNameForExpression } from '../../services/analysisService';
import { useLayerContext } from '../../context/LayerContext';
import { useUIStateContext } from '../../context/UIStateContext';
import { useSelectionContext } from '../../context/SelectionContext';
import { Section, formatDuration } from './panelUtils';
import { hasColormap, isNightfallLayer, isExpressionLayer, isAnalysisLayer, isImageLayer, isDaylightFractionLayer, isDataLayer, isIlluminationLayer } from '../../utils/layerHelpers';
import { color as d3Color } from 'd3-color';

const rgbaToHexAlpha = (colorStr: string): { hex: string; alpha: number } => {
    const colorObj = d3Color(colorStr);
    if (!colorObj) return { hex: '#000000', alpha: 1 };

    const rgb = colorObj.rgb();
    const toHex = (c: number) => ('0' + Math.round(c).toString(16)).slice(-2);
    const hex = `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;

    return { hex, alpha: rgb.opacity };
};

const hexAlphaToRgba = (hex: string, alpha: number): string => {
    const colorObj = d3Color(hex);
    if (!colorObj) return `rgba(0, 0, 0, ${alpha})`;
    const rgb = colorObj.rgb();
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

/**
 * Generate default diverging threshold configuration based on layer's data range
 */
const getDefaultDivergingConfig = (layerRange: { min: number; max: number }): DivergingThresholdConfig => {
    const { min, max } = layerRange;
    const absMax = Math.max(Math.abs(min), Math.abs(max));

    // Use 80% of the range for thresholds
    const threshold = absMax * 0.8;

    return {
        centerValue: 0,
        centerColor: 'rgba(255, 255, 255, 1)',
        upperThreshold: threshold,
        upperColor: 'rgba(255, 165, 0, 1)', // Orange
        upperOverflowColor: 'rgba(255, 0, 0, 1)', // Red
        lowerThreshold: -threshold,
        lowerColor: 'rgba(0, 0, 139, 1)', // Dark blue
        lowerOverflowColor: 'rgba(0, 0, 0, 1)' // Black
    };
};

const CustomColormapEditor: React.FC<{
    stops: ColorStop[];
    onStopsChange: (stops: ColorStop[]) => void;
    units?: 'days' | string;
    layerRange: { min: number; max: number };
}> = ({ stops, onStopsChange, units, layerRange }) => {
    const [newValue, setNewValue] = useState<string>("0");
    const [newHex, setNewHex] = useState('#ffffff');
    const [newAlpha, setNewAlpha] = useState(1.0);

    const handleAddStop = () => {
        const numericValue = parseFloat(newValue);
        if (isNaN(numericValue)) return;

        const newStops = [...stops, { value: numericValue, color: hexAlphaToRgba(newHex, newAlpha) }];
        newStops.sort((a, b) => a.value - b.value);
        onStopsChange(newStops);
    };

    const handleUpdateStop = (index: number, updatedProp: Partial<ColorStop & { alpha: number }>) => {
        const newStops = [...stops];
        const currentStop = newStops[index];

        if ('value' in updatedProp) {
            const numericValue = typeof updatedProp.value === 'string' ? parseFloat(updatedProp.value) : updatedProp.value;
            if (isNaN(numericValue as number)) return;
            newStops[index] = { ...currentStop, value: numericValue as number };
            newStops.sort((a, b) => a.value - b.value);
        } else {
            const { hex, alpha } = rgbaToHexAlpha(currentStop.color);
            const nextHex = 'color' in updatedProp ? updatedProp.color! : hex;
            const nextAlpha = 'alpha' in updatedProp ? updatedProp.alpha! : alpha;
            newStops[index] = { ...currentStop, color: hexAlphaToRgba(nextHex, nextAlpha) };
        }
        onStopsChange(newStops);
    };


    const handleRemoveStop = (index: number) => {
        onStopsChange(stops.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3 p-3 bg-gray-900/30 rounded-md">
            <h4 className="text-xs font-medium text-gray-300">Colormap Stops</h4>
            <div className="space-y-2">
                {stops.map((stop, index) => {
                    const { hex, alpha } = rgbaToHexAlpha(stop.color);
                    const isFirstStop = index === 0;

                    const displayValue = isFirstStop
                        ? (units === 'days' ? (layerRange.min / 24).toFixed(1) : layerRange.min.toFixed(0))
                        : (units === 'days' ? stop.value.toFixed(1) : stop.value.toFixed(0));

                    return (
                        <div key={index} className="grid grid-cols-[20px_1fr_auto_auto_auto] items-center gap-2 text-sm">
                            <span className="text-right pr-1 font-mono text-gray-400">
                                {!isFirstStop && '>='}
                            </span>
                            <input
                                type="text" // Use text to display formatted value
                                defaultValue={displayValue}
                                key={displayValue + stop.color} // Force re-render on sort
                                readOnly={isFirstStop}
                                onBlur={isFirstStop ? undefined : (e) => {
                                    let val = parseFloat(e.target.value);
                                    if (isNaN(val)) return;
                                    handleUpdateStop(index, { value: val });
                                }}
                                className="w-full bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600 disabled:bg-gray-800 disabled:text-gray-500"
                                disabled={isFirstStop}
                                title={`Value${units === 'days' ? ' (days)' : ''}`}
                            />
                            <input
                                type="color"
                                value={hex}
                                onChange={(e) => handleUpdateStop(index, { color: e.target.value })}
                                className="w-8 h-8 p-0 border-none rounded-md bg-transparent"
                            />
                            <input
                                type="number"
                                min="0" max="1" step="0.01"
                                defaultValue={alpha.toFixed(2)}
                                onBlur={(e) => {
                                    let newAlpha = parseFloat(e.target.value);
                                    if (isNaN(newAlpha)) newAlpha = 1.0;
                                    if (newAlpha < 0) newAlpha = 0; if (newAlpha > 1) newAlpha = 1;
                                    handleUpdateStop(index, { alpha: newAlpha });
                                }}
                                className="w-16 bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600"
                                placeholder="Opacity"
                            />
                            <button disabled={isFirstStop} onClick={() => handleRemoveStop(index)} className="text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed ml-auto">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                    );
                })}
            </div>
            <div className="border-t border-gray-600 pt-3 grid grid-cols-[20px_1fr_auto_auto_auto] items-center gap-2">
                <span />
                <input
                    type="number"
                    step={units === 'days' ? 0.1 : 1}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600"
                    placeholder="Value"
                />
                <input
                    type="color"
                    value={newHex}
                    onChange={(e) => setNewHex(e.target.value)}
                    className="w-8 h-8 p-0 border-none rounded-md bg-transparent"
                />
                <input
                    type="number"
                    min="0" max="1" step="0.01"
                    value={newAlpha}
                    onChange={(e) => setNewAlpha(Number(e.target.value))}
                    className="w-16 bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600"
                    placeholder="Opacity"
                />
                <button onClick={handleAddStop} className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold py-1.5 px-2 rounded-md">Add</button>
            </div>
        </div>
    );
};

const FlickerIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const formatLayerType = (type: Layer['type']): string => {
    switch (type) {
        case 'basemap': return 'Basemap Layer';
        case 'data': return 'Data Layer';
        case 'analysis': return 'Analysis Layer';
        case 'dte_comms': return 'DTE Comms Layer';
        case 'lpf_comms': return 'LPF Comms Layer';
        case 'illumination': return 'Illumination Layer';
        case 'image': return 'Image Layer';
        default: return 'Layer';
    }
};

const LayerItem = React.memo<{ layer: Layer; isActive: boolean; onSelect: () => void; }>(({ layer, isActive, onSelect }) => {
    const {
        onUpdateLayer,
        onRemoveLayer,
        onMoveLayerUp,
        onMoveLayerDown,
        onCalculateNightfallLayer,
        onCalculateDaylightFractionLayer,
        layers,
        onRecalculateExpressionLayer,
        isLoading
    } = useLayerContext();

    const { flickeringLayerId, onToggleFlicker } = useUIStateContext();
    const { daylightFractionHoverData } = useSelectionContext();

    const [editingExpression, setEditingExpression] = useState(false);
    const [newExpression, setNewExpression] = useState('');

    const isNightfall = isNightfallLayer(layer);
    const isExpression = isExpressionLayer(layer);
    const useDaysUnitForCustom = isNightfall && layer.colormap === 'Custom';
    const layerHasColormap = hasColormap(layer);

    const availableExpressionVariables = useMemo(() => {
        return layers
            .filter(hasColormap)
            .filter(l => l.id !== layer.id) // Exclude self
            .map(l => sanitizeLayerNameForExpression(l.name));
    }, [layers, layer.id]);

    const handleStartEditExpression = () => {
        if (isAnalysisLayer(layer) && layer.params.expression) {
            setNewExpression(layer.params.expression);
            setEditingExpression(true);
        }
    };

    const handleSaveExpression = async () => {
        if (newExpression.trim() && onRecalculateExpressionLayer) {
            await onRecalculateExpressionLayer(layer.id, newExpression);
            setEditingExpression(false);
        }
    };

    return (
        <div className={`bg-gray-800/60 rounded-lg border ${isActive ? 'border-cyan-500/50' : 'border-gray-700/80'}`}>
            <div className="flex items-center p-2 gap-2">
                <button onClick={() => onUpdateLayer(layer.id, { visible: !layer.visible })} title={layer.visible ? 'Hide Layer' : 'Show Layer'} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" style={{ opacity: layer.visible ? 1 : 0.3 }} /></svg>
                </button>
                <button onClick={() => onToggleFlicker(layer.id)} title="Flicker Layer" className={`${layer.id === flickeringLayerId ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`}>
                    <FlickerIcon />
                </button>
                <div className="flex flex-col gap-0.5">
                    <button onClick={() => onMoveLayerUp(layer.id)} title="Move Layer Up" className="text-gray-400 hover:text-white p-0 h-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                    </button>
                    <button onClick={() => onMoveLayerDown(layer.id)} title="Move Layer Down" className="text-gray-400 hover:text-white p-0 h-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                </div>
                <div onClick={onSelect} className="flex-grow cursor-pointer truncate text-xs">
                    <p className="font-medium text-gray-200" title={layer.name}>{layer.name}</p>
                    <p className="text-xs text-gray-400">{formatLayerType(layer.type)}</p>
                    {isExpressionLayer(layer) && layer.params.expression && (
                        <p className="text-xs text-gray-500 font-mono truncate mt-1" title={layer.params.expression}>
                            Expr: {layer.params.expression}
                        </p>
                    )}
                </div>
                <button onClick={onSelect} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isActive ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                <button onClick={() => onRemoveLayer(layer.id)} title="Remove Layer" className="text-gray-500 hover:text-red-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
            </div>
            {isActive && (
                <div className="p-3 border-t border-gray-700 space-y-4 animate-fade-in">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Layer Name</label>
                        <input
                            type="text"
                            value={layer.name}
                            onChange={(e) => onUpdateLayer(layer.id, { name: e.target.value })}
                            className="w-full bg-gray-700 text-white text-sm rounded-md p-1.5 border border-gray-600 focus:border-cyan-500 focus:outline-none"
                            placeholder="Enter layer name..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400">Opacity: {Math.round(layer.opacity * 100)}%</label>
                        <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => onUpdateLayer(layer.id, { opacity: Number(e.target.value) })} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                    </div>
                    {isIlluminationLayer(layer) && (layer.geospatial || layer.metadata || layer.temporalInfo) && (
                        <div className="space-y-3 border-t border-gray-700 pt-3">
                            <h4 className="text-xs font-medium text-gray-300">NetCDF Metadata</h4>
                            {/* Grid Dimensions */}
                            <div className="space-y-1 bg-gray-900/30 p-2 rounded-md">
                                <p className="text-xs font-medium text-gray-400 mb-1">Grid Dimensions</p>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Width:</span>
                                        <span className="font-mono text-cyan-300">{layer.dimensions.width} px</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Height:</span>
                                        <span className="font-mono text-cyan-300">{layer.dimensions.height} px</span>
                                    </div>
                                    <div className="flex justify-between col-span-2">
                                        <span className="text-gray-400">Time Steps:</span>
                                        <span className="font-mono text-cyan-300">{layer.dimensions.time}</span>
                                    </div>
                                </div>
                            </div>
                            {/* Geographic Corner Coordinates */}
                            {layer.geospatial?.corners && (
                                <div className="space-y-1 bg-gray-900/30 p-2 rounded-md">
                                    <p className="text-xs font-medium text-gray-400 mb-1">Geographic Corners</p>
                                    <div className="text-xs text-gray-500 mb-2 italic">
                                        Note: For polar projections, edges are curved in lat/lon space
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="space-y-0.5">
                                            <div className="text-gray-400 font-medium">Top-Left:</div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lat: {layer.geospatial.corners.topLeft.lat.toFixed(5)}°
                                            </div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lon: {layer.geospatial.corners.topLeft.lon.toFixed(5)}°
                                            </div>
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-400 font-medium">Top-Right:</div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lat: {layer.geospatial.corners.topRight.lat.toFixed(5)}°
                                            </div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lon: {layer.geospatial.corners.topRight.lon.toFixed(5)}°
                                            </div>
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-400 font-medium">Bottom-Left:</div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lat: {layer.geospatial.corners.bottomLeft.lat.toFixed(5)}°
                                            </div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lon: {layer.geospatial.corners.bottomLeft.lon.toFixed(5)}°
                                            </div>
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="text-gray-400 font-medium">Bottom-Right:</div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lat: {layer.geospatial.corners.bottomRight.lat.toFixed(5)}°
                                            </div>
                                            <div className="font-mono text-cyan-300 pl-2">
                                                Lon: {layer.geospatial.corners.bottomRight.lon.toFixed(5)}°
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* Projected Bounds */}
                            {layer.geospatial && (
                                <div className="space-y-1 bg-gray-900/30 p-2 rounded-md">
                                    <p className="text-xs font-medium text-gray-400 mb-1">Projected Bounds (Meters)</p>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">X Range:</span>
                                            <span className="font-mono text-cyan-300">
                                                {(layer.geospatial.projectedBounds.xMin / 1000).toFixed(1)} to {(layer.geospatial.projectedBounds.xMax / 1000).toFixed(1)} km
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Y Range:</span>
                                            <span className="font-mono text-cyan-300">
                                                {(layer.geospatial.projectedBounds.yMin / 1000).toFixed(1)} to {(layer.geospatial.projectedBounds.yMax / 1000).toFixed(1)} km
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* Temporal Info */}
                            {layer.temporalInfo && (
                                <div className="space-y-1 bg-gray-900/30 p-2 rounded-md">
                                    <p className="text-xs font-medium text-gray-400 mb-1">Temporal Coverage</p>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Start:</span>
                                            <span className="font-mono text-cyan-300">
                                                {layer.temporalInfo.startDate.toISOString().slice(0, 19).replace('T', ' ')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">End:</span>
                                            <span className="font-mono text-cyan-300">
                                                {layer.temporalInfo.endDate.toISOString().slice(0, 19).replace('T', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* CRS Info */}
                            {layer.metadata?.crs && (
                                <div className="space-y-1 bg-gray-900/30 p-2 rounded-md">
                                    <p className="text-xs font-medium text-gray-400 mb-1">Coordinate System</p>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Projection:</span>
                                            <span className="font-mono text-cyan-300">{layer.metadata.crs.projection}</span>
                                        </div>
                                        {layer.metadata.crs.semiMajorAxis && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Radius:</span>
                                                <span className="font-mono text-cyan-300">{(layer.metadata.crs.semiMajorAxis / 1000).toFixed(1)} km</span>
                                            </div>
                                        )}
                                        {layer.metadata.crs.spatialRef && (
                                            <details className="mt-1">
                                                <summary className="text-gray-400 cursor-pointer hover:text-gray-300">Proj4 String</summary>
                                                <pre className="mt-1 text-xs font-mono text-gray-300 bg-gray-800 p-1 rounded overflow-x-auto whitespace-pre-wrap break-all">
                                                    {layer.metadata.crs.spatialRef}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* General Metadata */}
                            {layer.metadata && (layer.metadata.title || layer.metadata.institution || layer.metadata.source) && (
                                <div className="space-y-1 bg-gray-900/30 p-2 rounded-md">
                                    <p className="text-xs font-medium text-gray-400 mb-1">General Information</p>
                                    <div className="space-y-1 text-xs">
                                        {layer.metadata.title && (
                                            <div>
                                                <span className="text-gray-400">Title: </span>
                                                <span className="text-cyan-300">{layer.metadata.title}</span>
                                            </div>
                                        )}
                                        {layer.metadata.institution && (
                                            <div>
                                                <span className="text-gray-400">Institution: </span>
                                                <span className="text-cyan-300">{layer.metadata.institution}</span>
                                            </div>
                                        )}
                                        {layer.metadata.source && (
                                            <div>
                                                <span className="text-gray-400">Source: </span>
                                                <span className="text-cyan-300">{layer.metadata.source}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {isIlluminationLayer(layer) && (
                        <div className="space-y-3 border-t border-gray-700 pt-3">
                            <h4 className="text-xs font-medium text-gray-300">Debug: Axis Orientation</h4>
                            <div className="space-y-2 bg-yellow-900/20 p-2 rounded-md border border-yellow-600/30">
                                <p className="text-xs text-yellow-300 mb-2">Toggle to test axis flipping if data appears inverted</p>
                                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!layer.debugFlipX}
                                        onChange={(e) => onUpdateLayer(layer.id, { debugFlipX: e.target.checked })}
                                        className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
                                    />
                                    Flip X Axis (Left ⟷ Right)
                                </label>
                                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!layer.debugFlipY}
                                        onChange={(e) => onUpdateLayer(layer.id, { debugFlipY: e.target.checked })}
                                        className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
                                    />
                                    Flip Y Axis (Top ⟷ Bottom)
                                </label>
                            </div>
                        </div>
                    )}
                    {isIlluminationLayer(layer) && (
                        <div className="border-t border-gray-700 pt-3 space-y-3">
                            <h4 className="text-xs font-medium text-gray-300">Analysis</h4>
                            <div className="space-y-2">
                                <label className="block text-xs text-gray-400">
                                    Illumination Threshold: {layer.illuminationThreshold !== undefined ? layer.illuminationThreshold : 0}
                                    <span className="ml-1 text-gray-500">(values &gt; threshold count as daylight)</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max={Math.max(1, layer.range.max)}
                                    step={layer.range.max > 10 ? 1 : 0.01}
                                    value={layer.illuminationThreshold !== undefined ? layer.illuminationThreshold : 0}
                                    onChange={(e) => onUpdateLayer(layer.id, { illuminationThreshold: Number(e.target.value) })}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                />
                            </div>
                            <button
                                onClick={() => onCalculateDaylightFractionLayer(layer.id, layer.illuminationThreshold)}
                                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-3 rounded-md text-xs transition-all"
                            >
                                Calculate Daylight Fraction
                            </button>
                        </div>
                    )}
                    {isImageLayer(layer) && (
                        <div className="space-y-3 border-t border-gray-700 pt-3">
                            <h4 className="text-xs font-medium text-gray-300">Transformation</h4>
                            <div className="space-y-2">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                        Scale X: {layer.scaleX.toFixed(2)}x
                                    </label>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="5"
                                        step="0.01"
                                        value={layer.scaleX}
                                        onChange={(e) => onUpdateLayer(layer.id, { scaleX: Number(e.target.value) })}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                        Scale Y: {layer.scaleY.toFixed(2)}x
                                    </label>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="5"
                                        step="0.01"
                                        value={layer.scaleY}
                                        onChange={(e) => onUpdateLayer(layer.id, { scaleY: Number(e.target.value) })}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                        Rotation: {layer.rotation.toFixed(0)}°
                                    </label>
                                    <input
                                        type="range"
                                        min="-180"
                                        max="180"
                                        step="1"
                                        value={layer.rotation}
                                        onChange={(e) => onUpdateLayer(layer.id, { rotation: Number(e.target.value) })}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Position X</label>
                                        <input
                                            type="number"
                                            step="100"
                                            value={layer.position[0].toFixed(0)}
                                            onChange={(e) => {
                                                const newPos: [number, number] = [Number(e.target.value), layer.position[1]];
                                                onUpdateLayer(layer.id, { position: newPos });
                                            }}
                                            className="w-full bg-gray-700 text-white text-sm rounded-md px-2 py-1.5 border border-gray-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Position Y</label>
                                        <input
                                            type="number"
                                            step="100"
                                            value={layer.position[1].toFixed(0)}
                                            onChange={(e) => {
                                                const newPos: [number, number] = [layer.position[0], Number(e.target.value)];
                                                onUpdateLayer(layer.id, { position: newPos });
                                            }}
                                            className="w-full bg-gray-700 text-white text-sm rounded-md px-2 py-1.5 border border-gray-600"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        onUpdateLayer(layer.id, {
                                            scaleX: 1.0,
                                            scaleY: 1.0,
                                            rotation: 0
                                        });
                                    }}
                                    className="w-full bg-gray-600 hover:bg-gray-500 text-white font-medium py-1.5 px-3 rounded-md text-xs transition-all"
                                >
                                    Reset Transformation
                                </button>
                                <button
                                    onClick={() => {
                                        // Export transformed image
                                        const canvas = document.createElement('canvas');
                                        const displayWidth = layer.originalWidth * layer.scaleX;
                                        const displayHeight = layer.originalHeight * layer.scaleY;

                                        // Use larger canvas for better quality
                                        canvas.width = displayWidth;
                                        canvas.height = displayHeight;

                                        const ctx = canvas.getContext('2d')!;
                                        ctx.translate(canvas.width / 2, canvas.height / 2);
                                        ctx.rotate((layer.rotation * Math.PI) / 180);
                                        ctx.scale(layer.scaleX, layer.scaleY);
                                        ctx.drawImage(
                                            layer.image,
                                            -layer.originalWidth / 2,
                                            -layer.originalHeight / 2,
                                            layer.originalWidth,
                                            layer.originalHeight
                                        );

                                        canvas.toBlob((blob) => {
                                            if (blob) {
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `transformed_${layer.fileName}`;
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                                URL.revokeObjectURL(url);
                                            }
                                        }, 'image/png');
                                    }}
                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-3 rounded-md text-xs transition-all"
                                >
                                    Export Transformed Image
                                </button>
                            </div>
                        </div>
                    )}
                    {layerHasColormap && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Colormap</label>
                                <div className="flex items-center gap-2">
                                    <select value={layer.colormap} onChange={(e) => onUpdateLayer(layer.id, { colormap: e.target.value as ColorMapName })} className="flex-grow bg-gray-700 border border-gray-600 text-white text-xs rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2.5">
                                        {COLOR_MAPS.map(name => (<option key={name} value={name}>{name}</option>))}
                                    </select>
                                    <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer whitespace-nowrap">
                                        <input
                                            type="checkbox"
                                            checked={!!layer.colormapInverted}
                                            onChange={(e) => onUpdateLayer(layer.id, { colormapInverted: e.target.checked })}
                                            className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
                                        />
                                        Invert
                                    </label>
                                </div>
                            </div>
                            {layer.colormap === 'DivergingThreshold' && (
                                <DivergingThresholdEditor
                                    config={layer.divergingThresholdConfig || getDefaultDivergingConfig(layer.range)}
                                    onChange={(config) => onUpdateLayer(layer.id, { divergingThresholdConfig: config })}
                                    layerRange={layer.range}
                                />
                            )}
                            {layer.colormap === 'Custom' && (
                                <CustomColormapEditor
                                    layerRange={layer.range}
                                    stops={
                                        (layer.customColormap || []).map(s => ({
                                            ...s,
                                            value: useDaysUnitForCustom ? s.value / 24 : s.value
                                        }))
                                    }
                                    onStopsChange={(stops) => {
                                        const stopsInHours = stops.map(s => ({
                                            ...s,
                                            value: useDaysUnitForCustom ? s.value * 24 : s.value
                                        }));
                                        onUpdateLayer(layer.id, { customColormap: stopsInHours });
                                    }}
                                    units={useDaysUnitForCustom ? 'days' : undefined}
                                />
                            )}
                            {layer.colormap !== 'Custom' && (
                                <div className="space-y-2 p-3 bg-gray-900/30 rounded-md">
                                    <h4 className="text-xs font-medium text-gray-300">Transparency Thresholds</h4>
                                    <div className="space-y-2">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Lower ≤</label>
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={layer.transparencyLowerThreshold ?? ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                        onUpdateLayer(layer.id, { transparencyLowerThreshold: val });
                                                    }}
                                                    placeholder="None"
                                                    className="flex-1 bg-gray-700 text-white text-sm rounded-md px-2 py-1.5 border border-gray-600"
                                                />
                                                {layer.transparencyLowerThreshold !== undefined && (
                                                    <button
                                                        onClick={() => onUpdateLayer(layer.id, { transparencyLowerThreshold: undefined })}
                                                        className="text-gray-400 hover:text-red-400 flex-shrink-0"
                                                        title="Clear"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Upper ≥</label>
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={layer.transparencyUpperThreshold ?? ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                        onUpdateLayer(layer.id, { transparencyUpperThreshold: val });
                                                    }}
                                                    placeholder="None"
                                                    className="flex-1 bg-gray-700 text-white text-sm rounded-md px-2 py-1.5 border border-gray-600"
                                                />
                                                {layer.transparencyUpperThreshold !== undefined && (
                                                    <button
                                                        onClick={() => onUpdateLayer(layer.id, { transparencyUpperThreshold: undefined })}
                                                        className="text-gray-400 hover:text-red-400 flex-shrink-0"
                                                        title="Clear"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 italic">Values at or beyond thresholds become transparent</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col items-center">
                                <Colorbar
                                    colorMap={layer.colormap}
                                    customColormap={layer.customColormap}
                                    dataRange={
                                        isNightfall
                                            ? { min: -(layer.params.clipValue ?? 0), max: layer.params.clipValue ?? 0 }
                                            : layer.range
                                    }
                                    units={
                                        isAnalysisLayer(layer)
                                            ? (isNightfallLayer(layer)
                                                ? 'days'
                                                : '%')
                                            : undefined
                                    }
                                    inverted={layer.colormapInverted}
                                    isThreshold={layer.colormap === 'Custom'}
                                    divergingThresholdConfig={layer.divergingThresholdConfig}
                                />
                            </div>
                        </>
                    )}
                    {isDaylightFractionLayer(layer) && daylightFractionHoverData && (
                        <div className="mt-3 p-3 bg-gray-900/40 rounded-md text-sm space-y-2 animate-fade-in">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Hover Details</h4>
                            <div className="flex justify-between">
                                <span className="text-gray-300">Daylight Fraction:</span>
                                <span className="font-mono text-cyan-300">{daylightFractionHoverData.fraction.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-300">Total Daylight:</span>
                                <span className="font-mono text-cyan-300">{formatDuration(daylightFractionHoverData.dayHours)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-300">Total Night:</span>
                                <span className="font-mono text-cyan-300">{formatDuration(daylightFractionHoverData.nightHours)}</span>
                            </div>

                            <div className="border-t border-gray-700/50 pt-2 mt-2 space-y-1">
                                <p className="text-xs text-gray-400">Day Periods</p>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Count:</span><span className="font-mono text-cyan-400">{daylightFractionHoverData.dayPeriods}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Longest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.longestDayPeriod)}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Shortest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.shortestDayPeriod)}</span></div>
                            </div>
                            <div className="border-t border-gray-700/50 pt-2 mt-2 space-y-1">
                                <p className="text-xs text-gray-400">Night Periods</p>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Count:</span><span className="font-mono text-cyan-400">{daylightFractionHoverData.nightPeriods}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Longest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.longestNightPeriod)}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Shortest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.shortestNightPeriod)}</span></div>
                            </div>
                        </div>
                    )}
                    {isDataLayer(layer) && (
                        <div className="border-t border-gray-700 pt-3 space-y-2">
                            <button onClick={() => onCalculateNightfallLayer(layer.id)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-md text-xs transition-all">
                                Calculate Nightfall Forecast
                            </button>
                            <button onClick={() => onCalculateDaylightFractionLayer(layer.id)} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-3 rounded-md text-xs transition-all">
                                Calculate Daylight Fraction
                            </button>
                        </div>
                    )}
                    {isNightfall && (
                        <div className="border-t border-gray-700 pt-3 space-y-3">
                            <h4 className="text-xs font-medium text-gray-300">Colormap Clipping</h4>
                            <div>
                                <label className="block text-xs text-gray-400">
                                    Clip colormap at: {
                                        `${((layer.params.clipValue ?? 0) / 24).toFixed(1)} days`
                                    }
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1000"
                                    step="1"
                                    value={layer.params.clipValue}
                                    onChange={(e) => onUpdateLayer(layer.id, { params: { ...layer.params, clipValue: Number(e.target.value) } })}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 mt-1"
                                />
                            </div>
                        </div>
                    )}
                    {isExpression && (
                        <div className="border-t border-gray-700 pt-3 space-y-3">
                            <h4 className="text-xs font-medium text-gray-300">Expression</h4>
                            {!editingExpression ? (
                                <>
                                    <div className="bg-gray-900/40 p-2 rounded-md">
                                        <p className="text-xs font-mono text-gray-300 break-words">
                                            {layer.params.expression || 'No expression defined'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleStartEditExpression}
                                        disabled={!!isLoading}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 rounded-md text-xs transition-all"
                                    >
                                        Edit Expression
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">New Expression</label>
                                        <textarea
                                            value={newExpression}
                                            onChange={(e) => setNewExpression(e.target.value)}
                                            rows={3}
                                            className="w-full bg-gray-700 text-white text-xs rounded-md p-1.5 border border-gray-600 font-mono"
                                            placeholder="Enter expression..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Available Variables</label>
                                        <div className="bg-gray-800 p-2 rounded-md text-xs font-mono text-gray-400 flex flex-wrap gap-x-2 gap-y-1">
                                            {availableExpressionVariables.length > 0 ? availableExpressionVariables.map(v => <span key={v}>{v}</span>) : <span className="text-gray-500">No variables available</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditingExpression(false)}
                                            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-1.5 px-3 rounded-md text-xs"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveExpression}
                                            disabled={!newExpression.trim() || !!isLoading}
                                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-1.5 px-3 rounded-md text-xs"
                                        >
                                            {isLoading && isLoading.toLowerCase().includes('expression') ? 'Calculating...' : 'Apply'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

const AddLayerMenu: React.FC = () => {
    const { onAddDataLayer, onAddDteCommsLayer, onAddLpfCommsLayer, onAddIlluminationLayer, onAddBaseMapLayer, onAddImageLayer, isLoading } = useLayerContext();
    const [isOpen, setIsOpen] = useState(false);
    const npyInputRef = useRef<HTMLInputElement>(null);
    const dteInputRef = useRef<HTMLInputElement>(null);
    const lpfInputRef = useRef<HTMLInputElement>(null);
    const netcdfInputRef = useRef<HTMLInputElement>(null);
    const pngInputRef = useRef<HTMLInputElement>(null);
    const vrtInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [pendingPng, setPendingPng] = useState<File | null>(null);
    const [pendingVrt, setPendingVrt] = useState<File | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleNpySelect = (e: React.ChangeEvent<HTMLInputElement>, handler: (f: File) => void) => {
        if (e.target.files?.[0]) {
            handler(e.target.files[0]);
        }
        setIsOpen(false);
    };
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            await onAddImageLayer(e.target.files[0]);
        }
        setIsOpen(false);
    };
    const handlePngSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setPendingPng(e.target.files[0]);
        }
    };
    const handleVrtSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setPendingVrt(e.target.files[0]);
        }
    };

    const handleAddBaseMap = async () => {
        if (pendingPng && pendingVrt) {
            await onAddBaseMapLayer(pendingPng, pendingVrt);
            setPendingPng(null);
            setPendingVrt(null);
            if (pngInputRef.current) pngInputRef.current.value = '';
            if (vrtInputRef.current) vrtInputRef.current.value = '';
        }
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} disabled={!!isLoading} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md text-xs transition-all flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                Add Layer
            </button>
            {isOpen && (
                <div className="absolute top-full mt-2 w-full bg-gray-800 rounded-md shadow-xl z-10 border border-gray-700 p-2 space-y-2">
                    <input ref={npyInputRef} type="file" accept=".npy" className="hidden" onChange={(e) => handleNpySelect(e, onAddDataLayer)} />
                    <button onClick={() => npyInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all text-left">Data Layer (.npy)</button>
                    <input ref={dteInputRef} type="file" accept=".npy" className="hidden" onChange={(e) => handleNpySelect(e, onAddDteCommsLayer)} />
                    <button onClick={() => dteInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all text-left">DTE Comms Layer (.npy)</button>
                    <input ref={lpfInputRef} type="file" accept=".npy" className="hidden" onChange={(e) => handleNpySelect(e, onAddLpfCommsLayer)} />
                    <button onClick={() => lpfInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all text-left">LPF Comms Layer (.npy)</button>
                    <input ref={netcdfInputRef} type="file" accept=".nc,.nc4" className="hidden" onChange={(e) => handleNpySelect(e, onAddIlluminationLayer)} />
                    <button onClick={() => netcdfInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all text-left">Illumination Layer (.nc)</button>
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                    <button onClick={() => imageInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all text-left">Image Layer</button>
                    <div className="border-t border-gray-700 pt-2">
                        <label className="block text-xs text-gray-400 mb-1">Base Map (PNG + VRT)</label>
                        <input ref={pngInputRef} type="file" accept=".png" className="hidden" onChange={handlePngSelect} />
                        <button onClick={() => pngInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all text-left mb-1">
                            {pendingPng ? `✓ ${pendingPng.name}` : 'Select PNG...'}
                        </button>
                        <input ref={vrtInputRef} type="file" accept=".vrt" className="hidden" onChange={handleVrtSelect} />
                        <button onClick={() => vrtInputRef.current?.click()} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all text-left mb-1">
                            {pendingVrt ? `✓ ${pendingVrt.name}` : 'Select VRT...'}
                        </button>
                        <button onClick={handleAddBaseMap} disabled={!pendingPng || !pendingVrt} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-xs transition-all">Add Base Map</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const ExpressionEditor: React.FC = () => {
    const { layers, onCreateExpressionLayer, isLoading } = useLayerContext();
    const { setIsCreatingExpression } = useUIStateContext();
    const [name, setName] = useState('Expression Layer');
    const [expression, setExpression] = useState('');

    const availableVariables = useMemo(() => {
        return layers
            .filter(l => l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms')
            .map(l => sanitizeLayerNameForExpression(l.name));
    }, [layers]);

    const handleSubmit = async () => {
        if (name.trim() && expression.trim()) {
            await onCreateExpressionLayer(name, expression);
        }
    };

    // Show progress overlay when computing
    const isComputing = !!isLoading && isLoading.toLowerCase().includes('expression');

    return (
        <div className="p-3 bg-gray-900/50 border border-cyan-700 rounded-md text-xs text-cyan-200 space-y-4">
            <h3 className="text-sm font-medium text-cyan-300">Create Expression Layer</h3>

            {isComputing && (
                <div className="p-4 bg-cyan-900/50 border border-cyan-500 rounded-md text-center space-y-3 animate-pulse">
                    <div className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-cyan-300 font-semibold">{isLoading}</span>
                    </div>
                    <p className="text-xs text-cyan-400">Please wait, this may take a while for large datasets...</p>
                </div>
            )}

            {availableVariables.length === 0 && !isComputing && (
                <div className="p-2 bg-red-900/30 border border-red-600/50 rounded-md text-xs text-red-200">
                    No data layers available. Please load data layers before creating expressions.
                </div>
            )}
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Layer Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isComputing}
                    className="w-full bg-gray-700 text-white text-sm rounded-md p-1.5 border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Expression</label>
                <textarea
                    value={expression}
                    onChange={(e) => setExpression(e.target.value)}
                    rows={4}
                    disabled={isComputing}
                    className="w-full bg-gray-700 text-white text-sm rounded-md p-1.5 border border-gray-600 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="(Nightfall_Forecast > 0) AND (DTE_Comms == 1)"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Available Variables</label>
                <div className="bg-gray-800 p-2 rounded-md text-xs font-mono text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                    {availableVariables.length > 0 ? availableVariables.map(v => <span key={v}>{v}</span>) : <span className="text-gray-500">No data layers available.</span>}
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button
                    onClick={() => setIsCreatingExpression(false)}
                    disabled={isComputing}
                    className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold py-1.5 px-3 rounded-md text-xs"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!name.trim() || !expression.trim() || isComputing}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-1.5 px-3 rounded-md text-xs"
                >
                    {isComputing ? 'Computing...' : 'Create'}
                </button>
            </div>
        </div>
    );
};

export const LayersPanel: React.FC = () => {
    const {
        layers,
        activeLayerId,
        setActiveLayerId,
        isLoading,
    } = useLayerContext();

    const {
        isCreatingExpression,
        setIsCreatingExpression,
    } = useUIStateContext();

    // Helper to check if there are layers with datasets
    const hasDataLayers = useMemo(() => {
        return layers.some((l: Layer) => l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms');
    }, [layers]);

    if (isCreatingExpression) {
        return <ExpressionEditor />;
    }

    return (
        <div className="space-y-4">
            <h2 className="text-base font-semibold text-cyan-300">Layer Management</h2>
            <AddLayerMenu />
            {!hasDataLayers && (
                <div className="p-2 bg-yellow-900/30 border border-yellow-600/50 rounded-md text-xs text-yellow-200">
                    Load a data layer before creating expression layers
                </div>
            )}
            <button
                onClick={() => setIsCreatingExpression(true)}
                disabled={!!isLoading || !hasDataLayers}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md text-xs transition-all flex items-center justify-center gap-2"
                title={!hasDataLayers ? "Load a data layer first" : "Create a layer from an expression"}
            >
                Add Expression Layer
            </button>
            {isLoading && <div className="text-xs text-cyan-300 text-center p-2 bg-gray-900/50 rounded-md">{isLoading}</div>}
            <div className="space-y-2">
                {layers.length > 0 ? (
                    [...layers].reverse().map((layer: Layer) => (
                        <LayerItem
                            key={layer.id}
                            layer={layer}
                            isActive={layer.id === activeLayerId}
                            onSelect={() => setActiveLayerId(layer.id === activeLayerId ? null : layer.id)}
                        />
                    ))
                ) : (
                    <p className="text-xs text-gray-500 text-center p-4">No layers loaded.</p>
                )}
            </div>
        </div>
    );
};
