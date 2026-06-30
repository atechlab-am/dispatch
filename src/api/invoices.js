import client from "./client.js";

export const listInvoices    = (params)         => client.get("/invoices", { params }).then(r => r.data);
export const getInvoice      = (id)             => client.get(`/invoices/${id}`).then(r => r.data);
export const createInvoice   = (data)           => client.post("/invoices", data).then(r => r.data);
export const updateInvoice   = (id, data)       => client.put(`/invoices/${id}`, data).then(r => r.data);
export const deleteInvoice   = (id)             => client.delete(`/invoices/${id}`);

export const listPayments    = (invoiceId)      => client.get(`/invoices/${invoiceId}/payments`).then(r => r.data);
export const recordPayment   = (invoiceId, data) => client.post(`/invoices/${invoiceId}/payments`, data).then(r => r.data);
export const deletePayment   = (paymentId)      => client.delete(`/invoices/payments/${paymentId}`);
export const sendInvoiceEmail = (invoiceId, data) => client.post(`/invoices/${invoiceId}/send`, data);
export const invoicePdfUrl   = (invoiceId)      => `/invoices/${invoiceId}/pdf`;
export const clientStatement = (clientId)       => client.get(`/clients/${clientId}/statement`).then(r => r.data);
