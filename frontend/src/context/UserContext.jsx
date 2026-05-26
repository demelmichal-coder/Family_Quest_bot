import React, { createContext, useContext, useEffect, useState } from "react";
import { USER_MESSAGES } from "../constants/messages";
import { useApi } from "../hooks/useApi";
import { useTelegram } from "../hooks/useTelegram";
import { getErrorMessage } from "../utils/errors";

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
  removeSavedProfile: () => [],
  renameSavedProfile: () => [],
  togglePinnedProfile: () => [],
  useTelegramAccount: () => false,
};

const UserContext = createContext(defaultContextValue);

export function UserProvider({ children }) {
  const {
    tg,
    ready: telegramReady,
    hasAuthData,
    error: telegramError,
    isDemoMode,
    loginWithDemoId,
    rememberProfile,
    removeSavedProfile,
    renameSavedProfile,
    togglePinnedProfile,
    savedProfiles,
    useTelegramAccount,
    logout: telegramLogout,
  } = useTelegram();
  const telegramId = tg?.initDataUnsafe?.user?.id?.toString() || "";
  const telegramInitData = tg?.initData || "";
  const api = useApi(telegramId, telegramInitData);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refreshUser() {
    const currentUser = await api("/users/me");
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
      });
    }
    setError("");
    return currentUser;
  }

  function logout() {
    setUser(null);
    setError("");
    setLoading(false);
    telegramLogout();
  }

  useEffect(() => {
    let active = true;

    if (!telegramReady) {
      setLoading(true);
      return () => {
        active = false;
      };
    }

    if (!hasAuthData) {
      if (active) {
        setUser(null);
        setError(USER_MESSAGES.missingAuthData);
        setLoading(false);
      }
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");
    refreshUser()
      .catch((loadError) => {
        if (active) {
          setUser(null);
          setError(getErrorMessage(loadError, USER_MESSAGES.loadUserError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

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
        removeSavedProfile,
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
