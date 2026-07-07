import client from "./client.js";

export const getSetupStatus = () =>
  client.get("/setup/status").then((r) => r.data);

export const completeSetup = (data) =>
  client.post("/setup/complete", data).then((r) => r.data);
