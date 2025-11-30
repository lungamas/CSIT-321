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
        if context and 'metrics' in context:
            metrics = context['metrics']
            roi_pred = self.predict_performance(metrics, 'roi')
            conv_pred = self.predict_performance(metrics, 'conversion')
            eng_pred = self.predict_performance(metrics, 'engagement')
            
            response = "Based on your campaign metrics, here's what our ML model predicts:\n\n"
            if roi_pred is not None:
                response += f"• Predicted ROAS: {roi_pred:.2f}x\n"
            if conv_pred is not None:
                response += f"• Predicted Conversion Rate: {conv_pred*100:.2f}%\n"
            if eng_pred is not None:
                response += f"• Predicted CTR: {eng_pred*100:.2f}%\n"
            
            response += "\nThese predictions are based on your historical campaign data and ML analysis."
            return response
        
        return "I can analyze your campaign performance using machine learning! Please provide metrics like impressions, clicks, spend, and conversions, and I'll predict your ROI, conversion rate, and engagement."
    
    def _handle_content_query(self, message, context):
        """Handle content recommendation queries"""
        if context and 'content_metrics' in context:
            score = self.recommend_content(context['content_metrics'])
            if score is not None:
                return f"Our ML model scored this content strategy at {score:.2f}/10. This indicates {'excellent' if score > 7 else 'good' if score > 5 else 'moderate'} performance potential based on historical data."
        
        return "I can recommend content strategies using ML! Our models analyze engagement rates, conversion rates, ROAS, and sample sizes to suggest the best performing content types for your campaigns."
    
    def _handle_segmentation_query(self, message, context):
        """Handle customer segmentation queries"""
        if context and 'customer' in context:
            segment = self.segment_customer(context['customer'], 'behavior')
            if segment:
                personas = {
                    "Eco-Lux Loyalists": "high-value customers who prioritize premium, sustainable products",
                    "Aspiring Aesthetes": "trend-conscious buyers seeking aesthetic appeal and quality",
                    "Eco-Gift Shoppers": "occasional buyers focused on eco-friendly gift purchases"
                }
                description = personas.get(segment, "a unique customer group")
                return f"Our ML model classifies this customer as: **{segment}** - {description}. This segmentation helps tailor marketing strategies for better engagement."
        
        return "I can segment your customers using machine learning! Provide customer data like spending patterns, order frequency, and engagement metrics, and I'll identify which persona group they belong to for targeted marketing."
    
    def _handle_prediction_query(self, message, context):
        """Handle prediction queries"""
        return "Our AI can predict:\n• Campaign ROI and ROAS\n• Conversion rates and CTR\n• Customer lifetime value\n• Content performance scores\n\nProvide your metrics and I'll run them through our ML models for accurate predictions!"
    
    def _handle_general_query(self, message):
        """Handle general queries"""
        msg_lower = message.lower()
        
        if any(word in msg_lower for word in ['hello', 'hi', 'hey']):
            return "Hello! I'm your AI marketing assistant powered by machine learning. I can help you with:\n• Campaign performance predictions\n• Content recommendations\n• Customer segmentation\n• ROI forecasting\n\nWhat would you like to analyze today?"
        
        if any(word in msg_lower for word in ['help', 'what can you do', 'capabilities']):
            return "I use trained ML models to help with:\n\n1. **Performance Analysis** - Predict ROI, conversions, and engagement\n2. **Content Recommendations** - Suggest best-performing content strategies\n3. **Customer Segmentation** - Identify customer personas for targeting\n4. **Predictive Analytics** - Forecast campaign outcomes\n\nAsk me anything about your marketing data!"
        
        if 'thank' in msg_lower:
            return "You're welcome! Let me know if you need more ML-powered insights for your campaigns."
        
        return f"I'm an AI assistant trained on your marketing data. I can analyze campaigns, predict performance, recommend content, and segment customers using machine learning. How can I help you optimize your marketing?"


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
