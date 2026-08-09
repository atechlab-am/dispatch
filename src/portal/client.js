import axios from "axios";

const STORAGE_KEY = "dispatch_portal_rt";

let _accessToken = null;
let _refreshToken = localStorage.getItem(STORAGE_KEY) || null;
let _onLogout = null;

export function setTokens(access, refresh) {
  _accessToken = access;
  _refreshToken = refresh;
  if (refresh) localStorage.setItem(STORAGE_KEY, refresh);
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasStoredSession() {
  return !!localStorage.getItem(STORAGE_KEY);
}

// Proactively exchange the stored refresh token for a fresh access token.
// Used on app boot: the access token is memory-only and is always empty
// after a full page load, so calling an authed endpoint first would send a
// guaranteed-401 request that the response interceptor then has to recover
// from reactively. Refreshing up front avoids that doomed round-trip.
export async function refreshAccessToken() {
  if (!_refreshToken) throw new Error("No stored session");
  const { data } = await axios.post("/api/portal/auth/refresh", {
    refresh_token: _refreshToken,
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export function registerLogoutHandler(fn) {
  _onLogout = fn;
}

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  return config;
});

let _refreshing = false;
let _refreshQueue = [];

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry || !_refreshToken) {
      return Promise.reject(err);
    }
    if (_refreshing) {
      return new Promise((resolve, reject) =>
        _refreshQueue.push({ resolve, reject, config: original })
      );
    }
    original._retry = true;
    _refreshing = true;
    try {
      const { data } = await axios.post("/api/portal/auth/refresh", {
        refresh_token: _refreshToken,
      });
      setTokens(data.access_token, data.refresh_token);
      _refreshQueue.forEach(({ resolve, config }) => {
        config.headers.Authorization = `Bearer ${data.access_token}`;
        resolve(client(config));
      });
      _refreshQueue = [];
      original.headers.Authorization = `Bearer ${data.access_token}`;
      return client(original);
    } catch {
      clearTokens();
      _refreshQueue.forEach(({ reject }) => reject(err));
      _refreshQueue = [];
      if (_onLogout) _onLogout();
      return Promise.reject(err);
    } finally {
      _refreshing = false;
    }
  }
);

export async function openPdfWithAuth(url) {
  const res = await client.get(url, { responseType: "text" });
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(res.data);
  win.document.close();
}

export default client;
