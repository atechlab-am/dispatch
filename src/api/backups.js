import client from "./client.js";

export const listBackupRuns      = (params) => client.get("/backups", { params }).then(r => r.data);
export const triggerBackup       = ()       => client.post("/backups/run").then(r => r.data);
export const listAvailableBackups = ()      => client.get("/backups/available").then(r => r.data);
export const restoreBackup       = (filename, password) => client.post("/backups/restore", { filename, password }).then(r => r.data);
