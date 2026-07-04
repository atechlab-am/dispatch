import client from "./client.js";

export const listNotifications = (params = {}) => client.get("/notifications", { params }).then(r => r.data);
export const getUnreadCount    = ()             => client.get("/notifications/unread-count").then(r => r.data);
export const markRead          = (id)           => client.post(`/notifications/${id}/read`).then(r => r.data);
export const markAllRead       = ()             => client.post("/notifications/read-all");
