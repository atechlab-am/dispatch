import client from "./client.js";

export const listTicketDocuments = (ticketId) =>
  client.get(`/tickets/${ticketId}/documents`).then(r => r.data);

export const attachDocument = (ticketId, documentId) =>
  client.post(`/tickets/${ticketId}/documents`, null, { params: { document_id: documentId } }).then(r => r.data);

export const updateTicketDocument = (ticketId, documentId, data) =>
  client.patch(`/tickets/${ticketId}/documents/${documentId}`, data).then(r => r.data);

export const detachDocument = (ticketId, documentId) =>
  client.delete(`/tickets/${ticketId}/documents/${documentId}`);
