# ===============================================
# train_segmentation_model.py
# ===============================================
import os

import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
import joblib

# -------------------------------
# Load dataset
# -------------------------------
# Make sure this path is correct relative to this script
data_path = "data/customers_train.csv"
df = pd.read_csv(data_path)

# Features to use for clustering
FEATURES = [
    "age",
    "monthly_spend",
    "avg_order_value",
    "orders_per_month",
    "visits_per_month",
    "category_preference_score",
]

X = df[FEATURES]

# -------------------------------
# Scale the data
# -------------------------------
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# -------------------------------
# Train K-Means model
# -------------------------------
# You can change n_clusters to 3, 4, 5 depending on how many personas you want
kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
kmeans.fit(X_scaled)

# -------------------------------
# Inspect cluster stats (for your report)
# -------------------------------
df["cluster"] = kmeans.labels_
cluster_summary = df.groupby("cluster")[FEATURES].mean()

print("\nCluster Summary (for analysis):\n")
print(cluster_summary)
print("\nCounts per cluster:\n")
print(df["cluster"].value_counts())

# -------------------------------
# Save model + scaler
# -------------------------------
os.makedirs("models", exist_ok=True)
joblib.dump(kmeans, "models/segmentation_model.pkl")
joblib.dump(scaler, "models/segmentation_scaler.pkl")

print("\n✅ Model training complete!")
print("Model saved as: models/segmentation_model.pkl")
print("Scaler saved as: models/segmentation_scaler.pkl")
