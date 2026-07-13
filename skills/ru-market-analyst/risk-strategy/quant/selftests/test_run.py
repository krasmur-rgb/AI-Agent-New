# quant/selftests/test_run.py
import json, subprocess, sys, os, numpy as np
from quant import run

def test_run_end_to_end(tmp_path):
    rng = np.random.default_rng(0)
    hist = 10 + np.cumsum(rng.normal(0, 0.05, (300, 6)), axis=0)   # real curve variation
    port = {"tenors":[0.5,1,2,3,5,7],
            "yields_hist": hist.tolist(),
            "base_yields":[10,10,10,10,10,10],
            "positions":[{"face":100,"coupon_pct":8,"freq":1,"maturity":3,"weight":1.0,"spread_bp":100}]}
    cfg = {"n_paths":5000,"horizon":1.0,"seed":1,"alpha":0.95}
    res = run.run_analysis(port, cfg)
    assert "es" in res and "var" in res and res["es"] >= res["var"]
    assert "fan_chart" in res and "components" in res
    assert "assumptions" in res and all(np.isfinite(x) for x in res["explained_var"])

def test_credit_requires_provenance():
    import pytest
    port = {"tenors":[0.5,1,2,3,5,7],
            "yields_hist":[[10+0.001*j for j in range(6)] for i in range(300)],
            "base_yields":[10,10,10,10,10,10],
            "positions":[{"face":100,"coupon_pct":12,"freq":1,"maturity":3,"weight":1.0,
                          "spread_bp":600,"pd":0.1,"beta":0.4,"mean_rr":0.4}]}  # pd without pd_meta
    with pytest.raises(ValueError):
        run.run_analysis(port, {"n_paths":1000,"horizon":1.0,"seed":1,"alpha":0.95,"credit_on":True})
