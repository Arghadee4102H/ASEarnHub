# bot_backend.py
import os
from flask import Flask, request, jsonify
import telebot
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# --- Configuration ---
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
if not BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN environment variable not set.")

ADMIN_CHANNEL_ID_STR = os.getenv('TELEGRAM_ADMIN_CHANNEL_ID')
if not ADMIN_CHANNEL_ID_STR:
    raise ValueError("TELEGRAM_ADMIN_CHANNEL_ID environment variable not set.")

try:
    ADMIN_CHANNEL_ID = int(ADMIN_CHANNEL_ID_STR)
except ValueError:
    raise ValueError("TELEGRAM_ADMIN_CHANNEL_ID must be an integer (e.g., -1001234567890).")

bot = telebot.TeleBot(BOT_TOKEN)

# --- CORS Headers for Flask (Crucial for Web App Communication) ---
# In production, replace '*' with your GitHub Pages URL (e.g., 'https://YOUR_GITHUB_USERNAME.github.io')
CORS_ORIGIN = os.getenv('CORS_ORIGIN', '*') # Default to all for local testing

def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = CORS_ORIGIN
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.after_request
def after_request_func(response):
    return add_cors_headers(response)

@app.before_request
def before_request_func():
    if request.method == 'OPTIONS':
        return add_cors_headers(jsonify({})), 200

# --- API Endpoints ---

@app.route('/verify_membership', methods=['POST'])
def verify_membership():
    """
    Verifies if a user is a member of a given Telegram channel/group.
    Requires the bot to be an administrator of the target chat.
    """
    data = request.json
    user_id = data.get('user_id')
    channel_link = data.get('channel_link') # e.g., "https://t.me/ASearnhub"

    if not user_id or not channel_link:
        return jsonify({"error": "Missing user_id or channel_link"}), 400

    # Extract chat_id or channel username from the link
    chat_id_or_username = None
    if 't.me/' in channel_link:
        parts = channel_link.split('t.me/')
        if len(parts) > 1:
            # Assuming format like t.me/channelname or t.me/joinchat/invitecode
            potential_name = parts[1].split('/')[0]
            if potential_name.startswith('+'): # This is an invite link, usually handled by joinchat
                # For private group invite links, you often need the direct chat_id, not just the invite link
                # For simplicity, we'll try to use the public username if available.
                # A more robust solution might require manually adding bot to private chat and getting chat_id.
                pass # Fallback to public channel check
            else:
                chat_id_or_username = '@' + potential_name # Public channel/group username
    
    # If no public username could be parsed, we cannot verify directly via link
    if not chat_id_or_username:
         app.logger.warning(f"Could not parse chat_id or username from channel_link: {channel_link}")
         # For robustness, you might need to manually map channel_link to known chat_ids on your backend
         # Or, use an invite link if the bot can resolve it (less common for get_chat_member)
         return jsonify({"error": "Could not parse channel username from link, or channel is private and bot cannot resolve."}), 400


    try:
        chat_member = bot.get_chat_member(chat_id_or_username, user_id)
        is_member = chat_member.status in ['member', 'administrator', 'creator']
        return jsonify({"is_member": is_member}), 200
    except telebot.apihelper.ApiTelegramException as e:
        app.logger.error(f"Telegram API Error verifying membership for user {user_id} in {chat_id_or_username}: {e}")
        if "chat not found" in str(e).lower() or "not a member of the chat" in str(e).lower():
            return jsonify({"error": f"Channel/group '{chat_id_or_username}' not found or bot is not an admin."}), 400
        if "user not found" in str(e).lower():
             # This should ideally not happen if user_id is valid
             return jsonify({"error": "Telegram User ID is invalid."}), 400
        return jsonify({"error": f"Telegram API error: {e}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error verifying membership for user {user_id} in {chat_id_or_username}: {e}")
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

@app.route('/send_withdrawal_notification', methods=['POST'])
def send_withdrawal_notification():
    """
    Sends a formatted withdrawal notification to the admin channel and a concise message to the user.
    """
    data = request.json
    full_name = data.get('full_name', 'N/A')
    username = data.get('username', 'N/A')
    user_id = data.get('user_id', 'N/A')
    points = data.get('points', 'N/A')
    method = data.get('method', 'N/A')
    status = data.get('status', '🔴 Pending (Under Review)')
    request_time_str = data.get('request_time', datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'))
    
    user_telegram_id = data.get('user_telegram_id')
    admin_note = data.get('admin_note', '') # From admin panel update

    # Message for the Admin Channel
    admin_message = f"""