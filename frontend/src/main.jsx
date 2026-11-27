// main.jsx - Vstupní bod aplikace
import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import AppStatusBanners from "./components/AppStatusBanners";
import { UserProvider } from "./context/UserContext";
import "./index.css";

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__fqInstallPrompt = event;
  window.dispatchEvent(new Event("fq-install-available"));
});

if ("serviceWorker" in navigator) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UserProvider>
      <App />
      <AppStatusBanners />
    </UserProvider>
  </React.StrictMode>
);
document.getElementById("splash")?.remove();
