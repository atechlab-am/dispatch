import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  getClientBySlug, portalLogin, portalLogout, portalMe, portalChangePassword,
  listMyTickets, getMyTicket, submitTicket,
  listMyInvoices, getMyInvoice, portalInvoicePdfUrl,
} from "./api.js";
import { setTokens, clearTokens, hasStoredSession, registerLogoutHandler, openPdfWithAuth } from "./client.js";

// ─── Brand ───────────────────────────────────────────────────────────────────

const brand = {
  primary: "#1A5CBA",
  accent: "#E8A020",
  muted: "#64748b",
  bg: "#f1f5f9",
  white: "#fff",
  border: "#e2e8f0",
  text: "#0f172a",
};

const STATUS_COLORS = {
  "Open":             { bg: "#dbeafe", color: "#1d4ed8" },
  "In Progress":      { bg: "#fef9c3", color: "#854d0e" },
  "Awaiting Client":  { bg: "#fce7f3", color: "#9d174d" },
  "On Hold":          { bg: "#fef3c7", color: "#92400e" },
  "Resolved":         { bg: "#dcfce7", color: "#166534" },
  "Closed":           { bg: "#f1f5f9", color: "#475569" },
};

const PRIORITY_COLORS = {
  "Urgent": { bg: "#fee2e2", color: "#991b1b" },
  "High":   { bg: "#ffedd5", color: "#9a3412" },
  "Medium": { bg: "#fef9c3", color: "#854d0e" },
  "Low":    { bg: "#f0fdf4", color: "#166534" },
};

const INVOICE_STATUS_COLORS = {
  "Draft": { bg: "#f1f5f9", color: "#475569" },
  "Sent":  { bg: "#dbeafe", color: "#1d4ed8" },
  "Paid":  { bg: "#dcfce7", color: "#166534" },
  "Void":  { bg: "#fee2e2", color: "#991b1b" },
};

// ─── Shared UI ───────────────────────────────────────────────────────────────

function Badge({ label, colorMap }) {
  const s = colorMap?.[label] || { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
      background: s.bg, color: s.color,
    }}>{label}</span>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: `3px solid ${brand.border}`,
        borderTopColor: brand.primary,
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "error" ? "#fee2e2" : "#dcfce7";
  const color = type === "error" ? "#991b1b" : "#166534";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: bg, color, padding: "12px 20px", borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)", fontSize: 14, fontWeight: 500,
      maxWidth: 360,
    }}>
      {message}
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────

function LoginPage({ slug, onLogin }) {
  const [clientInfo, setClientInfo] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getClientBySlug(slug)
      .then(setClientInfo)
      .catch(() => setNotFound(true));
  }, [slug]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await portalLogin({ email, password, slug });
      setTokens(data.access_token, data.refresh_token);
      const me = await portalMe();
      onLogin(me);
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (notFound) {
    return (
      <div style={{
        minHeight: "100vh", background: brand.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', Arial, sans-serif",
      }}>
        <div style={{ textAlign: "center", color: brand.muted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
          <div style={{ fontSize: 16 }}>Portal not found</div>
        </div>
      </div>
    );
  }

  if (!clientInfo) {
    return (
      <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: brand.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', Arial, sans-serif",
    }}>
      <div style={{
        background: brand.white, borderRadius: 16, padding: "48px 40px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)", width: "100%", maxWidth: 420,
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: brand.primary, letterSpacing: -0.5 }}>
            ATech<span style={{ color: brand.accent }}>Solutions</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: brand.text, marginTop: 12 }}>
            {clientInfo.name}
          </div>
          <div style={{ fontSize: 13, color: brand.muted, marginTop: 4 }}>Client Portal</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: brand.text, marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: `1.5px solid ${brand.border}`, fontSize: 14, outline: "none",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: brand.text, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: `1.5px solid ${brand.border}`, fontSize: 14, outline: "none",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          {error && (
            <div style={{
              background: "#fee2e2", color: "#991b1b", borderRadius: 8,
              padding: "10px 14px", fontSize: 13, marginBottom: 16,
            }}>{error}</div>
          )}
          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px", borderRadius: 8, border: "none",
            background: loading ? "#93a3b8" : brand.primary, color: brand.white,
            fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Change Password Page ─────────────────────────────────────────────────────

function ChangePasswordPage({ user, onChanged, onSkip, forced, showToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("Passwords do not match."); return; }
    if (next.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      const updated = await portalChangePassword({ current_password: current, new_password: next });
      showToast("Password changed successfully.", "success");
      onChanged(updated);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to change password.");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: `1.5px solid ${brand.border}`, fontSize: 14, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: brand.text, marginBottom: 6 };

  return (
    <div style={{
      minHeight: "100vh", background: brand.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', Arial, sans-serif",
    }}>
      <div style={{
        background: brand.white, borderRadius: 16, padding: "48px 40px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)", width: "100%", maxWidth: 420,
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: brand.primary, letterSpacing: -0.5 }}>
            ATech<span style={{ color: brand.accent }}>Solutions</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: brand.text, marginTop: 12 }}>
            {forced ? "Set Your Password" : "Change Password"}
          </div>
          {forced && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 8,
              background: "#fef9c3", color: "#854d0e", fontSize: 13,
            }}>
              You must set a new password before continuing.
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Current Password</label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoFocus style={fieldStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>New Password</label>
            <input type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={8} style={fieldStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Confirm New Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={fieldStyle} />
          </div>

          {error && (
            <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} style={{
            width: "100%", padding: 12, borderRadius: 8, border: "none",
            background: saving ? "#93a3b8" : brand.primary, color: brand.white,
            fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}>
            {saving ? "Saving…" : "Set New Password"}
          </button>

          {!forced && onSkip && (
            <button type="button" onClick={onSkip} style={{
              width: "100%", marginTop: 12, padding: 10, borderRadius: 8,
              border: `1.5px solid ${brand.border}`, background: "transparent",
              color: brand.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            }}>
              Cancel
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({ user, slug, onLogout, onChangePassword, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/p/${slug}`;

  const navItems = [
    { path: `${base}/tickets`, label: "My Tickets" },
    { path: `${base}/invoices`, label: "My Invoices" },
  ];

  const btnStyle = {
    background: "rgba(255,255,255,0.15)", border: "none", color: brand.white,
    padding: "6px 14px", borderRadius: 6, fontSize: 13,
    cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ minHeight: "100vh", background: brand.bg, fontFamily: "'Inter', Arial, sans-serif" }}>
      <header style={{
        background: brand.primary, color: brand.white,
        padding: "0 32px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div
            onClick={() => navigate(`${base}/tickets`)}
            style={{ fontSize: 20, fontWeight: 800, cursor: "pointer", letterSpacing: -0.5 }}
          >
            ATech<span style={{ color: brand.accent }}>Solutions</span>
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.75, marginLeft: 10 }}>Client Portal</span>
          </div>
          <nav style={{ display: "flex", gap: 4 }}>
            {navItems.map(({ path, label }) => {
              const active = location.pathname.startsWith(path);
              return (
                <button key={path} onClick={() => navigate(path)} style={{
                  background: active ? "rgba(255,255,255,0.18)" : "transparent",
                  border: "none", color: brand.white,
                  padding: "6px 16px", borderRadius: 6, fontSize: 14,
                  fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{user.name}</span>
          <button onClick={onChangePassword} style={btnStyle}>Change Password</button>
          <button onClick={onLogout} style={btnStyle}>Sign Out</button>
        </div>
      </header>
      <main style={{ padding: "32px", maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}

// ─── Tickets List ─────────────────────────────────────────────────────────────

function TicketsPage({ slug, showToast }) {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    listMyTickets().then(setTickets).catch(() => showToast("Failed to load tickets", "error"));
  }, []);

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: brand.text, margin: 0 }}>My Tickets</h1>
        <button
          onClick={() => setShowForm(true)}
          style={{
            background: brand.primary, color: brand.white, border: "none",
            padding: "9px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + New Request
        </button>
      </div>

      {showForm && (
        <NewTicketForm
          onClose={() => setShowForm(false)}
          onCreated={(t) => {
            setTickets(prev => [t, ...(prev || [])]);
            setShowForm(false);
            showToast("Request submitted successfully", "success");
          }}
          showToast={showToast}
        />
      )}

      {tickets === null ? <Spinner /> : tickets.length === 0 ? (
        <div style={{
          background: brand.white, borderRadius: 12, padding: 48,
          textAlign: "center", color: brand.muted, fontSize: 14,
          border: `1px solid ${brand.border}`,
        }}>
          No tickets yet. Submit a new request to get started.
        </div>
      ) : (
        <div style={{ background: brand.white, borderRadius: 12, border: `1px solid ${brand.border}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${brand.border}`, background: "#f8fafc" }}>
                {["Ticket #", "Title", "Type", "Status", "Priority", "Opened"].map(h => (
                  <th key={h} style={{
                    padding: "12px 16px", textAlign: "left", fontSize: 11,
                    fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: 0.4,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/p/${slug}/tickets/${t.id}`)}
                  style={{
                    borderBottom: i < tickets.length - 1 ? `1px solid ${brand.border}` : "none",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: brand.primary }}>{t.id}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: brand.text, maxWidth: 320 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: brand.muted }}>{t.ticket_type}</td>
                  <td style={{ padding: "14px 16px" }}><Badge label={t.status} colorMap={STATUS_COLORS} /></td>
                  <td style={{ padding: "14px 16px" }}><Badge label={t.priority} colorMap={PRIORITY_COLORS} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: brand.muted }}>{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── New Ticket Form ──────────────────────────────────────────────────────────

function NewTicketForm({ onClose, onCreated, showToast }) {
  const [form, setForm] = useState({ ticket_type: "Incident", priority: "Medium", title: "", description: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const ticket = await submitTicket(form);
      onCreated(ticket);
    } catch {
      showToast("Failed to submit request", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1.5px solid ${brand.border}`, fontSize: 14,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: brand.text, marginBottom: 6 };

  return (
    <div style={{
      background: brand.white, borderRadius: 12, border: `1px solid ${brand.border}`,
      padding: 28, marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: brand.text, margin: 0 }}>Submit a New Request</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: brand.muted }}>×</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Request Type</label>
            <select value={form.ticket_type} onChange={e => setForm(f => ({ ...f, ticket_type: e.target.value }))} style={inputStyle}>
              <option>Incident</option>
              <option>Request</option>
              <option>Change Request</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inputStyle}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Subject *</label>
          <input
            type="text" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required maxLength={500} placeholder="Brief description of the issue or request"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={5} maxLength={20000}
            placeholder="Provide as much detail as possible…"
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{
            padding: "9px 20px", borderRadius: 8, border: `1.5px solid ${brand.border}`,
            background: brand.white, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button type="submit" disabled={saving || !form.title.trim()} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: saving || !form.title.trim() ? "#93a3b8" : brand.primary,
            color: brand.white, fontSize: 14, fontWeight: 600,
            cursor: saving || !form.title.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}>
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Ticket Detail ────────────────────────────────────────────────────────────

function TicketDetailPage({ slug, showToast }) {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyTicket(ticketId)
      .then(setTicket)
      .catch(() => {
        showToast("Ticket not found", "error");
        navigate(`/p/${slug}/tickets`, { replace: true });
      })
      .finally(() => setLoading(false));
  }, [ticketId]);

  function formatDate(iso) {
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  if (loading) return <Spinner />;
  if (!ticket) return null;

  return (
    <div>
      <button
        onClick={() => navigate(`/p/${slug}/tickets`)}
        style={{
          background: "none", border: "none", color: brand.primary,
          fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          marginBottom: 20, padding: 0,
        }}
      >
        ← Back to Tickets
      </button>

      <div style={{ background: brand.white, borderRadius: 12, border: `1px solid ${brand.border}`, overflow: "hidden" }}>
        <div style={{ background: brand.primary, padding: "20px 28px", color: brand.white }}>
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>{ticket.id}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{ticket.title}</div>
        </div>
        <div style={{ padding: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Status</div>
              <Badge label={ticket.status} colorMap={STATUS_COLORS} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Priority</div>
              <Badge label={ticket.priority} colorMap={PRIORITY_COLORS} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Type</div>
              <div style={{ fontSize: 14, color: brand.text }}>{ticket.ticket_type}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            {[["Opened", ticket.created_at], ["Last Updated", ticket.updated_at]].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, color: brand.text }}>{formatDate(val)}</div>
              </div>
            ))}
          </div>
          {ticket.description && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Description</div>
              <div style={{
                background: "#f8fafc", borderRadius: 8, padding: 16,
                fontSize: 14, color: brand.text, lineHeight: 1.6,
                whiteSpace: "pre-wrap", border: `1px solid ${brand.border}`,
              }}>{ticket.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Invoices List ────────────────────────────────────────────────────────────

function InvoicesPage({ slug, showToast }) {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState(null);

  useEffect(() => {
    listMyInvoices().then(setInvoices).catch(() => showToast("Failed to load invoices", "error"));
  }, []);

  function formatDate(d) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: brand.text, marginBottom: 24 }}>My Invoices</h1>

      {invoices === null ? <Spinner /> : invoices.length === 0 ? (
        <div style={{
          background: brand.white, borderRadius: 12, padding: 48,
          textAlign: "center", color: brand.muted, fontSize: 14,
          border: `1px solid ${brand.border}`,
        }}>
          No invoices yet.
        </div>
      ) : (
        <div style={{ background: brand.white, borderRadius: 12, border: `1px solid ${brand.border}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${brand.border}`, background: "#f8fafc" }}>
                {["Invoice #", "Date", "Status", "Total", "Paid", "Balance", ""].map((h, i) => (
                  <th key={i} style={{
                    padding: "12px 16px",
                    textAlign: h === "Total" || h === "Paid" || h === "Balance" ? "right" : "left",
                    fontSize: 11, fontWeight: 700, color: brand.muted,
                    textTransform: "uppercase", letterSpacing: 0.4,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr
                  key={inv.id}
                  style={{ borderBottom: i < invoices.length - 1 ? `1px solid ${brand.border}` : "none", cursor: "pointer" }}
                  onClick={() => navigate(`/p/${slug}/invoices/${inv.id}`)}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: brand.primary }}>{inv.id}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, color: brand.muted }}>{formatDate(inv.issue_date)}</td>
                  <td style={{ padding: "14px 16px" }}><Badge label={inv.status} colorMap={INVOICE_STATUS_COLORS} /></td>
                  <td style={{ padding: "14px 16px", fontSize: 13, textAlign: "right" }}>${inv.total.toFixed(2)}</td>
                  <td style={{ padding: "14px 16px", fontSize: 13, textAlign: "right", color: "#059669" }}>
                    {inv.amount_paid > 0 ? `$${inv.amount_paid.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: 13, textAlign: "right", fontWeight: inv.balance > 0 ? 700 : 400 }}>
                    ${inv.balance.toFixed(2)}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      onClick={e => { e.stopPropagation(); openPdfWithAuth(portalInvoicePdfUrl(inv.id)); }}
                      style={{
                        background: brand.primary, color: brand.white, border: "none",
                        padding: "5px 12px", borderRadius: 6, fontSize: 12,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      ⬇ PDF
                    </button>
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

// ─── Invoice Detail ───────────────────────────────────────────────────────────

function InvoiceDetailPage({ slug, showToast }) {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyInvoice(invoiceId)
      .then(setInvoice)
      .catch(() => {
        showToast("Invoice not found", "error");
        navigate(`/p/${slug}/invoices`, { replace: true });
      })
      .finally(() => setLoading(false));
  }, [invoiceId]);

  function formatDate(d) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  }

  if (loading) return <Spinner />;
  if (!invoice) return null;

  return (
    <div>
      <button
        onClick={() => navigate(`/p/${slug}/invoices`)}
        style={{
          background: "none", border: "none", color: brand.primary,
          fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          marginBottom: 20, padding: 0,
        }}
      >
        ← Back to Invoices
      </button>

      <div style={{ background: brand.white, borderRadius: 12, border: `1px solid ${brand.border}`, overflow: "hidden" }}>
        <div style={{
          background: brand.primary, padding: "20px 28px", color: brand.white,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{invoice.id}</div>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>Issued {formatDate(invoice.issue_date)}</div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Badge label={invoice.status} colorMap={INVOICE_STATUS_COLORS} />
            <button
              onClick={() => openPdfWithAuth(portalInvoicePdfUrl(invoice.id))}
              style={{
                background: brand.accent, color: brand.white, border: "none",
                padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ⬇ Download PDF
            </button>
          </div>
        </div>
        <div style={{ padding: 28 }}>
          {invoice.lines.length > 0 && (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${brand.border}`, background: "#f8fafc" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, color: brand.muted, textTransform: "uppercase" }}>Description</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, color: brand.muted, textTransform: "uppercase" }}>Qty</th>
                    <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, color: brand.muted, textTransform: "uppercase" }}>Unit Price</th>
                    <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, color: brand.muted, textTransform: "uppercase" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${brand.border}` }}>
                      <td style={{ padding: "10px 12px", fontSize: 13 }}>{l.description}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "center" }}>{l.qty}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>${l.unit_price.toFixed(2)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>${l.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <table style={{ width: 260 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "4px 12px", fontSize: 13, color: brand.muted }}>Subtotal</td>
                      <td style={{ padding: "4px 12px", fontSize: 13, textAlign: "right" }}>${invoice.subtotal.toFixed(2)}</td>
                    </tr>
                    {invoice.tax_rate > 0 && (
                      <tr>
                        <td style={{ padding: "4px 12px", fontSize: 13, color: brand.muted }}>Tax ({(invoice.tax_rate * 100).toFixed(3)}%)</td>
                        <td style={{ padding: "4px 12px", fontSize: 13, textAlign: "right" }}>${invoice.tax_amount.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr style={{ borderTop: `2px solid ${brand.text}` }}>
                      <td style={{ padding: "8px 12px", fontSize: 15, fontWeight: 700 }}>Total</td>
                      <td style={{ padding: "8px 12px", fontSize: 15, fontWeight: 700, textAlign: "right" }}>${invoice.total.toFixed(2)}</td>
                    </tr>
                    {invoice.amount_paid > 0 && (
                      <>
                        <tr>
                          <td style={{ padding: "4px 12px", fontSize: 13, color: "#059669" }}>Paid</td>
                          <td style={{ padding: "4px 12px", fontSize: 13, textAlign: "right", color: "#059669" }}>-${invoice.amount_paid.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "4px 12px", fontSize: 14, fontWeight: 700 }}>Balance Due</td>
                          <td style={{ padding: "4px 12px", fontSize: 14, fontWeight: 700, textAlign: "right" }}>${invoice.balance.toFixed(2)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {invoice.notes && (
            <div style={{
              marginTop: 24, background: "#f8fafc", borderRadius: 8, padding: 16,
              fontSize: 13, color: brand.text, whiteSpace: "pre-wrap",
              borderLeft: `3px solid ${brand.primary}`,
            }}>{invoice.notes}</div>
          )}
          {invoice.due_date && (
            <div style={{ marginTop: 16, fontSize: 13, color: brand.muted }}>
              Due: <strong style={{ color: brand.text }}>{formatDate(invoice.due_date)}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Slug-scoped portal wrapper ───────────────────────────────────────────────

function SlugPortal() {
  const { slug } = useParams();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const INACTIVITY_MS = 30 * 60 * 1000;

  const showToast = useCallback((message, type = "success") => setToast({ message, type }), []);

  const handleLogout = useCallback(() => {
    portalLogout().catch(() => {});
    clearTokens();
    setUser(null);
    setChangingPassword(false);
  }, []);

  useEffect(() => {
    registerLogoutHandler(handleLogout);
    if (!hasStoredSession()) { setChecking(false); return; }
    Promise.all([portalMe(), getClientBySlug(slug)])
      .then(([me, clientInfo]) => {
        const allowed = clientInfo.member_ids?.length ? clientInfo.member_ids : [clientInfo.id];
        if (!allowed.includes(me.client_id)) {
          clearTokens();
          setChecking(false);
          return;
        }
        setUser(me);
        setChecking(false);
      })
      .catch(() => { clearTokens(); setChecking(false); });
  }, [slug]);

  useEffect(() => {
    if (!user) return;
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
  }, [user, handleLogout]);

  if (checking) return (
    <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner />
    </div>
  );

  if (!user) return (
    <>
      <LoginPage slug={slug} onLogin={me => {
        setUser(me);
        // must_change_password is handled below — no navigate here, let the render decide
        if (!me.must_change_password) navigate(`/p/${slug}/tickets`, { replace: true });
      }} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );

  // Force password change on first login or after admin reset
  if (user.must_change_password || changingPassword) {
    return (
      <>
        <ChangePasswordPage
          user={user}
          forced={user.must_change_password}
          showToast={showToast}
          onChanged={updated => {
            setUser(updated);
            setChangingPassword(false);
            navigate(`/p/${slug}/tickets`, { replace: true });
          }}
          onSkip={user.must_change_password ? null : () => setChangingPassword(false)}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </>
    );
  }

  return (
    <>
      <Shell user={user} slug={slug} onLogout={handleLogout} onChangePassword={() => setChangingPassword(true)}>
        <Routes>
          <Route path="tickets" element={<TicketsPage slug={slug} showToast={showToast} />} />
          <Route path="tickets/:ticketId" element={<TicketDetailPage slug={slug} showToast={showToast} />} />
          <Route path="invoices" element={<InvoicesPage slug={slug} showToast={showToast} />} />
          <Route path="invoices/:invoiceId" element={<InvoiceDetailPage slug={slug} showToast={showToast} />} />
          <Route path="*" element={<Navigate to={`/p/${slug}/tickets`} replace />} />
        </Routes>
      </Shell>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function PortalApp() {
  return (
    <Routes>
      <Route path="/p/:slug/*" element={<SlugPortal />} />
      <Route path="*" element={
        <div style={{
          minHeight: "100vh", background: brand.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Inter', Arial, sans-serif", color: brand.muted, fontSize: 16,
        }}>
          Portal not found
        </div>
      } />
    </Routes>
  );
}
