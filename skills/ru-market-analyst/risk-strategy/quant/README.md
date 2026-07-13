# quant — RU bond Monte-Carlo toolkit
Калиброванный MC по облигациям РФ. No-hardcode: входы — с живых RU-источников (MOEX G-curve,
ЦБ, Эксперт РА/АКРА/НКР) или флаг-допущения.

## Запуск
```
python3 -m venv ../../.venv-quant && ../../.venv-quant/bin/pip install -r requirements.txt
../../.venv-quant/bin/python -m quant.run portfolio.json config.json
```
`portfolio.json`: tenors, yields_hist, base_yields, positions (face/coupon_pct/freq/maturity/
weight/spread_bp[/pd/beta/mean_rr/amort]). `config.json`: n_paths, horizon, seed, alpha.
Выход: ES/CVaR, VaR, перцентили, P(loss), компонентная ES, fan-chart, explained_var.

## Тесты
`cd .. && ../.venv-quant/bin/python -m pytest quant/selftests -q`

Методология — `../references/quant-scenarios.md`.
