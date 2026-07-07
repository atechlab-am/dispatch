import client from "./client.js";

export const checkVersion = () =>
  client.get("/version/check").then((r) => r.data);
