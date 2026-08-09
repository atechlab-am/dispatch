import client from "./client.js";

export const getBranding    = ()     => client.get("/branding").then(r => r.data);
export const updateBranding = (data) => client.put("/branding", data).then(r => r.data);
