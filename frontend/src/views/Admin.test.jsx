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

  expect(await screen.findByText("Extra cteni")).toBeInTheDocument();
  expect(screen.getByText("Film")).toBeInTheDocument();
});

test("schvali mimoradny ukol", async () => {
  const user = userEvent.setup();
  const onApproveTask = vi.fn().mockResolvedValue({ detail: "Ukol byl schvalen." });

  render(
    <Admin
      user={users[0]}
      tasks={tasks}
      rewards={rewards}
      onApproveTask={onApproveTask}
      onDataChanged={vi.fn()}
    />
  );

  await screen.findByText("Extra cteni");
  await user.click(screen.getByRole("button", { name: "Schvalit" }));

  expect(onApproveTask).toHaveBeenCalledWith(1);
  expect(await screen.findByText("Ukol byl schvalen.")).toBeInTheDocument();
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

  await screen.findByText("Extra cteni");
  await user.click(screen.getByRole("button", { name: /extra cteni/i }));

  expect(await screen.findByText("Upravit ukol")).toBeInTheDocument();
  const taskSection = screen.getByText("Upravit ukol").closest("section");
  const taskQueries = within(taskSection);
  const titleInput = taskQueries.getByRole("textbox", { name: "Nazev" });
  await user.clear(titleInput);
  await user.type(titleInput, "Extra cteni deluxe");
  await user.click(taskQueries.getByRole("button", { name: "Ulozit zmeny" }));

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
  expect(await screen.findByText("Ukol byl upraven.")).toBeInTheDocument();
  expect(onDataChanged).toHaveBeenCalled();
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

  await screen.findByText("Nova odmena");
  const rewardSection = screen.getByText("Nova odmena").closest("section");
  const rewardQueries = within(rewardSection);
  await user.type(rewardQueries.getByRole("textbox", { name: "Nazev" }), "Zoo");
  await user.type(rewardQueries.getByRole("textbox", { name: "Popis" }), "Vylet");
  await user.clear(rewardQueries.getByRole("spinbutton", { name: /cena ve zlate/i }));
  await user.type(rewardQueries.getByRole("spinbutton", { name: /cena ve zlate/i }), "12");
  await user.click(rewardQueries.getByRole("button", { name: "Vytvorit odmenu" }));

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

  await screen.findByText("Novy ukol");
  const descriptionFields = screen.getAllByRole("textbox", { name: /popis/i });
  await user.type(descriptionFields[0], "Uklidit pokoj a stul");
  await user.click(screen.getByRole("button", { name: "Navrhnout herni ukol pomoci AI" }));

  expect(rewriteMock).toHaveBeenCalledWith("Uklidit pokoj a stul", "epicke");
  expect(screen.getByText("Navrh ukolu byl vygenerovan.")).toBeInTheDocument();
  expect(
    screen.getByText((_, node) => {
      const text = (node?.textContent || "").replace(/\s+/g, " ").trim();
      return text === "Nazev: Vyprava za cistym pokojem";
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

  await screen.findByText("Novy ukol");
  const descriptionFields = screen.getAllByRole("textbox", { name: /popis/i });
  await user.type(descriptionFields[0], "Uklidit pokoj a stul");
  await user.click(screen.getByRole("button", { name: "Navrhnout herni ukol pomoci AI" }));

  await user.click(screen.getByRole("button", { name: "Prevzit nazev" }));
  expect(await screen.findByDisplayValue("Vyprava za cistym pokojem")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: /^xp$/i })).toHaveValue(10);
  expect(screen.getByText("AI navrh doplnil nazev ukolu.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Prevzit vse" }));
  expect(screen.getByRole("spinbutton", { name: /^xp$/i })).toHaveValue(27);
  expect(screen.getByText("AI navrh doplnil nazev i XP.")).toBeInTheDocument();
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

  await screen.findByText("Novy ukol");
  const descriptionFields = screen.getAllByRole("textbox", { name: /popis/i });
  await user.type(descriptionFields[0], "Nakrm kocku");
  await user.selectOptions(screen.getByRole("combobox", { name: /styl ai navrhu/i }), "vtipne");
  await user.click(screen.getByRole("button", { name: "Navrhnout herni ukol pomoci AI" }));

  expect(rewriteMock).toHaveBeenNthCalledWith(1, "Nakrm kocku", "vtipne");
  expect(screen.getByText(/Mise granule/)).toBeInTheDocument();

  await user.selectOptions(screen.getByRole("combobox", { name: /styl ai navrhu/i }), "kratke");
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

  await screen.findByText("Novy ukol");
  await user.click(screen.getByRole("button", { name: "Navrhnout herni ukol pomoci AI" }));

  expect(rewriteMock).not.toHaveBeenCalled();
  expect(await screen.findByText("Nejdriv vypln popis ukolu.")).toBeInTheDocument();
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

  await screen.findByText("Novy ukol");
  const styleSelect = screen.getByRole("combobox", { name: /styl ai navrhu/i });
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

  expect(await screen.findByRole("combobox", { name: /styl ai navrhu/i })).toHaveValue("vtipne");
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

  await screen.findByText("Nova odmena");
  const descriptionFields = screen.getAllByRole("textbox", { name: /popis/i });
  await user.type(descriptionFields[1], "Vecer s filmem a popcornem");
  await user.click(screen.getByRole("button", { name: "Navrhnout odmenu pomoci AI" }));

  expect(rewriteMock).toHaveBeenCalledWith("Vecer s filmem a popcornem", "epicke");
  expect(screen.getByText("Navrh odmeny byl vygenerovan.")).toBeInTheDocument();
  expect(screen.getByText("AI navrh odmeny")).toBeInTheDocument();
  expect(screen.getByText(/Kombo popcorn/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Prevzit vse" }));
  expect(await screen.findByDisplayValue("Kombo popcorn")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: /cena ve zlate/i })).toHaveValue(9);
  expect(screen.getByText("AI navrh doplnil nazev i cenu odmeny.")).toBeInTheDocument();
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

  await screen.findByText("AI denni plan pro celou rodinu");
  const plannerSection = screen.getByText("AI denni plan pro celou rodinu").closest("section");
  const plannerQueries = within(plannerSection);
  await user.clear(plannerQueries.getByRole("spinbutton", { name: /ukolu na dite/i }));
  await user.type(plannerQueries.getByRole("spinbutton", { name: /ukolu na dite/i }), "1");
  await user.clear(plannerQueries.getByLabelText("Den planu"));
  await user.type(plannerQueries.getByLabelText("Den planu"), "2026-05-27");
  await user.click(plannerQueries.getByRole("button", { name: "Vygenerovat rodinny plan" }));

  expect(apiMock).toHaveBeenCalledWith("/ai/plan-family-daily", {
    method: "POST",
    body: {
      goal: "zodpovednost",
      style: "epicke",
      tasks_per_child: 1,
    },
  });

  await waitFor(() => {
    expect(plannerQueries.getByRole("button", { name: /Aplikovat plan \(1\)/i })).toBeEnabled();
  });
  await user.click(plannerQueries.getByLabelText("Stejne ukoly kazdy den cely tyden"));
  await user.click(plannerQueries.getByRole("button", { name: /Aplikovat plan/i }));

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
