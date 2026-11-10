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

export default function PushSubscribeButton({ className = "" }) {
  const { api } = useUser();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
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
        setError("Push notifikace nejsou na serveru nastavene.");
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
      setError("Zapnuti notifikaci se nepodarilo.");
    } finally {
      setLoading(false);
    }
  }

  if (!supported || subscribed) {
    return null;
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={loading}
        className="rounded-full border border-cyan-300/60 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-100 shadow-lg backdrop-blur transition hover:bg-cyan-500/30 disabled:opacity-60"
      >
        {loading ? "Zapinam..." : "🔔 Zapnout upozorneni"}
      </button>
      {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
