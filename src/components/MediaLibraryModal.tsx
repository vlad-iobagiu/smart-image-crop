"use client";

import { useState } from "react";
import { ClientSDK } from "@sitecore-marketplace-sdk/client";
import MediaLibraryTree from "./MediaLibraryTree";

interface MediaItem {
  id: string;
  displayName: string;
  mediaUrl?: string;
}

interface Props {
  client: ClientSDK;
  onSelect: (item: MediaItem) => void;
  onClose: () => void;
}

export default function MediaLibraryModal({ client, onSelect, onClose }: Props) {
  const [selectedId, setSelectedId] = useState("");

  const handleSelect = (item: MediaItem) => {
    setSelectedId(item.id);
    onSelect(item);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", width: 440, maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Select Image from Media Library</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          <MediaLibraryTree client={client} language="en" selectedId={selectedId} onSelect={handleSelect} />
        </div>
      </div>
    </div>
  );
}
