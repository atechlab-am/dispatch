/**
 * New UI shell — sidebar layout, card-based design, branding-aware.
 * Receives the same props/state as the classic shell via AppShared.
 */
import { useState } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useBranding } from "./branding.jsx";
import DashboardPage from "./DashboardPage.jsx";
import ClientsPage from "./ClientsPage.jsx";
import InvoicesPage from "./InvoicesPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import DocumentsPage from "./DocumentsPage.jsx";
import ReportsPage from "./ReportsPage.jsx";
import BrandingSettingsPanel from "./BrandingSettingsPanel.jsx";
import UpdateBanner from "./UpdateBanner.jsx";

// ─── Icon set (inline SVG helpers) ───────────────────────────────────────────
const Icon = ({ d, size = 18, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    style={style}>
    <path d={d} />
  </svg>
);

const ICONS = {
  home:      "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  tickets:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 5a2 2 0 012-2h2a2 2 0 012 2",
  clients:   "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M9 11a4 4 0 100-8 4 4 0 000 8z M16 3.13a4 4 0 010 7.75",
  invoices:  "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  recurring: "M1 4v6h6 M23 20v-6h-6 M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15",
  documents: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M12 18v-6 M9 15h6",
  reports:   "M18 20V10 M12 20V4 M6 20v-6",
  settings:  "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z",
  branding:  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  logout:    "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
  newUI:     "M4 12h16 M4 6h16 M4 18h7",
};

// ─── Shared style helpers ─────────────────────────────────────────────────────
const radius = { sm: 8, md: 12, lg: 16 };

function card(extra = {}) {
  return {
    background: "#fff",
    borderRadius: radius.lg,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)",
    ...extra,
  };
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────
function NavItem({ path, label, icon, active, onClick, primary, collapsed, dark }) {
  const [hov, setHov] = useState(false);
  const fgBase  = dark ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.65)";
  const hovBg   = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const bg = active ? `${primary}20` : hov ? hovBg : "transparent";
  const fg = active ? primary : fgBase;
  return (
    <button
      onClick={() => onClick(path)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={collapsed ? label : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: collapsed ? "10px 0" : "10px 14px",
        justifyContent: collapsed ? "center" : "flex-start",
        background: bg, border: "none", borderRadius: radius.sm,
        color: fg, cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
        fontFamily: "inherit", transition: "all 0.15s",
        borderLeft: active ? `3px solid ${primary}` : "3px solid transparent",
      }}>
      <Icon d={icon} size={16} style={{ flexShrink: 0, opacity: active ? 1 : 0.8 }} />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  const colors = { ok: ["#f0fdf4", "#166534", "#4ade80"], err: ["#fef2f2", "#991b1b", "#f87171"] };
  const [bg, text, border] = colors[type] ?? colors.ok;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, background:bg, color:text, border:`1px solid ${border}`, borderRadius:radius.md, padding:"12px 20px", fontSize:13, fontWeight:600, boxShadow:"0 4px 20px rgba(0,0,0,0.12)", display:"flex", gap:12, alignItems:"center", maxWidth:360 }}>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:"none", border:"none", color:text, cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
    </div>
  );
}

// ─── New UI shell ─────────────────────────────────────────────────────────────
export default function AppNew({
  tickets, total, loadingList,
  search, setSearch,
  statusFilter, setStatus,
  quickFilter, setQuickFilter,
  assigneeFilter, setAssigneeFilter,
  users, clients, templates,
  toast, showToast,
  invoiceDraft, setInvoiceDraft,
  newModal, setNewModal,
  saving,
  handleLogin, handleLogout,
  handleNew, handleCreate, handleSave, handleSelect, handleDelete,
  handleCreateInvoiceFromTicket, handleDashboardNav, handleBoardStatusChange,
  loadList, loadClients, loadTemplates,
  user,
  onToggleUI,
  navigate,
  // child components forwarded as render props
  TicketList, TicketEditor, TicketEditorRoute, NewTicketModal, RecurringPage,
}) {
  const branding = useBranding();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [showBranding, setShowBranding] = useState(false);

  const primary    = branding.primaryColor;
  const accent     = branding.accentColor;
  const dark       = branding.sidebarDark;
  const sidebarBg  = dark ? "#0f172a" : "#f1f5f9";
  const sidebarFg  = dark ? "#ffffff"   : "#0f172a";
  const sidebarMuted = dark ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.4)";
  const sidebarBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
  const collapseBtn  = dark ? { bg: "rgba(255,255,255,0.08)", fg: "rgba(255,255,255,0.6)" }
                             : { bg: "rgba(0,0,0,0.06)",       fg: "rgba(15,23,42,0.5)" };

  const NAV = [
    { path: "/",          label: "Dashboard",  icon: ICONS.home },
    { path: "/tickets",   label: "Tickets",    icon: ICONS.tickets },
    { path: "/clients",   label: "Clients",    icon: ICONS.clients },
    { path: "/invoices",  label: "Invoices",   icon: ICONS.invoices },
    { path: "/recurring", label: "Recurring",  icon: ICONS.recurring },
    { path: "/documents", label: "Documents",  icon: ICONS.documents },
    { path: "/reports",   label: "Reports",    icon: ICONS.reports },
  ];

  const BOTTOM_NAV = [
    { path: "/settings",  label: "Settings",   icon: ICONS.settings },
  ];

  const sidebarW = collapsed ? 56 : 220;

  const pageTitle = (() => {
    if (location.pathname === "/") return "Dashboard";
    if (location.pathname.startsWith("/tickets/")) return "Ticket";
    if (location.pathname === "/tickets") return "Tickets";
    if (location.pathname === "/clients") return "Clients";
    if (location.pathname === "/invoices") return "Invoices";
    if (location.pathname === "/recurring") return "Recurring Tickets";
    if (location.pathname === "/documents") return "Documents";
    if (location.pathname === "/reports") return "Reports";
    if (location.pathname === "/settings") return "Settings";
    return "";
  })();

  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      <UpdateBanner user={user} />

      {/* ── Sidebar ── */}
      <div style={{
        width: sidebarW, flexShrink: 0,
        background: sidebarBg,
        display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh",
        transition: "width 0.2s ease",
        zIndex: 50,
      }}>
        {/* Logo area */}
        <div style={{ padding: collapsed ? "18px 0" : "20px 16px", borderBottom: `1px solid ${sidebarBorder}`, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", minHeight: 64 }}>
          {!collapsed && (
            <div>
              {branding.logoUrl
                ? <img src={branding.logoUrl} alt={branding.companyName} style={{ maxHeight: 32, maxWidth: 140, objectFit: "contain" }} />
                : (
                  <div style={{ fontWeight: 800, fontSize: 15, color: sidebarFg, letterSpacing: "-0.3px", lineHeight: 1.2 }}>
                    <span style={{ color: primary }}>{branding.companyName.split(" ")[0]}</span>
                    {branding.companyName.includes(" ") && (
                      <span style={{ color: sidebarFg }}> {branding.companyName.split(" ").slice(1).join(" ")}</span>
                    )}
                    {branding.tagline && (
                      <div style={{ fontSize: 10, fontWeight: 400, color: sidebarMuted, marginTop: 2 }}>{branding.tagline}</div>
                    )}
                  </div>
                )
              }
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={{ background: collapseBtn.bg, border: "none", color: collapseBtn.fg, cursor: "pointer", borderRadius: 6, padding: "4px 6px", display: "flex", alignItems: "center", flexShrink: 0 }}>
            <Icon d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} size={14} />
          </button>
        </div>

        {/* Main nav */}
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(n => (
            <NavItem key={n.path} {...n} active={isActive(n.path)} onClick={(p) => { navigate(p); setShowBranding(false); }} primary={accent} collapsed={collapsed} dark={dark} />
          ))}
        </nav>

        {/* Bottom nav */}
        <div style={{ padding: "8px 8px 6px", borderTop: `1px solid ${sidebarBorder}`, display: "flex", flexDirection: "column", gap: 2 }}>
          {BOTTOM_NAV.map(n => (
            <NavItem key={n.path} {...n} active={isActive(n.path)} onClick={(p) => { navigate(p); setShowBranding(false); }} primary={accent} collapsed={collapsed} dark={dark} />
          ))}
          {/* Toggle classic UI */}
          <button
            onClick={onToggleUI}
            title="Switch to Classic UI"
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: collapsed ? "10px 0" : "10px 14px", justifyContent: collapsed ? "center" : "flex-start", background: "none", border: "none", borderLeft: "3px solid transparent", borderRadius: radius.sm, color: sidebarMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", transition: "color 0.15s" }}>
            <Icon d={ICONS.newUI} size={16} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Classic UI</span>}
          </button>
          {/* User info + logout */}
          {user && (
            <div style={{ padding: collapsed ? "8px 0" : "8px 10px", marginTop: 4, borderTop: `1px solid ${sidebarBorder}` }}>
              {!collapsed && (
                <div style={{ fontSize: 11, color: sidebarMuted, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name} · {user.role}
                </div>
              )}
              <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: sidebarMuted, cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: 0, width: "100%", justifyContent: collapsed ? "center" : "flex-start" }}>
                <Icon d={ICONS.logout} size={14} />
                {!collapsed && "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 28px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{pageTitle}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {location.pathname === "/tickets" && (
              <button
                onClick={handleNew}
                style={{ background: primary, color: "#fff", border: "none", borderRadius: radius.sm, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 2px 8px ${primary}44` }}>
                + New Ticket
              </button>
            )}
            <button onClick={onToggleUI} style={{ background: `${accent}18`, border: `1px solid ${accent}55`, color: accent, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px" }}>
              ✦ NEW UI
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, padding: 28, overflowY: "auto" }}>
          <Routes>
            <Route path="/" element={
              <DashboardPage user={user} showToast={showToast} onSelectTicket={handleSelect} onNavigate={handleDashboardNav} />
            } />
            <Route path="/tickets" element={
              <TicketList
                tickets={tickets} total={total} loading={loadingList}
                onSelect={handleSelect} onNew={handleNew}
                search={search} onSearch={setSearch}
                statusFilter={statusFilter} onStatusFilter={(s) => { setStatus(s); setQuickFilter(null); }}
                quickFilter={quickFilter} onClearQuickFilter={() => setQuickFilter(null)}
                onExport={() => {}}
                users={users} assigneeFilter={assigneeFilter} onAssigneeFilter={setAssigneeFilter}
                onStatusChange={handleBoardStatusChange}
              />
            } />
            <Route path="/tickets/:ticketId" element={
              <TicketEditorRoute
                saving={saving}
                onSave={handleSave}
                onBack={() => { navigate("/tickets"); loadList(); }}
                onDelete={handleDelete}
                onCreateInvoice={handleCreateInvoiceFromTicket}
                users={users}
                currentUser={user}
                onTemplateSaved={loadTemplates}
                showToast={showToast}
              />
            } />
            <Route path="/clients"   element={<ClientsPage showToast={showToast} />} />
            <Route path="/invoices"  element={<InvoicesPage showToast={showToast} initialDraft={invoiceDraft} onDraftConsumed={() => setInvoiceDraft(null)} />} />
            <Route path="/recurring" element={<RecurringPage showToast={showToast} clients={clients} />} />
            <Route path="/documents" element={<DocumentsPage showToast={showToast} user={user} />} />
            <Route path="/reports"   element={<ReportsPage />} />
            <Route path="/settings"  element={
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 24, borderBottom: "2px solid #e2e8f0", paddingBottom: 0 }}>
                  {[
                    { id: false, label: "Users & Account" },
                    { id: true,  label: "✦ Appearance" },
                  ].map(tab => (
                    <button key={String(tab.id)} onClick={() => setShowBranding(tab.id)}
                      style={{ padding: "8px 18px", border: "none", borderBottom: `3px solid ${showBranding === tab.id ? primary : "transparent"}`, background: "none", fontWeight: showBranding === tab.id ? 700 : 500, fontSize: 13, color: showBranding === tab.id ? primary : "#64748b", cursor: "pointer", fontFamily: "inherit", marginBottom: -2, transition: "all 0.12s" }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                {showBranding
                  ? <BrandingSettingsPanel onClose={() => setShowBranding(false)} />
                  : <SettingsPage user={user} showToast={showToast} />
                }
              </div>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      {/* Modals */}
      {newModal && (
        <NewTicketModal
          onCreate={handleCreate} onCancel={() => setNewModal(false)}
          clients={clients} onClientCreated={loadClients} templates={templates}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => showToast(null)} />}
    </div>
  );
}
