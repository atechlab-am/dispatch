import client from "./client.js";

export const listRecurringInvoices   = ()          => client.get("/recurring-invoices").then(r => r.data);
export const getRecurringInvoice     = (id)        => client.get(`/recurring-invoices/${id}`).then(r => r.data);
export const createRecurringInvoice  = (data)      => client.post("/recurring-invoices", data).then(r => r.data);
export const updateRecurringInvoice  = (id, data)  => client.put(`/recurring-invoices/${id}`, data).then(r => r.data);
export const deleteRecurringInvoice  = (id)        => client.delete(`/recurring-invoices/${id}`);
