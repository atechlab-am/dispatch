import axios from "axios";

const STORAGE_KEY = "dispatch_rt";

// Access token: memory only. Refresh token: localStorage so page reloads survive.
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

export function registerLogoutHandler(fn) {
  _onLogout = fn;
}

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Inject access token on every request; let browser set Content-Type for multipart
client.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  }
  return config;
});

// On 401, try a token refresh once, then logout
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
      const { data } = await axios.post("/api/auth/refresh", {
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

// Download a protected endpoint and trigger a browser file save
export async function downloadWithAuth(url, filename) {
  const res = await client.get(url, { responseType: "blob" });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// Fetch an HTML page with auth and open it in a new window for printing
export async function openPdfWithAuth(url) {
  const res = await client.get(url, { responseType: "text" });
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(res.data);
  win.document.close();
}

export default client;
