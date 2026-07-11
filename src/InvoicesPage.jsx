import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice,
  listPayments, recordPayment, deletePayment, sendInvoiceEmail, invoicePdfUrl,
  listUnbilledTickets, listUnbilledTicketsForClient, attachTickets, detachTicket, markTicketsPaid,
} from "./api/invoices.js";
import { listClients } from "./api/clients.js";
import { openPdfWithAuth } from "./api/client.js";
import {
  listRecurringInvoices, getRecurringInvoice, createRecurringInvoice,
  updateRecurringInvoice, deleteRecurringInvoice,
} from "./api/recurringInvoices.js";

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
    primary:   { background: brand.blue,   color: "var(--dispatch-on-color)",       border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",        color: brand.danger, border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,  color: "var(--dispatch-on-color)",       border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
    success:   { background: brand.success, color: "var(--dispatch-on-color)",       border: "none" },
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
const PAYMENT_METHODS = ["Cash", "Cheque", "E-Transfer", "Credit Card", "Debit", "Other"];

const EMPTY_LINE = { description: "", qty: 1, unit_price: 0, amount: 0 };
const EMPTY_INVOICE = {
  ticket_id: null, client_id: null, client_name: "", client_email: "", client_address: "",
  status: "Draft", issue_date: new Date().toISOString().slice(0, 10),
  due_date: "", notes: "", tax_rate: 0, lines: [{ ...EMPTY_LINE }],
};

function fmt(n) { return Number(n || 0).toFixed(2); }
function fmtDate(d) { return d ? new Date(d + "T00:00:00").toLocaleDateString() : "—"; }

// ─── Payment tracking panel ───────────────────────────────────────────────────
function PaymentsPanel({ invoice, showToast, onRefresh }) {
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ amount: "", method: "Cash", note: "", payment_date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPayments(await listPayments(invoice.id)); }
    catch { showToast("Failed to load payments.", "err"); }
    finally { setLoading(false); }
  }, [invoice.id]);

  useEffect(() => { load(); }, [load]);

  const handleRecord = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await recordPayment(invoice.id, { ...form, amount: Number(form.amount) });
      showToast("Payment recorded.", "ok");
      setShowForm(false);
      setForm({ amount: "", method: "Cash", note: "", payment_date: new Date().toISOString().slice(0, 10) });
      await load();
      onRefresh();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to record payment.";
      showToast(msg, "err");
    } finally { setSaving(false); }
  };

  const handleDelete = async (paymentId) => {
    if (!window.confirm("Remove this payment record?")) return;
    try {
      await deletePayment(paymentId);
      showToast("Payment removed.", "ok");
      await load();
      onRefresh();
    } catch { showToast("Failed to remove payment.", "err"); }
  };

  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Number(invoice.total) - paid;

  return (
    <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px", marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px" }}>Payments</div>
        {!showForm && invoice.status !== "Void" && (
          <Btn small variant="success" onClick={() => setShowForm(true)}>+ Record Payment</Btn>
        )}
      </div>

      {/* Summary row */}
      <div style={{ display: "flex", gap: 24, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: brand.muted, fontWeight: 600 }}>TOTAL</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>${fmt(invoice.total)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: brand.muted, fontWeight: 600 }}>PAID</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: brand.success }}>${fmt(paid)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: brand.muted, fontWeight: 600 }}>BALANCE</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: balance > 0 ? brand.danger : brand.success }}>${fmt(balance)}</div>
        </div>
      </div>

      {/* Payment form */}
      {showForm && (
        <form onSubmit={handleRecord} style={{ background: brand.bg, borderRadius: 8, padding: "14px 16px", marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto auto", gap: 10, alignItems: "flex-end" }}>
          <div>
            <FieldLabel>Amount ($)</FieldLabel>
            <input style={inp} type="number" min="0.01" step="0.01" required value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <FieldLabel>Method</FieldLabel>
            <select style={inp} value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}>
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Date</FieldLabel>
            <input style={inp} type="date" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} required />
          </div>
          <div>
            <FieldLabel>Note</FieldLabel>
            <input style={inp} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="Reference, cheque #, etc." />
          </div>
          <div style={{ paddingBottom: 1 }}>
            <Btn type="submit" variant="success" small disabled={saving}>{saving ? "…" : "Save"}</Btn>
          </div>
          <div style={{ paddingBottom: 1 }}>
            <Btn variant="ghost" small onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </form>
      )}

      {/* Payment list */}
      {loading ? (
        <div style={{ color: brand.muted, fontSize: 13, padding: "8px 0" }}>Loading…</div>
      ) : payments.length === 0 ? (
        <div style={{ color: brand.muted, fontSize: 13 }}>No payments recorded yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: brand.bg }}>
              {["Date", "Method", "Amount", "Note", ""].map((h, i) => (
                <th key={i} style={{ padding: "6px 10px", textAlign: i === 2 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${brand.border}` }}>{fmtDate(p.payment_date)}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${brand.border}`, color: brand.muted }}>{p.method || "—"}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${brand.border}`, textAlign: "right", fontWeight: 700, color: brand.success }}>${fmt(p.amount)}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${brand.border}`, color: brand.muted }}>{p.note || ""}</td>
                <td style={{ padding: "7px 10px", borderBottom: `1px solid ${brand.border}`, textAlign: "right" }}>
                  <button onClick={() => handleDelete(p.id)} style={{ background: "none", border: "none", color: brand.danger, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Send email modal ─────────────────────────────────────────────────────────
function SendEmailModal({ invoice, showToast, onClose }) {
  const [to, setTo]         = useState(invoice.client_email || "");
  const [message, setMsg]   = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await sendInvoiceEmail(invoice.id, { to, message });
      showToast("Invoice sent.", "ok");
      onClose();
    } catch {
      showToast("Failed to send invoice.", "err");
    } finally { setSending(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSend} style={{ background: "#fff", borderRadius: 12, padding: 28, width: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Send Invoice {invoice.id}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: brand.muted }}>×</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Recipient Email</FieldLabel>
          <input style={inp} type="email" required value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Message (optional)</FieldLabel>
          <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={message} onChange={e => setMsg(e.target.value)} placeholder="Payment instructions, notes…" />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={sending}>{sending ? "Sending…" : "Send Invoice"}</Btn>
        </div>
      </form>
    </div>
  );
}

// ─── Ticket picker panel ─────────────────────────────────────────────────────
function TicketPickerPanel({ invoice, showToast, onInvoiceUpdated }) {
  const [unbilled, setUnbilled]   = useState(null);   // null = loading
  const [selected, setSelected]   = useState(new Set());
  const [adding, setAdding]       = useState(false);

  const load = useCallback(async () => {
    setUnbilled(null);
    try { setUnbilled(await listUnbilledTickets(invoice.id)); }
    catch { showToast("Failed to load unbilled tickets.", "err"); setUnbilled([]); }
  }, [invoice.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleAdd = async () => {
    if (!selected.size) return;
    setAdding(true);
    try {
      const updated = await attachTickets(invoice.id, [...selected]);
      setSelected(new Set());
      onInvoiceUpdated(updated);
      await load();
      showToast(`${selected.size} ticket${selected.size > 1 ? "s" : ""} added.`, "ok");
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to attach tickets.", "err");
      await load();  // refresh so a stale/already-billed ticket disappears from the picker
    }
    finally { setAdding(false); }
  };

  const handleDetach = async (ticketId) => {
    try {
      const updated = await detachTicket(invoice.id, ticketId);
      onInvoiceUpdated(updated);
      await load();
      showToast("Ticket removed from invoice.", "ok");
    } catch { showToast("Failed to remove ticket.", "err"); }
  };

  const handleMarkPaid = async () => {
    const ids = invoice.linked_tickets.map(t => t.id);
    if (!ids.length) return;
    if (!window.confirm(`Mark ${ids.length} ticket${ids.length > 1 ? "s" : ""} as paid?`)) return;
    try {
      await markTicketsPaid(ids);
      showToast("Tickets marked as paid.", "ok");
      const updated = await getInvoice(invoice.id);
      onInvoiceUpdated(updated);
    } catch { showToast("Failed to mark tickets paid.", "err"); }
  };

  const BILLING_COLORS = {
    unbilled: { bg: "#f3f4f6", color: "#6b7280" },
    invoiced: { bg: "#dbeafe", color: "#1d4ed8" },
    paid:     { bg: "#d1fae5", color: "#065f46" },
  };

  const rowStyle = { padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, fontSize: 13 };

  return (
    <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px", marginTop: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
        Linked Tickets
      </div>

      {/* Already attached */}
      {invoice.linked_tickets?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Ticket", "Title", "Status", "Billing", ""].map((h, i) => (
                  <th key={i} style={{ padding: "6px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.linked_tickets.map(t => {
                const bc = BILLING_COLORS[t.billing_status] || BILLING_COLORS.unbilled;
                return (
                  <tr key={t.id}>
                    <td style={{ ...rowStyle, fontWeight: 700, color: brand.blue, whiteSpace: "nowrap" }}>{t.id}</td>
                    <td style={rowStyle}>{t.title}</td>
                    <td style={rowStyle}><span style={{ color: brand.muted }}>{t.status}</span></td>
                    <td style={rowStyle}>
                      <span style={{ ...bc, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{t.billing_status}</span>
                    </td>
                    <td style={{ ...rowStyle, textAlign: "right" }}>
                      <button onClick={() => handleDetach(t.id)}
                        style={{ background: "none", border: "none", color: brand.danger, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <Btn small variant="success" onClick={handleMarkPaid}>✓ Mark All Tickets Paid</Btn>
          </div>
        </div>
      )}

      {/* Unbilled ticket picker */}
      <div style={{ fontSize: 12, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
        Add Resolved Tickets from This Client
      </div>
      {unbilled === null ? (
        <div style={{ color: brand.muted, fontSize: 13 }}>Loading…</div>
      ) : unbilled.length === 0 ? (
        <div style={{ color: brand.muted, fontSize: 13 }}>No resolved, unbilled tickets for this client.</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                <th style={{ padding: "6px 12px", width: 32 }}></th>
                {["Ticket", "Title", "Date"].map((h, i) => (
                  <th key={i} style={{ padding: "6px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unbilled.map(t => (
                <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => toggle(t.id)}>
                  <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, width: 32 }}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} onClick={e => e.stopPropagation()} />
                  </td>
                  <td style={{ ...rowStyle, fontWeight: 700, color: brand.blue }}>{t.id}</td>
                  <td style={rowStyle}>{t.title}</td>
                  <td style={{ ...rowStyle, color: brand.muted }}>{fmtDate(t.created_at?.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <Btn small variant="primary" onClick={handleAdd} disabled={!selected.size || adding}>
              {adding ? "Adding…" : `+ Add ${selected.size || ""} Selected`}
            </Btn>
            {selected.size > 0 && (
              <span style={{ fontSize: 12, color: brand.muted }}>{selected.size} ticket{selected.size > 1 ? "s" : ""} selected</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Ticket picker for new invoices (no invoice ID yet) ──────────────────────
function NewInvoiceTicketPicker({ clientId, clientName, selected, onToggle }) {
  const [unbilled, setUnbilled] = useState(null);

  useEffect(() => {
    if (!clientId && !clientName) { setUnbilled([]); return; }
    setUnbilled(null);
    listUnbilledTicketsForClient(clientId, clientName)
      .then(setUnbilled)
      .catch(() => setUnbilled([]));
  }, [clientId, clientName]);

  if (!clientId && !clientName) return null;

  const rowStyle = { padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, fontSize: 13 };

  return (
    <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px", marginTop: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
        Attach Resolved Tickets
      </div>
      {unbilled === null ? (
        <div style={{ color: brand.muted, fontSize: 13 }}>Loading…</div>
      ) : unbilled.length === 0 ? (
        <div style={{ color: brand.muted, fontSize: 13 }}>No resolved, unbilled tickets for this client.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: brand.bg }}>
              <th style={{ padding: "6px 12px", width: 32 }}></th>
              {["Ticket", "Title", "Date"].map((h, i) => (
                <th key={i} style={{ padding: "6px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {unbilled.map(t => (
              <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => onToggle(t.id)}>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${brand.border}`, width: 32 }}>
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => onToggle(t.id)} onClick={e => e.stopPropagation()} />
                </td>
                <td style={{ ...rowStyle, fontWeight: 700, color: brand.blue }}>{t.id}</td>
                <td style={rowStyle}>{t.title}</td>
                <td style={{ ...rowStyle, color: brand.muted }}>{fmtDate(t.created_at?.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selected.size > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: brand.muted }}>
          {selected.size} ticket{selected.size > 1 ? "s" : ""} will be attached after saving the invoice.
        </div>
      )}
    </div>
  );
}

// ─── Invoice editor (create / edit) ──────────────────────────────────────────
export function InvoiceEditor({ invoice, prefill, clients, onSave, onCancel, showToast, onRefresh }) {
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
  const [saving, setSaving]             = useState(false);
  const [showEmail, setShowEmail]       = useState(false);
  const [liveInvoice, setLive]          = useState(invoice);
  const [ticketRefresh, setTicketRefresh] = useState(0);
  const [stagedTickets, setStagedTickets] = useState(new Set());
  const [clientSearch, setClientSearch] = useState("");

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const pickClient = (id) => {
    const c = clients.find(c => c.id === Number(id));
    if (!c) { up("client_id", null); setClientSearch(""); return; }
    setClientSearch(c.company || c.name);
    setForm(p => ({ ...p, client_id: c.id, client_name: c.name, client_email: c.email, client_address: c.address }));
  };

  // Deduplicate by company for business clients; include all residential
  const uniqueClients = (() => {
    const seen = new Set();
    return clients.filter(c => {
      const key = c.company || `__res_${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const filteredClients = clientSearch.trim()
    ? uniqueClients.filter(c => {
        const term = clientSearch.toLowerCase();
        return (c.company || c.name).toLowerCase().includes(term);
      })
    : uniqueClients;

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
      let saved = isNew ? await createInvoice(payload) : await updateInvoice(invoice.id, payload);
      // Attach any staged tickets selected during new-invoice creation. The invoice
      // already exists at this point, so a ticket failure must not report the whole
      // save as failed — surface the ticket reason but still complete the save.
      if (isNew && stagedTickets.size > 0) {
        try {
          saved = await attachTickets(saved.id, [...stagedTickets]);
        } catch (attachErr) {
          showToast(attachErr?.response?.data?.detail || "Invoice saved, but some tickets could not be attached.", "err");
        }
      }
      setLive(saved);
      onSave(saved);
    } catch { showToast("Failed to save invoice.", "err"); }
    finally { setSaving(false); }
  };

  const refreshLive = async () => {
    if (!invoice?.id) return;
    try { setLive(await getInvoice(invoice.id)); } catch {}
  };

  const handleInvoiceUpdated = (updated) => {
    setLive(updated);
    // Re-sync form lines so totals match
    setForm(p => ({ ...p, lines: updated.lines.map(l => ({ description: l.description, qty: l.qty, unit_price: l.unit_price, amount: l.amount })) }));
    setTicketRefresh(n => n + 1);
  };

  return (
    <>
      {showEmail && liveInvoice && (
        <SendEmailModal
          invoice={liveInvoice}
          showToast={showToast}
          onClose={() => setShowEmail(false)}
        />
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>
              {prefill ? `New Invoice — ${prefill.ticket_id}` : isNew ? "New Invoice" : `Invoice ${invoice.id}`}
            </div>
            {!isNew && liveInvoice && (
              <div style={{ fontSize: 13, color: brand.muted }}>
                Paid: <strong style={{ color: brand.success }}>${fmt(liveInvoice.amount_paid)}</strong>
                &nbsp;·&nbsp;Balance: <strong style={{ color: liveInvoice.balance > 0 ? brand.danger : brand.success }}>${fmt(liveInvoice.balance)}</strong>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!isNew && (
              <>
                <Btn variant="ghost" small onClick={() => openPdfWithAuth(invoicePdfUrl(invoice.id))}>⬇ PDF</Btn>
                <Btn variant="secondary" small onClick={() => setShowEmail(true)}>✉ Send</Btn>
              </>
            )}
            <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
            <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : isNew ? "Create Invoice" : "Save Changes"}</Btn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          {/* Client */}
          <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Bill To</div>
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Search Client</FieldLabel>
              <input
                style={inp}
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); if (!e.target.value) { up("client_id", null); } }}
                placeholder="Type to search business or name…"
              />
              {clientSearch.trim() && (
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: "auto", background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.10)", zIndex: 10, position: "relative" }}>
                  {filteredClients.length === 0 ? (
                    <div style={{ padding: "10px 12px", fontSize: 13, color: brand.muted }}>No matches</div>
                  ) : (
                    filteredClients.map(c => (
                      <div key={c.id}
                        onMouseDown={e => { e.preventDefault(); pickClient(c.id); }}
                        style={{ padding: "9px 12px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${brand.border}`, background: form.client_id === c.id ? brand.bg : "#fff" }}>
                        <span style={{ fontWeight: 600 }}>{c.company || c.name}</span>
                        {c.company && c.name !== c.company && <span style={{ color: brand.muted, marginLeft: 6 }}>({c.name})</span>}
                      </div>
                    ))
                  )}
                </div>
              )}
              {form.client_id && (
                <div style={{ marginTop: 6, fontSize: 12, color: brand.success, fontWeight: 600 }}>
                  ✓ {form.client_name} selected
                  &nbsp;<button type="button" onClick={() => { pickClient(""); setClientSearch(""); }} style={{ background: "none", border: "none", color: brand.danger, cursor: "pointer", fontSize: 12 }}>✕ Clear</button>
                </div>
              )}
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

        {/* Ticket picker during new invoice creation */}
        {isNew && (
          <NewInvoiceTicketPicker
            clientId={form.client_id}
            clientName={form.client_id ? null : form.client_name}
            selected={stagedTickets}
            onToggle={(id) => setStagedTickets(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })}
          />
        )}
      </form>

      {/* Payments panel — only visible when editing an existing invoice */}
      {!isNew && liveInvoice && (
        <PaymentsPanel
          invoice={liveInvoice}
          showToast={showToast}
          onRefresh={refreshLive}
        />
      )}

      {/* Ticket picker — only visible when editing an existing invoice with a client */}
      {!isNew && liveInvoice && (liveInvoice.client_id || liveInvoice.client_name) && (
        <TicketPickerPanel
          key={ticketRefresh}
          invoice={liveInvoice}
          showToast={showToast}
          onInvoiceUpdated={handleInvoiceUpdated}
        />
      )}
    </>
  );
}

// ─── Invoice editor page (routed: /invoices/new and /invoices/:invoiceId) ─────
export function InvoiceEditorRoute({ showToast, prefill = null, onDraftConsumed }) {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const isNew = !invoiceId;                       // /invoices/new has no :invoiceId
  const [invoice, setInvoice] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => { listClients().then(setClients).catch(() => {}); }, []);

  useEffect(() => {
    if (isNew) { setLoading(false); return; }
    setLoading(true);
    getInvoice(invoiceId)
      .then(setInvoice)
      .catch(() => { showToast("Failed to load invoice.", "err"); navigate("/invoices", { replace: true }); })
      .finally(() => setLoading(false));
  }, [invoiceId, isNew]);

  const handleSave = () => {
    showToast(isNew ? "Invoice created." : "Invoice updated.", "ok");
    if (isNew && onDraftConsumed) onDraftConsumed();
    navigate("/invoices");
  };

  const handleCancel = () => {
    if (isNew && onDraftConsumed) onDraftConsumed();
    navigate("/invoices");
  };

  if (loading) return <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>;

  return (
    <InvoiceEditor
      invoice={isNew ? null : invoice}
      prefill={isNew ? prefill : null}
      clients={clients}
      onSave={handleSave}
      onCancel={handleCancel}
      showToast={showToast}
    />
  );
}

// ─── Invoice list (routed: /invoices) ─────────────────────────────────────────
function InvoiceListTab({ showToast }) {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");

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

  const handleEdit = (inv) => navigate(`/invoices/${inv.id}`);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    try {
      await deleteInvoice(id);
      showToast("Invoice deleted.", "ok");
      load();
    } catch { showToast("Failed to delete invoice.", "err"); }
  };

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
        <Btn variant="accent" onClick={() => navigate("/invoices/new")}>+ New Invoice</Btn>
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
                        <Btn small variant="ghost" onClick={() => openPdfWithAuth(invoicePdfUrl(inv.id))}>PDF</Btn>
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

// ─── Recurring invoices tab ────────────────────────────────────────────────────

const INTERVALS = ["daily", "weekly", "monthly", "quarterly"];

const RECURRING_INVOICE_DEFAULTS = {
  name: "", active: true, interval: "monthly",
  client_id: null, client_name: "", client_email: "", client_address: "",
  tax_rate: 0, notes: "", auto_send: false,
  lines: [{ description: "", qty: 1, unit_price: 0 }],
};

function RecurringInvoicesTab({ showToast, clients = [] }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | existing row
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listRecurringInvoices()); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...editing, lines: editing.lines.filter(l => l.description.trim()) };
      if (editing.id) {
        await updateRecurringInvoice(editing.id, payload);
      } else {
        await createRecurringInvoice(payload);
      }
      showToast("Saved.", "ok");
      setEditing(null);
      load();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Save failed.", "err");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this recurring invoice schedule? This cannot be undone.")) return;
    try {
      await deleteRecurringInvoice(id);
      showToast("Deleted.", "ok");
      load();
    } catch { showToast("Delete failed.", "err"); }
  };

  const up = (field, val) => setEditing(prev => ({ ...prev, [field]: val }));

  const handleClientSelect = (clientId) => {
    const c = clients.find(cl => cl.id === parseInt(clientId));
    setEditing(prev => ({
      ...prev,
      client_id:      c ? c.id      : null,
      client_name:    c ? c.name    : "",
      client_email:   c ? c.email   : "",
      client_address: c ? c.address : "",
    }));
  };

  const updLine = (i, field, val) => setEditing(prev => {
    const lines = [...prev.lines];
    lines[i] = { ...lines[i], [field]: val };
    return { ...prev, lines };
  });
  const addLine = () => setEditing(prev => ({ ...prev, lines: [...prev.lines, { description: "", qty: 1, unit_price: 0 }] }));
  const remLine = (i) => setEditing(prev => ({ ...prev, lines: prev.lines.filter((_, idx) => idx !== i) }));

  const nextRunLabel = (dt) => new Date(dt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (editing !== null) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Btn onClick={() => setEditing(null)} variant="ghost" small>← Back</Btn>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: brand.text }}>{editing.id ? "Edit Recurring Invoice" : "New Recurring Invoice"}</h2>
        </div>
        <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, padding: 24, maxWidth: 720 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <FieldLabel>Schedule Name *</FieldLabel>
              <input value={editing.name} onChange={e => up("name", e.target.value)} style={inp} placeholder="e.g. Acme Monthly Retainer" />
            </div>
            <div>
              <FieldLabel>Interval</FieldLabel>
              <select value={editing.interval} onChange={e => up("interval", e.target.value)} style={inp}>
                {INTERVALS.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Active</FieldLabel>
              <select value={editing.active ? "true" : "false"} onChange={e => up("active", e.target.value === "true")} style={inp}>
                <option value="true">Yes</option>
                <option value="false">Paused</option>
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <FieldLabel>Client</FieldLabel>
              <select value={editing.client_id || ""} onChange={e => handleClientSelect(e.target.value)} style={inp}>
                <option value="">— Select client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Tax Rate</FieldLabel>
              <select value={editing.tax_rate} onChange={e => up("tax_rate", parseFloat(e.target.value))} style={inp}>
                {TAX_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Auto-send to client</FieldLabel>
              <select value={editing.auto_send ? "true" : "false"} onChange={e => up("auto_send", e.target.value === "true")} style={inp}>
                <option value="false">No — save as Draft</option>
                <option value="true">Yes — email immediately</option>
              </select>
            </div>
          </div>

          <FieldLabel>Line Items</FieldLabel>
          <div style={{ fontSize: 11, color: brand.muted, marginBottom: 8 }}>Use <code>{"{month}"}</code> in a description to interpolate the generation month (e.g. "Retainer — {"{month}"}" → "Retainer — July 2026").</div>
          {editing.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <input value={l.description} onChange={e => updLine(i, "description", e.target.value)} style={{ ...inp, flex: 1 }} placeholder="Description" />
              <input type="number" value={l.qty} onChange={e => updLine(i, "qty", parseFloat(e.target.value) || 0)} style={{ ...inp, width: 80 }} placeholder="Qty" />
              <input type="number" value={l.unit_price} onChange={e => updLine(i, "unit_price", parseFloat(e.target.value) || 0)} style={{ ...inp, width: 110 }} placeholder="Unit price" />
              <button onClick={() => remLine(i)} style={{ background: "none", border: "none", color: brand.danger, cursor: "pointer", fontSize: 18, padding: "6px 4px" }}>×</button>
            </div>
          ))}
          <Btn small variant="secondary" onClick={addLine}>+ Add Line</Btn>

          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            <Btn onClick={handleSave} disabled={saving || !editing.name.trim() || !editing.client_email}>{saving ? "Saving…" : "Save"}</Btn>
            <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Recurring Invoices</div>
          <div style={{ fontSize: 13, color: brand.muted }}>{items.length} schedule{items.length !== 1 ? "s" : ""}</div>
        </div>
        <Btn variant="accent" onClick={() => setEditing({ ...RECURRING_INVOICE_DEFAULTS })}>+ New Schedule</Btn>
      </div>

      {loading ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>No recurring invoice schedules yet.</div>
      ) : (
        <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Name", "Client", "Interval", "Auto-send", "Next Run", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(r => (
                <tr key={r.id}>
                  <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, fontWeight: 600 }}>{r.name}{!r.active && <span style={{ marginLeft: 8, fontSize: 11, color: brand.muted }}>(paused)</span>}</td>
                  <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}` }}>{r.client_name || "—"}</td>
                  <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, textTransform: "capitalize" }}>{r.interval}</td>
                  <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}` }}>{r.auto_send ? "Yes" : "No"}</td>
                  <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, color: brand.muted, fontSize: 13 }}>{nextRunLabel(r.next_run)}</td>
                  <td style={{ padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <Btn small variant="secondary" onClick={() => setEditing(r)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => handleDelete(r.id)}>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page shell (tabs) ──────────────────────────────────────────────────────────

export default function InvoicesPage({ showToast, features }) {
  const [tab, setTab] = useState("invoices");
  const [clients, setClients] = useState([]);
  const showRecurring = features?.recurring_invoicing !== false;
  const tabs = [{ id: "invoices", label: "Invoices" }, ...(showRecurring ? [{ id: "recurring", label: "Recurring" }] : [])];

  useEffect(() => { listClients().then(setClients).catch(() => {}); }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, borderBottom: `2px solid ${brand.border}`, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "8px 20px", background: "none", border: "none", borderBottom: `3px solid ${tab === t.id ? brand.blue : "transparent"}`, marginBottom: -2, fontWeight: 700, fontSize: 13, color: tab === t.id ? brand.blue : brand.muted, cursor: "pointer", fontFamily: "inherit" }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "invoices" && <InvoiceListTab showToast={showToast} />}
      {tab === "recurring" && showRecurring && <RecurringInvoicesTab showToast={showToast} clients={clients} />}
    </div>
  );
}
