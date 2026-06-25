import { useState, useEffect } from "react";
import { listClients, createClient, updateClient, deleteClient } from "./api/clients.js";

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

const EMPTY_FORM = { name: "", email: "", phone: "", address: "", client_type: "business", company: "", notes: "" };

export default function ClientsPage({ showToast }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [editId,  setEditId]  = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [adding,  setAdding]  = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    listClients()
      .then(data => setClients(data.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => showToast("Failed to load clients.", "err"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (c) => {
    setEditId(c.id);
    setEditForm({ name: c.name, email: c.email, phone: c.phone, address: c.address, client_type: c.client_type, company: c.company, notes: c.notes });
    setExpanded(c.id);
  };
  const cancelEdit = () => setEditId(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateClient(editId, editForm);
      setClients(p => p.map(c => c.id === editId ? updated : c));
      setEditId(null);
      showToast("Client updated.", "ok");
    } catch { showToast("Failed to update client.", "err"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteClient(id);
      setClients(p => p.filter(c => c.id !== id));
      if (expanded === id) setExpanded(null);
      showToast("Client deleted.", "ok");
    } catch { showToast("Failed to delete client.", "err"); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    setAdding(true);
    try {
      const c = await createClient({ ...addForm, name: addForm.name.trim() });
      setClients(p => [...p, c].sort((a, b) => a.name.localeCompare(b.name)));
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
      showToast("Client added.", "ok");
    } catch { showToast("Failed to add client.", "err"); }
    finally { setAdding(false); }
  };

  const upEdit = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
  const upAdd  = (k, v) => setAddForm(p => ({ ...p, [k]: v }));

  const cell = { padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Clients</div>
          <div style={{ fontSize: 13, color: brand.muted }}>{clients.length} client{clients.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            style={{ ...inp, width: 240 }} />
          <Btn variant="accent" onClick={() => { setShowAdd(p => !p); setEditId(null); }}>
            {showAdd ? "Cancel" : "+ New Client"}
          </Btn>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd}>
          <div style={{ background: "#fff", border: `1.5px solid ${brand.blue}`, borderRadius: 10, padding: "20px 22px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>New Client</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <FieldLabel>Name *</FieldLabel>
                <input style={inp} value={addForm.name} onChange={e => upAdd("name", e.target.value)} placeholder="Full name" required />
              </div>
              <div>
                <FieldLabel>Company</FieldLabel>
                <input style={inp} value={addForm.company} onChange={e => upAdd("company", e.target.value)} placeholder="Company name" />
              </div>
              <div>
                <FieldLabel>Type</FieldLabel>
                <select style={inp} value={addForm.client_type} onChange={e => upAdd("client_type", e.target.value)}>
                  <option value="business">Business</option>
                  <option value="residential">Residential</option>
                </select>
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input style={inp} type="email" value={addForm.email} onChange={e => upAdd("email", e.target.value)} placeholder="client@example.com" />
              </div>
              <div>
                <FieldLabel>Phone</FieldLabel>
                <input style={inp} value={addForm.phone} onChange={e => upAdd("phone", e.target.value)} placeholder="(514) 000-0000" />
              </div>
              <div>
                <FieldLabel>Address</FieldLabel>
                <input style={inp} value={addForm.address} onChange={e => upAdd("address", e.target.value)} placeholder="123 Main St" />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Notes</FieldLabel>
              <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={addForm.notes} onChange={e => upAdd("notes", e.target.value)} placeholder="Internal notes…" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}>Cancel</Btn>
              <Btn type="submit" variant="accent" disabled={adding}>{adding ? "Saving…" : "Create Client"}</Btn>
            </div>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
      ) : (
        <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Name / Company", "Type", "Email", "Phone", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ ...cell, textAlign: "center", color: brand.muted, padding: 40 }}>
                  {search ? "No clients match your search." : "No clients yet — add one above."}
                </td></tr>
              )}
              {filtered.map(c => (
                <>
                  <tr key={c.id} style={{ cursor: "pointer", background: expanded === c.id ? "#f0f6ff" : "transparent" }}
                    onClick={() => setExpanded(p => p === c.id ? null : c.id)}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600, color: brand.text }}>{c.name}</div>
                      {c.company && <div style={{ fontSize: 12, color: brand.muted }}>{c.company}</div>}
                    </td>
                    <td style={cell}>
                      <span style={{ background: c.client_type === "business" ? brand.blue : brand.accent, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                        {c.client_type === "business" ? "Business" : "Residential"}
                      </span>
                    </td>
                    <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{c.email || "—"}</td>
                    <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{c.phone || "—"}</td>
                    <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Btn small variant="secondary" onClick={() => startEdit(c)}>Edit</Btn>
                        <Btn small variant="danger" onClick={() => handleDelete(c.id, c.name)}>Delete</Btn>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail / edit row */}
                  {expanded === c.id && (
                    <tr key={`${c.id}-detail`} style={{ background: "#f8faff" }}>
                      <td colSpan={5} style={{ padding: "16px 20px", borderBottom: `1px solid ${brand.border}` }}>
                        {editId === c.id ? (
                          <div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                              <div><FieldLabel>Name *</FieldLabel><input style={inp} value={editForm.name} onChange={e => upEdit("name", e.target.value)} /></div>
                              <div><FieldLabel>Company</FieldLabel><input style={inp} value={editForm.company} onChange={e => upEdit("company", e.target.value)} /></div>
                              <div>
                                <FieldLabel>Type</FieldLabel>
                                <select style={inp} value={editForm.client_type} onChange={e => upEdit("client_type", e.target.value)}>
                                  <option value="business">Business</option>
                                  <option value="residential">Residential</option>
                                </select>
                              </div>
                              <div><FieldLabel>Email</FieldLabel><input style={inp} value={editForm.email} onChange={e => upEdit("email", e.target.value)} /></div>
                              <div><FieldLabel>Phone</FieldLabel><input style={inp} value={editForm.phone} onChange={e => upEdit("phone", e.target.value)} /></div>
                              <div><FieldLabel>Address</FieldLabel><input style={inp} value={editForm.address} onChange={e => upEdit("address", e.target.value)} /></div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <FieldLabel>Notes</FieldLabel>
                              <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={editForm.notes} onChange={e => upEdit("notes", e.target.value)} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <Btn variant="accent" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
                              <Btn variant="ghost" onClick={cancelEdit}>Cancel</Btn>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                            <div><FieldLabel>Address</FieldLabel><div style={{ fontSize: 13 }}>{c.address || "—"}</div></div>
                            <div><FieldLabel>Notes</FieldLabel><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.notes || "—"}</div></div>
                            <div><FieldLabel>Added</FieldLabel><div style={{ fontSize: 13 }}>{new Date(c.created_at).toLocaleDateString()}</div></div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
