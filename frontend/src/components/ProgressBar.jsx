import React from "react";

function ProgressBar({ value, max }) {
  const percent = Math.min(100, Math.round((value / max) * 100));

  return (
    <div className="h-4 w-full rounded-full border-2 border-yellow-300 bg-yellow-100">
      <div
        className="h-4 rounded-full bg-yellow-400 transition-all duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default ProgressBar;
