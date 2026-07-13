# quant/selftests/test_curve.py
import numpy as np
from quant import curve

def test_pca_recovers_dominant_factor():
    rng = np.random.default_rng(0)
    n_tenors = 8
    level = np.ones(n_tenors)
    scores = rng.normal(0, 1.0, size=400)
    yields_hist = 10.0 + np.outer(scores, level) + rng.normal(0, 0.01, (400, n_tenors))
    pca = curve.pca_factors(yields_hist, n_factors=3)
    assert pca["components"].shape == (3, n_tenors)
    assert pca["explained"][0] > 0.95                      # one dominant level factor
    assert pca["factor_cov"].shape == (3, 3)

def test_pca_reconstruct_roundtrip():
    rng = np.random.default_rng(1)
    yields_hist = 10 + rng.normal(0, 0.5, (300, 6))
    pca = curve.pca_factors(yields_hist, n_factors=3)
    base = yields_hist[-1]
    paths = curve.simulate_curve_terminal(base, pca, n_paths=5000,
                                           rng=np.random.default_rng(2))
    assert paths.shape == (5000, 6)
    assert np.allclose(paths.mean(axis=0), base, atol=0.05)  # zero-mean innovations

def test_vasicek_calibrate_recovers_params():
    rng = np.random.default_rng(3)
    lam, mu, sigma, dt = 0.5, 8.0, 1.0, 1/252
    n = 6000
    r = np.empty(n); r[0] = 8.0
    for t in range(1, n):
        r[t] = r[t-1] + lam*(mu-r[t-1])*dt + sigma*np.sqrt(dt)*rng.standard_normal()
    est = curve.vasicek_calibrate(r, dt)
    assert abs(est["mu"] - mu) < 1.0
    assert est["sigma"] > 0 and est["lam"] > 0

def test_student_t_fatter_tails_than_gaussian():
    rng = np.random.default_rng(0)
    hist = 10 + np.cumsum(rng.normal(0,0.05,(400,6)),axis=0)
    pca = curve.pca_factors(hist,3); base = hist[-1]
    g = curve.simulate_curve_terminal(base, pca, 100000, np.random.default_rng(1))
    t = curve.simulate_curve_terminal(base, pca, 100000, np.random.default_rng(1),
                                      student_t_df=4)
    # excess kurtosis of the level factor larger under Student-t
    from scipy.stats import kurtosis
    assert kurtosis(t[:,0]) > kurtosis(g[:,0])
