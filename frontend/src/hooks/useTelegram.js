import { useEffect, useState } from "react";

const DEMO_USER_STORAGE_KEY = "familyquest_demo_user_id";
const FORCE_LOGIN_STORAGE_KEY = "familyquest_force_login";
const SAVED_PROFILES_STORAGE_KEY = "familyquest_saved_profiles";

function sortProfiles(profiles) {
  return [...profiles].sort((first, second) => {
    if (Boolean(first?.pinned) !== Boolean(second?.pinned)) {
      return first?.pinned ? -1 : 1;
    }

    return (second?.lastUsedAt || 0) - (first?.lastUsedAt || 0);
  });
}

function readSavedProfiles() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawProfiles = window.localStorage.getItem(SAVED_PROFILES_STORAGE_KEY);
    const parsedProfiles = rawProfiles ? JSON.parse(rawProfiles) : [];

    if (!Array.isArray(parsedProfiles)) {
      return [];
    }

    return parsedProfiles
      .map((profile) => ({
        id: profile?.id?.toString().trim() || "",
        label: profile?.label?.toString().trim() || "",
        username: profile?.username?.toString().trim() || "",
        familyName: profile?.familyName?.toString().trim() || "",
        familyId: typeof profile?.familyId === "number" ? profile.familyId : null,
        role: profile?.role?.toString().trim() || "",
        lastUsedAt: typeof profile?.lastUsedAt === "number" ? profile.lastUsedAt : 0,
        pinned: Boolean(profile?.pinned),
      }))
      .filter((profile) => profile.id)
      .sort((first, second) => {
        if (Boolean(first?.pinned) !== Boolean(second?.pinned)) {
          return first?.pinned ? -1 : 1;
        }

        return (second?.lastUsedAt || 0) - (first?.lastUsedAt || 0);
      });
  } catch {
    return [];
  }
}

function writeSavedProfiles(profiles) {
  window.localStorage.setItem(SAVED_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

function normalizeProfile(profile) {
  const normalizedId = profile?.id?.toString().trim();

  if (!normalizedId) {
    return null;
  }

  return {
    id: normalizedId,
    label: profile?.label?.toString().trim() || "",
    username: profile?.username?.toString().trim() || "",
    familyName: profile?.familyName?.toString().trim() || "",
    familyId: typeof profile?.familyId === "number" ? profile.familyId : null,
    role: profile?.role?.toString().trim() || "",
    lastUsedAt: Date.now(),
    pinned: Boolean(profile?.pinned),
  };
}

function readDemoTelegramId() {
  if (isForcedLoggedOut()) {
    return "";
  }

  const envId = import.meta.env.VITE_DEMO_TELEGRAM_ID?.toString().trim();
  const queryId = new URLSearchParams(window.location.search)
    .get("demo_user")
    ?.toString()
    .trim();
  const storedId = window.localStorage.getItem(DEMO_USER_STORAGE_KEY)?.trim();
  const demoId = queryId || storedId || envId || "";

  if (queryId) {
    window.localStorage.setItem(DEMO_USER_STORAGE_KEY, queryId);
  }

  return demoId;
}

function isForcedLoggedOut() {
  return window.localStorage.getItem(FORCE_LOGIN_STORAGE_KEY) === "1";
}

export function useTelegram() {
  const [state, setState] = useState({
    tg: null,
    ready: false,
    hasAuthData: false,
    isDemoMode: false,
    savedProfiles: readSavedProfiles(),
  });

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    function syncTelegramState() {
      const webApp = window?.Telegram?.WebApp ?? null;

      if (isForcedLoggedOut()) {
        if (!cancelled) {
          setState({
            tg: webApp,
            ready: true,
            hasAuthData: false,
            isDemoMode: false,
            savedProfiles: readSavedProfiles(),
          });
        }
        return false;
      }

      if (!webApp) {
        if (!cancelled) {
          setState({
            tg: null,
            ready: false,
            hasAuthData: false,
            isDemoMode: false,
            savedProfiles: readSavedProfiles(),
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
          isDemoMode: false,
          savedProfiles: readSavedProfiles(),
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
          isDemoMode: true,
          savedProfiles: readSavedProfiles(),
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
            isDemoMode: false,
          });
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  function loginWithDemoId(demoTelegramId) {
    const normalizedId = demoTelegramId?.toString().trim();
    if (!normalizedId) {
      return false;
    }

    const existingProfiles = readSavedProfiles();
    const existingProfile = existingProfiles.find((profile) => profile.id === normalizedId);

    const nextProfiles = sortProfiles([
      {
        ...normalizeProfile({ id: normalizedId, pinned: Boolean(existingProfile?.pinned) }),
        lastUsedAt: Date.now(),
      },
      ...existingProfiles.filter((profile) => profile.id !== normalizedId),
    ]).slice(0, 10);

    window.localStorage.setItem(DEMO_USER_STORAGE_KEY, normalizedId);
    window.localStorage.removeItem(FORCE_LOGIN_STORAGE_KEY);
    writeSavedProfiles(nextProfiles);
    setState({
      tg: {
        initData: "",
        initDataUnsafe: {
          user: {
            id: normalizedId,
          },
        },
      },
      ready: true,
      hasAuthData: true,
      isDemoMode: true,
      savedProfiles: nextProfiles,
    });
    return true;
  }

  function rememberProfile(profile) {
    const normalizedProfile = normalizeProfile(profile);
    if (!normalizedProfile) {
      return [];
    }

    const existingProfiles = readSavedProfiles();
    const existingProfile = existingProfiles.find((item) => item.id === normalizedProfile.id);

    const nextProfiles = sortProfiles([
      {
        ...normalizedProfile,
        lastUsedAt: Date.now(),
        pinned: Boolean(normalizedProfile.pinned || existingProfile?.pinned),
      },
      ...existingProfiles.filter((item) => item.id !== normalizedProfile.id),
    ]).slice(0, 10);

    window.localStorage.setItem(DEMO_USER_STORAGE_KEY, normalizedProfile.id);
    writeSavedProfiles(nextProfiles);
    setState((currentState) => ({
      ...currentState,
      savedProfiles: nextProfiles,
    }));

    return nextProfiles;
  }

  function removeSavedProfile(profileId) {
    const normalizedId = profileId?.toString().trim();
    if (!normalizedId) {
      return readSavedProfiles();
    }

    const nextProfiles = readSavedProfiles().filter((profile) => profile.id !== normalizedId);
    writeSavedProfiles(nextProfiles);

    const currentDemoId = window.localStorage.getItem(DEMO_USER_STORAGE_KEY)?.trim();
    if (currentDemoId === normalizedId) {
      window.localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    }

    setState((currentState) => ({
      ...currentState,
      savedProfiles: nextProfiles,
    }));

    return nextProfiles;
  }

  function renameSavedProfile(profileId, nextLabel) {
    const normalizedId = profileId?.toString().trim();
    const normalizedLabel = nextLabel?.toString().trim() || "";

    if (!normalizedId) {
      return readSavedProfiles();
    }

    const nextProfiles = sortProfiles(
      readSavedProfiles().map((profile) =>
        profile.id === normalizedId
          ? {
              ...profile,
              label: normalizedLabel,
            }
          : profile
      )
    );
    writeSavedProfiles(nextProfiles);
    setState((currentState) => ({
      ...currentState,
      savedProfiles: nextProfiles,
    }));

    return nextProfiles;
  }

  function togglePinnedProfile(profileId) {
    const normalizedId = profileId?.toString().trim();
    if (!normalizedId) {
      return readSavedProfiles();
    }

    const nextProfiles = sortProfiles(
      readSavedProfiles().map((profile) =>
        profile.id === normalizedId
          ? {
              ...profile,
              pinned: !profile.pinned,
            }
          : profile
      )
    );

    writeSavedProfiles(nextProfiles);
    setState((currentState) => ({
      ...currentState,
      savedProfiles: nextProfiles,
    }));

    return nextProfiles;
  }

  function useTelegramAccount() {
    const webApp = window?.Telegram?.WebApp ?? null;
    window.localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    window.localStorage.removeItem(FORCE_LOGIN_STORAGE_KEY);
    const hasAuthData = Boolean(webApp?.initData || webApp?.initDataUnsafe?.user?.id);
    setState({
      tg: webApp,
      ready: Boolean(webApp),
      hasAuthData,
      isDemoMode: false,
      savedProfiles: readSavedProfiles(),
      error: hasAuthData ? undefined : "Telegram neposlal auth data miniaplikaci.",
    });
    return hasAuthData;
  }

  function logout() {
    window.localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    window.localStorage.setItem(FORCE_LOGIN_STORAGE_KEY, "1");

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("demo_user");
    // Reload page so all React state is cleanly reset and demo query auth is dropped.
    window.location.replace(nextUrl.toString());
  }

  return {
    ...state,
    loginWithDemoId,
    rememberProfile,
    removeSavedProfile,
    renameSavedProfile,
    togglePinnedProfile,
    useTelegramAccount,
    logout,
  };
}
