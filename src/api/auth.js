import client from "./client.js";

export const login = (email, password) =>
  client.post("/auth/login", { email, password }).then((r) => r.data);

export const verifyLogin2fa = (loginToken, code) =>
  client.post("/auth/login/2fa", { login_token: loginToken, code }).then((r) => r.data);

export const logout = () =>
  client.post("/auth/logout").catch(() => {});

export const me = () =>
  client.get("/auth/me").then((r) => r.data);

export const setup2fa = () =>
  client.post("/auth/2fa/setup").then((r) => r.data);

export const enable2fa = (code) =>
  client.post("/auth/2fa/enable", { code }).then((r) => r.data);

export const disable2fa = (password) =>
  client.post("/auth/2fa/disable", { password });
