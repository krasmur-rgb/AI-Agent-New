# quant/selftests/test_data.py
import numpy as np
from quant import data

ZCYC_FIXTURE = {
    "yearyields": {"columns": ["period", "value"],
                   "data": [[0.25, 18.0], [0.5, 17.5], [1, 17.0], [2, 16.0],
                            [3, 15.5], [5, 15.0], [7, 14.8], [10, 14.6],
                            [15, 14.5], [20, 14.4], [0.75, 17.2]]},
    "params": {"columns": ["tradedate", "tradetime", "B1", "B2", "B3", "T1"],
               "data": [["2026-06-25", "18:00:00", 1551.4, -202.85, -615.56, 0.797]]},
}

def test_parse_gcurve_sorted_and_asof():
    c = data.parse_gcurve(ZCYC_FIXTURE)
    assert list(c["tenors"]) == sorted(c["tenors"])          # sorted ascending
    assert c["tenors"][0] == 0.25 and c["tenors"][-1] == 20
    assert abs(c["yields"][0] - 18.0) < 1e-9                  # yield aligned to 0.25y
    assert c["asof"] == "2026-06-25"
    assert c["params"]["B1"] == 1551.4

def _fake_fetcher(by_date):
    def fetch(date):
        cols = ["period", "value"]
        ys = by_date[date]
        rows = [[t, ys[i]] for i, t in enumerate([0.25,0.5,0.75,1,2,3,5,7,10,15,20])]
        return {"yearyields": {"columns": cols, "data": rows},
                "params": {"columns": ["tradedate"], "data": [[date]]}}
    return fetch

def test_build_yields_history_matrix():
    base = [18,17.5,17.2,17,16,15.5,15,14.8,14.6,14.5,14.4]
    by_date = {"2026-06-23": base, "2026-06-24": [v+0.1 for v in base],
               "2026-06-25": [v+0.2 for v in base]}
    h = data.build_yields_history(["2026-06-23","2026-06-24","2026-06-25"],
                                  fetch_one=_fake_fetcher(by_date))
    assert h["dates"] == ["2026-06-23","2026-06-24","2026-06-25"]
    assert h["tenors"].shape == (11,)
    assert h["yields_hist"].shape == (3, 11)        # rows=dates, cols=tenors
    assert abs(h["yields_hist"][2, 0] - 18.2) < 1e-9
