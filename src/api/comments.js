import client from "./client.js";

export const listComments  = (ticketId)       => client.get(`/tickets/${ticketId}/comments`).then(r => r.data);
export const addComment    = (ticketId, data) => client.post(`/tickets/${ticketId}/comments`, data).then(r => r.data);
export const deleteComment = (ticketId, id)   => client.delete(`/tickets/${ticketId}/comments/${id}`);
