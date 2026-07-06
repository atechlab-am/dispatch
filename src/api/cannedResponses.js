import client from "./client.js";

export const listCannedResponses  = ()          => client.get("/canned-responses").then(r => r.data);
export const createCannedResponse = (data)      => client.post("/canned-responses", data).then(r => r.data);
export const updateCannedResponse = (id, data)  => client.put(`/canned-responses/${id}`, data).then(r => r.data);
export const deleteCannedResponse = (id)        => client.delete(`/canned-responses/${id}`);
