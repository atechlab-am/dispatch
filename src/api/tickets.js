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

export const exportTickets = async (params) => {
  const res = await client.get("/tickets/export", { params, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  const disposition = res.headers["content-disposition"] || "";
  const match = disposition.match(/filename=([^;]+)/);
  a.href = url;
  a.download = match ? match[1].trim() : "tickets_export.csv";
  a.click();
  URL.revokeObjectURL(url);
};
