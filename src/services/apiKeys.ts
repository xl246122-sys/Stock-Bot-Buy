/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Stock-G API Configuration & Network Endpoints
 * Credentials are read dynamically from environment variables (VITE_*)
 * with server BFF fallback, preventing plain-text bundle leakage.
 */

// Safe accessor for Vite environment variables
const getEnv = (key: string, fallback: string = ''): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key] as string;
    }
  } catch {
    // Ignore in non-vite contexts
  }
  return fallback;
};

export const API_CONFIG = {
  // 1. Finnhub Financial API
  FINNHUB: {
    API_KEY: getEnv('VITE_FINNHUB_API_KEY', ''),
    BASE_URL: 'https://finnhub.io/api/v1',
    WS_URL: 'wss://ws.finnhub.io',
  },

  // 2. Massive / Polygon API
  MASSIVE: {
    API_KEY: getEnv('VITE_MASSIVE_API_KEY', ''),
    BASE_URL: 'https://api.polygon.io/v2',
  },

  // 3. Alpha Vantage API
  ALPHA_VANTAGE: {
    API_KEY: getEnv('VITE_ALPHA_VANTAGE_API_KEY', ''),
    BASE_URL: 'https://www.alphavantage.co/query',
  },

  // 4. Binance Public Data API (No private keys needed, completely safe public endpoint)
  BINANCE: {
    BASE_URL: 'https://api.binance.com/api/v3',
    VISION_URL: 'https://data-api.binance.vision/api/v3',
    FUTURES_URL: 'https://fapi.binance.com/fapi/v1',
  },

  // 5. DeepSeek AI Brain API (DeepSeek V3 Flash 核心模型)
  DEEPSEEK: {
    API_KEY: '',
    BASE_URL: 'https://api.deepseek.com',
    MODEL: getEnv('VITE_DEEPSEEK_MODEL', 'deepseek-chat'),
  },

  // Cloud & Deployment Metadata
  DEPLOYMENT: {
    SERVER_URL: getEnv('VITE_PUBLIC_SERVER_URL', 'http://43.163.192.120:8000'),
    SERVER_IP: '43.163.192.120',
    LOCATION: 'Tencent Cloud Tokyo, Japan (Ubuntu 24.04/26.04 LTS)',
    SPECS: '2 vCPU / 2GB RAM / 50GB SSD / 30Mbps Bandwidth',
    FIREBASE_PROJECT_ID: 'shot-stock',
    FIREBASE_PROJECT_NUMBER: '526583570003',
  }
};
