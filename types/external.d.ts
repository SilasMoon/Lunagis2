/**
 * Type declarations for external libraries loaded via CDN
 * These provide type safety for d3 and proj4
 */

// D3.js type declarations
declare namespace d3 {
  // Scale types
  export function scaleSequential<Range = number>(
    interpolator?: (t: number) => Range
  ): ScaleSequential<Range>;

  export function scaleLinear<Range = number, Output = Range>(): ScaleLinear<Range, Output>;

  export function scaleTime<Range = number, Output = Range>(): ScaleTime<Range, Output>;

  export function scaleBand<Domain extends { toString(): string } = string>(): ScaleBand<Domain>;

  export interface ScaleSequential<Range> {
    (value: number): Range;
    domain(): [number, number];
    domain(domain: [number, number]): this;
    range(): [Range, Range];
    interpolator(): (t: number) => Range;
    interpolator(interpolator: (t: number) => Range): this;
    copy(): ScaleSequential<Range>;
  }

  export interface ScaleLinear<Range, Output> {
    (value: number): Output;
    domain(): number[];
    domain(domain: Iterable<number>): this;
    range(): Range[];
    range(range: Iterable<Range>): this;
    nice(count?: number): this;
    ticks(count?: number): number[];
    tickFormat(count?: number, specifier?: string): (d: number) => string;
    copy(): ScaleLinear<Range, Output>;
  }

  export interface ScaleTime<Range, Output> {
    (value: Date | number): Output;
    domain(): [Date, Date];
    domain(domain: Iterable<Date | number>): this;
    range(): Range[];
    range(range: Iterable<Range>): this;
    nice(interval?: TimeInterval | number): this;
    ticks(count?: number): Date[];
    tickFormat(count?: number, specifier?: string): (d: Date) => string;
    copy(): ScaleTime<Range, Output>;
    invert(value: number): Date;
  }

  export interface ScaleBand<Domain> {
    (value: Domain): number | undefined;
    domain(): Domain[];
    domain(domain: Iterable<Domain>): this;
    range(): [number, number];
    range(range: Iterable<number>): this;
    rangeRound(range: Iterable<number>): this;
    bandwidth(): number;
    step(): number;
    padding(): number;
    padding(padding: number): this;
    paddingInner(): number;
    paddingInner(padding: number): this;
    paddingOuter(): number;
    paddingOuter(padding: number): this;
    align(): number;
    align(align: number): this;
    copy(): ScaleBand<Domain>;
  }

  export interface TimeInterval {
    floor(date: Date): Date;
    round(date: Date): Date;
    ceil(date: Date): Date;
    offset(date: Date, step?: number): Date;
    range(start: Date, stop: Date, step?: number): Date[];
    filter(test: (date: Date) => boolean): TimeInterval;
    count(start: Date, end: Date): number;
    every(step: number): TimeInterval | null;
  }

  // Color interpolators
  export function interpolateViridis(t: number): string;
  export function interpolatePlasma(t: number): string;
  export function interpolateInferno(t: number): string;
  export function interpolateMagma(t: number): string;
  export function interpolateCividis(t: number): string;
  export function interpolateTurbo(t: number): string;
  export function interpolateGreys(t: number): string;
  export function interpolateRgbBasis(colors: readonly string[]): (t: number) => string;

  // Color utilities
  export function color(specifier: string): RGBColor | null;
  export function rgb(r: number, g: number, b: number): RGBColor;
  export function rgb(specifier: string): RGBColor;

  export interface RGBColor {
    r: number;
    g: number;
    b: number;
    opacity: number;
    brighter(k?: number): this;
    darker(k?: number): this;
    displayable(): boolean;
    formatHex(): string;
    formatRgb(): string;
    toString(): string;
  }

  // Selection types
  export function select<GElement extends Element, Datum>(
    selector: string | GElement
  ): Selection<GElement, Datum, null, undefined>;

  export function selectAll<GElement extends Element, Datum>(
    selector: string | NodeListOf<GElement> | GElement[]
  ): Selection<GElement, Datum, null, undefined>;

  export interface Selection<GElement extends Element, Datum, PElement extends Element | null, PDatum> {
    select<DescElement extends Element>(selector: string): Selection<DescElement, Datum, PElement, PDatum>;
    selectAll<DescElement extends Element, NewDatum>(selector: string): Selection<DescElement, NewDatum, GElement, Datum>;
    attr(name: string): string;
    attr(name: string, value: null | string | number | boolean | ((d: Datum, i: number, g: GElement[] | ArrayLike<GElement>) => string | number | boolean | null)): this;
    style(name: string): string;
    style(name: string, value: null | string | number | boolean | ((d: Datum, i: number, g: GElement[] | ArrayLike<GElement>) => string | number | boolean | null), priority?: 'important' | null): this;
    text(): string;
    text(value: null | string | number | boolean | ((d: Datum, i: number, g: GElement[] | ArrayLike<GElement>) => string | number | boolean)): this;
    html(): string;
    html(value: null | string | ((d: Datum, i: number, g: GElement[] | ArrayLike<GElement>) => string | null)): this;
    append<ChildElement extends Element>(type: string): Selection<ChildElement, Datum, PElement, PDatum>;
    remove(): this;
    data<NewDatum>(data: NewDatum[] | Iterable<NewDatum>): Selection<GElement, NewDatum, PElement, PDatum>;
    enter(): Selection<GElement, Datum, PElement, PDatum>;
    exit(): Selection<GElement, Datum, PElement, PDatum>;
    call<Args extends unknown[]>(func: (selection: this, ...args: Args) => void, ...args: Args): this;
    on(type: string, listener: null | ((event: Event, d: Datum) => void)): this;
    transition(name?: string): Transition<GElement, Datum, PElement, PDatum>;
    node(): GElement | null;
    nodes(): GElement[];
    empty(): boolean;
    size(): number;
  }

  export interface Transition<GElement extends Element, Datum, PElement extends Element | null, PDatum> {
    attr(name: string, value: null | string | number | boolean | ((d: Datum, i: number, g: GElement[] | ArrayLike<GElement>) => string | number | boolean | null)): this;
    style(name: string, value: null | string | number | boolean | ((d: Datum, i: number, g: GElement[] | ArrayLike<GElement>) => string | number | boolean | null), priority?: 'important' | null): this;
    duration(ms: number): this;
    delay(ms: number | ((d: Datum, i: number, g: GElement[] | ArrayLike<GElement>) => number)): this;
    ease(func: (normalizedTime: number) => number): this;
    on(type: string, listener: null | ((d: Datum) => void)): this;
  }

  // Axis types
  export function axisBottom<Domain>(scale: ScaleTime<number, number> | ScaleLinear<number, number>): Axis<Domain>;
  export function axisLeft<Domain>(scale: ScaleLinear<number, number>): Axis<Domain>;
  export function axisRight<Domain>(scale: ScaleLinear<number, number>): Axis<Domain>;
  export function axisTop<Domain>(scale: ScaleLinear<number, number>): Axis<Domain>;

  export interface Axis<Domain> {
    (context: Selection<SVGGElement, unknown, null, undefined>): void;
    scale(): ScaleLinear<number, number> | ScaleTime<number, number>;
    scale(scale: ScaleLinear<number, number> | ScaleTime<number, number>): this;
    ticks(count?: number): this;
    tickValues(values: Iterable<Domain> | null): this;
    tickFormat(format: null | ((d: Domain) => string)): this;
    tickSize(size: number): this;
    tickSizeInner(size: number): this;
    tickSizeOuter(size: number): this;
    tickPadding(padding: number): this;
  }

  // Line generator
  export function line<Datum = [number, number]>(): Line<Datum>;

  export interface Line<Datum> {
    (data: Iterable<Datum>): string | null;
    x(): (d: Datum, i: number, data: Datum[]) => number;
    x(x: number | ((d: Datum, i: number, data: Datum[]) => number)): this;
    y(): (d: Datum, i: number, data: Datum[]) => number;
    y(y: number | ((d: Datum, i: number, data: Datum[]) => number)): this;
    defined(): (d: Datum, i: number, data: Datum[]) => boolean;
    defined(defined: boolean | ((d: Datum, i: number, data: Datum[]) => boolean)): this;
    curve(curve: CurveFactory): this;
    context(context: CanvasRenderingContext2D | null): this;
  }

  export interface CurveFactory {
    (context: CanvasRenderingContext2D): CurveGenerator;
  }

  export interface CurveGenerator {
    lineStart(): void;
    lineEnd(): void;
    point(x: number, y: number): void;
  }

  export const curveLinear: CurveFactory;
  export const curveBasis: CurveFactory;
  export const curveCardinal: CurveFactory;

  // Zoom
  export function zoom<ZoomRefElement extends Element, Datum>(): ZoomBehavior<ZoomRefElement, Datum>;
  export function zoomIdentity: ZoomTransform;

  export interface ZoomBehavior<ZoomRefElement extends Element, Datum> {
    (selection: Selection<ZoomRefElement, Datum, Element | null, unknown>): void;
    transform(selection: Selection<ZoomRefElement, Datum, Element | null, unknown>, transform: ZoomTransform): void;
    translateBy(selection: Selection<ZoomRefElement, Datum, Element | null, unknown>, x: number, y: number): void;
    scaleBy(selection: Selection<ZoomRefElement, Datum, Element | null, unknown>, k: number): void;
    scaleTo(selection: Selection<ZoomRefElement, Datum, Element | null, unknown>, k: number): void;
    filter(filter: (event: Event, d: Datum) => boolean): this;
    extent(extent: [[number, number], [number, number]] | ((d: Datum, i: number, group: ZoomRefElement[]) => [[number, number], [number, number]])): this;
    scaleExtent(extent: [number, number]): this;
    translateExtent(extent: [[number, number], [number, number]]): this;
    on(typenames: string, listener: null | ((event: D3ZoomEvent<ZoomRefElement, Datum>, d: Datum) => void)): this;
  }

  export interface ZoomTransform {
    readonly x: number;
    readonly y: number;
    readonly k: number;
    apply(point: [number, number]): [number, number];
    applyX(x: number): number;
    applyY(y: number): number;
    invert(point: [number, number]): [number, number];
    invertX(x: number): number;
    invertY(y: number): number;
    rescaleX<S extends ScaleLinear<number, number>>(xScale: S): S;
    rescaleY<S extends ScaleLinear<number, number>>(yScale: S): S;
    scale(k: number): ZoomTransform;
    translate(x: number, y: number): ZoomTransform;
    toString(): string;
  }

  export interface D3ZoomEvent<ZoomRefElement extends Element, Datum> {
    target: ZoomBehavior<ZoomRefElement, Datum>;
    type: 'start' | 'zoom' | 'end';
    transform: ZoomTransform;
    sourceEvent: Event;
  }

  // Drag
  export function drag<GElement extends Element, Datum>(): DragBehavior<GElement, Datum, Datum | SubjectPosition>;

  export interface SubjectPosition {
    x: number;
    y: number;
  }

  export interface DragBehavior<GElement extends Element, Datum, Subject> {
    (selection: Selection<GElement, Datum, Element | null, unknown>): void;
    container(container: GElement | ((d: Datum, i: number, group: GElement[]) => GElement)): this;
    filter(filter: (event: Event, d: Datum) => boolean): this;
    subject(subject: (event: Event, d: Datum) => Subject): this;
    on(typenames: string, listener: null | ((event: D3DragEvent<GElement, Datum, Subject>, d: Datum) => void)): this;
  }

  export interface D3DragEvent<GElement extends Element, Datum, Subject> {
    target: DragBehavior<GElement, Datum, Subject>;
    type: 'start' | 'drag' | 'end';
    subject: Subject;
    x: number;
    y: number;
    dx: number;
    dy: number;
    identifier: 'mouse' | number;
    active: number;
    sourceEvent: Event;
  }

  // Brush
  export function brushX<Datum>(): BrushBehavior<Datum>;
  export function brushY<Datum>(): BrushBehavior<Datum>;
  export function brush<Datum>(): BrushBehavior<Datum>;

  export interface BrushBehavior<Datum> {
    (group: Selection<SVGGElement, Datum, Element | null, unknown>): void;
    move(group: Selection<SVGGElement, Datum, Element | null, unknown>, selection: null | [[number, number], [number, number]] | [number, number]): void;
    clear(group: Selection<SVGGElement, Datum, Element | null, unknown>): void;
    extent(extent: [[number, number], [number, number]] | ((d: Datum, i: number, group: SVGGElement[]) => [[number, number], [number, number]])): this;
    filter(filter: (event: Event, d: Datum) => boolean): this;
    handleSize(size: number): this;
    on(typenames: string, listener: null | ((event: D3BrushEvent<Datum>, d: Datum) => void)): this;
  }

  export interface D3BrushEvent<Datum> {
    target: BrushBehavior<Datum>;
    type: 'start' | 'brush' | 'end';
    selection: [[number, number], [number, number]] | [number, number] | null;
    sourceEvent: Event;
    mode: 'drag' | 'space' | 'handle' | 'center';
  }

  // Time intervals
  export const timeDay: TimeInterval;
  export const timeHour: TimeInterval;
  export const timeMinute: TimeInterval;
  export const timeSecond: TimeInterval;
  export const timeWeek: TimeInterval;
  export const timeMonth: TimeInterval;
  export const timeYear: TimeInterval;
  export const utcDay: TimeInterval;
  export const utcHour: TimeInterval;
  export const utcMinute: TimeInterval;

  // Format
  export function format(specifier: string): (n: number) => string;
  export function timeFormat(specifier: string): (date: Date) => string;
  export function utcFormat(specifier: string): (date: Date) => string;

  // Array utilities
  export function max<T>(array: Iterable<T>, accessor?: (d: T, i: number, array: Iterable<T>) => number | undefined | null): number | undefined;
  export function min<T>(array: Iterable<T>, accessor?: (d: T, i: number, array: Iterable<T>) => number | undefined | null): number | undefined;
  export function extent<T>(array: Iterable<T>, accessor?: (d: T, i: number, array: Iterable<T>) => number | undefined | null): [number, number] | [undefined, undefined];
}

// Proj4 type declarations
declare namespace proj4 {
  interface ProjectionDefinition {
    forward(point: [number, number]): [number, number];
    inverse(point: [number, number]): [number, number];
  }
}

declare function proj4(fromProjection: string, toProjection?: string): proj4.ProjectionDefinition;
declare function proj4(fromProjection: string): proj4.ProjectionDefinition;

// Make d3 and proj4 available globally
// declare const d3: typeof d3;
// declare const proj4: typeof proj4;
