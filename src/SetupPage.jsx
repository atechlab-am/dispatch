import { useState } from "react";
import { completeSetup } from "./api/setup.js";
import { UploadButton, PRESET_PALETTES } from "./brandingUpload.jsx";

const brand = {
  blue: "var(--dispatch-primary)",
  accent: "#F59E0B",
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

const StepDot = ({ n, label, active, done }) => (
  <>
    <div className="dispatch-pill" style={{ width: 24, height: 24, borderRadius: "50%", background: active || done ? brand.blue : brand.border, color: active || done ? "#fff" : brand.muted, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
    <div style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? brand.blue : brand.muted }}>{label}</div>
  </>
);

export default function SetupPage({ onComplete }) {
  const [step, setStep] = useState(1);
  const [account, setAccount] = useState({ name: "", email: "", password: "", confirm: "" });
  const [branding, setBranding] = useState({ company_name: "", tagline: "", primary_color: "#2563EB", accent_color: "#F59E0B", logo_url: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const upAccount = (k, v) => setAccount(p => ({ ...p, [k]: v }));
  const upBranding = (k, v) => setBranding(p => ({ ...p, [k]: v }));

  const handleAccountSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!account.name.trim()) { setError("Name is required."); return; }
    if (!account.email.trim()) { setError("Email is required."); return; }
    if (account.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (account.password !== account.confirm) { setError("Passwords do not match."); return; }
    setStep(2);
  };

  const finish = async (brandingPayload) => {
    setError("");
    setSaving(true);
    try {
      await completeSetup({
        name: account.name,
        email: account.email,
        password: account.password,
        branding: brandingPayload,
      });
      onComplete();
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Setup failed. Please try again.";
      setError(Array.isArray(msg) ? msg[0]?.msg ?? String(msg) : msg);
      setSaving(false);
    }
  };

  const handleBrandingSubmit = (e) => {
    e.preventDefault();
    finish({
      company_name: branding.company_name.trim() || "Your Company",
      tagline: branding.tagline,
      primary_color: branding.primary_color,
      accent_color: branding.accent_color,
      logo_url: branding.logo_url,
    });
  };

  const handleSkipBranding = () => finish(null);

  return (
    <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", padding: 20 }}>
      <div style={{ background: brand.surface, borderRadius: "var(--dispatch-radius-lg)", border: `1px solid ${brand.border}`, padding: "40px 44px", width: "100%", maxWidth: 460, boxShadow: "0 4px 24px rgba(26,92,186,0.08)" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontWeight: 800, fontSize: 26, color: brand.blue, letterSpacing: "-0.3px", marginBottom: 6 }}>
            Your<span style={{ color: brand.accent }}>Company</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: brand.text, marginBottom: 8 }}>Welcome to Dispatch</div>
          <div style={{ fontSize: 13, color: brand.muted, lineHeight: 1.5 }}>
            {step === 1
              ? <>Create your admin account to get started.</>
              : <>Set up your company branding.<br />You can change this anytime in Settings.</>}
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <StepDot n={1} label="Admin account" active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 1, background: brand.border }} />
          <StepDot n={2} label="Branding" active={step === 2} done={false} />
        </div>

        {step === 1 && (
          <form onSubmit={handleAccountSubmit}>
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Your Name</FieldLabel>
              <input
                style={inp}
                type="text"
                value={account.name}
                onChange={e => upAccount("name", e.target.value)}
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
                value={account.email}
                onChange={e => upAccount("email", e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Password</FieldLabel>
              <input
                style={inp}
                type="password"
                value={account.password}
                onChange={e => upAccount("password", e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <FieldLabel>Confirm Password</FieldLabel>
              <input
                style={inp}
                type="password"
                value={account.confirm}
                onChange={e => upAccount("confirm", e.target.value)}
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
              style={{ width: "100%", padding: "11px 0", background: brand.accent, color: "#fff", border: "none", borderRadius: "var(--dispatch-radius-md)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
            >
              Continue →
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleBrandingSubmit}>
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Company Name</FieldLabel>
              <input
                style={inp}
                type="text"
                value={branding.company_name}
                onChange={e => upBranding("company_name", e.target.value)}
                placeholder="Your Company"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Tagline (optional)</FieldLabel>
              <input
                style={inp}
                type="text"
                value={branding.tagline}
                onChange={e => upBranding("tagline", e.target.value)}
                placeholder="e.g. IT Support & Managed Services"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Color Palette</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PRESET_PALETTES.map(p => {
                  const active = p.primary === branding.primary_color && p.accent === branding.accent_color;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setBranding(prev => ({ ...prev, primary_color: p.primary, accent_color: p.accent }))}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: "var(--dispatch-radius-md)", border: active ? `2px solid ${p.primary}` : `1px solid ${brand.border}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: brand.text }}
                    >
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.primary, display: "inline-block" }} />
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.accent, display: "inline-block" }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <FieldLabel>Logo (optional)</FieldLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {branding.logo_url && (
                  <img src={branding.logo_url} alt="Logo preview" style={{ height: 32, maxWidth: 120, objectFit: "contain", borderRadius: "var(--dispatch-radius-sm)", border: `1px solid ${brand.border}` }} />
                )}
                <UploadButton accept="image/*" label="Upload logo" onDataUrl={(url) => upBranding("logo_url", url)} />
              </div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: `1px solid ${brand.danger}`, borderRadius: "var(--dispatch-radius-md)", padding: "10px 14px", fontSize: 13, color: brand.danger, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{ width: "100%", padding: "11px 0", background: saving ? brand.muted : brand.accent, color: "#fff", border: "none", borderRadius: "var(--dispatch-radius-md)", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.15s", marginBottom: 10 }}
            >
              {saving ? "Finishing setup…" : "Finish Setup →"}
            </button>
            <button
              type="button"
              onClick={handleSkipBranding}
              disabled={saving}
              style={{ width: "100%", padding: "9px 0", background: "transparent", color: brand.muted, border: "none", fontSize: 12, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              Skip for now — use defaults
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: brand.muted }}>
          This setup page is only shown once. After your account is created, it is permanently disabled.
        </div>
      </div>
    </div>
  );
}
