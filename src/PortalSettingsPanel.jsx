import { useState, useEffect } from "react";
import { getPortalBranding, updatePortalBranding } from "./api/portalBranding.js";
import { UploadButton, PRESET_PALETTES } from "./brandingUpload.jsx";

const radius = 10;
const inp = {
  width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0",
  borderRadius: 8, fontSize: 13, fontFamily: "inherit",
  background: "#fff", color: "#0f172a", outline: "none", boxSizing: "border-box",
};
const label = (text) => (
  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>{text}</label>
);

const DEFAULT_FORM = {
  company_name: "ATech Solutions",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  logo_url: "",
};

export default function PortalSettingsPanel({ onClose, showToast }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPortalBranding()
      .then(setForm)
      .catch(() => showToast?.("Failed to load Client Portal settings.", "err"))
      .finally(() => setLoading(false));
  }, []);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await updatePortalBranding(form);
      setForm(saved);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      showToast?.("Failed to save Client Portal settings.", "err");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (p) => {
    up("primary_color", p.primary);
    up("accent_color", p.accent);
  };

  if (loading) {
    return (
      <div style={{ background: "#fff", borderRadius: radius + 4, boxShadow: "0 4px 32px rgba(0,0,0,0.12)", padding: 28, marginBottom: 28, maxWidth: 680, color: "#64748b", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff", borderRadius: radius + 4,
      boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
      padding: 28, marginBottom: 28, maxWidth: 680,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Client Portal Settings</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Customize the Client Portal's look. Independent from the staff app and Login page settings.</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>×</button>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Company Identity</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            {label("Company Name")}
            <input style={inp} value={form.company_name} onChange={e => up("company_name", e.target.value)} placeholder="ATech Solutions" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            {label("Logo (upload or paste URL — leave blank for text logo)")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={inp} value={form.logo_url} onChange={e => up("logo_url", e.target.value)} placeholder="https://…/logo.png or upload →" />
              <UploadButton accept="image/*" onDataUrl={v => up("logo_url", v)} label="📁 Upload" />
              {form.logo_url && <button type="button" onClick={() => up("logo_url", "")} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12, color: "#ef4444", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕</button>}
            </div>
            {form.logo_url && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 12, border: "1px solid #e2e8f0" }}>
                <img src={form.logo_url} alt="Logo preview" style={{ maxHeight: 40, maxWidth: 180, objectFit: "contain" }} onError={e => e.target.style.display = "none"} />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>preview</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Color Palette</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {PRESET_PALETTES.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 20, border: `2px solid ${form.primary_color === p.primary ? p.primary : "#e2e8f0"}`,
                background: form.primary_color === p.primary ? `${p.primary}12` : "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#334155", fontFamily: "inherit",
              }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.primary, flexShrink: 0 }} />
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.accent, flexShrink: 0 }} />
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            {label("Primary Color")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.primary_color} onChange={e => up("primary_color", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.primary_color} onChange={e => up("primary_color", e.target.value)} placeholder="#1A5CBA" />
            </div>
          </div>
          <div>
            {label("Accent Color")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.accent_color} onChange={e => up("accent_color", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.accent_color} onChange={e => up("accent_color", e.target.value)} placeholder="#E8A020" />
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#64748b" }}>
          Close
        </button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: form.primary_color, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: `0 2px 8px ${form.primary_color}44`, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
