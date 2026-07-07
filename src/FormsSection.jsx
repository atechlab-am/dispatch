/**
 * FormsSection — displayed inside the TicketEditor.
 * Lists matching form templates for the ticket type, lets the user fill/edit/print each one.
 * Filled instances are saved per-ticket in the DB so they can be reopened.
 */
import { useState, useEffect } from "react";
import {
  listFormTemplates, listFormInstances,
  createFormInstance, updateFormInstance, deleteFormInstance,
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

// ─── Print helper ──────────────────────────────────────────────────────────────

function printInstance(instance, ticket) {
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const rows = instance.fields.map(f => {
    const val = instance.values[f.id];
    let display = "";
    if (f.type === "checkbox") display = val ? "✓ Yes" : "✗ No";
    else display = esc(val ?? "");
    return `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#5B6D82;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;vertical-align:top;width:220px">${esc(f.label)}${f.required ? " *" : ""}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0D1B2A;white-space:pre-wrap">${display || '<span style="color:#aaa">—</span>'}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(instance.template_name)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px;color:#0D1B2A}@media print{body{padding:0}}</style>
</head><body>
<div style="max-width:760px;margin:0 auto">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #1A5CBA">
    <div>
      <div style="font-size:22px;font-weight:800;color:#1A5CBA">${esc(instance.template_name)}</div>
      <div style="font-size:13px;color:#5B6D82;margin-top:4px">Ticket: ${esc(ticket?.id ?? "")} &mdash; ${esc(ticket?.title ?? "")}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#5B6D82">
      <div>Date: ${new Date().toLocaleDateString("en-CA")}</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    <tbody>${rows}</tbody>
  </table>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Fill modal ───────────────────────────────────────────────────────────────

function FillModal({ template, existing, ticket, onClose, onSaved, showToast }) {
  const initValues = () => {
    const v = {};
    template.fields.forEach(f => {
      v[f.id] = existing?.values?.[f.id] ?? (f.type === "checkbox" ? false : "");
    });
    return v;
  };
  const [values, setValues] = useState(initValues);
  const [saving, setSaving] = useState(false);

  const setVal = (id, val) => setValues(p => ({ ...p, [id]: val }));

  const handleSave = async () => {
    const missing = template.fields.filter(f => f.required && !values[f.id] && values[f.id] !== true);
    if (missing.length > 0) {
      showToast(`Required: ${missing.map(f => f.label).join(", ")}`, "err");
      return;
    }
    setSaving(true);
    try {
      let saved;
      if (existing) {
        saved = await updateFormInstance(existing.id, values);
      } else {
        saved = await createFormInstance(ticket.id, { template_id: template.id, values });
      }
      onSaved(saved);
      showToast("Form saved.", "ok");
      onClose();
    } catch (err) {
      showToast(err.response?.data?.detail ?? "Failed to save form.", "err");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const inst = existing
      ? { ...existing, values, fields: template.fields, template_name: template.name }
      : { values, fields: template.fields, template_name: template.name };
    printInstance(inst, ticket);
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(13,27,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" };
  const modal  = { background: "#fff", borderRadius: 12, padding: "28px 32px", width: 620, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ fontWeight: 800, fontSize: 17, color: brand.text, marginBottom: 6 }}>{template.name}</div>
        {template.description && <div style={{ fontSize: 13, color: brand.muted, marginBottom: 16 }}>{template.description}</div>}

        <div style={{ marginBottom: 20 }}>
          {template.fields.map(f => (
            <div key={f.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                {f.label}{f.required && <span style={{ color: brand.danger }}> *</span>}
              </div>
              {f.type === "text" && (
                <input style={inp} value={values[f.id] ?? ""} onChange={e => setVal(f.id, e.target.value)} placeholder={f.placeholder} />
              )}
              {f.type === "textarea" && (
                <textarea style={{ ...inp, height: 100, resize: "vertical" }} value={values[f.id] ?? ""} onChange={e => setVal(f.id, e.target.value)} placeholder={f.placeholder} />
              )}
              {f.type === "date" && (
                <input type="date" style={inp} value={values[f.id] ?? ""} onChange={e => setVal(f.id, e.target.value)} />
              )}
              {f.type === "checkbox" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!values[f.id]} onChange={e => setVal(f.id, e.target.checked)} />
                  {f.placeholder || f.label}
                </label>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <Btn onClick={handlePrint} variant="ghost">🖨 Print</Btn>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={onClose} variant="ghost">Cancel</Btn>
            <Btn onClick={handleSave} variant="accent" disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FormsSection({ ticket, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [instances, setInstances] = useState([]);
  const [fillTarget, setFillTarget] = useState(null); // { template, existing? }

  useEffect(() => {
    if (!ticket?.id || !ticket?.ticketType) return;
    Promise.all([
      listFormTemplates({ ticket_type: ticket.ticketType }),
      listFormInstances(ticket.id),
    ]).then(([tmpls, insts]) => {
      setTemplates(tmpls);
      setInstances(insts);
    }).catch(() => {});
  }, [ticket?.id, ticket?.ticketType]);

  if (templates.length === 0 && instances.length === 0) return null;

  const handleSaved = (saved) => {
    setInstances(p => {
      const idx = p.findIndex(i => i.id === saved.id);
      return idx >= 0 ? p.map(i => i.id === saved.id ? saved : i) : [...p, saved];
    });
  };

  const handleDelete = async (inst) => {
    if (!window.confirm(`Delete this filled copy of "${inst.template_name}"?`)) return;
    try {
      await deleteFormInstance(inst.id);
      setInstances(p => p.filter(i => i.id !== inst.id));
      showToast("Form deleted.", "ok");
    } catch {
      showToast("Failed to delete form.", "err");
    }
  };

  const handlePrintSaved = (inst) => printInstance(inst, ticket);

  const filledIds = new Set(instances.map(i => i.template_id));

  return (
    <>
      {fillTarget && (
        <FillModal
          template={fillTarget.template}
          existing={fillTarget.existing ?? null}
          ticket={ticket}
          onClose={() => setFillTarget(null)}
          onSaved={handleSaved}
          showToast={showToast}
        />
      )}

      {/* Available templates */}
      {templates.filter(t => !filledIds.has(t.id)).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Available Forms</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {templates.filter(t => !filledIds.has(t.id)).map(tmpl => (
              <button key={tmpl.id} type="button" onClick={() => setFillTarget({ template: tmpl })}
                style={{ background: brand.bg, border: `1.5px solid ${brand.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: brand.text, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                📋 {tmpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Saved instances */}
      {instances.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Filled Forms</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {instances.map(inst => {
              const tmpl = templates.find(t => t.id === inst.template_id);
              return (
                <div key={inst.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 8, padding: "10px 14px" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: brand.text }}>{inst.template_name}</div>
                    <div style={{ fontSize: 11, color: brand.muted, marginTop: 2 }}>
                      Last saved {new Date(inst.updated_at).toLocaleDateString("en-CA")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {tmpl && (
                      <Btn onClick={() => setFillTarget({ template: tmpl, existing: inst })} variant="secondary" small>Edit</Btn>
                    )}
                    <Btn onClick={() => handlePrintSaved(inst)} variant="ghost" small>🖨 Print</Btn>
                    <Btn onClick={() => handleDelete(inst)} variant="danger" small>Delete</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
