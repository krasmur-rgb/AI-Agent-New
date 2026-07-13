# quant/data.py
import numpy as np
import requests

GCURVE_URL = "https://iss.moex.com/iss/engines/stock/zcyc.json"
CBR_KEYRATE_URL = "https://www.cbr.ru/eng/hd_base/KeyRate/"

def _block_rows(block):
    return block["columns"], block["data"]

def parse_gcurve(zcyc_json):
    cols, rows = _block_rows(zcyc_json["yearyields"])
    i_p, i_v = cols.index("period"), cols.index("value")
    pairs = sorted((float(r[i_p]), float(r[i_v])) for r in rows)
    tenors = np.array([p for p, _ in pairs])
    yields = np.array([v for _, v in pairs])
    pcols, prows = _block_rows(zcyc_json["params"])
    # historical (&date=) queries return yearyields but an EMPTY params block — tolerate it
    params = {pcols[i]: prows[0][i] for i in range(len(pcols))} if prows else {}
    return {"tenors": tenors, "yields": yields, "params": params,
            "asof": params.get("tradedate")}

def fetch_gcurve(session=None):
    s = session or requests
    r = s.get(GCURVE_URL, params={"iss.meta": "off"}, timeout=30)
    r.raise_for_status()
    return parse_gcurve(r.json())

def fetch_gcurve_on(date, session=None):
    s = session or requests
    r = s.get(GCURVE_URL, params={"iss.meta": "off", "date": date}, timeout=30)
    r.raise_for_status()
    return r.json()

def build_yields_history(dates, fetch_one=None):
    """Build (n_dates, 11) yields matrix by parsing each date's yearyields block.
    fetch_one(date)->zcyc_json; default hits the live endpoint. Caller date-samples
    (e.g. weekly) to bound HTTP calls. Skips dates whose tenor grid differs."""
    fetch_one = fetch_one or fetch_gcurve_on
    rows, kept, tenors = [], [], None
    for d in dates:
        c = parse_gcurve(fetch_one(d))
        if c["yields"].size == 0:                       # no curve published (weekend/holiday)
            continue
        if tenors is None:
            tenors = c["tenors"]
        if len(c["tenors"]) != len(tenors) or not np.allclose(c["tenors"], tenors):
            continue
        rows.append(c["yields"]); kept.append(d)
    return {"dates": kept, "tenors": np.asarray(tenors),
            "yields_hist": np.array(rows)}
