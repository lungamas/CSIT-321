#!/Users/bulumkamaseko/Desktop/miniconda3/bin/python
"""
AI Chatbot with Machine Learning Integration
Uses trained models for:
- Content recommendations
- Performance predictions
- Customer segmentation
"""
import sys
import os

# Suppress warnings at environment level
os.environ['PYTHONWARNINGS'] = 'ignore'

import json
import re
import warnings

# Suppress sklearn version warnings and other warnings
warnings.filterwarnings('ignore')
warnings.simplefilter('ignore')

import pickle
import joblib
import pandas as pd  # type: ignore
import numpy as np  # type: ignore

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.join(BASE_DIR, "..", "ml")
MODELS_DIR = os.path.join(ML_DIR, "models")


class MLChatbot:
    def __init__(self):
        self.models = {}
        self.load_models()
    
    def load_models(self):
        """Load all available ML models"""
        try:
            # Content recommendation model
            content_path = os.path.join(MODELS_DIR, "content_model.pkl")
            if os.path.exists(content_path):
                with open(content_path, 'rb') as f:
                    self.models['content'] = pickle.load(f)
            
            # Performance models
            for mode in ['engagement', 'conversion', 'roi']:
                model_path = os.path.join(MODELS_DIR, f"perf_{mode}_model.pkl")
                scaler_path = os.path.join(MODELS_DIR, f"perf_{mode}_scaler.pkl")
                if os.path.exists(model_path) and os.path.exists(scaler_path):
                    self.models[f'perf_{mode}'] = {
                        'model': joblib.load(model_path),
                        'scaler': joblib.load(scaler_path)
                    }
            
            # Segmentation models
            for mode in ['behavior', 'campaign', 'engagement']:
                seg_model = 'segmentation_model.pkl' if mode == 'behavior' else f'{mode}_segmentation_model.pkl'
                seg_scaler = 'segmentation_scaler.pkl' if mode == 'behavior' else f'{mode}_segmentation_scaler.pkl'
                model_path = os.path.join(MODELS_DIR, seg_model)
                scaler_path = os.path.join(MODELS_DIR, seg_scaler)
                if os.path.exists(model_path) and os.path.exists(scaler_path):
                    self.models[f'segment_{mode}'] = {
                        'model': joblib.load(model_path),
                        'scaler': joblib.load(scaler_path)
                    }
        except Exception as e:
            print(f"Warning: Could not load some models: {e}", file=sys.stderr)
    
    def predict_performance(self, metrics, mode='roi'):
        """Predict campaign performance using ML models"""
        try:
            model_key = f'perf_{mode}'
            if model_key not in self.models:
                return None
            
            features = ['impressions', 'clicks', 'spend', 'conversions', 
                       'sessions', 'add_to_carts', 'avg_session_duration']
            
            X = pd.DataFrame([metrics])[features]
            X_scaled = self.models[model_key]['scaler'].transform(X)
            prediction = self.models[model_key]['model'].predict(X_scaled)[0]
            
            return prediction
        except Exception as e:
            print(f"Performance prediction error: {e}", file=sys.stderr)
            return None
    
    def recommend_content(self, metrics):
        """Get content recommendations based on metrics"""
        try:
            if 'content' not in self.models:
                return None
            
            features = ['avg_engagement_rate', 'avg_conversion_rate', 
                       'avg_roas', 'sample_size']
            X = pd.DataFrame([metrics])[features]
            score = self.models['content'].predict(X)[0]
            
            return score
        except Exception as e:
            print(f"Content recommendation error: {e}", file=sys.stderr)
            return None
    
    def segment_customer(self, customer_data, mode='behavior'):
        """Segment customer using ML clustering"""
        try:
            model_key = f'segment_{mode}'
            if model_key not in self.models:
                return None
            
            if mode == 'behavior':
                features = ['monthly_spend', 'avg_order_value', 'orders_per_month', 'visits_per_month']
            elif mode == 'campaign':
                features = ['monthly_spend', 'avg_order_value', 'orders_per_month']
            else:  # engagement
                features = ['age', 'visits_per_month', 'category_preference_score']
            
            X = pd.DataFrame([customer_data])[features]
            X_scaled = self.models[model_key]['scaler'].transform(X)
            segment = self.models[model_key]['model'].predict(X_scaled)[0]
            
            personas = {0: "Eco-Lux Loyalists", 1: "Aspiring Aesthetes", 2: "Eco-Gift Shoppers"}
            return personas.get(segment, f"Segment {segment}")
        except Exception as e:
            print(f"Segmentation error: {e}", file=sys.stderr)
            return None
    
    def analyze_intent(self, message):
        """Analyze user message to determine intent"""
        msg_lower = message.lower()
        
        # Performance analysis intent
        if any(word in msg_lower for word in ['performance', 'roi', 'roas', 'conversion', 'ctr', 'engagement']):
            return 'performance'
        
        # Content recommendation intent
        if any(word in msg_lower for word in ['content', 'recommend', 'suggestion', 'campaign', 'creative']):
            return 'content'
        
        # Customer segmentation intent
        if any(word in msg_lower for word in ['segment', 'customer', 'persona', 'audience', 'target']):
            return 'segmentation'
        
        # Prediction intent
        if any(word in msg_lower for word in ['predict', 'forecast', 'estimate', 'expect']):
            return 'prediction'
        
        # General help
        return 'general'
    
    def generate_response(self, message, context=None):
        """Generate intelligent response using ML models"""
        intent = self.analyze_intent(message)
        
        if intent == 'performance':
            return self._handle_performance_query(message, context)
        elif intent == 'content':
            return self._handle_content_query(message, context)
        elif intent == 'segmentation':
            return self._handle_segmentation_query(message, context)
        elif intent == 'prediction':
            return self._handle_prediction_query(message, context)
        else:
            return self._handle_general_query(message)
    
    def _handle_performance_query(self, message, context):
        """Handle performance-related queries"""
        return """📊 **Performance Reporting**

To analyze your campaign performance:

1. Navigate to the **Performance** page from the dashboard
2. Upload your campaign data (CSV file with columns: impressions, clicks, spend, conversions, sessions, add_to_carts, avg_session_duration)
3. Select your analysis mode:
   • **ROI Mode** - Analyze return on ad spend
   • **Engagement Mode** - Analyze click-through rates
   • **Conversion Mode** - Analyze conversion rates
4. Click "Analyze" to get ML-powered predictions

The system will show you top-performing campaigns and detailed metrics to optimize your marketing strategy."""
    
    def _handle_content_query(self, message, context):
        """Handle content recommendation queries"""
        return """📝 **Content Recommendation**

To get AI-powered content recommendations:

1. Go to the **Recommendation** page from the main menu
2. Upload your content performance data (CSV with: content_id, persona_key, campaign_goal, channel, format, avg_engagement_rate, avg_conversion_rate, avg_roas, sample_size)
3. Click "Get Recommendations"
4. Review the top-performing content suggestions based on:
   • Engagement rates
   • Conversion rates
   • Return on ad spend
   • Historical performance

The ML model will rank content strategies and suggest the best combinations of persona, channel, and format for your campaigns."""
    
    def _handle_segmentation_query(self, message, context):
        """Handle customer segmentation queries"""
        return """👥 **Customer Segmentation**

To segment your customers using AI:

1. Navigate to the **Segmentation** page
2. Upload your customer data (CSV with: customer_id, monthly_spend, avg_order_value, orders_per_month, visits_per_month, age, category_preference_score)
3. Choose your segmentation mode:
   • **Behavior Segmentation** - Based on spending and purchase patterns
   • **Campaign Segmentation** - Based on campaign response
   • **Engagement Segmentation** - Based on interaction levels
4. Click "Segment Customers"

The ML model will group customers into personas:
• **Eco-Lux Loyalists** - High-value sustainable shoppers
• **Aspiring Aesthetes** - Trend-conscious quality seekers
• **Eco-Gift Shoppers** - Eco-friendly gift buyers

Use these insights to create targeted marketing campaigns."""
    
    def _handle_prediction_query(self, message, context):
        """Handle prediction queries"""
        return """🔮 **ML Predictions**

To get AI predictions:

**📊 For Campaign Performance:**
→ Go to Performance page
→ Upload campaign data
→ Select prediction mode (ROI/Engagement/Conversion)

**📝 For Content Strategy:**
→ Go to Recommendation page
→ Upload content data
→ Get ranked recommendations

**👥 For Customer Personas:**
→ Go to Segmentation page
→ Upload customer data
→ Choose segmentation type

Each page has ML models trained on your data for accurate predictions!"""
    
    def _handle_general_query(self, message):
        """Handle general queries"""
        msg_lower = message.lower()
        
        if any(word in msg_lower for word in ['hello', 'hi', 'hey']):
            return """👋 Hello! I'm your iMark AI assistant. I can guide you to:

📊 **Performance Reporting** - Analyze campaign ROI and metrics
📝 **Content Recommendation** - Get AI content suggestions  
👥 **Customer Segmentation** - Segment your audience
📈 **Dashboard** - View your marketing overview

Ask me about any of these features and I'll show you how to use them!"""
        
        if any(word in msg_lower for word in ['help', 'what can you do', 'capabilities', 'features']):
            return """🎯 **iMark Platform Guide**

I can help you navigate to:

1. **📊 Performance Reporting** - Upload campaign data to get ML predictions on ROI, CTR, and conversions
2. **📝 Content Recommendation** - Get AI-powered content strategy suggestions
3. **👥 Customer Segmentation** - Segment customers into personas for targeted marketing
4. **📈 Dashboard** - View your marketing analytics overview

Just ask me about any feature (e.g., "How do I use performance reporting?" or "Show me segmentation") and I'll guide you!"""
        
        if 'thank' in msg_lower:
            return "You're welcome! Feel free to ask if you need help navigating to any page or using a feature. 😊"
        
        if any(word in msg_lower for word in ['dashboard', 'home', 'overview']):
            return """📈 **Dashboard**

Your dashboard shows:
• Recent insights and reports
• Quick access to all features
• Performance summaries

Navigate to the **Dashboard** from the main menu to see your marketing analytics overview."""
        
        if any(word in msg_lower for word in ['upload', 'file', 'data', 'csv']):
            return """📁 **Uploading Data**

For each feature, you need specific CSV files:

**Performance**: impressions, clicks, spend, conversions, sessions, add_to_carts, avg_session_duration

**Content**: content_id, persona_key, campaign_goal, channel, format, avg_engagement_rate, avg_conversion_rate, avg_roas, sample_size

**Segmentation**: customer_id, monthly_spend, avg_order_value, orders_per_month, visits_per_month, age, category_preference_score

Upload your CSV on the respective page and the AI will analyze it!"""
        
        return """🤖 **iMark AI Assistant**

I'm here to help you navigate the platform! Ask me about:

• "How to use performance reporting?"
• "Where is content recommendation?"
• "How do I segment customers?"
• "What data do I need to upload?"

I'll guide you to the right page with step-by-step instructions!"""


def main():
    """Main function for streaming responses"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No message provided"}))
        sys.exit(1)
    
    message = sys.argv[1]
    context = json.loads(sys.argv[2]) if len(sys.argv) > 2 else None
    
    chatbot = MLChatbot()
    response = chatbot.generate_response(message, context)
    
    # Stream response word by word for real-time effect
    words = response.split(' ')
    for word in words:
        print(json.dumps({"word": word}))
        sys.stdout.flush()
    
    print(json.dumps({"done": True}))


if __name__ == "__main__":
    main()
