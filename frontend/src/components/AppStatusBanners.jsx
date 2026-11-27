// AppStatusBanners.jsx - hlaseni o nove verzi aplikace a o offline rezimu.
import React, { useEffect, useState } from "react";

function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

function useNewVersionAvailable() {
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    // Pri prvni navsteve neni zadny controller; controllerchange pak neznamena novou verzi.
    const hadController = Boolean(navigator.serviceWorker.controller);
    if (!hadController) return undefined;

    const onChange = () => setUpdated(true);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);

  return updated;
}

export default function AppStatusBanners() {
  const online = useOnlineStatus();
  const updated = useNewVersionAvailable();

  if (!online) {
    return (
      <div
        role="status"
        className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-md rounded-2xl border border-amber-400/50 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-900 shadow-lg"
      >
        Jsi offline. Zobrazuji poslední načtená data, změny se odešlou až po připojení.
      </div>
    );
  }

  if (updated) {
    return (
      <div
        role="status"
        className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-cyan-400/50 bg-slate-950/95 px-4 py-2 text-xs font-semibold text-cyan-100 shadow-lg"
      >
        <span>Je k dispozici nová verze aplikace.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-cyan-500 px-3 py-1 font-bold text-slate-950"
        >
          Obnovit
        </button>
      </div>
    );
  }

  return null;
}
