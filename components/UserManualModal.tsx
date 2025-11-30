import React from 'react';

interface UserManualModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UserManualModal: React.FC<UserManualModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-700 flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-cyan-300">Lunagis User Manual</h2>
                        <p className="text-sm text-gray-400 mt-1">Temporal Data Visualization Platform</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-700 rounded"
                        aria-label="Close"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 text-gray-300">
                    <div className="space-y-6">
                        {/* Introduction */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Introduction
                            </h3>
                            <p className="text-sm leading-relaxed text-gray-400">
                                Lunagis is a powerful temporal data visualization platform designed for analyzing and exploring
                                geospatial and time-series data. It provides an intuitive interface for loading, visualizing,
                                and analyzing data across time dimensions with support for multiple data layers, custom artifacts,
                                events, and cell selection tools.
                            </p>
                        </section>

                        {/* Getting Started */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Getting Started
                            </h3>
                            <div className="space-y-3">
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Quick Start Guide</h4>
                                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400">
                                        <li><strong className="text-gray-300">Load Data:</strong> Click the "Layers" tool (or press <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">1</kbd>) and add a data layer using .npy files</li>
                                        <li><strong className="text-gray-300">Navigate Time:</strong> Use the time slider at the bottom to move through different time steps</li>
                                        <li><strong className="text-gray-300">Adjust View:</strong> Use mouse wheel to zoom, click and drag to pan the map</li>
                                        <li><strong className="text-gray-300">Configure Display:</strong> Click "Config" (or press <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs">5</kbd>) to adjust visualization settings</li>
                                    </ol>
                                </div>
                            </div>
                        </section>

                        {/* Main Tools */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                                Main Tools
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* Layers */}
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm flex items-center">
                                        <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs mr-2">1</kbd> Layers
                                    </h4>
                                    <p className="text-xs text-gray-400 mb-2">Manage data visualization layers including data layers, analysis layers, and image overlays.</p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Add/remove data layers (.npy files)</li>
                                        <li>Create analysis layers with boolean expressions</li>
                                        <li>Import image overlays (.png, .jpg) and base maps (.vrt)</li>
                                        <li>Adjust opacity and visibility</li>
                                        <li>Configure color scales and value ranges</li>
                                    </ul>
                                </div>

                                {/* Artifacts */}
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Artifacts</h4>
                                    <p className="text-xs text-gray-400 mb-2">Create and manage visual annotations on the map canvas.</p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Draw circles for point annotations</li>
                                        <li>Create rectangles for area selection</li>
                                        <li>Draw custom paths and polylines</li>
                                        <li>Customize colors and labels</li>
                                        <li>Delete or modify artifacts</li>
                                    </ul>
                                </div>

                                {/* Events */}
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Events</h4>
                                    <p className="text-xs text-gray-400 mb-2">Mark and track important temporal events on the timeline.</p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Add events at specific time points</li>
                                        <li>Assign custom names and colors</li>
                                        <li>View events on timeline and plots</li>
                                        <li>Navigate to event timestamps</li>
                                        <li>Events saved with session data</li>
                                    </ul>
                                </div>

                                {/* Measure */}
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm flex items-center">
                                        <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs mr-2">4</kbd> Measure
                                    </h4>
                                    <p className="text-xs text-gray-400 mb-2">Cell selection tools for data inspection.</p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Click cells to select/deselect</li>
                                        <li>Multi-cell selection mode</li>
                                        <li>Customize selection color</li>
                                        <li>Clear all selections</li>
                                        <li>View selected cell data in time series plot</li>
                                    </ul>
                                </div>

                                {/* Config */}
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm flex items-center">
                                        <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs mr-2">5</kbd> Config
                                    </h4>
                                    <p className="text-xs text-gray-400 mb-2">Session management and display configuration options.</p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Save/load session state to JSON</li>
                                        <li>Configure playback speed (1-30 FPS)</li>
                                        <li>Adjust display preferences</li>
                                        <li>Manage project settings</li>
                                        <li>Session includes layers, artifacts, and events</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* Keyboard Shortcuts */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                </svg>
                                Keyboard Shortcuts
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Tool Selection</h4>
                                    <ul className="space-y-1.5 text-sm">
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Layers Panel</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">1</kbd>
                                        </li>
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Pan Tool</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">2</kbd>
                                        </li>
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Zoom Tool</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">3</kbd>
                                        </li>
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Cell Select</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">4</kbd>
                                        </li>
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Multi-Cell Select</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">5</kbd>
                                        </li>
                                    </ul>
                                </div>

                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Time Navigation</h4>
                                    <ul className="space-y-1.5 text-sm">
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Play/Pause</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">Space</kbd>
                                        </li>
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Next Time Step</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">→</kbd>
                                        </li>
                                        <li className="flex items-center justify-between">
                                            <span className="text-gray-400">Previous Time Step</span>
                                            <kbd className="bg-gray-700 px-2 py-1 rounded text-xs font-mono">←</kbd>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* Data Layers */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                                </svg>
                                Working with Data Layers
                            </h3>
                            <div className="space-y-3">
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Loading Data</h4>
                                    <p className="text-xs text-gray-400 mb-2">
                                        Lunagis supports NumPy binary format (.npy) files for data layers. Data should be
                                        structured as 3D arrays with dimensions [time, height, width].
                                    </p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Click "Add Layer" in the Layers panel</li>
                                        <li>Select your .npy file from the file browser</li>
                                        <li>Configure layer name and visualization settings</li>
                                        <li>Layer will appear in the layer list with visibility toggle</li>
                                    </ul>
                                </div>

                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Analysis Layers</h4>
                                    <p className="text-xs text-gray-400 mb-2">
                                        Create derived layers using boolean and comparison expressions on existing data layers.
                                    </p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Comparison operators: &gt;, &gt;=, &lt;, &lt;=, ==</li>
                                        <li>Logical operators: AND, OR, NOT</li>
                                        <li>Reference layers by name in expressions</li>
                                        <li>Results shown as true/false (1/0) values</li>
                                        <li>Example: "layer1 &gt; 50 AND layer2 &lt; 100"</li>
                                    </ul>
                                </div>

                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Color Scale Configuration</h4>
                                    <p className="text-xs text-gray-400 mb-2">
                                        Customize how data values are mapped to colors for optimal visualization.
                                    </p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Choose from multiple color map presets (Viridis, Plasma, Inferno, Magma, Cividis, Turbo, Grayscale)</li>
                                        <li>Set custom min/max value ranges</li>
                                        <li>Create custom color scales with threshold mode</li>
                                        <li>Invert color maps</li>
                                        <li>Adjust opacity for layer blending</li>
                                    </ul>
                                </div>

                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Image Overlays</h4>
                                    <p className="text-xs text-gray-400 mb-2">
                                        Import georeferenced images and standalone image overlays.
                                    </p>
                                    <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                                        <li>Image layers: .png, .jpg files as standalone overlays</li>
                                        <li>Base map layers: .vrt files with .png for georeferenced images</li>
                                        <li>Adjust opacity and layer order</li>
                                        <li>Toggle visibility independently</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* Advanced Analysis Features */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                Advanced Analysis Features
                            </h3>
                            <div className="space-y-3">
                                <p className="text-xs text-gray-400">
                                    Lunagis includes specialized analysis tools for binary day/night data layers. These tools help analyze daylight patterns and forecast nightfall periods.
                                </p>

                                {/* Nightfall Forecast */}
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Nightfall Forecast</h4>
                                    <p className="text-xs text-gray-400 mb-3">
                                        Predicts the duration of upcoming nightfall periods across the entire time series.
                                        Available as a button on any data layer with binary day/night values (1=day, 0=night).
                                    </p>

                                    <div className="space-y-2">
                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">How It Works</h5>
                                            <p className="text-xs text-gray-500 mb-2">
                                                The algorithm uses a two-pass approach to detect and forecast nightfall periods:
                                            </p>
                                            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside pl-2">
                                                <li><strong className="text-gray-400">Pass 1:</strong> Scans the entire time series to identify all night periods (continuous sequences where value = 0)</li>
                                                <li><strong className="text-gray-400">Pass 2:</strong> For each timestep, assigns the duration of the relevant night period:
                                                    <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5">
                                                        <li><span className="text-cyan-400">During daytime</span> (value=1): Assigns <strong>positive</strong> duration (in hours) until the next nightfall begins</li>
                                                        <li><span className="text-purple-400">During nighttime</span> (value=0): Assigns <strong>negative</strong> duration (in hours) representing time elapsed into current nightfall</li>
                                                    </ul>
                                                </li>
                                            </ol>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Output Values</h5>
                                            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                                <li><strong className="text-green-400">Positive values:</strong> Hours until next nightfall (during day periods)</li>
                                                <li><strong className="text-red-400">Negative values:</strong> Hours into current nightfall (during night periods)</li>
                                                <li><strong className="text-gray-400">Zero:</strong> No more night periods ahead in the time series</li>
                                            </ul>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Visualization</h5>
                                            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                                <li>Creates a new time-varying analysis layer (3D: time × height × width)</li>
                                                <li>Default colormap uses custom color stops optimized for ±14 day ranges</li>
                                                <li>Cyan colors indicate nighttime periods, yellow shows transition points</li>
                                                <li>Results are cached for performance</li>
                                            </ul>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Use Cases</h5>
                                            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                                <li>Planning activities around daylight availability</li>
                                                <li>Identifying locations with extended night periods</li>
                                                <li>Analyzing polar day/night patterns</li>
                                                <li>Forecasting darkness duration for energy or agricultural applications</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                {/* Daylight Fraction */}
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-2 text-sm">Daylight Fraction</h4>
                                    <p className="text-xs text-gray-400 mb-3">
                                        Calculates the percentage of time each location experiences daylight over a selected time range.
                                        Available as a button on any data layer with binary day/night values (1=day, 0=night).
                                    </p>

                                    <div className="space-y-2">
                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Calculation Formula</h5>
                                            <div className="bg-gray-950/50 p-2 rounded border border-gray-800 font-mono text-xs text-cyan-300 my-2">
                                                Daylight Fraction (%) = (dayHours / totalHours) × 100
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                Where <code className="bg-gray-800 px-1 rounded">dayHours</code> is the count of timesteps with value=1 (daylight)
                                                and <code className="bg-gray-800 px-1 rounded">totalHours</code> is the total timesteps in the selected time range.
                                            </p>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">How It Works</h5>
                                            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside pl-2">
                                                <li>For each pixel location (x, y), scan through all timesteps in the current time range</li>
                                                <li>Count how many timesteps have value = 1 (daylight)</li>
                                                <li>Divide by total timesteps and multiply by 100 to get percentage</li>
                                                <li>Store result in a 2D output slice (no time dimension)</li>
                                            </ol>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Output Values</h5>
                                            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                                <li><strong className="text-gray-400">Range:</strong> 0% to 100%</li>
                                                <li><strong className="text-gray-400">0%:</strong> Location never experienced daylight during time range</li>
                                                <li><strong className="text-gray-400">100%:</strong> Location had continuous daylight during time range</li>
                                                <li><strong className="text-gray-400">50%:</strong> Equal amounts of day and night</li>
                                            </ul>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Hover Details</h5>
                                            <p className="text-xs text-gray-500 mb-1">
                                                When hovering over a Daylight Fraction layer, detailed statistics are calculated in real-time:
                                            </p>
                                            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                                <li>Overall daylight percentage</li>
                                                <li>Total daylight and night hours</li>
                                                <li>Number of day periods (continuous daylight sequences)</li>
                                                <li>Longest and shortest day periods (in hours)</li>
                                                <li>Number of night periods (continuous darkness sequences)</li>
                                                <li>Longest and shortest night periods (in hours)</li>
                                            </ul>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Visualization</h5>
                                            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                                <li>Creates a static 2D analysis layer (height × width only)</li>
                                                <li>Output is a single snapshot aggregating the selected time range</li>
                                                <li>Automatically recalculates when you change the time range</li>
                                                <li>Results are cached per time range for performance</li>
                                            </ul>
                                        </div>

                                        <div>
                                            <h5 className="font-semibold text-cyan-400 text-xs mb-1">Use Cases</h5>
                                            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                                <li>Analyzing daylight availability for solar energy potential</li>
                                                <li>Identifying optimal locations based on daylight requirements</li>
                                                <li>Comparing seasonal variations in daylight distribution</li>
                                                <li>Agricultural planning and crop selection based on light exposure</li>
                                                <li>Urban planning and building placement optimization</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                {/* Comparison Table */}
                                <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 p-4 rounded-lg border border-gray-700">
                                    <h4 className="font-semibold text-cyan-400 mb-3 text-sm">Quick Comparison</h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-gray-700">
                                                    <th className="text-left py-2 px-2 text-cyan-300">Feature</th>
                                                    <th className="text-left py-2 px-2 text-cyan-300">Nightfall Forecast</th>
                                                    <th className="text-left py-2 px-2 text-cyan-300">Daylight Fraction</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-gray-400">
                                                <tr className="border-b border-gray-800">
                                                    <td className="py-2 px-2 font-semibold">Output Type</td>
                                                    <td className="py-2 px-2">3D time-varying</td>
                                                    <td className="py-2 px-2">2D static slice</td>
                                                </tr>
                                                <tr className="border-b border-gray-800">
                                                    <td className="py-2 px-2 font-semibold">Values</td>
                                                    <td className="py-2 px-2">Hours (±)</td>
                                                    <td className="py-2 px-2">Percentage (0-100%)</td>
                                                </tr>
                                                <tr className="border-b border-gray-800">
                                                    <td className="py-2 px-2 font-semibold">Purpose</td>
                                                    <td className="py-2 px-2">Predict future nightfall</td>
                                                    <td className="py-2 px-2">Analyze daylight availability</td>
                                                </tr>
                                                <tr className="border-b border-gray-800">
                                                    <td className="py-2 px-2 font-semibold">Time Range</td>
                                                    <td className="py-2 px-2">Full time series</td>
                                                    <td className="py-2 px-2">Current selection</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2 px-2 font-semibold">Updates</td>
                                                    <td className="py-2 px-2">Static after creation</td>
                                                    <td className="py-2 px-2">Auto-updates with time range</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-700/50">
                                    <p className="text-xs text-blue-200">
                                        <strong>Note:</strong> Both analysis tools require source data layers with binary values where 1 represents daylight and 0 represents nightfall/darkness.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Time Navigation */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Time Navigation & Playback
                            </h3>
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                <p className="text-xs text-gray-400 mb-3">
                                    The time slider at the bottom of the screen allows you to navigate through temporal data.
                                </p>
                                <ul className="text-xs text-gray-500 space-y-1.5 list-disc list-inside">
                                    <li><strong className="text-gray-400">Manual Navigation:</strong> Click and drag the slider handle to move to any time step</li>
                                    <li><strong className="text-gray-400">Playback Mode:</strong> Press Space or click the play button to automatically advance through time</li>
                                    <li><strong className="text-gray-400">Step Navigation:</strong> Use arrow keys (← →) to move one step forward or backward</li>
                                    <li><strong className="text-gray-400">Playback Speed:</strong> Adjust speed in Config panel (1-30 FPS) for faster or slower playback</li>
                                    <li><strong className="text-gray-400">Auto-Loop:</strong> Playback automatically loops back to the beginning when reaching the end</li>
                                </ul>
                            </div>
                        </section>

                        {/* Session Management */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                                Session Management
                            </h3>
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                <p className="text-xs text-gray-400 mb-3">
                                    Save your entire workspace configuration including layers, artifacts, events, and settings
                                    to resume work later.
                                </p>
                                <div className="space-y-2">
                                    <div>
                                        <h5 className="font-semibold text-cyan-400 text-xs mb-1">Saving Sessions</h5>
                                        <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                            <li>Click "Save Session" in the Config panel</li>
                                            <li>Downloads a .json file with all session configuration</li>
                                            <li>Includes layer metadata, artifacts, events, and display settings</li>
                                            <li>Note: Data files (.npy) must be saved separately and re-imported</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-cyan-400 text-xs mb-1">Loading Sessions</h5>
                                        <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside pl-2">
                                            <li>Click "Load Session" in the Config panel</li>
                                            <li>Select the .json session file</li>
                                            <li>Provide referenced data files (.npy) when prompted</li>
                                            <li>All settings, artifacts, and events will be restored</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Tips & Best Practices */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                                Tips & Best Practices
                            </h3>
                            <div className="bg-gradient-to-br from-cyan-900/20 to-blue-900/20 p-4 rounded-lg border border-cyan-700/50">
                                <ul className="text-xs text-gray-300 space-y-2">
                                    <li className="flex items-start">
                                        <span className="text-cyan-400 mr-2">•</span>
                                        <span><strong>Performance:</strong> Large datasets may take time to load. Consider downsampling very large files for better performance.</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-cyan-400 mr-2">•</span>
                                        <span><strong>Layer Order:</strong> Layers are rendered in order. Adjust opacity to see multiple layers simultaneously.</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-cyan-400 mr-2">•</span>
                                        <span><strong>Color Scales:</strong> Experiment with different color maps to highlight features in your data.</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-cyan-400 mr-2">•</span>
                                        <span><strong>Events:</strong> Use events to mark important temporal milestones for easy navigation and reference.</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-cyan-400 mr-2">•</span>
                                        <span><strong>Artifacts:</strong> Create artifacts to highlight areas of interest or mark regions for analysis.</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-cyan-400 mr-2">•</span>
                                        <span><strong>Save Often:</strong> Save your session regularly to preserve your work. Remember to keep your data files organized.</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="text-cyan-400 mr-2">•</span>
                                        <span><strong>Cell Selection:</strong> Use the Measure tool to select cells and view their values over time in the time series plot.</span>
                                    </li>
                                </ul>
                            </div>
                        </section>

                        {/* Support */}
                        <section>
                            <h3 className="text-xl font-semibold text-cyan-300 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                Support & Resources
                            </h3>
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                <p className="text-xs text-gray-400 mb-2">
                                    For additional help, documentation, or to report issues, please refer to the project repository and documentation.
                                </p>
                                <p className="text-xs text-gray-500">
                                    Version: 1.0.0 | Built with React, TypeScript, and Vite
                                </p>
                            </div>
                        </section>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-700 flex justify-end gap-4 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-md text-sm font-semibold transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
