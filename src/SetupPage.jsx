import { useState } from "react";
import { completeSetup } from "./api/setup.js";

const brand = {
  blue: "var(--dispatch-primary)",
  accent: "#E8A020",
  bg: "var(--dispatch-bg)",
  surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)",
  text: "var(--dispatch-text)",
  muted: "var(--dispatch-muted)",
  danger: "#c0392b",
};

const inp = {
  width: "100%",
  padding: "10px 13px",
  border: `1px solid ${brand.border}`,
  borderRadius: "var(--dispatch-radius-md)",
  fontSize: 14,
  color: brand.text,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
    {children}
  </div>
);

export default function SetupPage({ onComplete }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.email.trim()) { setError("Email is required."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }

    setSaving(true);
    try {
      await completeSetup({ name: form.name, email: form.email, password: form.password });
      onComplete();
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Setup failed. Please try again.";
      setError(Array.isArray(msg) ? msg[0]?.msg ?? String(msg) : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", padding: 20 }}>
      <div style={{ background: brand.surface, borderRadius: "var(--dispatch-radius-lg)", border: `1px solid ${brand.border}`, padding: "40px 44px", width: "100%", maxWidth: 460, boxShadow: "0 4px 24px rgba(26,92,186,0.08)" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontWeight: 800, fontSize: 26, color: brand.blue, letterSpacing: "-0.3px", marginBottom: 6 }}>
            ATech<span style={{ color: brand.accent }}>Solutions</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: brand.text, marginBottom: 8 }}>Welcome to Dispatch</div>
          <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.5 }}>
            Create your admin account to get started.<br />
            You can add more users from Settings after login.
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <div className="dispatch-pill" style={{ width: 24, height: 24, borderRadius: "50%", background: brand.blue, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>1</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue }}>Create admin account</div>
          <div style={{ flex: 1, height: 1, background: brand.border }} />
          <div className="dispatch-pill" style={{ width: 24, height: 24, borderRadius: "50%", background: brand.border, color: brand.muted, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>2</div>
          <div style={{ fontSize: 12, color: brand.muted }}>Sign in</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Your Name</FieldLabel>
            <input
              style={inp}
              type="text"
              value={form.name}
              onChange={e => up("name", e.target.value)}
              placeholder="e.g. Anthony Martins"
              autoFocus
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Email Address</FieldLabel>
            <input
              style={inp}
              type="email"
              value={form.email}
              onChange={e => up("email", e.target.value)}
              placeholder="you@atechsolutions.org"
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Password</FieldLabel>
            <input
              style={inp}
              type="password"
              value={form.password}
              onChange={e => up("password", e.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <FieldLabel>Confirm Password</FieldLabel>
            <input
              style={inp}
              type="password"
              value={form.confirm}
              onChange={e => up("confirm", e.target.value)}
              placeholder="Repeat your password"
              required
            />
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: `1px solid ${brand.danger}`, borderRadius: "var(--dispatch-radius-md)", padding: "10px 14px", fontSize: 13, color: brand.danger, marginBottom: 18 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{ width: "100%", padding: "11px 0", background: saving ? brand.muted : brand.accent, color: "#fff", border: "none", borderRadius: "var(--dispatch-radius-md)", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
          >
            {saving ? "Creating account…" : "Create Admin Account →"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: brand.muted }}>
          This setup page is only shown once. After your account is created, it is permanently disabled.
        </div>
      </div>
    </div>
  );
}
