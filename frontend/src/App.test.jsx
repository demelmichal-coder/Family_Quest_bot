import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const apiMock = vi.fn();
const refreshUserMock = vi.fn();
const logoutMock = vi.fn();
const loginWithDemoIdMock = vi.fn();
const removeSavedProfileMock = vi.fn();
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
  logout: logoutMock,
  loginWithDemoId: loginWithDemoIdMock,
  removeSavedProfile: removeSavedProfileMock,
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
  removeSavedProfileMock.mockReset();
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
    logout: logoutMock,
    loginWithDemoId: loginWithDemoIdMock,
    removeSavedProfile: removeSavedProfileMock,
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

  expect(screen.getByText("Nacitam Family Quest")).toBeInTheDocument();
});

test("zobrazi prihlasovaci stranku kdyz chybi overeni", () => {
  useUserState = {
    ...useUserState,
    hasAuthData: false,
  };

  render(<App />);

  expect(screen.getByText("Prihlaseni")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Prihlasit profil" })).toBeInTheDocument();
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
      },
    ],
  };

  render(<App />);

  expect(screen.getByText("Ulozene profily")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Mamka.*Demelovi/i })).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: /Smazat profil Mamka/i }));

  expect(window.confirm).toHaveBeenCalled();
  expect(removeSavedProfileMock).toHaveBeenCalledWith("player-1");
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

  await user.click(screen.getByRole("button", { name: /Prejmenovat profil Mamka/i }));

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

  await user.click(screen.getByRole("button", { name: /Pripnout profil Mamka/i }));

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

  await user.click(screen.getByRole("button", { name: "Odhlasit" }));

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

  await user.click(screen.getByRole("button", { name: "Prepnout na dashboard" }));

  await waitFor(() => {
    expect(screen.getByText("Dashboard for Parent (1/1)")).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Prepnout na administraci" }));

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
