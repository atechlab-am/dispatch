import client from "./client.js";

export const listAttachments  = (ticketId)         => client.get(`/tickets/${ticketId}/attachments`).then(r => r.data);
export const uploadAttachment = (ticketId, file)    => {
  const fd = new FormData();
  fd.append("file", file);
  return client.post(`/tickets/${ticketId}/attachments`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};
export const downloadUrl      = (attachmentId)     => `/api/attachments/${attachmentId}/download`;
export const deleteAttachment = (attachmentId)     => client.delete(`/attachments/${attachmentId}`);
