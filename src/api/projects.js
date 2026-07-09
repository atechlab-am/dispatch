import client from "./client.js";

export const listProjects  = (params) => client.get("/projects", { params }).then(r => r.data);
export const getProject    = (id)     => client.get(`/projects/${id}`).then(r => r.data);
export const createProject = (name)   => client.post("/projects", { name }).then(r => r.data);
