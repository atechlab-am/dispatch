import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  listLeads, deleteLead, bulkUpdateLeads, bulkDeleteLeads,
  importLeadsCsv, downloadLeadsCsv, downloadLeadsSampleCsv,
} from "./api/leads.js";
import LeadModal from "./LeadModal.jsx";

const brand = {
  blue: "var(--dispatch-primary)", accent: "#E8A020", bg: "var(--dispatch-bg)", surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)", text: "var(--dispatch-text)", muted: "var(--dispatch-muted)",
  success: "#1a8f4a", danger: "#c0392b",
};

const inp = {
  padding: "8px 11px", border: `1px solid ${brand.border}`,
  borderRadius: 6, fontSize: 13, color: brand.text, background: "#fff",
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const Btn = ({ onClick, children, variant = "primary", small, disabled, type = "button" }) => {
  const s = {
    primary:   { background: brand.blue,    color: "var(--dispatch-on-color)", border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",        color: brand.danger, border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,  color: "var(--dispatch-on-color)", border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const STAGE_RANK = { new: 0, contacted: 1, qualified: 2, proposal: 3, won: 4, lost: 5 };
const PRIORITY_LABEL = { high: "High", medium: "Med", low: "Low" };
const PRIORITY_COLOR = { high: brand.danger, medium: brand.accent, low: brand.muted };
const STAGE_LABEL = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" };
const STAGE_COLOR = {
  new: { bg: "#eef2ff", color: "#4338ca" },
  contacted: { bg: "#dbeafe", color: "#1d4ed8" },
  qualified: { bg: "#fef9c3", color: "#854d0e" },
  proposal: { bg: "#fce7f3", color: "#9d174d" },
  won: { bg: "#d1fae5", color: "#065f46" },
  lost: { bg: "#f1f5f9", color: brand.muted },
};

const COLUMNS = [
  { key: "priority", label: "Priority", width: 100 },
  { key: "business_name", label: "Business Name", width: 180 },
  { key: "industry", label: "Category", width: 130 },
  { key: "area", label: "Area", width: 120 },
  { key: "address", label: "Address", sortable: false, width: 180 },
  { key: "phone", label: "Phone", sortable: false, width: 120 },
  { key: "website", label: "Website", sortable: false, width: 160 },
  { key: "contact_name", label: "Contact", width: 140 },
  { key: "contact_email", label: "Email", sortable: false, width: 180 },
  { key: "outreach_channel", label: "Outreach", sortable: false, width: 110 },
  { key: "date_contacted", label: "Contacted", width: 110 },
  { key: "follow_up_date", label: "Follow-Up", width: 110 },
  { key: "stage", label: "Status", width: 110 },
  { key: "notes", label: "Notes", sortable: false, width: 200 },
];

const MIN_COLUMN_WIDTH = 60;

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString();
}

function isOverdue(d) {
  if (!d) return false;
  return new Date(d + "T00:00:00") < new Date(new Date().toDateString());
}

export default function LeadsPage({ showToast }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active"); // active | lost | all
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [selected, setSelected] = useState(new Set());
  const [modalLead, setModalLead] = useState(undefined); // undefined = closed, null = new, obj = edit
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [colWidths, setColWidths] = useState(() => Object.fromEntries(COLUMNS.map(c => [c.key, c.width])));
  const resizing = useRef(null); // { key, startX, startWidth }

  const startResize = (key, e) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", stopResize);
  };

  const handleResizeMove = (e) => {
    if (!resizing.current) return;
    const { key, startX, startWidth } = resizing.current;
    const next = Math.max(MIN_COLUMN_WIDTH, startWidth + (e.clientX - startX));
    setColWidths(w => ({ ...w, [key]: next }));
  };

  const stopResize = () => {
    resizing.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", stopResize);
  };

  useEffect(() => () => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", stopResize);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    return listLeads()
      .then(setLeads)
      .catch(() => showToast?.("Failed to load leads.", "err"))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const tabbed = useMemo(() => {
    if (tab === "lost") return leads.filter(l => l.stage === "lost");
    if (tab === "all") return leads;
    return leads.filter(l => l.stage !== "lost");
  }, [leads, tab]);

  const sorted = useMemo(() => {
    if (!sortKey) return tabbed;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...tabbed].sort((a, b) => {
      let av, bv;
      if (sortKey === "priority") { av = PRIORITY_RANK[a.priority]; bv = PRIORITY_RANK[b.priority]; }
      else if (sortKey === "stage") { av = STAGE_RANK[a.stage]; bv = STAGE_RANK[b.stage]; }
      else { av = (a[sortKey] || "").toString().toLowerCase(); bv = (b[sortKey] || "").toString().toLowerCase(); }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [tabbed, sortKey, sortDir]);

  useEffect(() => {
    // prune selection when it falls out of the visible tab
    setSelected(prev => {
      const visibleIds = new Set(tabbed.map(l => l.id));
      const next = new Set([...prev].filter(id => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabbed]);

  function handleSort(key) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortKey(null);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(prev => prev.size === tabbed.length ? new Set() : new Set(tabbed.map(l => l.id)));
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    try {
      await deleteLead(id);
      setLeads(p => p.filter(l => l.id !== id));
      showToast?.("Lead deleted.", "ok");
    } catch { showToast?.("Failed to delete lead.", "err"); }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} lead(s)? This cannot be undone.`)) return;
    try {
      await bulkDeleteLeads([...selected]);
      setLeads(p => p.filter(l => !selected.has(l.id)));
      setSelected(new Set());
      showToast?.("Leads deleted.", "ok");
    } catch { showToast?.("Failed to delete leads.", "err"); }
  }

  async function handleBulkPriority(priority) {
    try {
      await bulkUpdateLeads([...selected], { priority });
      await load();
      setSelected(new Set());
      showToast?.("Priority updated.", "ok");
    } catch { showToast?.("Failed to update leads.", "err"); }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importLeadsCsv(file);
      setImportResult(result);
      const updatedNote = result.updated ? `, ${result.updated} updated` : "";
      if (result.errors.length === 0) showToast?.(`Imported ${result.created} lead(s)${updatedNote}.`, "ok");
      else showToast?.(`Imported ${result.created}${updatedNote}, ${result.errors.length} row(s) skipped — see details below.`, "err");
      load();
    } catch (err) {
      showToast?.(err?.response?.data?.detail || "Import failed.", "err");
    } finally {
      setImporting(false);
    }
  }

  function onLeadSaved(lead) {
    setLeads(p => p.some(l => l.id === lead.id) ? p.map(l => l.id === lead.id ? lead : l) : [lead, ...p]);
    setModalLead(undefined);
  }

  function onLeadConverted(lead) {
    setLeads(p => p.map(l => l.id === lead.id ? lead : l));
  }

  function onLeadDeletedInModal(id) {
    setLeads(p => p.filter(l => l.id !== id));
    setModalLead(undefined);
  }

  const th = (col) => (
    <th
      key={col.key}
      onClick={col.sortable === false ? undefined : () => handleSort(col.key)}
      style={{
        position: "relative", padding: "8px 14px 8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted,
        textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: `1px solid ${brand.border}`,
        cursor: col.sortable === false ? "default" : "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        width: colWidths[col.key], minWidth: colWidths[col.key], maxWidth: colWidths[col.key], boxSizing: "border-box",
      }}
    >
      {col.label}{sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      <span
        onMouseDown={e => startResize(col.key, e)}
        onClick={e => e.stopPropagation()}
        style={{ position: "absolute", top: 0, right: 0, width: 6, height: "100%", cursor: "col-resize", userSelect: "none" }}
      />
    </th>
  );

  const cell = { padding: "9px 10px", borderBottom: `1px solid ${brand.border}`, fontSize: 13, color: brand.text, verticalAlign: "top", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", boxSizing: "border-box" };
  const colCell = (col) => ({ ...cell, width: colWidths[col.key], minWidth: colWidths[col.key], maxWidth: colWidths[col.key] });

  return (
    <div>
      {modalLead !== undefined && (
        <LeadModal
          lead={modalLead}
          showToast={showToast}
          existingLeads={leads}
          onClose={() => setModalLead(undefined)}
          onSaved={onLeadSaved}
          onConverted={onLeadConverted}
          onDeleted={onLeadDeletedInModal}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Leads</div>
          <div style={{ fontSize: 13, color: brand.muted }}>{leads.length} lead{leads.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input id="leads-csv-input" type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: "none" }} />
          <Btn variant="ghost" small onClick={downloadLeadsSampleCsv}>Sample CSV</Btn>
          <Btn variant="secondary" small onClick={downloadLeadsCsv}>↓ Export CSV</Btn>
          <Btn variant="secondary" small disabled={importing} onClick={() => document.getElementById("leads-csv-input").click()}>
            {importing ? "Importing…" : "Import CSV"}
          </Btn>
          <Btn variant="accent" onClick={() => setModalLead(null)}>+ New Lead</Btn>
        </div>
      </div>

      {importResult && importResult.errors.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: brand.danger }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Imported {importResult.created}, {importResult.errors.length} row(s) skipped:</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {importResult.errors.map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[
          { key: "active", label: "Active", count: leads.filter(l => l.stage !== "lost").length },
          { key: "lost", label: "Lost", count: leads.filter(l => l.stage === "lost").length },
          { key: "all", label: "All", count: leads.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="dispatch-pill" style={{
            padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${tab === t.key ? brand.blue : brand.border}`,
            background: tab === t.key ? "#e8f0fd" : "#fff", color: tab === t.key ? brand.blue : brand.muted,
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#e8f0fd", border: `1px solid ${brand.blue}`, borderRadius: 8, padding: "8px 14px", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: brand.blue }}>{selected.size} selected</span>
          <select style={{ ...inp, padding: "5px 10px" }} defaultValue="" onChange={e => { if (e.target.value) { handleBulkPriority(e.target.value); e.target.value = ""; } }}>
            <option value="" disabled>Set priority…</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <Btn small variant="danger" onClick={handleBulkDelete}>Delete Selected</Btn>
          <Btn small variant="ghost" onClick={() => setSelected(new Set())}>Clear</Btn>
        </div>
      )}

      {loading ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div style={{ color: brand.muted, padding: 40, textAlign: "center", background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 10 }}>
          No leads in this view yet.
        </div>
      ) : (
        <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflowX: "auto", overflowY: "hidden", background: brand.surface }}>
          <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                <th style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 36, minWidth: 36 }}>
                  <input type="checkbox" checked={selected.size === tabbed.length && tabbed.length > 0} onChange={toggleSelectAll} />
                </th>
                {COLUMNS.map(th)}
                <th style={{ padding: "8px 10px", borderBottom: `1px solid ${brand.border}`, width: 80, minWidth: 80 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(lead => (
                <tr key={lead.id} style={{ cursor: "pointer" }} onClick={() => setModalLead(lead)}>
                  <td style={{ ...cell, width: 36, minWidth: 36 }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                  </td>
                  <td style={colCell(COLUMNS[0])}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span className="dispatch-pill" style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLOR[lead.priority], display: "inline-block", flexShrink: 0 }} />
                      {PRIORITY_LABEL[lead.priority]}
                    </span>
                  </td>
                  <td style={{ ...colCell(COLUMNS[1]), fontWeight: 700 }} title={lead.business_name}>{lead.business_name}</td>
                  <td style={colCell(COLUMNS[2])} title={lead.industry}>{lead.industry || "—"}</td>
                  <td style={colCell(COLUMNS[3])} title={lead.area}>{lead.area || "—"}</td>
                  <td style={colCell(COLUMNS[4])} title={lead.address}>{lead.address || "—"}</td>
                  <td style={colCell(COLUMNS[5])} title={lead.phone}>{lead.phone || "—"}</td>
                  <td style={colCell(COLUMNS[6])}>
                    {lead.website ? (
                      <a href={/^https?:\/\//.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: brand.blue }}>
                        {lead.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : "—"}
                  </td>
                  <td style={colCell(COLUMNS[7])} title={lead.contact_name}>{lead.contact_name || "—"}</td>
                  <td style={colCell(COLUMNS[8])} title={lead.contact_email}>{lead.contact_email || "—"}</td>
                  <td style={colCell(COLUMNS[9])} title={lead.outreach_channel}>{lead.outreach_channel || "—"}</td>
                  <td style={colCell(COLUMNS[10])}>{fmtDate(lead.date_contacted)}</td>
                  <td style={{ ...colCell(COLUMNS[11]), color: isOverdue(lead.follow_up_date) && lead.stage !== "won" && lead.stage !== "lost" ? brand.danger : brand.text, fontWeight: isOverdue(lead.follow_up_date) ? 700 : 400 }}>
                    {fmtDate(lead.follow_up_date)}
                  </td>
                  <td style={colCell(COLUMNS[12])}>
                    <span className="dispatch-pill" style={{ background: STAGE_COLOR[lead.stage].bg, color: STAGE_COLOR[lead.stage].color, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
                      {STAGE_LABEL[lead.stage]}
                    </span>
                  </td>
                  <td style={colCell(COLUMNS[13])} title={lead.notes}>{lead.notes || "—"}</td>
                  <td style={{ ...cell, width: 80, minWidth: 80 }} onClick={e => e.stopPropagation()}>
                    <Btn small variant="danger" onClick={() => handleDelete(lead.id, lead.business_name)}>Delete</Btn>
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
