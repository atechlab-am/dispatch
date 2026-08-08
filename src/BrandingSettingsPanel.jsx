import { useState } from "react";
import { useBranding } from "./branding.jsx";
import { UploadButton, PRESET_PALETTES } from "./brandingUpload.jsx";

const radius = 10;
const inp = {
  width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0",
  borderRadius: "var(--dispatch-radius-md)", fontSize: 13, fontFamily: "inherit",
  background: "#fff", color: "#0f172a", outline: "none", boxSizing: "border-box",
};
const label = (text) => (
  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>{text}</label>
);

export default function BrandingSettingsPanel({ onClose, showToast }) {
  const branding = useBranding();

  // Snapshot of branding when panel opened — used to revert on cancel
  const [original] = useState(() => ({
    companyName:  branding.companyName,
    tagline:      branding.tagline,
    primaryColor: branding.primaryColor,
    accentColor:  branding.accentColor,
    textColor:    branding.textColor,
    mutedColor:   branding.mutedColor,
    onColorText:  branding.onColorText,
    logoUrl:      branding.logoUrl,
    faviconUrl:   branding.faviconUrl,
    sidebarDark:  branding.sidebarDark,
  }));
  const [form, setForm] = useState({ ...original });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Apply every change live so the sidebar/UI updates instantly
  const up = (k, v) => {
    const next = { ...form, [k]: v };
    setForm(next);
    branding.update(next);   // live preview only — not yet persisted
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await branding.save(form);   // persists server-side, shared by everyone
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      showToast?.("Failed to save appearance settings.", "err");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    branding.update(original);  // revert live changes
    onClose();
  };

  const applyPreset = (p) => {
    up("primaryColor", p.primary);
    up("accentColor", p.accent);
  };

  return (
    <div style={{
      background: "#fff", borderRadius: radius + 4,
      boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
      padding: 28, marginBottom: 28, maxWidth: 680,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Appearance Settings</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Customize branding for the New UI. Changes apply to everyone using this app.</p>
        </div>
        <button onClick={handleCancel} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>×</button>
      </div>

      {/* Company identity */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Company Identity</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            {label("Company Name")}
            <input style={inp} value={form.companyName} onChange={e => up("companyName", e.target.value)} placeholder="Your Company" />
          </div>
          <div>
            {label("Tagline")}
            <input style={inp} value={form.tagline} onChange={e => up("tagline", e.target.value)} placeholder="IT Support & Managed Services" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            {label("Logo (upload or paste URL — leave blank for text logo)")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={inp} value={form.logoUrl} onChange={e => up("logoUrl", e.target.value)} placeholder="https://…/logo.png or upload →" />
              <UploadButton accept="image/*" onDataUrl={v => up("logoUrl", v)} label="📁 Upload" />
              {form.logoUrl && <button type="button" onClick={() => up("logoUrl", "")} style={{ padding: "8px 10px", borderRadius: "var(--dispatch-radius-md)", border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12, color: "#ef4444", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕</button>}
            </div>
            {form.logoUrl && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: "var(--dispatch-radius-md)", display: "inline-flex", alignItems: "center", gap: 12, border: "1px solid #e2e8f0" }}>
                <img src={form.logoUrl} alt="Logo preview" style={{ maxHeight: 40, maxWidth: 180, objectFit: "contain" }} onError={e => e.target.style.display = "none"} />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>preview</span>
              </div>
            )}
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            {label("Favicon (upload .ico/.png or paste URL — leave blank for default)")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={inp} value={form.faviconUrl} onChange={e => up("faviconUrl", e.target.value)} placeholder="https://…/favicon.ico or upload →" />
              <UploadButton accept=".ico,.png,.svg,image/x-icon,image/png,image/svg+xml" onDataUrl={v => up("faviconUrl", v)} label="📁 Upload" />
              {form.faviconUrl && <button type="button" onClick={() => up("faviconUrl", "")} style={{ padding: "8px 10px", borderRadius: "var(--dispatch-radius-md)", border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12, color: "#ef4444", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕</button>}
            </div>
            {form.faviconUrl && (
              <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <img src={form.faviconUrl} alt="Favicon preview" style={{ width: 24, height: 24, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-sm)", background: "#fff", padding: 2 }} onError={e => e.target.style.display = "none"} />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>browser tab preview</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Color presets */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Color Palette</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {PRESET_PALETTES.map(p => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="dispatch-pill"
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 20, border: `2px solid ${form.primaryColor === p.primary ? p.primary : "#e2e8f0"}`,
                background: form.primaryColor === p.primary ? `${p.primary}12` : "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#334155", fontFamily: "inherit",
              }}>
              <span className="dispatch-pill" style={{ width: 12, height: 12, borderRadius: "50%", background: p.primary, flexShrink: 0 }} />
              <span className="dispatch-pill" style={{ width: 12, height: 12, borderRadius: "50%", background: p.accent, flexShrink: 0 }} />
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            {label("Primary Color")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.primaryColor} onChange={e => up("primaryColor", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.primaryColor} onChange={e => up("primaryColor", e.target.value)} placeholder="#2563EB" />
            </div>
          </div>
          <div>
            {label("Accent Color")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.accentColor} onChange={e => up("accentColor", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.accentColor} onChange={e => up("accentColor", e.target.value)} placeholder="#F59E0B" />
            </div>
          </div>
        </div>
      </section>

      {/* Font colors */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Font Colors</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            {label("Body Text")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.textColor} onChange={e => up("textColor", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.textColor} onChange={e => up("textColor", e.target.value)} placeholder="#0D1B2A" />
            </div>
          </div>
          <div>
            {label("Muted Text")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.mutedColor} onChange={e => up("mutedColor", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.mutedColor} onChange={e => up("mutedColor", e.target.value)} placeholder="#5B6D82" />
            </div>
          </div>
          <div>
            {label("Text on Buttons/Headers")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.onColorText} onChange={e => up("onColorText", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.onColorText} onChange={e => up("onColorText", e.target.value)} placeholder="#FFFFFF" />
            </div>
          </div>
        </div>
      </section>

      {/* Sidebar style */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Sidebar Style</h3>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { val: true,  label: "Dark",  bg: "#0f172a", text: "#fff" },
            { val: false, label: "Light", bg: "#f8fafc", text: "#1e293b" },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => up("sidebarDark", opt.val)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                borderRadius: "var(--dispatch-radius-lg)", border: `2px solid ${form.sidebarDark === opt.val ? form.primaryColor : "#e2e8f0"}`,
                background: opt.bg, cursor: "pointer", fontFamily: "inherit",
              }}>
              <div style={{ width: 32, height: 48, borderRadius: "var(--dispatch-radius-md)", background: opt.bg, border: "1px solid rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", padding: 4, gap: 3 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 6, borderRadius: "var(--dispatch-radius-sm)", background: opt.val ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)" }} />)}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: opt.val ? "#fff" : "#0f172a" }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Live preview chip */}
      <div style={{ background: "#f8fafc", borderRadius: "var(--dispatch-radius-lg)", padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Preview:</span>
        <div style={{ background: form.primaryColor, color: "#fff", borderRadius: "var(--dispatch-radius-md)", padding: "6px 14px", fontSize: 12, fontWeight: 700 }}>Primary button</div>
        <div style={{ background: form.accentColor, color: "#fff", borderRadius: "var(--dispatch-radius-md)", padding: "6px 14px", fontSize: 12, fontWeight: 700 }}>Accent button</div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>
          <span style={{ color: form.primaryColor }}>{form.companyName.split(" ")[0]}</span>
          {form.companyName.includes(" ") && <span> {form.companyName.split(" ").slice(1).join(" ")}</span>}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={handleCancel} style={{ padding: "9px 20px", borderRadius: "var(--dispatch-radius-md)", border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#64748b" }}>
          Cancel (revert)
        </button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "9px 24px", borderRadius: "var(--dispatch-radius-md)", border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px #2563EB44", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
