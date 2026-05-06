"use client";

import { useCallback, useEffect, useState } from "react";
import { useMarketplaceClient } from "@/src/utils/hooks/useMarketplaceClient";
import ImageCropEditor, { CropRect, FocusPoint } from "@/src/components/ImageCropEditor";
import MediaLibraryModal from "@/src/components/MediaLibraryModal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FieldState {
  imageId:   string;
  imageUrl:  string | null;
  imageName: string;
  naturalW:  number;
  naturalH:  number;
  crop:      CropRect;
  focusPoint: FocusPoint;
}

const DEFAULT_CROP: CropRect   = { x: 10, y: 10, width: 80, height: 80 };
const DEFAULT_FP:   FocusPoint = { x: 50, y: 50 };

const ASPECTS = [
  { key: "free", label: "Free", sub: "freeform",   value: null    },
  { key: "16:9", label: "16:9", sub: "widescreen", value: 16 / 9  },
  { key: "4:3",  label: "4:3",  sub: "standard",   value: 4  / 3  },
  { key: "1:1",  label: "1:1",  sub: "square",     value: 1       },
  { key: "3:2",  label: "3:2",  sub: "photo",      value: 3  / 2  },
  { key: "9:16", label: "9:16", sub: "portrait",   value: 9  / 16 },
];

const PREVIEWS = [
  { label: "16:9", ar: 16 / 9,  w: 156, h: 88 },
  { label: "1:1",  ar: 1,       w: 80,  h: 80 },
  { label: "4:3",  ar: 4  / 3,  w: 100, h: 75 },
  { label: "9:16", ar: 9  / 16, w: 44,  h: 78 },
];

function computeFocusCrop(ar: number, naturalW: number, naturalH: number, fp: FocusPoint): CropRect {
  if (!naturalW || !naturalH) return DEFAULT_CROP;
  // Largest crop at this visual aspect ratio that fits the image
  let w = 100;
  let h = w * naturalW / (ar * naturalH);
  if (h > 100) { h = 100; w = h * ar * naturalH / naturalW; }
  // Center on focus point, clamped inside bounds
  const x = Math.max(0, Math.min(100 - w, fp.x - w / 2));
  const y = Math.max(0, Math.min(100 - h, fp.y - h / 2));
  return { x, y, width: w, height: h };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "#555", textTransform: "uppercase", padding: "12px 12px 5px" }}>
      {children}
    </div>
  );
}

function AspectBtn({ aspect, selected, onClick }: { aspect: typeof ASPECTS[0]; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        padding: "5px 2px", border: selected ? "1px solid #555" : "1px solid #252525",
        borderRadius: 4, background: selected ? "#2a2a2a" : "#151515",
        color: selected ? "#fff" : "#777", cursor: "pointer", minWidth: 0,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600 }}>{aspect.label}</span>
      <span style={{ fontSize: 8, color: "#444", marginTop: 1 }}>{aspect.sub}</span>
    </button>
  );
}

function CropPreview({ imageUrl, crop, width, height }: { imageUrl: string; crop: CropRect; width: number; height: number }) {
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative", flexShrink: 0, background: "#0d0d0d", borderRadius: 2 }}>
      <img
        src={imageUrl}
        alt=""
        style={{
          position: "absolute",
          width:  `${(100 / crop.width)  * 100}%`,
          height: `${(100 / crop.height) * 100}%`,
          left:   `${-(crop.x / crop.width)  * 100}%`,
          top:    `${-(crop.y / crop.height) * 100}%`,
          maxWidth: "none", maxHeight: "none",
          pointerEvents: "none", userSelect: "none",
        }}
        draggable={false}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function CropFieldExtension() {
  const { client, isInitialized, error } = useMarketplaceClient();

  const [field, setField]       = useState<FieldState>({ imageId: "", imageUrl: null, imageName: "", naturalW: 0, naturalH: 0, crop: DEFAULT_CROP, focusPoint: DEFAULT_FP });
  const [mode, setMode]         = useState<"crop" | "focuspoint">("crop");
  const [aspectKey, setAspectKey] = useState("free");
  const [showModal, setShowModal] = useState(false);

  const currentAspect = ASPECTS.find(a => a.key === aspectKey)!;

  const patch = useCallback((p: Partial<FieldState>) => setField(prev => ({ ...prev, ...p })), []);

  const handleAspectChange = useCallback((key: string, value: number | null) => {
    setAspectKey(key);
    if (value === null) return; // free — keep current crop shape

    setField(prev => {
      const { crop, naturalW, naturalH } = prev;
      if (!naturalW || !naturalH) return prev;

      // Center of current crop (%)
      const cx = crop.x + crop.width  / 2;
      const cy = crop.y + crop.height / 2;

      // Largest crop at requested visual aspect ratio that fits the image.
      // visual_aspect = (w% * naturalW) / (h% * naturalH) = value
      let w = 100;
      let h = w * naturalW / (value * naturalH);
      if (h > 100) { h = 100; w = h * value * naturalH / naturalW; }

      // Clamp to [0, 100]
      w = Math.min(w, 100);
      h = Math.min(h, 100);

      const x = Math.max(0, Math.min(100 - w, cx - w / 2));
      const y = Math.max(0, Math.min(100 - h, cy - h / 2));

      return { ...prev, crop: { x, y, width: w, height: h } };
    });
  }, []);

  const loadImageUrl = useCallback((id: string, url: string, name: string) => {
    const img = new window.Image();
    img.onload  = () => patch({ imageId: id, imageUrl: url, imageName: name, naturalW: img.naturalWidth, naturalH: img.naturalHeight, crop: DEFAULT_CROP, focusPoint: DEFAULT_FP });
    img.onerror = () => patch({ imageId: id, imageUrl: url, imageName: name, naturalW: 0, naturalH: 0, crop: DEFAULT_CROP, focusPoint: DEFAULT_FP });
    img.src = url;
  }, [patch]);

  useEffect(() => {
    if (!isInitialized || !client) return;
    client.getValue().then((raw: any) => {
      if (!raw) return;
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const url = parsed.mediaUrl ?? parsed.src;
        if (!url) return;
        const img = new window.Image();
        img.onload = () => {
          const fp = parsed.focalPoint ?? parsed.focusPoint;
          setField({
            imageId:    "",
            imageUrl:   url,
            imageName:  url.split("/").pop()?.split("?")[0] ?? url,
            naturalW:   img.naturalWidth,
            naturalH:   img.naturalHeight,
            crop:       DEFAULT_CROP,
            focusPoint: fp ? { x: fp.x * 100, y: fp.y * 100 } : DEFAULT_FP,
          });
        };
        img.src = url;
      } catch {
        // invalid stored value — start empty
      }
    }).catch(() => {/* no stored value */});
  }, [isInitialized, client]);

  const handleMediaSelect = (item: { id: string; displayName: string; mediaUrl?: string }) => {
    setShowModal(false);
    if (item.mediaUrl) loadImageUrl(item.id, item.mediaUrl, item.displayName);
  };

  const BREAKPOINT_DEFS = [
    { key: "desktop", ar: 16 / 9,  label: "16:9" },
    { key: "tablet",  ar: 4  / 3,  label: "4:3"  },
    { key: "mobile",  ar: 1,       label: "1:1"  },
  ] as const;

  const toFrac = (v: number) => parseFloat((v / 100).toFixed(6));

  const buildValue = () => {
    if (!field.imageUrl) return null;
    const breakpoints: Record<string, { aspectRatio: string; crop: { x: number; y: number; width: number; height: number } }> = {};
    for (const { key, ar, label } of BREAKPOINT_DEFS) {
      const c = computeFocusCrop(ar, field.naturalW, field.naturalH, field.focusPoint);
      breakpoints[key] = {
        aspectRatio: label,
        crop: { x: toFrac(c.x), y: toFrac(c.y), width: toFrac(c.width), height: toFrac(c.height) },
      };
    }
    return {
      mediaId:    field.imageId,
      mediaUrl:   field.imageUrl,
      focalPoint: { x: toFrac(field.focusPoint.x), y: toFrac(field.focusPoint.y) },
      breakpoints,
    };
  };

  const handleApply = () => {
    const val = buildValue();
    if (val) client?.setValue(JSON.stringify(val));
  };
  const fieldValue = buildValue();

  if (!isInitialized) {
    return <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#111", color: "#555", fontFamily: "sans-serif", fontSize: 13 }}>Initializing…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#111", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 12 }}>

      {/* ── Top bar ── */}
      <div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 12px", background: "#0a0a0a", borderBottom: "1px solid #1e1e1e", flexShrink: 0, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 18, background: "#cc2222", borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 11 }}>M</span>
          </div>
          <span style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>Sitecore Marketplace SDK</span>
          <span style={{ color: "#333" }}>|</span>
          <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>Image Field Editor — Crop &amp; Focus Point</span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {([["crop", "✂ Crop"], ["focuspoint", "⊙ Focus Point"]] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "4px 10px", fontSize: 11,
                border:     mode === m ? "1px solid #555" : "1px solid #2a2a2a",
                borderRadius: 4,
                background: mode === m ? "#2a2a2a" : "transparent",
                color:      mode === m ? "#fff" : "#777",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => patch({ crop: DEFAULT_CROP, focusPoint: DEFAULT_FP })}
            style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #2a2a2a", borderRadius: 4, background: "transparent", color: "#777", cursor: "pointer" }}
          >
            Reset
          </button>
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleApply}
          style={{ padding: "5px 16px", fontSize: 11, border: "none", borderRadius: 4, background: "#cc2222", color: "#fff", cursor: "pointer", fontWeight: 600 }}
        >
          Apply &amp; Save
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left panel */}
        <div style={{ width: 136, background: "#161616", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: 12 }}>
            <button
              onClick={() => setShowModal(true)}
              style={{
                width: "100%", padding: "8px 0", fontSize: 11, fontWeight: 600,
                background: "#cc2222", color: "#fff", border: "none", borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Load Sample Image
            </button>
          </div>

          {field.imageUrl && (
            <div style={{ borderTop: "1px solid #1e1e1e" }}>
              <SectionLabel>Image Info</SectionLabel>
              <div style={{ padding: "0 12px 12px" }}>
                <div style={{ fontSize: 10, color: "#ccc", wordBreak: "break-all", marginBottom: 4 }}>{field.imageName}</div>
                {field.naturalW > 0 && (
                  <div style={{ fontSize: 10, color: "#666" }}>{field.naturalW} × {field.naturalH} px</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center – editor canvas */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
          {field.imageUrl ? (
            <ImageCropEditor
              imageUrl={field.imageUrl}
              mode={mode}
              crop={field.crop}
              onCropChange={crop => patch({ crop })}
              focusPoint={field.focusPoint}
              onFocusPointChange={focusPoint => patch({ focusPoint })}
              aspectRatio={currentAspect.value}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, userSelect: "none" }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🖼️</div>
              <div style={{ fontSize: 14, color: "#555", fontWeight: 500 }}>No image loaded</div>
              <div style={{ fontSize: 12, color: "#3a3a3a", textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
                Use &ldquo;Load Sample Image&rdquo; on the left to browse the media library.
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ width: 204, background: "#161616", borderLeft: "1px solid #1e1e1e", overflowY: "auto", flexShrink: 0 }}>
          <SectionLabel>Crop Settings</SectionLabel>

          <div style={{ padding: "0 8px 8px" }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
              {ASPECTS.slice(0, 3).map(a => (
                <AspectBtn key={a.key} aspect={a} selected={aspectKey === a.key} onClick={() => handleAspectChange(a.key, a.value)} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {ASPECTS.slice(3).map(a => (
                <AspectBtn key={a.key} aspect={a} selected={aspectKey === a.key} onClick={() => handleAspectChange(a.key, a.value)} />
              ))}
            </div>
          </div>

          {field.imageUrl && (
            <div style={{ padding: "0 12px 8px" }}>
              {[
                { label: "X",      val: Math.round((field.crop.x      / 100) * (field.naturalW || 100)) },
                { label: "Y",      val: Math.round((field.crop.y      / 100) * (field.naturalH || 100)) },
                { label: "Width",  val: Math.round((field.crop.width  / 100) * (field.naturalW || 100)) },
                { label: "Height", val: Math.round((field.crop.height / 100) * (field.naturalH || 100)) },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e1e" }}>
                  <span style={{ color: "#555", fontSize: 11 }}>{label}</span>
                  <span style={{ color: "#ccc", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{val}px</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "#555", fontSize: 11 }}>Aspect</span>
                <span style={{ color: "#ccc", fontSize: 11 }}>{currentAspect.label}</span>
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid #1e1e1e" }}>
            <SectionLabel>Focus Point</SectionLabel>
            <div style={{ padding: "0 12px 8px", fontSize: 10, color: "#444", lineHeight: 1.6 }}>
              Click anywhere on the image to set the focus point. Responsive crops will center around this point.
            </div>
            {[
              { label: "x %", val: Math.round(field.focusPoint.x) },
              { label: "y %", val: Math.round(field.focusPoint.y) },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 12px" }}>
                <span style={{ color: "#555" }}>{label}</span>
                <span style={{ color: "#ccc", fontVariantNumeric: "tabular-nums" }}>{val}%</span>
              </div>
            ))}
          </div>

          {field.imageUrl && (
            <div style={{ borderTop: "1px solid #1e1e1e" }}>
              <SectionLabel>Live Previews</SectionLabel>
              <div style={{ padding: "0 8px 12px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                {PREVIEWS.map(({ label, ar, w, h }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <CropPreview
                      imageUrl={field.imageUrl!}
                      crop={computeFocusCrop(ar, field.naturalW, field.naturalH, field.focusPoint)}
                      width={w}
                      height={h}
                    />
                    <span style={{ fontSize: 9, color: "#444" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid #1e1e1e" }}>
            <SectionLabel>SDK Field Value</SectionLabel>
            <div style={{ margin: "0 8px 12px", background: "#0d0d0d", borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 9, color: "#cc2222", marginBottom: 4, fontFamily: "monospace" }}>// target field value</div>
              <pre style={{ margin: 0, fontSize: 9, color: "#888", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>
                {JSON.stringify(fieldValue, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {showModal && client && (
        <MediaLibraryModal client={client} onSelect={handleMediaSelect} onClose={() => setShowModal(false)} />
      )}

      {error && (
        <div style={{ position: "fixed", bottom: 8, right: 8, padding: "8px 12px", background: "#600", borderRadius: 4, fontSize: 11, color: "#fff" }}>
          Error: {String(error)}
        </div>
      )}
    </div>
  );
}

export default CropFieldExtension;
