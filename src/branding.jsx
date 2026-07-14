import { createContext, useContext, useState, useEffect } from "react";
import { getBranding, updateBranding } from "./api/branding.js";

const DEFAULTS = {
  primaryColor:   "#1A5CBA",
  accentColor:    "#E8A020",
  textColor:      "#0D1B2A",
  mutedColor:     "#5B6D82",
  onColorText:    "#FFFFFF",
  companyName:    "ATech Solutions",
  tagline:        "IT Support & Managed Services",
  logoUrl:        "",       // empty = text logo
  faviconUrl:     "",       // empty = no custom favicon
  sidebarDark:    true,     // sidebar style: dark=true, light=false
};

// "modern" = the app's existing card-based look (admin-configurable colors,
// rounded corners). "office" = a fixed Microsoft/Office 365 palette matching
// LoginPage.jsx (Segoe UI, #F3F2F1 canvas, sharp corners) — a personal
// per-browser display preference, not shared company branding, so it lives in
// localStorage rather than the server-side branding table.
const THEME_STORAGE_KEY = "dispatch-theme-mode";

const OFFICE_THEME_VARS = {
  "--dispatch-bg":      "#F3F2F1",
  "--dispatch-surface": "#FFFFFF",
  "--dispatch-border":  "#E1DFDD",
  "--dispatch-primary": "#1A5CBA",
  "--dispatch-font":    "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif",
};

const MODERN_THEME_VARS = {
  "--dispatch-bg":      "#F4F7FC",
  "--dispatch-surface": "#FFFFFF",
  "--dispatch-border":  "#D8E2F0",
  "--dispatch-primary": "#1A5CBA",
  "--dispatch-font":    "'Inter', 'Segoe UI', system-ui, sans-serif",
};

export function applyThemeVars(mode) {
  const vars = mode === "office" ? OFFICE_THEME_VARS : MODERN_THEME_VARS;
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) root.setProperty(key, value);
  // Drives theme.css's [data-theme="office"] border-radius override — inline
  // styles can't be beaten by a normal stylesheet rule, so that file uses
  // !important keyed off this attribute instead of the CSS vars above.
  document.documentElement.setAttribute("data-theme", mode);
}

export function getStoredThemeMode() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "office" ? "office" : "modern";
  } catch {
    return "modern"; // localStorage unavailable (private browsing, tests, etc.)
  }
}

export function setStoredThemeMode(mode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore — falls back to session-only via React state */
  }
}

// Apply immediately at module load, same rationale as applyFontColorVars
// below: pages must never render with an undefined --dispatch-bg/surface/etc.
applyThemeVars(getStoredThemeMode());

function apiToBranding(data) {
  return {
    companyName: data.company_name,
    tagline:     data.tagline,
    primaryColor: data.primary_color,
    accentColor:  data.accent_color,
    textColor:    data.text_color,
    mutedColor:   data.muted_color,
    onColorText:  data.on_color_text,
    logoUrl:      data.logo_url,
    faviconUrl:   data.favicon_url,
    sidebarDark:  data.sidebar_dark,
  };
}

function brandingToApi(data) {
  return {
    company_name: data.companyName,
    tagline:      data.tagline,
    primary_color: data.primaryColor,
    accent_color:  data.accentColor,
    text_color:    data.textColor,
    muted_color:   data.mutedColor,
    on_color_text: data.onColorText,
    logo_url:      data.logoUrl,
    favicon_url:   data.faviconUrl,
    sidebar_dark:  data.sidebarDark,
  };
}

export function applyFavicon(url) {
  if (!url) return;
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

// Applies font colors app-wide via CSS custom properties, so the 15+ page
// components (each with their own local `brand.text`/`brand.muted` tokens)
// can read `var(--dispatch-text)` etc. without prop-drilling or a context
// dependency on every page.
export function applyFontColorVars({ textColor, mutedColor, onColorText }) {
  const root = document.documentElement.style;
  if (textColor) root.setProperty("--dispatch-text", textColor);
  if (mutedColor) root.setProperty("--dispatch-muted", mutedColor);
  if (onColorText) root.setProperty("--dispatch-on-color", onColorText);
}

// Set sane defaults immediately at module load so pages never render with an
// undefined CSS var before BrandingProvider's fetch resolves (or if a page
// renders outside the provider entirely, e.g. during tests).
applyFontColorVars(DEFAULTS);

export const BrandingContext = createContext(DEFAULTS);

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULTS);
  const [themeMode, setThemeMode] = useState(getStoredThemeMode);

  useEffect(() => {
    getBranding()
      .then(data => setBranding(apiToBranding(data)))
      .catch(() => {}); // fresh install / not-yet-configured — keep serving DEFAULTS
  }, []);

  useEffect(() => {
    applyFavicon(branding.faviconUrl);
  }, [branding.faviconUrl]);

  useEffect(() => {
    applyFontColorVars(branding);
  }, [branding.textColor, branding.mutedColor, branding.onColorText]);

  useEffect(() => {
    applyThemeVars(themeMode);
  }, [themeMode]);

  // Live preview only — does not persist. Callers that need to persist call
  // save() explicitly (see BrandingSettingsPanel.jsx's handleSave).
  const update = (data) => {
    setBranding(prev => ({ ...prev, ...data }));
  };

  const save = async (data) => {
    const saved = await updateBranding(brandingToApi(data));
    setBranding(apiToBranding(saved));
  };

  const toggleThemeMode = () => {
    setThemeMode(prev => {
      const next = prev === "office" ? "modern" : "office";
      setStoredThemeMode(next);
      return next;
    });
  };

  return (
    <BrandingContext.Provider value={{ ...branding, update, save, themeMode, toggleThemeMode }}>
      {children}
    </BrandingContext.Provider>
  );
}
