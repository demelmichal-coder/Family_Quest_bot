import { useCallback } from "react";
import { useTelegram } from "./useTelegram";

export function useHaptic() {
  const { tg } = useTelegram();

  return useCallback(
    (type = "impact") => {
      if (tg && tg.HapticFeedback) {
        try {
          if (type === "impact") tg.HapticFeedback.impactOccurred("medium");
          if (type === "success") tg.HapticFeedback.notificationOccurred("success");
          if (type === "error") tg.HapticFeedback.notificationOccurred("error");
        } catch {}
      }
    },
    [tg]
  );
}
