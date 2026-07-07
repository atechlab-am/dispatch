import client from "./client.js";
export const getDashboard = () => client.get("/dashboard").then(r => r.data);
