import React, { useState } from 'react';

export const ImportFilesModal: React.FC<{
    requiredFiles: string[];
    onCancel: () => void;
    onConfirm: (files: FileList) => void;
}> = ({ requiredFiles, onCancel, onConfirm }) => {
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-gray-200 border border-gray-700">
                <h2 className="text-xl font-bold text-cyan-300 mb-4">Restore Session</h2>
                <p className="text-sm text-gray-400 mb-2">To continue, please provide the following data file(s) from your original session:</p>
                <ul className="list-disc list-inside bg-gray-900/50 p-3 rounded-md mb-4 text-sm font-mono">
                    {requiredFiles.map(name => <li key={name}>{name}</li>)}
                </ul>
                <p className="text-sm text-gray-400 mb-4">Select all required files below.</p>
                <div>
                    <input
                        type="file"
                        multiple
                        accept=".npy,.png,.vrt,.nc"
                        onChange={(e) => setSelectedFiles(e.target.files)}
                        className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500"
                    />
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">Cancel</button>
                    <button
                        onClick={() => selectedFiles && onConfirm(selectedFiles)}
                        disabled={!selectedFiles || selectedFiles.length === 0}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-md text-sm font-semibold"
                    >
                        Load Session
                    </button>
                </div>
            </div>
        </div>
    );
};
