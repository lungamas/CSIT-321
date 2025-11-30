# train_advanced_segmentation_models.py
#
# Trains three separate segmentation models:
#  - Behavior-based (existing, can overwrite)
#  - Campaign targeting
#  - Engagement / demographic
#
# Usage (from Downloads):
#   python3 ml/train_advanced_segmentation_models.py ml/data/customers_train.csv

import sys
import os
import joblib
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

# Base features available in your dataset
FEATURES = [
    "age",
    "monthly_spend",
    "avg_order_value",
    "orders_per_month",
    "visits_per_month",
    "category_preference_score",
]

# Feature subsets for each segmentation type
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


def train_and_save(df, features, model_name_prefix):
    """
    Train a KMeans model + StandardScaler on selected features
    and save them under ml/models as <prefix>_scaler.pkl / <prefix>_model.pkl
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)

    X = df[features]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
    kmeans.fit(X_scaled)

    scaler_path = os.path.join(models_dir, f"{model_name_prefix}_scaler.pkl")
    model_path = os.path.join(models_dir, f"{model_name_prefix}_model.pkl")

    joblib.dump(scaler, scaler_path)
    joblib.dump(kmeans, model_path)

    print(f"Trained {model_name_prefix} model on features: {features}")
    print(f"  -> Scaler saved to: {scaler_path}")
    print(f"  -> Model  saved to: {model_path}\n")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 train_advanced_segmentation_models.py <customers_csv_path>")
        sys.exit(1)

    csv_path = sys.argv[1]
    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found: {csv_path}")
        sys.exit(1)

    df = pd.read_csv(csv_path)

    missing = [col for col in FEATURES if col not in df.columns]
    if missing:
        print(f"Error: Missing columns in CSV: {', '.join(missing)}")
        sys.exit(1)

    print("Loaded dataset with", len(df), "rows")

    # 1) Behavior-based segmentation (you already had this conceptually)
    train_and_save(df, BEHAVIOR_FEATURES, "segmentation")

    # 2) Campaign targeting segmentation
    train_and_save(df, CAMPAIGN_FEATURES, "campaign_segmentation")

    # 3) Engagement / demographic segmentation
    train_and_save(df, ENGAGEMENT_FEATURES, "engagement_segmentation")

    print("All advanced segmentation models trained successfully.")


if __name__ == "__main__":
    main()
