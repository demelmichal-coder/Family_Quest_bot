import React, { useEffect, useState } from "react";

function isStandalone() {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  // iPadOS se hlasi jako Mac, pozna se podle dotykove obrazovky.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isInsideTelegram() {
  const webApp = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
  return Boolean(webApp?.initData);
}

const STYLES = {
  light: {
    button:
      "w-full rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-950 transition hover:bg-cyan-100",
    hint: "mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700",
  },
  dark: {
    button:
      "rounded-full border border-emerald-300/60 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-100 shadow-lg backdrop-blur transition hover:bg-emerald-500/30",
    hint: "mt-2 max-w-xs rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-xs text-slate-200",
  },
};

export default function InstallAppButton({ variant = "light", className = "" }) {
  const [promptEvent, setPromptEvent] = useState(
    typeof window !== "undefined" ? window.__fqInstallPrompt || null : null
  );
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    function handleAvailable() {
      setPromptEvent(window.__fqInstallPrompt || null);
    }
    function handleInstalled() {
      window.__fqInstallPrompt = null;
      setPromptEvent(null);
      setInstalled(true);
    }
    window.addEventListener("fq-install-available", handleAvailable);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("fq-install-available", handleAvailable);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || isInsideTelegram()) {
    return null;
  }

  const ios = isIos();
  if (!promptEvent && !ios) {
    return null;
  }

  async function handleClick() {
    if (promptEvent) {
      promptEvent.prompt();
      try {
        await promptEvent.userChoice;
      } catch {
        // uzivatel dialog zavrel
      }
      window.__fqInstallPrompt = null;
      setPromptEvent(null);
      return;
    }
    setShowIosHint((current) => !current);
  }

  const styles = STYLES[variant] || STYLES.light;

  return (
    <div className={className}>
      <button type="button" onClick={handleClick} className={styles.button}>
        📲 Pridat aplikaci na plochu
      </button>
      {showIosHint ? (
        <div className={styles.hint}>
          V Safari klepni dole na tlacitko <strong>Sdilet</strong> (ctverecek se sipkou nahoru) a
          vyber <strong>Pridat na plochu</strong>. Aplikace se pak otevira z ikony jako bezna
          appka.
        </div>
      ) : null}
    </div>
  );
}
