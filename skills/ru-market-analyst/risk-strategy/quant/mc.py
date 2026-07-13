# quant/mc.py
import numpy as np
from . import curve as _curve, reprice as _reprice

def simulate_book(positions, base_yields, tenors, pca, n_paths, horizon, seed,
                  horizon_scale=None, credit_on=False, include_drift=False,
                  student_t_df=None, jump_prob=0.0, jump_scale=0.0,
                  recovery_factor_load=0.15):
    rng = np.random.default_rng(seed)
    base_yields = np.asarray(base_yields, float); tenors = np.asarray(tenors, float)
    scale = horizon_scale if horizon_scale is not None else horizon * 252
    curve1 = _curve.simulate_curve_terminal(base_yields, pca, n_paths, rng, scale,
                                            include_drift=include_drift, student_t_df=student_t_df,
                                            jump_prob=jump_prob, jump_scale=jump_scale)
    weights = np.array([p["weight"] for p in positions])
    pos_ret = np.empty((n_paths, len(positions)))
    for j, p in enumerate(positions):
        cf = _reprice.cashflows(p["face"], p["coupon_pct"], p["freq"], p["maturity"],
                                p.get("amort"))
        sp = p.get("spread_bp", 0.0)
        for i in range(n_paths):
            pos_ret[i, j] = _reprice.total_return(cf, tenors, base_yields, curve1[i],
                                                  sp, horizon)
    if credit_on and any("pd" in p for p in positions):
        from . import credit as _credit
        # a position carrying default risk must specify all three — no silent hardcoded default
        for p in positions:
            if "pd" in p and ("beta" not in p or "mean_rr" not in p):
                raise ValueError("credit position with pd needs beta and mean_rr (no silent default)")
        credit_idx = [j for j, p in enumerate(positions) if "pd" in p]
        pd = np.array([positions[j]["pd"] for j in credit_idx])
        beta = np.array([positions[j]["beta"] for j in credit_idx])
        mean_rr = np.array([positions[j]["mean_rr"] for j in credit_idx])
        dmask, Z = _credit.simulate_defaults(pd, beta, n_paths, seed + 2)
        # FLAGGED ASSUMPTION: default at horizon → defaulted position returns (recovery - 1)
        # relative to its start mark. Override ONLY positions that carry pd (non-credit legs
        # untouched — no micro-defaults); recovery tied to the SAME systematic factor Z.
        for col, j in enumerate(credit_idx):
            rr = _credit.recovery(Z, mean_rr[col], recovery_factor_load)
            pos_ret[:, j] = np.where(dmask[:, col], rr - 1.0, pos_ret[:, j])
    port_ret = pos_ret @ weights
    return {"port_return": port_ret, "pos_return": pos_ret, "weights": weights}
