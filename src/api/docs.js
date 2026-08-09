import client from "./client.js";

export const listDocs = () =>
  client.get("/docs").then((r) => r.data);

export const getDoc = (slug) =>
  client.get(`/docs/${slug}`).then((r) => r.data);
