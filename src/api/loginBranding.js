import client from "./client.js";

export const getLoginBrandingPublic = () => client.get("/login-branding/public").then(r => r.data);
export const getLoginBranding       = () => client.get("/login-branding").then(r => r.data);
export const updateLoginBranding    = (data) => client.put("/login-branding", data).then(r => r.data);
