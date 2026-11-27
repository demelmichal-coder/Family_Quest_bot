// OffersManager.jsx - Rodič vystaví volný úkol pro všechny děti a může ho stáhnout.
import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

export default function OffersManager() {
  const { api } = useUser();
  const [offers, setOffers] = useState([]);
  const [title, setTitle] = useState("");
  const [xp, setXp] = useState(20);
  const [gold, setGold] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/offers/", {
        method: "POST",
        body: { title: title.trim(), xp: Number(xp) || 0, gold: Number(gold) || 0 },
      });
      setTitle("");
      setMessage("Volný úkol je vystavený. Děti dostanou upozornění.");
      await load();
    } catch (createError) {
      setError(getErrorMessage(createError, "Volný úkol se nepodařilo vystavit."));
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw(offer) {
    setError("");
    setMessage("");
    try {
      await api(`/offers/${offer.id}`, { method: "DELETE" });
      await load();
    } catch (withdrawError) {
      setError(getErrorMessage(withdrawError, "Úkol se nepodařilo stáhnout."));
    }
  }

  return (
    <section className="rounded-3xl border border-emerald-500/30 bg-slate-900 p-5 shadow-xl" aria-label="Volné úkoly pro děti">
      <h2 className="text-xl font-bold text-white">Volné úkoly pro všechny děti</h2>
      <p className="mt-1 text-sm text-slate-400">Vystav úkol bez přiřazení. Splní ho dítě, které si ho vezme jako první.</p>

      <form onSubmit={handleCreate} className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
          placeholder="Třeba umýt auto"
          aria-label="Název volného úkolu"
          className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
        />
        <label className="grid gap-1 text-xs font-semibold text-slate-400">
          <span>XP</span>
          <input
            type="number"
            min="0"
            value={xp}
            onChange={(event) => setXp(event.target.value)}
            aria-label="XP za volný úkol"
            className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-400">
          <span>Zlato</span>
          <input
            type="number"
            min="0"
            value={gold}
            onChange={(event) => setGold(event.target.value)}
            aria-label="Zlato za volný úkol"
            className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="self-end rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Vystavuji…" : "Vystavit"}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-300">{error}</p> : null}
      {message ? <p className="mt-2 text-sm font-semibold text-emerald-300">{message}</p> : null}

      {offers.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {offers.map((offer) => (
            <li key={offer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{offer.title}</div>
                <div className="text-xs text-slate-400">
                  {offer.xp} XP{offer.gold ? ` · ${offer.gold} zlata` : ""} · čeká na dítě
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleWithdraw(offer)}
                aria-label={`Stáhnout volný úkol ${offer.title}`}
                className="rounded-full border border-rose-400/60 px-3 py-1 text-xs font-bold text-rose-200 hover:bg-rose-500/10"
              >
                Stáhnout
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
