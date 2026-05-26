import { useCallback, useState } from "react";

import { AI_MESSAGES } from "../constants/messages";
import { useUser } from "../context/UserContext";
import { getErrorMessage } from "../utils/errors";

export function useGroqRewrite() {
  const { api } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const rewriteTask = useCallback(
    async (text, style = "epicke") => {
      setLoading(true);
      setError(null);

      try {
        const response = await api("/ai/rewrite-task", {
          method: "POST",
          body: { text, style },
        });
        setLoading(false);
        return response;
      } catch (rewriteError) {
        setError(getErrorMessage(rewriteError, AI_MESSAGES.rewriteError));
        setLoading(false);
        return null;
      }
    },
    [api]
  );

  const rewriteReward = useCallback(
    async (text, style = "epicke") => {
      setLoading(true);
      setError(null);

      try {
        const response = await api("/ai/rewrite-reward", {
          method: "POST",
          body: { text, style },
        });
        setLoading(false);
        return response;
      } catch (rewriteError) {
        setError(getErrorMessage(rewriteError, AI_MESSAGES.rewriteError));
        setLoading(false);
        return null;
      }
    },
    [api]
  );

  return { rewriteTask, rewriteReward, loading, error };
}
