import { useState, useRef } from "react";

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadButton({ accept, onDataUrl, label: btnLabel }) {
  const ref = useRef();
  const [loading, setLoading] = useState(false);
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      onDataUrl(dataUrl);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };
  return (
    <>
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }} onChange={handleChange} />
      <button
        type="button"
        onClick={() => ref.current.click()}
        disabled={loading}
        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, fontWeight: 600, color: "#334155", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
        {loading ? "…" : btnLabel}
      </button>
    </>
  );
}

export const PRESET_PALETTES = [
  { name: "ATech Blue",   primary: "#1A5CBA", accent: "#E8A020" },
  { name: "Slate",        primary: "#334155", accent: "#f97316" },
  { name: "Indigo",       primary: "#4f46e5", accent: "#ec4899" },
  { name: "Emerald",      primary: "#059669", accent: "#f59e0b" },
  { name: "Rose",         primary: "#e11d48", accent: "#7c3aed" },
  { name: "Midnight",     primary: "#0369a1", accent: "#06b6d4" },
];
