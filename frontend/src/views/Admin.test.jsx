import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Admin from "./Admin";

const apiMock = vi.fn();
const rewriteMock = vi.fn();

vi.mock("../context/UserContext", () => ({
  useUser: () => ({
    api: apiMock,
  }),
}));

// Panely s vlastnim nacitanim dat se testuji samostatne (src/components/*.test.jsx).
vi.mock("../components/FamilyGoalCard", () => ({ default: () => null }));
vi.mock("../components/WeeklyOverview", () => ({ default: () => null }));
vi.mock("../components/OffersManager", () => ({ default: () => null }));
vi.mock("../components/WishInbox", () => ({ default: () => null }));
vi.mock("../components/QuietHoursSettings", () => ({ default: () => null }));
vi.mock("../components/DataPrivacyPanel", () => ({ default: () => null }));

vi.mock("../hooks/useGroqRewrite", () => ({
  useGroqRewrite: () => ({
    rewriteTask: rewriteMock,
    rewriteReward: rewriteMock,
    loading: false,
    error: null,
  }),
}));

const users = [
  { id: 1, role: "parent", username: "Parent", telegram_id: "admin-1" },
  { id: 2, role: "child", username: "Kid", telegram_id: "player-1" },
];
const family = { id: 1, name: "Demelovi", invite_code: "ABC123", members: users };

const tasks = [
  {
    id: 1,
    title: "Extra cteni",
    description: "20 minut",
    xp: 15,
    gold: 1,
    is_daily: false,
    is_completed: true,
    approved: false,
    user_id: 2,
  },
];

const rewards = [{ id: 1, name: "Film", description: "Vyber filmu", cost: 8 }];

beforeEach(() => {
  apiMock.mockReset();
  rewriteMock.mockReset();
  window.localStorage.clear();
  apiMock.mockResolvedValueOnce(users).mockResolvedValueOnce(family).mockResolvedValueOnce([]);
});

test("zobrazi tasky a rewardy po nacteni", async () => {
  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));

  expect(await screen.findByText("Extra cteni")).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Záložka Odměny" }));
  expect(screen.getByText("Film")).toBeInTheDocument();
});

test("schvali mimoradny ukol", async () => {
  const user = userEvent.setup();
  const onApproveTask = vi.fn().mockResolvedValue({ detail: "Úkol byl schválen." });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={onApproveTask}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));

  await screen.findByText("Extra cteni");
  await user.click(screen.getByRole("button", { name: "Schválit" }));

  expect(onApproveTask).toHaveBeenCalledWith(1);
  expect(await screen.findByText("Úkol byl schválen.")).toBeInTheDocument();
});

test("klik na ukol otevre upravu a ulozi zmeny", async () => {
  const user = userEvent.setup();
  const onDataChanged = vi.fn();

  apiMock.mockResolvedValueOnce({ ...tasks[0], title: "Extra cteni deluxe" });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={onDataChanged}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));

  await screen.findByText("Extra cteni");
  await user.click(screen.getByRole("button", { name: /extra cteni/i }));

  expect(await screen.findByText("Upravit úkol")).toBeInTheDocument();
  const taskSection = screen.getByText("Upravit úkol").closest("section");
  const taskQueries = within(taskSection);
  const titleInput = taskQueries.getByRole("textbox", { name: "Název" });
  await user.clear(titleInput);
  await user.type(titleInput, "Extra cteni deluxe");
  await user.click(taskQueries.getByRole("button", { name: "Uložit změny" }));

  expect(apiMock).toHaveBeenCalledWith("/tasks/1", {
    method: "PUT",
    body: {
      title: "Extra cteni deluxe",
      description: "20 minut",
      xp: 15,
      gold: 1,
      is_daily: false,
      requires_proof: false,
      due_date: null,
      due_time: null,
      recurrence: null,
      recurrence_days: null,
      user_id: 2,
    },
  });
  expect(await screen.findByText("Úkol byl upraven.")).toBeInTheDocument();
  expect(onDataChanged).toHaveBeenCalled();
  // Po uložení se formulář zavře (na telefonu by jinak zakrýval spodní menu)
  expect(screen.queryByRole("button", { name: "Uložit změny" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ Přidat úkol" })).toBeInTheDocument();
});

test("vytvori novou odmenu", async () => {
  const user = userEvent.setup();
  const onDataChanged = vi.fn();
  apiMock
    .mockResolvedValueOnce(users)
    .mockResolvedValueOnce(family)
    .mockResolvedValueOnce({ id: 99, name: "Zoo", cost: 12, description: "Vylet" });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={onDataChanged}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Odměny" }));

  await screen.findByText("Nová odměna");
  const rewardSection = screen.getByText("Nová odměna").closest("section");
  const rewardQueries = within(rewardSection);
  await user.type(rewardQueries.getByRole("textbox", { name: "Název" }), "Zoo");
  await user.type(rewardQueries.getByRole("textbox", { name: "Popis" }), "Vylet");
  await user.clear(rewardQueries.getByRole("spinbutton", { name: /cena ve zlatě/i }));
  await user.type(rewardQueries.getByRole("spinbutton", { name: /cena ve zlatě/i }), "12");
  await user.click(rewardQueries.getByRole("button", { name: "Vytvořit odměnu" }));

  expect(apiMock).toHaveBeenCalledWith("/rewards/", {
    method: "POST",
    body: {
      name: "Zoo",
      description: "Vylet",
      cost: 12,
    },
  });
  expect(onDataChanged).toHaveBeenCalled();
});

test("vygeneruje navrh ukolu pomoci AI", async () => {
  const user = userEvent.setup();
  rewriteMock.mockResolvedValue({
    herni_nazev: "Vyprava za cistym pokojem",
    xp: 27,
    style: "epicke",
  });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));
  await user.click(screen.getByRole("button", { name: "+ Přidat úkol" }));

  await screen.findByText("Nový úkol");
  const descriptionFields = screen.getAllByRole("textbox", { name: /popis/i });
  await user.type(descriptionFields[0], "Uklidit pokoj a stul");
  await user.click(screen.getByRole("button", { name: "Navrhnout herní úkol pomocí AI" }));

  expect(rewriteMock).toHaveBeenCalledWith("Uklidit pokoj a stul", "epicke");
  expect(screen.getByText("Návrh úkolu byl vygenerován.")).toBeInTheDocument();
  expect(
    screen.getByText((_, node) => {
      const text = (node?.textContent || "").replace(/\s+/g, " ").trim();
      return text === "Název: Vyprava za cistym pokojem";
    })
  ).toBeInTheDocument();
  expect(
    screen.getByText((_, node) => {
      const text = (node?.textContent || "").replace(/\s+/g, " ").trim();
      return text === "XP: 27";
    })
  ).toBeInTheDocument();
});

test("umi prevzit jen nazev nebo cele AI doporuceni", async () => {
  const user = userEvent.setup();
  rewriteMock.mockResolvedValue({
    herni_nazev: "Vyprava za cistym pokojem",
    xp: 27,
    style: "epicke",
  });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));
  await user.click(screen.getByRole("button", { name: "+ Přidat úkol" }));

  await screen.findByText("Nový úkol");
  const descriptionFields = screen.getAllByRole("textbox", { name: /popis/i });
  await user.type(descriptionFields[0], "Uklidit pokoj a stul");
  await user.click(screen.getByRole("button", { name: "Navrhnout herní úkol pomocí AI" }));

  await user.click(screen.getByRole("button", { name: "Převzít název" }));
  expect(await screen.findByDisplayValue("Vyprava za cistym pokojem")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: /^xp$/i })).toHaveValue(10);
  expect(screen.getByText("AI návrh doplnil název úkolu.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Převzít vše" }));
  expect(screen.getByRole("spinbutton", { name: /^xp$/i })).toHaveValue(27);
  expect(screen.getByText("AI návrh doplnil název i XP.")).toBeInTheDocument();
});

test("posila zvoleny styl a umi zkusit navrh znovu", async () => {
  const user = userEvent.setup();
  rewriteMock
    .mockResolvedValueOnce({ herni_nazev: "Mise granule", xp: 14, style: "vtipne" })
    .mockResolvedValueOnce({ herni_nazev: "Expresni granule", xp: 12, style: "kratke" });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));
  await user.click(screen.getByRole("button", { name: "+ Přidat úkol" }));

  await screen.findByText("Nový úkol");
  const descriptionFields = screen.getAllByRole("textbox", { name: /popis/i });
  await user.type(descriptionFields[0], "Nakrm kocku");
  await user.selectOptions(screen.getByRole("combobox", { name: /styl ai návrhu/i }), "vtipne");
  await user.click(screen.getByRole("button", { name: "Navrhnout herní úkol pomocí AI" }));

  expect(rewriteMock).toHaveBeenNthCalledWith(1, "Nakrm kocku", "vtipne");
  expect(screen.getByText(/Mise granule/)).toBeInTheDocument();

  await user.selectOptions(screen.getByRole("combobox", { name: /styl ai návrhu/i }), "kratke");
  await user.click(screen.getByRole("button", { name: "Zkusit znovu" }));

  expect(rewriteMock).toHaveBeenNthCalledWith(2, "Nakrm kocku", "kratke");
  expect(await screen.findByText(/Expresni granule/)).toBeInTheDocument();
});

test("ukaze chybu kdyz chybi popis pro AI navrh", async () => {
  const user = userEvent.setup();

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));
  await user.click(screen.getByRole("button", { name: "+ Přidat úkol" }));

  await screen.findByText("Nový úkol");
  await user.click(screen.getByRole("button", { name: "Navrhnout herní úkol pomocí AI" }));

  expect(rewriteMock).not.toHaveBeenCalled();
  expect(await screen.findByText("Nejdřív vyplň popis úkolu.")).toBeInTheDocument();
});

test("pamatuje si posledni zvoleny AI styl", async () => {
  const user = userEvent.setup();

  const { unmount } = render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );

  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));
  await user.click(screen.getByRole("button", { name: "+ Přidat úkol" }));
  await screen.findByText("Nový úkol");
  const styleSelect = screen.getByRole("combobox", { name: /styl ai návrhu/i });
  await user.selectOptions(styleSelect, "vtipne");
  expect(styleSelect).toHaveValue("vtipne");

  unmount();
  apiMock.mockReset();
  apiMock.mockResolvedValueOnce(users).mockResolvedValueOnce(family);

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));
  await user.click(screen.getByRole("button", { name: "+ Přidat úkol" }));

  expect(await screen.findByRole("combobox", { name: /styl ai návrhu/i })).toHaveValue("vtipne");
});

test("vygeneruje navrh odmeny pomoci AI a umi ho prevzit", async () => {
  const user = userEvent.setup();
  rewriteMock.mockResolvedValue({
    nazev_odmeny: "Kombo popcorn",
    cost: 9,
    style: "epicke",
  });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Odměny" }));

  await screen.findByText("Nová odměna");
  const rewardSection = screen.getByText("Nová odměna").closest("section");
  await user.type(within(rewardSection).getByRole("textbox", { name: /popis/i }), "Vecer s filmem a popcornem");
  await user.click(screen.getByRole("button", { name: "Navrhnout odměnu pomocí AI" }));

  expect(rewriteMock).toHaveBeenCalledWith("Vecer s filmem a popcornem", "epicke");
  expect(screen.getByText("Návrh odměny byl vygenerován.")).toBeInTheDocument();
  expect(screen.getByText("AI návrh odměny")).toBeInTheDocument();
  expect(screen.getByText(/Kombo popcorn/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Převzít vše" }));
  expect(await screen.findByDisplayValue("Kombo popcorn")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: /cena ve zlatě/i })).toHaveValue(9);
  expect(screen.getByText("AI návrh doplnil název i cenu odměny.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Zahodit návrh" }));
  expect(screen.queryByText("AI návrh odměny")).not.toBeInTheDocument();
});

test("rodinny AI plan umi naplanovat den a rozkopirovat stejne ukoly na cely tyden", async () => {
  const user = userEvent.setup();
  const onDataChanged = vi.fn();

  apiMock
    .mockResolvedValueOnce({
      children: [
        {
          user_id: 2,
          child_name: "Kid",
          age_hint: 8,
          history: { completed_last_14_days: 5 },
          tasks: [
            {
              title: "Ranni mise",
              description: "Start dne",
              xp: 15,
              gold: 5,
              requires_proof: false,
            },
          ],
        },
      ],
    })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce(users)
    .mockResolvedValueOnce(family)
    .mockResolvedValueOnce([]);

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={onDataChanged}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Rodina" }));

  await screen.findByText("AI denní plán pro celou rodinu");
  const plannerSection = screen.getByText("AI denní plán pro celou rodinu").closest("section");
  const plannerQueries = within(plannerSection);
  await user.clear(plannerQueries.getByRole("spinbutton", { name: /úkolů na dítě/i }));
  await user.type(plannerQueries.getByRole("spinbutton", { name: /úkolů na dítě/i }), "1");
  await user.clear(plannerQueries.getByLabelText("Den plánu"));
  await user.type(plannerQueries.getByLabelText("Den plánu"), "2026-05-27");
  await user.click(plannerQueries.getByRole("button", { name: "Vygenerovat rodinný plán" }));

  expect(apiMock).toHaveBeenCalledWith("/ai/plan-family-daily", {
    method: "POST",
    body: {
      goal: "zodpovednost",
      style: "epicke",
      tasks_per_child: 1,
    },
  });

  await waitFor(() => {
    expect(plannerQueries.getByRole("button", { name: /Aplikovat plán \(1\)/i })).toBeEnabled();
  });
  await user.click(plannerQueries.getByLabelText("Stejné úkoly každý den celý týden"));
  await user.click(plannerQueries.getByRole("button", { name: /Aplikovat plán/i }));

  await waitFor(() => {
    expect(apiMock.mock.calls.find(([url]) => url === "/tasks/bulk/create")).toBeTruthy();
  });

  const bulkCreateCall = apiMock.mock.calls.find(([url]) => url === "/tasks/bulk/create");
  expect(bulkCreateCall[1].body.tasks).toHaveLength(7);
  expect(bulkCreateCall[1].body.tasks[0]).toMatchObject({
    title: "Ranni mise",
    user_id: 2,
    due_date: "2026-05-27",
    is_daily: false,
  });
  expect(bulkCreateCall[1].body.tasks[6].due_date).toBe("2026-06-02");
  expect(onDataChanged).toHaveBeenCalled();
});

test("nový úkol jde zavřít tlačítkem Zrušit bez uložení", async () => {
  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Záložka Úkoly" }));
  await user.click(screen.getByRole("button", { name: "+ Přidat úkol" }));

  await user.type(screen.getByRole("textbox", { name: /Název/ }), "Rozdělaný úkol");
  await user.click(screen.getByRole("button", { name: "Zrušit" }));

  expect(screen.queryByRole("button", { name: "Vytvořit úkol" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ Přidat úkol" })).toBeInTheDocument();
  expect(apiMock).not.toHaveBeenCalledWith("/tasks/", expect.anything());
});

test("odměnu jde upravit a uložit novou cenu", async () => {
  const user = userEvent.setup();
  apiMock.mockResolvedValueOnce({ ...rewards[0], cost: 12 });
  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Odměny" }));
  await user.click(screen.getByRole("button", { name: "Upravit odměnu Film" }));

  expect(await screen.findByText("Upravit odměnu")).toBeInTheDocument();
  const form = within(screen.getByText("Upravit odměnu").closest("section"));
  expect(form.getByRole("textbox", { name: "Název" })).toHaveValue("Film");

  const cost = form.getByRole("spinbutton");
  await user.clear(cost);
  await user.type(cost, "12");
  await user.click(form.getByRole("button", { name: "Uložit změny" }));

  expect(apiMock).toHaveBeenCalledWith("/rewards/1", {
    method: "PUT",
    body: { name: "Film", description: "Vyber filmu", cost: 12 },
  });
  expect(await screen.findByText("Odměna byla upravena.")).toBeInTheDocument();
  expect(screen.getByText("Nová odměna")).toBeInTheDocument();
});

test("úprava odměny jde zrušit bez uložení", async () => {
  const user = userEvent.setup();
  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={vi.fn()}
      onDataChanged={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: "Záložka Odměny" }));
  await user.click(screen.getByRole("button", { name: "Upravit odměnu Film" }));
  await user.click(await screen.findByRole("button", { name: "Zrušit úpravu" }));

  expect(screen.getByText("Nová odměna")).toBeInTheDocument();
  expect(apiMock).not.toHaveBeenCalledWith("/rewards/1", expect.anything());
});

