import client from "./client.js";

export const listMaterials  = ()          => client.get("/materials").then(r => r.data);
export const createMaterial = (data)      => client.post("/materials", data).then(r => r.data);
export const updateMaterial = (id, data)  => client.put(`/materials/${id}`, data).then(r => r.data);
export const deleteMaterial = (id)        => client.delete(`/materials/${id}`);

export const importMaterialsCsv = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post("/materials/import", form).then(r => r.data);
};
