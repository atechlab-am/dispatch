import client from "./client.js";

export const getClientBySlug   = (slug)  => client.get(`/portal/slug/${slug}`).then(r => r.data);
export const portalLogin        = (data)  => client.post("/portal/auth/login", data).then(r => r.data);
export const portalRefresh      = (data)  => client.post("/portal/auth/refresh", data).then(r => r.data);
export const portalLogout       = ()      => client.post("/portal/auth/logout");
export const portalMe           = ()      => client.get("/portal/auth/me").then(r => r.data);
export const portalChangePassword = (data) => client.post("/portal/auth/change-password", data).then(r => r.data);

export const listMyTickets      = ()      => client.get("/portal/tickets").then(r => r.data);
export const getMyTicket        = (id)    => client.get(`/portal/tickets/${id}`).then(r => r.data);
export const submitTicket       = (data)  => client.post("/portal/tickets", data).then(r => r.data);

export const listMyInvoices     = ()      => client.get("/portal/invoices").then(r => r.data);
export const getMyInvoice       = (id)    => client.get(`/portal/invoices/${id}`).then(r => r.data);
export const portalInvoicePdfUrl = (id)  => `/portal/invoices/${id}/pdf`;
export const createCheckoutSession = (id) => client.post(`/portal/invoices/${id}/checkout`).then(r => r.data);
