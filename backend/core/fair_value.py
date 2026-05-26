# Fair value and related calculations (migrated from sentinel.py)
import numpy as np
import pandas as pd
import logging

def calculate_fair_value(symbol, df_d, sector=None):
    # ... (Paste the full calculate_fair_value implementation from sentinel.py here)
    pass

def calculate_rule_of_40(info):
    data = info if isinstance(info, dict) else {}
    revenue_growth = float(data.get("revenueGrowth", 0) or 0)
    profit_margins = float(data.get("profitMargins", 0) or 0)
    return (revenue_growth + profit_margins) * 100.0
