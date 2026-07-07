import client from "./client.js";

export const listUsers = () =>
  client.get("/users").then((r) => r.data);

export const createUser = (data) =>
  client.post("/users", data).then((r) => r.data);

export const updateUser = (id, data) =>
  client.put(`/users/${id}`, data).then((r) => r.data);

export const deactivateUser = (id) =>
  client.delete(`/users/${id}`);

export const changeOwnPassword = (current_password, new_password) =>
  client.put("/users/me/password", { current_password, new_password });
