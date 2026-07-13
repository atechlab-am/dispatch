import client from "./client.js";

export const getDocumentBranding    = () => client.get("/document-branding").then(r => r.data);
export const updateDocumentBranding = (data) => client.put("/document-branding", data).then(r => r.data);
