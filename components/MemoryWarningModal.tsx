import React from 'react';

interface MemoryWarningModalProps {
    isOpen: boolean;
    onCancel: () => void;
    requiredMemoryMB: number;
    availableMemoryMB: number;
    fileName: string;
}

export const MemoryWarningModal: React.FC<MemoryWarningModalProps> = ({
    isOpen,
    onCancel,
    requiredMemoryMB,
    availableMemoryMB,
    fileName
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-w-md w-full p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-red-500 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Memory Limit Exceeded
                    </h2>
                </div>

                <div className="mb-6 space-y-4">
                    <p className="text-gray-300">
                        The file <span className="font-mono text-blue-400">{fileName}</span> is too large to load safely.
                    </p>

                    <div className="bg-gray-900 rounded p-4 space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Required Memory:</span>
                            <span className="font-mono text-red-400">{requiredMemoryMB.toFixed(0)} MB</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Available Cache:</span>
                            <span className="font-mono text-green-400">{availableMemoryMB.toFixed(0)} MB</span>
                        </div>
                    </div>

                    <p className="text-sm text-gray-400">
                        Loading this file would likely crash the browser. Please try a smaller file or a subset of the data.
                    </p>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                        Cancel Loading
                    </button>
                </div>
            </div>
        </div>
    );
};
