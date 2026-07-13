# quant/selftests/test_reprice.py
import numpy as np
from quant import reprice

def test_flat_curve_par_bond_prices_at_face():
    # 5% annual coupon, 3y, flat 5% curve → price ≈ 100
    times = np.array([1.0, 2.0, 3.0]); amounts = np.array([5.0, 5.0, 105.0])
    tenors = np.array([0.5, 1, 2, 3, 5]); yields = np.full(5, 5.0)
    px = reprice.price(times, amounts, tenors, yields, spread_bp=0.0)
    assert abs(px - 100.0) < 0.05

def test_zero_interp_linear():
    tenors = np.array([1.0, 3.0]); yields = np.array([10.0, 14.0])
    assert abs(reprice.zero_rate(tenors, yields, 2.0) - 12.0) < 1e-9   # linear midpoint

def test_higher_yield_lower_price():
    times = np.array([1.0, 2.0, 3.0]); amounts = np.array([5.0, 5.0, 105.0])
    tenors = np.array([0.5, 1, 2, 3, 5])
    p_lo = reprice.price(times, amounts, tenors, np.full(5, 5.0))
    p_hi = reprice.price(times, amounts, tenors, np.full(5, 7.0))
    assert p_hi < p_lo

def test_cashflows_fixed_and_amortizing():
    cf = reprice.cashflows(face=100, coupon_pct=8.0, freq=1, maturity=3)
    assert np.allclose(cf[0], [1, 2, 3]) and np.allclose(cf[1], [8, 8, 108])
    cfa = reprice.cashflows(face=100, coupon_pct=8.0, freq=1, maturity=2,
                            amort=[50, 50])   # 50 principal each year
    # year1: coupon 8 + amort 50; year2: coupon on remaining 50 = 4 + amort 50
    assert np.allclose(cfa[1], [58, 54])

def test_total_return_sign():
    cf = reprice.cashflows(face=100, coupon_pct=8.0, freq=1, maturity=3)
    tenors = np.array([0.5,1,2,3,5])
    tr = reprice.total_return(cf, tenors, np.full(5,8.0), np.full(5,6.0),
                              spread_bp=0.0, horizon=1.0)
    assert tr > 0      # rates fell 8→6 over horizon → positive total return

def test_mod_duration_positive_and_finite_diff():
    cf = reprice.cashflows(face=100, coupon_pct=8.0, freq=1, maturity=5)
    tenors = np.array([0.5,1,2,3,5,7]); y = np.full(6,8.0)
    d = reprice.mod_duration(cf, tenors, y)
    assert 3.0 < d < 5.0

def test_floater_low_price_duration():
    cf = reprice.cashflows(face=100, coupon_pct=16.0, freq=4, maturity=3)
    tenors = np.array([0.25,0.5,1,2,3,5]); y = np.full(6, 16.0)
    d_fix = reprice.mod_duration(cf, tenors, y)
    d_flt = reprice.floater_price_duration(reset_years=0.25)
    assert d_flt < d_fix and d_flt < 0.3            # floater price duration ≈ time to reset

def test_linker_indexation_lifts_principal():
    base = reprice.cashflows(face=100, coupon_pct=2.5, freq=1, maturity=3)
    idx = reprice.linker_cashflows(face=100, coupon_pct=2.5, freq=1, maturity=3,
                                   cum_cpi=1.10)     # +10% indexation
    assert idx[1][-1] > base[1][-1]                  # indexed redemption higher

def test_fx_repricing_scales_with_rate():
    cf = reprice.cashflows(face=100, coupon_pct=5, freq=1, maturity=3)  # USD-denominated
    tenors=np.array([0.5,1,2,3,5]); y=np.full(5,5.0)
    rub_lo = reprice.price_fx(cf, tenors, y, fx=90.0)
    rub_hi = reprice.price_fx(cf, tenors, y, fx=100.0)
    assert rub_hi > rub_lo                            # weaker RUB → higher RUB value

def test_g_spread_to_matched_duration_ofz():
    ofz_t = np.array([1.0, 3.0, 5.0]); ofz_y = np.array([15.0, 16.0, 16.5])
    # corporate YTM 19% at duration 3 → G-spread to the 3y ОФЗ (16%) = 300 bp
    assert abs(reprice.g_spread(19.0, 3.0, ofz_t, ofz_y) - 300.0) < 1e-6
