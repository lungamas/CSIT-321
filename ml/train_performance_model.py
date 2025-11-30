import os, joblib, pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error
from sklearn.preprocessing import StandardScaler

# ====== EXPECTED COLUMNS in your campaign CSV ======
# campaign_id, impressions, clicks, spend, conversions, sessions, add_to_carts, avg_session_duration
# TARGET to predict: roas (revenue/spend)  OR  ctr (clicks/impressions)  OR conversion_rate (conversions/clicks)
# For demo, we predict ROAS. If 'revenue' not present, you can compute it beforehand and include 'roas'.

FEATURES = [
    "impressions", "clicks", "spend",
    "conversions", "sessions", "add_to_carts",
    "avg_session_duration"
]
TARGET = "roas"  # numeric

df = pd.read_csv("data/campaigns_train.csv")   # put your training file here
X, y = df[FEATURES], df[TARGET]

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

X_tr, X_te, y_tr, y_te = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

rf = RandomForestRegressor(n_estimators=300, random_state=42)
rf.fit(X_tr, y_tr)

pred = rf.predict(X_te)
print("R^2:", round(r2_score(y_te, pred), 4))
print("MAE:", round(mean_absolute_error(y_te, pred), 4))

os.makedirs("models", exist_ok=True)
joblib.dump(rf, "models/perf_model.pkl")
joblib.dump(scaler, "models/perf_scaler.pkl")
print("✅ Saved models/perf_model.pkl & models/perf_scaler.pkl")
