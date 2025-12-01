import React, { createContext, useContext, useCallback } from 'react';
import type {
    AppStateConfig, SerializableLayer, Layer, DataLayer, BaseMapLayer, AnalysisLayer,
    ImageLayer, DteCommsLayer, LpfCommsLayer, IlluminationLayer, DataSet, Event
} from '../types';
import { useLayerContext } from './LayerContext';
import { useTimeContext } from './TimeContext';
import { useViewportContext } from './ViewportContext';
import { useSelectionContext } from './SelectionContext';
import { useUIStateContext } from './UIStateContext';
import { useArtifactContext } from './ArtifactContext';
import { useToast } from '../components/Toast';
import { parseNpy } from '../services/npyParser';
import { parseVrt } from '../services/vrtParser';
import { parseNetCdf4, parseTimeValues } from '../services/netcdf4Parser';
import proj4 from 'proj4';
import * as analysisService from '../services/analysisService';
import { IMAGE_LOAD_TIMEOUT_MS } from '../config/defaults';

interface SessionContextType {
    onExportConfig: () => Promise<void>;
    onImportConfig: (file: File) => void;
    handleRestoreSession: (config: AppStateConfig, files: FileList | File[]) => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const useSessionContext = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSessionContext must be used within a SessionProvider');
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

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        layers, activeLayerId, setLayers, setActiveLayerId, setIsLoading
    } = useLayerContext();

    const {
        timeRange, timeZoomDomain, setTimeRange, setTimeZoomDomain, setCurrentDateIndex,
        setIsPlaying, setIsPaused, setPlaybackSpeed
    } = useTimeContext();

    const {
        viewState, showGraticule, graticuleDensity, graticuleLabelFontSize, showGrid,
        gridSpacing, gridColor, setViewState, setShowGraticule, setGraticuleDensity,
        setShowGrid, setGridSpacing, setGridColor
    } = useViewportContext();

    const {
        selectedCells, selectionColor, setSelectedCells, setSelectionColor
    } = useSelectionContext();

    const {
        activeTool, setActiveTool, setImportRequest, setNightfallPlotYAxisRange,
        nightfallPlotYAxisRange, activityDefinitions, setActivityDefinitions
    } = useUIStateContext();

    const {
        artifacts, setArtifacts, artifactDisplayOptions, setArtifactDisplayOptions,
        pathCreationOptions, setPathCreationOptions, events, setEvents
    } = useArtifactContext();

    const { showError, showWarning } = useToast();

    const onExportConfig = useCallback(async () => {
        if (layers.length === 0) { showWarning("Cannot export an empty session."); return; }
        setIsLoading("Exporting session...");
        try {
            const serializableLayers: SerializableLayer[] = layers.map((l): SerializableLayer => {
                if (l.type === 'basemap') {
                    const { image, ...rest } = l; // Omit non-serializable image element
                    return rest;
                } else if (l.type === 'image') {
                    // Convert image to data URL for export
                    const canvas = document.createElement('canvas');
                    canvas.width = l.image.width;
                    canvas.height = l.image.height;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(l.image, 0, 0);
                    const imageDataUrl = canvas.toDataURL('image/png');
                    const { image, ...rest } = l;
                    return { ...rest, imageDataUrl };
                } else if (l.type === 'illumination') {
                    // Omit dataset and lazyDataset (which is not serializable)
                    const { dataset, lazyDataset, ...rest } = l as any;
                    return rest;
                } else { // data, analysis, or comms
                    const { dataset, ...rest } = l; // Omit large dataset
                    return rest;
                }
            });

            const config: AppStateConfig = {
                version: 1,
                layers: serializableLayers,
                activeLayerId,
                timeRange,
                timeZoomDomain: timeZoomDomain ? [timeZoomDomain[0].toISOString(), timeZoomDomain[1].toISOString()] : null,
                viewState,
                showGraticule,
                graticuleDensity,
                showGrid,
                gridSpacing,
                gridColor,
                selectedCells,
                selectionColor,
                activeTool,
                artifacts: artifacts.map(a => ({ ...a })),
                artifactDisplayOptions,
                pathCreationOptions,
                activityDefinitions,
                nightfallPlotYAxisRange,
                events: events.map(e => ({ ...e })),
            };

            const jsonString = JSON.stringify(config, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `session_${new Date().toISOString()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            showError(`Error exporting session: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(null);
        }
    }, [
        layers, activeLayerId, timeRange, timeZoomDomain, viewState, showGraticule,
        graticuleDensity, showGrid, gridSpacing, gridColor, selectedCells, selectionColor,
        activeTool, artifacts, artifactDisplayOptions, pathCreationOptions, activityDefinitions,
        nightfallPlotYAxisRange, events, setIsLoading, showWarning, showError
    ]);

    const handleRestoreSession = useCallback(async (config: AppStateConfig, files: FileList | File[]) => {
        setImportRequest(null);
        setIsLoading("Restoring session...");

        try {
            const fileMap = new Map<string, File>();
            Array.from(files).forEach(f => fileMap.set(f.name, f));

            // Reset state
            setLayers([]); setTimeRange(null); setTimeZoomDomain(null); setViewState(null);
            setSelectedCells([]); setArtifacts([]); setEvents([]);

            let newLayers: Layer[] = [];

            // 1. Load BaseMap and Data layers
            const nonAnalysisLayers = config.layers.filter(l => l.type !== 'analysis');
            const totalNonAnalysisLayers = nonAnalysisLayers.length;
            let processedLayers = 0;

            for (const sLayer of config.layers) {
                if (sLayer.type === 'basemap') {
                    processedLayers++;
                    const progress = Math.floor((processedLayers / totalNonAnalysisLayers) * 100);
                    setIsLoading(`Loading layer ${processedLayers} of ${totalNonAnalysisLayers}... ${progress}%`);

                    const pngFile = fileMap.get(sLayer.pngFileName);
                    const vrtFile = fileMap.get(sLayer.vrtFileName);
                    if (!pngFile) throw new Error(`Required file "${sLayer.pngFileName}" was not provided.`);
                    if (!vrtFile) throw new Error(`Required file "${sLayer.vrtFileName}" was not provided.`);

                    const vrtContent = await vrtFile.text();
                    const vrtData = parseVrt(vrtContent);

                    const objectUrl = URL.createObjectURL(pngFile);
                    const image = await dataUrlToImage(objectUrl);
                    URL.revokeObjectURL(objectUrl);

                    const layer: BaseMapLayer = { ...sLayer, image, vrt: vrtData };
                    newLayers.push(layer);

                } else if (sLayer.type === 'data' || sLayer.type === 'dte_comms' || sLayer.type === 'lpf_comms') {
                    processedLayers++;
                    const progress = Math.floor((processedLayers / totalNonAnalysisLayers) * 100);
                    setIsLoading(`Loading layer ${processedLayers} of ${totalNonAnalysisLayers}... ${progress}%`);

                    const file = fileMap.get(sLayer.fileName);
                    if (!file) throw new Error(`Required file "${sLayer.fileName}" was not provided.`);

                    const arrayBuffer = await file.arrayBuffer();
                    const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
                    const [height, width, time] = shape;
                    const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));
                    let flatIndex = 0;
                    if (header.fortran_order) { for (let t = 0; t < time; t++) for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) dataset[t][y][x] = float32Array[flatIndex++]; }
                    else { for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let t = 0; t < time; t++) dataset[t][y][x] = float32Array[flatIndex++]; }

                    const layer: DataLayer | DteCommsLayer | LpfCommsLayer = { ...sLayer, dataset };
                    newLayers.push(layer);
                } else if (sLayer.type === 'image') {
                    processedLayers++;
                    const progress = Math.floor((processedLayers / totalNonAnalysisLayers) * 100);
                    setIsLoading(`Loading layer ${processedLayers} of ${totalNonAnalysisLayers}... ${progress}%`);

                    // Load image from embedded data URL
                    const image = await dataUrlToImage(sLayer.imageDataUrl);
                    const { imageDataUrl, ...rest } = sLayer;
                    const layer: ImageLayer = { ...rest, image };
                    newLayers.push(layer);
                } else if (sLayer.type === 'illumination') {
                    processedLayers++;
                    const progress = Math.floor((processedLayers / totalNonAnalysisLayers) * 100);
                    setIsLoading(`Loading layer ${processedLayers} of ${totalNonAnalysisLayers}... ${progress}%`);

                    const file = fileMap.get(sLayer.fileName);
                    if (!file) throw new Error(`Required file "${sLayer.fileName}" was not provided.`);

                    const arrayBuffer = await file.arrayBuffer();
                    const { reader } = await parseNetCdf4(arrayBuffer);

                    // Parse dates in temporalInfo if they exist (JSON deserialization leaves them as strings)
                    let temporalInfo = sLayer.temporalInfo;
                    if (temporalInfo) {
                        temporalInfo = {
                            ...temporalInfo,
                            startDate: new Date(temporalInfo.startDate),
                            endDate: new Date(temporalInfo.endDate),
                            dates: temporalInfo.dates.map((d: string | Date) => new Date(d))
                        };
                    }

                    // We don't need to re-calculate metadata/geospatial info as it's in the serialized layer
                    // But we do need the reader for lazy loading
                    const layer: IlluminationLayer = {
                        ...sLayer,
                        dataset: [], // Empty dataset as it's lazy loaded
                        lazyDataset: reader,
                        temporalInfo
                    };
                    newLayers.push(layer);
                }
            }

            // 2. Re-calculate Analysis layers in a second pass
            let finalLayers = [...newLayers];
            for (const sLayer of config.layers) {
                if (sLayer.type === 'analysis') {
                    let calculatedDataset: DataSet;
                    let finalAnalysisLayer: AnalysisLayer;

                    if (sLayer.analysisType === 'expression' && sLayer.params.expression) {
                        const { dataset } = await analysisService.calculateExpressionLayer(
                            sLayer.params.expression,
                            finalLayers,
                            (progressMsg) => setIsLoading(progressMsg)
                        );
                        calculatedDataset = dataset;
                        finalAnalysisLayer = { ...sLayer, dataset: calculatedDataset };
                    } else {
                        const sourceLayer = finalLayers.find(l => l.id === sLayer.sourceLayerId) as (DataLayer | IlluminationLayer) | undefined;
                        if (!sourceLayer) throw new Error(`Source layer with ID ${sLayer.sourceLayerId} not found for analysis layer "${sLayer.name}".`);

                        if (sLayer.analysisType === 'nightfall') {
                            const threshold = sLayer.params.illuminationThreshold;
                            const { dataset } = await analysisService.calculateNightfallDataset(sourceLayer, threshold);
                            calculatedDataset = dataset;
                        } else { // daylight_fraction
                            const calcTimeRange = config.timeRange || { start: 0, end: sourceLayer.dimensions.time - 1 };
                            const threshold = sLayer.params.illuminationThreshold;
                            const { slice } = analysisService.calculateDaylightFraction(sourceLayer.dataset, calcTimeRange, sourceLayer.dimensions, sourceLayer.id, threshold);
                            calculatedDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
                        }
                        finalAnalysisLayer = { ...sLayer, dataset: calculatedDataset };
                    }
                    finalLayers.push(finalAnalysisLayer);
                }
            }

            // 3. Set final state
            setLayers(finalLayers);
            setActiveLayerId(config.activeLayerId);
            setTimeRange(config.timeRange);
            setCurrentDateIndex(config.timeRange?.start ?? null);
            setViewState(config.viewState);
            setShowGraticule(config.showGraticule);
            setGraticuleDensity(config.graticuleDensity);
            setShowGrid(config.showGrid);
            setGridSpacing(config.gridSpacing);
            setGridColor(config.gridColor);
            setSelectedCells(config.selectedCells);
            setSelectionColor(config.selectionColor);
            setActiveTool(config.activeTool);
            setArtifacts(config.artifacts || []);
            setEvents(config.events || []);
            if (config.timeZoomDomain) {
                setTimeZoomDomain([new Date(config.timeZoomDomain[0]), new Date(config.timeZoomDomain[1])]);
            }
            setArtifactDisplayOptions(config.artifactDisplayOptions || { waypointDotSize: 8, showSegmentLengths: true, labelFontSize: 14, showActivitySymbols: true });
            setPathCreationOptions(config.pathCreationOptions || { defaultMaxSegmentLength: 200 });
            setActivityDefinitions(config.activityDefinitions || [
                { id: 'DRIVE-0', name: 'Drive-0', defaultDuration: 60 },
                { id: 'DRIVE-5', name: 'Drive-5', defaultDuration: 0 },
                { id: 'DRIVE-10', name: 'Drive-10', defaultDuration: 60 },
                { id: 'DRIVE-15', name: 'Drive-15', defaultDuration: 60 },
                { id: 'DTE_COMMS', name: 'TTC_COMMS', defaultDuration: 3600 },
                { id: 'LPF_COMMS', name: 'PL_COMMS', defaultDuration: 60 },
                { id: 'IDLE', name: 'Idle', defaultDuration: 60 },
                { id: 'SLEEP', name: 'Sleep', defaultDuration: 60 },
                { id: 'SCIENCE', name: 'Science', defaultDuration: 60 },
            ]);
            setNightfallPlotYAxisRange(config.nightfallPlotYAxisRange || { min: -15, max: 15 });

        } catch (e) {
            showError(`Error restoring session: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(null);
        }
    }, [
        setImportRequest, setIsLoading, setLayers, setTimeRange, setTimeZoomDomain, setViewState,
        setSelectedCells, setArtifacts, setEvents, setActiveLayerId, setCurrentDateIndex,
        setShowGraticule, setGraticuleDensity, setShowGrid, setGridSpacing, setGridColor,
        setSelectionColor, setActiveTool, setArtifactDisplayOptions, setPathCreationOptions,
        setActivityDefinitions, setNightfallPlotYAxisRange, showError
    ]);

    const onImportConfig = useCallback((file: File) => {
        setIsLoading("Reading config file...");
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target?.result as string) as AppStateConfig;
                if (config.version !== 1) { throw new Error("Unsupported config version."); }

                const requiredFiles: string[] = [];
                for (const l of config.layers) {
                    if (l.type === 'data' || l.type === 'dte_comms' || l.type === 'lpf_comms') {
                        requiredFiles.push(l.fileName);
                    } else if (l.type === 'basemap') {
                        requiredFiles.push(l.pngFileName);
                        requiredFiles.push(l.vrtFileName);
                    } else if (l.type === 'illumination') {
                        requiredFiles.push(l.fileName);
                    }
                    // Image layers don't need separate files - they're embedded as data URLs
                }

                if (requiredFiles.length > 0) {
                    setImportRequest({ config, requiredFiles });
                } else {
                    handleRestoreSession(config, []); // No files required
                }
            } catch (e) {
                showError(`Error reading config file: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setIsLoading(null);
            }
        };
        reader.onerror = () => {
            showError("Failed to read the file.");
            setIsLoading(null);
        };
        reader.readAsText(file);
    }, [handleRestoreSession, setImportRequest, setIsLoading, showError]);

    return (
        <SessionContext.Provider value={{ onExportConfig, onImportConfig, handleRestoreSession }}>
            {children}
        </SessionContext.Provider>
    );
};
