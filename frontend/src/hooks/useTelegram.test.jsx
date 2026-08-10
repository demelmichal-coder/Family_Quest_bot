import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { useTelegram } from "./useTelegram";

beforeEach(() => {
  window.localStorage.clear();
  window.Telegram = {
    WebApp: {
      initData: "auth-data",
      initDataUnsafe: {
        user: {
          id: 123456,
        },
      },
      ready: vi.fn(),
      expand: vi.fn(),
    },
  };
});

afterEach(() => {
  window.localStorage.clear();
  delete window.Telegram;
});

test("telegram auth ma prednost pred forced logout stavem", async () => {
  window.localStorage.setItem("familyquest_force_login", "1");

  const { result } = renderHook(() => useTelegram());

  await waitFor(() => {
    expect(result.current.hasAuthData).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  expect(window.localStorage.getItem("familyquest_force_login")).toBeNull();
  expect(result.current.tg?.initDataUnsafe?.user?.id).toBe(123456);
});
