import * as d3 from 'd3-color';

/**
 * Fast hash function for custom colormap
 * Replaces expensive JSON.stringify for cache key generation
 */
export const hashColormap = (colormap: Array<{ value: number; color: string }> | undefined): string => {
    if (!colormap || colormap.length === 0) return '';
    return colormap.map(s => `${s.value}:${s.color}`).join('|');
};

/**
 * Create a pre-computed color lookup table
 * This replaces 1M+ d3.color() calls with 256 calls + fast array lookups
 * @param colorScale - D3 color scale function
 * @param colorDomain - [min, max] value range
 * @param steps - Number of lookup table entries (default 256)
 * @returns Uint8ClampedArray with RGBA values (4 bytes per color)
 */
export const createColorLookupTable = (
    colorScale: (value: number) => string,
    colorDomain: [number, number],
    steps: number = 256
): Uint8ClampedArray => {
    const table = new Uint8ClampedArray(steps * 4);
    const [minVal, maxVal] = colorDomain;
    const range = maxVal - minVal;

    for (let i = 0; i < steps; i++) {
        // Map lookup index to actual data value
        const value = minVal + (range * i) / (steps - 1);
        const color = d3.color(colorScale(value));

        if (color) {
            const rgb = color.rgb();
            const baseIdx = i * 4;
            table[baseIdx] = rgb.r;
            table[baseIdx + 1] = rgb.g;
            table[baseIdx + 2] = rgb.b;
            table[baseIdx + 3] = rgb.opacity * 255;
        }
    }

    return table;
};

/**
 * Calculate the Haversine distance between two geographic coordinates
 * @param coord1 - [lon, lat] in degrees
 * @param coord2 - [lon, lat] in degrees
 * @returns Distance in meters
 */
export const calculateGeoDistance = (coord1: [number, number], coord2: [number, number]): number => {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

/**
 * Draw a waypoint symbol on canvas
 * @param ctx - Canvas rendering context
 * @param symbol - Symbol type (from Lucide icon names)
 * @param x - X position
 * @param y - Y position
 * @param size - Size of the symbol
 */
export const drawWaypointSymbol = (ctx: CanvasRenderingContext2D, symbol: string, x: number, y: number, size: number) => {
    ctx.save();
    ctx.translate(x, y);

    const halfSize = size / 2;

    switch (symbol) {
        case 'drill':
            // Draw drill as triangle pointing down
            ctx.beginPath();
            ctx.moveTo(0, -halfSize);
            ctx.lineTo(halfSize, halfSize);
            ctx.lineTo(-halfSize, halfSize);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;

        case 'pause':
            // Draw pause as two vertical bars
            ctx.fillRect(-halfSize * 0.6, -halfSize, halfSize * 0.4, size);
            ctx.fillRect(halfSize * 0.2, -halfSize, halfSize * 0.4, size);
            break;

        case 'target':
            // Draw target as concentric circles
            ctx.beginPath();
            ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, halfSize * 0.6, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, halfSize * 0.2, 0, 2 * Math.PI);
            ctx.fill();
            break;

        case 'flag':
            // Draw flag as triangle on pole
            ctx.fillRect(-halfSize * 0.9, -halfSize, halfSize * 0.15, size * 1.5);
            ctx.beginPath();
            ctx.moveTo(-halfSize * 0.75, -halfSize);
            ctx.lineTo(halfSize * 0.5, -halfSize * 0.5);
            ctx.lineTo(-halfSize * 0.75, 0);
            ctx.closePath();
            ctx.fill();
            break;

        case 'satellite':
            // Draw satellite as square with antennas
            ctx.fillRect(-halfSize * 0.4, -halfSize * 0.4, size * 0.8, size * 0.8);
            ctx.strokeRect(-halfSize, -halfSize, halfSize * 0.3, halfSize * 0.3);
            ctx.strokeRect(halfSize * 0.7, halfSize * 0.7, halfSize * 0.3, halfSize * 0.3);
            break;

        case 'crosshair':
            // Draw crosshair as circle with cross
            ctx.beginPath();
            ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -halfSize);
            ctx.lineTo(0, halfSize);
            ctx.moveTo(-halfSize, 0);
            ctx.lineTo(halfSize, 0);
            ctx.stroke();
            break;

        case 'moon':
            // Draw moon as crescent
            ctx.beginPath();
            ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
            ctx.fill();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(halfSize * 0.3, -halfSize * 0.3, halfSize * 0.8, 0, 2 * Math.PI);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            break;

        case 'sunset':
            // Draw sunset as semi-circle with rays
            ctx.beginPath();
            ctx.arc(0, halfSize * 0.2, halfSize * 0.7, Math.PI, 0, true);
            ctx.closePath();
            ctx.fill();
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * i) / 7 + Math.PI;
                ctx.beginPath();
                ctx.moveTo(0, halfSize * 0.2);
                ctx.lineTo(Math.cos(angle) * halfSize * 1.2, halfSize * 0.2 + Math.sin(angle) * halfSize * 1.2);
                ctx.stroke();
            }
            break;

        case 'message':
            // Draw message as speech bubble
            ctx.beginPath();
            ctx.roundRect(-halfSize * 0.8, -halfSize * 0.6, size * 1.6, size * 1.0, halfSize * 0.2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-halfSize * 0.3, halfSize * 0.4);
            ctx.lineTo(-halfSize * 0.5, halfSize * 1.0);
            ctx.lineTo(0, halfSize * 0.4);
            ctx.closePath();
            ctx.fill();
            break;

        case 'binoculars':
            // Draw binoculars as two circles connected
            ctx.beginPath();
            ctx.arc(-halfSize * 0.4, 0, halfSize * 0.5, 0, 2 * Math.PI);
            ctx.arc(halfSize * 0.4, 0, halfSize * 0.5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-halfSize * 0.1, -halfSize * 0.3);
            ctx.lineTo(halfSize * 0.1, -halfSize * 0.3);
            ctx.stroke();
            break;

        default:
            // Default: draw simple circle
            ctx.beginPath();
            ctx.arc(0, 0, halfSize, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            break;
    }

    ctx.restore();
};
