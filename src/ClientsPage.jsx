import { useState, useEffect, useCallback } from "react";
import { listClients, createClient, updateClient, deleteClient } from "./api/clients.js";
import { clientStatement } from "./api/invoices.js";

const brand = {
  blue: "#1A5CBA", accent: "#E8A020", bg: "#F4F7FC", surface: "#FFFFFF",
  border: "#D8E2F0", text: "var(--dispatch-text)", muted: "var(--dispatch-muted)",
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
    primary:   { background: brand.blue,    color: "var(--dispatch-on-color)",       border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",        color: brand.danger, border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,  color: "var(--dispatch-on-color)",       border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
};

function fmt(n) { return Number(n || 0).toFixed(2); }
function fmtDate(d) { return d ? new Date(d + "T00:00:00").toLocaleDateString() : "—"; }

const STATUS_COLORS = {
  Draft: { bg: "#f0f0f0", color: brand.muted },
  Sent:  { bg: "#dbeafe", color: "#1d4ed8" },
  Paid:  { bg: "#d1fae5", color: "#065f46" },
  Void:  { bg: "#fee2e2", color: "#991b1b" },
};

// ─── Statement modal ──────────────────────────────────────────────────────────

function StatementModal({ client, showToast, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await clientStatement(client.id)); }
    catch { showToast("Failed to load statement.", "err"); }
    finally { setLoading(false); }
  }, [client.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "40px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 720, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", marginBottom: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: brand.text }}>Client Statement</div>
            <div style={{ fontSize: 13, color: brand.muted, marginTop: 2 }}>{client.name}{client.company ? ` — ${client.company}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: brand.muted }}>×</button>
        </div>
        {loading ? (
          <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>
        ) : !data ? null : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Total Billed", value: `$${fmt(data.total_billed)}`, color: brand.text },
                { label: "Total Paid",   value: `$${fmt(data.total_paid)}`,   color: brand.success },
                { label: "Outstanding",  value: `$${fmt(data.outstanding)}`,  color: data.outstanding > 0 ? brand.danger : brand.success },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: brand.bg, borderRadius: 8, padding: "14px 18px", border: `1px solid ${brand.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>
            {data.invoices.length === 0 ? (
              <div style={{ color: brand.muted, textAlign: "center", padding: "20px 0" }}>No invoices for this client.</div>
            ) : (
              <div style={{ border: `1px solid ${brand.border}`, borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: brand.bg }}>
                      {["Invoice #", "Status", "Issued", "Due", "Total", "Paid", "Balance"].map((h, i) => (
                        <th key={i} style={{ padding: "8px 12px", textAlign: i >= 4 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map(inv => {
                      const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.Draft;
                      return (
                        <tr key={inv.id}>
                          <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, fontWeight: 700, color: brand.blue }}>{inv.id}</td>
                          <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}` }}>
                            <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{inv.status}</span>
                          </td>
                          <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, color: brand.muted }}>{fmtDate(inv.issue_date)}</td>
                          <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, color: brand.muted }}>{fmtDate(inv.due_date)}</td>
                          <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, textAlign: "right", fontWeight: 600 }}>${fmt(inv.total)}</td>
                          <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, textAlign: "right", color: brand.success }}>${fmt(inv.amount_paid)}</td>
                          <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, textAlign: "right", fontWeight: 700, color: inv.balance > 0 ? brand.danger : brand.success }}>${fmt(inv.balance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Add Business form ────────────────────────────────────────────────────────
// Creates the primary business record (company-level info only).

function AddBusinessForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ company: "", email: "", phone: "", address: "", notes: "", slug: "" });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company.trim()) return;
    setSaving(true);
    try {
      const record = await createClient({
        name: form.company.trim(),   // primary record: name = company name
        email: form.email,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
        client_type: "business",
        company: form.company.trim(),
        slug: form.slug || null,
      });
      onAdd(record);
    } catch { /* caller handles toast */ }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: "#fff", border: `1.5px solid ${brand.blue}`, borderRadius: 10, padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>New Business</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div><FieldLabel>Company Name *</FieldLabel><input style={inp} value={form.company} onChange={e => up("company", e.target.value)} placeholder="Acme Corp" required autoFocus /></div>
          <div><FieldLabel>Portal Slug</FieldLabel><input style={inp} value={form.slug} onChange={e => up("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="acme-corp (enables /p/acme-corp)" /></div>
          <div><FieldLabel>Business Email</FieldLabel><input style={inp} type="email" value={form.email} onChange={e => up("email", e.target.value)} placeholder="info@acme.com" /></div>
          <div><FieldLabel>Business Phone</FieldLabel><input style={inp} value={form.phone} onChange={e => up("phone", e.target.value)} placeholder="(514) 000-0000" /></div>
        </div>
        <div style={{ marginBottom: 14 }}><FieldLabel>Address</FieldLabel><input style={inp} value={form.address} onChange={e => up("address", e.target.value)} placeholder="123 Main St" /></div>
        <div style={{ marginBottom: 14 }}><FieldLabel>Notes</FieldLabel><textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={e => up("notes", e.target.value)} placeholder="Internal notes…" /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : "Create Business"}</Btn>
        </div>
      </div>
    </form>
  );
}

// ─── Edit Business form (inline inside group header) ──────────────────────────

function EditBusinessForm({ primary, onSaved, onCancel, showToast, showSlaTiers }) {
  const [form, setForm] = useState({
    // Fall back to primary.name, matching the same fallback used to display
    // the company name everywhere else (e.g. the CompanyGroup header) — a
    // client whose `company` field happens to be blank (legacy data, or
    // created via a path that didn't set it explicitly) would otherwise
    // render this required field empty even though its name is clearly
    // visible elsewhere on the page, looking like the edit silently failed.
    company: primary.company || primary.name,
    email: primary.email,
    phone: primary.phone,
    address: primary.address,
    notes: primary.notes,
    slug: primary.slug || "",
    sla_tier: primary.sla_tier || "",
  });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company.trim()) return;
    setSaving(true);
    try {
      const updated = await updateClient(primary.id, {
        name: form.company.trim(),
        email: form.email,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
        client_type: "business",
        company: form.company.trim(),
        slug: form.slug || null,
        sla_tier: form.sla_tier || null,
      });
      onSaved(updated);
      showToast("Business updated.", "ok");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update business.", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: "#f0f6ff", border: `1.5px solid ${brand.blue}`, borderRadius: 8, padding: "16px 18px", margin: "12px 16px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Edit Business</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FieldLabel>Company Name *</FieldLabel><input style={inp} value={form.company} onChange={e => up("company", e.target.value)} required autoFocus /></div>
          <div><FieldLabel>Portal Slug</FieldLabel><input style={inp} value={form.slug} onChange={e => up("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="acme-corp" /></div>
          <div><FieldLabel>Business Email</FieldLabel><input style={inp} type="email" value={form.email} onChange={e => up("email", e.target.value)} /></div>
          <div><FieldLabel>Business Phone</FieldLabel><input style={inp} value={form.phone} onChange={e => up("phone", e.target.value)} /></div>
          {showSlaTiers && (
            <div>
              <FieldLabel>SLA Tier</FieldLabel>
              <select style={inp} value={form.sla_tier} onChange={e => up("sla_tier", e.target.value)}>
                <option value="">— Global default —</option>
                <option value="gold">Gold (faster SLA)</option>
                <option value="silver">Silver (standard)</option>
                <option value="bronze">Bronze (relaxed)</option>
              </select>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 12 }}><FieldLabel>Address</FieldLabel><input style={inp} value={form.address} onChange={e => up("address", e.target.value)} /></div>
        <div style={{ marginBottom: 14 }}><FieldLabel>Notes</FieldLabel><textarea style={{ ...inp, minHeight: 54, resize: "vertical" }} value={form.notes} onChange={e => up("notes", e.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onCancel} small>Cancel</Btn>
          <Btn type="submit" variant="accent" disabled={saving} small>{saving ? "Saving…" : "Save Business"}</Btn>
        </div>
      </div>
    </form>
  );
}

// ─── Add Contact form ─────────────────────────────────────────────────────────

function AddContactForm({ companies, preselectedCompany, onAdd, onCancel }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    client_type: preselectedCompany ? "business" : "residential",
    company: preselectedCompany || "",
  });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const contact = await createClient({
        name: form.name.trim(),
        email: form.email,
        phone: form.phone,
        address: "",
        notes: "",
        client_type: form.client_type,
        company: form.client_type === "business" ? form.company : "",
        slug: null,
      });
      onAdd(contact);
    } catch { /* caller handles toast */ }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: "#fff", border: `1.5px solid ${brand.blue}`, borderRadius: 10, padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>New Contact</div>

        {!preselectedCompany && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <FieldLabel>Type</FieldLabel>
              <select style={inp} value={form.client_type} onChange={e => { up("client_type", e.target.value); if (e.target.value === "residential") up("company", ""); }}>
                <option value="business">Business</option>
                <option value="residential">Residential</option>
              </select>
            </div>
            {form.client_type === "business" && (
              <div>
                <FieldLabel>Company *</FieldLabel>
                <select style={inp} value={form.company} onChange={e => up("company", e.target.value === "__new__" ? "" : e.target.value)}>
                  <option value="">— select a company —</option>
                  {companies.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__new__">+ Type a new company name</option>
                </select>
              </div>
            )}
            {form.client_type === "business" && !companies.includes(form.company) && (
              <div>
                <FieldLabel>Company Name *</FieldLabel>
                <input style={inp} value={form.company} onChange={e => up("company", e.target.value)} placeholder="e.g. Acme Corp" />
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div><FieldLabel>Full Name *</FieldLabel><input style={inp} value={form.name} onChange={e => up("name", e.target.value)} placeholder="Jane Smith" required autoFocus /></div>
          <div><FieldLabel>Email</FieldLabel><input style={inp} type="email" autoComplete="off" value={form.email} onChange={e => up("email", e.target.value)} placeholder="jane@example.com" /></div>
          <div><FieldLabel>Phone</FieldLabel><input style={inp} value={form.phone} onChange={e => up("phone", e.target.value)} placeholder="(514) 000-0000" /></div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : "Add Contact"}</Btn>
        </div>
      </div>
    </form>
  );
}

// ─── Inline contact edit ──────────────────────────────────────────────────────

function ContactEditForm({ c, onSaved, onCancel, showToast }) {
  const [form, setForm] = useState({ name: c.name, email: c.email, phone: c.phone });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const updated = await updateClient(c.id, {
        ...c, name: form.name.trim(), email: form.email, phone: form.phone,
      });
      onSaved(updated);
      showToast("Contact updated.", "ok");
    } catch {
      showToast("Failed to update contact.", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
      <div><FieldLabel>Name</FieldLabel><input style={inp} value={form.name} onChange={e => up("name", e.target.value)} autoFocus /></div>
      <div><FieldLabel>Email</FieldLabel><input style={inp} autoComplete="off" value={form.email} onChange={e => up("email", e.target.value)} /></div>
      <div><FieldLabel>Phone</FieldLabel><input style={inp} value={form.phone} onChange={e => up("phone", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 6, paddingBottom: 1 }}>
        <Btn onClick={handleSave} variant="accent" small disabled={saving}>{saving ? "…" : "Save"}</Btn>
        <Btn onClick={onCancel} variant="ghost" small>Cancel</Btn>
      </div>
    </div>
  );
}

// ─── Single contact row ───────────────────────────────────────────────────────

function ContactRow({ c, onUpdated, onDeleted, onStatement, showToast }) {
  const [editing, setEditing] = useState(false);
  const cell = { padding: "11px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };

  if (editing) {
    return (
      <tr style={{ background: "#f0f6ff" }}>
        <td colSpan={3} style={{ padding: "12px 16px", borderBottom: `1px solid ${brand.border}` }}>
          <ContactEditForm
            c={c}
            onSaved={updated => { onUpdated(updated); setEditing(false); }}
            onCancel={() => setEditing(false)}
            showToast={showToast}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ background: brand.surface }}>
      <td style={cell}>
        <div style={{ fontWeight: 600, color: brand.text }}>{c.name}</div>
        {c.email && <div style={{ fontSize: 12, color: brand.muted }}>{c.email}</div>}
      </td>
      <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{c.phone || "—"}</td>
      <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Btn small variant="ghost" onClick={() => onStatement(c)}>Statement</Btn>
          <Btn small variant="secondary" onClick={() => setEditing(true)}>Edit</Btn>
          <Btn small variant="danger" onClick={() => onDeleted(c.id, c.name)}>Delete</Btn>
        </div>
      </td>
    </tr>
  );
}

// ─── Residential contact row (with address/notes expand) ──────────────────────

function ResidentialRow({ c, onUpdated, onDeleted, onStatement, showToast, companies }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: c.name, email: c.email, phone: c.phone, address: c.address, notes: c.notes });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const cell = { padding: "11px 14px", borderBottom: expanded ? "none" : `1px solid ${brand.border}`, verticalAlign: "middle" };

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateClient(c.id, { ...c, ...form });
      onUpdated(updated);
      setEditing(false);
      setExpanded(false);
      showToast("Contact updated.", "ok");
    } catch { showToast("Failed to update.", "err"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <tr style={{ cursor: "pointer", background: expanded ? "#f0f6ff" : brand.surface }} onClick={() => { if (!editing) setExpanded(p => !p); }}>
        <td style={cell}>
          <div style={{ fontWeight: 600, color: brand.text }}>{c.name}</div>
          {c.email && <div style={{ fontSize: 12, color: brand.muted }}>{c.email}</div>}
        </td>
        <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{c.phone || "—"}</td>
        <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn small variant="ghost" onClick={() => onStatement(c)}>Statement</Btn>
            <Btn small variant="secondary" onClick={() => { setEditing(true); setExpanded(true); }}>Edit</Btn>
            <Btn small variant="danger" onClick={() => onDeleted(c.id, c.name)}>Delete</Btn>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: "#f8faff" }}>
          <td colSpan={3} style={{ padding: "14px 18px", borderBottom: `1px solid ${brand.border}` }}>
            {editing ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><FieldLabel>Name *</FieldLabel><input style={inp} value={form.name} onChange={e => up("name", e.target.value)} /></div>
                  <div><FieldLabel>Email</FieldLabel><input style={inp} autoComplete="off" value={form.email} onChange={e => up("email", e.target.value)} /></div>
                  <div><FieldLabel>Phone</FieldLabel><input style={inp} value={form.phone} onChange={e => up("phone", e.target.value)} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><FieldLabel>Address</FieldLabel><input style={inp} value={form.address} onChange={e => up("address", e.target.value)} /></div>
                  <div><FieldLabel>Notes</FieldLabel><textarea style={{ ...inp, minHeight: 54, resize: "vertical" }} value={form.notes} onChange={e => up("notes", e.target.value)} /></div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="accent" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
                  <Btn variant="ghost" onClick={() => { setEditing(false); setForm({ name: c.name, email: c.email, phone: c.phone, address: c.address, notes: c.notes }); }}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div><FieldLabel>Address</FieldLabel><div style={{ fontSize: 13 }}>{c.address || "—"}</div></div>
                <div><FieldLabel>Notes</FieldLabel><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.notes || "—"}</div></div>
                <div><FieldLabel>Portal URL</FieldLabel><div style={{ fontSize: 13 }}>{c.slug ? <code style={{ background: "#f0f6ff", padding: "2px 6px", borderRadius: 4, color: brand.blue }}>/p/{c.slug}</code> : <span style={{ color: brand.muted }}>—</span>}</div></div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Business company group ───────────────────────────────────────────────────

function CompanyGroup({ primary, contacts, company, showToast, onPrimaryUpdated, onContactUpdated, onContactDeleted, onContactAdded, onBusinessDeleted, companies, showSlaTiers }) {
  const [expanded, setExpanded] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);

  const slug = primary.slug;

  function handleCancelEdit() {
    setEditingBusiness(false);
    setShowAddContact(false);
  }

  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12, background: brand.surface }}>
      {/* Company header */}
      <div
        onClick={() => { if (!editingBusiness) setExpanded(p => !p); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: "pointer",
          background: expanded ? "#fafcff" : brand.surface,
          borderBottom: expanded ? `1px solid ${brand.border}` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: brand.text }}>{company}</span>
          {primary.phone && <span style={{ fontSize: 12, color: brand.muted }}>{primary.phone}</span>}
          {primary.email && <span style={{ fontSize: 12, color: brand.muted }}>{primary.email}</span>}
          <span style={{ background: "#e8f0fd", color: brand.blue, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
          </span>
          {slug && (
            <code style={{ background: "#e8f0fd", color: brand.blue, padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
              /p/{slug}
            </code>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
          <Btn small variant="secondary" onClick={() => { setEditingBusiness(p => !p); setShowAddContact(false); setExpanded(true); }}>
            {editingBusiness ? "Cancel" : "Edit Business"}
          </Btn>
          <Btn small variant="danger" onClick={() => onBusinessDeleted(primary.id, company)}>
            Delete
          </Btn>
          <span style={{ color: brand.muted, fontSize: 14, cursor: "pointer" }} onClick={() => setExpanded(p => !p)}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Business edit form — only shown when editingBusiness, not when adding contact */}
      {editingBusiness && (
        <EditBusinessForm
          primary={primary}
          onSaved={updated => { onPrimaryUpdated(updated); setEditingBusiness(false); }}
          onCancel={handleCancelEdit}
          showToast={showToast}
          showSlaTiers={showSlaTiers}
        />
      )}

      {/* Business detail (read-only, when expanded and not editing) */}
      {expanded && !editingBusiness && (primary.address || primary.notes || (showSlaTiers && primary.sla_tier)) && (
        <div style={{ padding: "10px 18px", background: "#fafcff", borderBottom: `1px solid ${brand.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {primary.address && <div><FieldLabel>Address</FieldLabel><div style={{ fontSize: 13 }}>{primary.address}</div></div>}
          {primary.notes && <div><FieldLabel>Notes</FieldLabel><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{primary.notes}</div></div>}
          {showSlaTiers && primary.sla_tier && (
            <div><FieldLabel>SLA Tier</FieldLabel><div style={{ fontSize: 13, textTransform: "capitalize" }}>{primary.sla_tier}</div></div>
          )}
        </div>
      )}

      {/* Contacts — only shown when expanded and NOT editing the business */}
      {expanded && !editingBusiness && (
        <>
          {showAddContact ? (
            <div style={{ padding: "14px 16px 0" }}>
              <AddContactForm
                companies={companies}
                preselectedCompany={company}
                onAdd={c => { onContactAdded(c); setShowAddContact(false); }}
                onCancel={() => setShowAddContact(false)}
              />
            </div>
          ) : (
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${brand.border}`, background: "#fafcff" }}>
              <Btn small variant="secondary" onClick={e => { e.stopPropagation(); setShowAddContact(true); }}>
                + Add Contact
              </Btn>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Contact", "Phone", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 14px", textAlign: i === 2 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && (
                <tr><td colSpan={3} style={{ padding: "16px 14px", color: brand.muted, fontSize: 13, textAlign: "center", borderBottom: `1px solid ${brand.border}` }}>
                  No contacts yet — add one above.
                </td></tr>
              )}
              {contacts.map(c => (
                <ContactRow
                  key={c.id}
                  c={c}
                  onUpdated={onContactUpdated}
                  onDeleted={onContactDeleted}
                  onStatement={() => {}}
                  showToast={showToast}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────

function SectionHeader({ label, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 12px" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</span>
      <span style={{ fontSize: 12, color: brand.muted, background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 20, padding: "1px 9px" }}>{count}</span>
      <div style={{ flex: 1, height: 1, background: brand.border }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage({ showToast, features }) {
  const showSlaTiers = features?.sla_tiers !== false;
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(null); // null | "business" | "contact"
  const [statement, setStatement] = useState(null);

  useEffect(() => {
    listClients()
      .then(data => setClients(data))
      .catch(() => showToast("Failed to load clients.", "err"))
      .finally(() => setLoading(false));
  }, []);

  const companies = [...new Set(
    clients.filter(c => c.client_type === "business" && c.company).map(c => c.company)
  )].sort();

  function updateOne(updated) {
    setClients(p => p.map(c => c.id === updated.id ? updated : c));
  }

  function removeOne(id) {
    setClients(p => p.filter(c => c.id !== id));
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteClient(id);
      removeOne(id);
      showToast("Deleted.", "ok");
    } catch { showToast("Failed to delete.", "err"); }
  }

  function handleAdded(c) {
    setClients(p => [...p, c]);
    setShowAdd(null);
    showToast("Added.", "ok");
  }

  const q = search.toLowerCase();

  function matchesSearch(c) {
    return c.name.toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q);
  }

  // Build business groups: primary = lowest id with that company name
  const businessGroups = {};
  clients.filter(c => c.client_type === "business").forEach(c => {
    const key = c.company || `__solo_${c.id}`;
    if (!businessGroups[key]) businessGroups[key] = [];
    businessGroups[key].push(c);
  });

  const filteredBusinessGroups = Object.entries(businessGroups).map(([key, members]) => {
    const sorted = [...members].sort((a, b) => a.id - b.id);
    const primary = sorted[0];
    const contacts = sorted.slice(1);
    return { key, company: primary.company || primary.name, primary, contacts };
  }).filter(g => !q || g.contacts.some(matchesSearch) || matchesSearch(g.primary))
    .sort((a, b) => a.company.localeCompare(b.company));

  const filteredResidential = clients
    .filter(c => c.client_type === "residential" && (!q || matchesSearch(c)))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      {statement && <StatementModal client={statement} showToast={showToast} onClose={() => setStatement(null)} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Clients</div>
          <div style={{ fontSize: 13, color: brand.muted }}>{clients.length} client{clients.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={search} autoComplete="off" onChange={e => setSearch(e.target.value)} placeholder="Search clients…" style={{ ...inp, width: 220 }} />
          <Btn variant="secondary" onClick={() => setShowAdd(p => p === "business" ? null : "business")}>
            {showAdd === "business" ? "Cancel" : "+ New Business"}
          </Btn>
          <Btn variant="accent" onClick={() => setShowAdd(p => p === "contact" ? null : "contact")}>
            {showAdd === "contact" ? "Cancel" : "+ New Contact"}
          </Btn>
        </div>
      </div>

      {showAdd === "business" && <AddBusinessForm onAdd={handleAdded} onCancel={() => setShowAdd(null)} />}
      {showAdd === "contact" && <AddContactForm companies={companies} preselectedCompany={null} onAdd={handleAdded} onCancel={() => setShowAdd(null)} />}

      {loading ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
      ) : (
        <>
          {filteredBusinessGroups.length > 0 && (
            <>
              <SectionHeader label="Business" count={filteredBusinessGroups.length} />
              {filteredBusinessGroups.map(g => (
                <CompanyGroup
                  key={g.key}
                  primary={g.primary}
                  contacts={g.contacts}
                  company={g.company}
                  showToast={showToast}
                  companies={companies}
                  onPrimaryUpdated={updateOne}
                  onContactUpdated={updateOne}
                  onContactDeleted={(id, name) => handleDelete(id, name)}
                  onContactAdded={c => { setClients(p => [...p, c]); showToast("Contact added.", "ok"); }}
                  onBusinessDeleted={(id, name) => handleDelete(id, name)}
                  showSlaTiers={showSlaTiers}
                />
              ))}
            </>
          )}

          {filteredResidential.length > 0 && (
            <>
              <SectionHeader label="Residential" count={filteredResidential.length} />
              <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden", background: brand.surface }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: brand.bg }}>
                      {["Name", "Phone", ""].map((h, i) => (
                        <th key={i} style={{ padding: "8px 14px", textAlign: i === 2 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResidential.map(c => (
                      <ResidentialRow
                        key={c.id}
                        c={c}
                        onUpdated={updateOne}
                        onDeleted={(id, name) => handleDelete(id, name)}
                        onStatement={setStatement}
                        showToast={showToast}
                        companies={companies}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {filteredBusinessGroups.length === 0 && filteredResidential.length === 0 && (
            <div style={{ color: brand.muted, padding: 40, textAlign: "center", background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10 }}>
              {search ? "No clients match your search." : "No clients yet — use the buttons above to add a business or contact."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
