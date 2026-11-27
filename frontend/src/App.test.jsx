import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const apiMock = vi.fn();
const refreshUserMock = vi.fn();
const logoutMock = vi.fn();
const loginWithDemoIdMock = vi.fn();
const useRememberedAccountMock = vi.fn();
const removeSavedProfileMock = vi.fn();
const clearSavedProfilesMock = vi.fn();
const renameSavedProfileMock = vi.fn();
const togglePinnedProfileMock = vi.fn();
const useTelegramAccountMock = vi.fn();

let useUserState = {
  user: null,
  loading: false,
  error: "",
  api: apiMock,
  refreshUser: refreshUserMock,
  hasAuthData: true,
  telegramReady: true,
  telegramId: "",
  telegramInitData: "",
  logout: logoutMock,
  loginWithDemoId: loginWithDemoIdMock,
  useRememberedAccount: useRememberedAccountMock,
  removeSavedProfile: removeSavedProfileMock,
  clearSavedProfiles: clearSavedProfilesMock,
  renameSavedProfile: renameSavedProfileMock,
  togglePinnedProfile: togglePinnedProfileMock,
  useTelegramAccount: useTelegramAccountMock,
  savedProfiles: [],
  isDemoMode: true,
  tg: null,
};

vi.mock("./context/UserContext", () => ({
  useUser: () => useUserState,
}));

vi.mock("./views/Onboarding", () => ({
  default: ({ user }) => <div>Onboarding for {user.username}</div>,
}));

vi.mock("./views/Dashboard", () => ({
  default: ({ user, tasks, rewards }) => (
    <div>
      Dashboard for {user.username} ({tasks.length}/{rewards.length})
    </div>
  ),
}));

vi.mock("./views/Admin", () => ({
  default: ({ user, tasks, rewards }) => (
    <div>
      Admin for {user.username} ({tasks.length}/{rewards.length})
    </div>
  ),
}));

beforeEach(() => {
  apiMock.mockReset();
  refreshUserMock.mockReset();
  logoutMock.mockReset();
  loginWithDemoIdMock.mockReset();
  useRememberedAccountMock.mockReset();
  removeSavedProfileMock.mockReset();
  clearSavedProfilesMock.mockReset();
  renameSavedProfileMock.mockReset();
  togglePinnedProfileMock.mockReset();
  useTelegramAccountMock.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "prompt").mockReturnValue("Mamka 2");
  useUserState = {
    user: null,
    loading: false,
    error: "",
    api: apiMock,
    refreshUser: refreshUserMock,
    hasAuthData: true,
    telegramReady: true,
    telegramId: "",
    telegramInitData: "",
    logout: logoutMock,
    loginWithDemoId: loginWithDemoIdMock,
    useRememberedAccount: useRememberedAccountMock,
    removeSavedProfile: removeSavedProfileMock,
    clearSavedProfiles: clearSavedProfilesMock,
    renameSavedProfile: renameSavedProfileMock,
    togglePinnedProfile: togglePinnedProfileMock,
    useTelegramAccount: useTelegramAccountMock,
    savedProfiles: [],
    isDemoMode: true,
    tg: null,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("zobrazi loading stav pri cekani na telegram nebo uzivatele", () => {
  useUserState = {
    ...useUserState,
    loading: true,
  };

  render(<App />);

  expect(screen.getByText("Načítám Family Quest")).toBeInTheDocument();
});

test("zobrazi prihlasovaci stranku kdyz chybi overeni", () => {
  useUserState = {
    ...useUserState,
    hasAuthData: false,
  };

  render(<App />);

  expect(screen.getByText("Přihlášení")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Založit novou rodinu" })).toBeInTheDocument();
});

test("zobrazi prihlasovaci stranku misto slepe cesty kdyz Telegram posle jen id bez podepsaneho initData", () => {
  useUserState = {
    ...useUserState,
    hasAuthData: true,
    isDemoMode: false,
    telegramId: "123456",
    error: "Telegram neposlal auth data miniaplikaci.",
  };

  render(<App />);

  expect(screen.getByText("Přihlášení")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Přihlásit profil" })).toBeInTheDocument();
});

test("tlacitko pokracovat jako telegram ucet zavola prepnuti", async () => {
  const user = userEvent.setup();
  useTelegramAccountMock.mockReturnValue(true);
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    isDemoMode: false,
    telegramReady: true,
    telegramId: "123456",
    telegramInitData: "telegram-auth",
    tg: {
      initData: "telegram-auth",
      initDataUnsafe: {
        user: {
          id: 123456,
        },
      },
    },
  };

  render(<App />);

  await user.click(screen.getByRole("button", { name: "Pokračovat jako aktualni Telegram ucet" }));

  expect(useTelegramAccountMock).toHaveBeenCalled();
});

test("tlacitko pokracovat jako telegram ucet se neskryte nezobrazi v demo modu", () => {
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    isDemoMode: true,
    tg: {
      initData: "",
      initDataUnsafe: {
        user: {
          id: "demo-1",
        },
      },
    },
  };

  render(<App />);

  expect(
    screen.queryByRole("button", { name: "Pokračovat jako aktualni Telegram ucet" })
  ).not.toBeInTheDocument();
});

test("nabidne ulozene profily pro rychly navrat do rodiny", () => {
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    savedProfiles: [
      {
        id: "player-1",
        label: "Mamka",
        familyName: "Demelovi",
        familyId: 12,
        role: "parent",
        token: "jwt-token-1",
      },
    ],
  };

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Mám uložený profil" }));

  expect(screen.getByText("Uložené profily")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Mamka.*Demelovi/i })).toBeInTheDocument();
});

test("obnovi ulozeny ucet jednim klikem", async () => {
  const user = userEvent.setup();
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    savedProfiles: [
      {
        id: "player-1",
        label: "Mamka",
        familyName: "Demelovi",
        familyId: 12,
        role: "parent",
        token: "jwt-token-1",
      },
    ],
  };

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Mám uložený profil" }));

  await user.click(screen.getByRole("button", { name: /Mamka.*Demelovi/i }));

  expect(useRememberedAccountMock).toHaveBeenCalledWith("player-1");
});

test("klik na ulozeny profil bez tokenu take funguje", async () => {
  const user = userEvent.setup();
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    savedProfiles: [
      {
        id: "player-2",
        label: "Tata",
        familyName: "Demelovi",
        familyId: 12,
        role: "parent",
        token: "",
      },
    ],
  };

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Mám uložený profil" }));

  await user.click(screen.getByRole("button", { name: /Tata.*Demelovi/i }));

  expect(useRememberedAccountMock).toHaveBeenCalledWith("player-2");
});

test("umozni smazat ulozeny profil z prihlaseni", async () => {
  const user = userEvent.setup();
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    savedProfiles: [
      {
        id: "player-1",
        label: "Mamka",
        familyName: "Demelovi",
        familyId: 12,
        role: "parent",
      },
    ],
  };

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Mám uložený profil" }));

  await user.click(screen.getByRole("button", { name: /Smazat profil Mamka/i }));

  expect(window.confirm).toHaveBeenCalled();
  expect(removeSavedProfileMock).toHaveBeenCalledWith("player-1");
});

test("umozni vycistit vsechny ulozene profily", async () => {
  const user = userEvent.setup();
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    savedProfiles: [
      {
        id: "player-1",
        label: "Mamka",
        familyName: "Demelovi",
        familyId: 12,
        role: "parent",
      },
    ],
  };

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Mám uložený profil" }));

  await user.click(screen.getByRole("button", { name: "Vyčistit všechny uložené profily" }));

  expect(clearSavedProfilesMock).toHaveBeenCalled();
  expect(
    screen.getByText("Uložené profily byly vyčištěny. Přihlas se znovu a založ rodinu.")
  ).toBeInTheDocument();
});

test("umozni prejmenovat ulozeny profil", async () => {
  const user = userEvent.setup();
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    savedProfiles: [
      {
        id: "player-1",
        label: "Mamka",
        familyName: "Demelovi",
        familyId: 12,
        role: "parent",
      },
    ],
  };

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Mám uložený profil" }));

  await user.click(screen.getByRole("button", { name: /Přejmenovat profil Mamka/i }));

  expect(window.prompt).toHaveBeenCalled();
  expect(renameSavedProfileMock).toHaveBeenCalledWith("player-1", "Mamka 2");
});

test("umozni pripnout ulozeny profil", async () => {
  const user = userEvent.setup();
  useUserState = {
    ...useUserState,
    hasAuthData: false,
    savedProfiles: [
      {
        id: "player-1",
        label: "Mamka",
        familyName: "Demelovi",
        familyId: 12,
        role: "parent",
      },
    ],
  };

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Mám uložený profil" }));

  await user.click(screen.getByRole("button", { name: /Připnout profil Mamka/i }));

  expect(togglePinnedProfileMock).toHaveBeenCalledWith("player-1");
});

test("odhlasi profil z aplikace", async () => {
  const user = userEvent.setup();
  useUserState = {
    ...useUserState,
    user: {
      id: 2,
      username: "Kid",
      role: "child",
      family_id: 1,
    },
  };
  apiMock
    .mockResolvedValueOnce([{ id: 1, title: "Task" }])
    .mockResolvedValueOnce([{ id: 1, name: "Reward" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ members: 2 });

  render(<App />);
  await screen.findByText("Dashboard for Kid (1/1)");

  await user.click(screen.getByRole("button", { name: "Odhlásit" }));

  expect(logoutMock).toHaveBeenCalled();
});

test("zobrazi onboarding pro pending uzivatele bez rodiny", () => {
  useUserState = {
    ...useUserState,
    user: {
      id: 1,
      username: "Nova",
      role: "pending",
      family_id: null,
    },
  };

  render(<App />);

  expect(screen.getByText("Onboarding for Nova")).toBeInTheDocument();
});

test("zobrazi dashboard diteti a nacte aplikacni data", async () => {
  apiMock
    .mockResolvedValueOnce([{ id: 1, title: "Task" }])
    .mockResolvedValueOnce([{ id: 1, name: "Reward" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ members: 2 });

  useUserState = {
    ...useUserState,
    user: {
      id: 2,
      username: "Kid",
      role: "child",
      family_id: 1,
    },
  };

  render(<App />);

  expect(await screen.findByText("Dashboard for Kid (1/1)")).toBeInTheDocument();
  expect(apiMock).toHaveBeenCalledWith("/tasks/");
  expect(apiMock).toHaveBeenCalledWith("/rewards/");
  expect(apiMock).toHaveBeenCalledWith("/game/purchase-history");
});

test("rodic se muze prepinat mezi admin a dashboard pohledem", async () => {
  apiMock
    .mockResolvedValueOnce([{ id: 1, title: "Task" }])
    .mockResolvedValueOnce([{ id: 1, name: "Reward" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ members: 2 })
    .mockResolvedValueOnce({
      period_days: 7,
      period_start: "2026-05-20",
      period_end: "2026-05-26",
      children_total: 1,
      active_children_7d: 1,
      assigned_tasks_7d: 5,
      completed_tasks_7d: 4,
      purchases_7d: 1,
      completion_rate_7d: 80,
      children: [],
    });

  useUserState = {
    ...useUserState,
    user: {
      id: 3,
      username: "Parent",
      role: "parent",
      family_id: 1,
    },
  };

  const user = userEvent.setup();
  render(<App />);

  expect(await screen.findByText("Admin for Parent (1/1)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Přepnout na dashboard" }));

  await waitFor(() => {
    expect(screen.getByText("Dashboard for Parent (1/1)")).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Přepnout na administraci" }));

  await waitFor(() => {
    expect(screen.getByText("Admin for Parent (1/1)")).toBeInTheDocument();
  });
});

test("zobrazi banner kdyz nacitani app dat selze", async () => {
  apiMock.mockRejectedValueOnce(new Error("Backend neni dostupny"));

  useUserState = {
    ...useUserState,
    user: {
      id: 4,
      username: "Kid",
      role: "child",
      family_id: 1,
    },
  };

  render(<App />);

  expect(await screen.findByText("Backend neni dostupny")).toBeInTheDocument();
});
