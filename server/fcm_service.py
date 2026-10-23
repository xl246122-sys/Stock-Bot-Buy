"""
Firebase Cloud Messaging (FCM) Push Service
Dispatches millisecond-grade buy/sell alerts and haptic notifications
directly to Android phones (com.lu.stockgoogle) via Google Cloud Infrastructure.
"""
import os
import json
import logging
from typing import Dict, Any, List
from config import FIREBASE_CREDENTIALS_PATH
from database import get_all_fcm_tokens

logger = logging.getLogger("FCMService")

_fcm_initialized = False

def init_firebase():
    global _fcm_initialized
    if _fcm_initialized:
        return True

    if not os.path.exists(FIREBASE_CREDENTIALS_PATH):
        logger.warning(f"Firebase credentials not found at: {FIREBASE_CREDENTIALS_PATH}")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
        firebase_admin.initialize_app(cred)
        _fcm_initialized = True
        logger.info("Firebase Admin SDK successfully initialized for Tokyo Node!")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
        return False

def send_push_alert(
    symbol: str,
    strategy: str,
    title: str,
    body: str,
    extra_data: Dict[str, str] = None
) -> int:
    """
    Broadcast high-priority FCM notification to all registered Android devices
    """
    if not init_firebase():
        return 0

    tokens = get_all_fcm_tokens()
    if not tokens:
        logger.info("No registered Android device tokens to push to.")
        return 0

    from firebase_admin import messaging

    data_payload = {
        "symbol": symbol,
        "strategy": strategy,
        "haptic": "bottom_fishing" if "PLUNGE" in strategy else "breakout",
        **(extra_data or {})
    }

    success_count = 0
    for token in tokens:
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                data=data_payload,
                token=token,
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        channel_id="stock_g_trading_alerts_channel",
                        priority="max",
                        sound="default",
                        click_action=None
                    )
                )
            )
            response = messaging.send(message)
            success_count += 1
            logger.info(f"FCM alert sent to device: {response}")
        except Exception as e:
            logger.warning(f"Error sending FCM message to token {token[:10]}...: {e}")

    return success_count
