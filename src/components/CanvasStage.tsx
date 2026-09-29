import { useEffect, useRef } from 'react';
import type { BrushSettings, ViewState } from '../types';
import type { DrawingEngine } from '../drawing/DrawingEngine';

interface CanvasStageProps {
  engine: DrawingEngine;
  view: ViewState;
  onViewChange: (patch: Partial<ViewState>) => void;
  brush: BrushSettings;
  onPickColor: (color: string) => void;
  onCommit: () => void;
  fitNonce: number;
}

const PADDING = 64;

export function CanvasStage({
  engine,
  view,
  onViewChange,
  brush,
  onPickColor,
  onCommit,
  fitNonce,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef({ clientX: 0, clientY: 0, panX: 0, panY: 0 });
  const spaceRef = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const computeFit = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    const { width: artWidth, height: artHeight } = engine.getSize();
    const zoom = Math.min(
      (width - PADDING) / artWidth,
      (height - PADDING) / artHeight,
      4,
    );
    const clamped = Math.max(0.05, zoom);
    onViewChange({
      zoom: clamped,
      panX: Math.round((width - artWidth * clamped) / 2),
      panY: Math.round((height - artHeight * clamped) / 2),
    });
  };

  useEffect(() => {
    const draw = () => engine.render(canvasRef.current!, viewRef.current);
    draw();
    const unsubscribe = engine.subscribe(draw);
    const wrapper = wrapperRef.current;
    const observer = new ResizeObserver(() => draw());
    if (wrapper) observer.observe(wrapper);
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [engine]);

  useEffect(() => {
    const draw = () => engine.render(canvasRef.current!, view);
    draw();
  }, [engine, view]);

  useEffect(() => {
    computeFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, fitNonce]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceRef.current = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const paint = () => {
    if (canvasRef.current) engine.render(canvasRef.current, viewRef.current);
  };

  const toArtboard = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const current = viewRef.current;
    return {
      x: (clientX - rect.left - current.panX) / current.zoom,
      y: (clientY - rect.top - current.panY) / current.zoom,
    };
  };

  const shouldPan = (event: React.PointerEvent) =>
    brush.tool === 'pan' || event.button === 1 || spaceRef.current;

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);

    if (shouldPan(event)) {
      panningRef.current = true;
      panStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        panX: viewRef.current.panX,
        panY: viewRef.current.panY,
      };
      return;
    }

    const { x, y } = toArtboard(event.clientX, event.clientY);

    if (brush.tool === 'eyedropper') {
      const color = engine.pickColor(x, y);
      if (color) onPickColor(color);
      return;
    }
    if (brush.tool === 'fill') {
      engine.fillAt(x, y, brush.color);
      onCommit();
      return;
    }
    drawingRef.current = true;
    engine.beginStroke(brush, x, y);
    paint();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panningRef.current) {
      const start = panStartRef.current;
      onViewChange({
        panX: start.panX + (event.clientX - start.clientX),
        panY: start.panY + (event.clientY - start.clientY),
      });
      return;
    }
    if (!drawingRef.current) return;
    const { x, y } = toArtboard(event.clientX, event.clientY);
    engine.moveStroke(brush, x, y);
    paint();
  };

  const finish = () => {
    if (drawingRef.current) {
      engine.endStroke();
      drawingRef.current = false;
      onCommit();
    }
    panningRef.current = false;
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const current = viewRef.current;
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const zoom = Math.max(0.05, Math.min(8, current.zoom * factor));
    const ratio = zoom / current.zoom;
    onViewChange({
      zoom,
      panX: mouseX - (mouseX - current.panX) * ratio,
      panY: mouseY - (mouseY - current.panY) * ratio,
    });
  };

  const cursor = brush.tool === 'pan' ? 'grab' : brush.tool === 'eyedropper' ? 'copy' : 'crosshair';

  const backgroundClass = view.showGrid ? 'with-grid' : '';

  return (
    <div className="canvas-stage" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className={`stage-canvas ${backgroundClass}`}
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={finish}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
