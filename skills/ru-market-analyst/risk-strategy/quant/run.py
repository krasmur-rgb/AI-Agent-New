# quant/run.py
import json, sys
import numpy as np
from . import curve as _curve, mc as _mc, risk as _risk

def run_analysis(portfolio, config):
    tenors = np.asarray(portfolio["tenors"], float)
    positions = portfolio["positions"]
    _CREDIT_RISK = ("pd", "beta", "mean_rr")
    credit_on = config.get("credit_on", False)
    for _p in positions:
        for _k in _CREDIT_RISK:
            if _k in _p and f"{_k}_meta" not in _p:
                raise ValueError(f"credit input '{_k}' without provenance ('{_k}_meta') — no-hardcode")
        if credit_on and "pd" in _p and not all(k in _p for k in _CREDIT_RISK):
            raise ValueError("credit position with pd needs beta and mean_rr (+ *_meta) — no silent default")
    pca = _curve.pca_factors(np.asarray(portfolio["yields_hist"], float),
                             config.get("n_factors", 3))
    out = _mc.simulate_book(positions, portfolio["base_yields"], tenors,
                            pca, config["n_paths"], config["horizon"], config["seed"],
                            horizon_scale=config.get("horizon_scale"),
                            credit_on=credit_on,
                            include_drift=config.get("include_drift", False),
                            student_t_df=config.get("student_t_df"),
                            jump_prob=config.get("jump_prob", 0.0),
                            jump_scale=config.get("jump_scale", 0.0),
                            recovery_factor_load=config.get("recovery_factor_load", 0.15))
    losses = -out["port_return"]                      # loss = negative return
    a = config.get("alpha", 0.95)
    pos_losses = -out["pos_return"] * out["weights"]
    return {
        "asof": portfolio.get("asof"),
        "var": _risk.var(losses, a), "es": _risk.es(losses, a),
        "percentiles": {str(p): float(v) for p, v in
                        zip([5,50,95], _risk.percentiles(out["port_return"], [5,50,95]))},
        "prob_loss_beyond_0": _risk.prob_loss_beyond(losses, 0.0),
        "components": [float(x) for x in _risk.component_es(pos_losses, a)],
        "fan_chart": {str(k): [float(x)] for k, v in
                      _risk.fan_chart_data(out["port_return"][:, None]).items() for x in [v[0]]},
        "n_paths": config["n_paths"], "explained_var": [float(x) for x in pca["explained"]],
        "assumptions": {
            "recovery_factor_load": config.get("recovery_factor_load", 0.15),
            "student_t_df": config.get("student_t_df"),
            "jump_prob": config.get("jump_prob", 0.0),
            "jump_scale": config.get("jump_scale", 0.0),
            "include_drift": config.get("include_drift", False),
            "note": "recovery/correlation/jumps/Student-t are flagged assumptions — sensitivity-test; "
                    "curve via i.i.d. random-walk PCA (no mean-reversion)",
        },
        "model_risk": "MC informs ordinal scoring; correlations/recovery/jumps are flagged assumptions",
    }

def main(argv=None):
    argv = argv or sys.argv[1:]
    portfolio = json.load(open(argv[0])); config = json.load(open(argv[1]))
    json.dump(run_analysis(portfolio, config), sys.stdout, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
