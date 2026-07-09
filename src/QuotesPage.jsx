import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  listQuotes, getQuote, createQuote, updateQuote, deleteQuote,
  setQuoteStatus, convertQuoteToInvoice, sendQuoteEmail, quotePdfUrl,
} from "./api/quotes.js";
import { listClients } from "./api/clients.js";
import { listMaterials } from "./api/materials.js";
import { openPdfWithAuth } from "./api/client.js";

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
  Draft:    { bg: "#f0f0f0", color: brand.muted },
  Sent:     { bg: "#dbeafe", color: "#1d4ed8" },
  Approved: { bg: "#d1fae5", color: "#065f46" },
  Rejected: { bg: "#fee2e2", color: "#991b1b" },
  Expired:  { bg: "#f3f4f6", color: "#6b7280" },
};

const STATUSES = ["All", "Draft", "Sent", "Approved", "Rejected", "Expired"];
const TAX_PRESETS = [
  { label: "No tax (0%)", value: 0 },
  { label: "QC (14.975%)", value: 0.14975 },
  { label: "ON (13%)", value: 0.13 },
  { label: "BC (12%)", value: 0.12 },
  { label: "AB (5% GST)", value: 0.05 },
];

const ITEM_TYPES = ["Labor", "Material"];
const EMPTY_LINE = { description: "", item_type: "Labor", qty: 1, unit_price: 0, amount: 0 };
const EMPTY_QUOTE = {
  client_id: null, client_name: "", client_email: "", client_address: "", project_name: "",
  issue_date: new Date().toISOString().slice(0, 10),
  expiry_date: "", notes: "", tax_rate: 0, lines: [{ ...EMPTY_LINE }],
};

function fmt(n) { return Number(n || 0).toFixed(2); }
function fmtDate(d) { return d ? new Date(d + "T00:00:00").toLocaleDateString() : "—"; }

// ─── Send email modal ─────────────────────────────────────────────────────────
function SendEmailModal({ quote, showToast, onClose, onSent }) {
  const [to, setTo] = useState(quote.client_email || "");
  const [message, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await sendQuoteEmail(quote.id, { to, message });
      showToast("Quote sent.", "ok");
      onSent();
      onClose();
    } catch {
      showToast("Failed to send quote.", "err");
    } finally { setSending(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSend} style={{ background: "#fff", borderRadius: 12, padding: 28, width: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Send Quote {quote.id}</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: brand.muted }}>×</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Recipient Email</FieldLabel>
          <input style={inp} type="email" required value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Message (optional)</FieldLabel>
          <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={message} onChange={e => setMsg(e.target.value)} placeholder="Notes for the client…" />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={sending}>{sending ? "Sending…" : "Send Quote"}</Btn>
        </div>
      </form>
    </div>
  );
}

// ─── Quote editor (create / edit) ────────────────────────────────────────────
export function QuoteEditor({ quote, clients, materials = [], onSave, onCancel, showToast }) {
  const isNew = !quote;
  const [form, setForm] = useState(() => {
    if (!quote) return { ...EMPTY_QUOTE };
    return {
      client_id: quote.client_id ?? null,
      client_name: quote.client_name,
      client_email: quote.client_email,
      client_address: quote.client_address,
      project_name: quote.project_name ?? "",
      issue_date: quote.issue_date,
      expiry_date: quote.expiry_date ?? "",
      notes: quote.notes,
      tax_rate: quote.tax_rate,
      lines: quote.lines.length ? quote.lines.map(l => ({ description: l.description, item_type: l.item_type || "Labor", qty: l.qty, unit_price: l.unit_price, amount: l.amount })) : [{ ...EMPTY_LINE }],
    };
  });
  const [saving, setSaving] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [live, setLive] = useState(quote);
  const [clientSearch, setClientSearch] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [converting, setConverting] = useState(false);
  const [openMaterialRow, setOpenMaterialRow] = useState(null);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const pickClient = (id) => {
    const c = clients.find(c => c.id === Number(id));
    if (!c) { up("client_id", null); setClientSearch(""); return; }
    setClientSearch(c.company || c.name);
    setForm(p => ({ ...p, client_id: c.id, client_name: c.name, client_email: c.email, client_address: c.address }));
  };

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
    ? uniqueClients.filter(c => (c.company || c.name).toLowerCase().includes(clientSearch.toLowerCase()))
    : uniqueClients;

  const upLine = (i, k, raw) => {
    setForm(p => {
      const lines = p.lines.map((l, idx) => {
        if (idx !== i) return l;
        const updated = { ...l, [k]: raw };
        // Materials are whole units — switching a line to Material rounds qty up to the nearest full unit.
        if (k === "item_type" && raw === "Material") {
          updated.qty = Math.max(1, Math.round(Number(updated.qty) || 1));
        }
        const qty = k === "qty" ? Number(raw) : Number(updated.qty);
        const up2 = k === "unit_price" ? Number(raw) : Number(updated.unit_price);
        updated.amount = parseFloat((qty * up2).toFixed(2));
        return updated;
      });
      return { ...p, lines };
    });
  };

  const pickMaterial = (i, m) => {
    setForm(p => {
      const lines = p.lines.map((l, idx) => {
        if (idx !== i) return l;
        const qty = Math.max(1, Math.round(Number(l.qty) || 1));
        const unit_price = Number(m.unit_price) || 0;
        return { ...l, description: m.name, item_type: "Material", qty, unit_price, amount: parseFloat((qty * unit_price).toFixed(2)) };
      });
      return { ...p, lines };
    });
    setOpenMaterialRow(null);
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
        expiry_date: form.expiry_date || null,
        tax_rate: Number(form.tax_rate),
        lines: form.lines.map(l => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price), amount: Number(l.amount) })),
      };
      const saved = isNew ? await createQuote(payload) : await updateQuote(quote.id, payload);
      setLive(saved);
      onSave(saved);
    } catch { showToast("Failed to save quote.", "err"); }
    finally { setSaving(false); }
  };

  const handleTransition = async (status) => {
    setTransitioning(true);
    try {
      const updated = await setQuoteStatus(quote.id, status);
      setLive(updated);
      showToast(`Quote marked ${status}.`, "ok");
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to update status.", "err");
    } finally { setTransitioning(false); }
  };

  const handleConvert = async () => {
    if (!window.confirm("Convert this quote to an invoice?")) return;
    setConverting(true);
    try {
      const { invoice_id } = await convertQuoteToInvoice(quote.id);
      showToast(`Converted to invoice ${invoice_id}.`, "ok");
      const updated = await getQuote(quote.id);
      setLive(updated);
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to convert quote.", "err");
    } finally { setConverting(false); }
  };

  const canEdit = isNew || live?.status === "Draft";

  return (
    <>
      {showEmail && live && (
        <SendEmailModal quote={live} showToast={showToast} onClose={() => setShowEmail(false)} onSent={async () => setLive(await getQuote(quote.id))} />
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>
              {isNew ? "New Quote" : `Quote ${quote.id}`}
            </div>
            {!isNew && live && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: brand.muted }}>
                <span style={{ ...(STATUS_COLORS[live.status] || STATUS_COLORS.Draft), borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{live.status}</span>
                {live.converted_invoice_id && <span>Converted to invoice {live.converted_invoice_id}</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!isNew && (
              <>
                <Btn variant="ghost" small onClick={() => openPdfWithAuth(quotePdfUrl(quote.id))}>⬇ PDF</Btn>
                {(live?.status === "Draft" || live?.status === "Sent") && (
                  <Btn variant="secondary" small onClick={() => setShowEmail(true)}>✉ Send</Btn>
                )}
                {live?.status === "Draft" && (
                  <Btn variant="danger" small disabled={transitioning} onClick={() => handleTransition("Rejected")}>Reject</Btn>
                )}
                {live?.status === "Sent" && (
                  <>
                    <Btn variant="success" small disabled={transitioning} onClick={() => handleTransition("Approved")}>Approve</Btn>
                    <Btn variant="danger" small disabled={transitioning} onClick={() => handleTransition("Rejected")}>Reject</Btn>
                    <Btn variant="ghost" small disabled={transitioning} onClick={() => handleTransition("Expired")}>Mark Expired</Btn>
                  </>
                )}
                {live?.status === "Approved" && !live?.converted_invoice_id && (
                  <Btn variant="accent" small disabled={converting} onClick={handleConvert}>{converting ? "Converting…" : "Convert to Invoice"}</Btn>
                )}
              </>
            )}
            <Btn variant="ghost" onClick={onCancel}>{canEdit ? "Cancel" : "Close"}</Btn>
            {canEdit && <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Saving…" : isNew ? "Create Quote" : "Save Changes"}</Btn>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Quote For</div>
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Search Client</FieldLabel>
              <input
                style={inp}
                disabled={!canEdit}
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); if (!e.target.value) up("client_id", null); }}
                placeholder="Type to search business or name…"
              />
              {canEdit && clientSearch.trim() && (
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
            </div>
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Name</FieldLabel>
              <input style={inp} disabled={!canEdit} value={form.client_name} onChange={e => up("client_name", e.target.value)} placeholder="Client name" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Email</FieldLabel>
              <input style={inp} disabled={!canEdit} type="email" value={form.client_email} onChange={e => up("client_email", e.target.value)} placeholder="client@example.com" />
            </div>
            <div>
              <FieldLabel>Address</FieldLabel>
              <textarea style={{ ...inp, minHeight: 56, resize: "vertical" }} disabled={!canEdit} value={form.client_address} onChange={e => up("client_address", e.target.value)} placeholder="Address" />
            </div>
          </div>

          <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Quote Details</div>
            <div style={{ marginBottom: 10 }}>
              <FieldLabel>Project Name</FieldLabel>
              <input style={inp} disabled={!canEdit} value={form.project_name} onChange={e => up("project_name", e.target.value)} placeholder="e.g. Office Network Upgrade" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <FieldLabel>Tax</FieldLabel>
                <select style={inp} disabled={!canEdit} value={form.tax_rate} onChange={e => up("tax_rate", e.target.value)}>
                  {TAX_PRESETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Issue Date</FieldLabel>
                <input style={inp} disabled={!canEdit} type="date" value={form.issue_date} onChange={e => up("issue_date", e.target.value)} required />
              </div>
              <div>
                <FieldLabel>Expiry Date</FieldLabel>
                <input style={inp} disabled={!canEdit} type="date" value={form.expiry_date} onChange={e => up("expiry_date", e.target.value)} />
              </div>
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} disabled={!canEdit} value={form.notes} onChange={e => up("notes", e.target.value)} placeholder="Terms, scope notes, etc." />
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Line Items</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Description", "Type", "Qty", "Unit Price", "Amount", ""].map((h, i) => (
                  <th key={i} style={{ padding: "8px 10px", textAlign: i > 1 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => {
                const isMaterial = l.item_type === "Material";
                const materialMatches = isMaterial && l.description.trim()
                  ? materials.filter(m => m.name.toLowerCase().includes(l.description.trim().toLowerCase()))
                  : [];
                return (
                <tr key={i}>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, position: "relative" }}>
                    <input
                      style={inp}
                      disabled={!canEdit}
                      value={l.description}
                      onChange={e => upLine(i, "description", e.target.value)}
                      onFocus={() => isMaterial && setOpenMaterialRow(i)}
                      onBlur={() => setTimeout(() => setOpenMaterialRow(o => (o === i ? null : o)), 150)}
                      placeholder={isMaterial ? "Search materials or type a name…" : "Description of service or product"}
                    />
                    {canEdit && isMaterial && openMaterialRow === i && l.description.trim() && (
                      <div style={{ border: `1px solid ${brand.border}`, borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: "auto", background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.10)", zIndex: 10, position: "absolute", left: 10, right: 10 }}>
                        {materialMatches.length === 0 ? (
                          <div style={{ padding: "9px 12px", fontSize: 13, color: brand.muted }}>No matches</div>
                        ) : (
                          materialMatches.map(m => (
                            <div key={m.id}
                              onMouseDown={e => { e.preventDefault(); pickMaterial(i, m); }}
                              style={{ padding: "9px 12px", fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${brand.border}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span style={{ fontWeight: 600 }}>{m.name}</span>
                              <span style={{ color: brand.muted }}>${fmt(m.unit_price)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 110 }}>
                    <select style={inp} disabled={!canEdit} value={l.item_type || "Labor"} onChange={e => upLine(i, "item_type", e.target.value)}>
                      {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 90 }}>
                    <input style={{ ...inp, textAlign: "right" }} disabled={!canEdit} type="number" min={isMaterial ? "1" : "0"} step={isMaterial ? "1" : "0.01"} value={l.qty} onChange={e => upLine(i, "qty", e.target.value)} />
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 130 }}>
                    <input style={{ ...inp, textAlign: "right" }} disabled={!canEdit} type="number" min="0" step="0.01" value={l.unit_price} onChange={e => upLine(i, "unit_price", e.target.value)} />
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 120, textAlign: "right", fontWeight: 600, color: brand.text }}>
                    ${fmt(l.amount)}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 40, textAlign: "right" }}>
                    {canEdit && form.lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)}
                        style={{ background: "none", border: "none", color: brand.danger, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {canEdit && (
            <div style={{ marginTop: 10 }}>
              <Btn variant="ghost" small onClick={addLine}>+ Add Line</Btn>
            </div>
          )}
        </div>

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
    </>
  );
}

// ─── Quote editor page (routed: /quotes/new and /quotes/:quoteId) ────────────
export function QuoteEditorRoute({ showToast }) {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const isNew = !quoteId;
  const [quote, setQuote] = useState(null);
  const [clients, setClients] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => { listClients().then(setClients).catch(() => {}); }, []);
  useEffect(() => { listMaterials().then(setMaterials).catch(() => {}); }, []);

  useEffect(() => {
    if (isNew) { setLoading(false); return; }
    setLoading(true);
    getQuote(quoteId)
      .then(setQuote)
      .catch(() => { showToast("Failed to load quote.", "err"); navigate("/quotes", { replace: true }); })
      .finally(() => setLoading(false));
  }, [quoteId, isNew]);

  const handleSave = () => {
    showToast(isNew ? "Quote created." : "Quote updated.", "ok");
    navigate("/quotes");
  };

  const handleCancel = () => navigate("/quotes");

  if (loading) return <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>;

  return (
    <QuoteEditor
      quote={isNew ? null : quote}
      clients={clients}
      materials={materials}
      onSave={handleSave}
      onCancel={handleCancel}
      showToast={showToast}
    />
  );
}

// ─── Quote list (routed: /quotes) ─────────────────────────────────────────────
export default function QuotesPage({ showToast }) {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");

  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (statusFilter !== "All") params.status = statusFilter;
      const data = await listQuotes(params);
      setQuotes(data.items);
      setTotal(data.total);
    } catch { showToast("Failed to load quotes.", "err"); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = (q) => navigate(`/quotes/${q.id}`);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this quote? This cannot be undone.")) return;
    try {
      await deleteQuote(id);
      showToast("Quote deleted.", "ok");
      load();
    } catch { showToast("Failed to delete quote.", "err"); }
  };

  const cell = { padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Quotes</div>
          <div style={{ fontSize: 13, color: brand.muted }}>{total} quote{total !== 1 ? "s" : ""}</div>
        </div>
        <Btn variant="accent" onClick={() => navigate("/quotes/new")}>+ New Quote</Btn>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${statusFilter === s ? brand.blue : brand.border}`, background: statusFilter === s ? brand.blue : "#fff", color: statusFilter === s ? "#fff" : brand.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
      ) : (
        <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Quote #", "Client", "Project", "Status", "Issue Date", "Expiry Date", "Total", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: i === 6 ? "right" : "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 && (
                <tr><td colSpan={8} style={{ ...cell, textAlign: "center", color: brand.muted, padding: 40 }}>
                  No quotes yet.
                </td></tr>
              )}
              {quotes.map(q => {
                const sc = STATUS_COLORS[q.status] || STATUS_COLORS.Draft;
                return (
                  <tr key={q.id} style={{ cursor: "pointer" }} onClick={() => handleEdit(q)}>
                    <td style={{ ...cell, fontWeight: 700, color: brand.blue }}>{q.id}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>{q.client_name || "—"}</td>
                    <td style={{ ...cell, color: brand.muted }}>{q.project_name || "—"}</td>
                    <td style={cell}>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{q.status}</span>
                    </td>
                    <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{fmtDate(q.issue_date)}</td>
                    <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{fmtDate(q.expiry_date)}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>${fmt(q.total)}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Btn small variant="ghost" onClick={() => openPdfWithAuth(quotePdfUrl(q.id))}>PDF</Btn>
                        <Btn small variant="secondary" onClick={() => handleEdit(q)}>Edit</Btn>
                        <Btn small variant="danger" onClick={() => handleDelete(q.id)}>Delete</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
