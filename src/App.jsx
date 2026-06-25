import { useState, useEffect, useCallback } from "react";
import { fmt, esc, calcServiceTotal, calcHourTotal } from "./helpers.js";
import { setTokens, clearTokens, registerLogoutHandler } from "./api/client.js";
import { me, logout as apiLogout } from "./api/auth.js";
import { listTickets, getTicket, createTicket, updateTicket, deleteTicket, exportTickets } from "./api/tickets.js";
import { listClients, createClient, updateClient, deleteClient } from "./api/clients.js";
import LoginPage from "./LoginPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import ClientsPage from "./ClientsPage.jsx";
import InvoicesPage from "./InvoicesPage.jsx";
import DashboardPage from "./DashboardPage.jsx";
import SetupPage from "./SetupPage.jsx";
import { getSetupStatus } from "./api/setup.js";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const brand = {
  blue: "#1A5CBA",
  blueDark: "#143f80",
  accent: "#E8A020",
  accentLight: "#f5c05a",
  bg: "#F4F7FC",
  surface: "#FFFFFF",
  border: "#D8E2F0",
  text: "#0D1B2A",
  muted: "#5B6D82",
  success: "#1a8f4a",
  danger: "#c0392b",
};

// ─── Service catalogue ────────────────────────────────────────────────────────
const SERVICES = {
  business: [
    { id: "health_check",           name: "IT Health Check",                            type: "flat",     base: 250, unit: "up to 5 users/devices", perUnit: 25,  perUnitLabel: "per additional user/device" },
    { id: "email_domain",           name: "Professional Email & Custom Domain",          type: "flat",     base: 200, unit: "per domain",            perUnit: 40,  perUnitLabel: "per user/mailbox" },
    { id: "email_migration_10",     name: "Email Migration (up to 10 GB/mailbox)",       type: "per_unit", rate: 150, unitLabel: "mailbox" },
    { id: "email_migration_50",     name: "Email Migration (10–50 GB/mailbox)",          type: "per_unit", rate: 200, unitLabel: "mailbox" },
    { id: "email_migration_50p",    name: "Email Migration (50 GB+/mailbox)",            type: "per_unit", rate: 250, unitLabel: "mailbox" },
    { id: "win11_assessment",       name: "Windows 11 Compatibility Assessment",         type: "per_unit", rate: 75,  unitLabel: "device" },
    { id: "win11_upgrade",          name: "Windows 11 In-Place Upgrade",                 type: "per_unit", rate: 200, unitLabel: "device" },
    { id: "new_pc_setup",           name: "New PC Setup & Data Migration",               type: "per_unit", rate: 300, unitLabel: "device" },
    { id: "network_assessment",     name: "Network Assessment (small office)",           type: "flat",     base: 250, unit: "flat" },
    { id: "network_assessment_cx",  name: "Network Assessment (complex)",                type: "flat",     base: 350, unit: "flat" },
    { id: "basic_network_setup",    name: "Basic Network Setup",                         type: "flat",     base: 250, unit: "router + up to 2 APs", perUnit: 75, perUnitLabel: "per additional AP" },
    { id: "advanced_network_setup", name: "Advanced Network Setup",                      type: "flat",     base: 500, unit: "flat" },
    { id: "backup_setup",           name: "Backup Setup & Verification",                 type: "flat",     base: 400, unit: "first data source",    perUnit: 150, perUnitLabel: "per additional source" },
    { id: "backup_restore",         name: "Backup Restore Test (optional add-on)",       type: "flat",     base: 150, unit: "flat" },
    { id: "server_health",          name: "Server Health Check",                         type: "per_unit", rate: 300, unitLabel: "server" },
    { id: "server_health_cx",       name: "Server Health Check (complex)",               type: "per_unit", rate: 450, unitLabel: "server" },
    { id: "server_maintenance",     name: "Server Maintenance",                          type: "hourly",   rate: 120 },
    { id: "server_maintenance_ah",  name: "Server Maintenance (after-hours)",            type: "hourly",   rate: 150 },
    { id: "hourly_remote",          name: "Hourly IT Support – Remote",                  type: "hourly",   rate: 110 },
    { id: "hourly_onsite",          name: "Hourly IT Support – On-Site",                 type: "hourly",   rate: 130 },
    { id: "hourly_ah_remote",       name: "Hourly IT Support – After-Hours Remote",      type: "hourly",   rate: 150 },
    { id: "hourly_ah_onsite",       name: "Hourly IT Support – After-Hours On-Site",     type: "hourly",   rate: 175 },
    { id: "it_consulting",          name: "IT Consulting",                               type: "hourly",   rate: 125 },
    { id: "cloudflare_zt",          name: "Cloudflare Zero Trust Setup",                 type: "hourly",   rate: 175 },
    { id: "site_to_site",           name: "Site-to-Site Network Connectivity",           type: "hourly",   rate: 175 },
    { id: "remote_monitoring",      name: "Remote Monitoring Setup",                     type: "hourly",   rate: 175 },
    { id: "pos_support",            name: "POS Setup & IT Support",                      type: "hourly",   rate: 130 },
    { id: "managed_starter",        name: "Managed Support – Starter",                   type: "flat",     base: 150, unit: "per month" },
    { id: "managed_small",          name: "Managed Support – Small Business",            type: "flat",     base: 300, unit: "per month" },
    { id: "managed_growing",        name: "Managed Support – Growing Business",          type: "flat",     base: 500, unit: "per month" },
    { id: "basic_it_setup",         name: "Basic IT Setup",                              type: "per_unit", rate: 150, unitLabel: "device" },
    { id: "advanced_it_setup",      name: "Advanced IT Setup",                           type: "per_unit", rate: 275, unitLabel: "device" },
  ],
  residential: [
    { id: "res_remote",    name: "Remote Support",              type: "hourly",   rate: 85 },
    { id: "res_onsite",    name: "On-Site Support",             type: "hourly",   rate: 85 },
    { id: "res_new_pc",    name: "New PC Setup & Data Transfer",type: "per_unit", rate: 300, unitLabel: "device" },
    { id: "res_email",     name: "Email & Account Setup",       type: "hourly",   rate: 85 },
    { id: "res_wifi",      name: "Wi-Fi & Network Setup",       type: "hourly",   rate: 85 },
    { id: "res_backup",    name: "Backup Setup",                type: "flat",     base: 400, unit: "flat" },
    { id: "res_virus",     name: "Virus & Malware Removal",     type: "hourly",   rate: 85 },
    { id: "res_general",   name: "General IT Support",          type: "hourly",   rate: 85 },
    { id: "res_printer",   name: "Printer & Peripheral Setup",  type: "hourly",   rate: 85 },
    { id: "res_software",  name: "Software Install & Setup",    type: "hourly",   rate: 85 },
  ],
};

const TRAVEL_FEES = [
  { id: "travel_none", label: "None (remote only)", fee: 0 },
  { id: "travel_15",   label: "Within 15 km",       fee: 40 },
  { id: "travel_30",   label: "15–30 km",            fee: 60 },
  { id: "travel_30p",  label: "30+ km",              fee: 80 },
];

const STATUS_OPTIONS      = ["Open", "In Progress", "Awaiting Client", "Resolved", "Closed"];
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
  clientId:          t.client_id ?? null,
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
  })),
});

const editorToApi = (t) => ({
  client_id:     t.clientId ?? null,
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
  hour_logs: t.hourLogs.filter((h) => h.hours).map((h) => ({
    date:        h.date,
    hours:       parseFloat(h.hours) || 0,
    rate:        parseFloat(h.rate) || 0,
    description: h.description,
  })),
});

// ─── PDF / Print ──────────────────────────────────────────────────────────────
const printTicket = (ticket) => {
  const travel   = TRAVEL_FEES.find((t) => t.id === ticket.travelFee);
  const travelFee = travel?.fee || 0;
  const svcTotal  = ticket.services.reduce((s, sv) => s + calcServiceTotal(sv), 0);
  const hourTotal = calcHourTotal(ticket.hourLogs);
  const grand     = svcTotal + hourTotal + travelFee;

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
<div class="totals-wrap">
  <table class="totals"><tbody>
    ${svcTotal > 0 ? `<tr><td class="lbl">Services Subtotal</td><td class="val">${fmt(svcTotal)}</td></tr>` : ""}
    ${hourTotal > 0 ? `<tr><td class="lbl">Labour Subtotal</td><td class="val">${fmt(hourTotal)}</td></tr>` : ""}
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
    primary:   { background:brand.blue,   color:"#fff", border:"none" },
    secondary: { background:"#fff",        color:brand.blue,  border:`1.5px solid ${brand.blue}` },
    danger:    { background:"#fff",        color:brand.danger, border:`1.5px solid ${brand.danger}` },
    accent:    { background:brand.accent,  color:"#fff", border:"none" },
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
const ServiceRow = ({ svc, catalogue, onChange, onRemove }) => {
  const def = catalogue.find(c => c.id === svc.serviceId);
  const handleChange = (id) => {
    const d = catalogue.find(c => c.id === id);
    if (!d) return onChange({ ...svc, serviceId:"", name:"", type:"" });
    onChange({ ...svc, serviceId:id, name:d.name, type:d.type, rate:d.rate||0, base:d.base||0, perUnit:d.perUnit||0, perUnitLabel:d.perUnitLabel||"", unitLabel:d.unitLabel||"unit", qty:1, extraQty:0 });
  };
  const cellStyle = { padding:"8px 10px", border:`1px solid ${brand.border}`, borderRadius:6, fontSize:12, color:brand.text, background:"#fff", width:"100%" };
  return (
    <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
      <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
        <div style={{ flex:2 }}>
          <FieldLabel>Service</FieldLabel>
          <select value={svc.serviceId||""} onChange={e=>handleChange(e.target.value)} style={cellStyle}>
            <option value="">— Select service —</option>
            {catalogue.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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

// ─── New ticket modal ─────────────────────────────────────────────────────────
const NewTicketModal = ({ onCreate, onCancel, clients, onClientCreated }) => {
  const [ticketType,   setTicketType]   = useState("Incident");
  const [clientType,   setClientType]   = useState("business");
  const [title,        setTitle]        = useState("");
  const [priority,     setPriority]     = useState("Medium");
  const [clientId,     setClientId]     = useState("");
  const [search,       setSearch]       = useState("");
  const [showNewClient,setShowNewClient]= useState(false);
  const [newName,      setNewName]      = useState("");
  const [newEmail,     setNewEmail]     = useState("");
  const [newPhone,     setNewPhone]     = useState("");
  const [newCompany,   setNewCompany]   = useState("");
  const [saving,       setSaving]       = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  const typeIcons = { Incident:"🔥", Request:"📋", "Change Request":"🔄" };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveNewClient = async () => {
    if (!newName.trim()) return;
    setSavingClient(true);
    try {
      const c = await createClient({ name:newName.trim(), email:newEmail, phone:newPhone, company:newCompany, address:"", client_type:clientType, notes:"" });
      await onClientCreated();
      setClientId(c.id);
      setShowNewClient(false);
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewCompany("");
    } finally { setSavingClient(false); }
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onCreate({ ticketType, clientType, title:title.trim(), priority, clientId:clientId||null });
    setSaving(false);
  };

  const selected = clients.find(c => c.id === clientId);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(13,27,42,0.55)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"28px 32px", width:540, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ fontWeight:800, fontSize:18, color:brand.text, marginBottom:20 }}>New Ticket</div>

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
          <input autoFocus value={title} onChange={e=>setTitle(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            placeholder="Brief description of the issue…" style={inp} />
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <FieldLabel>Client</FieldLabel>
            <button onClick={()=>setShowNewClient(v=>!v)} style={{ fontSize:12, color:brand.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
              {showNewClient ? "← Pick existing" : "+ New client"}
            </button>
          </div>

          {showNewClient ? (
            <div style={{ background:brand.bg, border:`1px solid ${brand.border}`, borderRadius:8, padding:"14px 16px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <FieldLabel>Name *</FieldLabel>
                  <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Full name" style={inp} />
                </div>
                <div>
                  <FieldLabel>Company</FieldLabel>
                  <input value={newCompany} onChange={e=>setNewCompany(e.target.value)} placeholder="Company (optional)" style={inp} />
                </div>
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <input value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="email@example.com" style={inp} />
                </div>
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  <input value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="(514) 000-0000" style={inp} />
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <FieldLabel>Type</FieldLabel>
                <Select value={clientType} onChange={setClientType} options={[{value:"business",label:"🏢 Business"},{value:"residential",label:"🏠 Residential"}]} />
              </div>
              <Btn onClick={handleSaveNewClient} variant="secondary" small disabled={savingClient||!newName.trim()}>
                {savingClient ? "Saving…" : "Save client & select"}
              </Btn>
            </div>
          ) : (
            <div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…" style={{...inp, marginBottom:8}} />
              {selected && (
                <div style={{ background:brand.blue+"18", border:`1.5px solid ${brand.blue}`, borderRadius:8, padding:"8px 12px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:brand.blue }}>{selected.name}</div>
                    {selected.company && <div style={{ fontSize:11, color:brand.muted }}>{selected.company}</div>}
                  </div>
                  <button onClick={()=>setClientId("")} style={{ background:"none", border:"none", color:brand.muted, cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              )}
              <div style={{ maxHeight:160, overflowY:"auto", border:`1px solid ${brand.border}`, borderRadius:8 }}>
                {filtered.length === 0 ? (
                  <div style={{ padding:"12px 14px", color:brand.muted, fontSize:13 }}>No clients found</div>
                ) : filtered.map(c => (
                  <div key={c.id} onClick={()=>{setClientId(c.id);setSearch("");}}
                    style={{ padding:"10px 14px", cursor:"pointer", borderBottom:`1px solid ${brand.border}`, background:clientId===c.id?brand.blue+"10":"#fff" }}>
                    <div style={{ fontWeight:600, fontSize:13, color:brand.text }}>{c.name}</div>
                    <div style={{ fontSize:11, color:brand.muted }}>{[c.company, c.email].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
          {!showNewClient && (
            <div>
              <FieldLabel>Client Type</FieldLabel>
              <Select value={clientType} onChange={setClientType} options={[{value:"business",label:"🏢 Business"},{value:"residential",label:"🏠 Residential"}]} />
            </div>
          )}
          <div>
            <FieldLabel>Priority</FieldLabel>
            <Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
          </div>
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <Btn onClick={onCancel} variant="ghost">Cancel</Btn>
          <Btn onClick={handleSubmit} variant="accent" disabled={saving||!title.trim()}>
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

// ─── Ticket list ──────────────────────────────────────────────────────────────
const TicketList = ({ tickets, total, loading, onSelect, onNew, search, onSearch, statusFilter, onStatusFilter, quickFilter, onClearQuickFilter, onExport }) => {
  const [showExport, setShowExport] = useState(false);
  const statusColor = { Open:"blue", "In Progress":"amber", "Awaiting Client":"gray", Resolved:"green", Closed:"gray" };
  const priorityColor = { Low:"gray", Medium:"blue", High:"amber", Urgent:"red" };

  const grandTotal = (t) => {
    const svc   = (t.service_lines ?? []).reduce((s, sv) => s + calcServiceTotal({ serviceId: sv.service_id, type: sv.type, rate: Number(sv.rate), base: Number(sv.base), perUnit: Number(sv.per_unit), qty: sv.qty, extraQty: sv.extra_qty }), 0);
    const hours = (t.hour_logs ?? []).reduce((s, l) => s + (parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0), 0);
    const trav  = TRAVEL_FEES.find(f => f.id === t.travel_fee)?.fee || 0;
    return svc + hours + trav;
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

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, gap:12 }}>
        <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search tickets…" style={{ ...inp, maxWidth:280 }} />
        <div style={{ display:"flex", gap:6 }}>
          {["All", ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={()=>onStatusFilter(s)}
              style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", border:`1.5px solid ${statusFilter===s?brand.blue:brand.border}`, background:statusFilter===s?brand.blue:"#fff", color:statusFilter===s?"#fff":brand.muted }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:8 }}>
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

      {loading && <Spinner />}

      {(() => {
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
              </div>
              <div style={{ fontWeight:700, fontSize:15, color:brand.text }}>{t.title||"(No title)"}</div>
              <div style={{ fontSize:12, color:brand.muted, marginTop:3 }}>
                {t.client_name||"No client name"} &nbsp;·&nbsp; Created {t.created_at?.split("T")[0]}
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
      })()}
    </div>
  );
};

// ─── Ticket editor ────────────────────────────────────────────────────────────
const TicketEditor = ({ ticket, onSave, onBack, onDelete, saving, onCreateInvoice }) => {
  const [t, setT] = useState(ticket);
  const up = (field, val) => setT(prev => ({ ...prev, [field]: val }));

  const catalogue   = SERVICES[t.clientType] || [];
  const defaultRate = t.clientType === "residential" ? 85 : 110;
  const travel      = TRAVEL_FEES.find(f => f.id === t.travelFee);
  const svcTotal    = t.services.reduce((s, sv) => s + calcServiceTotal(sv), 0);
  const hourTotal   = calcHourTotal(t.hourLogs);
  const grand       = svcTotal + hourTotal + (travel?.fee || 0);
  const totalHours  = t.hourLogs.reduce((s,l) => s + (parseFloat(l.hours)||0), 0);

  const addSvc  = () => setT(p => ({ ...p, services: [...p.services, { _id:Date.now(), serviceId:"", name:"", type:"" }] }));
  const updSvc  = (i,v) => setT(p => { const s=[...p.services]; s[i]=v; return {...p,services:s}; });
  const remSvc  = (i)   => setT(p => ({ ...p, services: p.services.filter((_,idx)=>idx!==i) }));

  const addHour = () => setT(p => ({ ...p, hourLogs: [...p.hourLogs, { _id:Date.now(), date:new Date().toISOString().split("T")[0], hours:"", rate:defaultRate, description:"" }] }));
  const updHour = (i,v) => setT(p => { const h=[...p.hourLogs]; h[i]=v; return {...p,hourLogs:h}; });
  const remHour = (i)   => setT(p => ({ ...p, hourLogs: p.hourLogs.filter((_,idx)=>idx!==i) }));

  const changeType = (val) => setT(p => ({ ...p, clientType:val, services:[], hourLogs:[] }));

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:`1px solid ${brand.border}`, color:brand.blue, cursor:"pointer", fontSize:18, borderRadius:6, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>
          <div>
            <div style={{ fontWeight:800, fontSize:18, color:brand.text, fontFamily:"monospace" }}>{t.id}</div>
            <div style={{ fontSize:12, color:brand.muted }}>Created {t.createdAt}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={()=>printTicket(t)} variant="secondary">🖨 Export PDF</Btn>
          <Btn onClick={()=>onSave(t)} variant="accent" disabled={saving}>{saving ? "Saving…" : "✓ Save Ticket"}</Btn>
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
          <Select value={t.status} onChange={v=>up("status",v)} options={STATUS_OPTIONS} />
        </div>
        <div>
          <FieldLabel>Priority</FieldLabel>
          <Select value={t.priority} onChange={v=>up("priority",v)} options={PRIORITY_OPTIONS} />
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div>
          <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <SectionHeader>Client Information</SectionHeader>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[["Client Name","clientName","Full name or company"],["Phone","clientPhone","(514) 000-0000"],["Email","clientEmail","client@example.com"],["Address","clientAddress","Street, City, QC"]].map(([label,field,ph])=>(
                <div key={field}>
                  <FieldLabel>{label}</FieldLabel>
                  <Input value={t[field]} onChange={v=>up(field,v)} placeholder={ph} />
                </div>
              ))}
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
              <ServiceRow key={sv._id||i} svc={sv} catalogue={catalogue} onChange={v=>updSvc(i,v)} onRemove={()=>remSvc(i)} />
            ))}
            <Btn onClick={addSvc} variant="secondary" small>+ Add Service</Btn>
          </div>

          <div style={{ background:brand.surface, border:`1px solid ${brand.border}`, borderRadius:10, padding:"16px 18px", marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <SectionHeader>Hours Log</SectionHeader>
              {totalHours > 0 && <span style={{ fontSize:12, color:brand.muted, fontWeight:600 }}>{totalHours.toFixed(2)} hrs total</span>}
            </div>
            {t.hourLogs.map((l,i) => (
              <HourRow key={l._id||i} log={l} defaultRate={defaultRate} onChange={v=>updHour(i,v)} onRemove={()=>remHour(i)} />
            ))}
            <Btn onClick={addHour} variant="secondary" small>+ Log Hours</Btn>
          </div>

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
            return (
              <div style={{ background: isClosed ? "#f0fdf4" : (reso?.breached ? "#fee2e2" : "#fff"), border:`1.5px solid ${isClosed ? "#86efac" : reso?.breached ? "#fca5a5" : brand.border}`, borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.5px", color:brand.muted, marginBottom:10 }}>SLA</div>
                {isClosed ? (
                  <div style={{ fontSize:13, color:"#16a34a", fontWeight:600 }}>Ticket closed — SLA clock stopped</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[["Response", resp], ["Resolution", reso]].map(([label, s]) => s && (
                      <div key={label}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                          <span style={{ fontSize:12, color:brand.muted }}>{label}</span>
                          <span style={{ fontSize:12, fontWeight:700, color: s.breached ? "#c0392b" : s.color }}>
                            {s.breached ? "BREACHED" : s.label + " left"}
                          </span>
                        </div>
                        <div style={{ height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${Math.max(0, Math.min(100, s.pct*100))}%`, background:s.color, borderRadius:3, transition:"width 0.3s" }} />
                        </div>
                        <div style={{ fontSize:10, color:brand.muted, marginTop:2 }}>
                          Due {new Date(label === "Response" ? t.slaResponseDue : t.slaResolutionDue).toLocaleString()}
                        </div>
                      </div>
                    ))}
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
    </div>
  );
};

// ─── App shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [needsSetup, setNeedsSetup] = useState(null); // null = checking
  const [authed, setAuthed]         = useState(false);
  const [user, setUser]             = useState(null);
  const [tickets, setTickets]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [view, setView]             = useState("home");
  const [activeTicket, setActive]   = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [newModal, setNewModal]     = useState(false);
  const [clients, setClients]       = useState([]);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("All");
  const [quickFilter, setQuickFilter] = useState(null); // { label, fn } — client-side post-filter
  const [toast, setToast]           = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Check on mount whether first-run setup is needed
  useEffect(() => {
    getSetupStatus()
      .then(({ needs_setup }) => setNeedsSetup(needs_setup))
      .catch(() => setNeedsSetup(false)); // if check fails, proceed to login
  }, []);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    clearTokens();
    setAuthed(false);
    setUser(null);
    setTickets([]);
    setView("list");
  }, []);

  // Register the logout handler so the Axios interceptor can call it on 401
  useEffect(() => {
    registerLogoutHandler(handleLogout);
  }, [handleLogout]);

  // After login, fetch the current user profile
  const loadClients = useCallback(async () => {
    try { setClients(await listClients()); } catch {}
  }, []);

  const handleLogin = async () => {
    try {
      const profile = await me();
      setUser(profile);
      setAuthed(true);
      listClients().then(setClients).catch(() => {});
    } catch {
      clearTokens();
      showToast("Could not load user profile. Please try again.", "err");
    }
  };

  // Load ticket list whenever search or filter changes
  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== "All") params.status = statusFilter;
      const data = await listTickets(params);
      setTickets(data.items);
      setTotal(data.total);
    } catch {
      showToast("Failed to load tickets.", "err");
    } finally {
      setLoadingList(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    if (authed) loadList();
  }, [authed, loadList]);

  // Called by dashboard stat cards — navigates to ticket list with a pre-set filter
  const handleDashboardNav = ({ status, quick }) => {
    setSearch("");
    setStatus(status || "All");
    setQuickFilter(quick || null);
    setView("list");
  };

  const handleNew = () => setNewModal(true);

  const handleCreate = async ({ ticketType, clientType, title, priority, clientId }) => {
    try {
      const selected = clients.find(c => c.id === clientId);
      const created = await createTicket({
        client_id:     clientId ?? null,
        ticket_type:   ticketType, status: "Open", priority,
        client_type:   selected?.client_type ?? clientType,
        client_name:   selected?.name ?? "",
        client_email:  selected?.email ?? "",
        client_phone:  selected?.phone ?? "",
        client_address:selected?.address ?? "",
        title,
        description: "", internal_notes: "",
        travel_fee: "travel_none", service_lines: [], hour_logs: [],
      });
      setNewModal(false);
      setActive(apiToEditor(created));
      setView("edit");
    } catch {
      showToast("Failed to create ticket.", "err");
    }
  };

  const handleSelect = async (id) => {
    try {
      const data = await getTicket(id);
      setActive(apiToEditor(data));
      setView("edit");
    } catch {
      showToast("Failed to load ticket.", "err");
    }
  };

  const handleSave = async (editorTicket) => {
    setSaving(true);
    try {
      await updateTicket(editorTicket.id, editorToApi(editorTicket));
      showToast("Ticket saved.", "ok");
      setView("list");
      loadList();
    } catch {
      showToast("Failed to save ticket.", "err");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTicket(id);
      showToast("Ticket deleted.", "ok");
      setView("list");
      loadList();
    } catch {
      showToast("Failed to delete ticket.", "err");
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
    setView("invoices");
  };

  if (needsSetup === null) return (
    <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", color: brand.muted, fontSize: 14 }}>
      Loading…
    </div>
  );

  if (needsSetup) return <SetupPage onComplete={() => setNeedsSetup(false)} />;

  if (!authed) return <LoginPage onLogin={handleLogin} />;

  return (
    <div style={{ minHeight:"100vh", background:brand.bg, fontFamily:"'Segoe UI', Arial, sans-serif" }}>
      {/* Nav */}
      <div style={{ background:brand.blue, padding:"0 28px", height:54, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <span onClick={() => setView("home")} style={{ color:"#fff", fontWeight:800, fontSize:18, letterSpacing:"-0.3px", cursor:"pointer", marginRight:12 }}>
            ATech<span style={{ color:brand.accent }}>Solutions</span>
          </span>
          {[
            { id:"home",     label:"Home" },
            { id:"list",     label:"Tickets" },
            { id:"clients",  label:"Clients" },
            { id:"invoices", label:"Invoices" },
          ].map(n => (
            <button key={n.id} onClick={() => setView(n.id)}
              style={{ background: view === n.id ? "rgba(255,255,255,0.18)" : "none", border:"none", borderBottom: view === n.id ? "2px solid #fff" : "2px solid transparent", color: view === n.id ? "#fff" : "rgba(255,255,255,0.7)", cursor:"pointer", padding:"0 14px", height:54, fontSize:13, fontWeight: view === n.id ? 700 : 500, fontFamily:"inherit", transition:"all 0.15s" }}>
              {n.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {user && <span style={{ color:"rgba(255,255,255,0.7)", fontSize:12 }}>{user.name} &nbsp;·&nbsp; {user.role}</span>}
          <button onClick={() => setView("settings")} style={{ background: view === "settings" ? "rgba(255,255,255,0.15)" : "none", border:"1px solid rgba(255,255,255,0.3)", color:"rgba(255,255,255,0.8)", cursor:"pointer", borderRadius:6, padding:"5px 12px", fontSize:12, fontFamily:"inherit" }}>Settings</button>
          <button onClick={handleLogout} style={{ background:"none", border:"1px solid rgba(255,255,255,0.3)", color:"rgba(255,255,255,0.8)", cursor:"pointer", borderRadius:6, padding:"5px 12px", fontSize:12, fontFamily:"inherit" }}>Sign out</button>
        </div>
      </div>

      <div style={{ maxWidth:1140, margin:"0 auto", padding:"28px 20px" }}>
        {view === "home" && (
          <DashboardPage
            user={user}
            showToast={showToast}
            onSelectTicket={handleSelect}
            onNavigate={handleDashboardNav}
          />
        )}
        {view === "list" && (
          <TicketList
            tickets={tickets}
            total={total}
            loading={loadingList}
            onSelect={handleSelect}
            onNew={handleNew}
            search={search}
            onSearch={setSearch}
            statusFilter={statusFilter}
            onStatusFilter={(s) => { setStatus(s); setQuickFilter(null); }}
            quickFilter={quickFilter}
            onClearQuickFilter={() => setQuickFilter(null)}
            onExport={exportTickets}
          />
        )}
        {view === "edit" && activeTicket && (
          <TicketEditor
            ticket={activeTicket}
            onSave={handleSave}
            onBack={() => { setView("list"); loadList(); }}
            onDelete={handleDelete}
            saving={saving}
            onCreateInvoice={handleCreateInvoiceFromTicket}
          />
        )}
        {view === "clients" && (
          <ClientsPage showToast={showToast} />
        )}
        {view === "invoices" && (
          <InvoicesPage showToast={showToast} initialDraft={invoiceDraft} onDraftConsumed={() => setInvoiceDraft(null)} />
        )}
        {view === "settings" && (
          <SettingsPage user={user} showToast={showToast} />
        )}
      </div>

      {newModal && (
        <NewTicketModal
          onCreate={handleCreate}
          onCancel={() => setNewModal(false)}
          clients={clients}
          onClientCreated={loadClients}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
