"""
Stock-G Backend Server Configuration
Tencent Cloud Tokyo Node (43.163.192.120)
"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_DIR = os.path.join(BASE_DIR, "credentials")
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

from dotenv import load_dotenv

# Load root .env file if present
ROOT_DIR = os.path.dirname(BASE_DIR)
root_env = os.path.join(ROOT_DIR, ".env")
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv()

# Server Networking
HOST = "0.0.0.0"
PORT = 8000
SERVER_NAME = "Stock-G Tokyo Quant Node"
VERSION = "1.04"

# Database
DB_PATH = os.path.join(DATA_DIR, "stock_g.db")

# API Keys & Endpoints (Read safely from environment)
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"

BINANCE_BASE_URL = "https://api.binance.com/api/v3"
BINANCE_VISION_URL = "https://data-api.binance.vision/api/v3"

# Firebase Cloud Messaging Credentials
FIREBASE_CREDENTIALS_PATH = os.path.join(CREDENTIALS_DIR, "firebase-service-account.json")

# Default Monitored Universe
WATCHLIST_STOCKS = [
    # Top AI & Tech Leaders
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "sector": "Semiconductors", "exchange": "NASDAQ"},
    {"symbol": "TSLA", "name": "Tesla Inc", "sector": "Consumer Discretionary", "exchange": "NASDAQ"},
    {"symbol": "AAPL", "name": "Apple Inc", "sector": "Technology", "exchange": "NASDAQ"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "sector": "Technology", "exchange": "NASDAQ"},
    {"symbol": "AMZN", "name": "Amazon.com Inc", "sector": "Consumer Discretionary", "exchange": "NASDAQ"},
    {"symbol": "GOOGL", "name": "Alphabet Inc", "sector": "Communication", "exchange": "NASDAQ"},
    {"symbol": "META", "name": "Meta Platforms Inc", "sector": "Communication", "exchange": "NASDAQ"},
    {"symbol": "AMD", "name": "Advanced Micro Devices", "sector": "Semiconductors", "exchange": "NASDAQ"},
    {"symbol": "SMCI", "name": "Super Micro Computer", "sector": "Technology", "exchange": "NASDAQ"},
    {"symbol": "PLTR", "name": "Palantir Technologies", "sector": "Technology", "exchange": "NYSE"},
    {"symbol": "INTC", "name": "Intel Corporation", "sector": "Semiconductors", "exchange": "NASDAQ"},
    {"symbol": "AVGO", "name": "Broadcom Inc", "sector": "Semiconductors", "exchange": "NASDAQ"},
    {"symbol": "QCOM", "name": "Qualcomm Inc", "sector": "Semiconductors", "exchange": "NASDAQ"},
    {"symbol": "ARM", "name": "Arm Holdings", "sector": "Semiconductors", "exchange": "NASDAQ"},
    {"symbol": "TSM", "name": "Taiwan Semiconductor", "sector": "Semiconductors", "exchange": "NYSE"},
    # Crypto Pairs (Binance Spot)
    {"symbol": "BTCUSDT", "name": "Bitcoin / USDT", "sector": "Crypto", "exchange": "BINANCE"},
    {"symbol": "ETHUSDT", "name": "Ethereum / USDT", "sector": "Crypto", "exchange": "BINANCE"},
    {"symbol": "SOLUSDT", "name": "Solana / USDT", "sector": "Crypto", "exchange": "BINANCE"},
]
