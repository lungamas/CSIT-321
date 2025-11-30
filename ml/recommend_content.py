import pandas as pd
import pickle
import sys
import json
import os

# Always resolve paths relative to this file, no matter where Python is called from
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "content_model.pkl")


def recommend_content(data_path: str):
    # Load the trained model
    try:
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
    except FileNotFoundError:
        return {
            "error": f"Model file not found at {MODEL_PATH}",
            "solution": "Please run: python ml/train_content_model.py"
        }
    except (ValueError, TypeError) as e:
        # Handle sklearn version incompatibility
        error_msg = str(e)
        if "incompatible dtype" in error_msg or "missing_go_to_left" in error_msg:
            return {
                "error": "Model was trained with an incompatible scikit-learn version",
                "solution": "Please retrain the model by running: python ml/train_content_model.py"
            }
        return {"error": f"Failed to load model: {error_msg}"}
    except Exception as e:
        return {"error": f"Failed to load model: {e}"}

    try:
        df = pd.read_csv(data_path)
    except Exception as e:
        return {"error": f"Unable to read CSV file: {e}"}

    # These are the numeric columns we actually have in content_train.csv
    feature_cols = [
        "avg_engagement_rate",
        "avg_conversion_rate",
        "avg_roas",
        "sample_size",
    ]

    # Safety check
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        return {"error": f"Missing expected columns in data: {missing}"}

    X = df[feature_cols]

    # Predict an overall performance / priority score
    df["predicted_score"] = model.predict(X)

    # Sort best → worst
    df_sorted = df.sort_values(by="predicted_score", ascending=False).reset_index(drop=True)

    # Top 5 recommendations (high-level)
    top_picks = df_sorted.head(5)[
        ["persona_key", "campaign_goal", "channel", "format", "predicted_score"]
    ].to_dict(orient="records")

    # Table for UI (first 25 rows)
    table_display = df_sorted.head(25)[
        ["content_id", "persona_key", "campaign_goal", "channel", "format", "predicted_score"]
    ].to_dict(orient="records")

    return {
        "total_items": int(len(df_sorted)),
        "top_recommendations": top_picks,
        "table": table_display,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python ml/recommend_content.py path/to/file.csv"}))
        sys.exit(1)

    data_path = sys.argv[1]
    results = recommend_content(data_path)
    print(json.dumps(results, indent=2))
