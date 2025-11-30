import React, { useState } from 'react';
import type { Event } from '../../types';
import { useArtifactContext } from '../../context/ArtifactContext';
import { useLayerContext } from '../../context/LayerContext';
import { useTimeContext } from '../../context/TimeContext';
import { Section } from './panelUtils';
import { generateSecureId } from '../../utils/crypto';

const formatDateToString = (date: Date): string => {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
    }).replace(',', '');
};

export const EventsPanel: React.FC = () => {
    const {
        events,
        activeEventId,
        setActiveEventId,
        onAddEvent,
        onUpdateEvent,
        onRemoveEvent
    } = useArtifactContext();

    const { primaryDataLayer } = useLayerContext();

    const {
        currentDateIndex,
        setCurrentDateIndex,
        timeRange,
        getDateForIndex
    } = useTimeContext();

    const [newEventName, setNewEventName] = useState('');
    const [newEventDescription, setNewEventDescription] = useState('');
    const [useCurrentDate, setUseCurrentDate] = useState(true);
    const [customDateIndex, setCustomDateIndex] = useState(0);

    const isDataLoaded = !!primaryDataLayer;
    const maxTimeIndex = primaryDataLayer ? primaryDataLayer.dimensions.time - 1 : 0;

    const handleAddEvent = () => {
        if (!newEventName.trim()) return;
        if (!isDataLoaded) return;

        const dateIndex = useCurrentDate
            ? (currentDateIndex ?? 0)
            : Math.max(0, Math.min(customDateIndex, maxTimeIndex));

        const newEvent: Event = {
            id: generateSecureId('event'),
            name: newEventName.trim(),
            description: newEventDescription.trim(),
            dateIndex,
            visible: true,
            color: '#FFA500',
        };

        onAddEvent(newEvent);
        setNewEventName('');
        setNewEventDescription('');
    };

    const handleJumpToEvent = (dateIndex: number) => {
        setCurrentDateIndex(dateIndex);
    };

    if (!isDataLoaded) {
        return (
            <div>
                <h2 className="text-base font-semibold text-cyan-300">Events</h2>
                <p className="text-xs text-gray-400 mt-2">Load a data layer to add events.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-base font-semibold text-cyan-300">Events</h2>
            <p className="text-xs text-gray-400">Add and manage temporal event markers on the timeline.</p>

            <Section title="Add New Event" defaultOpen={true}>
                <div className="space-y-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-300">Event Name:</span>
                        <input
                            type="text"
                            value={newEventName}
                            onChange={(e) => setNewEventName(e.target.value)}
                            placeholder="e.g., Launch Event"
                            maxLength={24}
                            className="bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm"
                        />
                        <span className="text-xs text-gray-500">{newEventName.length}/24 characters</span>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-300">Description:</span>
                        <textarea
                            value={newEventDescription}
                            onChange={(e) => setNewEventDescription(e.target.value)}
                            placeholder="Optional description"
                            rows={3}
                            className="bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm resize-none"
                        />
                    </label>

                    <div className="space-y-2">
                        <span className="text-xs text-gray-300">Date:</span>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                checked={useCurrentDate}
                                onChange={() => setUseCurrentDate(true)}
                                className="w-4 h-4"
                            />
                            <span className="text-gray-300">Use current date {currentDateIndex !== null && `(${formatDateToString(getDateForIndex(currentDateIndex))})`}</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="radio"
                                checked={!useCurrentDate}
                                onChange={() => setUseCurrentDate(false)}
                                className="w-4 h-4"
                            />
                            <span className="text-gray-300">Custom date</span>
                        </label>
                        {!useCurrentDate && (
                            <div className="ml-6 space-y-1">
                                <input
                                    type="number"
                                    min="0"
                                    max={maxTimeIndex}
                                    value={customDateIndex}
                                    onChange={(e) => setCustomDateIndex(parseInt(e.target.value) || 0)}
                                    className="bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm w-full"
                                />
                                <span className="text-xs text-gray-500">Index: {customDateIndex} / {maxTimeIndex} ({formatDateToString(getDateForIndex(customDateIndex))})</span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleAddEvent}
                        disabled={!newEventName.trim()}
                        className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 rounded-md text-sm transition-all"
                    >
                        Add Event
                    </button>
                </div>
            </Section>

            <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-300">Events List</h3>
                {events.length > 0 ? (
                    <div className="space-y-2">
                        {[...events].sort((a, b) => a.dateIndex - b.dateIndex).map(event => (
                            <div
                                key={event.id}
                                className={`p-3 rounded-md border transition-all cursor-pointer ${event.id === activeEventId
                                        ? 'bg-orange-900/30 border-orange-500'
                                        : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                                    }`}
                                onClick={() => setActiveEventId(event.id === activeEventId ? null : event.id)}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdateEvent(event.id, { visible: !event.visible });
                                                }}
                                                className="flex-shrink-0"
                                                title={event.visible ? 'Hide event' : 'Show event'}
                                            >
                                                {event.visible ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                                        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                                                    </svg>
                                                )}
                                            </button>
                                            <input
                                                type="color"
                                                value={event.color}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    onUpdateEvent(event.id, { color: e.target.value });
                                                }}
                                                className="w-6 h-6 rounded cursor-pointer"
                                                title="Change event color"
                                            />
                                            <span className="text-sm font-medium text-white truncate">{event.name}</span>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {formatDateToString(getDateForIndex(event.dateIndex))}
                                        </div>
                                        {event.description && (
                                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                {event.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleJumpToEvent(event.dateIndex);
                                            }}
                                            className="p-1 hover:bg-gray-600 rounded"
                                            title="Jump to event date"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-400" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Delete event "${event.name}"?`)) {
                                                    onRemoveEvent(event.id);
                                                }
                                            }}
                                            className="p-1 hover:bg-red-600 rounded"
                                            title="Delete event"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {event.id === activeEventId && (
                                    <div className="mt-3 pt-3 border-t border-gray-600 space-y-2 animate-fade-in">
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs text-gray-400">Edit Name:</span>
                                            <input
                                                type="text"
                                                value={event.name}
                                                onChange={(e) => onUpdateEvent(event.id, { name: e.target.value })}
                                                onClick={(e) => e.stopPropagation()}
                                                maxLength={24}
                                                className="bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm"
                                            />
                                            <span className="text-xs text-gray-500">{event.name.length}/24 characters</span>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs text-gray-400">Edit Description:</span>
                                            <textarea
                                                value={event.description}
                                                onChange={(e) => onUpdateEvent(event.id, { description: e.target.value })}
                                                onClick={(e) => e.stopPropagation()}
                                                rows={3}
                                                className="bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm resize-none"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs text-gray-400">Edit Date Index:</span>
                                            <input
                                                type="number"
                                                min="0"
                                                max={maxTimeIndex}
                                                value={event.dateIndex}
                                                onChange={(e) => onUpdateEvent(event.id, { dateIndex: parseInt(e.target.value) || 0 })}
                                                onClick={(e) => e.stopPropagation()}
                                                className="bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm"
                                            />
                                            <span className="text-xs text-gray-500">{formatDateToString(getDateForIndex(event.dateIndex))}</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-500 text-center p-4">No events created.</p>
                )}
            </div>
        </div>
    );
};
