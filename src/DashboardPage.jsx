import { useState, useEffect, useCallback } from "react";
import { getDashboard } from "./api/dashboard.js";

const brand = {
  blue: "#1A5CBA", accent: "#E8A020", bg: "#F4F7FC", surface: "#FFFFFF",
  border: "#D8E2F0", text: "#0D1B2A", muted: "#5B6D82",
  success: "#1a8f4a", danger: "#c0392b", amber: "#d97706",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOR = { Urgent: brand.danger, High: brand.amber, Medium: brand.blue, Low: brand.muted };
const PRIORITY_BG    = { Urgent: "#fee2e2",     High: "#fef3c7",   Medium: "#dbeafe",  Low: "#f3f4f6" };
const STATUS_COLOR   = {
  "Open": brand.blue, "In Progress": brand.amber,
  "Awaiting Client": "#7c3aed", "Resolved": brand.success, "Closed": brand.muted,
};

function slaCountdown(dueIso, createdIso) {
  if (!dueIso) return null;
  const now  = Date.now();
  const due  = new Date(dueIso).getTime();
  const base = createdIso ? new Date(createdIso).getTime() : due - 86400000;
  const left  = due - now;
  const total = due - base;
  if (left <= 0) return { breached: true, label: "Breached", pct: 0, color: brand.danger };
  const pct   = left / total;
  const color = pct > 0.5 ? brand.success : pct > 0.2 ? brand.amber : brand.danger;
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const label = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { breached: false, label, pct, color };
}

function fmtRelative(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color, onClick }) {
  const colors = {
    blue:  { bg: "#dbeafe", text: brand.blue,    border: "#93c5fd" },
    green: { bg: "#d1fae5", text: brand.success,  border: "#6ee7b7" },
    red:   { bg: "#fee2e2", text: brand.danger,   border: "#fca5a5" },
    amber: { bg: "#fef3c7", text: brand.amber,    border: "#fcd34d" },
  }[color] || { bg: "#f3f4f6", text: brand.muted, border: brand.border };

  return (
    <div onClick={onClick}
      style={{ background: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: 12, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4, cursor: onClick ? "pointer" : "default", transition: "filter 0.12s" }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.filter = "brightness(0.95)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
    >
      <div style={{ fontSize: 32, fontWeight: 800, color: colors.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, opacity: 0.8 }}>{label}</div>
      {onClick && <div style={{ fontSize: 10, color: colors.text, opacity: 0.5, marginTop: 2 }}>Click to view →</div>}
    </div>
  );
}

function TicketRow({ ticket, onSelect }) {
  const sla = slaCountdown(ticket.sla_resolution_due, ticket.created_at);
  const pc  = PRIORITY_COLOR[ticket.priority] || brand.muted;
  const pb  = PRIORITY_BG[ticket.priority]    || "#f3f4f6";
  const sc  = STATUS_COLOR[ticket.status]     || brand.muted;

  return (
    <div onClick={() => onSelect(ticket.id)}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: `1px solid ${brand.border}`, cursor: "pointer", transition: "background 0.12s" }}
      onMouseEnter={e => e.currentTarget.style.background = brand.bg}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      {/* Priority dot */}
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: pc, flexShrink: 0 }} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: brand.muted, fontFamily: "monospace" }}>{ticket.id}</span>
          <span style={{ background: pb, color: pc, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{ticket.priority}</span>
          <span style={{ background: "#f0f0f0", color: sc, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{ticket.status}</span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: brand.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ticket.title || "(No title)"}
        </div>
        <div style={{ fontSize: 11, color: brand.muted, marginTop: 1 }}>
          {ticket.client_name || "—"} · {fmtRelative(ticket.created_at)}
        </div>
      </div>

      {/* SLA badge */}
      {sla && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: sla.breached ? "#fee2e2" : "#f8faff", border: `1px solid ${sla.color}44`, borderRadius: 20, padding: "2px 9px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: sla.color }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: sla.color, whiteSpace: "nowrap" }}>
              {sla.breached ? "BREACHED" : sla.label}
            </span>
          </div>
          <div style={{ width: 80, height: 3, background: "#e5e7eb", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, sla.pct * 100))}%`, background: sla.color, borderRadius: 2 }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, accent, children, empty, onViewAll }) {
  return (
    <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${brand.border}`, background: brand.bg, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {accent && <div style={{ width: 4, height: 18, borderRadius: 2, background: accent }} />}
          <div style={{ fontWeight: 700, fontSize: 13, color: brand.text }}>{title}</div>
        </div>
        {onViewAll && (
          <button onClick={onViewAll} style={{ background: "none", border: "none", color: brand.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: "2px 6px" }}>
            View all →
          </button>
        )}
      </div>
      {children || (
        <div style={{ padding: "24px 16px", textAlign: "center", color: brand.muted, fontSize: 13 }}>{empty}</div>
      )}
    </div>
  );
}

// ─── Mini bar chart for priority breakdown ────────────────────────────────────
function PriorityChart({ tickets }) {
  const counts = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
  tickets.forEach(t => { if (counts[t.priority] !== undefined) counts[t.priority]++; });
  const max = Math.max(...Object.values(counts), 1);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 80, padding: "0 4px" }}>
      {Object.entries(counts).map(([p, n]) => (
        <div key={p} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[p] }}>{n}</div>
          <div style={{ width: "100%", background: PRIORITY_BG[p], borderRadius: 4, height: `${Math.max(4, (n / max) * 56)}px`, border: `1px solid ${PRIORITY_COLOR[p]}44` }} />
          <div style={{ fontSize: 10, color: brand.muted, fontWeight: 600 }}>{p.slice(0, 3)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Quote -> Ticket -> Invoice funnel ────────────────────────────────────────
function FunnelWidget({ stages }) {
  const max = Math.max(...stages.map(s => s.count), 1);
  return (
    <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: brand.text, marginBottom: 14 }}>Quote → Ticket → Invoice</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {stages.map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                width: `${Math.max(20, (s.count / max) * 100)}%`,
                minWidth: 60,
                background: brand.bg,
                border: `1.5px solid ${brand.border}`,
                borderRadius: 8,
                padding: "10px 14px",
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: brand.blue, lineHeight: 1 }}>{s.count}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: brand.muted, marginTop: 2, whiteSpace: "nowrap" }}>{s.label}</div>
              </div>
            </div>
            {i < stages.length - 1 && <div style={{ color: brand.muted, fontSize: 18, flexShrink: 0 }}>→</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusChart({ tickets }) {
  const statuses = ["Open", "In Progress", "Awaiting Client", "Resolved", "Closed"];
  const counts = Object.fromEntries(statuses.map(s => [s, 0]));
  tickets.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
  const total = tickets.length || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {statuses.filter(s => counts[s] > 0).map(s => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 80, fontSize: 11, color: brand.muted, textAlign: "right" }}>{s}</div>
          <div style={{ flex: 1, height: 14, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(counts[s] / total) * 100}%`, background: STATUS_COLOR[s] || brand.muted, borderRadius: 3 }} />
          </div>
          <div style={{ width: 24, fontSize: 11, fontWeight: 700, color: brand.text }}>{counts[s]}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const ACTIVE_STATUSES = new Set(["Open", "In Progress", "Awaiting Client"]);

export default function DashboardPage({ user, onSelectTicket, onNavigate, showToast, features }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick,    setTick]    = useState(0);

  const load = useCallback(() => {
    getDashboard()
      .then(setData)
      .catch(() => showToast("Failed to load dashboard.", "err"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh countdown every 60s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", color: brand.muted, fontSize: 14 }}>
      Loading dashboard…
    </div>
  );

  if (!data) return null;

  const { stats, funnel, my_active, sla_urgent, recent_open } = data;
  const allTickets = [...new Map([...my_active, ...sla_urgent, ...recent_open].map(t => [t.id, t])).values()];

  const nav = (label, quick) => onNavigate && onNavigate({ quick: quick ? { label, fn: quick } : null });

  // Map each stat card label to a navigation action
  const statNav = {
    "Total Tickets":      () => nav("All Tickets"),
    "Active":             () => nav("Active", t => ACTIVE_STATUSES.has(t.status)),
    "Resolved / Closed":  () => nav("Resolved / Closed", t => t.status === "Resolved" || t.status === "Closed"),
    "Urgent":             () => nav("Urgent", t => t.priority === "Urgent"),
    "SLA Breached":       () => nav("SLA Breached", t => {
      if (!t.sla_resolution_due) return false;
      return new Date(t.sla_resolution_due).getTime() < Date.now();
    }),
    "SLA Warning (< 2h)": () => nav("SLA Warning", t => {
      if (!t.sla_resolution_due) return false;
      const due = new Date(t.sla_resolution_due).getTime();
      return due > Date.now() && due <= Date.now() + 2 * 3600000;
    }),
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 2 }}>
            Welcome back, {user?.name?.split(" ")[0] || "there"}
          </div>
          <div style={{ fontSize: 13, color: brand.muted }}>
            {new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <button onClick={load} style={{ background: "none", border: `1px solid ${brand.border}`, borderRadius: 6, padding: "6px 14px", fontSize: 12, color: brand.muted, cursor: "pointer", fontFamily: "inherit" }}>
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
        {stats.map(s => <StatCard key={s.label} {...s} onClick={statNav[s.label]} />)}
      </div>

      {/* Quote -> Ticket -> Invoice funnel */}
      {features?.quotes !== false && funnel?.length > 0 && <FunnelWidget stages={funnel} />}

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: brand.text, marginBottom: 14 }}>Active Tickets by Priority</div>
          <PriorityChart tickets={my_active.concat(recent_open)} />
        </div>
        <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: brand.text, marginBottom: 14 }}>Status Breakdown (All)</div>
          <StatusChart tickets={allTickets} />
        </div>
      </div>

      {/* Ticket sections */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* My active tickets */}
        <Section title={`My Active Tickets (${my_active.length})`} accent={brand.blue}
          empty="No active tickets assigned to you."
          onViewAll={() => nav("My Active Tickets", t => ACTIVE_STATUSES.has(t.status))}>
          {my_active.length > 0 && my_active.map(t => <TicketRow key={t.id} ticket={t} onSelect={onSelectTicket} />)}
        </Section>

        {/* SLA at risk */}
        <Section
          title={`SLA at Risk (${sla_urgent.length})`}
          accent={sla_urgent.some(t => {
            const s = slaCountdown(t.sla_resolution_due, t.created_at);
            return s?.breached;
          }) ? brand.danger : brand.amber}
          empty="No tickets with SLA warnings."
          onViewAll={() => nav("SLA Breached", t => {
            if (!t.sla_resolution_due) return false;
            return new Date(t.sla_resolution_due).getTime() < Date.now() + 2 * 3600000;
          })}
        >
          {sla_urgent.length > 0 && sla_urgent.map(t => <TicketRow key={t.id} ticket={t} onSelect={onSelectTicket} />)}
        </Section>
      </div>

      {/* Recent open */}
      <Section title={`Recent Open Tickets (${recent_open.length})`} accent={brand.muted}
        empty="No other open tickets."
        onViewAll={() => nav("Open Tickets", t => t.status === "Open")}>
        {recent_open.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {recent_open.map((t, i) => (
              <div key={t.id} style={{ borderRight: i % 2 === 0 ? `1px solid ${brand.border}` : "none" }}>
                <TicketRow ticket={t} onSelect={onSelectTicket} />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
