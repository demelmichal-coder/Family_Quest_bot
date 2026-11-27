// ChangePinPanel.jsx - Uživatel si sám změní PIN pro přihlášení v prohlížeči.
import React, { useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

const PIN_PATTERN = /^\d{4,6}$/;

export default function ChangePinPanel() {
  const { api } = useUser();
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!PIN_PATTERN.test(pin)) {
      setError("PIN musí mít 4 až 6 číslic.");
      return;
    }
    if (pin !== pinAgain) {
      setError("PINy se neshodují.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/pin/set-own", { method: "POST", body: { pin } });
      setPin("");
      setPinAgain("");
      setMessage("PIN byl změněn. Při příštím přihlášení použij ten nový.");
    } catch (submitError) {
      setError(getErrorMessage(submitError, "PIN se nepodařilo změnit."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-4 shadow-xl" aria-label="Změna PINu">
      <h2 className="text-lg font-black text-white">Změnit PIN</h2>
      <p className="mt-1 text-sm text-slate-300">PIN používáš k přihlášení v prohlížeči (4 až 6 číslic).</p>

      <form onSubmit={handleSubmit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
          placeholder="Nový PIN"
          aria-label="Nový PIN"
          className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
        />
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pinAgain}
          onChange={(event) => setPinAgain(event.target.value.replace(/\D/g, ""))}
          placeholder="Nový PIN znovu"
          aria-label="Nový PIN znovu"
          className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          {busy ? "Ukládám…" : "Změnit PIN"}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm font-semibold text-rose-300">{error}</p> : null}
      {message ? <p className="mt-2 text-sm font-semibold text-emerald-300">{message}</p> : null}
    </section>
  );
}
