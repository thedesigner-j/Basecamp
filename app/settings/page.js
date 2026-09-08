"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.twelvedata_api_key) setApiKey(data.twelvedata_api_key);
        if (data.alert_email) setAlertEmail(data.alert_email);
        if (typeof data.alerts_enabled === "boolean") setAlertsEnabled(data.alerts_enabled);
      });
  }, []);

  async function save(e) {
    e.preventDefault();
    setStatus("Saving\u2026");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        twelvedata_api_key: apiKey,
        alert_email: alertEmail,
        alerts_enabled: alertsEnabled,
      }),
    });
    const data = await res.json();
    setStatus(data.ok ? "Saved." : "Error: " + data.error);
  }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>Settings</h1>
          <p>Your Twelve Data key and alert preferences, stored server-side.</p>
        </div>
        <div className="top-actions">
          <Link href="/" className="settings-link">\u2190 Back to Basecamp</Link>
        </div>
      </header>

      <form className="form-panel" onSubmit={save}>
        <h3>Twelve Data API key</h3>
        <p>Free at twelvedata.com (Individual \u2192 Basic). Used server-side only \u2014 never sent to the browser beyond this page.</p>
        <div className="field">
          <label>API key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your Twelve Data API key" />
        </div>

        <h3>Email alerts</h3>
        <p>Sent via Resend when a primary setup newly grades A, or a base breaks out, during the daily check.</p>
        <div className="field">
          <label>Alert email</label>
          <input type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="field checkbox-row">
          <input type="checkbox" id="alertsEnabled" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} />
          <label htmlFor="alertsEnabled" style={{ margin: 0 }}>Enable email alerts</label>
        </div>

        <button className="btn primary" type="submit">Save</button>
        <span style={{ marginLeft: 12, fontSize: 12.5, color: "var(--text-dim)" }}>{status}</span>
      </form>
    </div>
  );
}
