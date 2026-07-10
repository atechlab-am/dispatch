import client from "./client.js";

export const getPortalBrandingPublic = () => client.get("/portal-branding/public").then(r => r.data);
export const getPortalBranding       = () => client.get("/portal-branding").then(r => r.data);
export const updatePortalBranding    = (data) => client.put("/portal-branding", data).then(r => r.data);
