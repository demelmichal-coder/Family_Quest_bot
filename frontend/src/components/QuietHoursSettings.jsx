// QuietHoursSettings.jsx - Tichý režim: v zadaném čase nechodí upozornění.
import React, { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

const DEFAULT_START = "21:00";
const DEFAULT_END = "07:00";

export default function QuietHoursSettings() {
  const { api } = useUser();
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api("/push/quiet-hours");
        if (cancelled || !data) return;
        if (data.start && data.end) {
          setEnabled(true);
          setStart(data.start);
          setEnd(data.end);
        }
      } catch {
        // Nastavení se nenačetlo - zůstanou výchozí hodnoty.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/push/quiet-hours", {
        method: "PUT",
        body: enabled ? { start, end } : { start: null, end: null },
      });
      setMessage(enabled ? `Upozornění nebudou chodit od ${start} do ${end}.` : "Tichý režim je vypnutý.");
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Nastavení se nepodařilo uložit."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-4 shadow-xl" aria-label="Tichý režim upozornění">
      <h2 className="text-lg font-black text-white">Tichý režim</h2>
      <p className="mt-1 text-sm text-slate-300">V nastavené době nebudou chodit upozornění z aplikace (třeba v noci nebo ve škole).</p>

      <form onSubmit={handleSave} className="mt-3 space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4" />
          Zapnout tichý režim
        </label>
        {enabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              Od
              <input
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
                className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-cyan-400"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              Do
              <input
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
                className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-cyan-400"
              />
            </label>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          {busy ? "Ukládám…" : "Uložit"}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-300">{error}</p> : null}
      {message ? <p className="mt-2 text-sm font-semibold text-emerald-300">{message}</p> : null}
    </section>
  );
}
