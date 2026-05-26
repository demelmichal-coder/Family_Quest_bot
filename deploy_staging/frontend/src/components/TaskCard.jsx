import React from "react";

const stateStyles = {
  ready: "border-lime-300/40 bg-lime-300/10 text-lime-100",
  waiting: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  done: "border-cyan-300/40 bg-cyan-300/10 text-cyan-100",
};

const stateLabels = {
  ready: "Pripraveno",
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
  feedback,
  busy = false,
  onComplete,
}) {
  const state = isCompleted ? "done" : !isDaily && !approved ? "waiting" : "ready";

  return (
    <article className="rounded-[28px] border border-yellow-300/40 bg-gradient-to-br from-yellow-100 via-amber-50 to-orange-100 p-5 shadow-xl transition hover:-translate-y-1">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-yellow-950">{title}</h3>
            {isDaily ? (
              <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-yellow-900">
                Denne
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-yellow-900/70">
            {description || "Bez dalsiho popisu."}
          </p>
          {isCompleted && feedback && (
            <div className="mt-3 rounded-xl border border-green-400/40 bg-green-400/10 px-3 py-2 text-sm text-green-800">
              <span className="font-semibold">💬 Zpětná vazba: </span>
              {feedback}
            </div>
          )}
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${stateStyles[state]}`}
        >
          {stateLabels[state]}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
        <span className="rounded-full bg-yellow-950 px-3 py-2 text-yellow-100">
          {xp} XP
        </span>
        <span className="rounded-full bg-amber-500 px-3 py-2 text-amber-950">
          {gold} zlata
        </span>
      </div>

      <div className="mt-5">
        <button
          type="button"
          disabled={busy || isCompleted || (!isDaily && !approved)}
          onClick={onComplete}
          className="w-full rounded-2xl bg-yellow-950 px-4 py-3 text-sm font-bold text-yellow-100 transition hover:bg-black disabled:cursor-not-allowed disabled:bg-yellow-300 disabled:text-yellow-700"
        >
          {isCompleted ? "Uz splneno" : busy ? "Dokoncuji..." : "Splnit ukol"}
        </button>
      </div>
    </article>
  );
}

export default TaskCard;
