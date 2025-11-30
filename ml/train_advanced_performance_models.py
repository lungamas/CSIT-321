import os
import sys
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error
from sklearn.preprocessing import StandardScaler

# Same input features as before
FEATURES = [
    "impressions", "clicks", "spend",
    "conversions", "sessions", "add_to_carts",
    "avg_session_duration",
]

def train_and_save(df, target_col, name_prefix):
    X = df[FEATURES]
    y = df[target_col]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_tr, X_te, y_tr, y_te = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42
    )

    rf = RandomForestRegressor(n_estimators=300, random_state=42)
    rf.fit(X_tr, y_tr)

    pred = rf.predict(X_te)
    print(f"{name_prefix} R^2:", round(r2_score(y_te, pred), 4))
    print(f"{name_prefix} MAE:", round(mean_absolute_error(y_te, pred), 4))

    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, f"{name_prefix}_model.pkl")
    scaler_path = os.path.join(models_dir, f"{name_prefix}_scaler.pkl")

    joblib.dump(rf, model_path)
    joblib.dump(scaler, scaler_path)
    print(f"✅ Saved {model_path} & {scaler_path}\n")

def main():
    # If a path is given, use it. Otherwise default to ml/data/campaigns_train.csv
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if len(sys.argv) >= 2:
        csv_path = sys.argv[1]
        if not os.path.isabs(csv_path):
            csv_path = os.path.join(base_dir, csv_path)
    else:
        csv_path = os.path.join(base_dir, "data", "campaigns_train.csv")

    print("Using training file:", csv_path)

    if not os.path.exists(csv_path):
        print("ERROR: CSV file not found:", csv_path)
        sys.exit(1)

    df = pd.read_csv(csv_path)

    # Derived targets
    df["ctr"] = df["clicks"] / df["impressions"].replace(0, 1)
    df["conversion_rate"] = df["conversions"] / df["clicks"].replace(0, 1)

    # 1) ROI model – assumes your CSV has a 'roas' column
    train_and_save(df, "roas", "perf_roi")

    # 2) Engagement model – predict CTR
    train_and_save(df, "ctr", "perf_engagement")

    # 3) Conversion model – predict conversion rate
    train_and_save(df, "conversion_rate", "perf_conversion")

    print("✅ All advanced performance models trained.")

if __name__ == "__main__":
    main()
