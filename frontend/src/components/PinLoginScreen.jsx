import React, { useState } from "react";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

const STEP_FAMILY_CODE = "family_code";
const STEP_MEMBER_PICKER = "member_picker";
const STEP_PIN_ENTRY = "pin_entry";
const STEP_REGISTER = "register";

function normalizePin(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export default function PinLoginScreen({ onShowSavedProfiles, hasSavedProfiles }) {
  const { api, loginWithPinToken } = useUser();
  const [step, setStep] = useState(STEP_FAMILY_CODE);
  const [familyCode, setFamilyCode] = useState("");
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [pin, setPin] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerRole, setRegisterRole] = useState("child");
  const [registerPin, setRegisterPin] = useState("");
  const [registerPinConfirm, setRegisterPinConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFamilyCodeSubmit(event) {
    event.preventDefault();
    const code = familyCode.trim().toUpperCase();
    if (!code) {
      setError("Zadej kod rodiny.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const list = await api(`/auth/pin/family-members?family_code=${encodeURIComponent(code)}`, {
        includeTelegramHeaders: false,
      });
      setFamilyCode(code);
      setMembers(Array.isArray(list) ? list : []);
      setStep(STEP_MEMBER_PICKER);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Rodinu se nepodarilo najit."));
    } finally {
      setLoading(false);
    }
  }

  function handlePickMember(member) {
    setSelectedMember(member);
    setPin("");
    setError("");
    setStep(STEP_PIN_ENTRY);
  }

  async function handlePinSubmit(event) {
    event.preventDefault();
    if (pin.length < 4) {
      setError("PIN musi mit alespon 4 cislice.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const authResponse = await api("/auth/pin/login", {
        method: "POST",
        includeTelegramHeaders: false,
        body: { family_code: familyCode, user_id: selectedMember.id, pin },
      });
      await loginWithPinToken(authResponse);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Prihlaseni se nezdarilo."));
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    if (!registerName.trim()) {
      setError("Zadej jmeno.");
      return;
    }
    if (registerPin.length < 4) {
      setError("PIN musi mit alespon 4 cislice.");
      return;
    }
    if (registerPin !== registerPinConfirm) {
      setError("PINy se neshoduji.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const authResponse = await api("/auth/pin/register", {
        method: "POST",
        includeTelegramHeaders: false,
        body: {
          family_code: familyCode,
          name: registerName.trim(),
          pin: registerPin,
          role: registerRole,
        },
      });
      await loginWithPinToken(authResponse);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Zalozeni profilu se nezdarilo."));
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError("");
    if (step === STEP_MEMBER_PICKER) {
      setStep(STEP_FAMILY_CODE);
      return;
    }
    if (step === STEP_PIN_ENTRY || step === STEP_REGISTER) {
      setStep(STEP_MEMBER_PICKER);
      return;
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#bae6fd,transparent_30%),linear-gradient(180deg,#f8fafc_0%,#fef3c7_55%,#fde68a_100%)] px-4 py-6">
      <div className="mx-auto max-w-md rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-2xl backdrop-blur">
        <div className="text-sm font-bold uppercase tracking-[0.35em] text-cyan-700">Family Quest</div>
        <h1 className="mt-3 text-3xl font-black text-slate-950">Prihlaseni</h1>
        <p className="mt-3 text-sm text-slate-700">
          Aplikace bezi mimo Telegram. Zadej kod rodiny a prihlas se jmenem a PINem.
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            {error}
          </div>
        ) : null}

        {step === STEP_FAMILY_CODE ? (
          <form className="mt-6 space-y-4" onSubmit={handleFamilyCodeSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Kod rodiny</span>
              <input
                value={familyCode}
                onChange={(event) => setFamilyCode(event.target.value.toUpperCase())}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400"
                placeholder="Napr. AB12CD34"
                autoCapitalize="characters"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Hledam rodinu..." : "Pokracovat"}
            </button>
          </form>
        ) : null}

        {step === STEP_MEMBER_PICKER ? (
          <div className="mt-6 space-y-3">
            {members.length ? (
              members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handlePickMember(member)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left font-bold text-slate-900 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50"
                >
                  {member.name}
                </button>
              ))
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                V teto rodine jeste nikdo nema nastaveny PIN.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setError("");
                setStep(STEP_REGISTER);
              }}
              className="w-full rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 font-bold text-cyan-950 transition hover:bg-cyan-100"
            >
              Zalozit novy profil
            </button>

            <button
              type="button"
              onClick={handleBack}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-50"
            >
              Zpet
            </button>
          </div>
        ) : null}

        {step === STEP_PIN_ENTRY ? (
          <form className="mt-6 space-y-4" onSubmit={handlePinSubmit}>
            <p className="text-sm text-slate-700">
              Prihlasujes se jako <span className="font-bold">{selectedMember?.name}</span>.
            </p>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">PIN</span>
              <input
                value={pin}
                onChange={(event) => setPin(normalizePin(event.target.value))}
                type="password"
                inputMode="numeric"
                autoFocus
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-slate-950 shadow-sm outline-none transition focus:border-cyan-400"
                placeholder="••••"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Prihlasuji..." : "Prihlasit se"}
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-50"
            >
              Zpet
            </button>
          </form>
        ) : null}

        {step === STEP_REGISTER ? (
          <form className="mt-6 space-y-4" onSubmit={handleRegisterSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Jmeno</span>
              <input
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400"
                placeholder="Napr. Anicka"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Role</span>
              <select
                value={registerRole}
                onChange={(event) => setRegisterRole(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400"
              >
                <option value="child">Dite</option>
                <option value="parent">Rodic</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Novy PIN</span>
              <input
                value={registerPin}
                onChange={(event) => setRegisterPin(normalizePin(event.target.value))}
                type="password"
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-slate-950 shadow-sm outline-none transition focus:border-cyan-400"
                placeholder="••••"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Potvrd PIN</span>
              <input
                value={registerPinConfirm}
                onChange={(event) => setRegisterPinConfirm(normalizePin(event.target.value))}
                type="password"
                inputMode="numeric"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] text-slate-950 shadow-sm outline-none transition focus:border-cyan-400"
                placeholder="••••"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Zakladam profil..." : "Zalozit profil a prihlasit se"}
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-50"
            >
              Zpet
            </button>
          </form>
        ) : null}

        {hasSavedProfiles ? (
          <button
            type="button"
            onClick={onShowSavedProfiles}
            className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Mam ulozeny profil
          </button>
        ) : null}
      </div>
    </div>
  );
}
