import React, { createContext, useContext, useState, useCallback } from 'react';
import type { GeoCoordinates, PixelCoords, DaylightFractionHoverData } from '../types';

interface SelectionContextType {
    // State
    selectedCells: { x: number; y: number; }[];
    selectionColor: string;
    selectedCellForPlot: { x: number; y: number; } | null;
    selectedPixel: (PixelCoords & { layerId: string; }) | null;
    hoveredCoords: GeoCoordinates;
    timeSeriesData: { data: number[]; range: { min: number; max: number; }; } | null;
    daylightFractionHoverData: DaylightFractionHoverData | null;

    // Operations
    setSelectedCells: React.Dispatch<React.SetStateAction<{ x: number; y: number; }[]>>;
    setSelectionColor: React.Dispatch<React.SetStateAction<string>>;
    setSelectedCellForPlot: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
    setSelectedPixel: React.Dispatch<React.SetStateAction<(PixelCoords & { layerId: string; }) | null>>;
    setHoveredCoords: React.Dispatch<React.SetStateAction<GeoCoordinates>>;
    setTimeSeriesData: React.Dispatch<React.SetStateAction<{ data: number[]; range: { min: number; max: number; }; } | null>>;
    setDaylightFractionHoverData: React.Dispatch<React.SetStateAction<DaylightFractionHoverData | null>>;
    clearHoverState: () => void;
    onClearSelection: () => void;
}

const SelectionContext = createContext<SelectionContextType | null>(null);

export const useSelectionContext = () => {
    const context = useContext(SelectionContext);
    if (!context) {
        throw new Error('useSelectionContext must be used within a SelectionProvider');
    }
    return context;
};

interface SelectionProviderProps {
    children: React.ReactNode;
}

export const SelectionProvider: React.FC<SelectionProviderProps> = ({ children }) => {
    // Cell selection state
    const [selectedCells, setSelectedCells] = useState<{ x: number; y: number; }[]>([]);
    const [selectionColor, setSelectionColor] = useState<string>('#ffff00');
    const [selectedCellForPlot, setSelectedCellForPlot] = useState<{ x: number; y: number; } | null>(null);

    // Pixel selection state
    const [selectedPixel, setSelectedPixel] = useState<(PixelCoords & { layerId: string; }) | null>(null);

    // Hover state
    const [hoveredCoords, setHoveredCoords] = useState<GeoCoordinates>(null);

    // Time series data for selected cells/pixels
    const [timeSeriesData, setTimeSeriesData] = useState<{ data: number[]; range: { min: number; max: number; }; } | null>(null);

    // Daylight fraction hover data
    const [daylightFractionHoverData, setDaylightFractionHoverData] = useState<DaylightFractionHoverData | null>(null);

    // Clear hover state (coordinates and selected pixel)
    const clearHoverState = useCallback(() => {
        setHoveredCoords(null);
        setSelectedPixel(null);
    }, []);

    // Clear all selection (cells, colors, plot selection)
    const onClearSelection = useCallback(() => {
        setSelectedCells([]);
        setSelectedCellForPlot(null);
    }, []);

    const value: SelectionContextType = {
        // State
        selectedCells,
        selectionColor,
        selectedCellForPlot,
        selectedPixel,
        hoveredCoords,
        timeSeriesData,
        daylightFractionHoverData,

        // Operations
        setSelectedCells,
        setSelectionColor,
        setSelectedCellForPlot,
        setSelectedPixel,
        setHoveredCoords,
        setTimeSeriesData,
        setDaylightFractionHoverData,
        clearHoverState,
        onClearSelection,
    };

    return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};
