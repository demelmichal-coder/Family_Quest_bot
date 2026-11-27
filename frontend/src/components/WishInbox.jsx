// WishInbox.jsx - Rodič vyřizuje přání dětí (schválí s cenou, nebo zamítne).
import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

export default function WishInbox({ onChanged }) {
  const { api } = useUser();
  const [wishes, setWishes] = useState([]);
  const [costs, setCosts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/wishes/");
      const pending = Array.isArray(data) ? data.filter((wish) => wish.status === "pending") : [];
      setWishes(pending);
    } catch {
      setWishes([]);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(wish, action) {
    setBusyId(wish.id);
    setError("");
    setMessage("");
    try {
      if (action === "approve") {
        const raw = costs[wish.id];
        const cost = raw === undefined || raw === "" ? wish.suggested_cost : Number(raw);
        await api(`/wishes/${wish.id}/approve`, { method: "POST", body: { cost } });
        setMessage(`Odměna „${wish.title}“ je v obchodě.`);
      } else {
        await api(`/wishes/${wish.id}/reject`, { method: "POST", body: {} });
        setMessage(`Přání „${wish.title}“ bylo zamítnuto.`);
      }
      await load();
      onChanged?.();
    } catch (resolveError) {
      setError(getErrorMessage(resolveError, "Přání se nepodařilo vyřídit."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="wish-inbox" className="rounded-3xl border border-fuchsia-500/30 bg-slate-900 p-5 shadow-xl" aria-label="Přání dětí">
      <h2 className="text-xl font-bold text-white">Přání dětí</h2>
      <p className="mt-1 text-sm text-slate-400">Schválené přání se objeví v obchodě s cenou, kterou určíš.</p>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-300">{error}</p> : null}
      {message ? <p className="mt-2 text-sm font-semibold text-emerald-300">{message}</p> : null}

      {wishes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Žádná čekající přání.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {wishes.map((wish) => (
            <li key={wish.id} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
              <div className="text-sm font-bold text-white">{wish.title}</div>
              <div className="text-xs text-slate-400">
                {wish.username || "Dítě"} navrhuje {wish.suggested_cost} zlata
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  Cena
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={costs[wish.id] ?? wish.suggested_cost}
                    onChange={(event) => setCosts((current) => ({ ...current, [wish.id]: event.target.value }))}
                    aria-label={`Cena pro přání ${wish.title}`}
                    className="w-24 rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-cyan-400"
                  />
                </label>
                <button
                  type="button"
                  disabled={busyId === wish.id}
                  onClick={() => resolve(wish, "approve")}
                  aria-label={`Schválit přání ${wish.title}`}
                  className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  Schválit
                </button>
                <button
                  type="button"
                  disabled={busyId === wish.id}
                  onClick={() => resolve(wish, "reject")}
                  aria-label={`Zamítnout přání ${wish.title}`}
                  className="rounded-full border border-rose-400/60 px-3 py-1 text-xs font-bold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  Zamítnout
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
