import { useState, useEffect } from "react";
import { getRevenueReport, getTechnicianReport, getSLAReport, revenueCsvUrl, technicianCsvUrl, slaCsvUrl } from "./api/reports.js";

const brand = {
  blue: "#1A5CBA",
  accent: "#E8A020",
  bg: "#F4F7FC",
  surface: "#FFFFFF",
  border: "#D8E2F0",
  text: "#0D1B2A",
  muted: "#5B6D82",
  success: "#1a8f4a",
  danger: "#c0392b",
  amber: "#b45309",
};

const inp = {
  padding: "7px 11px",
  border: `1px solid ${brand.border}`,
  borderRadius: 6,
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
    primary:   { background: brand.blue,   color: "#fff",       border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    accent:    { background: brand.accent,  color: "#fff",       border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant] || {};

  const style = {
    ...s,
    padding: small ? "5px 12px" : "8px 18px",
    borderRadius: 6,
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

function DateFilter({ filters, setFilters, csvHref }) {
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
        <Btn href={csvHref} variant="secondary" small>↓ Export CSV</Btn>
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
      <DateFilter filters={filters} setFilters={setFilters} csvHref={revenueCsvUrl(params)} />

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
              <div key={card.label} style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px" }}>
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
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden" }}>
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
                <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden" }}>
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
      <DateFilter filters={filters} setFilters={setFilters} csvHref={technicianCsvUrl(params)} />

      {loading && <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>}

      {!loading && data && (
        data.rows.length === 0
          ? <div style={{ color: brand.muted, fontSize: 13 }}>No resolved tickets for selected period.</div>
          : (
            <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden" }}>
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
    <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", width: 120, background: brand.bg }}>
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
      <DateFilter filters={filters} setFilters={setFilters} csvHref={slaCsvUrl(params)} />

      {loading && <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>}

      {!loading && data && (
        <>
          <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 24, display: "inline-block" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Overall Compliance</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: pctColor(data.overall_compliance_pct) }}>{data.overall_compliance_pct}%</div>
          </div>

          <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Priority", "Total Resolved", "Within SLA", "Breached", "No SLA Set", "Compliance", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.priority} style={{ background: brand.surface }}>
                    <td style={cellStyle}>
                      <span style={{ background: SLA_COLORS[row.priority] || brand.muted, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{row.priority}</span>
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
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: brand.success, marginRight: 4 }} />Within SLA</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: brand.danger, marginRight: 4 }} />Breached</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: brand.border, marginRight: 4 }} />No SLA Set</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "revenue",    label: "Revenue" },
  { id: "technician", label: "Technician" },
  { id: "sla",        label: "SLA Compliance" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState("revenue");

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
    </div>
  );
}
