// DataPrivacyPanel.jsx - Export dat rodiny a trvalé smazání rodiny (jen pro rodiče).
import React, { useState } from "react";
import { useUser } from "../context/UserContext";
import { downloadTextFile } from "../utils/calendar";
import { getErrorMessage } from "../utils/errors";

export const DELETE_CONFIRMATION = "SMAZAT RODINU";

export default function DataPrivacyPanel() {
  const { api, logout } = useUser();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleExport() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/families/me/export");
      downloadTextFile("family-quest-export.json", JSON.stringify(data, null, 2), "application/json");
      setMessage("Export byl stažen.");
    } catch (exportError) {
      setError(getErrorMessage(exportError, "Export se nepodařil."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/families/me/delete", { method: "POST", body: { confirm: confirmText.trim() } });
      logout();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Rodinu se nepodařilo smazat."));
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl" aria-label="Data rodiny">
      <h2 className="text-xl font-bold text-white">Data rodiny</h2>
      <p className="mt-1 text-sm text-slate-400">
        Stáhni si kopii dat (členové, úkoly, odměny, nákupy) nebo rodinu trvale smaž.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={handleExport}
        className="mt-3 rounded-2xl border border-cyan-400/60 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50"
      >
        Stáhnout data (JSON)
      </button>

      <form onSubmit={handleDelete} className="mt-5 rounded-2xl border border-rose-500/40 bg-rose-500/5 p-3">
        <h3 className="text-sm font-bold text-rose-200">Smazat rodinu</h3>
        <p className="mt-1 text-xs text-slate-300">
          Smaže všechny členy, úkoly, odměny i historii. Nejde to vrátit. Pro potvrzení napiš{" "}
          <span className="font-bold">{DELETE_CONFIRMATION}</span>.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            aria-label="Potvrzení smazání rodiny"
            placeholder={DELETE_CONFIRMATION}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-rose-400"
          />
          <button
            type="submit"
            disabled={busy || confirmText.trim() !== DELETE_CONFIRMATION}
            className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-black text-white hover:bg-rose-400 disabled:opacity-40"
          >
            Smazat rodinu
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm font-semibold text-rose-300">{error}</p> : null}
      {message ? <p className="mt-3 text-sm font-semibold text-emerald-300">{message}</p> : null}
    </section>
  );
}
