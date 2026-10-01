import { useEffect, useRef, useState } from 'react';
import type { ToolSettings, ViewState } from '../types';
import { isShapeTool } from '../types';
import type { DrawingEngine } from '../drawing/DrawingEngine';

interface CanvasStageProps {
  engine: DrawingEngine;
  view: ViewState;
  onViewChange: (patch: Partial<ViewState>) => void;
  settings: ToolSettings;
  onPickColor: (color: string, secondary: boolean) => void;
  onCommit: () => void;
  onLiveUpdate?: () => void;
  onCursorMove?: (position: { x: number; y: number } | null) => void;
  fitNonce: number;
}

const PADDING = 64;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

interface TextEdit {
  x: number;
  y: number;
  value: string;
}

export function CanvasStage({
  engine,
  view,
  onViewChange,
  settings,
  onPickColor,
  onCommit,
  onLiveUpdate,
  onCursorMove,
  fitNonce,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const shapingRef = useRef(false);
  const bendingRef = useRef(false);
  const panningRef = useRef(false);
  const strokeSecondaryRef = useRef(false);
  const panStartRef = useRef({ clientX: 0, clientY: 0, panX: 0, panY: 0 });
  const spaceRef = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const textEditRef = useRef<TextEdit | null>(null);
  textEditRef.current = textEdit;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const computeFit = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    if (width <= 0 || height <= 0) return;
    const { width: artWidth, height: artHeight } = engine.getSize();
    if (artWidth <= 0 || artHeight <= 0) return;
    const zoom = Math.min((width - PADDING) / artWidth, (height - PADDING) / artHeight, 4);
    const clamped = Math.max(MIN_ZOOM, zoom);
    onViewChange({
      zoom: clamped,
      panX: Math.round((width - artWidth * clamped) / 2),
      panY: Math.round((height - artHeight * clamped) / 2),
    });
  };

  useEffect(() => {
    const draw = () => {
      if (canvasRef.current) engine.render(canvasRef.current, viewRef.current);
    };
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
    if (canvasRef.current) engine.render(canvasRef.current, view);
  }, [engine, view]);

  useEffect(() => {
    computeFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, fitNonce]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = true;
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

  // Close the text box if the tool changes away from text.
  useEffect(() => {
    if (settings.tool !== 'text' && textEdit) {
      commitText();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.tool]);

  // Commit any in-progress text when the editor unmounts (e.g. switching tickets).
  useEffect(() => {
    return () => {
      const pending = textEditRef.current;
      if (pending && pending.value.trim()) {
        engine.drawText(pending.value, pending.x, pending.y, settingsRef.current);
        onCommitRef.current();
      }
    };
  }, [engine]);

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

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const current = viewRef.current;
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor));
    const ratio = zoom / current.zoom;
    onViewChange({
      zoom,
      panX: mouseX - (mouseX - current.panX) * ratio,
      panY: mouseY - (mouseY - current.panY) * ratio,
    });
  };

  const commitText = () => {
    const current = textEditRef.current;
    if (current && current.value.trim()) {
      engine.drawText(current.value, current.x, current.y, settings);
      onCommit();
    }
    setTextEdit(null);
  };

  const strokeSettings = (secondary: boolean): ToolSettings => ({
    ...settings,
    color: secondary ? settings.color2 : settings.color,
    preset: settings.tool === 'pencil' ? 'hard' : settings.preset,
  });

  const shouldPan = (event: React.PointerEvent) =>
    settings.tool === 'pan' || event.button === 1 || spaceRef.current;

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const secondary = event.button === 2 || (event.buttons & 2) === 2;

    // Clicking the canvas with an open text box commits it.
    if (textEditRef.current) commitText();

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
    const tool = settings.tool;

    if (tool === 'eyedropper') {
      const color = engine.pickColor(x, y);
      if (color) onPickColor(color, secondary);
      return;
    }
    if (tool === 'magnifier') {
      zoomAt(event.clientX, event.clientY, secondary ? 1 / 1.4 : 1.4);
      return;
    }
    if (tool === 'fill') {
      engine.fillAt(x, y, secondary ? settings.color2 : settings.color);
      onCommit();
      return;
    }
    if (tool === 'text') {
      setTextEdit({ x, y, value: '' });
      return;
    }

    if (isShapeTool(tool)) {
      if (engine.isCurveBending()) {
        bendingRef.current = true;
        engine.setShapeControl(x, y);
        paint();
        return;
      }
      if (engine.isPolygonShaping()) {
        if (event.detail !== 2) engine.addPolygonPoint(x, y);
        paint();
        return;
      }
      engine.beginShape(tool, settings, x, y);
      if (tool !== 'polygon') shapingRef.current = true;
      paint();
      return;
    }

    drawingRef.current = true;
    strokeSecondaryRef.current = secondary;
    engine.beginStroke(strokeSettings(secondary), x, y);
    paint();
    onLiveUpdate?.();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    onCursorMove?.(toArtboard(event.clientX, event.clientY));

    if (panningRef.current) {
      const start = panStartRef.current;
      onViewChange({
        panX: start.panX + (event.clientX - start.clientX),
        panY: start.panY + (event.clientY - start.clientY),
      });
      return;
    }
    if (bendingRef.current) {
      engine.setShapeControl(toArtboard(event.clientX, event.clientY).x, toArtboard(event.clientX, event.clientY).y);
      paint();
      return;
    }
    if (shapingRef.current || engine.isPolygonShaping()) {
      const { x, y } = toArtboard(event.clientX, event.clientY);
      engine.updateShape(x, y);
      paint();
      return;
    }
    if (!drawingRef.current) return;
    const { x, y } = toArtboard(event.clientX, event.clientY);
    engine.moveStroke(strokeSettings(strokeSecondaryRef.current), x, y);
    paint();
    onLiveUpdate?.();
  };

  const finish = () => {
    if (drawingRef.current) {
      engine.endStroke();
      drawingRef.current = false;
      strokeSecondaryRef.current = false;
      onCommit();
    }
    if (bendingRef.current) {
      engine.finishCurve();
      bendingRef.current = false;
      onCommit();
    }
    if (shapingRef.current) {
      engine.endShape();
      shapingRef.current = false;
      onCommit();
    }
    panningRef.current = false;
  };

  const handleDoubleClick = () => {
    if (engine.isPolygonShaping()) {
      engine.finishPolygon();
      onCommit();
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const cursor =
    settings.tool === 'pan'
      ? 'grab'
      : settings.tool === 'eyedropper'
        ? 'copy'
        : settings.tool === 'magnifier'
          ? 'zoom-in'
          : settings.tool === 'text'
            ? 'text'
            : 'crosshair';

  const textScreen = textEdit
    ? {
        left: view.panX + textEdit.x * view.zoom,
        top: view.panY + textEdit.y * view.zoom,
      }
    : null;

  return (
    <div className="canvas-stage" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={() => {
          finish();
          onCursorMove?.(null);
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      />
      {textEdit && textScreen ? (
        <textarea
          className="canvas-text-input"
          autoFocus
          value={textEdit.value}
          style={{
            left: textScreen.left,
            top: textScreen.top,
            fontSize: Math.max(8, settings.fontSize * view.zoom),
            fontFamily: settings.fontFamily,
            color: settings.color,
          }}
          onChange={(event) => setTextEdit({ ...textEdit, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setTextEdit(null);
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              commitText();
            }
          }}
        />
      ) : null}
    </div>
  );
}
