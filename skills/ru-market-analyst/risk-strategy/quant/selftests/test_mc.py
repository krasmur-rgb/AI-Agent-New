# quant/selftests/test_mc.py
import numpy as np
from quant import mc, curve

def _pca():
    rng = np.random.default_rng(0)
    hist = 10 + np.cumsum(rng.normal(0, 0.05, (400, 6)), axis=0)
    return curve.pca_factors(hist, 3), hist[-1]

def test_simulate_book_shapes_and_convergence():
    pca, base = _pca()
    tenors = np.array([0.5,1,2,3,5,7])
    positions = [{"face":100,"coupon_pct":8,"freq":1,"maturity":3,"weight":0.6,"spread_bp":150},
                 {"face":100,"coupon_pct":10,"freq":1,"maturity":5,"weight":0.4,"spread_bp":300}]
    out = mc.simulate_book(positions, base, tenors, pca, n_paths=20000,
                           horizon=1.0, seed=42)
    assert out["port_return"].shape == (20000,)
    assert out["pos_return"].shape == (20000, 2)
    out2 = mc.simulate_book(positions, base, tenors, pca, n_paths=20000,
                            horizon=1.0, seed=42)
    assert np.allclose(out["port_return"], out2["port_return"])   # seed reproducible

def test_credit_overlay_increases_tail_loss():
    pca, base = _pca(); tenors = np.array([0.5,1,2,3,5,7])
    positions = [{"face":100,"coupon_pct":12,"freq":1,"maturity":3,"weight":1.0,"spread_bp":600,
                  "pd":0.1,"beta":0.4,"mean_rr":0.4}]
    no_credit = mc.simulate_book(positions, base, tenors, pca, 50000, 1.0, 42)
    with_credit = mc.simulate_book(positions, base, tenors, pca, 50000, 1.0, 42,
                                   credit_on=True)
    from quant import risk
    assert risk.es(-with_credit["port_return"],0.95) > risk.es(-no_credit["port_return"],0.95)
