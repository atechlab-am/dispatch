import { useState, useEffect } from "react";
import {
  getDocumentBranding, updateDocumentBranding, getTemplatePlaceholders,
  previewInvoiceTemplate, previewQuoteTemplate,
} from "./api/documentBranding.js";
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

const DEFAULT_FORM = {
  company_name: "ATech Solutions",
  website: "atechsolutions.org",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  text_color: "#0F172A",
  muted_color: "#64748B",
  on_color_text: "#FFFFFF",
  logo_url: "",
  footer_text: "Thank you for your business",
  font_size_header: 22,
  font_size_body: 14,
  font_size_table: 13,
  font_size_totals: 15,
  use_custom_invoice_template: false,
  custom_invoice_template: "",
  use_custom_quote_template: false,
  custom_quote_template: "",
};

function FontSizeSlider({ label: sliderLabel, value, min, max, onChange }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{sliderLabel}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{value}px</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", cursor: "pointer" }} />
    </div>
  );
}

function openHtmlInNewTab(html) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function TemplateEditor({ docType, label: sectionLabel, useCustom, onToggle, template, onTemplateChange, placeholders, showToast }) {
  const [previewing, setPreviewing] = useState(false);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const html = docType === "invoice"
        ? await previewInvoiceTemplate(template)
        : await previewQuoteTemplate(template);
      openHtmlInNewTab(html);
    } catch (err) {
      showToast?.(err.response?.data?.detail || "Template has an error — check your {{placeholders}}.", "err");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", padding: 16, marginBottom: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#0f172a", cursor: "pointer", marginBottom: useCustom ? 12 : 0 }}>
        <input type="checkbox" checked={useCustom} onChange={e => onToggle(e.target.checked)} style={{ cursor: "pointer" }} />
        Use a custom {sectionLabel} template
      </label>
      {useCustom && (
        <>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>
            Raw HTML with <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: "var(--dispatch-radius-sm)" }}>{"{{placeholder}}"}</code> substitution.
            This completely replaces the built-in layout for {sectionLabel}s. See available placeholders below.
          </p>
          <textarea
            value={template}
            onChange={e => onTemplateChange(e.target.value)}
            spellCheck={false}
            placeholder={`<html>...</html>`}
            style={{ ...inp, minHeight: 220, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, resize: "vertical", whiteSpace: "pre" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <details style={{ fontSize: 12, color: "#64748b" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Available placeholders ({placeholders.length})</summary>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {placeholders.map(p => (
                  <code key={p} style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "var(--dispatch-radius-sm)", fontSize: 11 }}>{`{{${p}}}`}</code>
                ))}
              </div>
            </details>
            <button type="button" onClick={handlePreview} disabled={previewing || !template}
              style={{ padding: "6px 14px", borderRadius: "var(--dispatch-radius-md)", border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, fontWeight: 600, cursor: previewing || !template ? "not-allowed" : "pointer", fontFamily: "inherit", color: "#334155", flexShrink: 0 }}>
              {previewing ? "Rendering…" : "👁 Preview"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DocumentBrandingSettingsPanel({ onClose, showToast }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [placeholders, setPlaceholders] = useState({ invoice_placeholders: [], quote_placeholders: [] });

  useEffect(() => {
    getDocumentBranding()
      .then(setForm)
      .catch(() => showToast?.("Failed to load Quote/Invoice PDF settings.", "err"))
      .finally(() => setLoading(false));
    getTemplatePlaceholders().then(setPlaceholders).catch(() => {});
  }, []);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await updateDocumentBranding(form);
      setForm(saved);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      // A broken custom template comes back as a 422 with a specific error
      // (e.g. "Invoice template error: Unknown placeholder(s): foo") — show
      // that instead of a generic failure message so it's actually fixable.
      showToast?.(err.response?.data?.detail || "Failed to save Quote/Invoice PDF settings.", "err");
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
      <div style={{ background: "#fff", borderRadius: radius + 4, boxShadow: "0 4px 32px rgba(0,0,0,0.12)", padding: 28, marginBottom: 28, maxWidth: 820, color: "#64748b", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff", borderRadius: radius + 4,
      boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
      padding: 28, marginBottom: 28, maxWidth: 820,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Quote/Invoice PDF Settings</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Customize how generated quote and invoice PDFs and emails look. Independent from the app's Appearance settings.</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>×</button>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Company Identity</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            {label("Company Name")}
            <input style={inp} value={form.company_name} onChange={e => up("company_name", e.target.value)} placeholder="ATech Solutions" />
          </div>
          <div>
            {label("Website")}
            <input style={inp} value={form.website} onChange={e => up("website", e.target.value)} placeholder="atechsolutions.org" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            {label("Logo (upload or paste URL — leave blank for text logo)")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={inp} value={form.logo_url} onChange={e => up("logo_url", e.target.value)} placeholder="https://…/logo.png or upload →" />
              <UploadButton accept="image/*" onDataUrl={v => up("logo_url", v)} label="📁 Upload" />
              {form.logo_url && <button type="button" onClick={() => up("logo_url", "")} style={{ padding: "8px 10px", borderRadius: "var(--dispatch-radius-md)", border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12, color: "#ef4444", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕</button>}
            </div>
            {form.logo_url && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: "var(--dispatch-radius-md)", display: "inline-flex", alignItems: "center", gap: 12, border: "1px solid #e2e8f0" }}>
                <img src={form.logo_url} alt="Logo preview" style={{ maxHeight: 40, maxWidth: 180, objectFit: "contain" }} onError={e => e.target.style.display = "none"} />
                <span style={{ fontSize: 11, color: "#94a3b8" }}>preview</span>
              </div>
            )}
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            {label("Footer Text (shown on every PDF, after the company name/website)")}
            <input style={inp} value={form.footer_text} onChange={e => up("footer_text", e.target.value)} placeholder="Thank you for your business" />
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
              className="dispatch-pill"
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 20, border: `2px solid ${form.primary_color === p.primary ? p.primary : "#e2e8f0"}`,
                background: form.primary_color === p.primary ? `${p.primary}12` : "#fff",
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
            {label("Primary Color (PDF header background)")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.primary_color} onChange={e => up("primary_color", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.primary_color} onChange={e => up("primary_color", e.target.value)} placeholder="#1A5CBA" />
            </div>
          </div>
          <div>
            {label("Accent Color (wordmark highlight)")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.accent_color} onChange={e => up("accent_color", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.accent_color} onChange={e => up("accent_color", e.target.value)} placeholder="#E8A020" />
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Font Colors</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            {label("Body Text")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.text_color} onChange={e => up("text_color", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.text_color} onChange={e => up("text_color", e.target.value)} placeholder="#0F172A" />
            </div>
          </div>
          <div>
            {label("Muted Text")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.muted_color} onChange={e => up("muted_color", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.muted_color} onChange={e => up("muted_color", e.target.value)} placeholder="#64748B" />
            </div>
          </div>
          <div>
            {label("Text on Header")}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.on_color_text} onChange={e => up("on_color_text", e.target.value)}
                style={{ width: 40, height: 36, border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-md)", cursor: "pointer", padding: 2, background: "#fff" }} />
              <input style={{ ...inp }} value={form.on_color_text} onChange={e => up("on_color_text", e.target.value)} placeholder="#FFFFFF" />
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Font Sizes</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <FontSizeSlider label="Header / Logo" value={form.font_size_header} min={10} max={48} onChange={v => up("font_size_header", v)} />
          <FontSizeSlider label="Body Text" value={form.font_size_body} min={8} max={24} onChange={v => up("font_size_body", v)} />
          <FontSizeSlider label="Table Headers" value={form.font_size_table} min={8} max={24} onChange={v => up("font_size_table", v)} />
          <FontSizeSlider label="Totals" value={form.font_size_totals} min={8} max={28} onChange={v => up("font_size_totals", v)} />
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14, marginTop: 0 }}>Advanced: Custom Templates</h3>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>
          For full control over layout — where text is placed, table structure, everything. When enabled, this replaces the settings above for that document type.
        </p>
        <TemplateEditor
          docType="invoice" label="invoice"
          useCustom={form.use_custom_invoice_template}
          onToggle={v => up("use_custom_invoice_template", v)}
          template={form.custom_invoice_template}
          onTemplateChange={v => up("custom_invoice_template", v)}
          placeholders={placeholders.invoice_placeholders}
          showToast={showToast}
        />
        <TemplateEditor
          docType="quote" label="quote"
          useCustom={form.use_custom_quote_template}
          onToggle={v => up("use_custom_quote_template", v)}
          template={form.custom_quote_template}
          onTemplateChange={v => up("custom_quote_template", v)}
          placeholders={placeholders.quote_placeholders}
          showToast={showToast}
        />
      </section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "var(--dispatch-radius-md)", border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#64748b" }}>
          Close
        </button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "9px 24px", borderRadius: "var(--dispatch-radius-md)", border: "none", background: "#1A5CBA", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px #1A5CBA44", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
