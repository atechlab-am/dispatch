import { useState, useEffect } from "react";
import { login, verifyLogin2fa } from "./api/auth.js";
import { setTokens } from "./api/client.js";
import { getLoginBrandingPublic } from "./api/loginBranding.js";

const DEFAULT_BRANDING = {
  company_name: "ATechSolutions",
  subtitle: "internal use only",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  text_color: "#0D1B2A",
  muted_color: "#5B6D82",
  on_color_text: "#FFFFFF",
  logo_url: "",
};

const brand = {
  bg: "#F3F2F1",
  surface: "#FFFFFF",
  border: "#D8E2F0",
  danger: "#c0392b",
};

const inp = {
  width: "100%",
  padding: "9px 11px",
  border: `1px solid ${brand.border}`,
  borderRadius: 2,
  fontSize: 15,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export default function LoginPage({ onLogin }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [step, setStep] = useState("email"); // "email" | "password" | "code"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginToken, setLoginToken] = useState(null); // set once password step passes and 2FA is required
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLoginBrandingPublic().then(setBranding).catch(() => {}); // offline/first paint — keep DEFAULT_BRANDING
  }, []);

  const text = branding.text_color || DEFAULT_BRANDING.text_color;
  const muted = branding.muted_color || DEFAULT_BRANDING.muted_color;
  const onColor = branding.on_color_text || DEFAULT_BRANDING.on_color_text;
  const companyName = branding.company_name || DEFAULT_BRANDING.company_name;
  const firstWord = companyName.split(" ")[0];
  const rest = companyName.slice(firstWord.length);

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setStep("password");
  };

  const handleUseAnotherAccount = () => {
    setStep("email");
    setPassword("");
    setError("");
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.requires_2fa) {
        setLoginToken(result.login_token);
        setStep("code");
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
    setStep("password");
  };

  const logo = branding.logo_url ? (
    <img src={branding.logo_url} alt={companyName} style={{ maxHeight: 32, maxWidth: 200, objectFit: "contain" }} />
  ) : (
    <span style={{ color: text, fontWeight: 600, fontSize: 22, letterSpacing: "-0.3px" }}>
      {firstWord}<span style={{ color: branding.primary_color }}>{rest}</span>
    </span>
  );

  return (
    <div style={{ minHeight: "100vh", background: brand.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", padding: 24 }}>
      <div style={{ background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: 2, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", padding: "44px 44px 36px", width: "100%", maxWidth: 420 }}>
        <div style={{ marginBottom: 24 }}>{logo}</div>

        {step === "email" && (
          <>
            <div style={{ fontWeight: 600, fontSize: 24, color: text, marginBottom: 24 }}>Sign in</div>
            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                autoFocus
                style={inp}
              />
              <div style={{ fontSize: 13, color: muted, marginTop: 12, marginBottom: 24 }}>
                {companyName} {branding.subtitle || DEFAULT_BRANDING.subtitle}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  style={{ padding: "9px 28px", background: branding.primary_color, color: onColor, border: "none", borderRadius: 2, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Next
                </button>
              </div>
            </form>
          </>
        )}

        {step === "password" && (
          <>
            <div style={{ fontWeight: 600, fontSize: 24, color: text, marginBottom: 8 }}>Enter password</div>
            <button type="button" onClick={handleUseAnotherAccount} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 24 }}>
              {email}
              <span style={{ textDecoration: "underline" }}>Use another account</span>
            </button>

            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoFocus
                style={inp}
              />

              {error && (
                <div style={{ background: "#fef2f2", border: `1px solid ${brand.danger}`, borderRadius: 2, padding: "10px 14px", color: brand.danger, fontSize: 13, marginTop: 16 }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: "9px 28px", background: loading ? muted : branding.primary_color, color: onColor, border: "none", borderRadius: 2, fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <div style={{ fontWeight: 600, fontSize: 24, color: text, marginBottom: 6 }}>Two-factor verification</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 24 }}>Enter the 6-digit code from your authenticator app, or a backup code.</div>

            <form onSubmit={handleCodeSubmit}>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Code"
                autoFocus
                required
                style={{ ...inp, letterSpacing: "2px", fontSize: 18, textAlign: "center" }}
              />

              {error && (
                <div style={{ background: "#fef2f2", border: `1px solid ${brand.danger}`, borderRadius: 2, padding: "10px 14px", color: brand.danger, fontSize: 13, marginTop: 16 }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
                <button
                  type="button"
                  onClick={handleBackToPassword}
                  style={{ background: "none", color: muted, border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: "9px 28px", background: loading ? muted : branding.primary_color, color: onColor, border: "none", borderRadius: 2, fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {loading ? "Verifying…" : "Verify"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
