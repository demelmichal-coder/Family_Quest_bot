import React from "react";

const stateStyles = {
  ready: "border-slate-950 bg-lime-300 text-lime-950",
  waiting: "border-slate-950 bg-amber-300 text-amber-950",
  done: "border-slate-950 bg-cyan-300 text-cyan-950",
};

const stateLabels = {
  ready: "K plneni",
  waiting: "Ceka na schvaleni",
  done: "Hotovo",
};

function TaskCard({
  title,
  description,
  xp,
  gold,
  isDaily,
  isCompleted,
  approved,
  dueTime,
  feedback,
  requiresProof = false,
  proofSubmittedAt = null,
  aiFlagged = false,
  aiReviewNote = "",
  busy = false,
  onComplete,
}) {
  const state = approved ? "done" : isCompleted ? "waiting" : "ready";

  return (
    <article className="brawl-panel rounded-[28px] border-amber-300/70 bg-gradient-to-br from-indigo-700 via-blue-700 to-violet-800 p-5 text-slate-100 shadow-xl transition hover:-translate-y-1">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="brawl-subtitle text-xl font-black text-yellow-100">{title}</h3>
            {isDaily ? (
              <span className="rounded-full border-2 border-slate-950 bg-yellow-300 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-yellow-950">
                Denne
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-200/90">
            {description || "Bez dalsiho popisu."}
          </p>
          {isCompleted && feedback && (
            <div className="mt-3 rounded-xl border-2 border-slate-950 bg-emerald-300 px-3 py-2 text-sm text-emerald-950">
              <span className="font-semibold">💬 Zpetna vazba: </span>
              {feedback}
            </div>
          )}
          {requiresProof ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border-2 border-slate-950 bg-fuchsia-300 px-2 py-1 text-fuchsia-950">
                Dukaz povinny
              </span>
              {dueTime ? (
                <span className="rounded-full border-2 border-slate-950 bg-sky-300 px-2 py-1 text-sky-950">
                  Cas {dueTime}
                </span>
              ) : null}
              {proofSubmittedAt ? (
                <span className="rounded-full border-2 border-slate-950 bg-cyan-300 px-2 py-1 text-cyan-950">
                  Dukaz odeslan
                </span>
              ) : null}
              {aiFlagged ? (
                <span className="rounded-full border-2 border-slate-950 bg-orange-300 px-2 py-1 text-orange-950">
                  Ceka na rodice
                </span>
              ) : null}
            </div>
          ) : null}
          {!requiresProof && dueTime ? (
            <div className="mt-3 text-xs font-semibold text-sky-200">Pripominka v {dueTime}</div>
          ) : null}
          {aiReviewNote ? (
            <p className="mt-2 text-xs font-medium text-fuchsia-200">{aiReviewNote}</p>
          ) : null}
        </div>
        <div
          className={`rounded-full border-2 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${stateStyles[state]}`}
        >
          {stateLabels[state]}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
        <span className="rounded-full border-2 border-slate-950 bg-yellow-300 px-3 py-2 text-yellow-950">
          {xp} XP
        </span>
        <span className="rounded-full border-2 border-slate-950 bg-orange-300 px-3 py-2 text-orange-950">
          {gold} zlata
        </span>
      </div>

      <div className="mt-5">
        <button
          type="button"
          disabled={busy || isCompleted}
          onClick={onComplete}
          className="w-full rounded-2xl border-2 border-slate-950 bg-gradient-to-b from-yellow-300 to-yellow-500 px-4 py-3 text-sm font-black text-yellow-950 shadow-[0_4px_0_#020617] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approved
            ? "Uz splneno"
            : isCompleted
            ? "Odeslano ke schvaleni"
            : busy
            ? "Dokoncuji..."
            : requiresProof && !proofSubmittedAt
            ? "Odeslat dukaz a splnit"
            : "Oznacit jako splnene"}
        </button>
      </div>
    </article>
  );
}

export default TaskCard;
