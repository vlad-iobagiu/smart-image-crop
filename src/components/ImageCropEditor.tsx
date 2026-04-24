"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CropRect {
  x: number;      // % of rendered image width
  y: number;
  width: number;
  height: number;
}

export interface FocusPoint {
  x: number;      // % 0-100
  y: number;
}

interface Props {
  imageUrl: string;
  mode: "crop" | "focuspoint";
  crop: CropRect;
  onCropChange: (c: CropRect) => void;
  focusPoint: FocusPoint;
  onFocusPointChange: (fp: FocusPoint) => void;
  aspectRatio: number | null;
}

type HandleId = "move" | "nw" | "ne" | "sw" | "se";

export default function ImageCropEditor({
  imageUrl, mode, crop, onCropChange, focusPoint, onFocusPointChange, aspectRatio,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const ibRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [ib, setIb] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const updateBounds = useCallback(() => {
    if (!imgRef.current || !containerRef.current) return;
    const ir = imgRef.current.getBoundingClientRect();
    const cr = containerRef.current.getBoundingClientRect();
    const b = { x: ir.left - cr.left, y: ir.top - cr.top, w: ir.width, h: ir.height };
    ibRef.current = b;
    setIb(b);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, [updateBounds]);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const drag = useRef<{ h: HandleId; sx: number; sy: number; sc: CropRect } | null>(null);

  const startDrag = useCallback((e: React.MouseEvent, h: HandleId) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { h, sx: e.clientX, sy: e.clientY, sc: { ...crop } };

    const onMove = (ev: MouseEvent) => {
      const d = drag.current;
      const b = ibRef.current;
      if (!d || b.w === 0) return;

      const pctX = ((ev.clientX - d.sx) / b.w) * 100;
      const pctY = ((ev.clientY - d.sy) / b.h) * 100;
      let { x, y, width, height } = d.sc;

      if (d.h === "move") {
        x = clamp(d.sc.x + pctX, 0, 100 - d.sc.width);
        y = clamp(d.sc.y + pctY, 0, 100 - d.sc.height);
      } else {
        if (d.h.includes("e")) width  = clamp(d.sc.width  + pctX, 5, 100 - d.sc.x);
        if (d.h.includes("s")) height = clamp(d.sc.height + pctY, 5, 100 - d.sc.y);
        if (d.h.includes("w")) {
          const nx = clamp(d.sc.x + pctX, 0, d.sc.x + d.sc.width - 5);
          width = d.sc.x + d.sc.width - nx; x = nx;
        }
        if (d.h.includes("n")) {
          const ny = clamp(d.sc.y + pctY, 0, d.sc.y + d.sc.height - 5);
          height = d.sc.y + d.sc.height - ny; y = ny;
        }

        if (aspectRatio !== null && b.h > 0) {
          const imgAR = b.w / b.h;
          if (d.h.includes("e") || d.h.includes("w")) {
            height = clamp(width * imgAR / aspectRatio, 5, 100 - y);
            if (d.h.includes("n")) y = clamp(d.sc.y + d.sc.height - height, 0, 100);
          } else {
            width = clamp(height * aspectRatio / imgAR, 5, 100 - x);
            if (d.h.includes("w")) x = clamp(d.sc.x + d.sc.width - width, 0, 100);
          }
        }
      }

      onCropChange({ x, y, width, height });
    };

    const onUp = () => {
      drag.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [crop, aspectRatio, onCropChange]);

  const cx = ib.x + (crop.x      / 100) * ib.w;
  const cy = ib.y + (crop.y      / 100) * ib.h;
  const cw =        (crop.width  / 100) * ib.w;
  const ch =        (crop.height / 100) * ib.h;
  const HS = 10;

  const handles: { id: HandleId; style: React.CSSProperties }[] = [
    { id: "nw", style: { top: -HS/2, left:  -HS/2, cursor: "nw-resize" } },
    { id: "ne", style: { top: -HS/2, right: -HS/2, cursor: "ne-resize" } },
    { id: "sw", style: { bottom: -HS/2, left:  -HS/2, cursor: "sw-resize" } },
    { id: "se", style: { bottom: -HS/2, right: -HS/2, cursor: "se-resize" } },
  ];

  const fpX = ib.x + (focusPoint.x / 100) * ib.w;
  const fpY = ib.y + (focusPoint.y / 100) * ib.h;

  const handleFocusClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onFocusPointChange({
      x: clamp(((e.clientX - rect.left) / rect.width)  * 100, 0, 100),
      y: clamp(((e.clientY - rect.top)  / rect.height) * 100, 0, 100),
    });
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative", width: "100%", height: "100%",
        overflow: "hidden", display: "flex", alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt="edit"
        onLoad={updateBounds}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", userSelect: "none", pointerEvents: "none" }}
        draggable={false}
      />

      {mode === "crop" && ib.w > 0 && (
        <div
          style={{
            position: "absolute",
            left: cx, top: cy, width: cw, height: ch,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            border: "1.5px solid rgba(255,255,255,0.85)",
            cursor: "move",
            boxSizing: "border-box",
          }}
          onMouseDown={(e) => startDrag(e, "move")}
        >
          {[1/3, 2/3].map(f => (
            <div key={`v${f}`} style={{ position: "absolute", left: `${f*100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
          ))}
          {[1/3, 2/3].map(f => (
            <div key={`h${f}`} style={{ position: "absolute", top: `${f*100}%`, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
          ))}
          {handles.map(h => (
            <div
              key={h.id}
              style={{ position: "absolute", width: HS, height: HS, background: "#fff", ...h.style }}
              onMouseDown={(e) => startDrag(e, h.id)}
            />
          ))}
        </div>
      )}

      {/* Focus-point mode: clickable overlay exactly over the image */}
      {mode === "focuspoint" && ib.w > 0 && (
        <div
          style={{
            position: "absolute",
            left: ib.x, top: ib.y, width: ib.w, height: ib.h,
            cursor: "crosshair",
          }}
          onClick={handleFocusClick}
        />
      )}

      {/* Focus-point crosshair — always on top, pointer-events none */}
      {mode === "focuspoint" && ib.w > 0 && (
        <div style={{ position: "absolute", left: fpX - 16, top: fpY - 16, width: 32, height: 32, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: 15, top: 0, width: 2, height: 32, background: "#ff3333" }} />
          <div style={{ position: "absolute", top: 15, left: 0, width: 32, height: 2, background: "#ff3333" }} />
          <div style={{ position: "absolute", left: 8, top: 8, width: 16, height: 16, borderRadius: "50%", border: "2px solid #ff3333" }} />
        </div>
      )}
    </div>
  );
}
