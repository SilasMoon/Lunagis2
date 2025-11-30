// Fix: Removed invalid file header which was causing parsing errors.
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { select, Selection } from 'd3-selection';
import { scaleUtc, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { line } from 'd3-shape';
import type { TimeRange, TimeDomain, ColorStop, Layer } from '../types';
import { useLayerContext } from '../context/LayerContext';
import { useSelectionContext } from '../context/SelectionContext';
import { useTimeContext } from '../context/TimeContext';
import { useUIStateContext } from '../context/UIStateContext';
import { MAX_TIME_SERIES_POINTS } from '../config/defaults';

interface TimeSeriesPlotProps {
  yAxisUnit?: 'days';
  colormapThresholds?: ColorStop[];
}

export const MARGIN = { top: 10, right: 30, bottom: 20, left: 50 };

export const TimeSeriesPlot: React.FC<TimeSeriesPlotProps> = () => {
  const { primaryDataLayer, activeLayer } = useLayerContext();
  const { timeSeriesData } = useSelectionContext();
  const {
    timeRange,
    currentDateIndex,
    fullTimeDomain,
    timeZoomDomain,
    getDateForIndex,
    onZoomToSelection,
    onResetZoom
  } = useTimeContext();
  const { nightfallPlotYAxisRange } = useUIStateContext();

  const isDataLoaded = !!primaryDataLayer;
  const dataRange = timeSeriesData?.range ?? null;
  const yAxisUnit = activeLayer?.type === 'analysis' && activeLayer.analysisType === 'nightfall' ? 'days' : undefined;
  const yAxisRange = activeLayer?.type === 'analysis' && activeLayer.analysisType === 'nightfall' ? nightfallPlotYAxisRange : undefined;
  const colormapThresholds = (activeLayer?.type === 'analysis' || activeLayer?.type === 'data' || activeLayer?.type === 'dte_comms' || activeLayer?.type === 'lpf_comms' || activeLayer?.type === 'illumination') && activeLayer.colormap === 'Custom'
    ? activeLayer.customColormap
    : undefined;

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDims({ width, height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const innerWidth = dims.width - MARGIN.left - MARGIN.right;
  const innerHeight = dims.height - MARGIN.top - MARGIN.bottom;

  // Downsample data for performance - limit to MAX_TIME_SERIES_POINTS
  const dataWithDates = useMemo(() => {
    if (!timeSeriesData?.data) return [];
    const isDays = yAxisUnit === 'days';
    const data = timeSeriesData.data;
    const dataLength = data.length;

    // Calculate downsample factor based on data length and max points
    // Use Math.max with innerWidth to ensure good visual density
    const maxPoints = Math.min(MAX_TIME_SERIES_POINTS, Math.max(innerWidth, 100));
    const downsampleFactor = Math.ceil(dataLength / maxPoints);

    if (downsampleFactor <= 1) {
      // No downsampling needed
      return data.map((value, i) => {
        const date = getDateForIndex(i);
        const finalValue = isDays ? value / 24 : value;
        return { date, value: finalValue };
      });
    }

    // Downsample using min-max preservation to maintain visual peaks/valleys
    const result: Array<{ date: Date; value: number }> = [];

    for (let i = 0; i < dataLength; i += downsampleFactor) {
      const chunkEnd = Math.min(i + downsampleFactor, dataLength);
      let minVal = data[i];
      let maxVal = data[i];
      let minIdx = i;
      let maxIdx = i;

      // Find min and max in this chunk
      for (let j = i; j < chunkEnd; j++) {
        if (data[j] < minVal) {
          minVal = data[j];
          minIdx = j;
        }
        if (data[j] > maxVal) {
          maxVal = data[j];
          maxIdx = j;
        }
      }

      // Add points in chronological order to preserve shape
      if (minIdx < maxIdx) {
        result.push({
          date: getDateForIndex(minIdx),
          value: isDays ? minVal / 24 : minVal
        });
        if (minIdx !== maxIdx) {
          result.push({
            date: getDateForIndex(maxIdx),
            value: isDays ? maxVal / 24 : maxVal
          });
        }
      } else {
        result.push({
          date: getDateForIndex(maxIdx),
          value: isDays ? maxVal / 24 : maxVal
        });
        if (minIdx !== maxIdx) {
          result.push({
            date: getDateForIndex(minIdx),
            value: isDays ? minVal / 24 : minVal
          });
        }
      }
    }

    return result;
  }, [timeSeriesData, yAxisUnit, innerWidth, getDateForIndex]);

  useEffect(() => {
    if (!isDataLoaded || !timeSeriesData || !dataRange || !timeZoomDomain || innerWidth <= 0 || innerHeight <= 0) {
      const svg = select(svgRef.current) as Selection<SVGSVGElement, unknown, null, undefined>;
      svg.selectAll('*').remove();
      return;
    };

    const svg = select(svgRef.current) as Selection<SVGSVGElement, unknown, null, undefined>;
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`);

    const isDays = yAxisUnit === 'days';

    let yDomain: [number, number];
    if (yAxisRange) {
      yDomain = [yAxisRange.min, yAxisRange.max];
    } else {
      yDomain = isDays
        ? [dataRange.min / 24, dataRange.max / 24]
        : [dataRange.min, dataRange.max];
    }

    const xScale = scaleUtc().domain(timeZoomDomain).range([0, innerWidth]);
    const yScale = scaleLinear().domain(yDomain).range([innerHeight, 0]).nice();

    g.append('clipPath')
      .attr('id', 'clip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    if (timeRange) {
      const start = getDateForIndex(timeRange.start);
      const end = getDateForIndex(timeRange.end);

      g.append('rect')
        .attr('x', xScale(start))
        .attr('y', 0)
        .attr('width', xScale(end) - xScale(start))
        .attr('height', innerHeight)
        .attr('fill', 'rgba(79, 209, 197, 0.2)');
    }

    if (currentDateIndex !== null) {
      const currentDate = getDateForIndex(currentDateIndex);

      g.append('line')
        .attr('x1', xScale(currentDate))
        .attr('y1', 0)
        .attr('x2', xScale(currentDate))
        .attr('y2', innerHeight)
        .attr('stroke', '#EF4444')
        .attr('stroke-width', 2);
    }

    if (colormapThresholds) {
      const bands = [];
      for (let i = 0; i < colormapThresholds.length; i++) {
        const currentStop = colormapThresholds[i];
        const nextStop = colormapThresholds[i + 1];

        const convertValue = (val: number) => isDays ? val / 24 : val;

        const y0Value = convertValue(currentStop.value);
        const y1Value = nextStop ? convertValue(nextStop.value) : yDomain[1];

        const bandTopVal = Math.min(yDomain[1], y1Value);
        const bandBottomVal = Math.max(yDomain[0], y0Value);

        const y = yScale(bandTopVal);
        const height = yScale(bandBottomVal) - y;

        if (height > 0) {
          bands.push({
            y: y,
            height: height,
            color: currentStop.color,
          });
        }
      }

      g.append('g')
        .attr('class', 'threshold-bands')
        .attr('clip-path', 'url(#clip)')
        .selectAll('rect')
        .data(bands)
        .enter()
        .append('rect')
        .attr('x', 0)
        .attr('width', innerWidth)
        .attr('y', d => d.y)
        .attr('height', d => d.height)
        .attr('fill', d => d.color)
        .attr('opacity', 0.2);
    }

    const lineGenerator = line<{ date: Date; value: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value));

    const path = g.append('path') as Selection<SVGPathElement, unknown, null, undefined>;
    (path as any).datum(dataWithDates)
      .attr('clip-path', 'url(#clip)')
      .attr('fill', 'none')
      .attr('stroke', '#4FD1C5')
      .attr('stroke-width', 1.5)
      .attr('d', lineGenerator);

    const xAxis = axisBottom(xScale as any).ticks(innerWidth / 80).tickSizeOuter(0);
    const yAxis = axisLeft(yScale).ticks(innerHeight / 30).tickSize(-innerWidth)
      .tickFormat((d) => isDays ? `${(d as number).toFixed(1)} days` : d.toString());

    g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(xAxis)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick text')
        .attr('fill', '#90CDF4')
        .style('font-size', '10px'));

    g.append('g')
      .call(yAxis)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line')
        .attr('stroke-opacity', 0.1)
        .attr('stroke-dasharray', '2,2'))
      .call(g => g.selectAll('.tick text')
        .attr('x', -4)
        .attr('fill', '#90CDF4')
        .style('font-size', '10px'));

  }, [isDataLoaded, timeSeriesData, timeRange, currentDateIndex, dataRange, innerWidth, innerHeight, dataWithDates, timeZoomDomain, yAxisUnit, yAxisRange, colormapThresholds, getDateForIndex]);

  const isAtFullZoom = useMemo(() => (
    timeZoomDomain && fullTimeDomain &&
    timeZoomDomain[0].getTime() === fullTimeDomain[0].getTime() &&
    timeZoomDomain[1].getTime() === fullTimeDomain[1].getTime()
  ), [timeZoomDomain, fullTimeDomain]);

  const targetZoomDomain: TimeDomain | null = useMemo(() => {
    if (!timeRange || !fullTimeDomain) return null;
    if (timeRange.start === timeRange.end) {
      const centerDate = getDateForIndex(timeRange.start);
      const twelveHours = 12 * 60 * 60 * 1000;
      return [
        new Date(Math.max(fullTimeDomain[0].getTime(), centerDate.getTime() - twelveHours)),
        new Date(Math.min(fullTimeDomain[1].getTime(), centerDate.getTime() + twelveHours))
      ];
    } else {
      return [getDateForIndex(timeRange.start), getDateForIndex(timeRange.end)];
    }
  }, [timeRange, fullTimeDomain, getDateForIndex]);

  const isZoomedToSelection = useMemo(() => (
    timeZoomDomain && targetZoomDomain &&
    timeZoomDomain[0].getTime() === targetZoomDomain[0].getTime() &&
    timeZoomDomain[1].getTime() === targetZoomDomain[1].getTime()
  ), [timeZoomDomain, targetZoomDomain]);


  return (
    <section className="bg-gray-800/70 border-t border-gray-700 h-32 flex-shrink-0 relative group">
      {isDataLoaded && (
        <div className="absolute top-2 right-4 z-10 flex gap-2">
          <button
            onClick={onZoomToSelection}
            disabled={isZoomedToSelection}
            className="text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-cyan-300 px-2 py-1 rounded-md transition-colors shadow-md"
            title="Fit selected time range to view"
          >
            Zoom to Selection
          </button>
          <button
            onClick={onResetZoom}
            disabled={isAtFullZoom}
            className="text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-cyan-300 px-2 py-1 rounded-md transition-colors shadow-md"
            title="Reset zoom to full time range"
          >
            Reset Zoom
          </button>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full">
        {isDataLoaded && timeSeriesData ? (
          <svg ref={svgRef} width={dims.width} height={dims.height} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            {isDataLoaded ? "Hover over the map to see a time series plot" : "Load data to view plots"}
          </div>
        )}
      </div>
    </section>
  );
};
