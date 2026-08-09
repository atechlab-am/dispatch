import client from "./client.js";

export const listRecurring   = ()          => client.get("/recurring").then(r => r.data);
export const getRecurring    = (id)        => client.get(`/recurring/${id}`).then(r => r.data);
export const createRecurring = (data)      => client.post("/recurring", data).then(r => r.data);
export const updateRecurring = (id, data)  => client.put(`/recurring/${id}`, data).then(r => r.data);
export const deleteRecurring = (id)        => client.delete(`/recurring/${id}`);
