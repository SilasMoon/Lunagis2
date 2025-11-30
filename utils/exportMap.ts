import { indexToDate } from './time';

interface ExportMapOptions {
  baseCanvas: HTMLCanvasElement | null;
  dataCanvas: HTMLCanvasElement | null;
  artifactCanvas: HTMLCanvasElement | null;
  graticuleCanvas: HTMLCanvasElement | null;
  selectionCanvas: HTMLCanvasElement | null;
  currentDateIndex: number | null;
  viewState: {
    center: [number, number];
    scale: number;
  };
  proj: proj4.ProjectionDefinition; // proj4 projection
  containerWidth: number;
  containerHeight: number;
}

/**
 * Calculate visible coordinate bounds based on view state
 */
function getVisibleBounds(
  viewState: { center: [number, number]; scale: number },
  containerWidth: number,
  containerHeight: number,
  proj: proj4.ProjectionDefinition
): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  const dpr = window.devicePixelRatio || 1;
  const halfWidth = containerWidth / 2;
  const halfHeight = containerHeight / 2;

  // Calculate corner positions in projected coordinates
  const topLeftProj: [number, number] = [
    viewState.center[0] - halfWidth / (viewState.scale * dpr),
    viewState.center[1] + halfHeight / (viewState.scale * dpr)
  ];
  const bottomRightProj: [number, number] = [
    viewState.center[0] + halfWidth / (viewState.scale * dpr),
    viewState.center[1] - halfHeight / (viewState.scale * dpr)
  ];

  // Convert to geographic coordinates
  try {
    const topLeft = proj.inverse(topLeftProj);
    const bottomRight = proj.inverse(bottomRightProj);

    return {
      minLon: topLeft[0],
      maxLon: bottomRight[0],
      minLat: bottomRight[1],
      maxLat: topLeft[1]
    };
  } catch (error) {
    // Fallback if projection fails
    return {
      minLon: 0,
      maxLon: 0,
      minLat: 0,
      maxLat: 0
    };
  }
}

/**
 * Export the current map view as an image with metadata overlay
 */
export function exportMapAsImage(options: ExportMapOptions): void {
  const {
    baseCanvas,
    dataCanvas,
    artifactCanvas,
    graticuleCanvas,
    selectionCanvas,
    currentDateIndex,
    viewState,
    proj,
    containerWidth,
    containerHeight
  } = options;

  // Create a temporary canvas to combine all layers
  const exportCanvas = document.createElement('canvas');
  const ctx = exportCanvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to get 2D context for export canvas');
    return;
  }

  // Set canvas size to match display
  exportCanvas.width = containerWidth;
  exportCanvas.height = containerHeight;

  // Fill with background color
  ctx.fillStyle = '#1a1a1a'; // Dark background
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  // Draw all layers in order (bottom to top)
  const canvases = [baseCanvas, dataCanvas, artifactCanvas, graticuleCanvas, selectionCanvas];

  for (const canvas of canvases) {
    if (canvas) {
      ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    }
  }

  // Add metadata overlay at top left
  const padding = 8;
  const lineHeight = 16;

  // Configure text style first (needed for measuring)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textBaseline = 'top';

  // Prepare text lines
  const textLines: string[] = [];

  // Add current time
  if (currentDateIndex !== null) {
    const currentDate = indexToDate(currentDateIndex);
    const timeString = currentDate.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    textLines.push(`Time: ${timeString}`);
  } else {
    textLines.push('Time: N/A');
  }

  // Add coordinate bounds
  const bounds = getVisibleBounds(viewState, containerWidth, containerHeight, proj);
  const lonRange = `Lon: ${bounds.minLon.toFixed(4)}° to ${bounds.maxLon.toFixed(4)}°`;
  const latRange = `Lat: ${bounds.minLat.toFixed(4)}° to ${bounds.maxLat.toFixed(4)}°`;
  textLines.push(lonRange);
  textLines.push(latRange);

  // Measure text to determine background size
  const maxTextWidth = Math.max(...textLines.map(line => ctx.measureText(line).width));
  const textBgWidth = maxTextWidth + padding * 2;
  const textBgHeight = lineHeight * textLines.length + padding * 2;

  // Draw semi-transparent background for text
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, textBgWidth, textBgHeight);

  // Draw text lines
  ctx.fillStyle = '#ffffff';
  let yOffset = padding;
  for (const line of textLines) {
    ctx.fillText(line, padding, yOffset);
    yOffset += lineHeight;
  }

  // Convert canvas to blob and trigger download
  exportCanvas.toBlob((blob) => {
    if (!blob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `lunagis-export-${timestamp}.png`;
    link.href = url;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);
  }, 'image/png');
}
