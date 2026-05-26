import React, { useState } from "react";
import { Ticket } from "lucide-react";
import { SHOP_MESSAGES } from "../constants/messages";
import { getErrorMessage } from "../utils/errors";

function Shop({ user, rewards, purchases, onBuyReward }) {
  const [busyRewardId, setBusyRewardId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleBuy(reward) {
    if (!onBuyReward) {
      return;
    }

    setBusyRewardId(reward.id);
    setMessage("");
    setError("");

    try {
      const response = await onBuyReward(reward.id);
      if (response?.detail) {
        setMessage(response.detail);
      }
    } catch (purchaseError) {
      setError(getErrorMessage(purchaseError, SHOP_MESSAGES.buyRewardError));
    } finally {
      setBusyRewardId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="shop-container">
        <div className="header">
          <h1>Obchod s odmenami</h1>
          <div className="coin-badge">{user?.gold || 0} zlata</div>
        </div>

        {message ? (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-950">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-900">
            {error}
          </div>
        ) : null}

        <div className="grid">
          {rewards.length > 0 ? (
            rewards.map((reward) => {
              const canAfford = (user?.gold || 0) >= reward.cost;
              return (
                <div className="card" key={reward.id}>
                  <div className="icon">
                    <Ticket size={32} strokeWidth={1.5} color="#55D491" />
                  </div>
                  <h3 className="title">{reward.name}</h3>
                  <p className="mt-2 text-sm text-slate-600">{reward.description}</p>
                  <p className="cost">{reward.cost} zlata</p>
                  <button
                    className="btn-buy"
                    type="button"
                    onClick={() => handleBuy(reward)}
                    disabled={!canAfford || busyRewardId === reward.id}
                  >
                    {busyRewardId === reward.id
                      ? SHOP_MESSAGES.buyingButton
                      : canAfford
                        ? SHOP_MESSAGES.buyButton
                        : SHOP_MESSAGES.insufficientGold}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="card">Obchod je zatim prazdny.</div>
          )}
        </div>

        <aside className="rounded-[32px] border border-emerald-200 bg-white/75 p-5 shadow-xl">
          <h3 className="text-xl font-black text-emerald-950">Historie nakupu</h3>
          <p className="mt-1 text-sm text-emerald-900/70">
            Posledni odmeny, ktere sis uz poridil.
          </p>
          <div className="mt-4 space-y-3">
            {purchases.length > 0 ? (
              purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                >
                  <div className="font-bold text-emerald-950">{purchase.reward_name}</div>
                  <div className="mt-1 text-sm text-emerald-800">-{purchase.cost} zlata</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-emerald-300 px-4 py-6 text-sm text-emerald-900/70">
                Zatim bez nakupu.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Shop;
