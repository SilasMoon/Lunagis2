// Fix: Removed invalid file header which was causing parsing errors.
import type { VrtData } from '../types';
import { MAX_RASTER_DIMENSION } from '../config/defaults';

/**
 * Parses an XML string from a .vrt file to extract georeferencing information.
 * @param xmlString The content of the .vrt file.
 * @returns A VrtData object.
 * @throws Error if parsing fails or data is invalid.
 */
export function parseVrt(xmlString: string): VrtData {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Invalid VRT input: expected non-empty string');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "application/xml");

  const errorNode = xmlDoc.querySelector("parsererror");
  if (errorNode) {
    throw new Error("XML parsing error: " + errorNode.textContent);
  }

  const vrtDataset = xmlDoc.querySelector('VRTDataset');
  if (!vrtDataset) {
      throw new Error("<VRTDataset> tag not found.");
  }

  const width = parseInt(vrtDataset.getAttribute('rasterXSize') || '0', 10);
  const height = parseInt(vrtDataset.getAttribute('rasterYSize') || '0', 10);

  // Validate dimensions
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid raster dimensions: ${width}x${height}. Dimensions must be positive.`);
  }
  if (width > MAX_RASTER_DIMENSION || height > MAX_RASTER_DIMENSION) {
    throw new Error(`Raster dimensions too large: ${width}x${height}. Maximum is ${MAX_RASTER_DIMENSION}.`);
  }

  const geoTransformStr = xmlDoc.querySelector('GeoTransform')?.textContent;
  if (!geoTransformStr) {
    throw new Error("<GeoTransform> tag not found.");
  }
  const geoTransform = geoTransformStr.split(',').map(s => Number(s.trim()));
  if (geoTransform.length !== 6) {
    throw new Error(`Invalid GeoTransform: expected 6 values, got ${geoTransform.length}.`);
  }
  if (geoTransform.some(v => !Number.isFinite(v))) {
    throw new Error("Invalid GeoTransform: contains non-numeric values.");
  }

  const srsStr = xmlDoc.querySelector('SRS')?.textContent;
  if (!srsStr) {
    throw new Error("<SRS> tag not found.");
  }

  return {
    geoTransform,
    srs: srsStr,
    width,
    height,
  };
}