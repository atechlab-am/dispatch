import { useState, useEffect, useCallback } from "react";
import { listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice } from "./api/invoices.js";
import { listClients } from "./api/clients.js";
import { listTickets } from "./api/tickets.js";

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
    success:   { background: brand.success, color: "#fff",       border: "none" },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
};

const STATUS_COLORS = {
  Draft: { bg: "#f0f0f0", color: brand.muted },
  Sent:  { bg: "#dbeafe", color: "#1d4ed8" },
  Paid:  { bg: "#d1fae5", color: "#065f46" },
  Void:  { bg: "#fee2e2", color: "#991b1b" },
};

const STATUSES = ["All", "Draft", "Sent", "Paid", "Void"];
const TAX_PRESETS = [
  { label: "No tax (0%)", value: 0 },
  { label: "QC (14.975%)", value: 0.14975 },
  { label: "ON (13%)", value: 0.13 },
  { label: "BC (12%)", value: 0.12 },
  { label: "AB (5% GST)", value: 0.05 },
];

const EMPTY_LINE = { description: "", qty: 1, unit_price: 0, amount: 0 };
const EMPTY_INVOICE = {
  ticket_id: null, client_id: null, client_name: "", client_email: "", client_address: "",
  status: "Draft", issue_date: new Date().toISOString().slice(0, 10),
  due_date: "", notes: "", tax_rate: 0, lines: [{ ...EMPTY_LINE }],
};

function fmt(n) { return Number(n || 0).toFixed(2); }
function fmtDate(d) { return d ? new Date(d + "T00:00:00").toLocaleDateString() : "—"; }

// ─── Invoice editor (create / edit) ──────────────────────────────────────────
function InvoiceEditor({ invoice, prefill, clients, onSave, onCancel, showToast }) {
  const isNew = !invoice;
  const [form, setForm] = useState(() => {
    if (prefill) return { ...EMPTY_INVOICE, ...prefill, _draft: undefined };
    if (!invoice) return { ...EMPTY_INVOICE };
    return {
      ticket_id: invoice.ticket_id ?? null,
      client_id: invoice.client_id ?? null,
      client_name: invoice.client_name,
      client_email: invoice.client_email,
      client_address: invoice.client_address,
      status: invoice.status,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date ?? "",
      notes: invoice.notes,
      tax_rate: invoice.tax_rate,
      lines: invoice.lines.length ? invoice.lines.map(l => ({ description: l.description, qty: l.qty, unit_price: l.unit_price, amount: l.amount })) : [{ ...EMPTY_LINE }],
    };
  });
  const [saving, setSaving] = useState(false);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const pickClient = (id) => {
    const c = clients.find(c => c.id === Number(id));
    if (!c) { up("client_id", null); return; }
    setForm(p => ({ ...p, client_id: c.id, client_name: c.name, client_email: c.email, client_address: c.address }));
  };

  const upLine = (i, k, raw) => {
    setForm(p => {
      const lines = p.lines.map((l, idx) => {
        if (idx !== i) return l;
        const updated = { ...l, [k]: raw };
        const qty = k === "qty" ? Number(raw) : Number(updated.qty);
        const up2 = k === "unit_price" ? Number(raw) : Number(updated.unit_price);
        updated.amount = parseFloat((qty * up2).toFixed(2));
        return updated;
      });
      return { ...p, lines };
    });
  };

  const addLine = () => setForm(p => ({ ...p, lines: [...p.lines, { ...EMPTY_LINE }] }));
  const removeLine = (i) => setForm(p => ({ ...p, lines: p.lines.filter((_, idx) => idx !== i) }));

  const subtotal = form.lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const taxAmount = subtotal * Number(form.tax_rate || 0);
  const total = subtotal + taxAmount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        due_date: form.due_date || null,
        tax_rate: Number(form.tax_rate),
        lines: form.lines.map(l => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price), amount: Number(l.amount) })),
      };
      const saved = isNew ? await createInvoice(payload) : await updateInvoice(invoice.id, payload);
      onSave(saved);
    } catch { showToast("Failed to save invoice.", "err"); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>
            {prefill ? `New Invoice — ${prefill.ticket_id}` : isNew ? "New Invoice" : `Invoice ${invoice.id}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : isNew ? "Create Invoice" : "Save Changes"}</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Client */}
        <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Bill To</div>
          <div style={{ marginBottom: 10 }}>
            <FieldLabel>Select Client</FieldLabel>
            <select style={inp} value={form.client_id ?? ""} onChange={e => pickClient(e.target.value)}>
              <option value="">— Manual entry —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <FieldLabel>Name</FieldLabel>
            <input style={inp} value={form.client_name} onChange={e => up("client_name", e.target.value)} placeholder="Client name" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <FieldLabel>Email</FieldLabel>
            <input style={inp} type="email" value={form.client_email} onChange={e => up("client_email", e.target.value)} placeholder="client@example.com" />
          </div>
          <div>
            <FieldLabel>Address</FieldLabel>
            <textarea style={{ ...inp, minHeight: 56, resize: "vertical" }} value={form.client_address} onChange={e => up("client_address", e.target.value)} placeholder="Billing address" />
          </div>
        </div>

        {/* Invoice details */}
        <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Invoice Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <FieldLabel>Status</FieldLabel>
              <select style={inp} value={form.status} onChange={e => up("status", e.target.value)}>
                {["Draft", "Sent", "Paid", "Void"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Tax</FieldLabel>
              <select style={inp} value={form.tax_rate} onChange={e => up("tax_rate", e.target.value)}>
                {TAX_PRESETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Issue Date</FieldLabel>
              <input style={inp} type="date" value={form.issue_date} onChange={e => up("issue_date", e.target.value)} required />
            </div>
            <div>
              <FieldLabel>Due Date</FieldLabel>
              <input style={inp} type="date" value={form.due_date} onChange={e => up("due_date", e.target.value)} />
            </div>
          </div>
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => up("notes", e.target.value)} placeholder="Payment instructions, terms, etc." />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Line Items</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: brand.bg }}>
              {["Description", "Qty", "Unit Price", "Amount", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 10px", textAlign: i > 0 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {form.lines.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}` }}>
                  <input style={inp} value={l.description} onChange={e => upLine(i, "description", e.target.value)} placeholder="Description of service or product" />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 90 }}>
                  <input style={{ ...inp, textAlign: "right" }} type="number" min="0" step="0.01" value={l.qty} onChange={e => upLine(i, "qty", e.target.value)} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 130 }}>
                  <input style={{ ...inp, textAlign: "right" }} type="number" min="0" step="0.01" value={l.unit_price} onChange={e => upLine(i, "unit_price", e.target.value)} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 120, textAlign: "right", fontWeight: 600, color: brand.text }}>
                  ${fmt(l.amount)}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 40, textAlign: "right" }}>
                  {form.lines.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)}
                      style={{ background: "none", border: "none", color: brand.danger, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <Btn variant="ghost" small onClick={addLine}>+ Add Line</Btn>
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 24px", minWidth: 280 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: brand.muted }}>Subtotal</span>
            <span>${fmt(subtotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: brand.muted }}>Tax ({(Number(form.tax_rate) * 100).toFixed(3)}%)</span>
            <span>${fmt(taxAmount)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, borderTop: `2px solid ${brand.border}`, paddingTop: 10 }}>
            <span>Total</span>
            <span style={{ color: brand.blue }}>${fmt(total)}</span>
          </div>
        </div>
      </div>
    </form>
  );
}

// ─── Invoice list ─────────────────────────────────────────────────────────────
export default function InvoicesPage({ showToast, initialDraft = null, onDraftConsumed }) {
  const [invoices, setInvoices] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [editing,  setEditing]  = useState(initialDraft ? { _draft: true, ...initialDraft } : null);
  const [clients,  setClients]  = useState([]);

  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (statusFilter !== "All") params.status = statusFilter;
      const data = await listInvoices(params);
      setInvoices(data.items);
      setTotal(data.total);
    } catch { showToast("Failed to load invoices.", "err"); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listClients().then(setClients).catch(() => {}); }, []);

  const handleSave = (saved) => {
    const isNew = editing === "new" || editing?._draft;
    showToast(isNew ? "Invoice created." : "Invoice updated.", "ok");
    if (isNew && onDraftConsumed) onDraftConsumed();
    setEditing(null);
    load();
  };

  const handleEdit = async (inv) => {
    try {
      const full = await getInvoice(inv.id);
      setEditing(full);
    } catch { showToast("Failed to load invoice.", "err"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    try {
      await deleteInvoice(id);
      showToast("Invoice deleted.", "ok");
      load();
    } catch { showToast("Failed to delete invoice.", "err"); }
  };

  if (editing !== null) {
    const isDraft = editing === "new" || editing?._draft;
    return (
      <InvoiceEditor
        invoice={isDraft ? null : editing}
        prefill={editing?._draft ? editing : null}
        clients={clients}
        onSave={handleSave}
        onCancel={() => { if (editing?._draft && onDraftConsumed) onDraftConsumed(); setEditing(null); }}
        showToast={showToast}
      />
    );
  }

  const cell = { padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Invoices</div>
          <div style={{ fontSize: 13, color: brand.muted }}>{total} invoice{total !== 1 ? "s" : ""}</div>
        </div>
        <Btn variant="accent" onClick={() => setEditing("new")}>+ New Invoice</Btn>
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${statusFilter === s ? brand.blue : brand.border}`, background: statusFilter === s ? brand.blue : "#fff", color: statusFilter === s ? "#fff" : brand.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
      ) : (
        <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Invoice #", "Client", "Status", "Issue Date", "Due Date", "Total", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: i === 5 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr><td colSpan={7} style={{ ...cell, textAlign: "center", color: brand.muted, padding: 40 }}>
                  No invoices yet.
                </td></tr>
              )}
              {invoices.map(inv => {
                const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.Draft;
                return (
                  <tr key={inv.id} style={{ cursor: "pointer" }} onClick={() => handleEdit(inv)}>
                    <td style={{ ...cell, fontWeight: 700, color: brand.blue }}>{inv.id}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>{inv.client_name || "—"}</td>
                    <td style={cell}>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{inv.status}</span>
                    </td>
                    <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{fmtDate(inv.issue_date)}</td>
                    <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{fmtDate(inv.due_date)}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>${fmt(inv.total)}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Btn small variant="secondary" onClick={() => handleEdit(inv)}>Edit</Btn>
                        <Btn small variant="danger" onClick={() => handleDelete(inv.id)}>Delete</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <Btn small variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
          <span style={{ fontSize: 13, color: brand.muted, padding: "5px 10px" }}>Page {page} of {pages}</span>
          <Btn small variant="ghost" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</Btn>
        </div>
      )}
    </div>
  );
}
