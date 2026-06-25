import { createContext, useContext, useState, useEffect } from "react";

const STORAGE_KEY = "dispatch_branding";

const DEFAULTS = {
  primaryColor:   "#1A5CBA",
  accentColor:    "#E8A020",
  companyName:    "ATech Solutions",
  tagline:        "IT Support & Managed Services",
  logoUrl:        "",       // empty = text logo
  faviconUrl:     "",       // empty = no custom favicon
  sidebarDark:    true,     // sidebar style: dark=true, light=false
};

export function loadBranding() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export function saveBranding(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  applyFavicon(data.faviconUrl);
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

export const BrandingContext = createContext(DEFAULTS);

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(loadBranding);

  useEffect(() => {
    applyFavicon(branding.faviconUrl);
  }, [branding.faviconUrl]);

  const update = (data) => {
    const next = { ...branding, ...data };
    setBranding(next);
    saveBranding(next);
  };

  return (
    <BrandingContext.Provider value={{ ...branding, update }}>
      {children}
    </BrandingContext.Provider>
  );
}
