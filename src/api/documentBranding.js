import client from "./client.js";

export const getDocumentBranding    = () => client.get("/document-branding").then(r => r.data);
export const updateDocumentBranding = (data) => client.put("/document-branding", data).then(r => r.data);
export const getTemplatePlaceholders = () => client.get("/document-branding/placeholders").then(r => r.data);
export const previewInvoiceTemplate = (template) => client.post("/document-branding/preview/invoice", { template }).then(r => r.data);
export const previewQuoteTemplate   = (template) => client.post("/document-branding/preview/quote", { template }).then(r => r.data);
