import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Shop from "./Shop";

const baseProps = {
  user: { gold: 10 },
  rewards: [{ id: 1, name: "Zmrzlina", description: "Vanilkova", cost: 6 }],
  purchases: [{ id: 1, reward_name: "Film", cost: 4 }],
};

test("zobrazi nabidku i historii nakupu", () => {
  render(<Shop {...baseProps} onBuyReward={vi.fn()} />);

  expect(screen.getByText("Obchod s odmenami")).toBeInTheDocument();
  expect(screen.getByText("Zmrzlina")).toBeInTheDocument();
  expect(screen.getByText("Vanilkova")).toBeInTheDocument();
  expect(screen.getByText("Film")).toBeInTheDocument();
});

test("nakoupi odmenu a zobrazi potvrzeni", async () => {
  const user = userEvent.setup();
  const onBuyReward = vi.fn().mockResolvedValue({ detail: "Koupeno: Zmrzlina." });

  render(<Shop {...baseProps} onBuyReward={onBuyReward} />);

  await user.click(screen.getByRole("button", { name: "Koupit odmenu" }));

  expect(onBuyReward).toHaveBeenCalledWith(1);
  expect(await screen.findByText("Koupeno: Zmrzlina.")).toBeInTheDocument();
});

test("zablokuje nakup pri nedostatku zlata", () => {
  render(
    <Shop
      {...baseProps}
      user={{ gold: 2 }}
      onBuyReward={vi.fn()}
    />
  );

  expect(screen.getByRole("button", { name: "Nedostatek zlata" })).toBeDisabled();
});
