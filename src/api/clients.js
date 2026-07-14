import client from "./client.js";

export const listClients  = ()         => client.get("/clients").then(r => r.data);
export const getClient    = (id)       => client.get(`/clients/${id}`).then(r => r.data);
export const createClient = (data)     => client.post("/clients", data).then(r => r.data);
export const updateClient = (id, data) => client.put(`/clients/${id}`, data).then(r => r.data);
export const deleteClient = (id)       => client.delete(`/clients/${id}`);
export const getCompanySummary = (company) => client.get("/clients/company-summary", { params: { company } }).then(r => r.data);
