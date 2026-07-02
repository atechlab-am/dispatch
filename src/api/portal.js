import client from "./client.js";

export const listPortalAccounts   = (clientId) => client.get("/portal/accounts", clientId ? { params: { client_id: clientId } } : {}).then(r => r.data);
export const createPortalAccount  = (data)      => client.post("/portal/accounts", data).then(r => r.data);
export const updatePortalAccount  = (id, data)  => client.patch(`/portal/accounts/${id}`, data).then(r => r.data);
export const deletePortalAccount  = (id)        => client.delete(`/portal/accounts/${id}`);
