import { useCallback } from "react";
import { API_MESSAGES } from "../constants/messages";
import { getErrorMessage } from "../utils/errors";

function normalizeApiBaseUrl(rawValue) {
  const fallbackUrl = "/api";
  const value = rawValue?.toString().trim();

  if (!value) {
    return fallbackUrl;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsedUrl = new URL(value);
      const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");

      if (!normalizedPath) {
        return parsedUrl.origin;
      }

      return parsedUrl.toString().replace(/\/+$/, "");
    } catch {
      return fallbackUrl;
    }
  }

  const normalizedValue = value.replace(/\/+$/, "");

  if (!normalizedValue || normalizedValue === "/") {
    return fallbackUrl;
  }

  return normalizedValue;
}

const API_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

function normalizeApiError(payload, fallbackStatus) {
  if (!payload) {
    return API_MESSAGES.statusError(fallbackStatus);
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (typeof payload.detail === "string" && payload.detail) {
    return payload.detail;
  }
  if (typeof payload.message === "string" && payload.message) {
    return payload.message;
  }
  return API_MESSAGES.statusError(fallbackStatus);
}

export function useApi(telegramId, telegramInitData) {
  const callApi = useCallback(
    async (endpoint, { method = "GET", body, params } = {}) => {
      let url = API_URL + endpoint;
      if (params) {
        const query = new URLSearchParams(params).toString();
        url += `?${query}`;
      }

      const headers = {
        "Content-Type": "application/json",
      };

      if (telegramInitData) {
        headers["X-Telegram-Init-Data"] = telegramInitData;
      }

      if (telegramId) {
        headers["X-Telegram-Id"] = telegramId;
      }

      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        throw new Error(getErrorMessage(error, API_MESSAGES.networkError));
      }

      if (!res.ok) {
        let payload = null;
        const contentType = res.headers.get("content-type") || "";

        try {
          payload = contentType.includes("application/json")
            ? await res.json()
            : await res.text();
        } catch {
          payload = null;
        }

        throw new Error(normalizeApiError(payload, res.status));
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await res.json();
      }

      await res.text();
      throw new Error(
        `API vratilo necekany format odpovedi (${contentType || "unknown"}). Ocekavan je JSON.`
      );
    },
    [telegramId, telegramInitData]
  );

  return callApi;
}
