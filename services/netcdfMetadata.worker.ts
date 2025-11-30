import * as h5wasm from 'h5wasm';
import type { File as H5File } from 'h5wasm';

// Define the expected message format
interface WorkerMessage {
    file: File;
}

// Define the response format
export interface MetadataResponse {
    dimensions: {
        time: number;
        height: number;
        width: number;
    };
    estimatedSizeMB: number;
    error?: string;
}

let h5wasmReady: Promise<void> | null = null;

async function initH5Wasm() {
    if (!h5wasmReady) {
        h5wasmReady = h5wasm.ready.then(() => { });
    }
    return h5wasmReady;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const { file } = e.data;

    try {
        await initH5Wasm();

        // Mount the file using WORKERFS (Zero-copy)
        const mountPoint = '/work';
        try {
            h5wasm.FS.mkdir(mountPoint);
        } catch (e) {
            // Ignore if exists
        }

        h5wasm.FS.mount(h5wasm.FS.filesystems.WORKERFS, { files: [file] }, mountPoint);

        const filePath = `${mountPoint}/${file.name}`;
        const h5File = new h5wasm.File(filePath, 'r');

        // Extract dimensions
        const keys = h5File.keys();
        const possibleDataVars = ['illumination', 'solar_illumination', 'illumination_fraction', 'data'];
        let dataVarName: string | null = null;

        for (const varName of possibleDataVars) {
            if (keys.includes(varName)) {
                dataVarName = varName;
                break;
            }
        }

        if (!dataVarName) {
            for (const key of keys) {
                try {
                    const dataset = h5File.get(key) as any;
                    if (dataset && dataset.shape && dataset.shape.length === 3) {
                        dataVarName = key;
                        break;
                    }
                } catch (e) { }
            }
        }

        if (!dataVarName) {
            throw new Error('Could not find 3D data variable');
        }

        const dataset = h5File.get(dataVarName) as any;
        const [time, height, width] = dataset.shape;

        // Estimate size (assuming Float32 = 4 bytes, or check dtype)
        // We'll be conservative and assume 4 bytes if unknown, or check dtype if possible
        let bytesPerPixel = 4;
        if (dataset.dtype) {
            if (dataset.dtype.includes('int8') || dataset.dtype.includes('uint8')) bytesPerPixel = 1;
            else if (dataset.dtype.includes('int16') || dataset.dtype.includes('uint16')) bytesPerPixel = 2;
        }

        const totalBytes = time * height * width * bytesPerPixel;
        const estimatedSizeMB = totalBytes / (1024 * 1024);

        h5File.close();
        h5wasm.FS.unmount(mountPoint);

        const response: MetadataResponse = {
            dimensions: { time, height, width },
            estimatedSizeMB
        };

        self.postMessage(response);

    } catch (error) {
        const response: MetadataResponse = {
            dimensions: { time: 0, height: 0, width: 0 },
            estimatedSizeMB: 0,
            error: error instanceof Error ? error.message : String(error)
        };
        self.postMessage(response);
    }
};
