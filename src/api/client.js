import axios from "axios";

// Tokens live in memory only — never localStorage
let _accessToken = null;
let _refreshToken = null;
let _onLogout = null;

export function setTokens(access, refresh) {
  _accessToken = access;
  _refreshToken = refresh;
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
}

export function registerLogoutHandler(fn) {
  _onLogout = fn;
}

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Inject access token on every request
client.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
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

export default client;
