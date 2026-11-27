import React from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, afterEach } from "vitest";
import AppStatusBanners from "./AppStatusBanners";

function setOnline(value) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

afterEach(() => {
  setOnline(true);
});

describe("AppStatusBanners", () => {
  test("nezobrazuje nic, kdyz je aplikace online a neni nova verze", () => {
    setOnline(true);
    render(<AppStatusBanners />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("ukaze hlaseni o offline rezimu", () => {
    setOnline(false);
    render(<AppStatusBanners />);
    expect(screen.getByRole("status")).toHaveTextContent("Jsi offline");
  });

  test("po obnoveni spojeni hlaseni zmizi", () => {
    setOnline(false);
    render(<AppStatusBanners />);
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
