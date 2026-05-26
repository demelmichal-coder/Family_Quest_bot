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
      <div className="shop-container brawl-shop-surface p-5">
        <div className="header">
          <h1>Obchod s odmenami</h1>
          <div className="coin-badge">{user?.gold || 0} zlata</div>
        </div>

        {message ? (
          <div className="rounded-2xl border-2 border-slate-950 bg-emerald-300 px-4 py-3 text-sm font-semibold text-emerald-950">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border-2 border-slate-950 bg-rose-300 px-4 py-3 text-sm font-semibold text-rose-950">
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
                  <p className="mt-2 text-sm text-slate-100/95">{reward.description}</p>
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
            <div className="card text-slate-100">Obchod je zatim prazdny.</div>
          )}
        </div>

        <aside className="brawl-accent-card rounded-[32px] border-emerald-300/70 bg-emerald-900/75 p-5 shadow-xl">
          <h3 className="brawl-subtitle text-xl font-black text-emerald-100">Historie nakupu</h3>
          <p className="mt-1 text-sm text-emerald-200/90">
            Posledni odmeny, ktere sis uz poridil.
          </p>
          <div className="mt-4 space-y-3">
            {purchases.length > 0 ? (
              purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="rounded-2xl border-2 border-slate-950 bg-emerald-300 px-4 py-3"
                >
                  <div className="font-bold text-emerald-950">{purchase.reward_name}</div>
                  <div className="mt-1 text-sm text-emerald-800">-{purchase.cost} zlata</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-emerald-300 px-4 py-6 text-sm text-emerald-200/90">
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
