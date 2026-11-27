// WishesPanel.jsx - Dítě navrhne odměnu, rodič ji schválí nebo zamítne.
import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

const STATUS_TEXT = {
  pending: { label: "Čeká na rodiče", style: "border-amber-400/40 bg-amber-400/10 text-amber-100" },
  approved: { label: "Schváleno – je v obchodě", style: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" },
  rejected: { label: "Tentokrát nevyšlo", style: "border-rose-400/40 bg-rose-400/10 text-rose-100" },
};

export default function WishesPanel({ onChanged }) {
  const { api } = useUser();
  const [wishes, setWishes] = useState([]);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/wishes/");
      setWishes(Array.isArray(data) ? data : []);
    } catch {
      setWishes([]);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/wishes/", {
        method: "POST",
        body: { title: title.trim(), suggested_cost: Number(cost) || 0 },
      });
      setTitle("");
      setCost("");
      await load();
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Přání se nepodařilo odeslat."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(wishId) {
    setError("");
    try {
      await api(`/wishes/${wishId}`, { method: "DELETE" });
      await load();
      onChanged?.();
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, "Přání se nepodařilo zrušit."));
    }
  }

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-4 shadow-xl" aria-label="Moje přání">
      <h2 className="text-lg font-black text-white">Moje přání</h2>
      <p className="mt-1 text-sm text-slate-300">Navrhni odměnu, kterou bys chtěl/a. Rodič ji schválí a určí cenu.</p>

      <form onSubmit={handleSubmit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          required
          placeholder="Třeba kino s kamarádem"
          aria-label="Co si přeješ"
          className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
        />
        <input
          value={cost}
          onChange={(event) => setCost(event.target.value)}
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="Zlato (návrh)"
          aria-label="Navržená cena ve zlatě"
          className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          disabled={busy || title.trim().length < 2}
          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
        >
          {busy ? "Odesílám…" : "Poslat přání"}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-300">{error}</p> : null}

      {wishes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {wishes.map((wish) => {
            const status = STATUS_TEXT[wish.status] || STATUS_TEXT.pending;
            return (
              <li key={wish.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{wish.title}</div>
                  <div className="text-xs text-slate-400">Navržená cena: {wish.suggested_cost} zlata</div>
                  {wish.parent_note ? <div className="text-xs text-slate-300">Rodič: {wish.parent_note}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${status.style}`}>{status.label}</span>
                  {wish.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => handleCancel(wish.id)}
                      aria-label={`Zrušit přání ${wish.title}`}
                      className="rounded-full border border-slate-600 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-800"
                    >
                      Zrušit
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
