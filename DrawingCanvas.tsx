import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Stroke } from "./types";

export function DrawingCanvas({ strokes, onChange, readOnly = false, multicolor = true }: { strokes: Stroke[]; onChange?: (strokes: Stroke[]) => void; readOnly?: boolean; multicolor?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#111111");
  const [width, setWidth] = useState(5);
  const active = useRef<Stroke | null>(null);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      if (stroke.points.length < 1) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.moveTo(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height);
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x * rect.width, point.y * rect.height);
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x * rect.width + .01, stroke.points[0].y * rect.height + .01);
      ctx.stroke();
    }
  };

  useEffect(draw, [strokes]);
  useEffect(() => {
    const observer = new ResizeObserver(draw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [strokes]);

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  };

  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { color: multicolor ? color : "#111111", width, points: [pointFromEvent(event)] };
    onChange?.([...strokes, active.current]);
  };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!active.current || readOnly) return;
    active.current.points.push(pointFromEvent(event));
    onChange?.([...strokes.slice(0, -1), { ...active.current, points: [...active.current.points] }]);
  };
  const pointerUp = () => { active.current = null; };

  return <div className="drawing-wrap">
    <canvas ref={canvasRef} className="drawing-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
    {!readOnly && <div className="drawing-tools">
      <label>Thickness <input type="range" min="2" max="18" value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
      {multicolor && <label>Ink <input className="color-input" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>}
      <button type="button" onClick={() => onChange?.(strokes.slice(0, -1))} disabled={!strokes.length}>Undo</button>
    </div>}
  </div>;
}
