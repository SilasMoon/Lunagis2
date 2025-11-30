import React, { useMemo } from 'react';
import type { Artifact, ArtifactBase, CircleArtifact, RectangleArtifact, PathArtifact, Waypoint } from '../../types';
import { useArtifactContext } from '../../context/ArtifactContext';
import { useViewportContext } from '../../context/ViewportContext';
import { useLayerContext } from '../../context/LayerContext';
import { Section, formatDistance, calculatePathDistance } from './panelUtils';
import { exportPathToYAML } from '../../utils/pathExport';

const ArtifactItem = React.memo<{ artifact: Artifact; isActive: boolean; onSelect: () => void; }>(({ artifact, isActive, onSelect }) => {
    const { onUpdateArtifact, onRemoveArtifact, onStartAppendWaypoints, activityDefinitions } = useArtifactContext();
    const { proj } = useViewportContext();

    const handleCommonUpdate = (prop: keyof ArtifactBase, value: string | boolean | [number, number] | number) => {
        onUpdateArtifact(artifact.id, { [prop]: value });
    };

    const handleWaypointUpdate = (path: PathArtifact, wpIndex: number, newProps: Partial<Waypoint>) => {
        const newWaypoints = [...path.waypoints];
        newWaypoints[wpIndex] = { ...newWaypoints[wpIndex], ...newProps };
        onUpdateArtifact(path.id, { waypoints: newWaypoints });
    };

    const handleWaypointGeoChange = (path: PathArtifact, wpIndex: number, coord: 'lon' | 'lat', value: string) => {
        const numericValue = parseFloat(value);
        if (isNaN(numericValue)) return;

        const newWaypoints = [...path.waypoints];
        const oldPos = newWaypoints[wpIndex].geoPosition;
        const newPos: [number, number] = [
            coord === 'lon' ? numericValue : oldPos[0],
            coord === 'lat' ? numericValue : oldPos[1]
        ];
        newWaypoints[wpIndex] = { ...newWaypoints[wpIndex], geoPosition: newPos };
        onUpdateArtifact(path.id, { waypoints: newWaypoints });
    };

    const handleRemoveWaypoint = (path: PathArtifact, wpIndex: number) => {
        const newWaypoints = path.waypoints.filter((_, i) => i !== wpIndex);
        onUpdateArtifact(path.id, { waypoints: newWaypoints });
    };

    return (
        <div className={`bg-gray-800/60 rounded-lg border ${isActive ? 'border-cyan-500/50' : 'border-gray-700/80'}`}>
            <div className="flex items-center p-2 gap-2">
                <button onClick={() => handleCommonUpdate('visible', !artifact.visible)} title={artifact.visible ? 'Hide' : 'Show'} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" style={{ opacity: artifact.visible ? 1 : 0.3 }} /></svg>
                </button>
                <div onClick={onSelect} className="flex-grow cursor-pointer truncate text-xs">
                    <p className="font-medium text-gray-200" title={artifact.name}>{artifact.name}</p>
                    <p className="text-xs text-gray-400">{artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)}</p>
                </div>
                <button onClick={onSelect} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isActive ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                <button onClick={() => onRemoveArtifact(artifact.id)} title="Remove" className="text-gray-500 hover:text-red-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
            </div>
            {isActive && (
                <div className="p-3 border-t border-gray-700 space-y-4 text-xs animate-fade-in">
                    <Section title="General" defaultOpen={true}>
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-gray-300">Name</label>
                            <input type="text" value={artifact.name} onChange={e => handleCommonUpdate('name', e.target.value)} className="w-40 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-gray-300">Color</label>
                            <input type="color" value={artifact.color} onChange={e => handleCommonUpdate('color', e.target.value)} className="w-10 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer" />
                        </div>
                        <div>
                            <label className="block font-medium text-gray-300 mb-1">Thickness: {artifact.thickness}px</label>
                            <input type="range" min="1" max="10" step="1" value={artifact.thickness} onChange={e => handleCommonUpdate('thickness', Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                    </Section>

                    {artifact.type === 'circle' && (
                        <Section title="Circle Properties" defaultOpen={true}>
                            <div className="flex items-center justify-between">
                                <label className="font-medium text-gray-300">Radius (m)</label>
                                <input type="number" min="0" value={(artifact as CircleArtifact).radius} onChange={e => onUpdateArtifact(artifact.id, { radius: Number(e.target.value) })} className="w-24 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                            </div>
                        </Section>
                    )}

                    {artifact.type === 'rectangle' && (
                        <Section title="Rectangle Properties" defaultOpen={true}>
                            <div className="flex items-center justify-between">
                                <label className="font-medium text-gray-300">Width (m)</label>
                                <input type="number" min="0" value={(artifact as RectangleArtifact).width} onChange={e => onUpdateArtifact(artifact.id, { width: Number(e.target.value) })} className="w-24 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="font-medium text-gray-300">Height (m)</label>
                                <input type="number" min="0" value={(artifact as RectangleArtifact).height} onChange={e => onUpdateArtifact(artifact.id, { height: Number(e.target.value) })} className="w-24 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-300 mb-1">Rotation: {(artifact as RectangleArtifact).rotation}°</label>
                                <input type="range" min="0" max="360" step="1" value={(artifact as RectangleArtifact).rotation} onChange={e => onUpdateArtifact(artifact.id, { rotation: Number(e.target.value) })} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                            </div>
                            {(artifact as RectangleArtifact).isFreeForm && (artifact as RectangleArtifact).corners && proj && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                    <h5 className="text-xs font-medium text-gray-300 mb-2">Corner Coordinates</h5>
                                    {(() => {
                                        const rect = artifact as RectangleArtifact;
                                        const corners = rect.corners!;
                                        const cornerNames = ['Top Left', 'Top Right', 'Bottom Right', 'Bottom Left'];
                                        const cornerCoords = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];

                                        return cornerCoords.map((corner, idx) => {
                                            const [lon, lat] = proj.inverse(corner);
                                            return (
                                                <div key={idx} className="text-xs text-gray-400 mb-1">
                                                    <span className="font-medium text-gray-300">{cornerNames[idx]}:</span>{' '}
                                                    <span className="font-mono">{lat.toFixed(6)}°, {lon.toFixed(6)}°</span>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            )}
                        </Section>
                    )}

                    {artifact.type === 'path' && (
                        <>
                            <Section title="Path Tools">
                                <div className="space-y-2">
                                    <button onClick={onStartAppendWaypoints} className="w-full bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold py-1.5 px-2 rounded-md">Add Waypoints</button>
                                    <button
                                        onClick={() => exportPathToYAML(artifact as PathArtifact, activityDefinitions)}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-1.5 px-2 rounded-md"
                                        title="Export path to YAML format"
                                    >
                                        Export to YAML
                                    </button>
                                </div>
                            </Section>
                            <Section
                                title={`Path Waypoints (${formatDistance(calculatePathDistance(proj, (artifact as PathArtifact).waypoints))})`}
                                defaultOpen={true}
                            >
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    {(artifact as PathArtifact).waypoints.map((wp, i) => (
                                        <div key={wp.id} className="bg-gray-900/40 p-1.5 rounded-md">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-gray-400">{i + 1}.</span>
                                                <input type="text" value={wp.label}
                                                    onChange={e => handleWaypointUpdate(artifact as PathArtifact, i, { label: e.target.value })}
                                                    className="w-full bg-gray-700 text-white rounded p-1 border border-gray-600 text-sm" placeholder="Label" />
                                                <button onClick={() => handleRemoveWaypoint(artifact as PathArtifact, i)} title="Remove Waypoint" className="text-gray-500 hover:text-red-400">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        </>
                    )}
                </div>
            )}
        </div>
    );
});

ArtifactItem.displayName = 'ArtifactItem';

export const ArtifactsPanel: React.FC = () => {
    const {
        artifacts,
        activeArtifactId,
        setActiveArtifactId,
        artifactCreationMode,
        setArtifactCreationMode,
        onFinishArtifactCreation,
        isAppendingWaypoints,
        pathCreationOptions,
        setPathCreationOptions,
        activityDefinitions,
        setActivityDefinitions,
    } = useArtifactContext();

    const { primaryDataLayer, baseMapLayer } = useLayerContext();
    const { proj } = useViewportContext();

    const isDataLoaded = !!primaryDataLayer || !!baseMapLayer;

    // Calculate cumulative total distance of all paths
    const totalCumulativeDistance = useMemo(() => {
        return artifacts
            .filter(artifact => artifact.type === 'path')
            .reduce((sum, artifact) => {
                return sum + calculatePathDistance(proj, (artifact as PathArtifact).waypoints);
            }, 0);
    }, [artifacts, proj]);

    if (!isDataLoaded) {
        return (
            <div>
                <h2 className="text-base font-semibold text-cyan-300">Artifacts</h2>
                <p className="text-xs text-gray-400 mt-2">Load a basemap or data layer to add artifacts.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-cyan-300">Artifacts</h2>
                {totalCumulativeDistance > 0 && (
                    <span className="text-xs font-medium text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded-md" title="Total cumulative distance of all paths">
                        Total: {formatDistance(totalCumulativeDistance)}
                    </span>
                )}
            </div>
            {artifactCreationMode === 'path' ? (
                <div className="p-3 bg-cyan-900/50 border border-cyan-700 rounded-md text-xs text-cyan-200 space-y-3">
                    <p><strong>Drawing Path:</strong> Click on the map to add waypoints. Press 'Esc' or click finish when done.</p>
                    <button onClick={onFinishArtifactCreation} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-1.5 px-3 rounded-md text-xs transition-all">Finish Drawing</button>
                </div>
            ) : isAppendingWaypoints ? (
                <div className="p-3 bg-teal-900/50 border border-teal-700 rounded-md text-xs text-teal-200 space-y-3">
                    <p><strong>Appending to Path:</strong> Click on the map to add new waypoints. Press 'Esc' or click finish to stop.</p>
                    <button onClick={onFinishArtifactCreation} className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-1.5 px-3 rounded-md text-xs transition-all">Finish Appending</button>
                </div>
            ) : (
                <>
                    <p className="text-xs text-gray-400">Add and manage annotations on the map. Click a button below, then click on the map to place an artifact.</p>

                    {/* Path Creation Settings */}
                    <Section title="Path Creation Settings" defaultOpen={false}>
                        <div className="space-y-2">
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-gray-300">Max Segment Length (m):</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="100"
                                    value={pathCreationOptions.defaultMaxSegmentLength ?? ''}
                                    placeholder="No limit"
                                    onChange={(e) => {
                                        const value = e.target.value === '' ? null : parseFloat(e.target.value);
                                        setPathCreationOptions({ defaultMaxSegmentLength: value });
                                    }}
                                    className="bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm"
                                    title="Maximum distance between waypoints. A visual guide circle will be shown during path creation."
                                />
                                <span className="text-xs text-gray-500">Set a limit before creating a path. Leave empty for no limit.</span>
                            </label>
                        </div>
                    </Section>

                    {/* Default Activity Settings */}
                    <Section title="Default Activity Settings" defaultOpen={false}>
                        <div className="space-y-2">
                            <p className="text-xs text-gray-400 mb-2">Manage activity types with custom names and default durations:</p>
                            {activityDefinitions.map((def, index) => (
                                <div key={def.id} className="flex items-center gap-2 bg-gray-700/50 p-1.5 rounded border border-gray-600">
                                    <input
                                        type="text"
                                        value={def.name}
                                        onChange={(e) => {
                                            const newDefs = [...activityDefinitions];
                                            newDefs[index] = { ...newDefs[index], name: e.target.value };
                                            setActivityDefinitions(newDefs);
                                        }}
                                        className="bg-gray-800 text-white rounded px-2 py-1 border border-gray-600 text-xs flex-1"
                                        placeholder="Activity Name"
                                        title="Name used in UI and YAML export"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={def.defaultDuration}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value) || 0;
                                            const newDefs = [...activityDefinitions];
                                            newDefs[index] = { ...newDefs[index], defaultDuration: value >= 0 ? value : 0 };
                                            setActivityDefinitions(newDefs);
                                        }}
                                        className="bg-gray-800 text-white rounded px-2 py-1 border border-gray-600 text-xs w-16 text-right"
                                        title="Default duration in seconds"
                                    />
                                    <span className="text-xs text-gray-500">s</span>
                                    <button
                                        onClick={() => {
                                            if (confirm(`Remove activity "${def.name}"?`)) {
                                                setActivityDefinitions(activityDefinitions.filter((_, i) => i !== index));
                                            }
                                        }}
                                        className="text-red-400 hover:text-red-300 p-0.5"
                                        title="Remove activity"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => {
                                    const newId = `CUSTOM_${Date.now()}`;
                                    setActivityDefinitions([...activityDefinitions, { id: newId, name: 'New Activity', defaultDuration: 60 }]);
                                }}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1 px-2 rounded"
                            >
                                + Add Activity Type
                            </button>
                        </div>
                    </Section>

                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setArtifactCreationMode('circle')} className="bg-teal-700 hover:bg-teal-600 text-white font-semibold py-2 px-2 rounded-md text-xs transition-all text-center">Add Circle</button>
                        <button onClick={() => setArtifactCreationMode('rectangle')} className="bg-indigo-700 hover:bg-indigo-600 text-white font-semibold py-2 px-2 rounded-md text-xs transition-all text-center">Add Grid Rect</button>
                        <button onClick={() => setArtifactCreationMode('free_rectangle')} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-2 rounded-md text-xs transition-all text-center">Add Free Rect</button>
                        <button onClick={() => setArtifactCreationMode('path')} className="bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2 px-2 rounded-md text-xs transition-all text-center">Add Path</button>
                    </div>
                </>
            )}

            <div className="space-y-2">
                {artifacts.length > 0 ? (
                    [...artifacts].reverse().map(artifact => (
                        <ArtifactItem
                            key={artifact.id}
                            artifact={artifact}
                            isActive={artifact.id === activeArtifactId}
                            onSelect={() => setActiveArtifactId(artifact.id === activeArtifactId ? null : artifact.id)}
                        />
                    ))
                ) : (
                    <p className="text-xs text-gray-500 text-center p-4">No artifacts created.</p>
                )}
            </div>
        </div>
    );
};
