import client from "./client.js";

export const listMaterials  = ()          => client.get("/materials").then(r => r.data);
export const createMaterial = (data)      => client.post("/materials", data).then(r => r.data);
export const updateMaterial = (id, data)  => client.put(`/materials/${id}`, data).then(r => r.data);
export const deleteMaterial = (id)        => client.delete(`/materials/${id}`);

export const listMaterialCategories = () => client.get("/materials/categories").then(r => r.data);

export const importMaterialsCsv = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post("/materials/import", form).then(r => r.data);
};

export const bulkSetMaterialCategory = (ids, category) =>
  client.post("/materials/bulk/category", { ids, category }).then(r => r.data);

export const bulkDeleteMaterials = (ids) =>
  client.post("/materials/bulk/delete", { ids }).then(r => r.data);

export const bulkAdjustMaterialPrice = (ids, mode, value) =>
  client.post("/materials/bulk/price", { ids, mode, value }).then(r => r.data);
