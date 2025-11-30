import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import proj4 from 'proj4';
import type { Layer, DataLayer, BaseMapLayer, AnalysisLayer, ImageLayer, DteCommsLayer, LpfCommsLayer, IlluminationLayer, DataSet, ColorStop } from '../types';
import { useToast } from '../components/Toast';
import { useTimeContext } from './TimeContext';
import { useViewportContext } from './ViewportContext';
import { generateSecureId } from '../utils/crypto';
import { parseNpy } from '../services/npyParser';
import { parseNpyHeader } from '../services/streamingNpyParser';
import { parseVrt } from '../services/vrtParser';
import { parseNetCdf4, parseTimeValues } from '../services/netcdf4Parser';
import { LazyDataset } from '../services/LazyDataset';
import { indexToDate } from '../utils/time';
import * as analysisService from '../services/analysisService';
import { IMAGE_LOAD_TIMEOUT_MS } from '../config/defaults';

// --- Layer State Context ---

interface LayerStateContextType {
    // State
    layers: Layer[];
    activeLayerId: string | null;
    isLoading: string | null;

    // Derived state
    baseMapLayer: BaseMapLayer | undefined;
    primaryDataLayer: DataLayer | undefined;
    activeLayer: Layer | undefined;

    // State Setters (Internal use or advanced use)
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
    setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
    setIsLoading: React.Dispatch<React.SetStateAction<string | null>>;
}

const LayerStateContext = createContext<LayerStateContextType | null>(null);

export const useLayerState = () => {
    const context = useContext(LayerStateContext);
    if (!context) {
        throw new Error('useLayerState must be used within a LayerStateProvider');
    }
    return context;
};

export const LayerStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [layers, setLayers] = useState<Layer[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<string | null>(null);

    // Derived state
    const baseMapLayer = useMemo(() => layers.find(l => l.type === 'basemap') as BaseMapLayer | undefined, [layers]);
    const primaryDataLayer = useMemo(() => layers.find(l =>
        l.type === 'data' || l.type === 'illumination' || l.type === 'dte_comms' || l.type === 'lpf_comms'
    ) as DataLayer | undefined, [layers]);
    const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId), [layers, activeLayerId]);

    const value = useMemo(() => ({
        layers,
        activeLayerId,
        isLoading,
        baseMapLayer,
        primaryDataLayer,
        activeLayer,
        setLayers,
        setActiveLayerId,
        setIsLoading
    }), [layers, activeLayerId, isLoading, baseMapLayer, primaryDataLayer, activeLayer]);

    return <LayerStateContext.Provider value={value}>{children}</LayerStateContext.Provider>;
};

// --- Layer Operations Context ---

interface LayerOperationsContextType {
    onAddDataLayer: (file: File) => void;
    onAddDteCommsLayer: (file: File) => void;
    onAddLpfCommsLayer: (file: File) => void;
    onAddIlluminationLayer: (file: File) => void;
    onAddBaseMapLayer: (pngFile: File, vrtFile: File) => void;
    onAddImageLayer: (file: File, initialPosition?: [number, number]) => Promise<void>;
    onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
    onRemoveLayer: (id: string) => void;
    onCalculateNightfallLayer: (sourceLayerId: string) => void;
    onCalculateDaylightFractionLayer: (sourceLayerId: string) => void;
    onCreateExpressionLayer: (name: string, expression: string) => Promise<void>;
    onRecalculateExpressionLayer: (layerId: string, newExpression: string) => Promise<void>;
    registerCanvasCacheCleaner: (cleaner: ((layerId: string) => void) | null) => void;
}

const LayerOperationsContext = createContext<LayerOperationsContextType | null>(null);

export const useLayerOperations = () => {
    const context = useContext(LayerOperationsContext);
    if (!context) {
        throw new Error('useLayerOperations must be used within a LayerOperationsProvider');
    }
    return context;
};

// Helper for image loading
const dataUrlToImage = (dataUrl: string, timeout: number = IMAGE_LOAD_TIMEOUT_MS): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const timeoutId = setTimeout(() => {
            reject(new Error('Image load timeout'));
        }, timeout);

        image.onload = () => {
            clearTimeout(timeoutId);
            resolve(image);
        };
        image.onerror = (e) => {
            clearTimeout(timeoutId);
            reject(e);
        };
        image.src = dataUrl;
    });
};

export const LayerOperationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { layers, setLayers, setActiveLayerId, setIsLoading, primaryDataLayer, activeLayerId } = useLayerState();
    const { setTimeRange, setCurrentDateIndex, setTimeZoomDomain, timeRange } = useTimeContext();
    const { viewState, setViewState } = useViewportContext();
    const { showError, showSuccess } = useToast();

    // Canvas cache cleaner
    const canvasCacheCleanerRef = useRef<((layerId: string) => void) | null>(null);
    const registerCanvasCacheCleaner = useCallback((cleaner: ((layerId: string) => void) | null) => {
        canvasCacheCleanerRef.current = cleaner;
    }, []);

    const handleAddNpyLayer = useCallback(async (file: File, layerType: 'data' | 'dte_comms' | 'lpf_comms') => {
        if (!file) return;
        setIsLoading(`Parsing header for "${file.name}"...`);
        try {
            // Use streaming parser for large files (>100 MB)
            const useStreaming = file.size > 100 * 1024 * 1024;

            if (useStreaming) {
                // STREAMING PATH
                const metadata = await parseNpyHeader(file);

                if (metadata.dimensions.time === 0 || metadata.dimensions.height === 0 || metadata.dimensions.width === 0) {
                    throw new Error(`Invalid dimensions: ${metadata.dimensions.time}×${metadata.dimensions.height}×${metadata.dimensions.width}`);
                }

                const { time, height, width } = metadata.dimensions;
                setIsLoading(`Creating lazy dataset (${(file.size / 1024 / 1024).toFixed(0)} MB file)...`);

                const lazyDataset = new LazyDataset(file, metadata, {
                    cacheSize: 20,
                    preloadAdjacent: true,
                    preloadDistance: 2
                });

                lazyDataset.setProgressCallback((progress) => {
                    setIsLoading(progress.message);
                });

                setIsLoading('Loading first slice to determine range...');
                const firstSlice = await lazyDataset.getSlice(0);
                let min = Infinity, max = -Infinity;
                for (const value of firstSlice) {
                    if (value < min) min = value;
                    if (value > max) max = value;
                }

                console.log(`📊 Lazy dataset created: ${time} time slices`);

                const newLayer: DataLayer | DteCommsLayer | LpfCommsLayer = {
                    id: generateSecureId(layerType),
                    name: file.name,
                    type: layerType,
                    visible: true,
                    opacity: 1.0,
                    fileName: file.name,
                    dataset: [],
                    lazyDataset: lazyDataset,
                    range: { min, max },
                    colormap: 'Viridis',
                    colormapInverted: false,
                    customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
                    dimensions: { time, height, width },
                };

                setLayers(prev => [...prev, newLayer]);
                setActiveLayerId(newLayer.id);

                if (layerType === 'data' && !primaryDataLayer) {
                    const initialTimeRange = { start: 0, end: time - 1 };
                    setTimeRange(initialTimeRange);
                    setCurrentDateIndex(0);
                    setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
                    if (!viewState) {
                        setViewState(null);
                    }
                }
            } else {
                // TRADITIONAL PATH
                setIsLoading(`Loading "${file.name}"...`);
                const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
                const arrayBuffer = await file.arrayBuffer();
                const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
                if (shape.length !== 3) throw new Error(`Expected a 3D array, but got ${shape.length} dimensions.`);

                const [height, width, time] = shape;
                let min = Infinity, max = -Infinity;
                for (const value of float32Array) { if (value < min) min = value; if (value > max) max = value; }

                const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));

                let flatIndex = 0;
                if (header.fortran_order) {
                    for (let t = 0; t < time; t++) { for (let x = 0; x < width; x++) { for (let y = 0; y < height; y++) { dataset[t][y][x] = float32Array[flatIndex++]; } } if (t % 100 === 0) await yieldToMain(); }
                } else {
                    for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) { for (let t = 0; t < time; t++) { dataset[t][y][x] = float32Array[flatIndex++]; } } if (y % 10 === 0) await yieldToMain(); }
                }

                const newLayer: DataLayer | DteCommsLayer | LpfCommsLayer = {
                    id: generateSecureId(layerType), name: file.name, type: layerType, visible: true, opacity: 1.0,
                    fileName: file.name, dataset, range: { min, max }, colormap: 'Viridis',
                    colormapInverted: false,
                    customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
                    dimensions: { time, height, width },
                };

                setLayers(prev => [...prev, newLayer]);
                setActiveLayerId(newLayer.id);

                if (layerType === 'data' && !primaryDataLayer) {
                    const initialTimeRange = { start: 0, end: time - 1 };
                    setTimeRange(initialTimeRange);
                    setCurrentDateIndex(0);
                    setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
                    if (!viewState) {
                        setViewState(null);
                    }
                }
            }
        } catch (error) {
            showError(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(null);
        }
    }, [primaryDataLayer, viewState, setLayers, setActiveLayerId, setIsLoading, setTimeRange, setCurrentDateIndex, setTimeZoomDomain, setViewState, showError]);

    const onAddDataLayer = useCallback((file: File) => handleAddNpyLayer(file, 'data'), [handleAddNpyLayer]);
    const onAddDteCommsLayer = useCallback((file: File) => handleAddNpyLayer(file, 'dte_comms'), [handleAddNpyLayer]);
    const onAddLpfCommsLayer = useCallback((file: File) => handleAddNpyLayer(file, 'lpf_comms'), [handleAddNpyLayer]);

    const handleAddNetCdf4Layer = useCallback(async (file: File) => {
        if (!file) return;
        setIsLoading(`Parsing NetCDF4 file "${file.name}"...`);

        // Disable other layers and clear cache
        setLayers(currentLayers => {
            currentLayers.forEach(l => {
                if (l.visible && 'lazyDataset' in l && l.lazyDataset) {
                    console.log(`Disabling layer ${l.name} and clearing cache to free memory`);
                    l.lazyDataset.clearCache();
                }
            });
            return currentLayers.map(l => ({ ...l, visible: false }));
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const arrayBuffer = await file.arrayBuffer();
            const { reader, shape, dimensions, metadata, coordinates } = await parseNetCdf4(arrayBuffer);
            const { time, height, width } = dimensions;

            // Calculate min/max
            let min = 0, max = 1;
            try {
                const firstSlice = await reader.getSlice(0);
                min = Infinity;
                max = -Infinity;
                const step = Math.ceil(firstSlice.length / 10000);
                for (let i = 0; i < firstSlice.length; i += step) {
                    const val = firstSlice[i];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
                if (!isFinite(min) || !isFinite(max) || min === max) {
                    min = 0; max = 1;
                }
            } catch (e) {
                console.warn('Failed to calculate min/max from first slice:', e);
            }

            // Parse temporal info
            let temporalInfo: IlluminationLayer['temporalInfo'] = undefined;
            if (metadata.timeValues && metadata.timeUnit) {
                try {
                    const dates = parseTimeValues(metadata.timeValues, metadata.timeUnit);
                    temporalInfo = {
                        dates,
                        startDate: dates[0],
                        endDate: dates[dates.length - 1]
                    };
                } catch (error) {
                    console.warn('Failed to parse temporal metadata:', error);
                }
            }

            // Calculate geospatial bounds
            let geospatial: IlluminationLayer['geospatial'] = undefined;
            if (coordinates && metadata.crs) {
                const { x: xCoords, y: yCoords } = coordinates;
                let projDef: string;
                if (metadata.crs.spatialRef) {
                    projDef = metadata.crs.spatialRef;
                } else {
                    projDef = '+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs';
                }

                try {
                    const unproject = proj4(projDef, 'EPSG:4326');
                    const xMin = xCoords[0];
                    const xMax = xCoords[xCoords.length - 1];
                    const yMin = yCoords[yCoords.length - 1];
                    const yMax = yCoords[0];

                    const tl = unproject.forward([xMin, yMax]);
                    const tr = unproject.forward([xMax, yMax]);
                    const bl = unproject.forward([xMin, yMin]);
                    const br = unproject.forward([xMax, yMin]);

                    const lons = [tl[0], tr[0], bl[0], br[0]];
                    const lats = [tl[1], tr[1], bl[1], br[1]];

                    geospatial = {
                        projectedBounds: { xMin, xMax, yMin, yMax },
                        geographicBounds: {
                            lonMin: Math.min(...lons),
                            lonMax: Math.max(...lons),
                            latMin: Math.min(...lats),
                            latMax: Math.max(...lats)
                        },
                        corners: {
                            topLeft: { lon: tl[0], lat: tl[1] },
                            topRight: { lon: tr[0], lat: tr[1] },
                            bottomLeft: { lon: bl[0], lat: bl[1] },
                            bottomRight: { lon: br[0], lat: br[1] }
                        }
                    };
                } catch (e) {
                    console.warn('Failed to calculate geospatial bounds:', e);
                }
            }

            const newLayer: IlluminationLayer = {
                id: generateSecureId('illumination'),
                name: file.name,
                type: 'illumination',
                visible: true,
                opacity: 1.0,
                fileName: file.name,
                dataset: [],
                lazyDataset: reader,
                range: { min, max },
                colormap: 'Grayscale',
                colormapInverted: false,
                customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
                dimensions: { time, height, width },
                metadata: {
                    title: metadata.title,
                    institution: metadata.institution,
                    source: metadata.source,
                    conventions: metadata.conventions,
                    variableName: metadata.variableName,
                    timeUnit: metadata.timeUnit,
                    timeValues: metadata.timeValues,
                    crs: metadata.crs,
                },
                temporalInfo,
                geospatial,
            };

            setLayers(prev => [...prev, newLayer]);
            setActiveLayerId(newLayer.id);

            if (!primaryDataLayer) {
                const initialTimeRange = { start: 0, end: time - 1 };
                setTimeRange(initialTimeRange);
                setCurrentDateIndex(0);

                if (temporalInfo) {
                    setTimeZoomDomain([temporalInfo.startDate, temporalInfo.endDate]);
                } else {
                    setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
                }

                if (!viewState && geospatial) {
                    const { xMin, xMax, yMin, yMax } = geospatial.projectedBounds;
                    const centerX = (xMin + xMax) / 2;
                    const centerY = (yMin + yMax) / 2;
                    const maxDim = Math.max(xMax - xMin, yMax - yMin);
                    const scale = 800 / maxDim;
                    setViewState({ center: [centerX, centerY], scale });
                } else if (!viewState) {
                    setViewState(null);
                }
            }
        } catch (error) {
            showError(`Error loading NetCDF4 file: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(null);
        }
    }, [primaryDataLayer, viewState, setLayers, setActiveLayerId, setIsLoading, setTimeRange, setCurrentDateIndex, setTimeZoomDomain, setViewState, showError]);

    const onAddIlluminationLayer = useCallback((file: File) => handleAddNetCdf4Layer(file), [handleAddNetCdf4Layer]);

    const onAddBaseMapLayer = useCallback(async (pngFile: File, vrtFile: File) => {
        setIsLoading(`Loading basemap "${pngFile.name}"...`);
        try {
            const vrtContent = await vrtFile.text();
            const vrtData = parseVrt(vrtContent);

            const objectUrl = URL.createObjectURL(pngFile);
            const image = await dataUrlToImage(objectUrl);
            URL.revokeObjectURL(objectUrl);

            const newLayer: BaseMapLayer = {
                id: generateSecureId('basemap'), name: pngFile.name, type: 'basemap',
                visible: true, opacity: 1.0, image, vrt: vrtData,
                pngFileName: pngFile.name, vrtFileName: vrtFile.name,
            };

            setLayers(prev => [newLayer, ...prev]);
            setActiveLayerId(newLayer.id);
            if (!viewState) {
                setViewState(null);
            }
        } catch (error) {
            showError(`Error processing base map: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(null);
        }
    }, [viewState, setLayers, setActiveLayerId, setViewState, setIsLoading, showError]);

    const onAddImageLayer = useCallback(async (file: File, initialPosition?: [number, number]) => {
        setIsLoading(`Loading image "${file.name}"...`);
        try {
            const objectUrl = URL.createObjectURL(file);
            const image = await dataUrlToImage(objectUrl);
            URL.revokeObjectURL(objectUrl);

            const position: [number, number] = initialPosition || (viewState ? viewState.center : [0, 0]);

            const newLayer: ImageLayer = {
                id: generateSecureId('image'),
                name: file.name,
                type: 'image',
                visible: true,
                opacity: 0.7,
                image,
                fileName: file.name,
                position,
                scaleX: 1.0,
                scaleY: 1.0,
                rotation: 0,
                originalWidth: image.width,
                originalHeight: image.height,
            };

            setLayers(prev => [...prev, newLayer]);
            setActiveLayerId(newLayer.id);
            showSuccess(`Image layer "${file.name}" added successfully`);
        } catch (error) {
            showError(`Error loading image: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(null);
        }
    }, [viewState, setLayers, setActiveLayerId, setIsLoading, showSuccess, showError]);

    const onUpdateLayer = useCallback((id: string, updates: Partial<Layer>) => {
        setLayers(prevLayers =>
            prevLayers.map(l => (l.id === id ? ({ ...l, ...updates } as Layer) : l))
        );
    }, [setLayers]);

    const onRemoveLayer = useCallback((id: string) => {
        const layerToRemove = layers.find(l => l.id === id);
        if (layerToRemove && 'lazyDataset' in layerToRemove && layerToRemove.lazyDataset) {
            console.log(`Cleaning up lazy dataset for layer: ${layerToRemove.name}`);
            layerToRemove.lazyDataset.dispose();
        }

        if (canvasCacheCleanerRef.current) {
            console.log(`Clearing canvas cache for layer: ${id}`);
            canvasCacheCleanerRef.current(id);
        }

        if (layerToRemove && 'dataset' in layerToRemove) {
            (layerToRemove as DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer | IlluminationLayer).dataset = [];
        }

        setLayers(prev => prev.filter(l => l.id !== id));
        if (activeLayerId === id) setActiveLayerId(null);

        if (typeof global !== 'undefined' && (global as { gc?: () => void }).gc) {
            setTimeout(() => (global as { gc: () => void }).gc(), 100);
        }
    }, [activeLayerId, layers, setLayers, setActiveLayerId]);

    const onCalculateNightfallLayer = useCallback(async (sourceLayerId: string, threshold?: number) => {
        const sourceLayer = layers.find(l => l.id === sourceLayerId) as (DataLayer | IlluminationLayer) | undefined;
        if (!sourceLayer) return;

        setIsLoading(`Forecasting nightfall for "${sourceLayer.name}"...`);
        await new Promise(r => setTimeout(r, 50));

        const effectiveThreshold = sourceLayer.type === 'illumination'
            ? (threshold ?? sourceLayer.illuminationThreshold ?? 0)
            : undefined;

        const { dataset, range, maxDuration } = await analysisService.calculateNightfallDataset(sourceLayer, effectiveThreshold);

        const transparent = 'rgba(0,0,0,0)';
        const fourteenDaysInHours = 14 * 24;

        const defaultCustomColormap: ColorStop[] = [
            { value: -Infinity, color: transparent },
            { value: -fourteenDaysInHours, color: 'cyan' },
            { value: 0, color: 'yellow' },
            { value: fourteenDaysInHours + 0.001, color: transparent }
        ];

        const defaultClip = Math.min(1000, Math.ceil(maxDuration / 24) * 24 || 24);

        const newLayer: AnalysisLayer = {
            id: generateSecureId('analysis'),
            name: `Nightfall Forecast for ${sourceLayer.name}`,
            type: 'analysis', analysisType: 'nightfall',
            visible: true, opacity: 1.0,
            colormap: 'Custom',
            colormapInverted: false,
            dataset, range,
            dimensions: sourceLayer.dimensions, sourceLayerId,
            customColormap: defaultCustomColormap,
            params: {
                clipValue: defaultClip,
                illuminationThreshold: effectiveThreshold
            },
        };

        setLayers(prev => [...prev, newLayer]);
        setActiveLayerId(newLayer.id);
        setIsLoading(null);
    }, [layers, setLayers, setActiveLayerId, setIsLoading]);

    const onCalculateDaylightFractionLayer = useCallback((sourceLayerId: string, threshold?: number) => {
        const sourceLayer = layers.find(l => l.id === sourceLayerId) as (DataLayer | IlluminationLayer) | undefined;
        if (!sourceLayer || !timeRange) return;

        const effectiveThreshold = threshold !== undefined ? threshold : (sourceLayer.type === 'illumination' ? 0 : undefined);

        const { slice, range } = analysisService.calculateDaylightFraction(
            sourceLayer.dataset,
            timeRange,
            sourceLayer.dimensions,
            sourceLayer.id,
            effectiveThreshold
        );

        const resultDataset: DataSet = Array.from({ length: sourceLayer.dimensions.time }, () => slice);

        const newLayer: AnalysisLayer = {
            id: generateSecureId('analysis'),
            name: `Daylight Fraction for ${sourceLayer.name}`,
            type: 'analysis', analysisType: 'daylight_fraction',
            visible: true, opacity: 1.0, colormap: 'Turbo',
            dataset: resultDataset, range,
            dimensions: sourceLayer.dimensions, sourceLayerId,
            params: { illuminationThreshold: effectiveThreshold },
            geospatial: sourceLayer.type === 'illumination' ? sourceLayer.geospatial : undefined,
            temporalInfo: sourceLayer.type === 'illumination' ? sourceLayer.temporalInfo : undefined,
        };

        setLayers(prev => [...prev, newLayer]);
        setActiveLayerId(newLayer.id);
    }, [layers, timeRange, setLayers, setActiveLayerId]);

    const onCreateExpressionLayer = useCallback(async (name: string, expression: string) => {
        setIsLoading(`Calculating expression "${name}"...`);
        await new Promise(r => setTimeout(r, 50));
        try {
            const { dataset, range, dimensions } = await analysisService.calculateExpressionLayer(
                expression,
                layers,
                (progressMsg) => setIsLoading(progressMsg)
            );

            const newLayer: AnalysisLayer = {
                id: generateSecureId('analysis-expr'),
                name: name,
                type: 'analysis',
                analysisType: 'expression',
                visible: true,
                opacity: 1.0,
                colormap: 'Custom',
                dataset, range, dimensions,
                sourceLayerId: undefined,
                customColormap: [
                    { value: -Infinity, color: 'rgba(0,0,0,0)' },
                    { value: 1, color: '#ffff00' }
                ],
                params: { expression },
            };
            setLayers(prev => [...prev, newLayer]);
            setActiveLayerId(newLayer.id);
        } catch (e) {
            showError(`Expression Error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(null);
        }
    }, [layers, setLayers, setActiveLayerId, setIsLoading, showError]);

    const onRecalculateExpressionLayer = useCallback(async (layerId: string, newExpression: string) => {
        const layer = layers.find(l => l.id === layerId);
        if (!layer || layer.type !== 'analysis' || layer.analysisType !== 'expression') {
            showError('Invalid layer for expression recalculation');
            return;
        }

        setIsLoading(`Recalculating expression "${layer.name}"...`);
        await new Promise(r => setTimeout(r, 50));
        try {
            const { dataset, range, dimensions } = await analysisService.calculateExpressionLayer(
                newExpression,
                layers,
                (progressMsg) => setIsLoading(progressMsg)
            );

            setLayers(prev => prev.map(l => {
                if (l.id === layerId) {
                    return {
                        ...l,
                        dataset,
                        range,
                        dimensions,
                        params: { ...l.params, expression: newExpression }
                    } as AnalysisLayer;
                }
                return l;
            }));
        } catch (e) {
            showError(`Expression Error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(null);
        }
    }, [layers, setLayers, setIsLoading, showError]);

    const value = useMemo(() => ({
        onAddDataLayer,
        onAddDteCommsLayer,
        onAddLpfCommsLayer,
        onAddIlluminationLayer,
        onAddBaseMapLayer,
        onAddImageLayer,
        onUpdateLayer,
        onRemoveLayer,
        onCalculateNightfallLayer,
        onCalculateDaylightFractionLayer,
        onCreateExpressionLayer,
        onRecalculateExpressionLayer,
        registerCanvasCacheCleaner
    }), [
        onAddDataLayer,
        onAddDteCommsLayer,
        onAddLpfCommsLayer,
        onAddIlluminationLayer,
        onAddBaseMapLayer,
        onAddImageLayer,
        onUpdateLayer,
        onRemoveLayer,
        onCalculateNightfallLayer,
        onCalculateDaylightFractionLayer,
        onCreateExpressionLayer,
        onRecalculateExpressionLayer,
        registerCanvasCacheCleaner
    ]);

    return <LayerOperationsContext.Provider value={value}>{children}</LayerOperationsContext.Provider>;
};

// --- Combined Hook ---

export const useLayerContext = () => {
    const state = useLayerState();
    const operations = useLayerOperations();
    return { ...state, ...operations };
};
