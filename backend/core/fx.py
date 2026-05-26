# backend/core/fx.py
"""
Foreign exchange (FX) rate utilities for Sentinel.
"""
import yfinance as yf

fx_rates = {"EUR": 1.08, "CZK": 0.042}

def update_fx_rates():
    global fx_rates
    try:
        fx_rates["EUR"] = float(yf.Ticker("EURUSD=X").history(period="2d")['Close'].iloc[-1])
        fx_rates["CZK"] = float(yf.Ticker("CZKUSD=X").history(period="2d")['Close'].iloc[-1])
    except Exception:
        fx_rates["EUR"] = 1.08
        fx_rates["CZK"] = 0.042

def to_usd(price, ccy):
    return price * fx_rates.get(ccy, 1.0)

def to_czk(usd_amount):
    return usd_amount / fx_rates["CZK"] if fx_rates["CZK"] > 0 else 0

def usd_czk_rate():
    return 1.0 / fx_rates["CZK"] if fx_rates["CZK"] > 0 else 25.0
