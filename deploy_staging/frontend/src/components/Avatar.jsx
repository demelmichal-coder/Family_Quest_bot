import React from "react";

function Avatar({ name, image = ":)" }) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 rounded-full border-4 border-yellow-400 bg-white p-2 text-5xl shadow-lg">
        {image}
      </div>
      <div className="text-xs font-semibold text-yellow-800">{name}</div>
    </div>
  );
}

export default Avatar;
