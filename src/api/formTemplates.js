import client from "./client.js";

// ─── Templates ────────────────────────────────────────────────────────────────
export const listFormTemplates = (params = {}) =>
  client.get("/form-templates", { params }).then(r => r.data);

export const createFormTemplate = (data) =>
  client.post("/form-templates", data).then(r => r.data);

export const getFormTemplate = (id) =>
  client.get(`/form-templates/${id}`).then(r => r.data);

export const updateFormTemplate = (id, data) =>
  client.put(`/form-templates/${id}`, data).then(r => r.data);

export const deleteFormTemplate = (id) =>
  client.delete(`/form-templates/${id}`);

// ─── Instances ────────────────────────────────────────────────────────────────
export const listFormInstances = (ticketId) =>
  client.get(`/tickets/${ticketId}/form-instances`).then(r => r.data);

export const createFormInstance = (ticketId, data) =>
  client.post(`/tickets/${ticketId}/form-instances`, data).then(r => r.data);

export const updateFormInstance = (instanceId, values) =>
  client.put(`/form-instances/${instanceId}`, values).then(r => r.data);

export const deleteFormInstance = (instanceId) =>
  client.delete(`/form-instances/${instanceId}`);
