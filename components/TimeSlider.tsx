// Fix: Removed invalid file header which was causing parsing errors.
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { MARGIN } from './TimeSeriesPlot';
import { useLayerContext } from '../context/LayerContext';
import { useTimeContext } from '../context/TimeContext';
import { useArtifactContext } from '../context/ArtifactContext';
import { scaleUtc } from 'd3-scale';
import { utcFormat } from 'd3-time-format';
import { utcHour as d3utcHour, utcDay as d3utcDay, utcMonth as d3utcMonth } from 'd3-time';

export const TimeSlider: React.FC = () => {
  const { primaryDataLayer } = useLayerContext();
  const {
    timeRange,
    currentDateIndex,
    setCurrentDateIndex,
    handleManualTimeRangeChange,
    timeZoomDomain,
    getDateForIndex,
    getIndexForDate
  } = useTimeContext();
  const { events } = useArtifactContext();

  const isDataLoaded = !!primaryDataLayer;
  const maxTimeIndex = primaryDataLayer ? primaryDataLayer.dimensions.time - 1 : 0;

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | 'current' | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const xScale = useMemo(() => {
    if (width === 0 || !timeZoomDomain) return scaleUtc();
    return scaleUtc().domain(timeZoomDomain).range([MARGIN.left, width - MARGIN.right]);
  }, [timeZoomDomain, width]);

  const ticks = useMemo(() => {
    if (!isDataLoaded || width < 100 || !timeZoomDomain) return [];

    const [start, end] = timeZoomDomain;
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    let tickValues;
    let tickFormat;

    if (durationHours <= 48) { // Show hours
      tickValues = xScale.ticks(d3utcHour.every(3));
      tickFormat = utcFormat("%H:%M");
    } else if (durationHours <= 24 * 30) { // Show days
      tickValues = xScale.ticks(d3utcDay.every(1));
      tickFormat = utcFormat("%d");
    } else { // Show months
      tickValues = xScale.ticks(d3utcMonth.every(1));
      tickFormat = utcFormat("%b");
    }

    return tickValues.map(date => ({
      date,
      label: tickFormat(date),
      isMajor: date.getUTCHours() === 0 && date.getUTCMinutes() === 0, // Could be improved
    }));
  }, [width, timeZoomDomain, isDataLoaded, xScale]);

  const handleInteraction = useCallback((e: React.MouseEvent | MouseEvent, isDragStart: boolean = false) => {
    if (!isDataLoaded || !timeRange || currentDateIndex === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const newDate = xScale.invert(x);
    const newIndex = Math.max(0, Math.min(maxTimeIndex, getIndexForDate(newDate)));

    if (isDragStart) {
      const startPos = xScale(getDateForIndex(timeRange.start));
      const endPos = xScale(getDateForIndex(timeRange.end));
      const currentPos = xScale(getDateForIndex(currentDateIndex));
      const distToStart = Math.abs(x - startPos);
      const distToEnd = Math.abs(x - endPos);
      const distToCurrent = Math.abs(x - currentPos);

      const grabThreshold = 20;

      // Prioritize current cursor if it's closest or equal distance (handles overlapping case)
      if (distToCurrent < grabThreshold && distToCurrent <= distToStart && distToCurrent <= distToEnd) {
        setDraggingHandle('current');
      } else if (distToStart < distToEnd && distToStart < grabThreshold) {
        setDraggingHandle('start');
      } else if (distToEnd < grabThreshold) {
        setDraggingHandle('end');
      } else {
        // Default to closest handle
        const minDist = Math.min(distToStart, distToEnd, distToCurrent);
        if (minDist === distToCurrent) {
          setDraggingHandle('current');
        } else if (minDist === distToStart) {
          setDraggingHandle('start');
        } else {
          setDraggingHandle('end');
        }
      }
    } else if (draggingHandle) {
      // Throttle updates with requestAnimationFrame
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        if (draggingHandle === 'start') {
          handleManualTimeRangeChange({ ...timeRange, start: Math.min(newIndex, timeRange.end) });
        } else if (draggingHandle === 'end') {
          handleManualTimeRangeChange({ ...timeRange, end: Math.max(newIndex, timeRange.start) });
        } else if (draggingHandle === 'current') {
          setCurrentDateIndex(newIndex);
        }
        rafRef.current = null;
      });
    }
  }, [xScale, handleManualTimeRangeChange, setCurrentDateIndex, maxTimeIndex, isDataLoaded, timeRange, currentDateIndex, draggingHandle, getDateForIndex, getIndexForDate]);

  useEffect(() => {
    const handleMouseUp = () => {
      setDraggingHandle(null);
      // Cancel any pending RAF on mouse up
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingHandle) {
        handleInteraction(e, false);
      }
    };

    if (draggingHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Cleanup RAF on unmount
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [draggingHandle, handleInteraction]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDataLoaded || !timeRange || currentDateIndex === null) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newCurrent = Math.max(0, currentDateIndex - 1);
        if (newCurrent !== currentDateIndex) {
          setCurrentDateIndex(newCurrent);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newCurrent = Math.min(maxTimeIndex, currentDateIndex + 1);
        if (newCurrent !== currentDateIndex) {
          setCurrentDateIndex(newCurrent);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [isDataLoaded, timeRange, currentDateIndex, maxTimeIndex, setCurrentDateIndex]);

  const startX = timeRange ? xScale(getDateForIndex(timeRange.start)) : 0;
  const endX = timeRange ? xScale(getDateForIndex(timeRange.end)) : 0;
  const currentX = currentDateIndex !== null ? xScale(getDateForIndex(currentDateIndex)) : 0;

  return (
    <section className="bg-gray-800/70 backdrop-blur-sm border-t border-gray-700 w-full flex-shrink-0 z-40 h-[85px]">
      <div ref={containerRef} className="w-full h-full relative">
        <svg
          ref={svgRef}
          width={width}
          height={85}
          className={`absolute inset-0 ${isDataLoaded ? 'cursor-ew-resize' : 'opacity-50'}`}
          onMouseDown={(e) => handleInteraction(e, true)}>
          <line x1={MARGIN.left} y1={55} x2={width - MARGIN.right} y2={55} stroke="#4A5568" strokeWidth="2" />

          {isDataLoaded && ticks.map(({ date, label, isMajor }) => {
            const x = xScale(date);
            return (
              <g key={date.toISOString()}>
                <line x1={x} y1={isMajor ? 45 : 50} x2={x} y2={65} stroke={"#A0AEC0"} strokeWidth="1" />
                {label && (<text x={x} y={42} fill="#90CDF4" fontSize="10" textAnchor="middle">{label}</text>)}
              </g>
            )
          })}

          {isDataLoaded && events.filter(e => e.visible).map(event => {
            const eventDate = getDateForIndex(event.dateIndex);
            const eventX = xScale(eventDate);
            // Split event name into 2 lines of 12 characters each
            const line1 = event.name.substring(0, 12);
            const line2 = event.name.substring(12, 24);
            return (
              <g key={event.id}>
                <line x1={eventX} y1={30} x2={eventX} y2={75} stroke={event.color} strokeWidth="2" strokeDasharray="4,2" />
                <circle cx={eventX} cy={55} r="4" fill={event.color} stroke="#1A202C" strokeWidth="1.5" />
                <text
                  x={eventX}
                  y={12}
                  fill={event.color}
                  fontSize="10"
                  fontWeight="600"
                  textAnchor="middle"
                  className="pointer-events-none"
                >
                  {line1}
                </text>
                {line2 && (
                  <text
                    x={eventX}
                    y={24}
                    fill={event.color}
                    fontSize="10"
                    fontWeight="600"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {line2}
                  </text>
                )}
              </g>
            );
          })}

          {isDataLoaded && timeRange && width > 0 && (
            <g>
              <rect x={startX} y="51" width={endX - startX} height="8" fill="rgba(79, 209, 197, 0.5)" />
              <line x1={startX} y1={35} x2={startX} y2={75} stroke="#4FD1C5" strokeWidth="2" />
              <circle cx={startX} cy={55} r="6" fill="#4FD1C5" stroke="#1A202C" strokeWidth="2" />
              <line x1={endX} y1={35} x2={endX} y2={75} stroke="#4FD1C5" strokeWidth="2" />
              <circle cx={endX} cy={55} r="6" fill="#4FD1C5" stroke="#1A202C" strokeWidth="2" />
            </g>
          )}

          {isDataLoaded && currentDateIndex !== null && width > 0 && (
            <g>
              <line x1={currentX} y1={35} x2={currentX} y2={75} stroke="#EF4444" strokeWidth="2" />
              <circle cx={currentX} cy={55} r="6" fill="#EF4444" stroke="#1A202C" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>
    </section>
  );
};
