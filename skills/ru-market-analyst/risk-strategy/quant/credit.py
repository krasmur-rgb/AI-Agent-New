# quant/credit.py
import numpy as np
from scipy.stats import norm

def default_thresholds(pd):
    """CreditMetrics: default if asset return < Phi^{-1}(PD). National-scale PD per bucket."""
    return norm.ppf(np.asarray(pd, float))

def simulate_defaults(pd, beta, n_paths, seed):
    """One-factor Gaussian copula: A_i = beta_i*Z + sqrt(1-beta_i^2)*eps_i; default if A_i<thr_i.
    Z is the shared systematic factor (low Z = bad state). pd, beta: (n_oblig,).
    Returns (defaults bool (n_paths,n_oblig), Z (n_paths,)) so recovery ties to the SAME factor."""
    rng = np.random.default_rng(seed)
    pd = np.clip(np.asarray(pd, float), 1e-6, 1 - 1e-6)        # guard: valid PD
    beta = np.clip(np.asarray(beta, float), 0.0, 0.999)        # guard: valid factor loading
    thr = default_thresholds(pd)
    Z = rng.standard_normal((n_paths, 1))
    eps = rng.standard_normal((n_paths, len(pd)))
    A = beta * Z + np.sqrt(1 - beta**2) * eps
    return A < thr, Z[:, 0]

def recovery(systematic, mean_rr, factor_load=0.15):
    """Recovery tied to the systematic factor (negative PD-recovery dependence): defaults
    cluster where Z is low, and recovery is lower there too. systematic:(n_paths,)~N(0,1).
    factor_load is a FLAGGED ASSUMPTION (RU recovery data sparse). Returns rr per path [0,1]."""
    return np.clip(mean_rr + factor_load * np.asarray(systematic), 0.0, 1.0)
