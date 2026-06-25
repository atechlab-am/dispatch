import client from "./client.js";

export const listInvoices  = (params)      => client.get("/invoices", { params }).then(r => r.data);
export const getInvoice    = (id)          => client.get(`/invoices/${id}`).then(r => r.data);
export const createInvoice = (data)        => client.post("/invoices", data).then(r => r.data);
export const updateInvoice = (id, data)    => client.put(`/invoices/${id}`, data).then(r => r.data);
export const deleteInvoice = (id)          => client.delete(`/invoices/${id}`);
