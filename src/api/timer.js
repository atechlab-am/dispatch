import client from "./client.js";

export const startTimer     = (ticketId, data) => client.post(`/tickets/${ticketId}/timer`, data).then(r => r.data);
export const stopTimer      = (ticketId)       => client.post(`/tickets/${ticketId}/timer/stop`).then(r => r.data);
export const getActiveTimer = (ticketId)       => client.get(`/tickets/${ticketId}/timer/active`).then(r => r.data);
