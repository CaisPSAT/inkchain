import { useEffect, useRef } from "react";
import type { Stroke } from "./types";

const MAX_REPLAY_MS = 2000;

export function ReplayDrawing({ strokes }: { strokes: Stroke[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let startedAt = 0;
    let completed = false;

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      return { ctx, width: rect.width, height: rect.height };
    };

    const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number, pointCount: number) => {
      if (!stroke.points.length || pointCount < 1) return;
      const points = stroke.points.slice(0, pointCount);
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.moveTo(points[0].x * width, points[0].y * height);
      for (const point of points.slice(1)) ctx.lineTo(point.x * width, point.y * height);
      if (points.length === 1) ctx.lineTo(points[0].x * width + 0.01, points[0].y * height + 0.01);
      ctx.stroke();
    };

    const totalPoints = Math.max(1, strokes.reduce((sum, stroke) => sum + Math.max(1, stroke.points.length), 0));
    const drawFinal = () => {
      const drawing = setup();
      if (!drawing) return;
      for (const stroke of strokes) drawStroke(drawing.ctx, stroke, drawing.width, drawing.height, stroke.points.length);
    };

    const render = (time: number) => {
      if (!startedAt) startedAt = time;
      const drawing = setup();
      if (!drawing) return;
      const elapsed = Math.min(MAX_REPLAY_MS, time - startedAt);
      let pointsToDraw = Math.ceil((elapsed / MAX_REPLAY_MS) * totalPoints);
      for (const stroke of strokes) {
        const count = Math.max(1, stroke.points.length);
        if (pointsToDraw <= 0) break;
        drawStroke(drawing.ctx, stroke, drawing.width, drawing.height, Math.min(count, pointsToDraw));
        pointsToDraw -= count;
      }
      if (elapsed < MAX_REPLAY_MS) frame = requestAnimationFrame(render);
      else completed = true;
    };

    frame = requestAnimationFrame(render);
    const observer = new ResizeObserver(() => {
      if (completed) drawFinal();
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [strokes]);

  return <div className="drawing-wrap"><canvas ref={canvasRef} className="drawing-canvas replay-canvas" /></div>;
}
