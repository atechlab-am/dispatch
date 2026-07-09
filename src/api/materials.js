import client from "./client.js";

export const listMaterials  = ()          => client.get("/materials").then(r => r.data);
export const createMaterial = (data)      => client.post("/materials", data).then(r => r.data);
export const updateMaterial = (id, data)  => client.put(`/materials/${id}`, data).then(r => r.data);
export const deleteMaterial = (id)        => client.delete(`/materials/${id}`);
