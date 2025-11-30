/**
 * Main control panel component that routes to specific tool panels
 * Each panel has been extracted to separate files for better maintainability
 */
import React from 'react';
import { useUIStateContext } from '../context/UIStateContext';
import { LayersPanel } from './panels/LayersPanel';
import { ArtifactsPanel } from './panels/ArtifactsPanel';
import { EventsPanel } from './panels/EventsPanel';
import { MeasurementPanel } from './panels/MeasurementPanel';
import { ConfigurationPanel } from './panels/ConfigurationPanel';

export const SidePanel: React.FC = () => {
    const { activeTool } = useUIStateContext();
    const renderPanel = () => {
        switch (activeTool) {
            case 'layers': return <LayersPanel />;
            case 'artifacts': return <ArtifactsPanel />;
            case 'events': return <EventsPanel />;
            case 'measurement': return <MeasurementPanel />;
            case 'config': return <ConfigurationPanel />;
            default: return null;
        }
    };

    // Don't render the panel container if no tool is selected
    if (!activeTool) {
        return null;
    }

    return (
        <aside className="bg-gray-800/50 border-r border-gray-700 p-4 w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto">
            {renderPanel()}
        </aside>
    );
};
