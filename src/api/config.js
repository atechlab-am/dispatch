import client from "./client.js";

export const getFeatureConfig = () => client.get("/config").then(r => r.data);
