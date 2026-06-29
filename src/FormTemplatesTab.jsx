/**
 * FormTemplatesTab — admin UI for building and managing form templates.
 * Rendered inside DocumentsPage as a "Form Templates" tab.
 */
import { useState, useEffect } from "react";
import {
  listFormTemplates, createFormTemplate, updateFormTemplate, deleteFormTemplate,
} from "./api/formTemplates.js";

const brand = {
  blue: "#1A5CBA", accent: "#E8A020", bg: "#F4F7FC", surface: "#FFFFFF",
  border: "#D8E2F0", text: "#0D1B2A", muted: "#5B6D82",
  success: "#1a8f4a", danger: "#c0392b",
};

const inp = {
  width: "100%", padding: "8px 11px", border: `1px solid ${brand.border}`,
  borderRadius: 6, fontSize: 13, color: brand.text, background: "#fff",
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
    {children}
  </div>
);

const Btn = ({ onClick, children, variant = "primary", small, disabled, type = "button" }) => {
  const s = {
    primary:   { background: brand.blue,   color: "#fff",       border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",        color: brand.danger, border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,  color: "#fff",       border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
};

const TICKET_TYPES = ["Incident", "Request", "Change Request"];
const FIELD_TYPES = [
  { value: "text",     label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "date",     label: "Date" },
  { value: "checkbox", label: "Checkbox" },
];

function mkField() {
  return { id: `field_${Date.now()}`, label: "", type: "text", required: false, placeholder: "" };
}

// ─── Field builder row ────────────────────────────────────────────────────────

function FieldRow({ field, index, total, onChange, onRemove, onMove }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto auto auto", gap: 8, alignItems: "center", background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
      <div>
        <FieldLabel>Label</FieldLabel>
        <input style={inp} value={field.label} onChange={e => onChange({ ...field, label: e.target.value })} placeholder="e.g. Scope of Work" />
      </div>
      <div>
        <FieldLabel>Type</FieldLabel>
        <select style={inp} value={field.type} onChange={e => onChange({ ...field, type: e.target.value })}>
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div style={{ paddingTop: 18 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={field.required} onChange={e => onChange({ ...field, required: e.target.checked })} />
          Required
        </label>
      </div>
      <div style={{ paddingTop: 18, display: "flex", gap: 4 }}>
        <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}
          style={{ background: "none", border: `1px solid ${brand.border}`, borderRadius: 4, cursor: index === 0 ? "not-allowed" : "pointer", padding: "3px 7px", fontSize: 12, opacity: index === 0 ? 0.4 : 1 }}>▲</button>
        <button type="button" onClick={() => onMove(index, 1)} disabled={index === total - 1}
          style={{ background: "none", border: `1px solid ${brand.border}`, borderRadius: 4, cursor: index === total - 1 ? "not-allowed" : "pointer", padding: "3px 7px", fontSize: 12, opacity: index === total - 1 ? 0.4 : 1 }}>▼</button>
      </div>
      <div style={{ paddingTop: 18 }}>
        <button type="button" onClick={onRemove}
          style={{ background: "none", border: "none", cursor: "pointer", color: brand.danger, fontSize: 18, lineHeight: 1, padding: "2px 4px" }}>×</button>
      </div>
    </div>
  );
}

// ─── Template editor modal ────────────────────────────────────────────────────

function TemplateModal({ existing, onClose, onSaved, showToast }) {
  const [form, setForm] = useState(existing
    ? { name: existing.name, description: existing.description, ticket_types: existing.ticket_types, fields: existing.fields.map(f => ({ ...f })) }
    : { name: "", description: "", ticket_types: [], fields: [] }
  );
  const [saving, setSaving] = useState(false);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const upField = (i, patch) => up("fields", form.fields.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const moveField = (i, dir) => {
    const next = [...form.fields];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    up("fields", next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast("Template name is required.", "err"); return; }
    const ids = form.fields.map(f => f.id.trim()).filter(Boolean);
    if (new Set(ids).size !== ids.length) { showToast("Field IDs must be unique.", "err"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        ticket_types: form.ticket_types,
        fields: form.fields.map(f => ({
          id: f.id || `field_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          label: f.label || "Untitled Field",
          type: f.type,
          required: f.required,
          placeholder: f.placeholder || "",
        })),
      };
      const saved = existing
        ? await updateFormTemplate(existing.id, payload)
        : await createFormTemplate(payload);
      onSaved(saved);
      showToast(existing ? "Template updated." : "Template created.", "ok");
      onClose();
    } catch (err) {
      showToast(err.response?.data?.detail ?? "Failed to save template.", "err");
    } finally {
      setSaving(false);
    }
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(13,27,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" };
  const modal  = { background: "#fff", borderRadius: 12, padding: "28px 32px", width: 680, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ fontWeight: 800, fontSize: 17, color: brand.text, marginBottom: 20 }}>
          {existing ? "Edit Template" : "New Form Template"}
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Template Name</FieldLabel>
            <input style={inp} value={form.name} onChange={e => up("name", e.target.value)} placeholder="e.g. Scope of Work" required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Description</FieldLabel>
            <textarea style={{ ...inp, height: 52, resize: "vertical" }} value={form.description} onChange={e => up("description", e.target.value)} placeholder="Optional description" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <FieldLabel>Applies to Ticket Types (leave empty for all)</FieldLabel>
            <div style={{ display: "flex", gap: 12 }}>
              {TICKET_TYPES.map(t => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.ticket_types.includes(t)}
                    onChange={e => up("ticket_types", e.target.checked ? [...form.ticket_types, t] : form.ticket_types.filter(x => x !== t))} />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <FieldLabel>Fields</FieldLabel>
              <Btn onClick={() => up("fields", [...form.fields, mkField()])} variant="secondary" small type="button">+ Add Field</Btn>
            </div>
            {form.fields.length === 0
              ? <div style={{ color: brand.muted, fontSize: 13, padding: "12px 0" }}>No fields yet. Click "+ Add Field" to start.</div>
              : form.fields.map((f, i) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  index={i}
                  total={form.fields.length}
                  onChange={patch => upField(i, patch)}
                  onRemove={() => up("fields", form.fields.filter((_, idx) => idx !== i))}
                  onMove={moveField}
                />
              ))
            }
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <Btn onClick={onClose} variant="ghost" type="button">Cancel</Btn>
            <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : "Save Template"}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

export default function FormTemplatesTab({ showToast, isAdmin }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);  // null = closed, false = new, obj = edit
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    listFormTemplates()
      .then(setTemplates)
      .catch(() => showToast("Failed to load templates.", "err"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSaved = (saved) => {
    setTemplates(p => {
      const idx = p.findIndex(t => t.id === saved.id);
      return idx >= 0 ? p.map(t => t.id === saved.id ? saved : t) : [...p, saved];
    });
  };

  const handleDelete = async (tmpl) => {
    if (!window.confirm(`Delete template "${tmpl.name}"? All filled instances will also be deleted.`)) return;
    try {
      await deleteFormTemplate(tmpl.id);
      setTemplates(p => p.filter(t => t.id !== tmpl.id));
      showToast("Template deleted.", "ok");
    } catch {
      showToast("Failed to delete template.", "err");
    }
  };

  const visible = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const typeBadge = (t) => (
    <span style={{ background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 20, padding: "2px 9px", fontSize: 11 }}>
      {FIELD_TYPES.find(ft => ft.value === t)?.label ?? t}
    </span>
  );

  return (
    <div>
      {editTarget !== null && (
        <TemplateModal
          existing={editTarget || null}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
          showToast={showToast}
        />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <FieldLabel>Search</FieldLabel>
          <input style={inp} value={search} onChange={e => setSearch(e.target.value)} placeholder="Template name…" />
        </div>
        {isAdmin && (
          <Btn onClick={() => setEditTarget(false)} variant="accent">+ New Template</Btn>
        )}
      </div>

      {loading
        ? <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>
        : visible.length === 0
          ? <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>No form templates yet.</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {visible.map(tmpl => (
                <div key={tmpl.id} style={{ border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 18px", background: brand.surface }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 4 }}>{tmpl.name}</div>
                      {tmpl.description && <div style={{ fontSize: 12, color: brand.muted, marginBottom: 6 }}>{tmpl.description}</div>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        {tmpl.ticket_types.length === 0
                          ? <span style={{ fontSize: 12, color: brand.muted }}>All ticket types</span>
                          : tmpl.ticket_types.map(t => (
                            <span key={t} style={{ background: "#e0eaff", color: brand.blue, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{t}</span>
                          ))
                        }
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tmpl.fields.map(f => (
                          <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 20, padding: "2px 9px", fontSize: 11 }}>
                            {f.label}
                            <span style={{ color: brand.muted, fontSize: 10 }}>({FIELD_TYPES.find(ft => ft.value === f.type)?.label ?? f.type})</span>
                            {f.required && <span style={{ color: brand.danger, fontSize: 10 }}>*</span>}
                          </span>
                        ))}
                        {tmpl.fields.length === 0 && <span style={{ fontSize: 12, color: brand.muted }}>No fields defined</span>}
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <Btn onClick={() => setEditTarget(tmpl)} variant="secondary" small>Edit</Btn>
                        <Btn onClick={() => handleDelete(tmpl)} variant="danger" small>Delete</Btn>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
      }
    </div>
  );
}
