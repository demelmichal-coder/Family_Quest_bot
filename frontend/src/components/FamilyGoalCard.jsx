// FamilyGoalCard.jsx - Společný rodinný cíl: děti dohromady sbírají XP na společnou odměnu.
import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

export default function FamilyGoalCard({ isParent = false }) {
  const { api } = useUser();
  const [goal, setGoal] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [targetXp, setTargetXp] = useState(200);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/goals/active");
      setGoal(data && typeof data === "object" ? data : null);
    } catch {
      setGoal(null);
    } finally {
      setLoaded(true);
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
      await api("/goals/", { method: "POST", body: { title: title.trim(), target_xp: Number(targetXp) || 0 } });
      setTitle("");
      await load();
    } catch (createError) {
      setError(getErrorMessage(createError, "Cíl se nepodařilo založit."));
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    setBusy(true);
    setError("");
    try {
      await api(`/goals/${goal.id}/complete`, { method: "POST" });
      setMessage("Cíl je splněný. Děti dostaly upozornění, užijte si to!");
      await load();
    } catch (completeError) {
      setError(getErrorMessage(completeError, "Cíl se nepodařilo potvrdit."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    setError("");
    try {
      await api(`/goals/${goal.id}`, { method: "DELETE" });
      await load();
    } catch (cancelError) {
      setError(getErrorMessage(cancelError, "Cíl se nepodařilo zrušit."));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  if (!goal && !isParent) return null;

  return (
    <section className="rounded-3xl border border-amber-400/40 bg-slate-900/90 p-4 shadow-xl" aria-label="Rodinný cíl">
      <h2 className="text-lg font-black text-white">Rodinný cíl</h2>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-300">{error}</p> : null}
      {message ? <p className="mt-2 text-sm font-semibold text-emerald-300">{message}</p> : null}

      {goal ? (
        <>
          <p className="mt-1 text-sm text-slate-200">{goal.title}</p>
          <div
            className="mt-3 h-4 w-full overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal.target_xp}
            aria-valuenow={goal.progress_xp}
            aria-label={`Postup k cíli ${goal.title}`}
          >
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${goal.percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-300">
            {goal.progress_xp} / {goal.target_xp} XP ({goal.percent} %)
          </p>
          {goal.reached ? (
            <p className="mt-1 text-sm font-bold text-emerald-300">Cíl je splněný! Čeká na potvrzení rodiče.</p>
          ) : null}
          {isParent ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !goal.reached}
                onClick={handleComplete}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                Splněno – oslavit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleCancel}
                className="rounded-full border border-rose-400/60 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Zrušit cíl
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-300">
            Zvol společnou odměnu (třeba pizza večer). Děti na ni sbírají XP dohromady.
          </p>
          <form onSubmit={handleCreate} className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              required
              placeholder="Třeba pizza večer"
              aria-label="Název rodinného cíle"
              className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
            <input
              type="number"
              min="10"
              value={targetXp}
              onChange={(event) => setTargetXp(event.target.value)}
              aria-label="Cílový počet XP"
              className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={busy || title.trim().length < 2}
              className="rounded-2xl bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              Založit cíl
            </button>
          </form>
        </>
      )}
    </section>
  );
}
