// TaskTemplates.jsx - Knihovna typických úkolů podle věku. Kliknutí vyplní formulář nového úkolu.
import React, { useState } from "react";

export const TASK_TEMPLATE_BANDS = [
  {
    id: "young",
    label: "Do 6 let",
    templates: [
      { title: "Uklidit hračky", description: "Všechny hračky zpátky do krabice.", xp: 10, gold: 1 },
      { title: "Obléct se samostatně", description: "Oblečení si vybere a obleče sám/sama.", xp: 8, gold: 1 },
      { title: "Pomoct s prostíráním", description: "Položit na stůl talíře a příbory.", xp: 8, gold: 1 },
      { title: "Odnést špinavé prádlo", description: "Špinavé oblečení do koše na prádlo.", xp: 6, gold: 0 },
      { title: "Zalít kytky", description: "Zalít pokojové květiny konvičkou.", xp: 8, gold: 1 },
      { title: "Vyčistit si zuby", description: "Ráno i večer, aspoň dvě minuty.", xp: 5, gold: 0 },
    ],
  },
  {
    id: "mid",
    label: "7–10 let",
    templates: [
      { title: "Připravit si věci do školy", description: "Zkontrolovat aktovku a pomůcky na další den.", xp: 10, gold: 1 },
      { title: "Úkoly do školy", description: "Hotové domácí úkoly bez připomínání.", xp: 20, gold: 2 },
      { title: "Uklidit si pokoj", description: "Podlaha, postel a stůl bez nepořádku.", xp: 15, gold: 2 },
      { title: "Nakrmit domácí zvíře", description: "Dát jídlo a čerstvou vodu.", xp: 10, gold: 1 },
      { title: "Vynést odpadky", description: "Vynést koš a vyměnit pytel.", xp: 12, gold: 1 },
      { title: "Pomoct s nádobím", description: "Utřít nebo vyskládat nádobí.", xp: 12, gold: 1 },
    ],
  },
  {
    id: "teen",
    label: "11+ let",
    templates: [
      { title: "Vysát pokoj", description: "Vysát podlahu v pokoji a pod postelí.", xp: 18, gold: 2 },
      { title: "Pověsit a složit prádlo", description: "Prádlo ze sušáku na své místo.", xp: 15, gold: 2 },
      { title: "Uvařit jednoduché jídlo", description: "Večeře nebo svačina pro rodinu.", xp: 30, gold: 4 },
      { title: "Nákup podle seznamu", description: "Koupit věci ze seznamu a vrátit zbytek peněz.", xp: 25, gold: 3 },
      { title: "Učení a příprava na test", description: "Aspoň 30 minut soustředěného učení.", xp: 25, gold: 3 },
      { title: "Umýt koupelnu", description: "Umyvadlo, zrcadlo a podlaha.", xp: 25, gold: 3 },
    ],
  },
];

export default function TaskTemplates({ onPick }) {
  const [bandId, setBandId] = useState(TASK_TEMPLATE_BANDS[1].id);
  const band = TASK_TEMPLATE_BANDS.find((item) => item.id === bandId) || TASK_TEMPLATE_BANDS[0];

  return (
    <section className="rounded-3xl border border-cyan-500/30 bg-slate-900 p-5 shadow-xl" aria-label="Šablony úkolů">
      <h2 className="text-xl font-bold text-white">Šablony úkolů</h2>
      <p className="mt-1 text-sm text-slate-400">Vyber věk a klikni na úkol. Vyplní se formulář, který můžeš ještě upravit.</p>

      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Věk dítěte">
        {TASK_TEMPLATE_BANDS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={bandId === item.id}
            onClick={() => setBandId(item.id)}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
              bandId === item.id
                ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-400"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {band.templates.map((template) => (
          <button
            key={template.title}
            type="button"
            onClick={() => onPick?.(template)}
            className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm text-slate-100 transition hover:border-cyan-400"
          >
            <span className="block font-semibold">{template.title}</span>
            <span className="block text-xs text-slate-400">
              {template.xp} XP{template.gold ? ` · ${template.gold} zlata` : ""}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
