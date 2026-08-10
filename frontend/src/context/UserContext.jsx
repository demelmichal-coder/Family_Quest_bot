import React, { createContext, useContext, useEffect, useState } from "react";
import { USER_MESSAGES } from "../constants/messages";
import { useApi } from "../hooks/useApi";
import { useTelegram } from "../hooks/useTelegram";
import { getErrorMessage } from "../utils/errors";

const SESSION_TOKEN_KEY = "fq_jwt_token";
const ACCOUNT_VAULT_KEY = "familyquest_saved_profiles";

const defaultContextValue = {
  user: null,
  loading: false,
  error: "",
  api: async () => {
    throw new Error(USER_MESSAGES.providerNotInitialized);
  },
  telegramId: "",
  telegramInitData: "",
  telegramReady: false,
  hasAuthData: false,
  isDemoMode: false,
  setUser: () => {},
  refreshUser: async () => null,
  logout: () => {},
  loginWithDemoId: () => false,
  useRememberedAccount: () => false,
  removeSavedProfile: () => [],
  clearSavedProfiles: () => [],
  renameSavedProfile: () => [],
  togglePinnedProfile: () => [],
  useTelegramAccount: () => false,
};

function readRememberedAccounts() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawAccounts = window.localStorage.getItem(ACCOUNT_VAULT_KEY);
    const parsedAccounts = rawAccounts ? JSON.parse(rawAccounts) : [];

    if (!Array.isArray(parsedAccounts)) {
      return [];
    }

    return parsedAccounts
      .map((account) => ({
        id: account?.id?.toString().trim() || "",
        label: account?.label?.toString().trim() || "",
        username: account?.username?.toString().trim() || "",
        familyName: account?.familyName?.toString().trim() || "",
        familyId: typeof account?.familyId === "number" ? account.familyId : null,
        role: account?.role?.toString().trim() || "",
        lastUsedAt: typeof account?.lastUsedAt === "number" ? account.lastUsedAt : 0,
        token: account?.token?.toString().trim() || "",
        pinned: Boolean(account?.pinned),
      }))
      .filter((account) => account.id)
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

function writeRememberedAccounts(accounts) {
  window.localStorage.setItem(ACCOUNT_VAULT_KEY, JSON.stringify(accounts));
}

function getCurrentSessionToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(SESSION_TOKEN_KEY)?.trim() || "";
}

const UserContext = createContext(defaultContextValue);

export function UserProvider({ children }) {
  const {
    tg,
    ready: telegramReady,
    hasAuthData,
    error: telegramError,
    isDemoMode,
    loginWithDemoId: loginWithDemoIdRaw,
    rememberProfile,
    removeSavedProfile,
    clearSavedProfiles: clearSavedProfilesRaw,
    renameSavedProfile,
    togglePinnedProfile,
    savedProfiles,
    useTelegramAccount: useTelegramAccountRaw,
    logout: telegramLogout,
  } = useTelegram();
  const telegramId = tg?.initDataUnsafe?.user?.id?.toString() || "";
  const telegramInitData = tg?.initData || "";
  const api = useApi(telegramId, telegramInitData);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function storeSessionToken(token) {
    if (!token) {
      return;
    }
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  }

  function clearSessionToken() {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  }

  function hasSessionToken() {
    return Boolean(getCurrentSessionToken());
  }

  function rememberAccount(user, token) {
    if (!user?.telegram_id) {
      return [];
    }

    const normalizedToken = token?.toString().trim() || getCurrentSessionToken();
    const existingAccounts = readRememberedAccounts();
    const existingAccount = existingAccounts.find((item) => item.id === user.telegram_id.toString().trim());

    const nextAccounts = [
      {
        id: user.telegram_id.toString().trim(),
        label: user.username || user.name || `Profil ${user.id}`,
        username: user.username || user.name || "",
        familyName: user.familyName || "",
        familyId: typeof user.family_id === "number" ? user.family_id : null,
        role: user.role || "",
        lastUsedAt: Date.now(),
        token: normalizedToken || existingAccount?.token || "",
        pinned: Boolean(existingAccount?.pinned),
      },
      ...existingAccounts.filter((item) => item.id !== user.telegram_id.toString().trim()),
    ].slice(0, 10);

    writeRememberedAccounts(nextAccounts);
    return nextAccounts;
  }

  async function restoreRememberedAccount(accountId) {
    const normalizedId = accountId?.toString().trim();
    if (!normalizedId) {
      return false;
    }

    const account = readRememberedAccounts().find((item) => item.id === normalizedId);
    if (!account?.token) {
      return false;
    }

    try {
      storeSessionToken(account.token);
      const hasValidSession = await verifySessionToken();
      if (!hasValidSession) {
        clearSessionToken();
        return false;
      }

      await refreshUser();
      return true;
    } catch {
      clearSessionToken();
      return false;
    }
  }

  async function useRememberedAccount(accountId) {
    const restored = await restoreRememberedAccount(accountId);
    if (restored) {
      return true;
    }

    // Pokud máme reálný Telegram initData, zkusíme získat nový JWT místo demo mode.
    // To opravuje situaci, kdy vyprší uložený token, ale Telegram session je stále platná.
    if (telegramInitData) {
      clearSessionToken();
      setUser(null);
      try {
        await loginWithTelegramSession();
        await refreshUser();
        return true;
      } catch {
        // Telegram auth selhalo – padneme na demo fallback níže.
      }
    }

    // Fallback pro demo mode (žádný Telegram initData není dostupný): přihlásíme přes ID profilu.
    clearSessionToken();
    setUser(null);
    return loginWithDemoIdRaw(accountId);
  }

  async function refreshUser() {
    const currentUser = await api("/users/me");
    if (!currentUser || typeof currentUser !== "object") {
      throw new Error(USER_MESSAGES.loadUserError);
    }
    setUser(currentUser);
    if (rememberProfile) {
      let familyName = "";
      if (currentUser?.family_id) {
        try {
          const family = await api("/families/me");
          familyName = family?.name || "";
        } catch {
          familyName = "";
        }
      }
      rememberProfile({
        id: currentUser.telegram_id || currentUser.id,
        username: currentUser.username,
        familyId: currentUser.family_id,
        familyName,
        role: currentUser.role,
        label: currentUser.username || `Profil ${currentUser.id}`,
        token: getCurrentSessionToken(),
      });
    }
    setError("");
    return currentUser;
  }

  async function loginWithTelegramSession() {
    if (!telegramInitData) {
      throw new Error("Telegram initData neni dostupne.");
    }

    const authResponse = await api("/auth", {
      method: "POST",
      body: {
        initData: telegramInitData,
      },
      includeTelegramHeaders: false,
    });
    storeSessionToken(authResponse?.token || "");
    if (authResponse?.user) {
      rememberAccount(authResponse.user, authResponse?.token || "");
    }
    return authResponse;
  }

  async function verifySessionToken() {
    if (!hasSessionToken()) {
      return false;
    }

    try {
      await api("/auth/verify", {
        includeTelegramHeaders: false,
      });
      return true;
    } catch {
      clearSessionToken();
      return false;
    }
  }

  function logout() {
    clearSessionToken();
    setUser(null);
    setError("");
    setLoading(false);
    telegramLogout();
  }

  function loginWithDemoId(profileId) {
    clearSessionToken();
    setUser(null);
    return loginWithDemoIdRaw(profileId);
  }

  function useTelegramAccount() {
    clearSessionToken();
    setUser(null);
    return useTelegramAccountRaw();
  }

  function clearSavedProfiles() {
    clearSessionToken();
    window.localStorage.removeItem(ACCOUNT_VAULT_KEY);
    window.localStorage.removeItem("familyquest_saved_profiles");
    clearSavedProfilesRaw();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  useEffect(() => {
    let active = true;

    if (!telegramReady) {
      setLoading(true);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");

    (async () => {
      const hasValidSession = await verifySessionToken();

      if (!hasValidSession) {
        const rememberedAccount = readRememberedAccounts().find((item) => item.token);
        if (rememberedAccount) {
          const restored = await restoreRememberedAccount(rememberedAccount.id);
          if (restored) {
            if (active) {
              setLoading(false);
            }
            return;
          }
        }

        if (!hasAuthData) {
          if (active) {
            setUser(null);
            setError(USER_MESSAGES.missingAuthData);
            setLoading(false);
          }
          return;
        }

        try {
          await loginWithTelegramSession();
        } catch (authError) {
          if (active) {
            setUser(null);
            setError(getErrorMessage(authError, USER_MESSAGES.loadUserError));
            setLoading(false);
          }
          return;
        }
      }

      try {
        await refreshUser();
      } catch (loadError) {
        if (active) {
          setUser(null);
          setError(getErrorMessage(loadError, USER_MESSAGES.loadUserError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [api, hasAuthData, telegramInitData, telegramReady]);

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        error,
        api,
        telegramId,
        telegramInitData,
        telegramReady,
        hasAuthData,
        isDemoMode,
        telegramError,
        tg,
        savedProfiles,
        setUser,
        refreshUser,
        logout,
        loginWithDemoId,
        useRememberedAccount,
        removeSavedProfile,
        clearSavedProfiles,
        renameSavedProfile,
        togglePinnedProfile,
        rememberProfile,
        useTelegramAccount,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
