import client from "./client.js";

export const globalSearch = (q) => client.get("/search", { params: { q } }).then(r => r.data);
