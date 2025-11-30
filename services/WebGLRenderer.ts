/**
 * WebGLRenderer
 *
 * Main WebGL rendering engine for Lunagis.
 * Renders data/illumination/analysis layers using GPU acceleration.
 */

import type {
  DataLayer,
  IlluminationLayer,
  AnalysisLayer,
  ViewState,
  WebGLLayerHandle,
  WebGLMemoryStats,
} from '../types';
import { WebGLTextureManager } from './WebGLTextureManager';
import { WebGLColormapGenerator } from './WebGLColormapGenerator';

type RenderableLayer = DataLayer | IlluminationLayer | AnalysisLayer;

export class WebGLRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private textureManager: WebGLTextureManager;
  private colormapGenerator: WebGLColormapGenerator;
  private layers: Map<string, WebGLLayerHandle>;
  private quadBuffer: WebGLBuffer;
  private uniformLocations: Map<string, WebGLUniformLocation | null>;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize WebGL context
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('WebGL not supported by this browser');
    }

    this.gl = gl;
    this.canvas = canvas;
    this.layers = new Map();
    this.uniformLocations = new Map();

    // Bind event handlers
    this.handleContextLost = this.handleContextLost.bind(this);
    this.handleContextRestored = this.handleContextRestored.bind(this);

    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    // Initialize GL state
    this.initGL();

    console.log('✅ WebGLRenderer initialized');
  }

  /**
   * Initialize WebGL state (extensions, shaders, buffers)
   */
  private initGL(): void {
    // Enable required extensions
    this.enableExtensions();

    // Initialize managers
    this.textureManager = new WebGLTextureManager(this.gl);
    this.colormapGenerator = new WebGLColormapGenerator(this.gl);

    // Compile shaders and create program
    this.program = this.createShaderProgram();

    // Create geometry
    this.quadBuffer = this.createQuadGeometry();

    // Clear uniform cache as program has changed
    this.uniformLocations.clear();
  }

  /**
   * Handle WebGL context loss
   */
  private handleContextLost(event: Event): void {
    event.preventDefault();
    console.warn('⚠️ WebGL context lost. Attempting to restore...');
  }

  /**
   * Handle WebGL context restoration
   */
  private handleContextRestored(): void {
    console.log('♻️ WebGL context restored. Re-initializing...');
    try {
      this.initGL();

      // Clear layers as textures are lost
      this.layers.clear();

      console.log('✅ WebGL renderer restored. Layers cleared (application must re-add them).');
    } catch (error) {
      console.error('Failed to restore WebGL context:', error);
    }
  }

  /**
   * Enable required WebGL extensions
   */
  private enableExtensions(): void {
    const gl = this.gl;

    // CRITICAL: Float textures are required
    const floatExt = gl.getExtension('OES_texture_float');
    if (!floatExt) {
      throw new Error(
        'OES_texture_float extension not supported. ' +
        'WebGL float textures are required for data rendering.'
      );
    }

    // Optional but recommended: linear filtering for float textures
    const linearExt = gl.getExtension('OES_texture_float_linear');
    if (linearExt) {
      console.log('✅ OES_texture_float_linear enabled (smoother rendering)');
    }

    console.log('✅ WebGL extensions enabled');
  }

  /**
   * Create shader program
   */
  private createShaderProgram(): WebGLProgram {
    const vertexShaderSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;

      uniform vec2 u_viewOffset;
      uniform float u_viewScale;
      uniform mat3 u_layerTransform;

      void main() {
        // Apply layer-specific transform (for geospatial alignment)
        vec3 transformed = u_layerTransform * vec3(a_position, 1.0);

        // Apply view transform (pan & zoom)
        vec2 pos = (transformed.xy + u_viewOffset) * u_viewScale;

        gl_Position = vec4(pos, 0.0, 1.0);

        // Texture coordinates (0 to 1)
        v_texCoord = (a_position + 1.0) * 0.5;
      }
    `;

    const fragmentShaderSource = `
      precision highp float;

      varying vec2 v_texCoord;

      uniform sampler2D u_dataTexture;
      uniform sampler2D u_colormapTexture;
      uniform vec2 u_valueRange;
      uniform float u_opacity;
      uniform vec2 u_transparencyRange;
      uniform bool u_hasTransparency;
      
      uniform bool u_isBitPacked;
      uniform bool u_isUint8;
      uniform float u_originalWidth;

      void main() {
        float value;
        
        if (u_isBitPacked) {
            // Calculate pixel X coordinate in original image space
            float pixelX = v_texCoord.x * u_originalWidth;
            
            // Sample the packed byte
            // v_texCoord maps 0..1 to the PACKED texture width.
            // So texture2D samples the correct byte automatically.
            // We MUST use NEAREST filtering for this texture to avoid interpolation.
            
            float byteVal = floor(texture2D(u_dataTexture, v_texCoord).r * 255.0 + 0.5);
            float bitIndex = mod(floor(pixelX), 8.0);
            
            // Bit extraction: (byteVal >> bitIndex) & 1
            float divisor = pow(2.0, bitIndex);
            float val = floor(byteVal / divisor);
            value = mod(val, 2.0);
        } else {
            value = texture2D(u_dataTexture, v_texCoord).r;
            if (u_isUint8) {
                value = floor(value * 255.0 + 0.5);
            }
        }

        // Normalize value to [0, 1] range
        float normalized = clamp(
          (value - u_valueRange.x) / (u_valueRange.y - u_valueRange.x),
          0.0,
          1.0
        );

        // Lookup color from colormap texture
        vec4 color = texture2D(u_colormapTexture, vec2(normalized, 0.5));

        // Apply transparency thresholds
        if (u_hasTransparency) {
          if (value <= u_transparencyRange.x || value >= u_transparencyRange.y) {
            discard;  // Make pixel fully transparent
          }
        }

        // Apply layer opacity
        color.a *= u_opacity;

        gl_FragColor = color;
      }
    `;

    const vertexShader = this.compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);

    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('Failed to create shader program');
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      throw new Error(`Shader program failed to link: ${info}`);
    }

    console.log('✅ Shaders compiled and linked');
    return program;
  }

  /**
   * Compile a shader
   */
  private compileShader(source: string, type: number): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create shader');
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${info}`);
    }

    return shader;
  }

  /**
   * Create full-screen quad geometry
   */
  private createQuadGeometry(): WebGLBuffer {
    const vertices = new Float32Array([
      -1, -1,  // Bottom-left
      1, -1,  // Bottom-right
      -1, 1,  // Top-left
      1, 1,  // Top-right
    ]);

    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error('Failed to create vertex buffer');
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    return buffer;
  }

  /**
   * Get uniform location (cached)
   */
  private getUniformLocation(name: string): WebGLUniformLocation | null {
    if (!this.uniformLocations.has(name)) {
      const location = this.gl.getUniformLocation(this.program, name);
      this.uniformLocations.set(name, location);
    }
    return this.uniformLocations.get(name)!;
  }

  /**
   * Add a layer to the renderer
   */
  addLayer(layer: RenderableLayer, timeIndex: number = 0, onUpdate?: () => void): WebGLLayerHandle {
    const { dimensions, range, colormap, opacity } = layer;

    // Determine if bit-packed
    let isBitPacked = false;
    if (layer.type === 'illumination' && layer.metadata?.variableName) {
      isBitPacked = ['dte_visibility', 'night_flag'].includes(layer.metadata.variableName);
    }

    const textureWidth = isBitPacked ? Math.ceil(dimensions.width / 8) : dimensions.width;

    // Get data for current time index
    let data: Float32Array | Uint8Array | Int16Array | Uint32Array | null = null;
    let dataPromise: Promise<any> | null = null;

    if ('lazyDataset' in layer && layer.lazyDataset) {
      // Load from lazy dataset
      // getSlice always returns a Promise
      dataPromise = layer.lazyDataset.getSlice(timeIndex);
    } else {
      // Use in-memory dataset - flatten 2D array to 1D
      const slice2D = layer.dataset[timeIndex];
      data = new Float32Array(slice2D.flat());
    }

    // Create texture (initially empty if data is loading)
    const texture = this.textureManager.createTexture(
      textureWidth,
      dimensions.height,
      data
    );

    // If bit-packed, force NEAREST filtering
    if (isBitPacked) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

    // Get colormap texture
    const colormapTexture = this.colormapGenerator.getColormapTexture(
      colormap,
      layer.colormapInverted,
      layer.customColormap,
      undefined, // isThreshold - not used for WebGL
      layer.divergingThresholdConfig,
      [range.min, range.max]
    );

    // Build layer handle
    const handle: WebGLLayerHandle = {
      id: layer.id,
      texture,
      width: dimensions.width, // Store ORIGINAL width for shader
      height: dimensions.height,
      currentTimeIndex: timeIndex,
      valueRange: [range.min, range.max],
      colormapTexture,
      opacity: opacity ?? 1.0,
      transparencyLower: layer.transparencyLowerThreshold,
      transparencyUpper: layer.transparencyUpperThreshold,
    };

    // Determine if Uint8 (and not bit-packed)
    const isUint8 = !isBitPacked && (data instanceof Uint8Array);

    // Store flags on handle
    (handle as any).isBitPacked = isBitPacked;
    (handle as any).isUint8 = isUint8;

    // Add geospatial transform for illumination layers
    if (layer.type === 'illumination' && layer.geospatial) {
      handle.transform = {
        projectedBounds: layer.geospatial.projectedBounds,
        debugFlipX: layer.debugFlipX,
        debugFlipY: layer.debugFlipY,
      };
    }

    this.layers.set(layer.id, handle);

    // If data is loading, update texture when ready
    if (dataPromise) {
      dataPromise.then((resolvedData) => {
        // Verify layer still exists and time index hasn't changed
        const currentHandle = this.layers.get(layer.id);
        if (currentHandle && currentHandle.currentTimeIndex === timeIndex) {
          this.textureManager.updateTexture(
            currentHandle.texture,
            textureWidth,
            currentHandle.height,
            resolvedData
          );
          // Update isUint8 flag based on resolved data
          if (!isBitPacked) {
            (currentHandle as any).isUint8 = (resolvedData instanceof Uint8Array);
          }

          // Trigger callback
          if (onUpdate) onUpdate();
        }
      }).catch(err => {
        console.error(`Failed to load initial data for layer ${layer.id}:`, err);
      });
    }

    console.log(`✅ Added layer: ${layer.name} (${dimensions.width}×${dimensions.height})`);

    return handle;
  }

  /**
   * Update a layer's time index (and texture)
   */
  updateLayerTime(layerId: string, layer: RenderableLayer, timeIndex: number, onUpdate?: () => void): void {
    const handle = this.layers.get(layerId);
    if (!handle) {
      console.warn(`Layer ${layerId} not found in WebGL renderer`);
      return;
    }

    // Update time index immediately to track latest request
    handle.currentTimeIndex = timeIndex;

    // If layer has lazy dataset, load the new slice
    if ('lazyDataset' in layer && layer.lazyDataset) {
      // Check if data is already in cache (synchronous check if possible, but getSlice is async)
      // We'll just call getSlice, which handles caching.

      // Optimization: if we already have a pending promise for this time, we could reuse it.
      // For now, just request it.
      layer.lazyDataset.getSlice(timeIndex).then((data) => {
        // Check if we still need this time index (user might have scrolled past)
        const current = this.layers.get(layerId)?.currentTimeIndex;

        if (current === timeIndex) {
          const { dimensions } = layer;
          let isBitPacked = false;
          if (layer.type === 'illumination' && layer.metadata?.variableName) {
            isBitPacked = ['dte_visibility', 'night_flag'].includes(layer.metadata.variableName);
          }
          const textureWidth = isBitPacked ? Math.ceil(dimensions.width / 8) : dimensions.width;

          this.textureManager.updateTexture(handle.texture, textureWidth, handle.height, data);
          if (!isBitPacked) (handle as any).isUint8 = (data instanceof Uint8Array);
          console.log(`[WebGLRenderer] Texture updated for ${layerId} at time ${timeIndex}. Data sample:`, data.slice(0, 5));

          // Trigger callback to request re-render
          if (onUpdate) onUpdate();
        } else {
          console.warn(`[WebGLRenderer] Discarding stale slice for ${layerId} (loaded: ${timeIndex}, needed: ${current})`);
        }
      }).catch(error => {
        console.error(`[WebGLRenderer] Failed to load slice for ${layerId} at time ${timeIndex}:`, error);
      });
    } else {
      // Synchronous update for in-memory datasets
      const slice2D = layer.dataset[timeIndex];
      if (slice2D) {
        const data = new Float32Array(slice2D.flat());
        this.textureManager.updateTexture(handle.texture, handle.width, handle.height, data);
        if (onUpdate) onUpdate();
      }
    }
  }

  /**
   * Update layer opacity
   */
  updateLayerOpacity(layerId: string, opacity: number): void {
    const handle = this.layers.get(layerId);
    if (handle) {
      handle.opacity = opacity;
    }
  }

  /**
   * Update layer colormap
   */
  updateLayerColormap(
    layerId: string,
    layer: RenderableLayer
  ): void {
    const handle = this.layers.get(layerId);
    if (!handle) return;

    // Get new colormap texture
    const colormapTexture = this.colormapGenerator.getColormapTexture(
      layer.colormap,
      layer.colormapInverted,
      layer.customColormap,
      undefined, // isThreshold - not used for WebGL
      layer.divergingThresholdConfig,
      [layer.range.min, layer.range.max]
    );

    handle.colormapTexture = colormapTexture;
  }

  /**
   * Remove a layer
   */
  removeLayer(layerId: string): void {
    const handle = this.layers.get(layerId);
    if (!handle) return;

    this.textureManager.deleteTexture(handle.texture);
    this.layers.delete(layerId);
    console.log(`🗑️ Removed layer: ${layerId}`);
  }

  /**
   * Clear all layers
   */
  clearAllLayers(): void {
    this.layers.forEach((handle) => {
      this.textureManager.deleteTexture(handle.texture);
    });
    this.layers.clear();
    console.log('🗑️ Cleared all layers');
  }

  /**
   * Main render function
   */
  render(viewState: ViewState, layerOrder: string[]): void {
    const gl = this.gl;

    // Update canvas size if needed
    this.updateCanvasSize();

    // Clear canvas
    gl.clearColor(0, 0, 0, 0);  // Transparent background
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Use shader program
    gl.useProgram(this.program);

    // Bind quad geometry
    const positionLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Set view uniforms (same for all layers)
    const offsetLoc = this.getUniformLocation('u_viewOffset');
    const scaleLoc = this.getUniformLocation('u_viewScale');
    gl.uniform2f(offsetLoc, viewState.center[0], viewState.center[1]);
    gl.uniform1f(scaleLoc, viewState.scale);

    // Render each layer in order
    layerOrder.forEach((layerId) => {
      const handle = this.layers.get(layerId);
      if (handle) {
        this.renderLayer(handle);
      }
    });
  }

  /**
   * Render a single layer
   */
  private renderLayer(handle: WebGLLayerHandle): void {
    const gl = this.gl;

    // Bind data texture to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, handle.texture);
    gl.uniform1i(this.getUniformLocation('u_dataTexture'), 0);

    // Bind colormap texture to texture unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, handle.colormapTexture);
    gl.uniform1i(this.getUniformLocation('u_colormapTexture'), 1);

    // Set value range
    gl.uniform2f(
      this.getUniformLocation('u_valueRange'),
      handle.valueRange[0],
      handle.valueRange[1]
    );

    // Set opacity
    gl.uniform1f(this.getUniformLocation('u_opacity'), handle.opacity);

    // Set bit-packing uniforms
    const isBitPacked = (handle as any).isBitPacked || false;
    const isUint8 = (handle as any).isUint8 || false;
    gl.uniform1i(this.getUniformLocation('u_isBitPacked'), isBitPacked ? 1 : 0);
    gl.uniform1i(this.getUniformLocation('u_isUint8'), isUint8 ? 1 : 0);
    gl.uniform1f(this.getUniformLocation('u_originalWidth'), handle.width);

    // Set transparency thresholds
    const hasTransparency =
      handle.transparencyLower !== undefined ||
      handle.transparencyUpper !== undefined;

    gl.uniform1i(this.getUniformLocation('u_hasTransparency'), hasTransparency ? 1 : 0);

    if (hasTransparency) {
      const lower = handle.transparencyLower ?? -Infinity;
      const upper = handle.transparencyUpper ?? Infinity;
      gl.uniform2f(this.getUniformLocation('u_transparencyRange'), lower, upper);
    }

    // Set layer transform matrix
    const transform = handle.transform
      ? this.calculateLayerTransform(handle.transform)
      : [1, 0, 0, 0, 1, 0, 0, 0, 1]; // Identity matrix

    gl.uniformMatrix3fv(
      this.getUniformLocation('u_layerTransform'),
      false,
      new Float32Array(transform)
    );

    // Draw quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Calculate affine transform matrix for geospatial layers
   */
  private calculateLayerTransform(
    transform: NonNullable<WebGLLayerHandle['transform']>
  ): number[] {
    const { projectedBounds, debugFlipX, debugFlipY } = transform;
    const { xMin, xMax, yMin, yMax } = projectedBounds;

    // Calculate scale and offset to map layer to [-1, 1] NDC space
    const scaleX = 2.0 / (xMax - xMin) * (debugFlipX ? -1 : 1);
    const scaleY = 2.0 / (yMax - yMin) * (debugFlipY ? -1 : 1);
    const offsetX = -(xMin + xMax) / (xMax - xMin);
    const offsetY = -(yMin + yMax) / (yMax - yMin);

    // Return as column-major 3x3 matrix for WebGL
    return [
      scaleX, 0, 0,
      0, scaleY, 0,
      offsetX, offsetY, 1,
    ];
  }

  /**
   * Update canvas size to match display size
   */
  private updateCanvasSize(): void {
    const displayWidth = this.canvas.clientWidth;
    const displayHeight = this.canvas.clientHeight;

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.gl.viewport(0, 0, displayWidth, displayHeight);
    }
  }

  /**
   * Get memory and performance statistics
   */
  getMemoryStats(): WebGLMemoryStats {
    const textureMemoryMB = this.textureManager.getMemoryUsage();
    const layerCount = this.layers.size;
    const totalPixels = Array.from(this.layers.values()).reduce(
      (sum, handle) => sum + handle.width * handle.height,
      0
    );

    return {
      textureMemoryMB,
      layerCount,
      totalPixels,
    };
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    console.log('🗑️ Disposing WebGLRenderer...');

    // Delete all layer textures
    this.layers.forEach((handle) => {
      this.textureManager.deleteTexture(handle.texture);
    });
    this.layers.clear();

    // Dispose managers
    this.textureManager.dispose();
    this.colormapGenerator.dispose();

    // Delete WebGL resources
    this.gl.deleteProgram(this.program);
    this.gl.deleteBuffer(this.quadBuffer);

    this.uniformLocations.clear();

    // Remove event listeners
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    console.log('✅ WebGLRenderer disposed');
  }
}
