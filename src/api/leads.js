import client, { downloadWithAuth } from "./client.js";

export const listLeads   = (params)   => client.get("/leads", { params }).then(r => r.data);
export const getLead     = (id)       => client.get(`/leads/${id}`).then(r => r.data);
export const createLead  = (data)     => client.post("/leads", data).then(r => r.data);
export const updateLead  = (id, data) => client.patch(`/leads/${id}`, data).then(r => r.data);
export const deleteLead  = (id)       => client.delete(`/leads/${id}`);

export const moveLeadStage = (id, stage, lostReason = "") =>
  client.post(`/leads/${id}/stage`, { stage, lost_reason: lostReason }).then(r => r.data);

export const convertLeadToClient = (id) => client.post(`/leads/${id}/convert`).then(r => r.data);

export const checkLeadDuplicates = (params) =>
  client.get("/leads/check-duplicates", { params }).then(r => r.data);

export const bulkUpdateLeads = (leadIds, fields) =>
  client.post("/leads/bulk-update", { lead_ids: leadIds, ...fields }).then(r => r.data);

export const bulkDeleteLeads = (leadIds) =>
  client.post("/leads/bulk-delete", { lead_ids: leadIds }).then(r => r.data);

export const listLeadActivities = (id) => client.get(`/leads/${id}/activities`).then(r => r.data);

export const addLeadActivity = (id, type, body) =>
  client.post(`/leads/${id}/activities`, { type, body }).then(r => r.data);

export const importLeadsCsv = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post("/leads/import", form).then(r => r.data);
};

export const downloadLeadsCsv = () => downloadWithAuth("/leads/export", "leads.csv");
export const downloadLeadsSampleCsv = () => downloadWithAuth("/leads/import/sample", "leads-import-sample.csv");
