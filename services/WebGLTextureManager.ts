/**
 * WebGLTextureManager
 *
 * Manages WebGL texture lifecycle for float data textures.
 * Handles creation, updates, deletion, and memory tracking.
 */

export class WebGLTextureManager {
  private gl: WebGLRenderingContext;
  private textures: Map<WebGLTexture, number>; // texture -> memory size in bytes

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.textures = new Map();
  }

  /**
   * Create a texture from TypedArray data
   *
   * @param width - Texture width in pixels
   * @param height - Texture height in pixels
   * @param data - Data array or null
   * @returns WebGLTexture handle
   */
  createTexture(width: number, height: number, data: Float32Array | Uint8Array | Int16Array | Uint32Array | null): WebGLTexture {
    const gl = this.gl;

    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    this.uploadData(width, height, data);

    // Check for WebGL errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      gl.deleteTexture(texture);
      throw new Error(`Failed to upload texture data: WebGL error ${error}`);
    }

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Track memory usage
    let bytesPerPixel = 4;
    if (data instanceof Uint8Array) bytesPerPixel = 1;
    // Int16 is converted to float for now, so 4 bytes on GPU? No, we upload as float.
    // If we used gl.SHORT, it would be 2. But we convert to float.

    const memoryBytes = width * height * bytesPerPixel;
    this.textures.set(texture, memoryBytes);

    console.log(`✅ Created texture: ${width}×${height}, ${(memoryBytes / 1024 / 1024).toFixed(2)} MB`);

    return texture;
  }

  /**
   * Update an existing texture with new data
   */
  updateTexture(texture: WebGLTexture, width: number, height: number, data: Float32Array | Uint8Array | Int16Array | Uint32Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.uploadData(width, height, data);

    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error(`Failed to update texture: WebGL error ${error}`);
    }
  }

  private uploadData(width: number, height: number, data: Float32Array | Uint8Array | Int16Array | Uint32Array | null) {
    const gl = this.gl;

    if (data === null) {
      // Allocate float by default if null
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.FLOAT, null);
      return;
    }

    if (data instanceof Float32Array) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.FLOAT, data);
    } else if (data instanceof Uint8Array) {
      // Handles both 8-bit illumination and Bit-Packed masks
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    } else if (data instanceof Int16Array) {
      // Convert to float for upload (WebGL 1.0 doesn't support LUMINANCE_INTEGER easily without extensions)
      // This is a temporary CPU-side conversion, but the cache still holds Int16, saving RAM.
      const floatData = new Float32Array(data);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.FLOAT, floatData);
    }
    else if (data instanceof Uint32Array) {
      // Should not happen with current logic (we use Uint8 for bitpacking), but just in case
      const floatData = new Float32Array(data);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.FLOAT, floatData);
    }
  }

  /**
   * Delete a texture and free GPU memory
   *
   * @param texture - Texture to delete
   */
  deleteTexture(texture: WebGLTexture): void {
    const memoryBytes = this.textures.get(texture);
    this.gl.deleteTexture(texture);
    this.textures.delete(texture);

    if (memoryBytes) {
      console.log(`🗑️ Deleted texture: ${(memoryBytes / 1024 / 1024).toFixed(2)} MB freed`);
    }
  }

  /**
   * Get total GPU memory usage for all managed textures
   *
   * @returns Memory usage in megabytes
   */
  getMemoryUsage(): number {
    let totalBytes = 0;
    this.textures.forEach((bytes) => {
      totalBytes += bytes;
    });
    return totalBytes / (1024 * 1024); // Return in MB
  }

  /**
   * Get number of textures currently managed
   *
   * @returns Texture count
   */
  getTextureCount(): number {
    return this.textures.size;
  }

  /**
   * Cleanup all textures
   */
  dispose(): void {
    this.textures.forEach((_, texture) => {
      this.gl.deleteTexture(texture);
    });
    this.textures.clear();
    console.log('🗑️ WebGLTextureManager disposed');
  }
}
