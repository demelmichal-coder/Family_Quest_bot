import React, { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function isIosDevice() {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneApp() {
  if (typeof window === "undefined") {
    return false;
  }
  const standaloneQuery = window.matchMedia ? window.matchMedia("(display-mode: standalone)").matches : false;
  return standaloneQuery || window.navigator.standalone === true;
}

export default function PushSubscribeButton({ className = "" }) {
  const { api } = useUser();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPushSupported()) {
      return;
    }
    setSupported(true);
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => {});
  }, []);

  async function handleSubscribe() {
    setError("");
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifikace nebyly povoleny.");
        setLoading(false);
        return;
      }

      const { publicKey } = await api("/push/vapid-public-key", { includeTelegramHeaders: false });
      if (!publicKey) {
        setError("Push notifikace nejsou na serveru nastavené.");
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = subscription.toJSON();
      await api("/push/subscribe", {
        method: "POST",
        body: {
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
        },
      });
      setSubscribed(true);
    } catch (subscribeError) {
      setError("Zapnutí notifikací se nepodařilo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    setError("");
    setTestMessage("");
    setTesting(true);
    try {
      const response = await api("/push/test", { method: "POST" });
      setTestMessage(response.detail || "Testovací upozornění odesláno.");
    } catch (testError) {
      setError("Testovací upozornění se nepodařilo odeslat.");
    } finally {
      setTesting(false);
    }
  }

  if (isIosDevice() && !isStandaloneApp()) {
    return (
      <p className={`rounded-2xl border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 ${className}`}>
        Na iPhonu fungují upozornění jen z ikony na ploše. Nejdřív aplikaci přidej na plochu
        (Sdílet → Přidat na plochu), pak ji otevři z ikony a zapni upozornění.
      </p>
    );
  }

  if (!supported) {
    return null;
  }

  if (subscribed) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="rounded-full border border-emerald-300/60 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-100 shadow-lg backdrop-blur transition hover:bg-emerald-500/30 disabled:opacity-60"
        >
          {testing ? "Odesílám..." : "🔔 Poslat testovací upozornění"}
        </button>
        {testMessage ? <p className="mt-1 text-xs text-emerald-200">{testMessage}</p> : null}
        {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="rounded-full border border-cyan-300/60 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-100 shadow-lg backdrop-blur transition hover:bg-cyan-500/30 disabled:opacity-60"
      >
        {loading ? "Zapínám..." : "🔔 Zapnout upozornění"}
      </button>
      {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
