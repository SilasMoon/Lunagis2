// Fix: Removed invalid file header which was causing parsing errors.
import React, { useRef, useEffect, useMemo } from 'react';
import type { ColorMapName, ColorStop, DivergingThresholdConfig } from '../types';
import { getColorScale } from '../services/colormap';

interface ColorbarProps {
  colorMap: ColorMapName;
  dataRange: { min: number; max: number } | null;
  units?: string;
  inverted?: boolean;
  customColormap?: ColorStop[];
  isThreshold?: boolean;
  divergingThresholdConfig?: DivergingThresholdConfig;
}

const BAR_WIDTH = 20;
const BAR_HEIGHT = 200;

export const Colorbar: React.FC<ColorbarProps> = ({ colorMap, dataRange, units, inverted, customColormap, isThreshold, divergingThresholdConfig }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!dataRange || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const domainForScale: [number, number] = [dataRange.min, dataRange.max];
    const colorScale = getColorScale(colorMap, domainForScale, inverted, customColormap, isThreshold, divergingThresholdConfig); 

    ctx.clearRect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    
    for (let i = 0; i < BAR_HEIGHT; i++) {
        const valueRatio = 1 - (i / BAR_HEIGHT);
        const value = dataRange.min + valueRatio * (dataRange.max - dataRange.min);
        ctx.fillStyle = colorScale(value);
        ctx.fillRect(0, i, BAR_WIDTH, 1);
    }
  }, [colorMap, dataRange, inverted, customColormap, isThreshold, divergingThresholdConfig]);

  const formatLabel = (value: number) => {
    if (units === 'days') {
      return (value / 24).toFixed(1);
    }
    return value < 100 ? value.toFixed(1) : Math.round(value);
  }

  const labels = useMemo(() => {
    if (!dataRange) return [];
    const { min, max } = dataRange;
    const range = max - min;
    
    // Always include min and max
    const allLabels = new Map<number, {value: number, y: number}>();
    allLabels.set(max, { value: max, y: 0 });
    allLabels.set(min, { value: min, y: BAR_HEIGHT });

    if (isThreshold && customColormap && customColormap.length > 1) {
        customColormap.forEach(stop => {
            // Add intermediate stops, avoiding duplicates of min/max and -Infinity
            if (stop.value > min && stop.value < max) {
                const y = BAR_HEIGHT * (1 - (stop.value - min) / range);
                allLabels.set(stop.value, { value: stop.value, y });
            }
        });
    }

    const uniqueLabels = Array.from(allLabels.values());
    uniqueLabels.sort((a, b) => a.y - b.y); // Sort from top to bottom
    return uniqueLabels;
  }, [dataRange, isThreshold, customColormap]);

  if (!dataRange) return null;

  return (
    <div className="flex items-center gap-2">
        <div className="relative" style={{ height: BAR_HEIGHT, width: BAR_WIDTH }}>
            <canvas
                ref={canvasRef}
                width={BAR_WIDTH}
                height={BAR_HEIGHT}
                className="rounded-sm border border-gray-600 absolute"
            />
        </div>
        <div className="relative h-full" style={{ height: BAR_HEIGHT, width: 60}}>
            {labels.map(({ value, y }) => (
                <div key={value} className="absolute w-full right-0" style={{ top: `${y}px`, transform: 'translateY(-50%)' }}>
                     <span className="block border-t border-gray-500 w-3 -mr-3 absolute right-full top-1/2"></span>
                     <span className="text-xs font-mono text-gray-300">{formatLabel(value)}</span>
                </div>
            ))}
            {units && <span className="absolute -bottom-4 right-1/2 translate-x-1/2 text-xs text-gray-400 mt-1">{units}</span>}
        </div>
    </div>
  );
};