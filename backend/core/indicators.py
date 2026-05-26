# Indicator helpers (migrated from sentinel.py)
import pandas as pd

def _series_value(series, idx=-1, default=0.0):
    if series is None or len(series) == 0:
        return default
    try:
        value = series.iloc[idx]
    except Exception:
        return default
    if pd.isna(value):
        return default
    return float(value)
