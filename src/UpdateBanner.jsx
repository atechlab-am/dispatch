/**
 * UpdateBanner — polls /api/version/check every 10 minutes.
 * Shows a dismissible top banner when update_available is true.
 * Only renders when the user is logged in (requires auth to call the endpoint).
 */
import { useState, useEffect, useRef } from "react";
import client from "./api/client.js";

const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes

async function fetchVersionCheck() {
  try {
    const r = await client.get("/version/check");
    return r.data;
  } catch {
    return null;
  }
}

export default function UpdateBanner({ user }) {
  const [info, setInfo] = useState(null);      // VersionOut | null
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef(null);

  const check = async () => {
    const data = await fetchVersionCheck();
    if (data?.update_available) {
      setInfo(data);
      setDismissed(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    check();
    timerRef.current = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [user?.id]);

  if (!info || dismissed || !info.update_available) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: "linear-gradient(90deg, #1A5CBA 0%, #143f80 100%)",
      color: "#fff",
      padding: "10px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      fontSize: 13,
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>🚀</span>
        <span>
          <strong>Update available — v{info.latest}</strong>
          {info.release_name && info.release_name !== `v${info.latest}` && (
            <span style={{ opacity: 0.8 }}> · {info.release_name}</span>
          )}
          <span style={{ opacity: 0.7, marginLeft: 8 }}>You are running v{info.current}</span>
        </span>
        {info.release_url && (
          <a
            href={info.release_url}
            target="_blank"
            rel="noopener noreferrer"
            className="dispatch-pill"
            style={{
              color: "#E8A020",
              fontWeight: 700,
              textDecoration: "none",
              border: "1px solid rgba(232,160,32,0.6)",
              borderRadius: 20,
              padding: "3px 12px",
              fontSize: 12,
              marginLeft: 4,
            }}
          >
            View release →
          </a>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ opacity: 0.7, fontSize: 12 }}>
          Run <code style={{ background: "rgba(255,255,255,0.15)", padding: "1px 6px", borderRadius: 4 }}>./upgrade.sh</code> on the server to update
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="dispatch-pill"
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            borderRadius: "50%",
            width: 24,
            height: 24,
            fontSize: 16,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          title="Dismiss"
        >×</button>
      </div>
    </div>
  );
}
