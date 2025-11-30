import React from 'react';
import { useLayerContext } from '../../context/LayerContext';
import { useSelectionContext } from '../../context/SelectionContext';
import { Section } from './panelUtils';

export const MeasurementPanel: React.FC = () => {
    const { primaryDataLayer } = useLayerContext();
    const {
        selectedCells,
        selectionColor,
        setSelectionColor,
        onClearSelection
    } = useSelectionContext();

    const isDataLoaded = !!primaryDataLayer;

    if (!isDataLoaded) {
        return (
            <div>
                <h2 className="text-base font-semibold text-cyan-300">Measurement</h2>
                <p className="text-xs text-gray-400 mt-2">Load a data layer to select cells.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-base font-semibold text-cyan-300">Cell Selection</h2>
            <p className="text-xs text-gray-400">Click on the map to select or deselect individual cells.</p>
            <Section title="Selection Tools" defaultOpen={true}>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">Selected cells:</span>
                    <span className="font-mono text-cyan-300">{selectedCells.length}</span>
                </div>
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-300">Highlight Color</label>
                    <input
                        type="color"
                        value={selectionColor}
                        onChange={(e) => setSelectionColor(e.target.value)}
                        className="w-10 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer"
                    />
                </div>
                <button
                    onClick={onClearSelection}
                    disabled={selectedCells.length === 0}
                    className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-semibold py-2 px-3 rounded-md text-xs transition-all"
                >
                    Clear Selection
                </button>
            </Section>
        </div>
    );
};
