import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "./Dashboard";

vi.mock("../components/ConfettiReward", () => ({
  default: ({ show }) => <div data-testid="confetti">{show ? "on" : "off"}</div>,
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
];

const rewards = [
  { id: 1, name: "Filmovy vecer", description: "Vyber filmu", cost: 8 },
];

const purchases = [{ id: 1, reward_name: "Zmrzlina", cost: 5 }];

test("zobrazi mise a souhrn hrace", () => {
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

  expect(screen.getByText("Moje mise")).toBeInTheDocument();
  expect(screen.getByText("Level 2")).toBeInTheDocument();
  expect(screen.getByText("135")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.getByText("Uklidit pokoj")).toBeInTheDocument();
  expect(screen.getByText("Precist knihu")).toBeInTheDocument();
});

test("dokonci ukol a ukaze potvrzeni", async () => {
  const appUser = userEvent.setup();
  const onCompleteTask = vi.fn().mockResolvedValue({ detail: "Ukol splnen. +20 XP, +3 zlata." });

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

  await appUser.click(screen.getByRole("button", { name: "Splnit ukol" }));

  expect(onCompleteTask).toHaveBeenCalledWith(1);
  expect(await screen.findByText("Ukol splnen. +20 XP, +3 zlata.")).toBeInTheDocument();
  expect(screen.getByTestId("confetti")).toHaveTextContent("on");
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
