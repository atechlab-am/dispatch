import { useState, useEffect } from "react";
import { getRevenueReport, getTechnicianReport, getSLAReport, getARAgingReport, getQuoteConversionReport, revenueCsvUrl, technicianCsvUrl, slaCsvUrl, arAgingCsvUrl, quoteConversionCsvUrl } from "./api/reports.js";
import { downloadWithAuth } from "./api/client.js";

const brand = {
  blue: "var(--dispatch-primary)",
  accent: "#E8A020",
  bg: "var(--dispatch-bg)",
  surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)",
  text: "var(--dispatch-text)",
  muted: "var(--dispatch-muted)",
  success: "#1a8f4a",
  danger: "#c0392b",
  amber: "#b45309",
};

const inp = {
  padding: "7px 11px",
  border: `1px solid ${brand.border}`,
  borderRadius: "var(--dispatch-radius-md)",
  fontSize: 13,
  color: brand.text,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
};

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
    {children}
  </div>
);

const Btn = ({ onClick, href, children, variant = "primary", small, disabled }) => {
  const s = {
    primary:   { background: brand.blue,   color: "var(--dispatch-on-color)",       border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    accent:    { background: brand.accent,  color: "var(--dispatch-on-color)",       border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant] || {};

  const style = {
    ...s,
    padding: small ? "5px 12px" : "8px 18px",
    borderRadius: "var(--dispatch-radius-md)",
    fontSize: small ? 12 : 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.6 : 1,
    textDecoration: "none",
    display: "inline-block",
  };

  if (href) {
    return <a href={href} download style={style}>{children}</a>;
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
};

const fmt = (n) => Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cellStyle = { padding: "10px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle", fontSize: 13, color: brand.text };
const thStyle  = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}`, background: brand.bg };

// ─── Date filter bar ──────────────────────────────────────────────────────────

function DateFilter({ filters, setFilters, csvHref, csvFilename }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}>
      <div>
        <FieldLabel>From</FieldLabel>
        <input type="date" style={inp} value={filters.date_from} onChange={e => setFilters(p => ({ ...p, date_from: e.target.value }))} />
      </div>
      <div>
        <FieldLabel>To</FieldLabel>
        <input type="date" style={inp} value={filters.date_to} onChange={e => setFilters(p => ({ ...p, date_to: e.target.value }))} />
      </div>
      <div style={{ marginLeft: "auto" }}>
        <Btn onClick={() => downloadWithAuth(csvHref, csvFilename || "report.csv")} variant="secondary" small>↓ Export CSV</Btn>
      </div>
    </div>
  );
}

// ─── Revenue tab ─────────────────────────────────────────────────────────────

function RevenueTab() {
  const [filters, setFilters] = useState({ date_from: "", date_to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));

  useEffect(() => {
    setLoading(true);
    getRevenueReport(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [filters.date_from, filters.date_to]);

  return (
    <div>
      <DateFilter filters={filters} setFilters={setFilters} csvHref={revenueCsvUrl(params)} csvFilename="revenue-report.csv" />

      {loading && <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>}

      {!loading && data && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
            {[
              { label: "Total Billed", value: `$${fmt(data.grand_total_billed)}`, color: brand.blue },
              { label: "Total Paid",   value: `$${fmt(data.grand_total_paid)}`,   color: brand.success },
              { label: "Outstanding",  value: `$${fmt(data.grand_total_billed - data.grand_total_paid)}`, color: data.grand_total_billed - data.grand_total_paid > 0 ? brand.amber : brand.success },
            ].map(card => (
              <div key={card.label} style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", padding: "18px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* By month */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 10 }}>By Month</div>
            {data.by_month.length === 0
              ? <div style={{ color: brand.muted, fontSize: 13 }}>No data for selected period.</div>
              : (
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Month", "Billed", "Paid", "Outstanding"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.by_month.map(row => (
                        <tr key={row.month} style={{ background: brand.surface }}>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>{row.month}</td>
                          <td style={cellStyle}>${fmt(row.total_billed)}</td>
                          <td style={{ ...cellStyle, color: brand.success }}>${fmt(row.total_paid)}</td>
                          <td style={{ ...cellStyle, color: row.total_billed - row.total_paid > 0 ? brand.amber : brand.success }}>${fmt(row.total_billed - row.total_paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>

          {/* By client */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 10 }}>By Client</div>
            {data.by_client.length === 0
              ? <div style={{ color: brand.muted, fontSize: 13 }}>No data for selected period.</div>
              : (
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Client", "Invoices", "Total Billed"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.by_client.map(row => (
                        <tr key={row.client_name} style={{ background: brand.surface }}>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>{row.client_name || "—"}</td>
                          <td style={cellStyle}>{row.invoice_count}</td>
                          <td style={cellStyle}>${fmt(row.total_billed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </>
      )}
    </div>
  );
}

// ─── Technician tab ───────────────────────────────────────────────────────────

function TechnicianTab() {
  const [filters, setFilters] = useState({ date_from: "", date_to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));

  useEffect(() => {
    setLoading(true);
    getTechnicianReport(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [filters.date_from, filters.date_to]);

  return (
    <div>
      <DateFilter filters={filters} setFilters={setFilters} csvHref={technicianCsvUrl(params)} csvFilename="technician-report.csv" />

      {loading && <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>}

      {!loading && data && (
        data.rows.length === 0
          ? <div style={{ color: brand.muted, fontSize: 13 }}>No resolved tickets for selected period.</div>
          : (
            <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Technician", "Tickets Resolved", "Total Hours", "Total Labour"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} style={{ background: brand.surface }}>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{row.technician_name}</td>
                      <td style={cellStyle}>{row.tickets_resolved}</td>
                      <td style={cellStyle}>{Number(row.total_hours).toFixed(2)} h</td>
                      <td style={cellStyle}>${fmt(row.total_labour)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  );
}

// ─── SLA tab ──────────────────────────────────────────────────────────────────

const SLA_COLORS = { Urgent: brand.danger, High: "#d97706", Medium: brand.blue, Low: brand.muted };

function SLABar({ within, breached, noSla }) {
  const total = within + breached + noSla;
  if (total === 0) return <span style={{ color: brand.muted, fontSize: 12 }}>—</span>;
  const wPct = (within / total) * 100;
  const bPct = (breached / total) * 100;
  const nPct = (noSla / total) * 100;
  return (
    <div style={{ display: "flex", height: 10, borderRadius: "var(--dispatch-radius-sm)", overflow: "hidden", width: 120, background: brand.bg }}>
      {wPct > 0 && <div style={{ width: `${wPct}%`, background: brand.success }} title={`Within SLA: ${within}`} />}
      {bPct > 0 && <div style={{ width: `${bPct}%`, background: brand.danger }} title={`Breached: ${breached}`} />}
      {nPct > 0 && <div style={{ width: `${nPct}%`, background: brand.border }} title={`No SLA: ${noSla}`} />}
    </div>
  );
}

function SLATab() {
  const [filters, setFilters] = useState({ date_from: "", date_to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));

  useEffect(() => {
    setLoading(true);
    getSLAReport(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [filters.date_from, filters.date_to]);

  const pctColor = (pct) => pct >= 90 ? brand.success : pct >= 70 ? brand.amber : brand.danger;

  return (
    <div>
      <DateFilter filters={filters} setFilters={setFilters} csvHref={slaCsvUrl(params)} csvFilename="sla-report.csv" />

      {loading && <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>}

      {!loading && data && (
        data.rows.every(row => row.total === 0)
          ? <div style={{ color: brand.muted, fontSize: 13 }}>No resolved tickets for selected period.</div>
          : (
        <>
          <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", padding: "18px 20px", marginBottom: 24, display: "inline-block" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Overall Compliance</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: pctColor(data.overall_compliance_pct) }}>{data.overall_compliance_pct}%</div>
          </div>

          <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Priority", "Total Resolved", "Within SLA", "Breached", "No SLA Set", "Compliance", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.priority} style={{ background: brand.surface }}>
                    <td style={cellStyle}>
                      <span className="dispatch-pill" style={{ background: SLA_COLORS[row.priority] || brand.muted, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{row.priority}</span>
                    </td>
                    <td style={cellStyle}>{row.total}</td>
                    <td style={{ ...cellStyle, color: brand.success, fontWeight: 600 }}>{row.within_sla}</td>
                    <td style={{ ...cellStyle, color: row.breached > 0 ? brand.danger : brand.muted }}>{row.breached}</td>
                    <td style={{ ...cellStyle, color: brand.muted }}>{row.no_sla_set}</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: pctColor(row.compliance_pct) }}>{row.compliance_pct}%</td>
                    <td style={{ ...cellStyle }}>
                      <SLABar within={row.within_sla} breached={row.breached} noSla={row.no_sla_set} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: brand.muted, display: "flex", gap: 16 }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "var(--dispatch-radius-sm)", background: brand.success, marginRight: 4 }} />Within SLA</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "var(--dispatch-radius-sm)", background: brand.danger, marginRight: 4 }} />Breached</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "var(--dispatch-radius-sm)", background: brand.border, marginRight: 4 }} />No SLA Set</span>
          </div>
        </>
          )
      )}
    </div>
  );
}

// ─── AR aging tab ─────────────────────────────────────────────────────────────

const AGING_COLORS = { "Current": brand.success, "1-30": "#d97706", "31-60": brand.amber, "61-90": "#c0392b", "90+": brand.danger };

function ARAgingTab() {
  const [asOf, setAsOf] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const params = asOf ? { as_of: asOf } : {};

  useEffect(() => {
    setLoading(true);
    getARAgingReport(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [asOf]);

  const maxBucketTotal = data ? Math.max(1, ...data.buckets.map(b => b.total)) : 1;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <FieldLabel>As of</FieldLabel>
          <input type="date" style={inp} value={asOf} onChange={e => setAsOf(e.target.value)} />
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Btn onClick={() => downloadWithAuth(arAgingCsvUrl(params), "ar-aging-report.csv")} variant="secondary" small>↓ Export CSV</Btn>
        </div>
      </div>

      {loading && <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>}

      {!loading && data && (
        <>
          <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", padding: "18px 20px", marginBottom: 24, display: "inline-block" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Total Outstanding</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: data.grand_total_outstanding > 0 ? brand.amber : brand.success }}>${fmt(data.grand_total_outstanding)}</div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 10 }}>By Bucket</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {data.buckets.map(b => (
                <div key={b.label} style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", marginBottom: 6 }}>{b.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: AGING_COLORS[b.label] || brand.text, marginBottom: 8 }}>${fmt(b.total)}</div>
                  <div style={{ fontSize: 11, color: brand.muted, marginBottom: 6 }}>{b.count} invoice{b.count === 1 ? "" : "s"}</div>
                  <div style={{ height: 8, borderRadius: "var(--dispatch-radius-sm)", background: brand.bg, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(b.total / maxBucketTotal) * 100}%`, background: AGING_COLORS[b.label] || brand.muted }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 10 }}>Overdue Invoices</div>
            {data.invoices.length === 0
              ? <div style={{ color: brand.muted, fontSize: 13 }}>No outstanding invoices.</div>
              : (
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Invoice", "Client", "Due Date", "Days Overdue", "Balance", "Bucket"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.invoices.map(row => (
                        <tr key={row.invoice_id} style={{ background: brand.surface }}>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>{row.invoice_id}</td>
                          <td style={cellStyle}>{row.client_name || "—"}</td>
                          <td style={cellStyle}>{row.due_date || "—"}</td>
                          <td style={cellStyle}>{row.days_overdue}</td>
                          <td style={cellStyle}>${fmt(row.balance)}</td>
                          <td style={cellStyle}>
                            <span className="dispatch-pill" style={{ background: AGING_COLORS[row.bucket] || brand.muted, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{row.bucket}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </>
      )}
    </div>
  );
}

// ─── Quote conversion tab ──────────────────────────────────────────────────────

function QuoteConversionBar({ approved, ticketCreated, invoiceConverted }) {
  const max = Math.max(approved, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
      {[
        { label: "Quotes Approved", value: approved, color: brand.blue },
        { label: "Tickets Created", value: ticketCreated, color: brand.amber },
        { label: "Invoices Converted", value: invoiceConverted, color: brand.success },
      ].map(row => (
        <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 130, fontSize: 11, color: brand.muted, textAlign: "right" }}>{row.label}</div>
          <div style={{ flex: 1, height: 14, background: brand.bg, borderRadius: "var(--dispatch-radius-sm)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(row.value / max) * 100}%`, background: row.color, borderRadius: "var(--dispatch-radius-sm)" }} />
          </div>
          <div style={{ width: 28, fontSize: 11, fontWeight: 700, color: brand.text }}>{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function QuoteConversionTab() {
  const [filters, setFilters] = useState({ date_from: "", date_to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));

  useEffect(() => {
    setLoading(true);
    getQuoteConversionReport(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [filters.date_from, filters.date_to]);

  return (
    <div>
      <DateFilter filters={filters} setFilters={setFilters} csvHref={quoteConversionCsvUrl(params)} csvFilename="quote-conversion-report.csv" />

      {loading && <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>}

      {!loading && data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
            {[
              { label: "Quotes Approved", value: data.approved_count, color: brand.blue },
              { label: "Tickets Created", value: data.ticket_created_count, color: brand.amber },
              { label: "Invoices Converted", value: data.invoice_converted_count, color: brand.success },
              { label: "Approval → Invoice Rate", value: `${data.approval_to_invoice_rate}%`, color: brand.success },
            ].map(card => (
              <div key={card.label} style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", padding: "18px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 24, marginBottom: 28, fontSize: 13, color: brand.muted }}>
            <div>Rejected: <strong style={{ color: brand.danger }}>{data.by_status.find(r => r.status === "Rejected")?.count ?? 0}</strong></div>
            <div>Expired: <strong style={{ color: brand.muted }}>{data.by_status.find(r => r.status === "Expired")?.count ?? 0}</strong></div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 10 }}>Funnel</div>
            <QuoteConversionBar approved={data.approved_count} ticketCreated={data.ticket_created_count} invoiceConverted={data.invoice_converted_count} />
          </div>

          <div style={{ marginBottom: 28, display: "flex", gap: 40, fontSize: 13, color: brand.muted }}>
            <div>Avg. Approval → Ticket: <strong style={{ color: brand.text }}>{data.avg_approval_to_ticket_hours != null ? `${data.avg_approval_to_ticket_hours} h` : "—"}</strong></div>
            <div>Avg. Ticket → Invoice: <strong style={{ color: brand.text }}>{data.avg_ticket_to_invoice_hours != null ? `${data.avg_ticket_to_invoice_hours} h` : "—"}</strong></div>
            <div>Approved Value: <strong style={{ color: brand.text }}>${fmt(data.approved_value)}</strong></div>
            <div>Invoiced Value: <strong style={{ color: brand.text }}>${fmt(data.invoiced_value)}</strong></div>
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: brand.text, marginBottom: 10 }}>By Status</div>
            {data.by_status.length === 0
              ? <div style={{ color: brand.muted, fontSize: 13 }}>No data for selected period.</div>
              : (
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Status", "Count", "Total Value"].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.by_status.map(row => (
                        <tr key={row.status} style={{ background: brand.surface }}>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>{row.status}</td>
                          <td style={cellStyle}>{row.count}</td>
                          <td style={cellStyle}>${fmt(row.total_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: "revenue",    label: "Revenue" },
  { id: "technician", label: "Technician" },
  { id: "sla",        label: "SLA Compliance" },
  { id: "ar-aging",   label: "AR Aging" },
  { id: "quote-conversion", label: "Quote Conversion" },
];

export default function ReportsPage({ features }) {
  const [tab, setTab] = useState("revenue");
  const TABS = ALL_TABS
    .filter(t => t.id !== "ar-aging" || features?.ar_aging !== false)
    .filter(t => t.id !== "quote-conversion" || features?.quotes !== false);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Reports</div>
        <div style={{ fontSize: 13, color: brand.muted }}>Revenue, technician performance, and SLA compliance summaries.</div>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `2px solid ${brand.border}`, marginBottom: 28 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "8px 20px", background: "none", border: "none", borderBottom: `3px solid ${tab === t.id ? brand.blue : "transparent"}`, marginBottom: -2, fontWeight: 700, fontSize: 13, color: tab === t.id ? brand.blue : brand.muted, cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "revenue"    && <RevenueTab />}
      {tab === "technician" && <TechnicianTab />}
      {tab === "sla"        && <SLATab />}
      {tab === "ar-aging"   && features?.ar_aging !== false && <ARAgingTab />}
      {tab === "quote-conversion" && features?.quotes !== false && <QuoteConversionTab />}
    </div>
  );
}
