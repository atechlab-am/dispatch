import { useState, useEffect, useRef, useCallback } from "react";
import { listDocuments, uploadDocument, updateDocument, deleteDocument, downloadUrl } from "./api/documents.js";
import { downloadWithAuth } from "./api/client.js";
import FormTemplatesTab from "./FormTemplatesTab.jsx";

const brand = {
  blue: "var(--dispatch-primary)",
  accent: "#F59E0B",
  bg: "var(--dispatch-bg)",
  surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)",
  text: "var(--dispatch-text)",
  muted: "var(--dispatch-muted)",
  danger: "#c0392b",
};

const inp = {
  width: "100%",
  padding: "8px 11px",
  border: `1px solid ${brand.border}`,
  borderRadius: "var(--dispatch-radius-md)",
  fontSize: 13,
  color: brand.text,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const TICKET_TYPES = ["Incident", "Request", "Change Request"];

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
    {children}
  </div>
);

const Btn = ({ onClick, children, variant = "primary", small, disabled, type = "button" }) => {
  const s = {
    primary:   { background: brand.blue,   color: "var(--dispatch-on-color)",       border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",        color: brand.danger, border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,  color: "var(--dispatch-on-color)",       border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: "var(--dispatch-radius-md)", fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
};

function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = (raw) => {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setInput("");
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-md)", padding: "5px 8px", background: "#fff", minHeight: 36 }}>
      {value.map(t => (
        <span key={t} className="dispatch-pill" style={{ background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 20, padding: "2px 8px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          {t}
          <button type="button" onClick={() => onChange(value.filter(x => x !== t))}
            style={{ background: "none", border: "none", cursor: "pointer", color: brand.muted, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); } }}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={value.length === 0 ? placeholder : ""}
        style={{ border: "none", outline: "none", fontSize: 13, flex: 1, minWidth: 80, background: "transparent", color: brand.text }}
      />
    </div>
  );
}

const ALLOWED_EXTS = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png";

function mkRow(file) {
  return {
    id: `${file.name}-${Date.now()}-${Math.random()}`,
    file,
    name: file.name.replace(/\.[^.]+$/, ""),
    category: "on_demand_support",
    ticket_types: [],
    tags: [],
    requires_signature: false,
    status: "pending", // pending | uploading | done | error
    error: null,
  };
}

function BulkUploadZone({ onUploaded, showToast }) {
  const [rows, setRows] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();
  const rowsRef = useRef([]);

  const setRowsSync = (updater) => {
    setRows(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      rowsRef.current = next;
      return next;
    });
  };

  const addFiles = useCallback((files) => {
    const next = Array.from(files).map(mkRow);
    setRowsSync(p => [...p, ...next]);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const upRow = (id, patch) => setRowsSync(p => p.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeRow = (id) => setRowsSync(p => p.filter(r => r.id !== id));

  const handleUploadAll = async () => {
    const pending = rowsRef.current.filter(r => r.status === "pending");
    if (pending.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const row of pending) {
      // skip if removed by user while upload was in progress
      if (!rowsRef.current.find(r => r.id === row.id)) continue;
      upRow(row.id, { status: "uploading" });
      try {
        // verify the file is readable before sending to server
        await row.file.slice(0, 4).arrayBuffer();
        const doc = await uploadDocument(row.file, {
          name: row.name.trim() || row.file.name,
          description: "",
          category: row.category,
          ticket_types: row.ticket_types.join(","),
          tags: row.tags.join(","),
          requires_signature: row.requires_signature,
        });
        upRow(row.id, { status: "done" });
        onUploaded(doc);
        successCount++;
      } catch (err) {
        console.error("Upload failed for", row.file.name, "status:", err.response?.status, "data:", err.response?.data, "message:", err.message, "name:", err.name, "err:", err);
        const msg = err.response?.data?.detail ?? err.message ?? "Upload failed";
        upRow(row.id, { status: "error", error: typeof msg === "string" ? msg : JSON.stringify(msg) });
      }
    }
    setUploading(false);
    if (successCount > 0) showToast(`${successCount} document${successCount > 1 ? "s" : ""} uploaded.`, "ok");
  };

  const clearDone = () => setRows(p => p.filter(r => r.status !== "done"));
  const pendingCount = rows.filter(r => r.status === "pending").length;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
        style={{
          border: `2px dashed ${dragOver ? brand.blue : brand.border}`,
          borderRadius: "var(--dispatch-radius-lg)",
          background: dragOver ? "#eef4ff" : brand.bg,
          padding: "32px 20px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.15s",
          marginBottom: rows.length > 0 ? 16 : 0,
        }}
      >
        <input ref={inputRef} type="file" multiple accept={ALLOWED_EXTS}
          style={{ display: "none" }}
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 4 }}>
          Drag & drop files here, or click to browse
        </div>
        <div style={{ fontSize: 12, color: brand.muted }}>
          PDF, Word, Excel, PowerPoint, text, images · 20 MB max per file
        </div>
      </div>

      {/* Queued rows */}
      {rows.length > 0 && (
        <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["File", "Name", "Category", "Ticket Types", "Requires Sig.", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} style={{ background: row.status === "done" ? "#f0fdf4" : row.status === "error" ? "#fff5f5" : "#fff" }}>
                  <td style={{ padding: "10px 12px", borderBottom: `1px solid ${brand.border}`, fontSize: 12, color: brand.muted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.file.name}
                  </td>
                  <td style={{ padding: "6px 12px", borderBottom: `1px solid ${brand.border}` }}>
                    <input
                      value={row.name}
                      onChange={e => upRow(row.id, { name: e.target.value })}
                      disabled={row.status !== "pending"}
                      style={{ ...inp, padding: "5px 8px", fontSize: 12, width: 160 }}
                    />
                  </td>
                  <td style={{ padding: "6px 12px", borderBottom: `1px solid ${brand.border}` }}>
                    <select
                      value={row.category}
                      onChange={e => upRow(row.id, { category: e.target.value })}
                      disabled={row.status !== "pending"}
                      style={{ ...inp, padding: "5px 8px", fontSize: 12, width: 200 }}
                    >
                      {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "6px 12px", borderBottom: `1px solid ${brand.border}` }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, minWidth: 180 }}>
                      {TICKET_TYPES.map(t => (
                        <label key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: row.status === "pending" ? "pointer" : "default", color: brand.text }}>
                          <input
                            type="checkbox"
                            checked={row.ticket_types.includes(t)}
                            disabled={row.status !== "pending"}
                            onChange={e => upRow(row.id, {
                              ticket_types: e.target.checked
                                ? [...row.ticket_types, t]
                                : row.ticket_types.filter(x => x !== t),
                            })}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "6px 12px", borderBottom: `1px solid ${brand.border}`, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.requires_signature}
                      disabled={row.status !== "pending"}
                      onChange={e => upRow(row.id, { requires_signature: e.target.checked })}
                    />
                  </td>
                  <td style={{ padding: "6px 12px", borderBottom: `1px solid ${brand.border}`, fontSize: 12, whiteSpace: "nowrap" }}>
                    {row.status === "pending"   && <span style={{ color: brand.muted }}>Ready</span>}
                    {row.status === "uploading" && <span style={{ color: brand.blue }}>Uploading…</span>}
                    {row.status === "done"      && <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ Done</span>}
                    {row.status === "error"     && <span style={{ color: brand.danger }}>✗ {row.error || "Error"}</span>}
                  </td>
                  <td style={{ padding: "6px 12px", borderBottom: `1px solid ${brand.border}` }}>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={row.status === "uploading"}
                      style={{ background: "none", border: "none", cursor: "pointer", color: brand.muted, fontSize: 16, lineHeight: 1, padding: "2px 4px" }}
                      title="Remove"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ padding: "10px 14px", background: brand.bg, display: "flex", gap: 10, alignItems: "center" }}>
            <Btn onClick={handleUploadAll} variant="accent" small disabled={uploading || pendingCount === 0}>
              {uploading ? "Uploading…" : `Upload ${pendingCount} file${pendingCount !== 1 ? "s" : ""}`}
            </Btn>
            {rows.some(r => r.status === "done") && (
              <Btn onClick={clearDone} variant="ghost" small>Clear done</Btn>
            )}
            <span style={{ fontSize: 12, color: brand.muted, marginLeft: "auto" }}>
              {rows.filter(r => r.status === "done").length} done · {rows.filter(r => r.status === "error").length} errors · {pendingCount} pending
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadDocModal({ onClose, onUploaded, showToast }) {
  const [form, setForm] = useState({ name: "", description: "", category: "on_demand_support", ticket_types: [], tags: [], requires_signature: false });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { showToast("Please select a file.", "err"); return; }
    if (!form.name.trim()) { showToast("Name is required.", "err"); return; }
    setSaving(true);
    try {
      const doc = await uploadDocument(file, {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        ticket_types: form.ticket_types.join(","),
        tags: form.tags.join(","),
        requires_signature: form.requires_signature,
      });
      onUploaded(doc);
      showToast("Document uploaded.", "ok");
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Upload failed.";
      showToast(typeof msg === "string" ? msg : JSON.stringify(msg), "err");
    } finally {
      setSaving(false);
    }
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(13,27,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" };
  const modal = { background: "#fff", borderRadius: "var(--dispatch-radius-lg)", padding: "28px 32px", width: 540, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ fontWeight: 800, fontSize: 17, color: brand.text, marginBottom: 20 }}>Upload Document</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>File</FieldLabel>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
              onChange={e => { setFile(e.target.files[0] || null); if (!form.name && e.target.files[0]) up("name", e.target.files[0].name.replace(/\.[^.]+$/, "")); }}
              style={{ fontSize: 13, color: brand.text }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Name</FieldLabel>
            <input style={inp} value={form.name} onChange={e => up("name", e.target.value)} placeholder="Document name" required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Description</FieldLabel>
            <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={form.description} onChange={e => up("description", e.target.value)} placeholder="Optional description" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Category</FieldLabel>
            <select style={inp} value={form.category} onChange={e => up("category", e.target.value)}>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Ticket Types (leave empty for all types)</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              {TICKET_TYPES.map(t => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.ticket_types.includes(t)}
                    onChange={e => up("ticket_types", e.target.checked ? [...form.ticket_types, t] : form.ticket_types.filter(x => x !== t))} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Tags (press Enter or comma to add)</FieldLabel>
            <TagInput value={form.tags} onChange={v => up("tags", v)} placeholder="e.g. networking, backup" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.requires_signature} onChange={e => up("requires_signature", e.target.checked)} />
              Requires client signature
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn onClick={onClose} variant="ghost">Cancel</Btn>
            <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Uploading…" : "Upload"}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditDocModal({ doc, onClose, onUpdated, showToast }) {
  const [form, setForm] = useState({
    name: doc.name,
    description: doc.description,
    category: doc.category,
    ticket_types: doc.ticket_types,
    tags: doc.tags,
    requires_signature: doc.requires_signature,
  });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateDocument(doc.id, form);
      onUpdated(updated);
      showToast("Document updated.", "ok");
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Update failed.";
      showToast(typeof msg === "string" ? msg : JSON.stringify(msg), "err");
    } finally {
      setSaving(false);
    }
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(13,27,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" };
  const modal = { background: "#fff", borderRadius: "var(--dispatch-radius-lg)", padding: "28px 32px", width: 540, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ fontWeight: 800, fontSize: 17, color: brand.text, marginBottom: 20 }}>Edit Document</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Name</FieldLabel>
            <input style={inp} value={form.name} onChange={e => up("name", e.target.value)} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Description</FieldLabel>
            <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={form.description} onChange={e => up("description", e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Category</FieldLabel>
            <select style={inp} value={form.category} onChange={e => up("category", e.target.value)}>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Ticket Types (leave empty for all types)</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              {TICKET_TYPES.map(t => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.ticket_types.includes(t)}
                    onChange={e => up("ticket_types", e.target.checked ? [...form.ticket_types, t] : form.ticket_types.filter(x => x !== t))} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Tags</FieldLabel>
            <TagInput value={form.tags} onChange={v => up("tags", v)} placeholder="e.g. networking" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.requires_signature} onChange={e => up("requires_signature", e.target.checked)} />
              Requires client signature
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn onClick={onClose} variant="ghost">Cancel</Btn>
            <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkEditModal({ docs, onClose, onUpdated, showToast }) {
  const [form, setForm] = useState({
    category: "",
    ticket_types: [],
    tags: [],
    requires_signature: "",  // "" = no change, true/false = set
  });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    let count = 0;
    for (const doc of docs) {
      try {
        const payload = {
          name: doc.name,
          description: doc.description,
          category: form.category || doc.category,
          ticket_types: form.ticket_types.length > 0 ? form.ticket_types : doc.ticket_types,
          tags: form.tags.length > 0 ? form.tags : doc.tags,
          requires_signature: form.requires_signature !== "" ? form.requires_signature : doc.requires_signature,
        };
        const updated = await updateDocument(doc.id, payload);
        onUpdated(updated);
        count++;
      } catch {
        showToast(`Failed to update "${doc.name}".`, "err");
      }
    }
    setSaving(false);
    if (count > 0) showToast(`${count} document${count !== 1 ? "s" : ""} updated.`, "ok");
    onClose();
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(13,27,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" };
  const modal = { background: "#fff", borderRadius: "var(--dispatch-radius-lg)", padding: "28px 32px", width: 540, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ fontWeight: 800, fontSize: 17, color: brand.text, marginBottom: 6 }}>Edit {docs.length} Document{docs.length !== 1 ? "s" : ""}</div>
        <div style={{ fontSize: 12, color: brand.muted, marginBottom: 20 }}>Leave a field blank to keep each document's existing value.</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Category</FieldLabel>
            <select style={inp} value={form.category} onChange={e => up("category", e.target.value)}>
              <option value="">— Keep existing —</option>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Ticket Types (replaces existing if any selected)</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TICKET_TYPES.map(t => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.ticket_types.includes(t)}
                    onChange={e => up("ticket_types", e.target.checked ? [...form.ticket_types, t] : form.ticket_types.filter(x => x !== t))} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Tags (replaces existing if any entered)</FieldLabel>
            <TagInput value={form.tags} onChange={v => up("tags", v)} placeholder="e.g. networking — leave empty to keep existing" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Requires Signature</FieldLabel>
            <select style={{ ...inp, width: "auto" }} value={String(form.requires_signature)} onChange={e => up("requires_signature", e.target.value === "" ? "" : e.target.value === "true")}>
              <option value="">— Keep existing —</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn onClick={onClose} variant="ghost">Cancel</Btn>
            <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : `Save ${docs.length} Document${docs.length !== 1 ? "s" : ""}`}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

const CATEGORIES = [
  { key: "assessment_diagnostic",    label: "Assessment & Diagnostic Services",    accent: "#1a56a0", bg: "#dbeafe" },
  { key: "setup_implementation",     label: "Setup & Implementation Services",     accent: "#065f46", bg: "#d1fae5" },
  { key: "migration",                label: "Migration Services",                  accent: "#5b21b6", bg: "#ede9fe" },
  { key: "recurring_retainer",       label: "Recurring / Retainer Services",       accent: "#0e7490", bg: "#cffafe" },
  { key: "on_demand_support",        label: "On-Demand Support & Advisory",        accent: "#1d4ed8", bg: "#e0e7ff" },
  { key: "specialized_infrastructure", label: "Specialized / Infrastructure Services", accent: "#92400e", bg: "#fef3c7" },
  { key: "policy_fee",               label: "Policy / Fee Documents",              accent: "#6b7280", bg: "#f3f4f6" },
  { key: "client_facing",            label: "Client-Facing Summary",               accent: "#c47a00", bg: "#fff3e0" },
];

const CATEGORY_OPTIONS = [
  { value: "assessment_diagnostic",    label: "Assessment & Diagnostic Services" },
  { value: "setup_implementation",     label: "Setup & Implementation Services" },
  { value: "migration",                label: "Migration Services" },
  { value: "recurring_retainer",       label: "Recurring / Retainer Services" },
  { value: "on_demand_support",        label: "On-Demand Support & Advisory" },
  { value: "specialized_infrastructure", label: "Specialized / Infrastructure Services" },
  { value: "policy_fee",               label: "Policy / Fee Documents" },
  { value: "client_facing",            label: "Client-Facing Summary" },
  { value: "requires_signature",       label: "Documents Clients Need to Sign / Approve" },
];

function DocTable({ docs, isAdmin, selected, setSelected, setEditDoc, handleDelete, fmtSize }) {
  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: brand.bg }}>
            {isAdmin && <th style={{ padding: "10px 10px", borderBottom: `1px solid ${brand.border}`, width: 36 }} />}
            {["Name", "Ticket Types", "Tags", "Size", "Actions"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map(doc => (
            <tr key={doc.id} style={{ background: selected.has(doc.id) ? "#f0f4ff" : "#fff" }}>
              {isAdmin && (
                <td style={{ padding: "0 10px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle", textAlign: "center" }}>
                  <input type="checkbox" checked={selected.has(doc.id)}
                    onChange={e => setSelected(p => { const s = new Set(p); e.target.checked ? s.add(doc.id) : s.delete(doc.id); return s; })} />
                </td>
              )}
              <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" }}>
                <div style={{ fontWeight: 600, color: brand.text }}>{doc.name}</div>
                {doc.description && <div style={{ fontSize: 12, color: brand.muted, marginTop: 2 }}>{doc.description}</div>}
                {doc.requires_signature && <div style={{ fontSize: 11, color: "#c47a00", marginTop: 3, fontWeight: 600 }}>✎ Requires signature</div>}
              </td>
              <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle", fontSize: 12 }}>
                {doc.ticket_types.length === 0 ? <span style={{ color: brand.muted }}>All types</span> : doc.ticket_types.join(", ")}
              </td>
              <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {doc.tags.map(t => (
                    <span key={t} className="dispatch-pill" style={{ background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 20, padding: "1px 8px", fontSize: 11 }}>{t}</span>
                  ))}
                </div>
              </td>
              <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle", fontSize: 12, color: brand.muted, whiteSpace: "nowrap" }}>{fmtSize(doc.size)}</td>
              <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle", whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => downloadWithAuth(downloadUrl(doc.id), doc.original_name)}
                    style={{ padding: "5px 12px", borderRadius: "var(--dispatch-radius-md)", fontSize: 12, fontWeight: 600, background: "#fff", color: brand.blue, border: `1.5px solid ${brand.blue}`, cursor: "pointer", fontFamily: "inherit" }}>
                    Download
                  </button>
                  <Btn onClick={() => setEditDoc(doc)} variant="secondary" small>Edit</Btn>
                  <Btn onClick={() => handleDelete(doc)} variant="danger" small>Delete</Btn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentsPage({ showToast, user }) {
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("files");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ ticket_type: "", search: "" });
  const [showUpload, setShowUpload] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  const load = () => {
    const params = {};
    if (filter.ticket_type) params.ticket_type = filter.ticket_type;
    setLoading(true);
    listDocuments(params)
      .then(setDocs)
      .catch(() => showToast("Failed to load documents.", "err"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); setSelected(new Set()); }, [filter.ticket_type]);

  const visible = docs.filter(d =>
    !filter.search ||
    d.name.toLowerCase().includes(filter.search.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(filter.search.toLowerCase()))
  );

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id);
      setDocs(p => p.filter(d => d.id !== doc.id));
      showToast("Document deleted.", "ok");
    } catch {
      showToast("Failed to delete document.", "err");
    }
  };

  const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const toggleCollapse = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div>
      {showUpload && (
        <UploadDocModal
          onClose={() => setShowUpload(false)}
          onUploaded={doc => setDocs(p => [...p, doc])}
          showToast={showToast}
        />
      )}
      {editDoc && (
        <EditDocModal
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onUpdated={updated => setDocs(p => p.map(d => d.id === updated.id ? updated : d))}
          showToast={showToast}
        />
      )}
      {showBulkEdit && (
        <BulkEditModal
          docs={visible.filter(d => selected.has(d.id))}
          onClose={() => { setShowBulkEdit(false); setSelected(new Set()); }}
          onUpdated={updated => setDocs(p => p.map(d => d.id === updated.id ? updated : d))}
          showToast={showToast}
        />
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Documents</div>
        <div style={{ fontSize: 13, color: brand.muted }}>Upload files and manage form templates for tickets.</div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: `2px solid ${brand.border}`, marginBottom: 24 }}>
        {[{ id: "files", label: "Document Library" }, { id: "templates", label: "Form Templates" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "8px 20px", background: "none", border: "none", borderBottom: `3px solid ${tab === t.id ? brand.blue : "transparent"}`, marginBottom: -2, fontWeight: 700, fontSize: 13, color: tab === t.id ? brand.blue : brand.muted, cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "templates" && (
        <FormTemplatesTab showToast={showToast} isAdmin={isAdmin} />
      )}

      {tab === "files" && (<>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
        {isAdmin && selected.size > 0 && (
          <Btn onClick={() => setShowBulkEdit(true)} variant="primary" small>✎ Edit {selected.size} Selected</Btn>
        )}
        {isAdmin && visible.length > 0 && (
          <Btn onClick={() => {
            if (selected.size === visible.length) setSelected(new Set());
            else setSelected(new Set(visible.map(d => d.id)));
          }} variant="ghost" small>
            {selected.size === visible.length ? "Deselect All" : "Select All"}
          </Btn>
        )}
        <Btn onClick={() => { setShowBulk(v => !v); }} variant={showBulk ? "primary" : "accent"} small>
          {showBulk ? "▲ Hide Upload" : "↑ Upload Files"}
        </Btn>
        <Btn onClick={() => setShowUpload(true)} variant="secondary" small>+ Single Upload</Btn>
      </div>

      {showBulk && (
        <BulkUploadZone
          onUploaded={doc => setDocs(p => [...p, doc])}
          showToast={showToast}
        />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <FieldLabel>Search</FieldLabel>
          <input style={inp} value={filter.search} onChange={e => setFilter(p => ({ ...p, search: e.target.value }))} placeholder="Name or tag…" />
        </div>
        <div>
          <FieldLabel>Ticket Type</FieldLabel>
          <select style={{ ...inp, width: 180 }} value={filter.ticket_type} onChange={e => setFilter(p => ({ ...p, ticket_type: e.target.value }))}>
            <option value="">All Types</option>
            {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>No documents found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Special cross-cut: docs requiring signature/approval */}
          {(() => {
            const sigDocs = visible.filter(d => d.requires_signature);
            if (sigDocs.length === 0) return null;
            const key = "__requires_signature";
            const isOpen = !collapsed[key];
            return (
              <div key={key}>
                <button
                  onClick={() => toggleCollapse(key)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: isOpen ? 12 : 0, width: "100%", textAlign: "left" }}
                >
                  <span style={{ background: "#fce7f3", color: "#9d174d", borderRadius: "var(--dispatch-radius-md)", padding: "3px 12px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Documents Clients Need to Sign / Approve
                  </span>
                  <span style={{ fontSize: 12, color: brand.muted }}>{sigDocs.length} document{sigDocs.length !== 1 ? "s" : ""}</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, color: brand.muted }}>{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <DocTable
                    docs={sigDocs}
                    isAdmin={isAdmin}
                    selected={selected}
                    setSelected={setSelected}
                    setEditDoc={setEditDoc}
                    handleDelete={handleDelete}
                    fmtSize={fmtSize}
                  />
                )}
              </div>
            );
          })()}

          {/* Regular category groups */}
          {CATEGORIES.map(cat => {
            const group = visible.filter(d => d.category === cat.key);
            if (group.length === 0) return null;
            const isOpen = !collapsed[cat.key];
            return (
              <div key={cat.key}>
                <button
                  onClick={() => toggleCollapse(cat.key)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: isOpen ? 12 : 0, width: "100%", textAlign: "left" }}
                >
                  <span style={{ background: cat.bg, color: cat.accent, borderRadius: "var(--dispatch-radius-md)", padding: "3px 12px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 12, color: brand.muted }}>{group.length} document{group.length !== 1 ? "s" : ""}</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, color: brand.muted }}>{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <DocTable
                    docs={group}
                    isAdmin={isAdmin}
                    selected={selected}
                    setSelected={setSelected}
                    setEditDoc={setEditDoc}
                    handleDelete={handleDelete}
                    fmtSize={fmtSize}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}
