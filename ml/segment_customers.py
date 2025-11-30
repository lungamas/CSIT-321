# ===============================================
# segment_customers.py  (MULTI-MODE, PRETRAINED)
# Usage:
#   python3 segment_customers.py path/to/customers.csv [mode]
# mode: "behavior" | "campaign" | "engagement" (default: behavior)
# ===============================================
import sys
import json
import pandas as pd
import joblib
import os

# Base feature set from your dataset
FEATURES = [
    "age",
    "monthly_spend",
    "avg_order_value",
    "orders_per_month",
    "visits_per_month",
    "category_preference_score",
]

# Feature subsets mirroring the training script
BEHAVIOR_FEATURES = [
    "monthly_spend",
    "avg_order_value",
    "orders_per_month",
    "visits_per_month",
]

CAMPAIGN_FEATURES = [
    "monthly_spend",
    "avg_order_value",
    "orders_per_month",
]

ENGAGEMENT_FEATURES = [
    "age",
    "visits_per_month",
    "category_preference_score",
]

# Persona keys and display names
PERSONAS = {
    "eco_lux": "Eco-Lux Loyalists",
    "aspiring": "Aspiring Aesthetes",
    "gift": "Eco-Gift Shoppers",
}


def min_max_norm(value, min_v, max_v):
    """Normalize to 0–1 using min–max; if all equal, return 0.5."""
    if max_v == min_v:
        return 0.5
    return (value - min_v) / (max_v - min_v)


def assign_clusters(df: pd.DataFrame, mode: str):
    """
    For each mode, load the corresponding pre-trained scaler + model
    and assign clusters.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_dir, "models")

    if mode == "campaign":
        prefix = "campaign_segmentation"
        feat_cols = CAMPAIGN_FEATURES
    elif mode == "engagement":
        prefix = "engagement_segmentation"
        feat_cols = ENGAGEMENT_FEATURES
    else:  # default: behavior
        prefix = "segmentation"
        feat_cols = BEHAVIOR_FEATURES

    scaler_path = os.path.join(models_dir, f"{prefix}_scaler.pkl")
    model_path = os.path.join(models_dir, f"{prefix}_model.pkl")

    if not os.path.exists(scaler_path) or not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Model or scaler not found for mode '{mode}'. "
            f"Expected:\n  {scaler_path}\n  {model_path}"
        )

    scaler = joblib.load(scaler_path)
    model = joblib.load(model_path)

    X = df[feat_cols]
    X_scaled = scaler.transform(X)
    clusters = model.predict(X_scaled)
    df["cluster"] = clusters
    return df


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No CSV file path provided"}))
        sys.exit(1)

    csv_path = sys.argv[1]
    mode = sys.argv[2].lower() if len(sys.argv) >= 3 else "behavior"
    if mode not in ("behavior", "campaign", "engagement"):
        mode = "behavior"

    if not os.path.exists(csv_path):
        print(json.dumps({"error": f"File not found: {csv_path}"}))
        sys.exit(1)

    # Load data
    df = pd.read_csv(csv_path)

    # Check required columns
    missing = [col for col in FEATURES if col not in df.columns]
    if missing:
        print(json.dumps({"error": f"Missing columns: {', '.join(missing)}"}))
        sys.exit(1)

    # ---- 1) Assign clusters depending on mode ----
    try:
        df = assign_clusters(df, mode)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    total = len(df)
    cluster_stats = []

    # ---- 2) Compute metrics per cluster ----
    for cluster_id, group in df.groupby("cluster"):
        count = len(group)
        percentage = (count / total) * 100 if total > 0 else 0

        avg_age = group["age"].mean()
        avg_spend = group["monthly_spend"].mean()
        avg_aov = group["avg_order_value"].mean()
        avg_orders = group["orders_per_month"].mean()
        avg_visits = group["visits_per_month"].mean()
        avg_pref = group["category_preference_score"].mean()

        cluster_stats.append(
            {
                "cluster": int(cluster_id),
                "count": int(count),
                "percentage": percentage,
                "avg_age": avg_age,
                "avg_monthly_spend": avg_spend,
                "avg_order_value": avg_aov,
                "avg_orders_per_month": avg_orders,
                "avg_visits_per_month": avg_visits,
                "avg_category_preference_score": avg_pref,
            }
        )

    if not cluster_stats:
        print(json.dumps({"mode": mode, "total_customers": 0, "segments": []}))
        sys.exit(0)

    # ---- 3) Build min–max ranges across clusters (for persona scoring) ----
    spends = [c["avg_monthly_spend"] for c in cluster_stats]
    aovs = [c["avg_order_value"] for c in cluster_stats]
    orders = [c["avg_orders_per_month"] for c in cluster_stats]
    visits = [c["avg_visits_per_month"] for c in cluster_stats]
    prefs = [c["avg_category_preference_score"] for c in cluster_stats]

    min_spend, max_spend = min(spends), max(spends)
    min_aov, max_aov = min(aovs), max(aovs)
    min_orders, max_orders = min(orders), max(orders)
    min_visits, max_visits = min(visits), max(visits)
    min_pref, max_pref = min(prefs), max(prefs)

    # ---- 4) Compute scores per persona for each cluster ----
    for c in cluster_stats:
        ns = min_max_norm(c["avg_monthly_spend"], min_spend, max_spend)
        na = min_max_norm(c["avg_order_value"], min_aov, max_aov)
        no = min_max_norm(c["avg_orders_per_month"], min_orders, max_orders)
        nv = min_max_norm(c["avg_visits_per_month"], min_visits, max_visits)
        np = min_max_norm(
            c["avg_category_preference_score"], min_pref, max_pref
        )

        # Same persona logic; which cluster matches which persona will depend on mode.
        eco_lux_score = (ns + na + no) / 3.0
        aspiring_score = (nv + np) / 2.0
        gift_score = ((1 - no) + (1 - nv) + ns) / 3.0

        c["scores"] = {
            "eco_lux": eco_lux_score,
            "aspiring": aspiring_score,
            "gift": gift_score,
        }

    # ---- 5) Assign each persona to one cluster (smart mapping) ----
    persona_keys = list(PERSONAS.keys())  # ["eco_lux", "aspiring", "gift"]
    assigned = {}  # cluster_id -> persona_key
    used_personas = set()

    while len(assigned) < len(cluster_stats) and len(used_personas) < len(
        persona_keys
    ):
        best_cluster = None
        best_persona = None
        best_score = -1.0

        for c in cluster_stats:
            cid = c["cluster"]
            if cid in assigned:
                continue
            for p in persona_keys:
                if p in used_personas:
                    continue
                s = c["scores"][p]
                if s > best_score:
                    best_score = s
                    best_cluster = cid
                    best_persona = p

        if best_cluster is None:
            break

        assigned[best_cluster] = best_persona
        used_personas.add(best_persona)

    # Any remaining clusters → assign by max score
    for c in cluster_stats:
        cid = c["cluster"]
        if cid not in assigned:
            scores = c["scores"]
            best_persona = max(scores, key=scores.get)
            assigned[cid] = best_persona

    # ---- 6) Build final segments with persona labels & scores ----
    segments = []
    for c in cluster_stats:
        cid = c["cluster"]
        persona_key = assigned.get(cid, "gift")  # default fallback
        persona_name = PERSONAS[persona_key]
        persona_score = c["scores"][persona_key]

        segments.append(
            {
                "cluster": cid,
                "persona_key": persona_key,
                "label": persona_name,
                "score": round(persona_score, 3),
                "count": c["count"],
                "percentage": round(c["percentage"], 2),
                "avg_age": round(c["avg_age"], 2),
                "avg_monthly_spend": round(c["avg_monthly_spend"], 2),
                "avg_order_value": round(c["avg_order_value"], 2),
                "avg_orders_per_month": round(c["avg_orders_per_month"], 2),
                "avg_visits_per_month": round(c["avg_visits_per_month"], 2),
                "avg_category_preference_score": round(
                    c["avg_category_preference_score"], 3
                ),
            }
        )

    # Sort segments by persona score (descending)
    segments.sort(key=lambda s: s["score"], reverse=True)

    result = {
        "mode": mode,
        "total_customers": int(total),
        "segments": segments,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
