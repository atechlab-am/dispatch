import client from "./client.js";

export const listQuotes   = (params)   => client.get("/quotes", { params }).then(r => r.data);
export const getQuote     = (id)       => client.get(`/quotes/${id}`).then(r => r.data);
export const createQuote  = (data)     => client.post("/quotes", data).then(r => r.data);
export const updateQuote  = (id, data) => client.put(`/quotes/${id}`, data).then(r => r.data);
export const deleteQuote  = (id)       => client.delete(`/quotes/${id}`);
export const setQuoteStatus = (id, status) => client.patch(`/quotes/${id}/status`, { status }).then(r => r.data);
export const convertQuoteToInvoice = (id) => client.post(`/quotes/${id}/convert`).then(r => r.data);
export const sendQuoteEmail = (id, data) => client.post(`/quotes/${id}/send`, data);
export const quotePdfUrl  = (id)       => `/quotes/${id}/pdf`;
