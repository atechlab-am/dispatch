import client from "./client.js";

export const listTickets = (params) =>
  client.get("/tickets", { params }).then((r) => r.data);

export const getTicket = (id) =>
  client.get(`/tickets/${id}`).then((r) => r.data);

export const createTicket = (data) =>
  client.post("/tickets", data).then((r) => r.data);

export const updateTicket = (id, data) =>
  client.put(`/tickets/${id}`, data).then((r) => r.data);

export const deleteTicket = (id) =>
  client.delete(`/tickets/${id}`);
