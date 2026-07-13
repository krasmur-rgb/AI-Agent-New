# quant/risk.py
import numpy as np

def var(losses, alpha):
    return float(np.quantile(losses, alpha))

def es(losses, alpha):
    """Historical CVaR = mean of the worst ceil((1-alpha)*n) losses. Rank-based (not
    losses>=VaR) so it stays correct when VaR sits on an atom — e.g. credit-default
    distributions with a mass point at zero loss."""
    losses = np.asarray(losses)
    n = losses.size
    if n == 0:
        return float("nan")
    k = max(1, int(np.ceil(round((1 - alpha) * n, 6))))   # round kills float noise (50.0000004→50)
    worst = np.partition(losses, n - k)[n - k:]
    return float(worst.mean())

def percentiles(values, pcts):
    return np.percentile(values, pcts)

def prob_loss_beyond(losses, threshold):
    return float(np.mean(losses > threshold))

def component_es(position_losses, alpha):
    """Euler ES contribution: mean of L_i over the worst-k portfolio outcomes (same rank-based
    tail as es). Sums exactly to es(portfolio)."""
    port = position_losses.sum(axis=1)
    n = port.size
    k = max(1, int(np.ceil(round((1 - alpha) * n, 6))))   # same robust tail count as es()
    idx = np.argpartition(port, n - k)[n - k:]
    return position_losses[idx].mean(axis=0)

def fan_chart_data(path_values, pcts=(5, 25, 50, 75, 95)):
    """path_values: (n_paths, n_steps). Returns dict pct->(n_steps,) bands."""
    return {p: np.percentile(path_values, p, axis=0) for p in pcts}

def es_standard_error(losses, alpha, n_batches=20):
    """Batch-means standard error of the ES estimate — MC convergence diagnostic.
    Warn upstream if the tail sample (n_paths*(1-alpha)) is small."""
    batches = [b for b in np.array_split(np.asarray(losses), n_batches) if len(b)]
    ests = np.array([es(b, alpha) for b in batches])
    return float(ests.std(ddof=1) / np.sqrt(len(ests)))

def prob_weighted(scenarios):
    """Lighter bridge: probabilities on a small deterministic scenario set.
    scenarios: list of {'return','prob'} (probs need not sum to 1 — normalized)."""
    p = np.array([s["prob"] for s in scenarios], float); p = p / p.sum()
    r = np.array([s["return"] for s in scenarios], float)
    return {"expected": float((p * r).sum()), "worst": float(r.min()),
            "prob_neg": float(p[r < 0].sum())}
