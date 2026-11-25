import React from "react";

function Avatar({ name, image = "🙂" }) {
  const isImageData = typeof image === "string" && image.startsWith("data:image");

  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-yellow-400 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-4xl shadow-lg">
        {isImageData ? (
          <img src={image} alt={name || "avatar"} className="h-full w-full object-cover" />
        ) : (
          image
        )}
      </div>
      <div className="text-xs font-semibold text-slate-200">{name}</div>
    </div>
  );
}

export default Avatar;
