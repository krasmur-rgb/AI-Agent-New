# quant/selftests/test_risk.py
import numpy as np
from quant import risk

def test_var_es_ordering_and_known_normal():
    rng = np.random.default_rng(7)
    losses = rng.normal(0, 1, 200000)               # loss distribution
    v = risk.var(losses, 0.95); e = risk.es(losses, 0.95)
    assert abs(v - 1.645) < 0.05                     # normal 95% VaR ≈ 1.645σ
    assert e >= v                                    # ES ≥ VaR
    assert abs(e - 2.063) < 0.05                     # normal 95% ES ≈ 2.063σ

def test_component_es_sums_to_portfolio_es():
    rng = np.random.default_rng(8)
    pos = rng.normal(0, 1, (50000, 3))               # per-position losses
    comp = risk.component_es(pos, 0.95)
    port = risk.es(pos.sum(axis=1), 0.95)
    assert abs(comp.sum() - port) < 1e-6             # Euler allocation is additive

def test_prob_loss_and_percentiles():
    losses = np.linspace(-10, 10, 1001)   # step 0.02; values >5 are (5.02..10] = 250 points
    assert abs(risk.prob_loss_beyond(losses, 5.0) - 250/1001) < 0.01
    p = risk.percentiles(losses, [5, 50, 95])
    assert p[1] == 0.0

def test_es_standard_error_shrinks_with_n():
    rng = np.random.default_rng(11)
    se_small = risk.es_standard_error(rng.normal(0, 1, 20000), 0.95)
    se_big = risk.es_standard_error(rng.normal(0, 1, 400000), 0.95)
    assert se_big < se_small and se_big > 0

def test_prob_weighted_scenarios():
    scen = [{"return": 0.05, "prob": 0.6}, {"return": -0.02, "prob": 0.3},
            {"return": -0.15, "prob": 0.1}]
    out = risk.prob_weighted(scen)
    assert abs(out["expected"] - (0.6*0.05 + 0.3*-0.02 - 0.1*0.15)) < 1e-9
    assert out["worst"] == -0.15
    assert abs(out["prob_neg"] - 0.4) < 1e-9

def test_es_handles_atom_at_var():
    # 96% loss=0, 4% loss=1; VaR_95=0, but CVaR_95 = mean worst 5% = (4%*1 + 1%*0)/5% = 0.8
    losses = np.concatenate([np.zeros(96000), np.ones(4000)])
    assert abs(risk.es(losses, 0.95) - 0.8) < 0.01
    assert risk.es(losses, 0.95) > risk.var(losses, 0.95)   # the bug the old mean>=VaR missed
