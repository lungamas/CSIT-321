# ===============================================
# score_performance.py  (advanced multi-model, backwards compatible)
# ===============================================
import sys
import os
import json
import pandas as pd
import joblib

FEATURES = [
    "impressions", "clicks", "spend",
    "conversions", "sessions", "add_to_carts",
    "avg_session_duration",
]


def error(msg, code=1):
    print(json.dumps({"error": msg}))
    sys.exit(code)


def safe_div(num, den):
    return float(num) / float(den) if den not in (0, 0.0) else 0.0


def load_model(mode: str, base_dir: str):
    if mode == "engagement":
        prefix = "perf_engagement"
        metric_name = "Predicted Engagement (CTR)"
    elif mode == "conversion":
        prefix = "perf_conversion"
        metric_name = "Predicted Conversion Rate"
    else:
        prefix = "perf_roi"
        metric_name = "Predicted ROAS"

    model_path = os.path.join(base_dir, "models", f"{prefix}_model.pkl")
    scaler_path = os.path.join(base_dir, "models", f"{prefix}_scaler.pkl")

    if not os.path.exists(model_path) or not os.path.exists(scaler_path):
        error(f"Model or scaler not found for mode '{mode}'. Please run: python ml/train_advanced_performance_models.py")

    try:
        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
    except (ValueError, TypeError) as e:
        error_msg = str(e)
        if "incompatible dtype" in error_msg or "missing_go_to_left" in error_msg:
            error(f"Model incompatible with current scikit-learn version. Please retrain: python ml/train_advanced_performance_models.py")
        error(f"Failed to load model: {error_msg}")
    
    return model, scaler, metric_name


def main():
    if len(sys.argv) < 2:
        error("No CSV path provided")

    csv_path = sys.argv[1]
    mode = sys.argv[2].lower() if len(sys.argv) >= 3 else "roi"
    if mode not in ("engagement", "roi", "conversion"):
        mode = "roi"

    if not os.path.exists(csv_path):
        error(f"File not found: {csv_path}")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    model, scaler, metric_name = load_model(mode, base_dir)

    # ---- load data ----
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        error(f"Failed to read CSV: {e}")

    missing = [c for c in FEATURES if c not in df.columns]
    if missing:
        error(f"Missing columns: {', '.join(missing)}")

    X = df[FEATURES]
    try:
        X_scaled = scaler.transform(X)
    except Exception as e:
        error(f"Scaling failed: {e}")

    try:
        pred = model.predict(X_scaled)
    except Exception as e:
        error(f"Model prediction failed: {e}")

    # campaign ids
    campaign_ids = (
        df["campaign_id"].astype(str)
        if "campaign_id" in df.columns
        else pd.Series(range(len(df))).astype(str)
    )

    # ---- derived actual metrics ----
    ctr_vals = [safe_div(c, i) for c, i in zip(df["clicks"], df["impressions"])]
    conv_rate_vals = [
        safe_div(conv, clk) for conv, clk in zip(df["conversions"], df["clicks"])
    ]
    cpc_vals = [safe_div(sp, clk) for sp, clk in zip(df["spend"], df["clicks"])]

    predictions = []
    for cid, score, ctr, cr, cpc in zip(
        campaign_ids, pred, ctr_vals, conv_rate_vals, cpc_vals
    ):
        predictions.append(
            {
                "campaign_id": str(cid),
                # new generic name
                "pred_score": round(float(score), 4),
                # backwards-compatible field that your UI expects
                "pred_roas": round(float(score), 4),
                "ctr": round(float(ctr), 4),
                "conversion_rate": round(float(cr), 4),
                "cpc": round(float(cpc), 4),
            }
        )

    # ---- ranking depends on mode ----
    if mode == "engagement":
        sort_key = "ctr"
    elif mode == "conversion":
        sort_key = "conversion_rate"
    else:  # roi
        sort_key = "pred_score"

    df_scores = pd.DataFrame(predictions)
    top_df = df_scores.sort_values(sort_key, ascending=False).head(5)

    top_campaigns = []
    for _, r in top_df.iterrows():
        top_campaigns.append(
            {
                "campaign_id": r["campaign_id"],
                "pred_score": round(float(r["pred_score"]), 4),
                "pred_roas": round(float(r["pred_score"]), 4),  # same value
                "ctr": round(float(r["ctr"]), 4),
                "conversion_rate": round(float(r["conversion_rate"]), 4),
                "cpc": round(float(r["cpc"]), 4),
            }
        )

    # For compatibility with old frontend names:
    top_recommendations = []
    for item in top_campaigns:
        top_recommendations.append(
            {
                "campaign_id": item["campaign_id"],
                "pred_roas": item["pred_roas"],
                "suggestion": "Prioritise this campaign based on the selected performance mode.",
            }
        )

    result = {
        "mode": mode,
        "metric_name": metric_name,
        "total_campaigns": int(len(df)),
        "predictions": predictions,
        "top_campaigns": top_campaigns,
        # old names your React is already using
        "top_recommendations": top_recommendations,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
