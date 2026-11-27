// OffersBoard.jsx - Volné úkoly, které si může vzít kterékoli dítě (kdo dřív přijde).
import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

export default function OffersBoard({ onClaimed }) {
  const { api } = useUser();
  const [offers, setOffers] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/offers/");
      setOffers(Array.isArray(data) ? data : []);
    } catch {
      setOffers([]);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClaim(offer) {
    setBusyId(offer.id);
    setError("");
    try {
      await api(`/offers/${offer.id}/claim`, { method: "POST" });
      await load();
      onClaimed?.();
    } catch (claimError) {
      setError(getErrorMessage(claimError, "Úkol se nepodařilo převzít."));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (offers.length === 0 && !error) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-emerald-400/40 bg-slate-900/90 p-4 shadow-xl" aria-label="Volné úkoly">
      <h2 className="text-lg font-black text-white">Volné úkoly</h2>
      <p className="mt-1 text-sm text-slate-300">Kdo dřív přijde, ten si úkol vezme.</p>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-300">{error}</p> : null}
      <ul className="mt-3 space-y-2">
        {offers.map((offer) => (
          <li key={offer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{offer.title}</div>
              <div className="text-xs text-slate-400">
                {offer.xp} XP{offer.gold ? ` · ${offer.gold} zlata` : ""}
              </div>
            </div>
            <button
              type="button"
              disabled={busyId === offer.id}
              onClick={() => handleClaim(offer)}
              aria-label={`Vzít si úkol ${offer.title}`}
              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              Vezmu si to
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
