import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listProjects, createProject } from "./api/projects.js";

const brand = {
  blue: "var(--dispatch-primary)", accent: "#E8A020", bg: "var(--dispatch-bg)", surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)", text: "var(--dispatch-text)", muted: "var(--dispatch-muted)",
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
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
};

const STAGE_COLORS = {
  Quote:   { bg: "#f0f0f0", color: brand.muted },
  Ticket:  { bg: "#dbeafe", color: "#1d4ed8" },
  Invoice: { bg: "#d1fae5", color: "#065f46" },
};

function fmtDateTime(d) { return d ? new Date(d).toLocaleDateString() : "—"; }

// ─── New Project modal ─────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated, showToast }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const result = await createProject(name.trim());
      onCreated(result);
    } catch {
      showToast("Failed to create project.", "err");
      setCreating(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 12, padding: 28, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>New Project</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: brand.muted }}>×</button>
        </div>
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Project Name</FieldLabel>
          <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office Network Upgrade" autoFocus required />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={creating || !name.trim()}>{creating ? "Creating…" : "Create"}</Btn>
        </div>
      </form>
    </div>
  );
}

// ─── Project list (routed: /projects) ─────────────────────────────────────────
export default function ProjectsPage({ showToast }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjects({ page, page_size: PAGE_SIZE });
      setProjects(data.items);
      setTotal(data.total);
    } catch { showToast("Failed to load projects.", "err"); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (result) => {
    setShowNew(false);
    showToast("Project created.", "ok");
    navigate(`/quotes/${result.quote_id}`);
  };

  const cell = { padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={handleCreated} showToast={showToast} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Projects</div>
          <div style={{ fontSize: 13, color: brand.muted }}>{total} project{total !== 1 ? "s" : ""}</div>
        </div>
        <Btn variant="accent" onClick={() => setShowNew(true)}>+ New Project</Btn>
      </div>

      {loading ? (
        <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
      ) : (
        <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: brand.bg }}>
                {["Project", "Quote", "Ticket", "Invoice", "Stage", "Created"].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr><td colSpan={6} style={{ ...cell, textAlign: "center", color: brand.muted, padding: 40 }}>
                  No projects yet. Click "+ New Project" to start one.
                </td></tr>
              )}
              {projects.map(p => {
                const sc = STAGE_COLORS[p.stage] || STAGE_COLORS.Quote;
                return (
                  <tr key={p.id}>
                    <td style={{ ...cell, fontWeight: 700, color: brand.text }}>{p.name}</td>
                    <td style={cell}>
                      {p.quote_id
                        ? <a href={`/quotes/${p.quote_id}`} onClick={e => { e.preventDefault(); navigate(`/quotes/${p.quote_id}`); }} style={{ color: brand.blue, fontWeight: 600, textDecoration: "none" }}>{p.quote_status}</a>
                        : <span style={{ color: brand.muted }}>—</span>}
                    </td>
                    <td style={cell}>
                      {p.ticket_id
                        ? <a href={`/tickets/${p.ticket_id}`} onClick={e => { e.preventDefault(); navigate(`/tickets/${p.ticket_id}`); }} style={{ color: brand.blue, fontWeight: 600, textDecoration: "none" }}>{p.ticket_status}</a>
                        : <span style={{ color: brand.muted }}>—</span>}
                    </td>
                    <td style={cell}>
                      {p.invoice_id
                        ? <a href={`/invoices/${p.invoice_id}`} onClick={e => { e.preventDefault(); navigate(`/invoices/${p.invoice_id}`); }} style={{ color: brand.blue, fontWeight: 600, textDecoration: "none" }}>{p.invoice_status}</a>
                        : <span style={{ color: brand.muted }}>—</span>}
                    </td>
                    <td style={cell}>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{p.stage}</span>
                    </td>
                    <td style={{ ...cell, color: brand.muted, fontSize: 13 }}>{fmtDateTime(p.created_at)}</td>
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
