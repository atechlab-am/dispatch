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

  // Live preview only — does not persist. Callers that need to persist call
  // save() explicitly (see BrandingSettingsPanel.jsx's handleSave).
  const update = (data) => {
    setBranding(prev => ({ ...prev, ...data }));
  };

  const save = async (data) => {
    const saved = await updateBranding(brandingToApi(data));
    setBranding(apiToBranding(saved));
  };

  return (
    <BrandingContext.Provider value={{ ...branding, update, save }}>
      {children}
    </BrandingContext.Provider>
  );
}
