# Portfolio Management Logic (migrated from sentinel.py)
# Imports (add/adjust as needed)
import threading
import time
import os
import sqlite3
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Import or define these elsewhere as needed:
# from ..constants import (DEFAULT_MY_PORTFOLIO, DEFAULT_WATCHLIST, MAX_TRADES, DB_FILE, ACCOUNT_SIZE, RISK_PER_TRADE, CORRELATION_THRESHOLD)
# from ..core.utils import log_event, send_telegram
# from ..core.fair_value import calculate_fair_value
# from ..core.indicators import calculate_indicators, _series_value
# from ..core.fx import to_usd, to_czk

# --- State ---
MY_PORTFOLIO = {}
WATCHLIST = {}
portfolio_cache = {}
fx_rates = {"USD": 1.0, "EUR": 1.08, "CZK": 0.042}
target_alert_triggered = {}
STATE_LOCK = threading.Lock()

# --- Portfolio Management Logic (migrated from sentinel.py) ---
def sync_runtime_universe():
	"""Ensure runtime dicts reflect latest WATCHLIST/MY_PORTFOLIO composition."""
	for sym, sec in WATCHLIST.items():
		if sym not in current_data:
			current_data[sym] = _empty_current_data_entry(sec)
		else:
			current_data[sym]["sector"] = str(sec or "UNKNOWN").upper()

	stale_current = [sym for sym in current_data.keys() if sym not in WATCHLIST]
	for sym in stale_current:
		current_data.pop(sym, None)

	for sym in MY_PORTFOLIO.keys():
		if sym not in portfolio_cache:
			portfolio_cache[sym] = _empty_portfolio_cache_entry()
		if sym not in target_alert_triggered:
			target_alert_triggered[sym] = False

	stale_portfolio_cache = [sym for sym in portfolio_cache.keys() if sym not in MY_PORTFOLIO]
	for sym in stale_portfolio_cache:
		portfolio_cache.pop(sym, None)
		target_alert_triggered.pop(sym, None)

def load_user_universe_from_db():
	"""Merge hardcoded defaults with persisted user universe from DB."""
	global WATCHLIST, MY_PORTFOLIO
	conn = get_db_conn()
	try:
		w_rows = conn.execute("SELECT symbol, sector FROM user_watchlist").fetchall()
		p_rows = conn.execute(
			"SELECT symbol, sector, entry, size, ccy FROM user_portfolio"
		).fetchall()
		removed_rows = conn.execute("SELECT symbol FROM user_removed_symbols").fetchall()
	finally:
		conn.close()

	removed = {str(r[0] or "").upper().strip() for r in removed_rows}

	merged_watch = dict(DEFAULT_WATCHLIST)
	for sym in removed:
		merged_watch.pop(sym, None)
	for sym, sec in w_rows:
		symbol = str(sym or "").upper().strip()
		if not symbol:
			continue
		merged_watch[symbol] = str(sec or "UNKNOWN").upper()

	merged_port = {k: dict(v) for k, v in DEFAULT_MY_PORTFOLIO.items()}
	for sym in removed:
		merged_port.pop(sym, None)
	for sym, sec, entry, size, ccy in p_rows:
		symbol = str(sym or "").upper().strip()
		if not symbol:
			continue
		merged_port[symbol] = {
			"sector": str(sec or "UNKNOWN").upper(),
			"entry": float(entry or 0),
			"size": float(size or 0),
			"ccy": str(ccy or "USD").upper(),
		}
		merged_watch.setdefault(symbol, str(sec or "UNKNOWN").upper())

	WATCHLIST = merged_watch
	MY_PORTFOLIO = merged_port
	sync_runtime_universe()

def upsert_user_watch_symbol(symbol, sector):
	symbol = str(symbol or "").upper().strip()
	sector = str(sector or "UNKNOWN").upper().strip() or "UNKNOWN"
	if not symbol:
		raise ValueError("symbol is required")

	conn = get_db_conn()
	try:
		conn.execute("DELETE FROM user_removed_symbols WHERE symbol = ?", (symbol,))
		conn.execute(
			"INSERT INTO user_watchlist(symbol, sector) VALUES (?, ?) "
			"ON CONFLICT(symbol) DO UPDATE SET sector=excluded.sector",
			(symbol, sector),
		)
		conn.commit()
	finally:
		conn.close()

	WATCHLIST[symbol] = sector
	sync_runtime_universe()
	log_event(symbol, "WATCHLIST_UPSERT")
	logger.info("Watchlist upsert: %s sector=%s", symbol, sector)
	return symbol, sector

def calculate_auto_target_price(symbol, sector, reference_price=0.0):
	"""Auto-calculate target from fair value model with sector premium fallback."""
	symbol = str(symbol or "").upper().strip()
	sector_u = str(sector or WATCHLIST.get(symbol, "UNKNOWN") or "UNKNOWN").upper().strip() or "UNKNOWN"
	ref_price = float(reference_price or 0)

	try:
		df = get_yf_history(symbol, period="45d", interval="1d", cache_sec=300)
		df = validate_ohlcv_data(df, symbol, "1d", min_len=30, max_null_close=5)
		fv = calculate_fair_value(symbol, df, sector_u)
		fair_value = float(fv.get("fair_value", 0) or 0)
		if fair_value > 0:
			premium = 1.10 if sector_u in ("TECH", "SEMI", "CRYPTO") else 1.05
			return round(fair_value * premium, 2)
	except Exception as ex:
		logger.warning("auto target calc failed for %s: %s", symbol, ex)

	if ref_price > 0:
		premium = 1.10 if sector_u in ("TECH", "SEMI", "CRYPTO") else 1.05
		return round(ref_price * premium, 2)
	return 0.0

def update_portfolio_cache():
	update_fx_rates()
	for symbol, meta in MY_PORTFOLIO.items():
		try:
			df = get_yf_history(symbol, period="30d", interval="1d", cache_sec=300)
			df = df.dropna(subset=['Close'])
			if df.empty or len(df) < 5:
				continue
			current_price = float(df['Close'].iloc[-1])
			price_7d_ago  = float(df['Close'].iloc[-5]) if len(df) >= 5 else current_price
			trend_7d      = (current_price - price_7d_ago) / price_7d_ago * 100

			current_price_usd = to_usd(current_price, meta["ccy"])
			current_price_czk = to_czk(current_price_usd)

			entry_value_usd   = to_usd(meta["entry"], meta["ccy"]) * meta["size"]
			current_value_usd = current_price_usd * meta["size"]
			pnl_usd           = current_value_usd - entry_value_usd
			pnl_pct           = (current_price - meta["entry"]) / meta["entry"] * 100

			sparkline = [round(float(x), 2) for x in df['Close'].tail(14).tolist()]

			try:
				df_h = get_yf_history(symbol, period="5d", interval="1h", cache_sec=300)
				if len(df) >= 30 and len(df_h) >= 14:
					rsi_d, _, atr, macd_hist, macd_cross, price_vs_bb, vol_spike, _, _, _, _ = calculate_indicators(df, df_h)
					closed_price = float(df['Close'].iloc[-2])
					sma20_closed = _series_value(df['Close'].rolling(20).mean(), -2, closed_price)
					score = 0
					if rsi_d < 45: score += 2
					if closed_price > sma20_closed: score += 1
					if macd_cross: score += 1.5
					if macd_hist > 0: score += 0.5
					if price_vs_bb == "below": score += 1
					if vol_spike: score += 1
					signal = get_signal_rating(score)
				else:
					rsi_d = 50; atr = 0; macd_hist = 0; vol_spike = False; score = 3; signal = "WAIT"
			except:
				rsi_d = 50; atr = 0; macd_hist = 0; vol_spike = False; score = 3; signal = "WAIT"
			fv = calculate_fair_value(symbol, df, meta.get("sector"))
			fair_value_calc = float(fv.get("fair_value", 0) or 0)
			sector_name = str(meta.get("sector", "UNKNOWN") or "UNKNOWN").upper()
			if fair_value_calc > 0:
				premium = 1.10 if sector_name == "TECH" else 1.05
				dynamic_target = fair_value_calc * premium
			else:
				dynamic_target = 0.0
			new_data = {
				"current_price":     round(current_price, 4),
				"current_price_usd": round(current_price_usd, 4),
				"current_price_czk": round(current_price_czk, 2),
				"entry_value_usd":   round(entry_value_usd, 2),
				"entry_value_czk":   round(to_czk(entry_value_usd), 2),
				"current_value_usd": round(current_value_usd, 2),
				"current_value_czk": round(to_czk(current_value_usd), 2),
				"pnl_usd":           round(pnl_usd, 2),
				"pnl_czk":           round(to_czk(pnl_usd), 2),
				"pnl_pct":           round(pnl_pct, 2),
				"trend_7d":          round(trend_7d, 2),
				"trend_label":       get_trend_label(trend_7d),
				"trend_arrow":       get_trend_arrow(trend_7d),
				"signal":            signal,
				"signal_score":      round(score, 1),
				"fair_value":        fv["fair_value"],
				"suggested_buy":     fv["suggested_buy"],
				"analyst_target":    fv["analyst_target"],
				"graham_number":     fv.get("graham_number", 0),
				"dcf_value":         fv.get("dcf_value", 0),
				"upside_pct":        fv.get("upside_pct", 0),
				"implied_growth":    fv.get("implied_growth", fv.get("market_implied_growth_pct", 0)),
				"market_implied_growth_pct": fv.get("market_implied_growth_pct", 0),
				"rsi":               round(rsi_d, 1),
				"macd_hist":         round(macd_hist, 4),
				"atr":               round(atr, 4),
				"volume_spike":      vol_spike,
				"sparkline":         sparkline,
				"last_update":       datetime.now().strftime("%H:%M:%S"),
			}
			with STATE_LOCK:
				portfolio_cache[symbol].update(new_data)
				portfolio_cache[symbol]["note"] = build_auto_note(symbol, portfolio_cache[symbol])

			if dynamic_target > 0:
				was_triggered = target_alert_triggered.get(symbol, False)

				# Target je pouze aktivacni zona, alert az pri ztrate momenta.
				trend_weakening = (float(macd_hist) < 0 or float(score) < 5)
				now_triggered = current_price > float(dynamic_target) and trend_weakening

				if now_triggered and not was_triggered:
					send_telegram(
						f"🎯 SMART TAKE PROFIT: Akcie {symbol} prekonala tvuj cil "
						f"({dynamic_target:.2f} {meta['ccy']}) vypocitany z Fair Value + premie. "
						f"Aktualni cena ({current_price:.2f}) presahla dynamicky cil ({dynamic_target:.2f} vypocitany z Fair Value). "
						f"Zaroven ale technika ukazuje ztratu momenta "
						f"(Signal: {signal}, MACD: {macd_hist:.3f}). Zvaz vyber zisku!"
					)

				# Anti-spam: znovu upozorni az po resetu (tj. kdyz podminka prestane platit).
				target_alert_triggered[symbol] = now_triggered
		except Exception as e:
			print(f"[Portfolio] {symbol}: {e}")

def get_portfolio_summary():
	ue  = sum(d["entry_value_usd"]   for d in portfolio_cache.values() if d["entry_value_usd"] > 0)
	uc  = sum(d["current_value_usd"] for d in portfolio_cache.values() if d["current_value_usd"] > 0)
	czk = sum(d["current_value_czk"] for d in portfolio_cache.values() if d["current_value_czk"] > 0)
	pcz = sum(d["pnl_czk"]           for d in portfolio_cache.values())
	pnl = uc - ue
	pct = pnl / ue * 100 if ue > 0 else 0
	return ue, uc, pnl, pct, czk, pcz

def compute_risk_radar(new_symbol=None):
	update_portfolio_cache()
	_, _, _, _, total_czk, _ = get_portfolio_summary()
	if total_czk <= 0:
		return {"sectors":{}, "tickers":{}, "ccy":{}, "total_czk":0, "correlation_factor": 1.0}

	sectors = {}
	tickers = {}
	ccy_exp = {}
	active_symbols = [sym for sym, d in current_data.items() if d.get("rec") in ("BUY", "STRONG BUY")]
	for sym, meta in MY_PORTFOLIO.items():
		c = portfolio_cache[sym]
		w = c["current_value_czk"]
		if w <= 0:
			continue
		sectors.setdefault(meta["sector"], 0)
		sectors[meta["sector"]] += w
		tickers[sym] = w
		ccy_exp.setdefault(meta["ccy"], 0)
		ccy_exp[meta["ccy"]] += w

	all_symbols = list(active_symbols)
	if new_symbol and new_symbol not in all_symbols:
		all_symbols.append(new_symbol)

	correlation_factor = 1.0
	if len(all_symbols) > 1:
		hist_data = {}
		for sym in all_symbols:
			try:
				df = get_yf_history(sym, period="30d", interval="1d", cache_sec=300)
				if len(df) >= 10:
					hist_data[sym] = df["Close"].pct_change().dropna()
			except Exception as e:
				logger.warning("korelacni data nemuze stahnout %s: %s", sym, e)

		if len(hist_data) >= 2:
			prices_df = pd.DataFrame(hist_data).dropna()
			corr = prices_df.corr()

			if new_symbol and new_symbol in corr.columns:
				for base in active_symbols:
					if base in corr.columns and corr.loc[new_symbol, base] > CORRELATION_THRESHOLD:
						send_telegram(
							f"WARNING: {new_symbol} korelace s {base} je {corr.loc[new_symbol, base]:.2f} > {CORRELATION_THRESHOLD}\n"
							"Signal je rizikove korelovany s dalsimi BUY kandidaty."
						)
						correlation_factor = min(correlation_factor, 0.7)

	sectors_pct = {k: v / total_czk * 100 for k, v in sectors.items()}
	tickers_pct = {k: v / total_czk * 100 for k, v in tickers.items()}
	ccy_pct = {k: v / total_czk * 100 for k, v in ccy_exp.items()}

	return {
		"sectors": sectors_pct,
		"tickers": tickers_pct,
		"ccy": ccy_pct,
		"total_czk": total_czk,
		"correlation_factor": correlation_factor,
	}
