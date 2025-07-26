import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import requests
import json
import os
import tempfile  # New: For safe temporary file handling
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Set your Groq API key here
GROQ_API_KEY = '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'
GROQ_MODEL = "llama3-8b-8192"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Load pre-trained CLIP model
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# List of common Indian street food labels
INDIAN_STREET_FOODS = [
    "vada pav", "pani puri", "samosa", "pav bhaji", "dosa", "idli", "chole bhature",
    "aloo tikki", "bhel puri", "jalebi", "kachori", "momos", "sev puri", "dabeli",
    "misal pav", "pakora", "chaat", "kulfi", "falooda", "ragda pattice"
]

def classify_image(image):
    text_prompts = [f"a photo of {food}, an Indian street food" for food in INDIAN_STREET_FOODS]
    inputs = processor(text=text_prompts, images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
    logits_per_image = outputs.logits_per_image
    probs = logits_per_image.softmax(dim=1)
    top_prob, top_idx = probs[0].max(), probs[0].argmax()
    if top_prob.item() < 0.5:
        return "unknown"
    predicted_label = INDIAN_STREET_FOODS[top_idx.item()].lower().replace(" ", "_")
    return predicted_label

def get_details_from_llm(food_name, vendor_context="", user_location=None, current_language="en"):
    # (Unchanged from previous version - your original code)
    if GROQ_API_KEY == "your-groq-api-key-here":
        raise ValueError("Groq API key not configured. Please set GROQ_API_KEY.")

    context = vendor_context or "Vendor data is being loaded."
    if user_location:
        context += f"\nUser is located at: {user_location.get('lat', 'unknown')}, {user_location.get('lng', 'unknown')}"

    system_content = f"""
    You are a helpful AI assistant for "Street Foods of Bharat", a platform for discovering authentic Indian street food. Help users find vendors, learn about dishes, get recommendations, and explore Indian street food culture. 

    Context about available vendors and data:
    {context}

    Current language: {current_language}

    Guidelines:
    - Keep responses concise and friendly
    - Focus on Indian street food and cuisine
    - Provide specific vendor recommendations when possible
    - Consider user's location if available for distance-based recommendations
    - Share interesting facts about Indian street food
    - Help with food preferences and dietary requirements
    - Be enthusiastic about Indian food culture
    - Respond in the user's preferred language when possible
    """

    if food_name == "unknown":
        user_prompt = "The food in the image could not be classified. Provide general advice on identifying Indian street foods."
    else:
        user_prompt = f"""
        The food item is '{food_name}', which is an Indian street food. Provide every possible detail about it, including:
        - Description and typical preparation.
        - Estimated calories per typical serving (e.g., one plate or piece).
        - Nutritional breakdown (e.g., carbs, proteins, fats).
        - Key ingredients.
        - History or origin in India.
        - Famous spots or places in India where you can have it (e.g., specific streets, cities, or vendors like Mumbai's Chowpatty or Delhi's Chandni Chowk).
        - Preparation tips or simple recipe.
        - Any fun facts, variations, or health tips.
        Be detailed, accurate, and engaging! Focus on Indian street food context.
        """

    request_body = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 1000,
        "temperature": 0.7,
        "top_p": 1,
        "stop": None
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}"
    }

    response = requests.post(GROQ_URL, headers=headers, data=json.dumps(request_body))

    if not response.ok:
        error_text = response.text
        if response.status_code == 401:
            raise ValueError("Invalid API key. Please check your Groq API key configuration.")
        elif response.status_code == 429:
            raise ValueError("Too many requests. Please wait a moment and try again.")
        else:
            raise ValueError(f"Groq API error: HTTP {response.status_code}: {error_text}")

    data = response.json()
    if not data.get("choices") or not data["choices"][0].get("message"):
        raise ValueError("Invalid response format from Groq API")

    return data["choices"][0]["message"]["content"].strip()

@app.route('/analyze-image', methods=['POST'])
def analyze_image_endpoint():
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # New: Use tempfile for safe, writable temporary file handling
    try:
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            file.save(temp_file.name)  # Save to temp file path
            temp_path = temp_file.name
        
        # Validate and open image
        image = Image.open(temp_path)
        image.verify()  # Check if it's a valid image
        image = Image.open(temp_path)  # Re-open for processing
        
        food_name = classify_image(image)
        
        # Optional params from request
        vendor_context = request.form.get('vendor_context', "")
        user_location = request.form.get('user_location', None)
        if user_location:
            user_location = json.loads(user_location)
        current_language = request.form.get('language', "en")
        
        details = get_details_from_llm(food_name, vendor_context, user_location, current_language)
        output = f"Classified Indian Street Food: {food_name.replace('_', ' ').capitalize()}\n\nDetails:\n{details}"
        
        return jsonify({"results": output})
    except (IOError, SyntaxError) as e:
        app.logger.error(f"Invalid image: {str(e)}")  # Log for debugging
        return jsonify({"error": "Invalid or corrupted image file"}), 400
    except Exception as e:
        app.logger.error(f"Processing error: {str(e)}")  # Log for debugging
        return jsonify({"error": str(e)}), 500
    finally:
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)  # Clean up

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))  # Use Heroku's PORT or default to 5000 locally
    app.run(host='0.0.0.0', port=port, debug=True) 