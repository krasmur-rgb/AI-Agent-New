# quant/curve.py
import numpy as np

def pca_factors(yields_hist, n_factors=3):
    """PCA on daily yield CHANGES. yields_hist: (n_days, n_tenors)."""
    changes = np.diff(yields_hist, axis=0)
    mean_change = changes.mean(axis=0)
    X = changes - mean_change
    cov = np.cov(X, rowvar=False)
    vals, vecs = np.linalg.eigh(cov)
    order = np.argsort(vals)[::-1]
    vals, vecs = vals[order], vecs[:, order]
    comps = vecs[:, :n_factors].T                      # (n_factors, n_tenors)
    total = vals.sum()
    if not np.isfinite(total) or total <= 1e-12:
        raise ValueError("insufficient curve variation for PCA (flat/degenerate history)")
    explained = (vals[:n_factors] / total)
    scores = X @ vecs[:, :n_factors]                   # (n_days-1, n_factors)
    factor_cov = np.cov(scores, rowvar=False)
    if np.ndim(factor_cov) == 0:
        factor_cov = factor_cov.reshape(1, 1)
    return {"components": comps, "explained": explained,
            "factor_cov": factor_cov, "mean_change": mean_change}

def simulate_curve_terminal(base_yields, pca, n_paths, rng, horizon_scale=1.0,
                            include_drift=False, student_t_df=None, jump_prob=0.0,
                            jump_scale=0.0):
    """Correlated factor innovations → yield changes → terminal curve.
    horizon_scale scales the factor covariance to the horizon: pass
    horizon_years*trading_days_per_year for i.i.d. random-walk daily changes (no
    autocorrelation/mean-reversion assumed — a flagged modelling choice).
    include_drift=False (default) = no-drift risk view; True adds mean_change*horizon_scale."""
    if student_t_df is not None and student_t_df <= 2:
        raise ValueError("student_t_df must be > 2 (finite-variance scaling requires df>2)")
    k = pca["factor_cov"].shape[0]
    L = np.linalg.cholesky(pca["factor_cov"] * horizon_scale + 1e-12 * np.eye(k))
    if student_t_df:        # unit-variance-scaled Student-t (fat tails); var of t = df/(df-2)
        z = rng.standard_t(student_t_df, size=(n_paths, k)) * np.sqrt((student_t_df-2)/student_t_df)
    else:
        z = rng.standard_normal((n_paths, k))
    factor_draws = z @ L.T
    if jump_prob > 0:
        hit = rng.random((n_paths, k)) < jump_prob
        factor_draws = factor_draws + hit * rng.normal(0.0, jump_scale, (n_paths, k))
    dy = factor_draws @ pca["components"]              # (n_paths, n_tenors)
    if include_drift:
        dy = dy + pca["mean_change"] * horizon_scale
    return base_yields + dy

def vasicek_calibrate(rate_series, dt):
    """Exact-OU MLE/OLS on r_{t+1}=a+b r_t+e (b=e^{-lam*dt}). Exact discrete OU mapping:
    lam=-ln(b)/dt; mu=a/(1-b); sigma=resid_std*sqrt(2*lam/(1-b^2)). Falls back gracefully
    if b out of (0,1)."""
    x = rate_series[:-1]; y = rate_series[1:]
    b, a = np.polyfit(x, y, 1)
    resid_std = (y - (a + b * x)).std(ddof=2)
    if 0 < b < 1:
        lam = -np.log(b) / dt
        sigma = resid_std * np.sqrt(2 * lam / (1 - b**2))
    else:                                   # near-unit-root: Euler fallback
        lam = max((1.0 - b) / dt, 1e-6)
        sigma = resid_std / np.sqrt(dt)
    mu = a / (1 - b) if b != 1 else float(np.mean(rate_series))
    return {"lam": lam, "mu": mu, "sigma": sigma}

def vasicek_simulate(r0, params, horizon, n_steps, n_paths, rng):
    lam, mu, sig = params["lam"], params["mu"], params["sigma"]
    dt = horizon / n_steps
    r = np.full(n_paths, float(r0))
    for _ in range(n_steps):
        r = r + lam*(mu-r)*dt + sig*np.sqrt(dt)*rng.standard_normal(n_paths)
    return r
