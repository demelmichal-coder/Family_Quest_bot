import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const apiMock = vi.fn();
const refreshUserMock = vi.fn();

let useUserState = {
  user: null,
  loading: false,
  error: "",
  api: apiMock,
  refreshUser: refreshUserMock,
  hasAuthData: true,
  telegramReady: true,
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
  useUserState = {
    user: null,
    loading: false,
    error: "",
    api: apiMock,
    refreshUser: refreshUserMock,
    hasAuthData: true,
    telegramReady: true,
  };
});

test("zobrazi loading stav pri cekani na telegram nebo uzivatele", () => {
  useUserState = {
    ...useUserState,
    loading: true,
  };

  render(<App />);

  expect(screen.getByText("Nacitam Family Quest")).toBeInTheDocument();
});

test("zobrazi auth chybu kdyz chybi overeni", () => {
  useUserState = {
    ...useUserState,
    hasAuthData: false,
  };

  render(<App />);

  expect(screen.getByText("Aplikaci se nepodarilo overit")).toBeInTheDocument();
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
    .mockResolvedValueOnce({ members: 2 });

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
