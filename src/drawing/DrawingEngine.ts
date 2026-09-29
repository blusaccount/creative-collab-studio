import type { BackgroundKind, BrushSettings, LayerKind, LayerState } from '../types';
import { hexToRgb, rgbToHex } from '../utils/color';
import { createId } from '../utils/id';
import { getCheckerPattern, getPaperPattern, BACKGROUND_COLORS } from './patterns';

export interface EngineLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  opacity: number;
  locked: boolean;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface LayerSnapshot {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  opacity: number;
  locked: boolean;
  dataUrl: string;
}

type HistoryEntry =
  | { type: 'pixels'; layerId: string; before: string; after: string }
  | { type: 'structure'; before: LayerSnapshot[]; after: LayerSnapshot[]; activeBefore: string; activeAfter: string };

export interface RenderView {
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  gridSize: number;
  showReferences: boolean;
}

const MAX_HISTORY = 60;

function createLayerCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export class DrawingEngine {
  width: number;
  height: number;
  background: BackgroundKind;
  private layers: EngineLayer[] = [];
  private activeLayerId = '';
  private history: HistoryEntry[] = [];
  private cursor = 0;
  private strokeBefore = '';
  private strokeDirty = false;
  private strokeLast: { x: number; y: number } | null = null;
  private version = 0;
  private listeners = new Set<() => void>();

  constructor(width: number, height: number, background: BackgroundKind = 'white') {
    this.width = width;
    this.height = height;
    this.background = background;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  getLayers(): EngineLayer[] {
    return this.layers;
  }

  getActiveLayerId(): string {
    return this.activeLayerId;
  }

  getActiveLayer(): EngineLayer | null {
    return this.layers.find((layer) => layer.id === this.activeLayerId) ?? null;
  }

  canUndo(): boolean {
    return this.cursor > 0;
  }

  canRedo(): boolean {
    return this.cursor < this.history.length;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    for (const layer of this.layers) {
      const next = createLayerCanvas(width, height);
      const ctx = next.getContext('2d');
      if (!ctx) continue;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(layer.canvas, 0, 0, width, height);
      layer.canvas = next;
      layer.ctx = ctx;
    }
    this.width = width;
    this.height = height;
    this.history = [];
    this.cursor = 0;
    this.emit();
  }

  getBackground(): BackgroundKind {
    return this.background;
  }

  setBackground(background: BackgroundKind): void {
    this.background = background;
    this.emit();
  }

  private pushHistory(entry: HistoryEntry): void {
    this.history.splice(this.cursor);
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.cursor = this.history.length;
  }

  private snapshot(): LayerSnapshot[] {
    return this.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: layer.kind,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      dataUrl: layer.kind === 'draw' ? layer.canvas.toDataURL('image/png') : this.referenceDataUrl(layer),
    }));
  }

  private referenceDataUrl(layer: EngineLayer): string {
    return layer.canvas.toDataURL('image/png');
  }

  private async loadImage(canvas: HTMLCanvasElement, dataUrl: string): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) return;
    await new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve();
      };
      image.onerror = () => resolve();
      image.src = dataUrl;
    });
  }

  private async restoreSnapshot(snapshot: LayerSnapshot[]): Promise<void> {
    const next: EngineLayer[] = [];
    for (const item of snapshot) {
      const canvas = createLayerCanvas(this.width, this.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await this.loadImage(canvas, item.dataUrl);
      next.push({ ...item, canvas, ctx });
    }
    this.layers = next;
    if (!this.layers.some((layer) => layer.id === this.activeLayerId)) {
      this.activeLayerId = this.layers[this.layers.length - 1]?.id ?? '';
    }
  }

  async undo(): Promise<boolean> {
    if (!this.canUndo()) return false;
    const entry = this.history[this.cursor - 1];
    if (entry.type === 'pixels') {
      const layer = this.layers.find((item) => item.id === entry.layerId);
      if (layer) await this.loadImage(layer.canvas, entry.before);
    } else {
      await this.restoreSnapshot(entry.before);
      this.activeLayerId = entry.activeBefore;
    }
    this.cursor -= 1;
    this.emit();
    return true;
  }

  async redo(): Promise<boolean> {
    if (!this.canRedo()) return false;
    const entry = this.history[this.cursor];
    if (entry.type === 'pixels') {
      const layer = this.layers.find((item) => item.id === entry.layerId);
      if (layer) await this.loadImage(layer.canvas, entry.after);
    } else {
      await this.restoreSnapshot(entry.after);
      this.activeLayerId = entry.activeAfter;
    }
    this.cursor += 1;
    this.emit();
    return true;
  }

  // --- Layer management ---

  addLayer(kind: LayerKind = 'draw', name?: string): string {
    const before = this.snapshot();
    const prevActive = this.activeLayerId;
    const canvas = createLayerCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d')!;
    const layer: EngineLayer = {
      id: createId('layer'),
      name: name ?? (kind === 'draw' ? `Paint ${this.layers.filter((l) => l.kind === 'draw').length + 1}` : 'Reference'),
      kind,
      visible: true,
      opacity: 1,
      locked: false,
      canvas,
      ctx,
    };
    if (kind === 'reference') {
      this.layers.unshift(layer);
    } else {
      const index = this.layers.findIndex((item) => item.id === this.activeLayerId);
      this.layers.splice(index === -1 ? this.layers.length : index + 1, 0, layer);
    }
    this.activeLayerId = layer.id;
    this.pushHistory({
      type: 'structure',
      before,
      after: this.snapshot(),
      activeBefore: prevActive,
      activeAfter: layer.id,
    });
    this.emit();
    return layer.id;
  }

  removeLayer(id: string): void {
    if (this.layers.length <= 1) return;
    const before = this.snapshot();
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index === -1) return;
    this.layers.splice(index, 1);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers[Math.max(0, index - 1)]?.id ?? this.layers[0].id;
    }
    this.pushHistory({ type: 'structure', before, after: this.snapshot(), activeBefore: id, activeAfter: this.activeLayerId });
    this.emit();
  }

  moveLayer(id: string, direction: -1 | 1): void {
    const index = this.layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= this.layers.length) return;
    const before = this.snapshot();
    const [layer] = this.layers.splice(index, 1);
    this.layers.splice(target, 0, layer);
    this.pushHistory({
      type: 'structure',
      before,
      after: this.snapshot(),
      activeBefore: this.activeLayerId,
      activeAfter: this.activeLayerId,
    });
    this.emit();
  }

  setLayerProps(id: string, patch: Partial<Pick<EngineLayer, 'name' | 'visible' | 'opacity' | 'locked'>>): void {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer) return;
    Object.assign(layer, patch);
    this.emit();
  }

  setActiveLayer(id: string): void {
    if (this.activeLayerId === id) return;
    this.activeLayerId = id;
    this.emit();
  }

  async setReferenceImage(layerId: string, dataUrl: string): Promise<void> {
    const layer = this.layers.find((item) => item.id === layerId);
    if (!layer) return;
    const before = this.snapshot();
    await this.loadImage(layer.canvas, dataUrl);
    this.pushHistory({
      type: 'structure',
      before,
      after: this.snapshot(),
      activeBefore: this.activeLayerId,
      activeAfter: this.activeLayerId,
    });
    this.emit();
  }

  // --- Drawing ---

  private prepareContext(settings: BrushSettings): CanvasRenderingContext2D | null {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked || layer.kind !== 'draw') return null;
    const ctx = layer.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  beginStroke(settings: BrushSettings, x: number, y: number): void {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked || layer.kind !== 'draw') return;
    this.strokeBefore = layer.canvas.toDataURL('image/png');
    this.strokeDirty = true;
    this.strokeLast = { x, y };
    this.drawDot(settings, x, y);
  }

  moveStroke(settings: BrushSettings, x: number, y: number): void {
    if (!this.strokeDirty || !this.strokeLast) return;
    const from = this.strokeLast;
    this.drawSegment(settings, from.x, from.y, x, y);
    this.strokeLast = { x, y };
  }

  endStroke(): void {
    if (!this.strokeDirty) return;
    const layer = this.getActiveLayer();
    if (layer) {
      const after = layer.canvas.toDataURL('image/png');
      this.pushHistory({ type: 'pixels', layerId: layer.id, before: this.strokeBefore, after });
    }
    this.strokeDirty = false;
    this.strokeLast = null;
    this.emit();
  }

  private drawDot(settings: BrushSettings, x: number, y: number): void {
    const ctx = this.prepareContext(settings);
    if (!ctx) return;
    const erase = settings.tool === 'eraser';
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    if (settings.preset === 'hard') {
      ctx.globalAlpha = settings.opacity;
      ctx.fillStyle = settings.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, settings.size / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      this.stampBrush(ctx, x, y, settings, erase);
    }
    ctx.restore();
  }

  private drawSegment(settings: BrushSettings, ax: number, ay: number, bx: number, by: number): void {
    const ctx = this.prepareContext(settings);
    if (!ctx) return;
    const erase = settings.tool === 'eraser';
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';

    if (settings.preset === 'hard') {
      ctx.globalAlpha = settings.opacity;
      ctx.strokeStyle = erase ? '#000000' : settings.color;
      ctx.lineWidth = settings.size;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
      ctx.lineTo(bx, by);
      ctx.stroke();
    } else {
      const distance = Math.hypot(bx - ax, by - ay);
      const spacing = Math.max(0.75, settings.size * (settings.preset === 'soft' ? 0.16 : 0.28));
      const steps = Math.max(1, Math.floor(distance / spacing));
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        this.stampBrush(ctx, ax + (bx - ax) * t, ay + (by - ay) * t, settings, erase);
      }
    }
    ctx.restore();
  }

  private stampBrush(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    settings: BrushSettings,
    erase: boolean,
  ): void {
    const radius = Math.max(0.5, settings.size / 2);
    if (settings.preset === 'soft') {
      const inner = Math.max(0, radius * Math.min(0.95, settings.hardness));
      const gradient = ctx.createRadialGradient(x, y, inner, x, y, radius);
      const color = erase ? '0, 0, 0' : `${hexToRgb(settings.color).r}, ${hexToRgb(settings.color).g}, ${hexToRgb(settings.color).b}`;
      gradient.addColorStop(0, `rgba(${color}, ${settings.opacity})`);
      gradient.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const density = Math.max(4, Math.round(radius * 1.6));
    const color = erase ? '#000000' : settings.color;
    for (let i = 0; i < density; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * Math.max(0.25, settings.hardness);
      const dotRadius = Math.max(0.4, radius * (0.08 + Math.random() * 0.14));
      ctx.globalAlpha = settings.opacity * (0.25 + Math.random() * 0.75);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clearActiveLayer(): void {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked) return;
    const before = layer.canvas.toDataURL('image/png');
    layer.ctx.clearRect(0, 0, this.width, this.height);
    this.pushHistory({ type: 'pixels', layerId: layer.id, before, after: layer.canvas.toDataURL('image/png') });
    this.emit();
  }

  fillAt(x: number, y: number, color: string, tolerance = 32): void {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked || layer.kind !== 'draw') return;
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    if (sx < 0 || sy < 0 || sx >= this.width || sy >= this.height) return;

    const ctx = layer.ctx;
    const image = ctx.getImageData(0, 0, this.width, this.height);
    const data = image.data;
    const startIndex = (sy * this.width + sx) * 4;
    const start = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];
    const fill = hexToRgb(color);
    const target = [fill.r, fill.g, fill.b, 255];

    const matches = (px: number, py: number): boolean => {
      const idx = (py * this.width + px) * 4;
      return (
        Math.abs(data[idx] - start[0]) <= tolerance &&
        Math.abs(data[idx + 1] - start[1]) <= tolerance &&
        Math.abs(data[idx + 2] - start[2]) <= tolerance &&
        Math.abs(data[idx + 3] - start[3]) <= tolerance
      );
    };

    if (
      Math.abs(start[0] - target[0]) <= tolerance &&
      Math.abs(start[1] - target[1]) <= tolerance &&
      Math.abs(start[2] - target[2]) <= tolerance &&
      start[3] === 255
    ) {
      return;
    }

    const before = layer.canvas.toDataURL('image/png');
    const visited = new Uint8Array(this.width * this.height);
    const stack: number[] = [sx, sy];

    while (stack.length) {
      const py = stack.pop()!;
      let px = stack.pop()!;
      if (visited[py * this.width + px]) continue;

      let left = px;
      while (left >= 0 && !visited[py * this.width + left] && matches(left, py)) left -= 1;
      left += 1;

      let spanAbove = false;
      let spanBelow = false;
      let cx = left;
      while (cx < this.width && !visited[py * this.width + cx] && matches(cx, py)) {
        const idx = (py * this.width + cx) * 4;
        data[idx] = target[0];
        data[idx + 1] = target[1];
        data[idx + 2] = target[2];
        data[idx + 3] = target[3];
        visited[py * this.width + cx] = 1;

        if (py > 0) {
          const above = !visited[(py - 1) * this.width + cx] && matches(cx, py - 1);
          if (above && !spanAbove) {
            stack.push(cx, py - 1);
            spanAbove = true;
          } else if (!above) {
            spanAbove = false;
          }
        }
        if (py < this.height - 1) {
          const below = !visited[(py + 1) * this.width + cx] && matches(cx, py + 1);
          if (below && !spanBelow) {
            stack.push(cx, py + 1);
            spanBelow = true;
          } else if (!below) {
            spanBelow = false;
          }
        }
        cx += 1;
      }
    }

    ctx.putImageData(image, 0, 0);
    this.pushHistory({ type: 'pixels', layerId: layer.id, before, after: layer.canvas.toDataURL('image/png') });
    this.emit();
  }

  pickColor(x: number, y: number): string | null {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    this.renderFull(canvas, { includeBackground: true, includeReferences: true });
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return null;
    const data = ctx.getImageData(px, py, 1, 1).data;
    if (data[3] === 0) return null;
    return rgbToHex(data[0], data[1], data[2]);
  }

  // --- Rendering ---

  private paintBackground(ctx: CanvasRenderingContext2D): void {
    if (this.background === 'transparent') return;
    ctx.save();
    if (this.background === 'paper') {
      const pattern = ctx.createPattern(getPaperPattern(), 'repeat');
      ctx.fillStyle = pattern ?? BACKGROUND_COLORS.paper;
    } else {
      ctx.fillStyle = BACKGROUND_COLORS[this.background];
    }
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  renderFull(target: HTMLCanvasElement, options: { includeBackground: boolean; includeReferences: boolean }): void {
    target.width = this.width;
    target.height = this.height;
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (options.includeBackground) this.paintBackground(ctx);
    for (const layer of this.layers) {
      if (!layer.visible) continue;
      if (layer.kind === 'reference' && !options.includeReferences) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
  }

  render(displayCanvas: HTMLCanvasElement, view: RenderView): void {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const cssWidth = displayCanvas.clientWidth || this.width;
    const cssHeight = displayCanvas.clientHeight || this.height;
    const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
    const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (displayCanvas.width !== targetWidth || displayCanvas.height !== targetHeight) {
      displayCanvas.width = targetWidth;
      displayCanvas.height = targetHeight;
    }
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.save();
    ctx.translate(view.panX, view.panY);
    ctx.scale(view.zoom, view.zoom);

    if (this.background === 'transparent') {
      const checker = ctx.createPattern(getCheckerPattern(), 'repeat');
      if (checker) {
        const patternScale = 1 / 1;
        const matrix = new DOMMatrix();
        matrix.a = patternScale;
        matrix.d = patternScale;
        checker.setTransform(matrix);
        ctx.fillStyle = checker;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    } else {
      this.paintBackground(ctx);
    }

    for (const layer of this.layers) {
      if (!layer.visible) continue;
      if (layer.kind === 'reference' && !view.showReferences) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;

    if (view.showGrid) this.drawGrid(ctx, view.gridSize);

    ctx.restore();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(view.panX + 0.5, view.panY + 0.5, this.width * view.zoom, this.height * view.zoom);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, gridSize: number): void {
    const size = Math.max(2, Math.round(gridSize));
    ctx.save();
    ctx.lineWidth = 1 / Math.max(0.2, ctx.getTransform().a);
    for (let x = size; x < this.width; x += size) {
      ctx.strokeStyle = x % (size * 8) === 0 ? 'rgba(37, 99, 235, 0.45)' : 'rgba(100, 116, 139, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = size; y < this.height; y += size) {
      ctx.strokeStyle = y % (size * 8) === 0 ? 'rgba(37, 99, 235, 0.45)' : 'rgba(100, 116, 139, 0.25)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  async exportBlob(): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    this.renderFull(canvas, { includeBackground: true, includeReferences: false });
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  thumbnail(maxSize = 200): string {
    const full = document.createElement('canvas');
    this.renderFull(full, { includeBackground: true, includeReferences: false });
    const scale = Math.min(1, maxSize / Math.max(this.width, this.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(this.width * scale));
    canvas.height = Math.max(1, Math.round(this.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  // --- Serialization ---

  serializeLayers(): LayerState[] {
    return this.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: layer.kind,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      dataUrl: layer.canvas.toDataURL('image/png'),
    }));
  }

  async loadFromLayers(states: LayerState[], background: BackgroundKind): Promise<void> {
    this.background = background;
    this.layers = [];
    for (const state of states) {
      const canvas = createLayerCanvas(this.width, this.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await this.loadImage(canvas, state.dataUrl);
      this.layers.push({
        id: state.id,
        name: state.name,
        kind: state.kind,
        visible: state.visible,
        opacity: state.opacity,
        locked: state.locked,
        canvas,
        ctx,
      });
    }
    if (!this.layers.some((layer) => layer.kind === 'draw')) {
      const canvas = createLayerCanvas(this.width, this.height);
      this.layers.push({
        id: createId('layer'),
        name: 'Paint',
        kind: 'draw',
        visible: true,
        opacity: 1,
        locked: false,
        canvas,
        ctx: canvas.getContext('2d')!,
      });
    }
    this.activeLayerId = [...this.layers].reverse().find((layer) => layer.kind === 'draw')?.id ?? this.layers[0]?.id ?? '';
    this.history = [];
    this.cursor = 0;
    this.emit();
  }

  isEmpty(): boolean {
    return this.layers.every((layer) => {
      if (layer.kind !== 'draw') return true;
      const ctx = layer.ctx;
      const data = ctx.getImageData(0, 0, this.width, this.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return false;
      }
      return true;
    });
  }
}
