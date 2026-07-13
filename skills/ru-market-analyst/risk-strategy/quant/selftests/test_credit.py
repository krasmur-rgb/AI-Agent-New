# quant/selftests/test_credit.py
import numpy as np
from quant import credit

def test_thresholds_from_pd():
    pd = np.array([0.01, 0.05, 0.20])
    thr = credit.default_thresholds(pd)
    from scipy.stats import norm
    assert np.allclose(thr, norm.ppf(pd))
    assert thr[0] < thr[1] < thr[2]               # higher PD → less-negative threshold

def test_copula_default_rate_matches_pd():
    pd = np.array([0.05, 0.05]); beta = np.array([0.4, 0.4])
    d, Z = credit.simulate_defaults(pd, beta, n_paths=200000, seed=5)
    assert abs(d.mean(axis=0)[0] - 0.05) < 0.005   # marginal default rate ≈ PD
    assert Z.shape == (200000,)                    # systematic factor returned

def test_correlation_lifts_joint_defaults():
    pd = np.array([0.1, 0.1])
    lo, _ = credit.simulate_defaults(pd, np.array([0.0,0.0]), 200000, 6)
    hi, _ = credit.simulate_defaults(pd, np.array([0.7,0.7]), 200000, 6)
    assert (hi[:,0] & hi[:,1]).mean() > (lo[:,0] & lo[:,1]).mean()   # raises joint default

def test_recovery_lower_in_default_tail():
    pd = np.array([0.1]); beta = np.array([0.6])
    d, Z = credit.simulate_defaults(pd, beta, 200000, 7)
    rr = credit.recovery(Z, mean_rr=0.4)           # tied to same factor
    uncond = rr.mean()
    in_default = rr[d[:,0]].mean()                 # recovery where this name defaulted
    assert in_default < uncond                     # negative PD-recovery dependence
