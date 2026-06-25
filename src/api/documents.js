import client from "./client.js";

export const listDocuments = (params = {}) =>
  client.get("/documents", { params }).then(r => r.data);

export const uploadDocument = (file, meta) => {
  const form = new FormData();
  form.append("file", file);
  return client.post("/documents", form, { params: meta }).then(r => r.data);
};

export const getDocument = (id) =>
  client.get(`/documents/${id}`).then(r => r.data);

export const updateDocument = (id, data) =>
  client.put(`/documents/${id}`, data).then(r => r.data);

export const deleteDocument = (id) =>
  client.delete(`/documents/${id}`);

export const downloadUrl = (id) => `/api/documents/${id}/download`;
