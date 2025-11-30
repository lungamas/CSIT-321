import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score
import pickle

DATA_PATH = "ml/data/content_train.csv"
MODEL_PATH = "ml/models/content_model.pkl"


def main():
    # 1. Load data
    df = pd.read_csv(DATA_PATH)

    # 2. Define features (these exist in your CSV)
    feature_cols = [
        "avg_engagement_rate",
        "avg_conversion_rate",
        "avg_roas",
        "sample_size",
    ]
    X = df[feature_cols]

    # 3. Create a synthetic "performance score" target
    #    (higher engagement + conversion + ROAS → higher score)
    y = (
        0.5 * df["avg_engagement_rate"]
        + 1.5 * df["avg_conversion_rate"]
        + 0.02 * df["avg_roas"]
    )

    # 4. Train/test split (for sanity check)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # 5. Train RandomForest model
    model = RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    # 6. Quick evaluation
    y_pred = model.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    print(f"Validation R²: {r2:.3f}")

    # 7. Save the **model**, not the predictions
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    print(f"Saved content recommendation model to {MODEL_PATH}")


if __name__ == "__main__":
    main()
