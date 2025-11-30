/**
 * DivergingThresholdEditor Component
 *
 * Editor for configuring diverging threshold colormaps.
 * Allows configuration of:
 * - Center value and color
 * - Upper gradient (center to upper threshold) with overflow color
 * - Lower gradient (lower threshold to center) with overflow color
 */

import React, { useState } from 'react';
import type { DivergingThresholdConfig } from '../types';
import { ColorPicker } from './ColorPicker';

interface DivergingThresholdEditorProps {
  config: DivergingThresholdConfig;
  onChange: (config: DivergingThresholdConfig) => void;
  layerRange: { min: number; max: number };
}

export const DivergingThresholdEditor: React.FC<DivergingThresholdEditorProps> = ({
  config,
  onChange,
  layerRange
}) => {
  const [expandedSection, setExpandedSection] = useState<'center' | 'upper' | 'lower' | null>('center');

  const handleChange = (updates: Partial<DivergingThresholdConfig>) => {
    onChange({ ...config, ...updates });
  };

  const toggleSection = (section: 'center' | 'upper' | 'lower') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="space-y-3 p-3 bg-gray-900/50 rounded-md border border-gray-700">
      <h4 className="text-sm font-medium text-gray-200">Diverging Threshold Configuration</h4>

      <div className="text-xs text-gray-400 bg-gray-800/50 p-2 rounded">
        <strong>Layer Range:</strong> [{layerRange.min.toFixed(2)}, {layerRange.max.toFixed(2)}]
      </div>

      {/* Center Section */}
      <div className="border border-gray-700 rounded-md overflow-hidden">
        <button
          onClick={() => toggleSection('center')}
          className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left flex items-center justify-between"
        >
          <span className="text-sm font-medium text-gray-200">Center Value</span>
          <svg
            className={`w-4 h-4 transition-transform ${expandedSection === 'center' ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSection === 'center' && (
          <div className="p-3 space-y-3 bg-gray-800/30">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Center Value</label>
              <input
                type="number"
                step="any"
                value={config.centerValue}
                onChange={(e) => handleChange({ centerValue: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Typically 0 for diverging scales (e.g., temperature anomaly)
              </p>
            </div>

            <ColorPicker
              label="Center Color"
              value={config.centerColor}
              onChange={(color) => handleChange({ centerColor: color })}
            />
          </div>
        )}
      </div>

      {/* Upper Section */}
      <div className="border border-gray-700 rounded-md overflow-hidden">
        <button
          onClick={() => toggleSection('upper')}
          className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left flex items-center justify-between"
        >
          <span className="text-sm font-medium text-gray-200">Upper Gradient (Positive)</span>
          <svg
            className={`w-4 h-4 transition-transform ${expandedSection === 'upper' ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSection === 'upper' && (
          <div className="p-3 space-y-3 bg-gray-800/30">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Upper Threshold</label>
              <input
                type="number"
                step="any"
                value={config.upperThreshold}
                onChange={(e) => handleChange({ upperThreshold: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Values from center to this threshold show gradient
              </p>
            </div>

            <ColorPicker
              label="Upper Gradient Color (at threshold)"
              value={config.upperColor}
              onChange={(color) => handleChange({ upperColor: color })}
            />

            <ColorPicker
              label="Upper Overflow Color (> threshold)"
              value={config.upperOverflowColor}
              onChange={(color) => handleChange({ upperOverflowColor: color })}
            />

            <div className="text-xs text-gray-400 bg-gray-900/50 p-2 rounded">
              <strong>Gradient:</strong> {config.centerColor} → {config.upperColor}<br />
              <strong>Overflow:</strong> Values &gt; {config.upperThreshold} = {config.upperOverflowColor}
            </div>
          </div>
        )}
      </div>

      {/* Lower Section */}
      <div className="border border-gray-700 rounded-md overflow-hidden">
        <button
          onClick={() => toggleSection('lower')}
          className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left flex items-center justify-between"
        >
          <span className="text-sm font-medium text-gray-200">Lower Gradient (Negative)</span>
          <svg
            className={`w-4 h-4 transition-transform ${expandedSection === 'lower' ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSection === 'lower' && (
          <div className="p-3 space-y-3 bg-gray-800/30">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Lower Threshold</label>
              <input
                type="number"
                step="any"
                value={config.lowerThreshold}
                onChange={(e) => handleChange({ lowerThreshold: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Values from this threshold to center show gradient
              </p>
            </div>

            <ColorPicker
              label="Lower Gradient Color (at threshold)"
              value={config.lowerColor}
              onChange={(color) => handleChange({ lowerColor: color })}
            />

            <ColorPicker
              label="Lower Overflow Color (< threshold)"
              value={config.lowerOverflowColor}
              onChange={(color) => handleChange({ lowerOverflowColor: color })}
            />

            <div className="text-xs text-gray-400 bg-gray-900/50 p-2 rounded">
              <strong>Gradient:</strong> {config.lowerColor} → {config.centerColor}<br />
              <strong>Overflow:</strong> Values &lt; {config.lowerThreshold} = {config.lowerOverflowColor}
            </div>
          </div>
        )}
      </div>

      {/* Example/Preview */}
      <div className="p-2 bg-gray-800/50 rounded text-xs space-y-1">
        <div className="font-medium text-gray-300">Example:</div>
        <div className="text-gray-400">
          • Value -250: <span className="font-mono">{config.lowerOverflowColor}</span> (overflow)
        </div>
        <div className="text-gray-400">
          • Value {config.lowerThreshold}: <span className="font-mono">{config.lowerColor}</span> (gradient start)
        </div>
        <div className="text-gray-400">
          • Value {config.centerValue}: <span className="font-mono">{config.centerColor}</span> (center)
        </div>
        <div className="text-gray-400">
          • Value {config.upperThreshold}: <span className="font-mono">{config.upperColor}</span> (gradient end)
        </div>
        <div className="text-gray-400">
          • Value 250: <span className="font-mono">{config.upperOverflowColor}</span> (overflow)
        </div>
      </div>

      {/* Quick Presets */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-400">Quick Presets</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onChange({
              centerValue: 0,
              centerColor: 'white',
              upperThreshold: 200,
              upperColor: 'orange',
              upperOverflowColor: 'red',
              lowerThreshold: -200,
              lowerColor: 'rgba(0, 0, 139, 1)',
              lowerOverflowColor: 'black'
            })}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs rounded"
          >
            Hot/Cold (Example)
          </button>
          <button
            onClick={() => onChange({
              centerValue: 0,
              centerColor: 'rgba(255, 255, 255, 0.5)',
              upperThreshold: 100,
              upperColor: 'rgba(255, 0, 0, 1)',
              upperOverflowColor: 'rgba(139, 0, 0, 1)',
              lowerThreshold: -100,
              lowerColor: 'rgba(0, 0, 255, 1)',
              lowerOverflowColor: 'rgba(0, 0, 139, 1)'
            })}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs rounded"
          >
            Red/Blue Diverging
          </button>
        </div>
      </div>
    </div>
  );
};
