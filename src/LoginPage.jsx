import { useState, useEffect } from "react";
import { login, verifyLogin2fa } from "./api/auth.js";
import { setTokens } from "./api/client.js";
import { getLoginBrandingPublic } from "./api/loginBranding.js";

const DEFAULT_BRANDING = {
  company_name: "ATech Solutions",
  subtitle: "internal use only",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  logo_url: "",
};

const brand = {
  bg: "#F4F7FC",
  surface: "#FFFFFF",
  border: "#D8E2F0",
  text: "#0D1B2A",
  muted: "#5B6D82",
  danger: "#c0392b",
};

const inp = {
  width: "100%",
  padding: "10px 14px",
  border: `1px solid ${brand.border}`,
  borderRadius: 6,
  fontSize: 14,
  color: brand.text,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export default function LoginPage({ onLogin }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginToken, setLoginToken] = useState(null); // set once password step passes and 2FA is required
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLoginBrandingPublic().then(setBranding).catch(() => {}); // offline/first paint — keep DEFAULT_BRANDING
  }, []);

  const companyName = branding.company_name || DEFAULT_BRANDING.company_name;
  const firstWord = companyName.split(" ")[0];
  const rest = companyName.slice(firstWord.length);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.requires_2fa) {
        setLoginToken(result.login_token);
      } else {
        setTokens(result.access_token, result.refresh_token);
        onLogin();
      }
    } catch {
      setError("Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await verifyLogin2fa(loginToken, code.trim());
      setTokens(tokens.access_token, tokens.refresh_token);
      onLogin();
    } catch {
      setError("Invalid authentication code.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPassword = () => {
    setLoginToken(null);
    setCode("");
    setError("");
  };

  return (
    <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {/* Nav */}
      <div style={{ background: branding.primary_color, padding: "0 28px", height: 54, display: "flex", alignItems: "center" }}>
        {branding.logo_url ? (
          <img src={branding.logo_url} alt={companyName} style={{ maxHeight: 32, maxWidth: 180, objectFit: "contain" }} />
        ) : (
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px" }}>
            {firstWord}<span style={{ color: branding.accent_color }}>{rest}</span>
          </span>
        )}
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, margin: "0 10px" }}>|</span>
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500 }}>Ticket Manager</span>
      </div>

      {/* Card */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 12, padding: "36px 40px", width: "100%", maxWidth: 400 }}>
          {!loginToken ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 6 }}>Sign in</div>
              <div style={{ fontSize: 13, color: brand.muted, marginBottom: 28 }}>{companyName} {branding.subtitle || DEFAULT_BRANDING.subtitle}</div>

              <form onSubmit={handlePasswordSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Email</div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@atechsolutions.org"
                    required
                    style={inp}
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Password</div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={inp}
                  />
                </div>

                {error && (
                  <div style={{ background: "#fef2f2", border: `1px solid ${brand.danger}`, borderRadius: 6, padding: "10px 14px", color: brand.danger, fontSize: 13, marginBottom: 16 }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: "100%", padding: "11px", background: loading ? brand.muted : branding.accent_color, color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 6 }}>Two-Factor Verification</div>
              <div style={{ fontSize: 13, color: brand.muted, marginBottom: 28 }}>Enter the 6-digit code from your authenticator app, or a backup code.</div>

              <form onSubmit={handleCodeSubmit}>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>Authentication Code</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    autoFocus
                    required
                    style={{ ...inp, letterSpacing: "2px", fontSize: 18, textAlign: "center" }}
                  />
                </div>

                {error && (
                  <div style={{ background: "#fef2f2", border: `1px solid ${brand.danger}`, borderRadius: 6, padding: "10px 14px", color: brand.danger, fontSize: 13, marginBottom: 16 }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: "100%", padding: "11px", background: loading ? brand.muted : branding.accent_color, color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginBottom: 10 }}
                >
                  {loading ? "Verifying…" : "Verify"}
                </button>
                <button
                  type="button"
                  onClick={handleBackToPassword}
                  style={{ width: "100%", padding: "9px", background: "none", color: brand.muted, border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >
                  ← Back
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
