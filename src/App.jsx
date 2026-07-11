import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useParams, Navigate } from "react-router-dom";
import { fmt, esc, calcServiceTotal, calcHourTotal, calcMaterialsTotal } from "./helpers.js";
import { setTokens, clearTokens, registerLogoutHandler, hasStoredSession, downloadWithAuth } from "./api/client.js";
import { me, logout as apiLogout } from "./api/auth.js";
import { listTickets, getTicket, createTicket, updateTicket, deleteTicket } from "./api/tickets.js";
import { listQuotes, convertQuoteToInvoice } from "./api/quotes.js";
import { listComments, addComment, deleteComment } from "./api/comments.js";
import { listCannedResponses } from "./api/cannedResponses.js";
import { listTicketAudit } from "./api/audit.js";
import { getFeatureConfig } from "./api/config.js";
import { startTimer, stopTimer, getActiveTimer } from "./api/timer.js";
import { listTemplates, createTemplate, deleteTemplate } from "./api/templates.js";
import { listAttachments, uploadAttachment, deleteAttachment, downloadUrl } from "./api/attachments.js";
import { listRecurring, createRecurring, updateRecurring, deleteRecurring } from "./api/recurring.js";
import { listUsers } from "./api/users.js";
import { listClients, createClient, updateClient, deleteClient } from "./api/clients.js";
import { listDocuments, downloadUrl as docDownloadUrl } from "./api/documents.js";
import { listTicketDocuments, attachDocument, updateTicketDocument, detachDocument } from "./api/ticketDocuments.js";
import { listMaterials } from "./api/materials.js";
import { SERVICES } from "./services.js";
import FormsSection from "./FormsSection.jsx";
import LoginPage from "./LoginPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import DocumentsPage from "./DocumentsPage.jsx";
import ReportsPage from "./ReportsPage.jsx";
import PortalPage from "./PortalPage.jsx";
import ClientsPage from "./ClientsPage.jsx";
import SetupPage from "./SetupPage.jsx";
import { getSetupStatus } from "./api/setup.js";
import AppNew from "./AppNew.jsx";
import { BrandingProvider } from "./branding.jsx";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const brand = {
  blue: "#1A5CBA",
  blueDark: "#143f80",
  accent: "#E8A020",
  accentLight: "#f5c05a",
  bg: "#F4F7FC",
  surface: "#FFFFFF",
  border: "#D8E2F0",
  text: "var(--dispatch-text)",
  muted: "var(--dispatch-muted)",
  success: "#1a8f4a",
  danger: "#c0392b",
};

const TRAVEL_FEES = [
  { id: "travel_none", label: "None (remote only)", fee: 0 },
  { id: "travel_15",   label: "Within 15 km",       fee: 40 },
  { id: "travel_30",   label: "15–30 km",            fee: 60 },
  { id: "travel_30p",  label: "30+ km",              fee: 80 },
];

const STATUS_OPTIONS      = ["Open", "In Progress", "Awaiting Client", "On Hold", "Resolved", "Closed"];
const PRIORITY_OPTIONS    = ["Low", "Medium", "High", "Urgent"];
const TICKET_TYPE_OPTIONS = ["Incident", "Request", "Change Request"];

// SLA response/resolution hours per priority
const SLA_HOURS = { Urgent: [1, 4], High: [4, 8], Medium: [8, 24], Low: [24, 72] };

function slaStatus(dueIso, createdIso, priority) {
  if (!dueIso) return null;
  const now  = Date.now();
  const due  = new Date(dueIso).getTime();
  const base = new Date(createdIso || dueIso).getTime();
  const total = due - base;
  const left  = due - now;
  if (left <= 0) return { breached: true, label: "Breached", pct: 0, color: "#c0392b" };
  const pct = left / total;
  const color = pct > 0.5 ? "#1a8f4a" : pct > 0.2 ? "#d97706" : "#c0392b";
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const label = h >= 24 ? `${Math.floor(h/24)}d ${h%24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { breached: false, label, pct, color };
}

// ─── API shape ↔ editor shape mappers ────────────────────────────────────────
const apiToEditor = (t) => ({
  id:                t.id,
  createdAt:         t.created_at?.split("T")[0] ?? "",
  createdAtIso:      t.created_at ?? null,
  slaResponseDue:    t.sla_response_due ?? null,
  slaResolutionDue:  t.sla_resolution_due ?? null,
  slaPausedAt:       t.sla_paused_at ?? null,
  clientId:          t.client_id ?? null,
  assignedTo:        t.assigned_to ?? null,
  ticketType:    t.ticket_type,
  clientType:    t.client_type,
  status:        t.status,
  priority:      t.priority,
  clientName:    t.client_name,
  clientEmail:   t.client_email,
  clientPhone:   t.client_phone,
  clientAddress: t.client_address,
  title:         t.title,
  description:   t.description,
  internalNotes: t.internal_notes,
  travelFee:     t.travel_fee,
  billingStatus: t.billing_status ?? "unbilled",
  services: (t.service_lines ?? []).map((sl) => ({
    _id:          sl.id,
    serviceId:    sl.service_id,
    name:         sl.name,
    type:         sl.type,
    rate:         Number(sl.rate),
    base:         Number(sl.base),
    perUnit:      Number(sl.per_unit),
    perUnitLabel: sl.per_unit_label,
    unitLabel:    sl.unit_label,
    qty:          sl.qty,
    extraQty:     sl.extra_qty,
  })),
  hourLogs: (t.hour_logs ?? []).map((hl) => ({
    _id:         hl.id,
    date:        hl.date,
    hours:       String(hl.hours),
    rate:        Number(hl.rate),
    description: hl.description,
    startedAt:   hl.started_at ?? null,
    endedAt:     hl.ended_at ?? null,
    isRunning:   !!hl.is_running,
  })),
  materialsUsed: (t.materials_used ?? []).map((tm) => ({
    _id:        tm.id,
    materialId: tm.material_id,
    name:       tm.name,
    unitPrice:  Number(tm.unit_price),
    qty:        tm.qty,
  })),
});

const editorToApi = (t) => ({
  client_id:     t.clientId ?? null,
  assigned_to:   t.assignedTo ?? null,
  ticket_type:   t.ticketType,
  status:        t.status,
  priority:      t.priority,
  client_type:   t.clientType,
  client_name:   t.clientName,
  client_email:  t.clientEmail,
  client_phone:  t.clientPhone,
  client_address:t.clientAddress,
  title:         t.title,
  description:   t.description,
  internal_notes:t.internalNotes,
  travel_fee:    t.travelFee,
  service_lines: t.services.filter((s) => s.serviceId).map((s) => ({
    service_id:    s.serviceId,
    name:          s.name,
    type:          s.type,
    rate:          s.rate ?? 0,
    base:          s.base ?? 0,
    per_unit:      s.perUnit ?? 0,
    per_unit_label:s.perUnitLabel ?? "",
    unit_label:    s.unitLabel ?? "unit",
    qty:           s.qty ?? 1,
    extra_qty:     s.extraQty ?? 0,
  })),
  // Timer-originated rows (startedAt set) are owned by the timer endpoints, not
  // the ticket editor — they must be excluded here or they'd be wiped by the
  // server's delete/recreate of manual hour logs on every save.
  hour_logs: t.hourLogs.filter((h) => h.hours && !h.startedAt).map((h) => ({
    date:        h.date,
    hours:       parseFloat(h.hours) || 0,
    rate:        parseFloat(h.rate) || 0,
    description: h.description,
  })),
  materials_used: t.materialsUsed.filter((m) => m.name).map((m) => ({
    material_id: m.materialId ?? null,
    name:        m.name,
    unit_price:  m.unitPrice ?? 0,
    qty:         m.qty ?? 1,
  })),
});

// ─── PDF / Print ──────────────────────────────────────────────────────────────
const printTicket = (ticket) => {
  const travel   = TRAVEL_FEES.find((t) => t.id === ticket.travelFee);
  const travelFee = travel?.fee || 0;
  const svcTotal  = ticket.services.reduce((s, sv) => s + calcServiceTotal(sv), 0);
  const hourTotal = calcHourTotal(ticket.hourLogs);
  const materialsTotal = calcMaterialsTotal(ticket.materialsUsed);
  const grand     = svcTotal + hourTotal + materialsTotal + travelFee;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Ticket ${ticket.id}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#0D1B2A;padding:32px;background:#fff}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1A5CBA;padding-bottom:16px;margin-bottom:20px}
.logo{font-size:22px;font-weight:800;color:#1A5CBA;letter-spacing:-0.5px}
.logo span{color:#E8A020}
.meta{text-align:right;color:#5B6D82;font-size:11px}
.meta strong{color:#0D1B2A;font-size:15px;display:block;margin-bottom:4px}
.badges{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
.badge{padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
.b-blue{background:#1A5CBA;color:#fff}.b-amber{background:#E8A020;color:#fff}
.b-green{background:#1a8f4a;color:#fff}.b-gray{background:#e2e8f0;color:#5B6D82}
.b-red{background:#c0392b;color:#fff}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
.card{background:#F4F7FC;border:1px solid #D8E2F0;border-radius:6px;padding:14px}
.card h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#1A5CBA;letter-spacing:0.5px;margin-bottom:10px}
.card p{margin-bottom:5px;line-height:1.5}
.label{color:#5B6D82;font-size:10px;display:block}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#1A5CBA;color:#fff;text-align:left;padding:8px 10px;font-size:11px}
td{padding:7px 10px;border-bottom:1px solid #D8E2F0;font-size:11px}
tr:nth-child(even) td{background:#F4F7FC}
.right{text-align:right}
.totals-wrap{display:flex;justify-content:flex-end;margin-bottom:20px}
.totals{width:280px;border-collapse:collapse}
.totals td{padding:6px 10px;font-size:12px;border-bottom:1px solid #D8E2F0}
.totals .lbl{color:#5B6D82}.totals .val{text-align:right;font-weight:600}
.grand td{font-size:15px;font-weight:800;color:#1A5CBA;border-top:2px solid #1A5CBA!important}
.notes-box{background:#fffbf0;border:1px solid #E8A020;border-radius:6px;padding:14px;margin-bottom:20px}
.notes-box h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#E8A020;letter-spacing:0.5px;margin-bottom:8px}
.footer{text-align:center;color:#5B6D82;font-size:10px;border-top:1px solid #D8E2F0;padding-top:14px;margin-top:20px}
@media print{body{padding:16px}}
</style></head><body>
<div class="header">
  <div>
    <div class="logo">ATech<span>Solutions</span></div>
    <div style="color:#5B6D82;font-size:11px;margin-top:4px">atechsolutions.org &nbsp;|&nbsp; (514) 826-5351 &nbsp;|&nbsp; info@atechsolutions.org</div>
  </div>
  <div class="meta">
    <strong>${esc(ticket.id)}</strong>
    Date: ${esc(ticket.createdAt)}<br/>
    Type: ${ticket.clientType === "business" ? "Business" : "Residential"}
    <div class="badges">
      <span class="badge ${ticket.status === "Resolved" || ticket.status === "Closed" ? "b-green" : ticket.status === "In Progress" ? "b-amber" : "b-blue"}">${esc(ticket.status)}</span>
      <span class="badge ${ticket.priority === "Urgent" ? "b-red" : ticket.priority === "High" ? "b-amber" : "b-gray"}">${esc(ticket.priority)}</span>
    </div>
  </div>
</div>
<div class="grid2">
  <div class="card">
    <h3>Client Information</h3>
    <p><span class="label">Name</span>${esc(ticket.clientName) || "—"}</p>
    <p><span class="label">Email</span>${esc(ticket.clientEmail) || "—"}</p>
    <p><span class="label">Phone</span>${esc(ticket.clientPhone) || "—"}</p>
    ${ticket.clientAddress ? `<p><span class="label">Address</span>${esc(ticket.clientAddress)}</p>` : ""}
  </div>
  <div class="card">
    <h3>Issue Details</h3>
    <p><span class="label">Title</span>${esc(ticket.title) || "—"}</p>
    <p style="margin-top:8px"><span class="label">Description</span>${esc(ticket.description || "—").replace(/\n/g, "<br/>")}</p>
  </div>
</div>
${ticket.services.length > 0 ? `
<table>
  <thead><tr><th>Service</th><th>Details</th><th class="right">Subtotal</th></tr></thead>
  <tbody>
    ${ticket.services.map((sv) => {
      let detail = "";
      if (sv.type === "per_unit") detail = `${sv.qty || 1} ${esc(sv.unitLabel) || "unit"}(s) × ${fmt(sv.rate)}`;
      if (sv.type === "flat") {
        detail = `Base: ${fmt(sv.base)}`;
        if (sv.extraQty) detail += ` + ${sv.extraQty} × ${fmt(sv.perUnit)} (${esc(sv.perUnitLabel)})`;
      }
      if (sv.type === "hourly") detail = "See hours log";
      return `<tr><td>${esc(sv.name) || "—"}</td><td>${detail}</td><td class="right">${sv.type === "hourly" ? "—" : fmt(calcServiceTotal(sv))}</td></tr>`;
    }).join("")}
  </tbody>
</table>` : ""}
${ticket.hourLogs.length > 0 ? `
<table>
  <thead><tr><th>Date</th><th>Hours</th><th>Rate</th><th>Description</th><th class="right">Subtotal</th></tr></thead>
  <tbody>
    ${ticket.hourLogs.map((l) => `<tr>
      <td>${esc(l.date) || "—"}</td><td>${esc(l.hours) || 0} hr(s)</td>
      <td>${fmt(l.rate)}/hr</td><td>${esc(l.description) || "—"}</td>
      <td class="right">${fmt((parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0))}</td>
    </tr>`).join("")}
  </tbody>
</table>` : ""}
${ticket.materialsUsed.length > 0 ? `
<table>
  <thead><tr><th>Material</th><th>Qty</th><th>Unit Price</th><th class="right">Subtotal</th></tr></thead>
  <tbody>
    ${ticket.materialsUsed.map((m) => `<tr>
      <td>${esc(m.name) || "—"}</td><td>${esc(m.qty) || 1}</td>
      <td>${fmt(m.unitPrice)}</td>
      <td class="right">${fmt((parseFloat(m.qty) || 0) * (parseFloat(m.unitPrice) || 0))}</td>
    </tr>`).join("")}
  </tbody>
</table>` : ""}
<div class="totals-wrap">
  <table class="totals"><tbody>
    ${svcTotal > 0 ? `<tr><td class="lbl">Services Subtotal</td><td class="val">${fmt(svcTotal)}</td></tr>` : ""}
    ${hourTotal > 0 ? `<tr><td class="lbl">Labour Subtotal</td><td class="val">${fmt(hourTotal)}</td></tr>` : ""}
    ${materialsTotal > 0 ? `<tr><td class="lbl">Materials Subtotal</td><td class="val">${fmt(materialsTotal)}</td></tr>` : ""}
    ${travelFee > 0 ? `<tr><td class="lbl">Travel Fee (${esc(travel.label)})</td><td class="val">${fmt(travelFee)}</td></tr>` : ""}
    <tr class="grand"><td><strong>Total</strong></td><td class="val"><strong>${fmt(grand)}</strong></td></tr>
  </tbody></table>
</div>
${ticket.internalNotes ? `<div class="notes-box"><h3>Notes</h3><p>${esc(ticket.internalNotes).replace(/\n/g, "<br/>")}</p></div>` : ""}
<div class="footer">
  ATechSolutions &nbsp;|&nbsp; amartins@atechsolutions.org &nbsp;|&nbsp; (514) 826-5351 &nbsp;|&nbsp; atechsolutions.org<br/>
  Sainte-Marthe-sur-le-Lac, QC &nbsp;|&nbsp; Serving the North Shore &amp; Laurentians
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
};

// ─── UI primitives ────────────────────────────────────────────────────────────
const Badge = ({ children, color }) => {
  const c = { blue: [brand.blue,"#fff"], amber: [brand.accent,"#fff"], green: [brand.success,"#fff"], gray: ["#e2e8f0",brand.muted], red: [brand.danger,"#fff"] }[color] || ["#e2e8f0",brand.muted];
  return <span style={{ background:c[0], color:c[1], borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.4px" }}>{children}</span>;
};

const SectionHeader = ({ children }) => (
  <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", color:brand.blue, borderBottom:`2px solid ${brand.border}`, paddingBottom:8, marginBottom:14, marginTop:22 }}>
    {children}
  </div>
);

const inp = { width:"100%", padding:"9px 12px", border:`1px solid ${brand.border}`, borderRadius:6, fontSize:13, color:brand.text, background:"#fff", outline:"none", fontFamily:"inherit" };

const Input = ({ value, onChange, placeholder, type="text" }) => (
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={inp} />
);

const Select = ({ value, onChange, options }) => (
  <select value={value} onChange={e=>onChange(e.target.value)} style={inp}>
    {options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
  </select>
);

const Textarea = ({ value, onChange, placeholder, rows=3 }) => (
  <textarea rows={rows} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{...inp, resize:"vertical"}} />
);

const Btn = ({ onClick, children, variant="primary", small, disabled }) => {
  const s = {
    primary:   { background:brand.blue,   color:"var(--dispatch-on-color)", border:"none" },
    secondary: { background:"#fff",        color:brand.blue,  border:`1.5px solid ${brand.blue}` },
    danger:    { background:"#fff",        color:brand.danger, border:`1.5px solid ${brand.danger}` },
    accent:    { background:brand.accent,  color:"var(--dispatch-on-color)", border:"none" },
    ghost:     { background:"transparent", color:brand.muted, border:`1px solid ${brand.border}` },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{...s, padding:small?"6px 12px":"9px 18px", borderRadius:6, fontSize:small?12:13, fontWeight:600, cursor:disabled?"not-allowed":"pointer", fontFamily:"inherit", opacity:disabled?0.6:1}}>
      {children}
    </button>
  );
};

const FieldLabel = ({ children }) => (
  <div style={{ fontSize:11, fontWeight:700, color:brand.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:5 }}>{children}</div>
);

const shimmerCSS = `
@keyframes _shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}
._sk {
  background: linear-gradient(90deg, #e8edf4 25%, #f4f7fc 50%, #e8edf4 75%);
  background-size: 600px 100%;
  animation: _shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}`;

function ShimmerStyle() {
  return <style>{shimmerCSS}</style>;
}

function Sk({ w = "100%", h = 14, mb = 0, br = 6 }) {
  return <div className="_sk" style={{ width: w, height: h, marginBottom: mb, borderRadius: br }} />;
}

function TicketListSkeleton() {
  return (
    <>
      <ShimmerStyle />
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 10, borderLeft: `4px solid ${brand.border}` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Sk w={80} h={12} />
            <Sk w={60} h={12} />
            <Sk w={60} h={12} />
            <Sk w={70} h={12} />
          </div>
          <Sk w="55%" h={15} mb={8} />
          <Sk w="35%" h={11} />
        </div>
      ))}
    </>
  );
}

function TicketEditorSkeleton() {
  return (
    <div style={{ padding: 40 }}>
      <ShimmerStyle />
      <Sk w={160} h={13} mb={24} />
      <Sk w="60%" h={28} mb={12} />
      <Sk w="40%" h={13} mb={32} />
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <Sk w={100} h={11} mb={6} />
          <Sk w="100%" h={38} />
        </div>
      ))}
    </div>
  );
}

const Spinner = () => (
  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:"60px 20px", color:brand.muted, fontSize:14 }}>
    Loading…
  </div>
);

const Toast = ({ msg, type, onClose }) => {
  const bg = type === "err" ? brand.danger : type === "warn" ? brand.accent : brand.success;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, background:bg, color:"#fff", borderRadius:8, padding:"12px 18px", fontSize:13, fontWeight:600, zIndex:9999, maxWidth:340, display:"flex", gap:12, alignItems:"center", boxShadow:"0 4px 20px rgba(0,0,0,0.15)" }}>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
    </div>
  );
};

// ─── Service row ──────────────────────────────────────────────────────────────
const ServiceRow = ({ svc, catalogue, open, onOpenChange, onChange, onRemove }) => {
  const def = catalogue.find(c => c.id === svc.serviceId);
  const handleChange = (id) => {
    const d = catalogue.find(c => c.id === id);
    if (!d) return onChange({ ...svc, serviceId:"", name:"", type:"" });
    onChange({ ...svc, serviceId:id, name:d.name, type:d.type, rate:d.rate||0, base:d.base||0, perUnit:d.perUnit||0, perUnitLabel:d.perUnitLabel||"", unitLabel:d.unitLabel||"unit", qty:1, extraQty:0 });
  };
  const pick = (d) => {
    handleChange(d.id);
    onOpenChange(false);
  };
  const matches = svc.name && !svc.serviceId
    ? catalogue.filter(c => c.name.toLowerCase().includes(svc.name.trim().toLowerCase()))
    : [];
  const cellStyle = { padding:"8px 10px", border:`1px solid ${brand.border}`, borderRadius:6, fontSize:12, color:brand.text, background:"#fff", width:"100%" };
  return (
    <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
      <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
        <div style={{ flex:2, position:"relative" }}>
          <FieldLabel>Service</FieldLabel>
          <input
            type="text"
            value={svc.name||""}
            onChange={e => onChange({ ...svc, serviceId:"", name:e.target.value, type:"" })}
            onFocus={() => onOpenChange(true)}
            onBlur={() => setTimeout(() => onOpenChange(false), 150)}
            placeholder="Search services…"
            style={cellStyle}
          />
          {open && svc.name?.trim() && !svc.serviceId && (
            <div style={{ border:`1px solid ${brand.border}`, borderRadius:6, marginTop:4, maxHeight:180, overflowY:"auto", background:"#fff", boxShadow:"0 4px 12px rgba(0,0,0,0.10)", zIndex:10, position:"absolute", left:0, right:0 }}>
              {matches.length === 0 ? (
                <div style={{ padding:"9px 12px", fontSize:13, color:brand.muted }}>No matches</div>
              ) : (
                matches.map(c => (
                  <div key={c.id}
                    onMouseDown={e => { e.preventDefault(); pick(c); }}
                    style={{ padding:"9px 12px", fontSize:13, cursor:"pointer", borderBottom:`1px solid ${brand.border}`, display:"flex", justifyContent:"space-between", gap:10 }}>
                    <span style={{ fontWeight:600 }}>{c.name}</span>
                    <span style={{ color:brand.muted }}>{c.type === "hourly" ? `${fmt(c.rate)}/hr` : fmt(c.type === "flat" ? c.base : c.rate)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        {def?.type === "per_unit" && (
          <div style={{ width:110 }}>
            <FieldLabel>Qty ({def.unitLabel})</FieldLabel>
            <input type="number" min={1} value={svc.qty||1} onChange={e=>onChange({...svc,qty:parseInt(e.target.value)||1})} style={cellStyle} />
          </div>
        )}
        {def?.type === "flat" && def.perUnit > 0 && (
          <div style={{ width:160 }}>
            <FieldLabel>{def.perUnitLabel}</FieldLabel>
            <input type="number" min={0} value={svc.extraQty||0} onChange={e=>onChange({...svc,extraQty:parseInt(e.target.value)||0})} style={cellStyle} />
          </div>
        )}
        {def?.type === "hourly" && (
          <div style={{ width:160, paddingTop:22, fontSize:11, color:brand.muted }}>Billed via hours log ↓</div>
        )}
        <div style={{ width:90, textAlign:"right" }}>
          <FieldLabel>Subtotal</FieldLabel>
          <div style={{ paddingTop:10, fontWeight:700, fontSize:14, color:def?.type==="hourly"?brand.muted:brand.blue }}>
            {!svc.serviceId ? "—" : def?.type==="hourly" ? "—" : fmt(calcServiceTotal(svc))}
          </div>
        </div>
        <div style={{ paddingTop:20 }}>
          <button onClick={onRemove} style={{ background:"none", border:"none", color:brand.danger, cursor:"pointer", fontSize:20, lineHeight:1, padding:"2px 6px" }}>×</button>
        </div>
      </div>
    </div>
  );
};

// ─── Hour log row ─────────────────────────────────────────────────────────────
const HourRow = ({ log, defaultRate, onChange, onRemove }) => {
  const cellStyle = { padding:"7px 8px", border:`1px solid ${brand.border}`, borderRadius:6, fontSize:12, color:brand.text, background:"#fff", width:"100%" };
  const sub = (parseFloat(log.hours)||0) * (parseFloat(log.rate)||defaultRate);
  return (
    <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
      <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
        <div style={{ width:130 }}>
          <FieldLabel>Date</FieldLabel>
          <input type="date" value={log.date||""} onChange={e=>onChange({...log,date:e.target.value})} style={cellStyle} />
        </div>
        <div style={{ width:90 }}>
          <FieldLabel>Hours</FieldLabel>
          <input type="number" step="0.25" min="0" value={log.hours||""} onChange={e=>onChange({...log,hours:e.target.value})} placeholder="0" style={cellStyle} />
        </div>
        <div style={{ width:110 }}>
          <FieldLabel>Rate ($/hr)</FieldLabel>
          <input type="number" value={log.rate!==undefined?log.rate:defaultRate} onChange={e=>onChange({...log,rate:parseFloat(e.target.value)||defaultRate})} style={cellStyle} />
        </div>
        <div style={{ flex:1 }}>
          <FieldLabel>Description</FieldLabel>
          <input type="text" value={log.description||""} placeholder="What was done…" onChange={e=>onChange({...log,description:e.target.value})} style={cellStyle} />
        </div>
        <div style={{ width:90, textAlign:"right" }}>
          <FieldLabel>Subtotal</FieldLabel>
          <div style={{ paddingTop:10, fontWeight:700, fontSize:14, color:brand.blue }}>{log.hours ? fmt(sub) : "—"}</div>
        </div>
        <div style={{ paddingTop:20 }}>
          <button onClick={onRemove} style={{ background:"none", border:"none", color:brand.danger, cursor:"pointer", fontSize:20, lineHeight:1, padding:"2px 6px" }}>×</button>
        </div>
      </div>
    </div>
  );
};

// ─── Material used row ─────────────────────────────────────────────────────────
const MaterialUsedRow = ({ item, materials, open, onOpenChange, onChange, onRemove }) => {
  const cellStyle = { padding:"7px 8px", border:`1px solid ${brand.border}`, borderRadius:6, fontSize:12, color:brand.text, background:"#fff", width:"100%" };
  const sub = (parseFloat(item.qty)||0) * (parseFloat(item.unitPrice)||0);
  const matches = item.name.trim()
    ? materials.filter(m => m.name.toLowerCase().includes(item.name.trim().toLowerCase()))
    : [];

  const pick = (m) => {
    onChange({ ...item, materialId: m.id, name: m.name, unitPrice: Number(m.unit_price) || 0 });
    onOpenChange(false);
  };

  return (
    <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
      <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
        <div style={{ flex:1, position:"relative" }}>
          <FieldLabel>Material</FieldLabel>
          <input
            type="text"
            value={item.name||""}
            onChange={e=>onChange({...item, materialId:null, name:e.target.value})}
            onFocus={() => onOpenChange(true)}
            onBlur={() => setTimeout(() => onOpenChange(false), 150)}
            placeholder="Search materials or type a name…"
            style={cellStyle}
          />
          {open && item.name.trim() && (
            <div style={{ border:`1px solid ${brand.border}`, borderRadius:6, marginTop:4, maxHeight:180, overflowY:"auto", background:"#fff", boxShadow:"0 4px 12px rgba(0,0,0,0.10)", zIndex:10, position:"absolute", left:0, right:0 }}>
              {matches.length === 0 ? (
                <div style={{ padding:"9px 12px", fontSize:13, color:brand.muted }}>No matches</div>
              ) : (
                matches.map(m => (
                  <div key={m.id}
                    onMouseDown={e => { e.preventDefault(); pick(m); }}
                    style={{ padding:"9px 12px", fontSize:13, cursor:"pointer", borderBottom:`1px solid ${brand.border}`, display:"flex", justifyContent:"space-between", gap:10 }}>
                    <span style={{ fontWeight:600 }}>{m.name}</span>
                    <span style={{ color:brand.muted }}>{fmt(m.unit_price)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div style={{ width:80 }}>
          <FieldLabel>Qty</FieldLabel>
          <input type="number" min="1" step="1" value={item.qty||""} onChange={e=>onChange({...item, qty:e.target.value})} style={cellStyle} />
        </div>
        <div style={{ width:110 }}>
          <FieldLabel>Unit Price</FieldLabel>
          <input type="number" min="0" step="0.01" value={item.unitPrice!==undefined?item.unitPrice:0} onChange={e=>onChange({...item, unitPrice:parseFloat(e.target.value)||0})} style={cellStyle} />
        </div>
        <div style={{ width:90, textAlign:"right" }}>
          <FieldLabel>Subtotal</FieldLabel>
          <div style={{ paddingTop:10, fontWeight:700, fontSize:14, color:brand.blue }}>{item.qty ? fmt(sub) : "—"}</div>
        </div>
        <div style={{ paddingTop:20 }}>
          <button onClick={onRemove} style={{ background:"none", border:"none", color:brand.danger, cursor:"pointer", fontSize:20, lineHeight:1, padding:"2px 6px" }}>×</button>
        </div>
      </div>
    </div>
  );
};

// ─── Timer-derived hour log row (read-only) ───────────────────────────────────
const TimerHourRow = ({ log }) => {
  const sub = (parseFloat(log.hours)||0) * (parseFloat(log.rate)||0);
  return (
    <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <div style={{ width:130 }}>
          <FieldLabel>Date</FieldLabel>
          <div style={{ fontSize:12, color:brand.text }}>{log.date}</div>
        </div>
        <div style={{ width:90 }}>
          <FieldLabel>Hours</FieldLabel>
          <div style={{ fontSize:12, color:brand.text }}>{log.hours}</div>
        </div>
        <div style={{ width:110 }}>
          <FieldLabel>Rate ($/hr)</FieldLabel>
          <div style={{ fontSize:12, color:brand.text }}>{log.rate}</div>
        </div>
        <div style={{ flex:1 }}>
          <FieldLabel>Description</FieldLabel>
          <div style={{ fontSize:12, color:brand.text }}>{log.description || "—"}</div>
        </div>
        <div style={{ width:90, textAlign:"right" }}>
          <FieldLabel>Subtotal</FieldLabel>
          <div style={{ fontWeight:700, fontSize:14, color:brand.blue }}>{fmt(sub)}</div>
        </div>
        <div style={{ width:60, textAlign:"right" }}>
          <span style={{ fontSize:10, fontWeight:700, color:brand.muted, textTransform:"uppercase" }}>⏱ Timer</span>
        </div>
      </div>
    </div>
  );
};

// ─── Start/stop timer control ──────────────────────────────────────────────────
const TimerControl = ({ ticketId, onStopped }) => {
  const [active, setActive]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    getActiveTimer(ticketId).then(setActive).catch(() => {});
  }, [ticketId]);

  useEffect(() => {
    if (!active) return;
    const tick = () => setElapsed((Date.now() - new Date(active.started_at).getTime()) / 1000);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const log = await startTimer(ticketId, {});
      setActive(log);
    } catch (err) {
      if (err?.response?.status === 409) {
        const current = await getActiveTimer(ticketId).catch(() => null);
        setActive(current);
      }
    } finally { setLoading(false); }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const log = await stopTimer(ticketId);
      setActive(null);
      onStopped?.(log);
    } finally { setLoading(false); }
  };

  const fmtElapsed = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return [h, m, sec].map(n => String(n).padStart(2, "0")).join(":");
  };

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
      {active ? (
        <>
          <span style={{ fontFamily:"monospace", fontSize:16, fontWeight:700, color:brand.blue }}>{fmtElapsed(elapsed)}</span>
          <Btn onClick={handleStop} variant="danger" small disabled={loading}>■ Stop Timer</Btn>
        </>
      ) : (
        <Btn onClick={handleStart} variant="secondary" small disabled={loading}>▶ Start Timer</Btn>
      )}
    </div>
  );
};

// ─── New ticket modal ─────────────────────────────────────────────────────────
const NewTicketModal = ({ onCreate, onCancel, clients, templates }) => {
  const [ticketType, setTicketType] = useState("Incident");
  const [title,      setTitle]      = useState("");
  const [priority,   setPriority]   = useState("Medium");
  const [companyId,  setCompanyId]  = useState(null);
  const [contactId,  setContactId]  = useState(null);
  const [saving,     setSaving]     = useState(false);

  const typeIcons = { Incident:"🔥", Request:"📋", "Change Request":"🔄" };

  const applyTemplate = (tpl) => {
    setTicketType(tpl.ticket_type);
    setPriority(tpl.priority);
    setTitle(tpl.title);
  };

  // Same grouping logic as ticket editor
  const { pickableClients, companyMembers } = (() => {
    const businessGroups = {};
    const residential = [];
    for (const c of clients) {
      if (c.client_type === "business" && c.company) {
        const key = c.company.toLowerCase();
        if (!businessGroups[key]) businessGroups[key] = { primary: null, members: [] };
        if (!businessGroups[key].primary || c.id < businessGroups[key].primary.id)
          businessGroups[key].primary = c;
        businessGroups[key].members.push(c);
      } else {
        residential.push(c);
      }
    }
    const primaries = Object.values(businessGroups).map(g => g.primary);
    const membersByPrimaryId = {};
    for (const g of Object.values(businessGroups)) {
      membersByPrimaryId[g.primary.id] = g.members.filter(m => m.id !== g.primary.id);
    }
    return { pickableClients: [...primaries, ...residential], companyMembers: membersByPrimaryId };
  })();

  const contacts        = companyId ? (companyMembers[companyId] || []) : [];
  const selectedCompany = pickableClients.find(c => c.id === companyId) || null;
  const selectedContact = contacts.find(c => c.id === contactId) || null;

  const handleCompanyChange = (id) => {
    setCompanyId(id ? parseInt(id) : null);
    setContactId(null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const effectiveClientId = selectedContact ? selectedContact.id : (selectedCompany ? selectedCompany.id : null);
    const clientType = selectedCompany?.client_type || "business";
    await onCreate({ ticketType, clientType, title: title.trim(), priority, clientId: effectiveClientId, selectedCompany, selectedContact });
    setSaving(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(13,27,42,0.55)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"28px 32px", width:480, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ fontWeight:800, fontSize:18, color:brand.text, marginBottom:20 }}>New Ticket</div>

        {templates?.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <FieldLabel>Start from Template</FieldLabel>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {templates.map(tpl => (
                <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                  style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", border:`1.5px solid ${brand.blue}`, background:"#fff", color:brand.blue }}>
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom:16 }}>
          <FieldLabel>Ticket Type</FieldLabel>
          <div style={{ display:"flex", gap:8 }}>
            {TICKET_TYPE_OPTIONS.map(tt => (
              <button key={tt} onClick={() => setTicketType(tt)}
                style={{ flex:1, padding:"10px 8px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", border:`2px solid ${ticketType===tt?brand.blue:brand.border}`, background:ticketType===tt?brand.blue:"#fff", color:ticketType===tt?"#fff":brand.muted, textAlign:"center" }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{typeIcons[tt]}</div>
                {tt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:16 }}>
          <FieldLabel>Title</FieldLabel>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Brief description of the issue…" style={inp} />
        </div>

        <div style={{ display:"grid", gap:10, marginBottom:16 }}>
          <div>
            <FieldLabel>Company / Client</FieldLabel>
            <select value={companyId ?? ""} onChange={e => handleCompanyChange(e.target.value || null)} style={inp}>
              <option value="">— Select a client —</option>
              {pickableClients.map(c => (
                <option key={c.id} value={c.id}>{c.company || c.name}</option>
              ))}
            </select>
          </div>
          {contacts.length > 0 && (
            <div>
              <FieldLabel>Contact</FieldLabel>
              <select value={contactId ?? ""} onChange={e => setContactId(e.target.value ? parseInt(e.target.value) : null)} style={inp}>
                <option value="">— No specific contact —</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</option>
                ))}
              </select>
            </div>
          )}
          {selectedCompany && (
            <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:7, padding:"10px 14px", fontSize:13 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Name </span><br/>{(selectedContact?.name || selectedCompany.company || selectedCompany.name) || "—"}</div>
                <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Phone </span><br/>{selectedContact?.phone || selectedCompany.phone || "—"}</div>
                <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Email </span><br/>{selectedContact?.email || selectedCompany.email || "—"}</div>
                <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Address </span><br/>{selectedCompany.address || "—"}</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom:24 }}>
          <FieldLabel>Priority</FieldLabel>
          <Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <Btn onClick={onCancel} variant="ghost">Cancel</Btn>
          <Btn onClick={handleSubmit} variant="accent" disabled={saving || !title.trim()}>
            {saving ? "Creating…" : "Create Ticket"}
          </Btn>
        </div>
      </div>
    </div>
  );
};

// ─── Export modal ─────────────────────────────────────────────────────────────
const ExportModal = ({ clients, onClose, onExport }) => {
  const [statusF,   setStatusF]   = useState("All");
  const [priorityF, setPriorityF] = useState("All");
  const [clientF,   setClientF]   = useState("");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (statusF   !== "All") params.status   = statusF;
      if (priorityF !== "All") params.priority  = priorityF;
      if (clientF.trim())      params.client_name = clientF.trim();
      if (dateFrom)            params.date_from = dateFrom;
      if (dateTo)              params.date_to   = dateTo;
      await onExport(params);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(13,27,42,0.55)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"28px 32px", width:480, boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ fontWeight:800, fontSize:18, color:brand.text, marginBottom:20 }}>Export Tickets</div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div>
            <FieldLabel>Status</FieldLabel>
            <Select value={statusF} onChange={setStatusF} options={["All", ...STATUS_OPTIONS]} />
          </div>
          <div>
            <FieldLabel>Priority</FieldLabel>
            <Select value={priorityF} onChange={setPriorityF} options={["All", ...PRIORITY_OPTIONS]} />
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <FieldLabel>Client Name (partial match)</FieldLabel>
          <Input value={clientF} onChange={setClientF} placeholder="e.g. Acme" />
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
          <div>
            <FieldLabel>Date From</FieldLabel>
            <Input type="date" value={dateFrom} onChange={setDateFrom} />
          </div>
          <div>
            <FieldLabel>Date To</FieldLabel>
            <Input type="date" value={dateTo} onChange={setDateTo} />
          </div>
        </div>

        <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:8, padding:"10px 14px", marginBottom:20, fontSize:12, color:brand.muted }}>
          Exports as CSV — includes ticket details, service totals, labour totals, and SLA deadlines.
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <Btn onClick={onClose} variant="ghost">Cancel</Btn>
          <Btn onClick={handleExport} variant="accent" disabled={exporting}>
            {exporting ? "Exporting…" : "⬇ Download CSV"}
          </Btn>
        </div>
      </div>
    </div>
  );
};

// ─── Board view ───────────────────────────────────────────────────────────────
const BOARD_COLUMNS = [
  { id: "Open",            label: "Open",            color: "#3b82f6", light: "#eff6ff" },
  { id: "In Progress",     label: "In Progress",     color: "#8b5cf6", light: "#f5f3ff" },
  { id: "Awaiting Client", label: "Awaiting Client", color: "#f59e0b", light: "#fffbeb" },
  { id: "Resolved",        label: "Resolved",        color: "#10b981", light: "#f0fdf4" },
  { id: "Closed",          label: "Closed",          color: "#6b7280", light: "#f9fafb" },
];

const PRIORITY_DOT = { Low: "#6b7280", Medium: "#3b82f6", High: "#f59e0b", Urgent: "#ef4444" };

const BoardView = ({ tickets, onSelect, onStatusChange, users }) => {
  const [dragging, setDragging]   = useState(null);   // ticket id
  const [overCol,  setOverCol]    = useState(null);   // column id being dragged over
  const [overCard, setOverCard]   = useState(null);   // card id being hovered over

  const byStatus = (status) => tickets.filter(t => t.status === status);

  const handleDragStart = (e, ticketId) => {
    setDragging(ticketId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDragging(null);
    setOverCol(null);
    setOverCard(null);
  };

  const handleDrop = (e, colId) => {
    e.preventDefault();
    if (dragging && dragging !== colId) {
      const ticket = tickets.find(t => t.id === dragging);
      if (ticket && ticket.status !== colId) {
        onStatusChange(dragging, colId);
      }
    }
    setDragging(null);
    setOverCol(null);
    setOverCard(null);
  };

  const assigneeName = (id) => users?.find(u => u.id === id)?.name?.split(" ")[0] ?? null;

  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 12, minHeight: 500, alignItems: "flex-start" }}>
      {BOARD_COLUMNS.map(col => {
        const cards = byStatus(col.id);
        const isOver = overCol === col.id;
        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null); }}
            onDrop={e => handleDrop(e, col.id)}
            style={{
              flex: "0 0 240px", minWidth: 240,
              background: isOver ? col.light : "#f8fafc",
              border: `2px solid ${isOver ? col.color : "#e2e8f0"}`,
              borderRadius: 12,
              transition: "border-color 0.15s, background 0.15s",
              display: "flex", flexDirection: "column",
            }}>
            {/* Column header */}
            <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{col.label}</span>
              <span style={{ marginLeft: "auto", background: "#e2e8f0", color: "#64748b", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{cards.length}</span>
            </div>

            {/* Cards */}
            <div style={{ padding: "8px 8px", display: "flex", flexDirection: "column", gap: 7, flex: 1, minHeight: 80 }}>
              {cards.map(t => {
                const sla = slaStatus(t.sla_resolution_due, t.created_at, t.priority);
                const isDraggingThis = dragging === t.id;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={e => handleDragStart(e, t.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => !dragging && onSelect(t.id)}
                    style={{
                      background: "#fff",
                      border: `1px solid ${isDraggingThis ? col.color : "#e2e8f0"}`,
                      borderRadius: 9,
                      padding: "10px 12px",
                      cursor: "grab",
                      opacity: isDraggingThis ? 0.4 : 1,
                      boxShadow: isDraggingThis ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
                      transition: "opacity 0.15s, box-shadow 0.15s",
                      borderLeft: `3px solid ${col.color}`,
                      userSelect: "none",
                    }}
                    onMouseEnter={e => { if (!dragging) e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.10)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = isDraggingThis ? "none" : "0 1px 3px rgba(0,0,0,0.06)"; }}>

                    {/* Ticket ID + type */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "monospace" }}>{t.id}</span>
                      <span style={{ fontSize: 10, background: "#f1f5f9", color: "#64748b", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{t.ticket_type}</span>
                    </div>

                    {/* Title */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", lineHeight: 1.4, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {t.title || "(No title)"}
                    </div>

                    {/* Client */}
                    {t.client_name && (
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.client_type === "business" ? "🏢" : "🏠"} {t.client_name}
                      </div>
                    )}

                    {/* Billing status */}
                    {t.billing_status && t.billing_status !== "unbilled" && (
                      <div style={{ marginBottom: 8 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px",
                          ...(t.billing_status === "paid"
                            ? { background: "#d1fae5", color: "#065f46" }
                            : { background: "#dbeafe", color: "#1d4ed8" }),
                        }}>
                          {t.billing_status === "paid" ? "💲 Paid" : "🧾 Invoiced"}
                        </span>
                      </div>
                    )}

                    {/* Footer row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_DOT[t.priority] ?? "#94a3b8", flexShrink: 0 }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>{t.priority}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {sla && !["Resolved","Closed"].includes(t.status) && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: sla.breached ? "#ef4444" : sla.color, background: sla.breached ? "#fef2f2" : "#f0fdf4", borderRadius: 4, padding: "1px 5px" }}>
                            {sla.breached ? "⚠ SLA" : sla.label}
                          </span>
                        )}
                        {t.assigned_to && assigneeName(t.assigned_to) && (
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: brand.blue, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title={assigneeName(t.assigned_to)}>
                            {assigneeName(t.assigned_to).slice(0,2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Drop target hint when column is empty and being dragged over */}
              {cards.length === 0 && isOver && (
                <div style={{ border: `2px dashed ${col.color}`, borderRadius: 9, padding: "20px 0", textAlign: "center", color: col.color, fontSize: 12, fontWeight: 600 }}>
                  Drop here
                </div>
              )}
              {cards.length === 0 && !isOver && (
                <div style={{ padding: "20px 0", textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>No tickets</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Ticket list ──────────────────────────────────────────────────────────────
const TicketList = ({ tickets, total, loading, onSelect, onNew, search, onSearch, statusFilter, onStatusFilter, quickFilter, onClearQuickFilter, onExport, users, assigneeFilter, onAssigneeFilter, onStatusChange }) => {
  const [showExport, setShowExport] = useState(false);
  const [viewMode, setViewMode]     = useState("list"); // "list" | "board"
  const statusColor = { Open:"blue", "In Progress":"amber", "Awaiting Client":"gray", Resolved:"green", Closed:"gray" };
  const priorityColor = { Low:"gray", Medium:"blue", High:"amber", Urgent:"red" };

  const grandTotal = (t) => {
    const svc   = (t.service_lines ?? []).reduce((s, sv) => s + calcServiceTotal({ serviceId: sv.service_id, type: sv.type, rate: Number(sv.rate), base: Number(sv.base), perUnit: Number(sv.per_unit), qty: sv.qty, extraQty: sv.extra_qty }), 0);
    const hours = (t.hour_logs ?? []).reduce((s, l) => s + (parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0), 0);
    const materials = (t.materials_used ?? []).reduce((s, m) => s + (parseFloat(m.qty) || 0) * (parseFloat(m.unit_price) || 0), 0);
    const trav  = TRAVEL_FEES.find(f => f.id === t.travel_fee)?.fee || 0;
    return svc + hours + materials + trav;
  };

  const stats = {
    open:       tickets.filter(t => t.status === "Open").length,
    inProgress: tickets.filter(t => t.status === "In Progress").length,
    total,
    revenue:    tickets.reduce((s, t) => s + grandTotal(t), 0),
  };

  return (
    <div>
      {total > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
          {[
            { label:"Total Tickets", value:stats.total,         color:brand.blue },
            { label:"Open",          value:stats.open,          color:brand.accent },
            { label:"In Progress",   value:stats.inProgress,    color:"#7c3aed" },
            { label:"Total Revenue", value:fmt(stats.revenue),  color:brand.success },
          ].map(s => (
            <div key={s.label} style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:brand.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>{s.label}</div>
              <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {quickFilter && (
        <div style={{ display:"flex", alignItems:"center", gap:10, background:"#dbeafe", border:"1px solid #93c5fd", borderRadius:8, padding:"8px 14px", marginBottom:12 }}>
          <span style={{ fontSize:13, fontWeight:600, color:brand.blue }}>Filtered: {quickFilter.label}</span>
          <button onClick={onClearQuickFilter} style={{ background:"none", border:"none", color:brand.blue, cursor:"pointer", fontSize:16, lineHeight:1, padding:"0 2px", marginLeft:4 }}>×</button>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, gap:12, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:8 }}>
          <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search tickets…" style={{ ...inp, maxWidth:220 }} />
          {users && users.length > 0 && (
            <select value={assigneeFilter||""} onChange={e => onAssigneeFilter(e.target.value ? parseInt(e.target.value) : null)} style={{ ...inp, maxWidth:180 }}>
              <option value="">All Assignees</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
        {viewMode === "list" && (
          <div style={{ display:"flex", gap:6 }}>
            {["All", ...STATUS_OPTIONS].map(s => (
              <button key={s} onClick={()=>onStatusFilter(s)}
                style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", border:`1.5px solid ${statusFilter===s?brand.blue:brand.border}`, background:statusFilter===s?brand.blue:"#fff", color:statusFilter===s?"#fff":brand.muted }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {/* View toggle */}
          <div style={{ display:"flex", border:`1px solid ${brand.border}`, borderRadius:8, overflow:"hidden" }}>
            {[
              { id:"list",  icon:"☰", title:"List view"  },
              { id:"board", icon:"⬜", title:"Board view" },
            ].map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)} title={v.title}
                style={{ padding:"6px 12px", border:"none", fontSize:13, cursor:"pointer", fontFamily:"inherit", background: viewMode===v.id ? brand.blue : "#fff", color: viewMode===v.id ? "#fff" : brand.muted, fontWeight: viewMode===v.id ? 700 : 400, transition:"all 0.12s" }}>
                {v.icon}
              </button>
            ))}
          </div>
          <Btn onClick={() => setShowExport(true)} variant="secondary">⬇ Export</Btn>
          <Btn onClick={onNew} variant="accent">+ New Ticket</Btn>
        </div>
      </div>

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          onExport={onExport}
        />
      )}

      {viewMode === "board" && (
        <BoardView
          tickets={quickFilter ? tickets.filter(quickFilter.fn) : tickets}
          onSelect={onSelect}
          onStatusChange={onStatusChange}
          users={users}
        />
      )}

      {viewMode === "list" && loading && <TicketListSkeleton />}

      {viewMode === "list" && (() => {
        const visible = quickFilter ? tickets.filter(quickFilter.fn) : tickets;
        if (!loading && visible.length === 0) return (
          <div style={{ textAlign:"center", padding:"60px 20px", color:brand.muted }}>
            <div style={{ fontSize:44, marginBottom:14 }}>📋</div>
            <div style={{ fontSize:16, fontWeight:700 }}>{total === 0 ? "No tickets yet" : "No matches"}</div>
            <div style={{ fontSize:13, marginTop:6 }}>{total === 0 ? "Create your first ticket to get started." : "Try adjusting your search or filter."}</div>
          </div>
        );
        return visible.map(t => (
        <div key={t.id} onClick={()=>onSelect(t.id)}
          style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"14px 18px", marginBottom:10, cursor:"pointer", borderLeft:`4px solid ${t.client_type==="business"?brand.blue:brand.accent}`, transition:"box-shadow 0.15s" }}
          onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 12px rgba(26,92,186,0.12)"}
          onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}
        >
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, fontWeight:700, color:brand.muted, fontFamily:"monospace" }}>{t.id}</span>
                <Badge color="gray">{t.ticket_type}</Badge>
                <Badge color={statusColor[t.status]||"gray"}>{t.status}</Badge>
                <Badge color={priorityColor[t.priority]||"gray"}>{t.priority}</Badge>
                <Badge color={t.client_type==="business"?"blue":"amber"}>{t.client_type==="business"?"🏢 Business":"🏠 Residential"}</Badge>
                {t.billing_status && t.billing_status !== "unbilled" && (
                  <Badge color={t.billing_status === "paid" ? "green" : "blue"}>{t.billing_status === "paid" ? "Paid" : "Invoiced"}</Badge>
                )}
              </div>
              <div style={{ fontWeight:700, fontSize:15, color:brand.text }}>{t.title||"(No title)"}</div>
              <div style={{ fontSize:12, color:brand.muted, marginTop:3 }}>
                {t.client_name||"No client name"} &nbsp;·&nbsp; Created {t.created_at?.split("T")[0]}
                {t.assigned_to && users && (() => { const u = users.find(u => u.id === t.assigned_to); return u ? <> &nbsp;·&nbsp; <span style={{ color:brand.blue, fontWeight:600 }}>Assigned: {u.name}</span></> : null; })()}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, marginLeft:20 }}>
              <div style={{ fontWeight:800, fontSize:18, color:brand.blue, whiteSpace:"nowrap" }}>
                {fmt(grandTotal(t))}
              </div>
              {(() => {
                const sla = slaStatus(t.sla_resolution_due, t.created_at, t.priority);
                if (!sla || t.status === "Resolved" || t.status === "Closed") return null;
                return (
                  <div style={{ display:"flex", alignItems:"center", gap:5, background: sla.breached ? "#fee2e2" : "#f0fdf4", border:`1px solid ${sla.color}33`, borderRadius:20, padding:"2px 10px" }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:sla.color }} />
                    <span style={{ fontSize:11, fontWeight:700, color:sla.color, whiteSpace:"nowrap" }}>
                      {sla.breached ? "SLA Breached" : `SLA ${sla.label}`}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ));
      })()} {/* end list viewMode */}
    </div>
  );
};

// ─── Comments section ─────────────────────────────────────────────────────────
// ─── Playbook & Documents section ─────────────────────────────────────────────
const PlaybookSection = ({ ticketType, ticketId }) => {
  const [docs, setDocs] = useState(null);
  const [ticketDocs, setTicketDocs] = useState([]); // attached docs with ack/sig state
  const [allDocsOpen, setAllDocsOpen] = useState(false);

  useEffect(() => {
    if (!ticketType) return;
    listDocuments({ ticket_type: ticketType }).then(setDocs).catch(() => setDocs([]));
  }, [ticketType]);

  useEffect(() => {
    if (!ticketId) return;
    listTicketDocuments(ticketId).then(setTicketDocs).catch(() => {});
  }, [ticketId]);

  const tdMap = Object.fromEntries(ticketDocs.map(td => [td.document_id, td]));

  const sortDocs = (list) => [...list].sort((a, b) => {
    const aTagged = a.tags.length > 0 ? 0 : 1;
    const bTagged = b.tags.length > 0 ? 0 : 1;
    if (aTagged !== bTagged) return aTagged - bTagged;
    const aSpecific = a.ticket_types.length > 0 ? 0 : 1;
    const bSpecific = b.ticket_types.length > 0 ? 0 : 1;
    return aSpecific - bSpecific;
  });

  const allDocs = docs || [];
  const internal = sortDocs(allDocs.filter(d => d.category === "internal"));
  const clientFacing = sortDocs(allDocs.filter(d => d.category === "client_facing"));

  const handleAttachToggle = async (doc, checked) => {
    if (!ticketId) return;
    if (checked) {
      const td = await attachDocument(ticketId, doc.id);
      setTicketDocs(p => [...p.filter(x => x.document_id !== doc.id), td]);
    } else {
      await detachDocument(ticketId, doc.id);
      setTicketDocs(p => p.filter(x => x.document_id !== doc.id));
    }
  };

  const handleCheckbox = async (doc, field, checked) => {
    if (!ticketId) return;
    const td = tdMap[doc.id];
    if (!td) return;
    const updated = await updateTicketDocument(ticketId, doc.id, {
      acknowledged: field === "acknowledged" ? checked : td.acknowledged,
      signature_obtained: field === "signature_obtained" ? checked : td.signature_obtained,
    });
    setTicketDocs(p => p.map(x => x.document_id === doc.id ? updated : x));
  };

  if (docs === null) return null;
  if (allDocs.length === 0) return null;

  const suggested = allDocs.filter(d => d.tags.length > 0);
  const rest = allDocs.filter(d => d.tags.length === 0);

  const DocRow = ({ doc }) => {
    const td = tdMap[doc.id];
    const isAttached = !!td;
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", background: isAttached ? "#f0f4ff" : brand.bg, border: `1px solid ${isAttached ? brand.blue : brand.border}`, borderRadius: 7, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, color: brand.text, marginBottom: 4 }}>
            <input type="checkbox" checked={isAttached} onChange={e => handleAttachToggle(doc, e.target.checked)} />
            {doc.name}
          </label>
          {doc.description && <div style={{ fontSize: 12, color: brand.muted, marginBottom: 4 }}>{doc.description}</div>}
          {doc.tags.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
              {doc.tags.map(t => (
                <span key={t} style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 20, padding: "1px 7px", fontSize: 11, color: brand.muted }}>{t}</span>
              ))}
            </div>
          )}
          {isAttached && (
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", color: td.acknowledged ? "#16a34a" : brand.muted }}>
                <input type="checkbox" checked={td.acknowledged} onChange={e => handleCheckbox(doc, "acknowledged", e.target.checked)} />
                Acknowledged
              </label>
              {doc.requires_signature && (
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", color: td.signature_obtained ? "#16a34a" : "#c47a00", fontWeight: td.signature_obtained ? 600 : 400 }}>
                  <input type="checkbox" checked={td.signature_obtained} onChange={e => handleCheckbox(doc, "signature_obtained", e.target.checked)} />
                  ✎ Signature obtained
                </label>
              )}
            </div>
          )}
          {!isAttached && doc.requires_signature && (
            <div style={{ fontSize: 11, color: "#c47a00", fontWeight: 600 }}>✎ Requires signature</div>
          )}
        </div>
        <button onClick={() => downloadWithAuth(docDownloadUrl(doc.id), doc.original_name)}
          style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#fff", color: brand.blue, border: `1.5px solid ${brand.blue}`, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}>
          Download
        </button>
      </div>
    );
  };

  return (
    <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 20 }}>
      <SectionHeader>Playbook & Documents</SectionHeader>

      {/* Case documents summary */}
      {ticketDocs.length > 0 && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Case Documents</div>
          {ticketDocs.map(td => (
            <div key={td.document_id} style={{ fontSize: 12, color: brand.text, display: "flex", gap: 10, marginBottom: 3, alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{td.document_name}</span>
              {td.acknowledged && <span style={{ color: "#16a34a" }}>✓ Acknowledged</span>}
              {td.signature_obtained && <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ Signature obtained</span>}
              {!td.acknowledged && !td.signature_obtained && <span style={{ color: brand.muted }}>Attached</span>}
            </div>
          ))}
        </div>
      )}

      {/* Suggested documents — tagged docs matching this ticket type */}
      {suggested.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            ★ Suggested ({suggested.length})
          </div>
          {suggested.map(d => <DocRow key={d.id} doc={d} />)}
        </div>
      )}

      {/* All documents — collapsed by default */}
      {rest.length > 0 && (
        <div>
          <button onClick={() => setAllDocsOpen(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: allDocsOpen ? 8 : 0, fontFamily: "inherit" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              All Documents ({rest.length})
            </span>
            <span style={{ fontSize: 11, color: brand.muted }}>{allDocsOpen ? "▲" : "▼"}</span>
          </button>
          {allDocsOpen && rest.map(d => <DocRow key={d.id} doc={d} />)}
        </div>
      )}

      {suggested.length === 0 && rest.length === 0 && (
        <div style={{ fontSize: 12, color: brand.muted }}>No documents matched to <strong>{ticketType}</strong> tickets.</div>
      )}
    </div>
  );
};

const CommentsSection = ({ ticketId, currentUser, features }) => {
  const [comments, setComments] = useState([]);
  const [body,       setBody]       = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [posting,    setPosting]    = useState(false);
  const [canned,     setCanned]     = useState([]);

  const showCanned = features?.canned_responses !== false;

  useEffect(() => {
    listComments(ticketId).then(setComments).catch(() => {});
  }, [ticketId]);

  useEffect(() => {
    if (!showCanned) return;
    listCannedResponses().then(setCanned).catch(() => {});
  }, [showCanned]);

  const insertCanned = (e) => {
    const id = e.target.value;
    e.target.value = "";
    if (!id) return;
    const r = canned.find(c => String(c.id) === id);
    if (!r) return;
    setBody(prev => (prev ? prev + "\n" + r.body : r.body));
  };

  const handlePost = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      const c = await addComment(ticketId, { body: body.trim(), is_internal: isInternal });
      setComments(prev => [...prev, c]);
      setBody("");
    } finally { setPosting(false); }
  };

  const handleDelete = async (id) => {
    await deleteComment(ticketId, id);
    setComments(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 20 }}>
      <SectionHeader>Comments</SectionHeader>
      {comments.length === 0 && (
        <div style={{ color: brand.muted, fontSize: 13, marginBottom: 14 }}>No comments yet.</div>
      )}
      {comments.map(c => (
        <div key={c.id} style={{ background: c.is_internal ? "#fffbf0" : brand.bg, border: `1px solid ${c.is_internal ? brand.accent + "55" : brand.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: brand.text }}>{c.author_name}</span>
              {!c.author_id && <span style={{ fontSize: 10, fontWeight: 700, background: "#64748b", color: "#fff", borderRadius: 20, padding: "1px 8px", textTransform: "uppercase" }}>Client</span>}
              {c.is_internal && <span style={{ fontSize: 10, fontWeight: 700, background: brand.accent, color: "#fff", borderRadius: 20, padding: "1px 8px", textTransform: "uppercase" }}>Internal</span>}
              <span style={{ fontSize: 11, color: brand.muted }}>{new Date(c.created_at).toLocaleString()}</span>
            </div>
            {/* currentUser?.id === c.author_id is always false when author_id is null
                (a client-authored comment), so the × naturally hides for non-admins. */}
            {(currentUser?.id === c.author_id || currentUser?.role === "admin") && (
              <button onClick={() => handleDelete(c.id)} style={{ background: "none", border: "none", color: brand.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
            )}
          </div>
          <div style={{ fontSize: 13, color: brand.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.body}</div>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        {showCanned && canned.length > 0 && (
          <select onChange={insertCanned} defaultValue="" style={{ ...inp, marginBottom: 8, width: "auto" }}>
            <option value="">Insert canned response…</option>
            {canned.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Add a comment…" style={{ ...inp, resize: "vertical", marginBottom: 8 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: brand.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />
            Internal note (not visible to client)
          </label>
          <Btn onClick={handlePost} variant="secondary" small disabled={posting || !body.trim()}>
            {posting ? "Posting…" : "Post Comment"}
          </Btn>
        </div>
      </div>
    </div>
  );
};

// ─── Activity (audit log) section ──────────────────────────────────────────────
const AUDIT_VERBS = {
  created: () => "created this ticket",
  status_changed: (a) => `changed status from "${a.old_value}" to "${a.new_value}"`,
  assignee_changed: () => "changed the assignee",
  price_changed: (a) => `changed the price from $${a.old_value} to $${a.new_value}`,
  field_changed: (a) => `changed ${a.field}`,
};

const AuditSection = ({ ticketId }) => {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    listTicketAudit(ticketId).then(setEntries).catch(() => {});
  }, [ticketId]);

  if (entries.length === 0) return null;

  return (
    <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 20 }}>
      <SectionHeader>Activity</SectionHeader>
      {entries.map(a => (
        <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, color: brand.text, padding: "6px 0", borderBottom: `1px solid ${brand.border}` }}>
          <span style={{ fontWeight: 700 }}>{a.actor_label}</span>
          <span style={{ color: brand.muted }}>{(AUDIT_VERBS[a.action] || AUDIT_VERBS.field_changed)(a)}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: brand.muted, whiteSpace: "nowrap" }}>{new Date(a.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Attachments section ───────────────────────────────────────────────────────
const ALLOWED_EXTS = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip";
const AttachmentsSection = ({ ticketId, currentUser }) => {
  const [attachments, setAttachments] = useState([]);
  const [uploading,   setUploading]   = useState(false);

  useEffect(() => {
    listAttachments(ticketId).then(setAttachments).catch(() => {});
  }, [ticketId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadAttachment(ticketId, file);
      setAttachments(prev => [...prev, att]);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Upload failed";
      alert(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this attachment?")) return;
    await deleteAttachment(id);
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionHeader style={{ marginBottom: 0 }}>Attachments</SectionHeader>
        <label style={{ cursor: "pointer" }}>
          <input type="file" accept={ALLOWED_EXTS} style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
          <span style={{ background: brand.blue, color: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "Uploading…" : "+ Attach File"}
          </span>
        </label>
      </div>
      {attachments.length === 0 && (
        <div style={{ color: brand.muted, fontSize: 13 }}>No attachments yet.</div>
      )}
      {attachments.map(a => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 7, padding: "8px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <span style={{ fontSize: 18 }}>📎</span>
            <div style={{ overflow: "hidden" }}>
              <button onClick={() => downloadWithAuth(downloadUrl(a.id), a.original_name)} style={{ color: brand.blue, fontWeight: 600, fontSize: 13, background: "none", border: "none", padding: 0, cursor: "pointer", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "inherit", textAlign: "left" }}>
                {a.original_name}
              </button>
              <span style={{ color: brand.muted, fontSize: 11 }}>{fmtSize(a.size)} · {new Date(a.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          {(currentUser?.id === a.uploaded_by || currentUser?.role === "admin") && (
            <button onClick={() => handleDelete(a.id)} style={{ background: "none", border: "none", color: brand.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Ticket editor ────────────────────────────────────────────────────────────
export const TicketEditor = ({ ticket, onSave, onBack, onDelete, saving, onCreateInvoice, users, currentUser, onTemplateSaved, showToast, clients = [], onClientUpdated, features, materials = [] }) => {
  const [t, setT] = useState(ticket);
  const [savingTpl, setSavingTpl] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | "saving" | "saved"
  const [holdModal, setHoldModal] = useState(false);
  const [holdJustification, setHoldJustification] = useState("");
  const [postingHold, setPostingHold] = useState(false);
  const [convertPrompt, setConvertPrompt] = useState(null); // the linked Quote, once found
  const [converting, setConverting] = useState(false);
  const [openMaterialRow, setOpenMaterialRow] = useState(null);
  const [openServiceRow, setOpenServiceRow] = useState(null);
  const autoSaveTimer = useRef(null);
  const isNew = !ticket.id;
  const RESOLVED_STATUSES = ["Resolved", "Closed"];

  const up = (field, val) => setT(prev => ({ ...prev, [field]: val }));

  // ── Client picker (business: company → contact; residential: flat list) ──
  const { pickableClients, companyMembers } = (() => {
    const businessGroups = {};
    const residential = [];
    for (const c of clients) {
      if (c.client_type === "business" && c.company) {
        const key = c.company.toLowerCase();
        if (!businessGroups[key]) businessGroups[key] = { primary: null, members: [] };
        if (!businessGroups[key].primary || c.id < businessGroups[key].primary.id)
          businessGroups[key].primary = c;
        businessGroups[key].members.push(c);
      } else {
        residential.push(c);
      }
    }
    const primaries = Object.values(businessGroups).map(g => g.primary);
    const membersByPrimaryId = {};
    for (const g of Object.values(businessGroups)) {
      membersByPrimaryId[g.primary.id] = g.members.filter(m => m.id !== g.primary.id);
    }
    return { pickableClients: [...primaries, ...residential], companyMembers: membersByPrimaryId };
  })();

  const [pickerCompanyId, setPickerCompanyId] = useState(null);
  const [pickerContactId, setPickerContactId] = useState(null);

  // Once clients load, resolve which company + contact the ticket's client_id maps to
  useEffect(() => {
    if (!clients.length || !t.clientId) return;
    const rawId = t.clientId;
    const isPrimary = pickableClients.some(c => c.id === rawId);
    if (isPrimary) {
      setPickerCompanyId(rawId);
      setPickerContactId(null);
    } else {
      for (const [primaryId, members] of Object.entries(companyMembers)) {
        if (members.some(m => m.id === rawId)) {
          setPickerCompanyId(parseInt(primaryId));
          setPickerContactId(rawId);
          return;
        }
      }
      // Fallback: treat as primary
      setPickerCompanyId(rawId);
      setPickerContactId(null);
    }
  }, [clients.length]);

  const pickerContacts = pickerCompanyId ? (companyMembers[pickerCompanyId] || []) : [];
  const pickerCompany  = pickableClients.find(c => c.id === pickerCompanyId) || null;

  const applyClientPick = (companyId, contactId) => {
    const company = pickableClients.find(c => c.id === companyId) || null;
    const contact = (companyMembers[companyId] || []).find(c => c.id === contactId) || null;
    const effectiveId = contact ? contact.id : (company ? company.id : null);
    const displayName = company
      ? (contact ? `${company.company || company.name} — ${contact.name}` : (company.company || company.name))
      : "";
    setT(prev => ({
      ...prev,
      clientId:      effectiveId,
      clientType:    company ? (company.client_type || "business") : prev.clientType,
      clientName:    displayName || prev.clientName,
      clientEmail:   contact?.email || company?.email || prev.clientEmail,
      clientPhone:   contact?.phone || company?.phone || prev.clientPhone,
      clientAddress: company?.address || prev.clientAddress,
    }));
  };

  const handleCompanyChange = (id) => {
    const companyId = id ? parseInt(id) : null;
    setPickerCompanyId(companyId);
    setPickerContactId(null);
    applyClientPick(companyId, null);
  };

  const handleContactChange = (id) => {
    const contactId = id ? parseInt(id) : null;
    setPickerContactId(contactId);
    applyClientPick(pickerCompanyId, contactId);
  };

  // Inline contact/company edit
  const [editingClientId, setEditingClientId] = useState(null); // id of the record being edited
  const [clientEditForm, setClientEditForm]   = useState({});
  const [savingClientEdit, setSavingClientEdit] = useState(false);

  const openClientEdit = () => {
    const id = pickerContactId || pickerCompanyId;
    const rec = clients.find(c => c.id === id);
    if (!rec) return;
    setEditingClientId(id);
    setClientEditForm({ name: rec.name, email: rec.email || "", phone: rec.phone || "", address: rec.address || "", notes: rec.notes || "" });
  };

  const handleClientEditSave = async () => {
    setSavingClientEdit(true);
    try {
      const rec = clients.find(c => c.id === editingClientId);
      const updated = await updateClient(editingClientId, { ...rec, ...clientEditForm, name: clientEditForm.name.trim() });
      // Refresh clients list so dropdowns reflect changes
      onClientUpdated?.(updated);
      // Also update ticket display fields if this is the active client
      setT(prev => ({
        ...prev,
        clientName:    pickerContactId ? prev.clientName.replace(/—.*$/, `— ${updated.name}`) : (updated.company || updated.name),
        clientEmail:   updated.email,
        clientPhone:   updated.phone,
        clientAddress: updated.address,
      }));
      setEditingClientId(null);
      showToast?.("Contact updated.", "ok");
    } catch {
      showToast?.("Failed to update contact.", "err");
    } finally { setSavingClientEdit(false); }
  };
  // ── end client picker ──

  // Autosave: 3s after any change on existing tickets
  useEffect(() => {
    if (isNew) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (!t.title?.trim()) return;
      setAutoSaveStatus("saving");
      try {
        await onSave(t, true);
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus(null), 2000);
      } catch {
        setAutoSaveStatus(null);
      }
    }, 3000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [t]);

  const handleSaveAsTemplate = async () => {
    const name = window.prompt("Template name:", t.title || "New Template");
    if (!name) return;
    setSavingTpl(true);
    try {
      await createTemplate({
        name,
        ticket_type: t.ticketType,
        client_type: t.clientType,
        priority: t.priority,
        title: t.title,
        description: t.description,
        internal_notes: t.internalNotes,
        travel_fee: t.travelFee,
      });
      showToast?.("Template saved.", "ok");
      onTemplateSaved?.();
    } catch {
      showToast?.("Failed to save template.", "err");
    } finally { setSavingTpl(false); }
  };

  const catalogue   = SERVICES[t.clientType] || [];
  const defaultRate = t.clientType === "residential" ? 85 : 110;
  const travel      = TRAVEL_FEES.find(f => f.id === t.travelFee);
  const svcTotal    = t.services.reduce((s, sv) => s + calcServiceTotal(sv), 0);
  const hourTotal   = calcHourTotal(t.hourLogs);
  const materialsTotal = calcMaterialsTotal(t.materialsUsed);
  const grand       = svcTotal + hourTotal + materialsTotal + (travel?.fee || 0);
  const totalHours  = t.hourLogs.reduce((s,l) => s + (parseFloat(l.hours)||0), 0);

  const addSvc  = () => setT(p => ({ ...p, services: [...p.services, { _id:Date.now(), serviceId:"", name:"", type:"" }] }));
  const updSvc  = (i,v) => setT(p => { const s=[...p.services]; s[i]=v; return {...p,services:s}; });
  const remSvc  = (i)   => setT(p => ({ ...p, services: p.services.filter((_,idx)=>idx!==i) }));

  const addHour = () => setT(p => ({ ...p, hourLogs: [...p.hourLogs, { _id:Date.now(), date:new Date().toISOString().split("T")[0], hours:"", rate:defaultRate, description:"" }] }));
  const updHour = (i,v) => setT(p => { const h=[...p.hourLogs]; h[i]=v; return {...p,hourLogs:h}; });
  const remHour = (i)   => setT(p => ({ ...p, hourLogs: p.hourLogs.filter((_,idx)=>idx!==i) }));

  const addMaterial = () => setT(p => ({ ...p, materialsUsed: [...p.materialsUsed, { _id:Date.now(), materialId:null, name:"", unitPrice:0, qty:1 }] }));
  const updMaterial = (i,v) => setT(p => { const m=[...p.materialsUsed]; m[i]=v; return {...p,materialsUsed:m}; });
  const remMaterial = (i)   => setT(p => ({ ...p, materialsUsed: p.materialsUsed.filter((_,idx)=>idx!==i) }));

  const changeType = (val) => setT(p => ({ ...p, clientType:val, services:[], hourLogs:[] }));

  const handleHoldConfirm = async () => {
    if (!holdJustification.trim()) return;
    setPostingHold(true);
    try {
      if (t.id) {
        await addComment(t.id, { body: `⏸ Ticket placed On Hold — ${holdJustification.trim()}`, is_internal: true });
      }
      up("status", "On Hold");
      setHoldModal(false);
    } catch {
      showToast?.("Failed to post hold justification.", "err");
    } finally {
      setPostingHold(false);
    }
  };

  // Ticket transitioning into Resolved/Closed with an unconverted Approved
  // quote pointing at it: pause the save behind a prompt (rather than
  // checking after saving) because a successful save navigates away and
  // unmounts this component, which would make any post-save modal a no-op.
  const handleSaveClick = async () => {
    const prevStatus = ticket.status;
    const newStatus = t.status;
    if (t.id && !RESOLVED_STATUSES.includes(prevStatus) && RESOLVED_STATUSES.includes(newStatus)) {
      try {
        const { items } = await listQuotes({ ticket_id: t.id });
        const quote = items.find(q => q.status === "Approved" && !q.converted_invoice_id);
        if (quote) {
          setConvertPrompt(quote);
          return;
        }
      } catch {
        // Non-critical lookup — fall through to the normal save.
      }
    }
    onSave(t);
  };

  const handleConvertConfirm = async () => {
    if (!convertPrompt) return;
    setConverting(true);
    try {
      const { invoice_id } = await convertQuoteToInvoice(convertPrompt.id);
      showToast?.(`Converted to invoice ${invoice_id}.`, "ok");
    } catch (err) {
      showToast?.(err?.response?.data?.detail || "Failed to convert quote to invoice.", "err");
    } finally {
      setConverting(false);
      setConvertPrompt(null);
      onSave(t);
    }
  };

  const handleDismissConvertPrompt = () => {
    setConvertPrompt(null);
    onSave(t);
  };

  return (
    <div>
      {holdModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(13,27,42,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:12, padding:"28px 32px", width:480, maxWidth:"95vw", boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight:800, fontSize:17, color:brand.text, marginBottom:6 }}>Place Ticket On Hold</div>
            <div style={{ fontSize:13, color:brand.muted, marginBottom:16 }}>Provide a justification — this will be recorded as an internal comment and the SLA clock will be paused.</div>
            <textarea
              autoFocus
              value={holdJustification}
              onChange={e => setHoldJustification(e.target.value)}
              placeholder="e.g. Waiting for vendor part, escalated to third party, internal approval required…"
              style={{ width:"100%", height:100, padding:"8px 11px", border:`1px solid ${brand.border}`, borderRadius:6, fontSize:13, fontFamily:"inherit", resize:"vertical", outline:"none", boxSizing:"border-box" }}
            />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
              <Btn onClick={() => setHoldModal(false)} variant="ghost">Cancel</Btn>
              <Btn onClick={handleHoldConfirm} variant="accent" disabled={postingHold || !holdJustification.trim()}>
                {postingHold ? "Saving…" : "Confirm Hold"}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {convertPrompt && (
        <div style={{ position:"fixed", inset:0, background:"rgba(13,27,42,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:12, padding:"28px 32px", width:480, maxWidth:"95vw", boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight:800, fontSize:17, color:brand.text, marginBottom:6 }}>Convert Quote to Invoice?</div>
            <div style={{ fontSize:13, color:brand.muted, marginBottom:16 }}>
              This ticket originated from quote <strong>{convertPrompt.id}</strong> (total ${Number(convertPrompt.total).toFixed(2)}).
              Now that it's {t.status}, would you like to convert the quote into an invoice?
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Btn onClick={handleDismissConvertPrompt} variant="ghost" disabled={converting}>Not now</Btn>
              <Btn onClick={handleConvertConfirm} variant="accent" disabled={converting}>
                {converting ? "Converting…" : "Convert to Invoice"}
              </Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:`1px solid ${brand.border}`, color:brand.blue, cursor:"pointer", fontSize:18, borderRadius:6, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontWeight:800, fontSize:18, color:brand.text, fontFamily:"monospace" }}>{t.id}</div>
              {t.billingStatus && t.billingStatus !== "unbilled" && (
                <Badge color={t.billingStatus === "paid" ? "green" : "blue"}>{t.billingStatus === "paid" ? "Paid" : "Invoiced"}</Badge>
              )}
            </div>
            <div style={{ fontSize:12, color:brand.muted }}>Created {t.createdAt}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {autoSaveStatus === "saving" && <span style={{ fontSize:12, color:brand.muted }}>Saving…</span>}
          {autoSaveStatus === "saved" && <span style={{ fontSize:12, color:"#16a34a", fontWeight:600 }}>✓ Saved</span>}
          <Btn onClick={handleSaveAsTemplate} variant="ghost" disabled={savingTpl}>{savingTpl ? "Saving…" : "Save as Template"}</Btn>
          <Btn onClick={()=>printTicket(t)} variant="secondary">🖨 Export PDF</Btn>
          <Btn onClick={handleSaveClick} variant="accent" disabled={saving}>{saving ? "Saving…" : "✓ Save Ticket"}</Btn>
        </div>
      </div>

      <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"14px 18px", marginBottom:20, display:"grid", gridTemplateColumns:"auto auto 1fr 1fr 1fr", gap:16, alignItems:"center" }}>
        <div>
          <FieldLabel>Type</FieldLabel>
          <Select value={t.ticketType} onChange={v=>up("ticketType",v)} options={TICKET_TYPE_OPTIONS} />
        </div>
        <div>
          <FieldLabel>Client</FieldLabel>
          <div style={{ display:"flex", gap:8 }}>
            {["business","residential"].map(ct => (
              <button key={ct} onClick={()=>changeType(ct)}
                style={{ padding:"7px 16px", borderRadius:6, fontWeight:700, fontSize:12, cursor:"pointer", border:`2px solid ${t.clientType===ct?brand.blue:brand.border}`, background:t.clientType===ct?brand.blue:"#fff", color:t.clientType===ct?"#fff":brand.muted }}>
                {ct==="business"?"🏢":"🏠"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          <Select value={t.status} onChange={v => {
            if (v === "On Hold") { setHoldJustification(""); setHoldModal(true); }
            else up("status", v);
          }} options={STATUS_OPTIONS} />
        </div>
        <div>
          <FieldLabel>Priority</FieldLabel>
          <Select value={t.priority} onChange={v=>up("priority",v)} options={PRIORITY_OPTIONS} />
        </div>
        <div>
          <FieldLabel>Assigned To</FieldLabel>
          <select value={t.assignedTo||""} onChange={e=>up("assignedTo", e.target.value ? parseInt(e.target.value) : null)} style={inp}>
            <option value="">— Unassigned —</option>
            {(users||[]).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div>
          <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <SectionHeader style={{ margin:0 }}>Client Information</SectionHeader>
              {autoSaveStatus === "saving" && <span style={{ fontSize:11, color:brand.muted }}>Saving…</span>}
              {autoSaveStatus === "saved"  && <span style={{ fontSize:11, color:brand.success }}>Saved ✓</span>}
            </div>
            <div style={{ display:"grid", gap:10 }}>
              <div>
                <FieldLabel>Company / Client</FieldLabel>
                <select value={pickerCompanyId ?? ""} onChange={e => handleCompanyChange(e.target.value || null)} style={inp}>
                  <option value="">— Select a client —</option>
                  {pickableClients.map(c => (
                    <option key={c.id} value={c.id}>{c.company || c.name}</option>
                  ))}
                </select>
              </div>
              {pickerContacts.length > 0 && (
                <div>
                  <FieldLabel>Contact</FieldLabel>
                  <select value={pickerContactId ?? ""} onChange={e => handleContactChange(e.target.value || null)} style={inp}>
                    <option value="">— No specific contact —</option>
                    {pickerContacts.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              {pickerCompanyId && !editingClientId && (
                <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:7, padding:"10px 14px", fontSize:13 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, flex:1 }}>
                      <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Name </span><br/>{t.clientName || "—"}</div>
                      <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Phone </span><br/>{t.clientPhone || "—"}</div>
                      <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Email </span><br/>{t.clientEmail || "—"}</div>
                      <div><span style={{ fontWeight:600, color:brand.muted, fontSize:11, textTransform:"uppercase" }}>Address </span><br/>{t.clientAddress || "—"}</div>
                    </div>
                    <button onClick={openClientEdit} style={{ marginLeft:10, flexShrink:0, background:"none", border:`1px solid ${brand.border}`, borderRadius:5, padding:"3px 10px", fontSize:12, fontWeight:600, color:brand.muted, cursor:"pointer" }}>Edit</button>
                  </div>
                </div>
              )}
              {editingClientId && (
                <div style={{ background:brand.bg, border:`1.5px solid ${brand.blue}`, borderRadius:7, padding:"14px 16px" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:brand.blue, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:10 }}>
                    Edit {pickerContactId ? "Contact" : "Company"}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                    <div><FieldLabel>Name *</FieldLabel><input style={inp} value={clientEditForm.name} onChange={e => setClientEditForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
                    <div><FieldLabel>Phone</FieldLabel><input style={inp} value={clientEditForm.phone} onChange={e => setClientEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
                    <div><FieldLabel>Email</FieldLabel><input style={inp} type="email" autoComplete="off" value={clientEditForm.email} onChange={e => setClientEditForm(p => ({ ...p, email: e.target.value }))} /></div>
                    <div><FieldLabel>Address</FieldLabel><input style={inp} value={clientEditForm.address} onChange={e => setClientEditForm(p => ({ ...p, address: e.target.value }))} /></div>
                    <div style={{ gridColumn:"1/-1" }}><FieldLabel>Notes</FieldLabel><textarea style={{ ...inp, resize:"vertical", minHeight:48 }} value={clientEditForm.notes} onChange={e => setClientEditForm(p => ({ ...p, notes: e.target.value }))} /></div>
                  </div>
                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                    <Btn variant="ghost" small onClick={() => setEditingClientId(null)}>Cancel</Btn>
                    <Btn variant="accent" small disabled={savingClientEdit || !clientEditForm.name.trim()} onClick={handleClientEditSave}>{savingClientEdit ? "Saving…" : "Save"}</Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px" }}>
            <SectionHeader>Issue Details</SectionHeader>
            <div style={{ marginBottom:12 }}>
              <FieldLabel>Title</FieldLabel>
              <Input value={t.title} onChange={v=>up("title",v)} placeholder="Brief description of the issue" />
            </div>
            <div style={{ marginBottom:12 }}>
              <FieldLabel>Description</FieldLabel>
              <Textarea value={t.description} onChange={v=>up("description",v)} placeholder="Full details, symptoms, scope…" rows={5} />
            </div>
            <div>
              <FieldLabel>Internal Notes (not shown on client PDF)</FieldLabel>
              <Textarea value={t.internalNotes} onChange={v=>up("internalNotes",v)} placeholder="Private notes, follow-up items, preconditions met…" rows={4} />
            </div>
          </div>
        </div>

        <div>
          <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <SectionHeader>Services</SectionHeader>
            {t.services.map((sv,i) => (
              <ServiceRow
                key={sv._id||i}
                svc={sv}
                catalogue={catalogue}
                open={openServiceRow === i}
                onOpenChange={(v) => setOpenServiceRow(v ? i : null)}
                onChange={v=>updSvc(i,v)}
                onRemove={()=>remSvc(i)}
              />
            ))}
            <Btn onClick={addSvc} variant="secondary" small>+ Add Service</Btn>
          </div>

          <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <SectionHeader>Hours Log</SectionHeader>
              {totalHours > 0 && <span style={{ fontSize:12, color:brand.muted, fontWeight:600 }}>{totalHours.toFixed(2)} hrs total</span>}
            </div>
            {t.id && features?.timer !== false && <TimerControl ticketId={t.id} onStopped={(log) => setT(p => ({ ...p, hourLogs: [...p.hourLogs, {
              _id: log.id, date: log.date, hours: String(log.hours), rate: Number(log.rate),
              description: log.description, startedAt: log.started_at, endedAt: log.ended_at, isRunning: false,
            }] }))} />}
            {t.hourLogs.filter(l => l.startedAt).map((l,i) => (
              <TimerHourRow key={l._id||i} log={l} />
            ))}
            {t.hourLogs.map((l,i) => !l.startedAt && (
              <HourRow key={l._id||i} log={l} defaultRate={defaultRate} onChange={v=>updHour(i,v)} onRemove={()=>remHour(i)} />
            ))}
            <Btn onClick={addHour} variant="secondary" small>+ Log Hours</Btn>
          </div>

          {features?.materials !== false && (
            <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <SectionHeader>Materials Used</SectionHeader>
                {materialsTotal > 0 && <span style={{ fontSize:12, color:brand.muted, fontWeight:600 }}>{fmt(materialsTotal)} total</span>}
              </div>
              {t.materialsUsed.map((m,i) => (
                <MaterialUsedRow
                  key={m._id||i}
                  item={m}
                  materials={materials}
                  open={openMaterialRow === i}
                  onOpenChange={(v) => setOpenMaterialRow(v ? i : null)}
                  onChange={v=>updMaterial(i,v)}
                  onRemove={()=>remMaterial(i)}
                />
              ))}
              <Btn onClick={addMaterial} variant="secondary" small>+ Add Material</Btn>
            </div>
          )}

          <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <SectionHeader>Travel Fee</SectionHeader>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {TRAVEL_FEES.map(tf => (
                <button key={tf.id} onClick={()=>up("travelFee",tf.id)}
                  style={{ padding:"10px 12px", borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer", border:`2px solid ${t.travelFee===tf.id?brand.blue:brand.border}`, background:t.travelFee===tf.id?brand.bg:"#fff", color:t.travelFee===tf.id?brand.blue:brand.muted, textAlign:"left" }}>
                  <div>{tf.label}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:t.travelFee===tf.id?brand.blue:brand.text, marginTop:2 }}>{tf.fee>0?fmt(tf.fee):"—"}</div>
                </button>
              ))}
            </div>
          </div>

          {/* SLA panel */}
          {t.slaResolutionDue && (()=>{
            const resp = slaStatus(t.slaResponseDue, t.createdAtIso, t.priority);
            const reso = slaStatus(t.slaResolutionDue, t.createdAtIso, t.priority);
            const isClosed = t.status === "Resolved" || t.status === "Closed";
            const isInProgress = t.status === "In Progress";
            const isPaused = t.status === "Awaiting Client" || t.status === "On Hold";
            const pausedSince = isPaused && t.slaPausedAt ? new Date(t.slaPausedAt).toLocaleString() : null;
            return (
              <div style={{ background: isClosed ? "#f0fdf4" : isPaused ? "#fffbeb" : (reso?.breached ? "#fee2e2" : "#fff"), border:`1.5px solid ${isClosed ? "#86efac" : isPaused ? "#fcd34d" : reso?.breached ? "#fca5a5" : brand.border}`, borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", color:brand.muted }}>SLA</div>
                  {isPaused && <span style={{ fontSize:11, fontWeight:700, color:"#b45309", background:"#fef3c7", borderRadius:20, padding:"2px 10px" }}>⏸ Paused — {t.status}</span>}
                </div>
                {isClosed ? (
                  <div style={{ fontSize:13, color:"#16a34a", fontWeight:600 }}>Ticket closed — SLA clock stopped</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[["Response", resp], ["Resolution", reso]].map(([label, s]) => {
                      if (!s) return null;
                      const responseCompleted = label === "Response" && (isInProgress || isPaused);
                      return (
                        <div key={label}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                            <span style={{ fontSize:12, color:brand.muted }}>{label}</span>
                            <span style={{ fontSize:12, fontWeight:700, color: isPaused ? "#b45309" : responseCompleted ? "#16a34a" : s.breached ? "#c0392b" : s.color }}>
                              {responseCompleted && !isPaused ? "Responded" : isPaused ? "Paused" : s.breached ? "BREACHED" : s.label + " left"}
                            </span>
                          </div>
                          <div style={{ height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", width: responseCompleted && !isPaused ? "100%" : `${Math.max(0, Math.min(100, s.pct*100))}%`, background: isPaused ? "#fcd34d" : responseCompleted ? "#16a34a" : s.color, borderRadius:3, transition:"width 0.3s" }} />
                          </div>
                          <div style={{ fontSize:10, color:brand.muted, marginTop:2 }}>
                            {isPaused && pausedSince ? `Paused since ${pausedSince} — clock resumes when status changes` :
                             responseCompleted ? "Status changed to In Progress" :
                             `Due ${new Date(label === "Response" ? t.slaResponseDue : t.slaResolutionDue).toLocaleString()}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{ background:brand.blueDark, borderRadius:10, padding:"18px 20px", color:"#fff" }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", color:"rgba(255,255,255,0.5)", marginBottom:14 }}>Invoice Summary</div>
            {svcTotal > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
                <span style={{ color:"rgba(255,255,255,0.7)" }}>Services</span>
                <span style={{ fontWeight:600 }}>{fmt(svcTotal)}</span>
              </div>
            )}
            {hourTotal > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
                <span style={{ color:"rgba(255,255,255,0.7)" }}>Labour ({totalHours.toFixed(2)} hrs)</span>
                <span style={{ fontWeight:600 }}>{fmt(hourTotal)}</span>
              </div>
            )}
            {materialsTotal > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
                <span style={{ color:"rgba(255,255,255,0.7)" }}>Materials</span>
                <span style={{ fontWeight:600 }}>{fmt(materialsTotal)}</span>
              </div>
            )}
            {(travel?.fee||0) > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13 }}>
                <span style={{ color:"rgba(255,255,255,0.7)" }}>Travel ({travel.label})</span>
                <span style={{ fontWeight:600 }}>{fmt(travel.fee)}</span>
              </div>
            )}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.2)", marginTop:12, paddingTop:14, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <span style={{ fontSize:14, fontWeight:700 }}>Total</span>
              <span style={{ fontSize:28, fontWeight:800, color:brand.accentLight }}>{fmt(grand)}</span>
            </div>
          </div>

          {onCreateInvoice && (
            <div style={{ marginTop:12 }}>
              <Btn onClick={() => onCreateInvoice(t, grand)} variant="accent" style={{ width:"100%" }}>Create Invoice from Ticket</Btn>
            </div>
          )}
          {onDelete && (
            <div style={{ marginTop:8, display:"flex", justifyContent:"flex-end" }}>
              <Btn onClick={()=>{ if(window.confirm("Delete this ticket? This cannot be undone.")) onDelete(t.id); }} variant="danger" small>Delete Ticket</Btn>
            </div>
          )}
        </div>
      </div>

      {t.id && <PlaybookSection ticketType={t.ticketType} ticketId={t.id} />}
      {t.id && (
        <div>
          <SectionHeader>Forms</SectionHeader>
          <FormsSection ticket={t} showToast={showToast} />
        </div>
      )}
      {t.id && <CommentsSection ticketId={t.id} currentUser={currentUser} features={features} />}
      {t.id && <AttachmentsSection ticketId={t.id} currentUser={currentUser} />}
      {t.id && features?.audit_log !== false && <AuditSection ticketId={t.id} />}
    </div>
  );
};

// ─── Recurring tickets page ───────────────────────────────────────────────────
const INTERVALS = ["daily", "weekly", "monthly", "quarterly"];

const RECURRING_DEFAULTS = {
  name: "", active: true, interval: "monthly",
  ticket_type: "Incident", client_type: "business", priority: "Medium",
  title: "", description: "", internal_notes: "", travel_fee: "travel_none",
  client_name: "", client_email: "", client_phone: "", client_address: "",
  assigned_to: null, client_id: null,
};

const RecurringPage = ({ showToast, clients = [] }) => {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | existing row
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listRecurring()); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing.id) {
        await updateRecurring(editing.id, editing);
      } else {
        await createRecurring(editing);
      }
      showToast("Saved.", "ok");
      setEditing(null);
      load();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Save failed.", "err");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this recurring schedule? This cannot be undone.")) return;
    try {
      await deleteRecurring(id);
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
      client_phone:   c ? c.phone   : "",
      client_address: c ? c.address : "",
      client_type:    c ? c.client_type : prev.client_type,
    }));
  };

  const nextRunLabel = (dt) => {
    const d = new Date(dt);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  if (editing !== null) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Btn onClick={() => setEditing(null)} variant="ghost" small>← Back</Btn>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: brand.text }}>{editing.id ? "Edit Recurring Schedule" : "New Recurring Schedule"}</h2>
        </div>
        <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, padding: 24, maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Schedule Name *</label>
              <input value={editing.name} onChange={e => up("name", e.target.value)} style={inp} placeholder="e.g. Monthly Backup Check" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Interval</label>
              <select value={editing.interval} onChange={e => up("interval", e.target.value)} style={inp}>
                {INTERVALS.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Active</label>
              <select value={editing.active ? "true" : "false"} onChange={e => up("active", e.target.value === "true")} style={inp}>
                <option value="true">Yes</option>
                <option value="false">Paused</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Priority</label>
              <select value={editing.priority} onChange={e => up("priority", e.target.value)} style={inp}>
                {["Low","Medium","High","Urgent"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Ticket Type</label>
              <select value={editing.ticket_type} onChange={e => up("ticket_type", e.target.value)} style={inp}>
                {["Incident","Request","Change Request"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Ticket Title</label>
              <input value={editing.title} onChange={e => up("title", e.target.value)} style={inp} placeholder="e.g. Monthly backup verification" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Description</label>
              <textarea rows={3} value={editing.description} onChange={e => up("description", e.target.value)} style={{ ...inp, resize: "vertical" }} placeholder="Steps, instructions…" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Client</label>
              <select value={editing.client_id ?? ""} onChange={e => handleClientSelect(e.target.value || null)} style={inp}>
                <option value="">— No client / enter manually —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>)}
              </select>
            </div>
            {!editing.client_id && (
              <>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Client Name</label>
                  <input value={editing.client_name} onChange={e => up("client_name", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: brand.muted, display: "block", marginBottom: 4 }}>Client Email</label>
                  <input value={editing.client_email} onChange={e => up("client_email", e.target.value)} style={inp} />
                </div>
              </>
            )}
            {editing.client_id && (
              <div style={{ gridColumn: "1/-1", background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 7, padding: "10px 14px", fontSize: 13, color: brand.muted }}>
                {editing.client_name}{editing.client_email ? ` · ${editing.client_email}` : ""}{editing.client_phone ? ` · ${editing.client_phone}` : ""}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => setEditing(null)} variant="ghost">Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving || !editing.name.trim() || !editing.title.trim()}>
              {saving ? "Saving…" : "Save Schedule"}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: brand.text }}>Recurring Tickets</h2>
        <Btn onClick={() => setEditing({ ...RECURRING_DEFAULTS })}>+ New Schedule</Btn>
      </div>
      {loading && <div style={{ color: brand.muted, fontSize: 14 }}>Loading…</div>}
      {!loading && items.length === 0 && (
        <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: brand.muted, fontSize: 14 }}>
          No recurring schedules yet. Create one to auto-generate tickets on a fixed interval.
        </div>
      )}
      {items.map(r => (
        <div key={r.id} style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: brand.text }}>{r.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 20, background: r.active ? "#e6f4ec" : "#f0f0f0", color: r.active ? brand.success : brand.muted }}>{r.active ? "Active" : "Paused"}</span>
              <span style={{ fontSize: 11, color: brand.muted, background: brand.bg, padding: "1px 8px", borderRadius: 20 }}>{r.interval}</span>
            </div>
            <div style={{ fontSize: 12, color: brand.muted }}>
              {r.title} · Next run: <strong style={{ color: brand.text }}>{nextRunLabel(r.next_run)}</strong>
              {r.last_ticket_id && <> · Last: <span style={{ color: brand.blue }}>{r.last_ticket_id}</span></>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={() => setEditing({ ...r })} variant="ghost" small>Edit</Btn>
            <Btn onClick={() => handleDelete(r.id)} variant="danger" small>Delete</Btn>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Ticket editor route wrapper ──────────────────────────────────────────────
const TicketEditorRoute = ({ saving, onSave, onDelete, onCreateInvoice, users, currentUser, onTemplateSaved, showToast, onBack, clients, onClientUpdated, features }) => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    setLoading(true);
    getTicket(ticketId)
      .then(data => setTicket(apiToEditor(data)))
      .catch(() => navigate("/tickets", { replace: true }))
      .finally(() => setLoading(false));
  }, [ticketId, navigate]);

  useEffect(() => { listMaterials().then(setMaterials).catch(() => {}); }, []);

  if (loading) return <TicketEditorSkeleton />;
  if (!ticket) return null;

  return (
    <TicketEditor
      ticket={ticket}
      onSave={onSave}
      onBack={onBack}
      onDelete={onDelete}
      saving={saving}
      onCreateInvoice={onCreateInvoice}
      users={users}
      currentUser={currentUser}
      onTemplateSaved={onTemplateSaved}
      showToast={showToast}
      clients={clients}
      onClientUpdated={onClientUpdated}
      features={features}
      materials={materials}
    />
  );
};

// ─── App shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [needsSetup, setNeedsSetup] = useState(null); // null = checking
  const [authed, setAuthed]         = useState(false);
  const [user, setUser]             = useState(null);
  const [tickets, setTickets]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [newModal, setNewModal]     = useState(false);
  const [clients, setClients]       = useState([]);
  const [users, setUsers]           = useState([]);
  const [templates, setTemplates]   = useState([]);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("All");
  const [quickFilter, setQuickFilter] = useState(null);
  const [assigneeFilter, setAssigneeFilter] = useState(null);
  const [toast, setToast]           = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);
  const [features, setFeatures]     = useState({
    audit_log: true, timer: true, ar_aging: true,
    notifications: true, recurring_invoicing: true, scheduling: true,
    quotes: true, global_search: true, canned_responses: true,
    sla_escalation: true, sla_tiers: true,
    two_factor_auth: false, // unlike every other toggle, FEATURE_2FA defaults off
  });

  const navigate = useNavigate();

  const INACTIVITY_MS = 30 * 60 * 1000;

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    getSetupStatus()
      .then(({ needs_setup }) => setNeedsSetup(needs_setup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    clearTokens();
    setAuthed(false);
    setUser(null);
    setTickets([]);
    navigate("/");
  }, [navigate]);

  useEffect(() => {
    registerLogoutHandler(handleLogout);
  }, [handleLogout]);

  useEffect(() => {
    if (!hasStoredSession()) return;
    me().then(() => handleLogin()).catch(() => clearTokens());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authed) return;
    let timer = setTimeout(handleLogout, INACTIVITY_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(handleLogout, INACTIVITY_MS);
    };
    const events = ["mousemove", "keydown", "pointerdown", "scroll"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [authed, handleLogout]);

  const loadClients = useCallback(async () => {
    try { setClients(await listClients()); } catch {}
  }, []);

  const loadTemplates = useCallback(async () => {
    try { setTemplates(await listTemplates()); } catch {}
  }, []);

  const handleLogin = async () => {
    try {
      const profile = await me();
      setUser(profile);
      setAuthed(true);
      listClients().then(setClients).catch(() => {});
      listUsers().then(setUsers).catch(() => {});
      listTemplates().then(setTemplates).catch(() => {});
      getFeatureConfig().then(setFeatures).catch(() => {});
    } catch {
      clearTokens();
      showToast("Could not load user profile. Please try again.", "err");
    }
  };

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== "All") params.status = statusFilter;
      if (assigneeFilter) params.assigned_to = assigneeFilter;
      const data = await listTickets(params);
      setTickets(data.items);
      setTotal(data.total);
    } catch {
      showToast("Failed to load tickets.", "err");
    } finally {
      setLoadingList(false);
    }
  }, [search, statusFilter, assigneeFilter]);

  useEffect(() => {
    if (authed) loadList();
  }, [authed, loadList]);

  const handleDashboardNav = ({ status, quick }) => {
    setSearch("");
    setStatus(status || "All");
    setQuickFilter(quick || null);
    navigate("/tickets");
  };

  const handleNew = () => setNewModal(true);

  const handleCreate = async ({ ticketType, clientType, title, priority, clientId, selectedCompany, selectedContact }) => {
    try {
      const rec = clients.find(c => c.id === clientId);
      // Build display name: "Company — Contact" when a contact is selected, else company or name
      const displayName = selectedCompany
        ? (selectedContact ? `${selectedCompany.company} — ${selectedContact.name}` : (selectedCompany.company || selectedCompany.name))
        : (rec?.name ?? "");
      const email = selectedContact?.email || selectedCompany?.email || rec?.email || "";
      const phone = selectedContact?.phone || selectedCompany?.phone || rec?.phone || "";
      const address = selectedCompany?.address || rec?.address || "";
      const created = await createTicket({
        client_id:     clientId ?? null,
        ticket_type:   ticketType, status: "Open", priority,
        client_type:   rec?.client_type ?? clientType,
        client_name:   displayName,
        client_email:  email,
        client_phone:  phone,
        client_address:address,
        title,
        description: "", internal_notes: "",
        travel_fee: "travel_none", service_lines: [], hour_logs: [], materials_used: [],
      });
      setNewModal(false);
      navigate(`/tickets/${created.id}`);
    } catch {
      showToast("Failed to create ticket.", "err");
    }
  };

  const handleSelect = (id) => navigate(`/tickets/${id}`);

  const handleSave = async (editorTicket, silent = false) => {
    if (!silent) setSaving(true);
    try {
      await updateTicket(editorTicket.id, editorToApi(editorTicket));
      if (!silent) {
        showToast("Ticket saved.", "ok");
        navigate("/tickets");
        loadList();
      }
    } catch {
      if (!silent) showToast("Failed to save ticket.", "err");
      throw new Error("save failed");
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTicket(id);
      showToast("Ticket deleted.", "ok");
      navigate("/tickets");
      loadList();
    } catch {
      showToast("Failed to delete ticket.", "err");
    }
  };

  const handleBoardStatusChange = async (ticketId, newStatus) => {
    try {
      const data = await getTicket(ticketId);
      await updateTicket(ticketId, { ...editorToApi(apiToEditor(data)), status: newStatus });
      showToast(`Moved to ${newStatus}.`, "ok");
      loadList();
    } catch {
      showToast("Failed to update status.", "err");
    }
  };

  const handleCreateInvoiceFromTicket = (t, grand) => {
    const today = new Date().toISOString().slice(0, 10);
    const lines = [];
    t.services.forEach(sv => {
      const total = calcServiceTotal(sv);
      if (total > 0) lines.push({ description: sv.name || "Service", qty: sv.qty || 1, unit_price: total / (sv.qty || 1), amount: total });
    });
    t.hourLogs.forEach(hl => {
      const hrs = parseFloat(hl.hours) || 0;
      const rate = parseFloat(hl.rate) || 0;
      if (hrs > 0) lines.push({ description: hl.description || `Labour ${hl.date}`, qty: hrs, unit_price: rate, amount: hrs * rate });
    });
    t.materialsUsed.forEach(tm => {
      const qty = parseFloat(tm.qty) || 0;
      const unitPrice = parseFloat(tm.unitPrice) || 0;
      const amount = qty * unitPrice;
      if (amount > 0) lines.push({ description: tm.name || "Material", qty, unit_price: unitPrice, amount });
    });
    const travel = TRAVEL_FEES.find(f => f.id === t.travelFee);
    if (travel?.fee > 0) lines.push({ description: `Travel (${travel.label})`, qty: 1, unit_price: travel.fee, amount: travel.fee });
    if (lines.length === 0) lines.push({ description: "", qty: 1, unit_price: 0, amount: 0 });
    setInvoiceDraft({
      ticket_id: t.id,
      client_id: t.clientId ?? null,
      client_name: t.clientName || "",
      client_email: t.clientEmail || "",
      client_address: t.clientAddress || "",
      status: "Draft",
      issue_date: today,
      due_date: "",
      notes: `Invoice for ticket ${t.id}${t.title ? ": " + t.title : ""}`,
      tax_rate: 0,
      lines,
    });
    navigate("/invoices/new");
  };

  if (needsSetup === null) return (
    <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", color: brand.muted, fontSize: 14 }}>
      Loading…
    </div>
  );

  if (needsSetup) return <SetupPage onComplete={() => setNeedsSetup(false)} />;

  if (!authed) return <LoginPage onLogin={handleLogin} />;

  // Derive active nav item from current path for highlighting
  return (
    <BrandingProvider>
      <AppNew
        tickets={tickets} total={total} loadingList={loadingList}
        search={search} setSearch={setSearch}
        statusFilter={statusFilter} setStatus={setStatus}
        quickFilter={quickFilter} setQuickFilter={setQuickFilter}
        assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter}
        users={users} clients={clients} templates={templates}
        toast={toast} showToast={showToast}
        invoiceDraft={invoiceDraft} setInvoiceDraft={setInvoiceDraft}
        newModal={newModal} setNewModal={setNewModal}
        saving={saving}
        handleLogin={handleLogin} handleLogout={handleLogout}
        handleNew={handleNew} handleCreate={handleCreate} handleSave={handleSave}
        handleSelect={handleSelect} handleDelete={handleDelete}
        handleCreateInvoiceFromTicket={handleCreateInvoiceFromTicket}
        handleDashboardNav={handleDashboardNav}
        handleBoardStatusChange={handleBoardStatusChange}
        loadList={loadList} loadClients={loadClients} loadTemplates={loadTemplates}
        user={user}
        features={features}
        navigate={navigate}
        TicketList={TicketList} TicketEditor={TicketEditor}
        TicketEditorRoute={TicketEditorRoute} NewTicketModal={NewTicketModal}
        RecurringPage={RecurringPage}
      />
    </BrandingProvider>
  );
}
