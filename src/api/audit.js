import client from "./client.js";

export const listTicketAudit = (ticketId) => client.get(`/tickets/${ticketId}/audit`).then(r => r.data);
