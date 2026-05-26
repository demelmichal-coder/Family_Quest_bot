import { useEffect, useState } from "react";

function readDemoTelegramId() {
  const envId = import.meta.env.VITE_DEMO_TELEGRAM_ID?.toString().trim();
  const queryId = new URLSearchParams(window.location.search)
    .get("demo_user")
    ?.toString()
    .trim();
  const storedId = window.localStorage.getItem("familyquest_demo_user_id")?.trim();
  const demoId = queryId || storedId || envId || "";

  if (queryId) {
    window.localStorage.setItem("familyquest_demo_user_id", queryId);
  }

  return demoId;
}

export function useTelegram() {
  const [state, setState] = useState({
    tg: null,
    ready: false,
    hasAuthData: false,
  });

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    function syncTelegramState() {
      const webApp = window?.Telegram?.WebApp ?? null;

      if (!webApp) {
        if (!cancelled) {
          setState({
            tg: null,
            ready: false,
            hasAuthData: false,
            error: "Telegram WebApp SDK nebyl nalezen. Otevřete aplikaci přes Telegram."
          });
        }
        return false;
      }

      try {
        webApp.ready();
        webApp.expand();
      } catch {}

      const hasAuthData = Boolean(
        webApp.initData || webApp.initDataUnsafe?.user?.id
      );

      if (!cancelled) {
        setState({
          tg: webApp,
          ready: hasAuthData,
          hasAuthData,
          error: hasAuthData ? undefined : "Telegram neposlal auth data miniaplikaci."
        });
      }

      return hasAuthData;
    }

    function syncDemoState() {
      const demoTelegramId = readDemoTelegramId();
      if (!demoTelegramId) {
        return false;
      }

      if (!cancelled) {
        setState({
          tg: {
            initData: "",
            initDataUnsafe: {
              user: {
                id: demoTelegramId,
              },
            },
          },
          ready: true,
          hasAuthData: true,
        });
      }

      return true;
    }

    if (syncTelegramState()) {
      return undefined;
    }

    if (syncDemoState()) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      attempts += 1;

      if (syncTelegramState()) {
        window.clearInterval(intervalId);
        return;
      }

      if (syncDemoState()) {
        window.clearInterval(intervalId);
        return;
      }

      if (attempts >= 150) {
        window.clearInterval(intervalId);
        if (!cancelled) {
          setState({
            tg: window?.Telegram?.WebApp ?? null,
            ready: true,
            hasAuthData: false,
          });
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return state;
}
