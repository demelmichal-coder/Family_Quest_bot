import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "./Dashboard";

vi.mock("../components/ConfettiReward", () => ({
  default: ({ show }) => <div data-testid="confetti">{show ? "on" : "off"}</div>,
}));

vi.mock("../context/UserContext", () => ({
  useUser: () => ({
    api: vi.fn(),
    setUser: vi.fn(),
  }),
}));

const user = {
  id: 1,
  username: "Kid",
  xp: 135,
  gold: 12,
};

const tasks = [
  {
    id: 1,
    title: "Uklidit pokoj",
    description: "Police i podlaha",
    xp: 20,
    gold: 3,
    is_daily: true,
    is_completed: false,
    approved: true,
    due_time: "07:00",
  },
  {
    id: 2,
    title: "Precist knihu",
    description: "",
    xp: 15,
    gold: 2,
    is_daily: false,
    is_completed: true,
    approved: true,
  },
  {
    id: 3,
    title: "Uklid odpoledne",
    description: "Stul a lego",
    xp: 12,
    gold: 1,
    is_daily: false,
    is_completed: false,
    approved: false,
  },
];

const rewards = [
  { id: 1, name: "Filmovy vecer", description: "Vyber filmu", cost: 8 },
];

const purchases = [{ id: 1, reward_name: "Zmrzlina", cost: 5 }];

test("zobrazi denni a mimoradne ukoly oddelene", () => {
  render(
    <Dashboard
      user={user}
      tasks={tasks}
      rewards={rewards}
      purchases={purchases}
      onCompleteTask={vi.fn()}
      onBuyReward={vi.fn()}
    />
  );

  expect(screen.getByRole("heading", { name: "Dnesni ukoly" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Mimoradne ukoly" })).toBeInTheDocument();
  expect(screen.getByText("Level 2")).toBeInTheDocument();
  expect(screen.getByText("135")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.getAllByText("Uklidit pokoj").length).toBeGreaterThan(0);
  expect(screen.getByText("Precist knihu")).toBeInTheDocument();
  expect(screen.getAllByText("Uklid odpoledne").length).toBeGreaterThan(0);
  expect(screen.getByText("Pripominka v 07:00")).toBeInTheDocument();
});

test("dokonci ukol a ukaze potvrzeni", async () => {
  const appUser = userEvent.setup();
  const onCompleteTask = vi.fn().mockResolvedValue({
    detail: "Ukol byl odeslan rodici ke schvaleni.",
    task: { approved: false },
  });

  render(
    <Dashboard
      user={user}
      tasks={tasks}
      rewards={rewards}
      purchases={purchases}
      onCompleteTask={onCompleteTask}
      onBuyReward={vi.fn()}
    />
  );

  await appUser.click(screen.getByRole("button", { name: "Oznacit jako splnene" }));

  expect(onCompleteTask).toHaveBeenCalledWith(3);
  expect(await screen.findByText("Ukol byl odeslan rodici ke schvaleni.")).toBeInTheDocument();
  expect(screen.getByTestId("confetti")).toHaveTextContent("off");
});

test("prepne se do shopu", async () => {
  const appUser = userEvent.setup();

  render(
    <Dashboard
      user={user}
      tasks={tasks}
      rewards={rewards}
      purchases={purchases}
      onCompleteTask={vi.fn()}
      onBuyReward={vi.fn()}
    />
  );

  await appUser.click(screen.getByRole("button", { name: "Obchod" }));

  await waitFor(() => {
    expect(screen.getByText("Obchod s odmenami")).toBeInTheDocument();
  });
  expect(screen.getByText("Filmovy vecer")).toBeInTheDocument();
});
