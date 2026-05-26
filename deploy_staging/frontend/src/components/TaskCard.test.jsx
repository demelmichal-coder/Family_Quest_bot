import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskCard from "./TaskCard";

test("zobrazi nazev, odmeny a cekani na schvaleni u mimoradneho ukolu", () => {
  render(
    <TaskCard
      title="Uklidit pokoj"
      description="Uklid cele patro"
      xp={30}
      gold={4}
      isDaily={false}
      isCompleted={false}
      approved={false}
      onComplete={() => {}}
    />
  );

  expect(screen.getByText("Uklidit pokoj")).toBeInTheDocument();
  expect(screen.getByText("30 XP")).toBeInTheDocument();
  expect(screen.getByText("4 zlata")).toBeInTheDocument();
  expect(screen.getByText("Ceka na schvaleni")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Splnit ukol" })).toBeDisabled();
});

test("spusti dokonceni ukolu, kdyz je pripraveny", async () => {
  const user = userEvent.setup();
  const onComplete = vi.fn();

  render(
    <TaskCard
      title="Vynest kos"
      description=""
      xp={10}
      gold={2}
      isDaily={true}
      isCompleted={false}
      approved={true}
      onComplete={onComplete}
    />
  );

  await user.click(screen.getByRole("button", { name: "Splnit ukol" }));

  expect(onComplete).toHaveBeenCalledTimes(1);
});
