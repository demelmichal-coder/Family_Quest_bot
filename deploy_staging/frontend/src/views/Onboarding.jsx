import React, { useState } from "react";
import { ONBOARDING_MESSAGES } from "../constants/messages";
import { ROLE_CHILD, ROLE_PARENT } from "../constants/roles";
import { getErrorMessage } from "../utils/errors";

function Onboarding({ user, api, onJoined }) {
  const [mode, setMode] = useState("create");
  const [familyName, setFamilyName] = useState("");
  const [username, setUsername] = useState(user?.username || "");
  const [inviteCode, setInviteCode] = useState("");
  const [role, setRole] = useState(ROLE_CHILD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await api("/families/create", {
        method: "POST",
        body: {
          name: familyName.trim(),
          username: username.trim(),
        },
      });
      await onJoined();
    } catch (joinError) {
      setError(getErrorMessage(joinError, ONBOARDING_MESSAGES.createFamilyError));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await api("/families/join", {
        method: "POST",
        body: {
          invite_code: inviteCode.trim().toUpperCase(),
          role,
          username: username.trim(),
        },
      });
      await onJoined();
    } catch (joinError) {
      setError(getErrorMessage(joinError, ONBOARDING_MESSAGES.joinFamilyError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#cffafe,transparent_30%),linear-gradient(180deg,#ecfeff_0%,#fefce8_45%,#fde68a_100%)] px-4 py-6">
      <div className="mx-auto max-w-3xl rounded-[32px] border border-cyan-300/40 bg-white/75 p-6 shadow-2xl backdrop-blur">
        <div className="text-sm font-bold uppercase tracking-[0.35em] text-cyan-700">
          Family Quest
        </div>
        <h1 className="mt-3 text-4xl font-black text-slate-950">Nastaveni rodiny</h1>
        <p className="mt-3 text-sm text-slate-700">
          Nejdriv je potreba zalozit rodinu nebo se pripojit pomoci kodu od rodice.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-cyan-300/50 bg-cyan-50/80 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Rodic</div>
            <div className="mt-2 text-sm font-semibold text-cyan-950">
              Sprava deti, ukolu, odmen a rodinneho zebricku.
            </div>
          </div>
          <div className="rounded-2xl border border-amber-300/50 bg-amber-50/80 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Dite</div>
            <div className="mt-2 text-sm font-semibold text-amber-950">
              Plneni misi, sbirani XP a nakup odmen za gold.
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
              mode === "create"
                ? "bg-slate-950 text-white"
                : "bg-cyan-100 text-cyan-950 hover:bg-cyan-200"
            }`}
          >
            Vytvorit rodinu
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
              mode === "join"
                ? "bg-slate-950 text-white"
                : "bg-yellow-100 text-yellow-950 hover:bg-yellow-200"
            }`}
          >
            Pripojit se kodem
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {mode === "create" ? (
          <form className="mt-6 space-y-4" onSubmit={handleCreate}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Tvoje jmeno</span>
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950"
                placeholder="Treba Mamka"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Nazev rodiny</span>
              <input
                required
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950"
                placeholder="Treba Demelovi"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {busy ? "Zakladam..." : "Zalozit rodinu jako rodic"}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleJoin}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Tvoje jmeno</span>
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950"
                placeholder="Treba Kuba"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Kod rodiny</span>
              <input
                required
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 uppercase"
                placeholder="ABC123"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950"
              >
                <option value={ROLE_CHILD}>Dite</option>
                <option value={ROLE_PARENT}>Rodic</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-yellow-400 px-4 py-3 font-bold text-yellow-950 transition hover:bg-yellow-300 disabled:opacity-60"
            >
              {busy ? "Pripojuju..." : "Pripojit se do rodiny"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Onboarding;
