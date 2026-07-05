import client from "./client.js";

export const listAppointments  = (start, end, technicianId) =>
  client.get("/appointments", { params: { start, end, technician_id: technicianId || undefined } }).then(r => r.data);
export const createAppointment = (data)     => client.post("/appointments", data).then(r => r.data);
export const updateAppointment = (id, data) => client.put(`/appointments/${id}`, data).then(r => r.data);
export const deleteAppointment = (id)       => client.delete(`/appointments/${id}`);
