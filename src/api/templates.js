import client from "./client.js";

export const listTemplates   = ()           => client.get("/templates").then(r => r.data);
export const createTemplate  = (data)       => client.post("/templates", data).then(r => r.data);
export const updateTemplate  = (id, data)   => client.put(`/templates/${id}`, data).then(r => r.data);
export const deleteTemplate  = (id)         => client.delete(`/templates/${id}`);
