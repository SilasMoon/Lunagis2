/**
 * ColorPicker Component
 *
 * Color picker with alpha/transparency support.
 * Supports rgba() format for transparent colors.
 */

import React, { useState, useEffect } from 'react';
import { color as d3Color } from 'd3-color';

interface ColorPickerProps {
  value: string; // Color in any CSS format (hex, rgb, rgba, named)
  onChange: (color: string) => void;
  label?: string;
  className?: string;
}

/**
 * Parse a CSS color string to RGBA components
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  // Try using d3-color
  const colorObj = d3Color(color);
  if (colorObj) {
    const rgb = colorObj.rgb();
    return {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      a: rgb.opacity
    };
  }

  // Fallback: manual parsing for rgba format
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
    };
  }

  // Fallback: hex format
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16),
      a: 1
    };
  }

  // Default fallback
  return { r: 255, g: 255, b: 255, a: 1 };
}

/**
 * Convert RGBA components to CSS rgba string
 */
function rgbaToString(r: number, g: number, b: number, a: number): string {
  if (a === 1) {
    // Return hex format if fully opaque
    const hex = '#' + [r, g, b].map(v => {
      const hex = Math.round(v).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    return hex;
  } else {
    // Return rgba format if transparent
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(2)})`;
  }
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label, className = '' }) => {
  const [rgba, setRgba] = useState(() => parseColor(value));
  const [hexInput, setHexInput] = useState('');

  // Update local state when prop changes
  useEffect(() => {
    const parsed = parseColor(value);
    setRgba(parsed);

    // Update hex input
    const hex = '#' + [parsed.r, parsed.g, parsed.b].map(v => {
      const hex = Math.round(v).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    setHexInput(hex);
  }, [value]);

  const handleRgbaChange = (component: 'r' | 'g' | 'b' | 'a', newValue: number) => {
    const updated = { ...rgba, [component]: newValue };
    setRgba(updated);
    onChange(rgbaToString(updated.r, updated.g, updated.b, updated.a));
  };

  const handleHexChange = (hex: string) => {
    setHexInput(hex);

    // Try to parse hex
    const match = hex.match(/^#?([0-9a-f]{6})$/i);
    if (match) {
      const hexValue = match[1];
      const r = parseInt(hexValue.substr(0, 2), 16);
      const g = parseInt(hexValue.substr(2, 2), 16);
      const b = parseInt(hexValue.substr(4, 2), 16);

      const updated = { ...rgba, r, g, b };
      setRgba(updated);
      onChange(rgbaToString(updated.r, updated.g, updated.b, updated.a));
    }
  };

  const previewStyle: React.CSSProperties = {
    backgroundColor: rgbaToString(rgba.r, rgba.g, rgba.b, rgba.a),
    backgroundImage: rgba.a < 1 ?
      'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' :
      'none',
    backgroundSize: rgba.a < 1 ? '10px 10px' : 'auto',
    backgroundPosition: rgba.a < 1 ? '0 0, 0 5px, 5px -5px, -5px 0px' : '0 0'
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="block text-xs font-medium text-gray-400">{label}</label>}

      {/* Color preview */}
      <div
        className="w-full h-10 rounded border border-gray-600 cursor-pointer"
        style={previewStyle}
        title={rgbaToString(rgba.r, rgba.g, rgba.b, rgba.a)}
      />

      {/* Hex input */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Hex</label>
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          placeholder="#ffffff"
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 font-mono"
        />
      </div>

      {/* RGB sliders */}
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-400">Red</label>
            <span className="text-xs text-gray-300 font-mono">{Math.round(rgba.r)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={rgba.r}
            onChange={(e) => handleRgbaChange('r', parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-400">Green</label>
            <span className="text-xs text-gray-300 font-mono">{Math.round(rgba.g)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={rgba.g}
            onChange={(e) => handleRgbaChange('g', parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-400">Blue</label>
            <span className="text-xs text-gray-300 font-mono">{Math.round(rgba.b)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            value={rgba.b}
            onChange={(e) => handleRgbaChange('b', parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-400">Alpha (Opacity)</label>
            <span className="text-xs text-gray-300 font-mono">{rgba.a.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={rgba.a}
            onChange={(e) => handleRgbaChange('a', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-400"
          />
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => onChange('rgba(255, 255, 255, 1)')}
          className="w-6 h-6 rounded border border-gray-600 bg-white"
          title="White"
        />
        <button
          onClick={() => onChange('rgba(0, 0, 0, 1)')}
          className="w-6 h-6 rounded border border-gray-600 bg-black"
          title="Black"
        />
        <button
          onClick={() => onChange('rgba(255, 0, 0, 1)')}
          className="w-6 h-6 rounded border border-gray-600 bg-red-500"
          title="Red"
        />
        <button
          onClick={() => onChange('rgba(255, 165, 0, 1)')}
          className="w-6 h-6 rounded border border-gray-600 bg-orange-500"
          title="Orange"
        />
        <button
          onClick={() => onChange('rgba(0, 0, 255, 1)')}
          className="w-6 h-6 rounded border border-gray-600 bg-blue-700"
          title="Dark Blue"
        />
        <button
          onClick={() => onChange('rgba(0, 0, 0, 0)')}
          className="w-6 h-6 rounded border border-gray-600"
          style={{
            backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
            backgroundSize: '10px 10px',
            backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
          }}
          title="Transparent"
        />
      </div>
    </div>
  );
};
