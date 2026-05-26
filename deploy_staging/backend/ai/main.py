# ai/main.py - AI utility helpers pro Family Quest Bot
# Hlavni AI logika je v groq_client.py

from ai.groq_client import rewrite_reward_to_shop_item, rewrite_task_to_game

__all__ = ["rewrite_task_to_game", "rewrite_reward_to_shop_item"]

