/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Premier Universe of S&P 500, NASDAQ and High-Liquid Equities / Crypto
 * Directly mapped to Binance Spot / bStocks pairs for 100% authoritative pricing & Wilder RSI.
 */

export interface UniverseStock {
  symbol: string;
  name: string;
  marketCap: number; // in $ Billion
  sector: string;
  exchange: 'NASDAQ' | 'NYSE' | 'BINANCE';
  basePrice: number;
  avgVolumeMillion: number;
  binanceSymbol?: string; // 币安实盘现货/bStocks对应交易对代码
}

export const STOCK_UNIVERSE: UniverseStock[] = [
  // 1. 币安核心加密资产市场直连 (Crypto Spot)
  { symbol: 'BTCUSDT', name: 'Bitcoin (Binance Spot)', marketCap: 1350.0, sector: 'Crypto / Digital Assets', exchange: 'BINANCE', basePrice: 83500.0, avgVolumeMillion: 420.0, binanceSymbol: 'BTCUSDT' },
  { symbol: 'ETHUSDT', name: 'Ethereum (Binance Spot)', marketCap: 320.0, sector: 'Crypto / Digital Assets', exchange: 'BINANCE', basePrice: 2510.0, avgVolumeMillion: 280.0, binanceSymbol: 'ETHUSDT' },
  { symbol: 'SOLUSDT', name: 'Solana (Binance Spot)', marketCap: 75.0, sector: 'Crypto / Digital Assets', exchange: 'BINANCE', basePrice: 108.0, avgVolumeMillion: 160.0, binanceSymbol: 'SOLUSDT' },

  // 2. 超威半导体与核心AI芯片芯片霸主 (Semiconductors - 直接对齐币安 bStocks)
  { symbol: 'AMD', name: 'Advanced Micro Devices (超威半导体)', marketCap: 250.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 613.10, avgVolumeMillion: 42.1, binanceSymbol: 'AMDBUSDT' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation (英伟达)', marketCap: 3150.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 229.80, avgVolumeMillion: 55.4, binanceSymbol: 'NVDABUSDT' },
  { symbol: 'TSLA', name: 'Tesla Inc. (特斯拉)', marketCap: 790.0, sector: 'Automotive / EV', exchange: 'NASDAQ', basePrice: 377.10, avgVolumeMillion: 68.3, binanceSymbol: 'TSLABUSDT' },
  { symbol: 'INTC', name: 'Intel Corporation (英特尔)', marketCap: 98.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 103.80, avgVolumeMillion: 58.6, binanceSymbol: 'INTCBUSDT' },
  { symbol: 'AVGO', name: 'Broadcom Inc. (博通)', marketCap: 810.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 359.00, avgVolumeMillion: 18.7, binanceSymbol: 'AVGOBUSDT' },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated (高通)', marketCap: 185.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 177.90, avgVolumeMillion: 12.2, binanceSymbol: 'QCOMBUSDT' },
  { symbol: 'ARM', name: 'Arm Holdings plc (安谋)', marketCap: 142.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 259.90, avgVolumeMillion: 16.8, binanceSymbol: 'ARMBUSDT' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor (台积电)', marketCap: 880.0, sector: 'Semiconductors', exchange: 'NYSE', basePrice: 448.00, avgVolumeMillion: 19.5, binanceSymbol: 'TSMBUSDT' },
  { symbol: 'ASML', name: 'ASML Holding N.V. (阿斯麦)', marketCap: 310.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 1717.00, avgVolumeMillion: 4.2, binanceSymbol: 'ASMLBUSDT' },
  { symbol: 'MU', name: 'Micron Technology Inc. (美光科技)', marketCap: 118.0, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 958.00, avgVolumeMillion: 21.4, binanceSymbol: 'MUBUSDT' },
  { symbol: 'SMCI', name: 'Super Micro Computer (超微电脑)', marketCap: 35.0, sector: 'Technology / Hardware', exchange: 'NASDAQ', basePrice: 39.50, avgVolumeMillion: 28.0, binanceSymbol: 'SMCIBUSDT' },

  // 3. 巨头科技与高贝塔AI领军 (Mega-Cap & AI Beta)
  { symbol: 'AAPL', name: 'Apple Inc. (苹果)', marketCap: 3420.0, sector: 'Technology', exchange: 'NASDAQ', basePrice: 341.80, avgVolumeMillion: 48.2, binanceSymbol: 'AAPLBUSDT' },
  { symbol: 'MSFT', name: 'Microsoft Corporation (微软)', marketCap: 3080.0, sector: 'Technology', exchange: 'NASDAQ', basePrice: 544.10, avgVolumeMillion: 22.8, binanceSymbol: 'MSFTBUSDT' },
  { symbol: 'AMZN', name: 'Amazon.com Inc. (亚马逊)', marketCap: 1980.0, sector: 'Consumer Discretionary', exchange: 'NASDAQ', basePrice: 259.50, avgVolumeMillion: 35.1, binanceSymbol: 'AMZNBUSDT' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (谷歌)', marketCap: 2040.0, sector: 'Communication Services', exchange: 'NASDAQ', basePrice: 356.70, avgVolumeMillion: 24.3, binanceSymbol: 'GOOGLBUSDT' },
  { symbol: 'META', name: 'Meta Platforms Inc. (脸书)', marketCap: 1480.0, sector: 'Communication Services', exchange: 'NASDAQ', basePrice: 767.50, avgVolumeMillion: 14.5, binanceSymbol: 'METABUSDT' },
  { symbol: 'PLTR', name: 'Palantir Technologies (大数据AI)', marketCap: 95.0, sector: 'Software & AI', exchange: 'NYSE', basePrice: 209.10, avgVolumeMillion: 45.2, binanceSymbol: 'PLTRBUSDT' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings (网络安全)', marketCap: 74.0, sector: 'Cybersecurity', exchange: 'NASDAQ', basePrice: 259.70, avgVolumeMillion: 6.8, binanceSymbol: 'CRWDBUSDT' },
  { symbol: 'CRM', name: 'Salesforce Inc. (赛富时)', marketCap: 275.0, sector: 'Software', exchange: 'NYSE', basePrice: 238.00, avgVolumeMillion: 8.9, binanceSymbol: 'CRMBUSDT' },
  { symbol: 'ADBE', name: 'Adobe Inc. (奥多比)', marketCap: 220.0, sector: 'Software', exchange: 'NASDAQ', basePrice: 236.60, avgVolumeMillion: 5.1, binanceSymbol: 'ADBEBUSDT' },
  { symbol: 'SNOW', name: 'Snowflake Inc. (雪花计算)', marketCap: 41.0, sector: 'Cloud Software', exchange: 'NYSE', basePrice: 11.84, avgVolumeMillion: 9.2, binanceSymbol: 'SNXXBUSDT' },
  { symbol: 'DELL', name: 'Dell Technologies Inc. (戴尔科技)', marketCap: 88.0, sector: 'Technology / Hardware', exchange: 'NYSE', basePrice: 575.50, avgVolumeMillion: 12.0, binanceSymbol: 'DELLBUSDT' },

  // 4. 数字金融、高波动资产与热门大盘
  { symbol: 'COIN', name: 'Coinbase Global Inc.', marketCap: 52.0, sector: 'FinTech / Crypto', exchange: 'NASDAQ', basePrice: 182.90, avgVolumeMillion: 14.8, binanceSymbol: 'COINBUSDT' },
  { symbol: 'MSTR', name: 'MicroStrategy Inc. (微策略)', marketCap: 44.0, sector: 'FinTech / Tech', exchange: 'NASDAQ', basePrice: 154.30, avgVolumeMillion: 22.4, binanceSymbol: 'MSTRBUSDT' },
  { symbol: 'HOOD', name: 'Robinhood Markets Inc.', marketCap: 28.0, sector: 'FinTech / Brokerage', exchange: 'NASDAQ', basePrice: 111.40, avgVolumeMillion: 18.0, binanceSymbol: 'HOODBUSDT' },
  { symbol: 'RDDT', name: 'Reddit Inc.', marketCap: 30.0, sector: 'Communication Services', exchange: 'NYSE', basePrice: 156.20, avgVolumeMillion: 15.0, binanceSymbol: 'RDDTBUSDT' },
  { symbol: 'NFLX', name: 'Netflix Inc. (奈飞)', marketCap: 305.0, sector: 'Media / Streaming', exchange: 'NASDAQ', basePrice: 70.40, avgVolumeMillion: 5.6, binanceSymbol: 'NFLXBUSDT' },
  { symbol: 'BABA', name: 'Alibaba Group (阿里巴巴)', marketCap: 220.0, sector: 'Consumer Discretionary', exchange: 'NYSE', basePrice: 113.00, avgVolumeMillion: 18.0, binanceSymbol: 'BABABUSDT' },

  // 5. 宏观与基准金融/医药/能源
  { symbol: 'JPM', name: 'JPMorgan Chase & Co. (摩根大通)', marketCap: 630.0, sector: 'Financial Services', exchange: 'NYSE', basePrice: 332.00, avgVolumeMillion: 10.4, binanceSymbol: 'JPMBUSDT' },
  { symbol: 'GS', name: 'Goldman Sachs Group (高盛)', marketCap: 172.0, sector: 'Financial Services', exchange: 'NYSE', basePrice: 895.40, avgVolumeMillion: 3.5, binanceSymbol: 'GSBUSDT' },
  { symbol: 'LLY', name: 'Eli Lilly and Company (礼来)', marketCap: 860.0, sector: 'Pharmaceuticals', exchange: 'NYSE', basePrice: 1168.70, avgVolumeMillion: 4.1, binanceSymbol: 'LLYBUSDT' },
  { symbol: 'XOM', name: 'Exxon Mobil Corp. (埃克森美孚)', marketCap: 480.0, sector: 'Energy', exchange: 'NYSE', basePrice: 122.40, avgVolumeMillion: 16.5, binanceSymbol: 'XOMBUSDT' },
  { symbol: 'CVX', name: 'Chevron Corporation (雪佛龙)', marketCap: 285.0, sector: 'Energy', exchange: 'NYSE', basePrice: 154.80, avgVolumeMillion: 11.2, binanceSymbol: 'CVXBUSDT' },

  // 6. 核心ETF基准 (与大盘与行业ETF对齐，与币安实盘股价完全一致)
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust (标普500基准)', marketCap: 520.0, sector: 'Macro Index ETF', exchange: 'NYSE', basePrice: 586.20, avgVolumeMillion: 55.0, binanceSymbol: 'SPYBUSDT' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (纳斯达克100基准)', marketCap: 290.0, sector: 'Macro Index ETF', exchange: 'NASDAQ', basePrice: 492.80, avgVolumeMillion: 48.0, binanceSymbol: 'QQQBUSDT' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF (半导体行业基准)', marketCap: 25.0, sector: 'Semiconductors ETF', exchange: 'NASDAQ', basePrice: 546.42, avgVolumeMillion: 12.0, binanceSymbol: 'SMHBUSDT' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR (科技软件ETF)', marketCap: 78.0, sector: 'Technology', exchange: 'NYSE', basePrice: 185.49, avgVolumeMillion: 10.5, binanceSymbol: 'XLKBUSDT' },
  { symbol: 'XLC', name: 'Communication Services SPDR (通信服务ETF)', marketCap: 22.0, sector: 'Communication Services', exchange: 'NYSE', basePrice: 110.14, avgVolumeMillion: 6.8, binanceSymbol: 'XLCBUSDT' },
  { symbol: 'XLY', name: 'Consumer Discretionary SPDR (可选消费ETF)', marketCap: 24.0, sector: 'Consumer Discretionary', exchange: 'NYSE', basePrice: 114.45, avgVolumeMillion: 7.2, binanceSymbol: 'XLYBUSDT' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR (金融服务ETF)', marketCap: 45.0, sector: 'Financial Services', exchange: 'NYSE', basePrice: 55.07, avgVolumeMillion: 35.0, binanceSymbol: 'XLFBUSDT' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR (医疗健康ETF)', marketCap: 42.0, sector: 'Healthcare', exchange: 'NYSE', basePrice: 175.66, avgVolumeMillion: 8.5, binanceSymbol: 'XLVBUSDT' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR (工业制造ETF)', marketCap: 20.0, sector: 'Industrial', exchange: 'NYSE', basePrice: 166.71, avgVolumeMillion: 11.0, binanceSymbol: 'XLIBUSDT' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR (能源油气ETF)', marketCap: 38.0, sector: 'Energy', exchange: 'NYSE', basePrice: 67.81, avgVolumeMillion: 18.0, binanceSymbol: 'XLEBUSDT' },
  { symbol: 'IBIT', name: 'iShares Bitcoin Trust (比特币现货ETF)', marketCap: 32.0, sector: 'Digital Assets', exchange: 'NASDAQ', basePrice: 48.60, avgVolumeMillion: 25.0, binanceSymbol: 'IBITBUSDT' },

  // 7. 股价10美元以下与市值低于5B高波动美股 (<$10 & Small-Cap Equities)
  { symbol: 'SOFI', name: 'SoFi Technologies Inc. (数字金融科技)', marketCap: 9.8, sector: 'Financial Services', exchange: 'NASDAQ', basePrice: 9.85, avgVolumeMillion: 48.0, binanceSymbol: 'SOFIBUSDT' },
  { symbol: 'NIO', name: 'NIO Inc. (蔚来汽车)', marketCap: 10.2, sector: 'Automotive / EV', exchange: 'NYSE', basePrice: 5.25, avgVolumeMillion: 52.0, binanceSymbol: 'NIOBUSDT' },
  { symbol: 'PLUG', name: 'Plug Power Inc. (氢能源龙头)', marketCap: 2.35, sector: 'Clean Energy', exchange: 'NASDAQ', basePrice: 2.85, avgVolumeMillion: 38.5, binanceSymbol: 'PLUGBUSDT' },
  { symbol: 'LCID', name: 'Lucid Group Inc. (电动豪华轿车)', marketCap: 6.8, sector: 'Automotive / EV', exchange: 'NASDAQ', basePrice: 3.15, avgVolumeMillion: 35.0, binanceSymbol: 'LCIDBUSDT' },
  { symbol: 'RIVN', name: 'Rivian Automotive Inc. (电动皮卡)', marketCap: 9.7, sector: 'Automotive / EV', exchange: 'NASDAQ', basePrice: 9.90, avgVolumeMillion: 28.0, binanceSymbol: 'RIVNBUSDT' },
  { symbol: 'RIOT', name: 'Riot Platforms Inc. (比特币矿业计算)', marketCap: 2.65, sector: 'FinTech / Crypto', exchange: 'NASDAQ', basePrice: 8.95, avgVolumeMillion: 22.0, binanceSymbol: 'RIOTBUSDT' },
  { symbol: 'SOUN', name: 'SoundHound AI Inc. (语音AI独角兽)', marketCap: 2.15, sector: 'Software & AI', exchange: 'NASDAQ', basePrice: 6.25, avgVolumeMillion: 31.0, binanceSymbol: 'SOUNBUSDT' },
  { symbol: 'BBAI', name: 'BigBear.ai Holdings (国防数据AI)', marketCap: 0.52, sector: 'Software & AI', exchange: 'NYSE', basePrice: 2.15, avgVolumeMillion: 19.5, binanceSymbol: 'BBAIBUSDT' },
  { symbol: 'CLOV', name: 'Clover Health Investments (智能医疗)', marketCap: 1.68, sector: 'Healthcare', exchange: 'NASDAQ', basePrice: 3.42, avgVolumeMillion: 14.0, binanceSymbol: 'CLOVBUSDT' },
  { symbol: 'OPEN', name: 'Opendoor Technologies (智能房产平台)', marketCap: 1.45, sector: 'Real Estate', exchange: 'NASDAQ', basePrice: 2.10, avgVolumeMillion: 16.5, binanceSymbol: 'OPENBUSDT' },
  { symbol: 'CHPT', name: 'ChargePoint Holdings (充电桩网络)', marketCap: 0.78, sector: 'Industrial', exchange: 'NYSE', basePrice: 1.62, avgVolumeMillion: 18.0, binanceSymbol: 'CHPTBUSDT' },
  { symbol: 'JOBY', name: 'Joby Aviation Inc. (电动飞行汽车eVTOL)', marketCap: 4.80, sector: 'Aerospace & Defense', exchange: 'NYSE', basePrice: 6.50, avgVolumeMillion: 11.0, binanceSymbol: 'JOBYBUSDT' },
  { symbol: 'ACHR', name: 'Archer Aviation Inc. (低空飞行eVTOL)', marketCap: 1.35, sector: 'Aerospace & Defense', exchange: 'NYSE', basePrice: 4.25, avgVolumeMillion: 12.5, binanceSymbol: 'ACHRBUSDT' },
  { symbol: 'RUN', name: 'Sunrun Inc. (屋顶光伏储能)', marketCap: 2.10, sector: 'Clean Energy', exchange: 'NASDAQ', basePrice: 9.40, avgVolumeMillion: 15.0, binanceSymbol: 'RUNBUSDT' },
  { symbol: 'MARA', name: 'MARA Holdings Inc. (马拉松数字资产)', marketCap: 5.20, sector: 'FinTech / Crypto', exchange: 'NASDAQ', basePrice: 18.20, avgVolumeMillion: 32.0, binanceSymbol: 'MARABUSDT' },
  { symbol: 'F', name: 'Ford Motor Company (福特汽车)', marketCap: 41.5, sector: 'Automotive / EV', exchange: 'NYSE', basePrice: 10.45, avgVolumeMillion: 42.0, binanceSymbol: 'FBUSDT' },
];

/**
 * 标普500、纳斯达克与全美股快速搜索索引库 (支持代码/中英文搜索快速添加)
 */
export interface SearchableStockItem {
  symbol: string;
  name: string;
  chineseName: string;
  marketCap: number;
  sector: string;
  exchange: 'NASDAQ' | 'NYSE';
  basePrice: number;
}

export const SEARCHABLE_US_STOCKS: SearchableStockItem[] = [
  // 核心蓝筹与高科技
  { symbol: 'AAPL', name: 'Apple Inc.', chineseName: '苹果', marketCap: 3420, sector: 'Technology', exchange: 'NASDAQ', basePrice: 232.50 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', chineseName: '微软', marketCap: 3080, sector: 'Technology', exchange: 'NASDAQ', basePrice: 428.10 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', chineseName: '英伟达', marketCap: 3150, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 138.80 },
  { symbol: 'TSLA', name: 'Tesla Inc.', chineseName: '特斯拉', marketCap: 790, sector: 'Automotive / EV', exchange: 'NASDAQ', basePrice: 220.40 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', chineseName: '亚马逊', marketCap: 1980, sector: 'Consumer Discretionary', exchange: 'NASDAQ', basePrice: 186.50 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', chineseName: '谷歌', marketCap: 2040, sector: 'Communication Services', exchange: 'NASDAQ', basePrice: 165.20 },
  { symbol: 'META', name: 'Meta Platforms Inc.', chineseName: '脸书', marketCap: 1480, sector: 'Communication Services', exchange: 'NASDAQ', basePrice: 585.30 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', chineseName: '超威半导体', marketCap: 250, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 156.40 },
  { symbol: 'INTC', name: 'Intel Corporation', chineseName: '英特尔', marketCap: 98, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 23.40 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', chineseName: '博通', marketCap: 810, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 178.50 },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', chineseName: '高通', marketCap: 185, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 168.20 },
  { symbol: 'ARM', name: 'Arm Holdings plc', chineseName: '安谋芯片', marketCap: 142, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 145.00 },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', chineseName: '台积电', marketCap: 880, sector: 'Semiconductors', exchange: 'NYSE', basePrice: 192.50 },
  { symbol: 'MU', name: 'Micron Technology Inc.', chineseName: '美光科技', marketCap: 118, sector: 'Semiconductors', exchange: 'NASDAQ', basePrice: 108.60 },
  { symbol: 'SMCI', name: 'Super Micro Computer', chineseName: '超微电脑', marketCap: 35, sector: 'Technology / Hardware', exchange: 'NASDAQ', basePrice: 48.20 },
  { symbol: 'PLTR', name: 'Palantir Technologies', chineseName: '帕兰提尔AI', marketCap: 95, sector: 'Software & AI', exchange: 'NYSE', basePrice: 42.50 },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings', chineseName: '网安巨头', marketCap: 74, sector: 'Cybersecurity', exchange: 'NASDAQ', basePrice: 312.00 },
  { symbol: 'CRM', name: 'Salesforce Inc.', chineseName: '赛富时', marketCap: 275, sector: 'Software', exchange: 'NYSE', basePrice: 288.40 },
  { symbol: 'ADBE', name: 'Adobe Inc.', chineseName: '奥多比', marketCap: 220, sector: 'Software', exchange: 'NASDAQ', basePrice: 495.00 },
  { symbol: 'DELL', name: 'Dell Technologies', chineseName: '戴尔科技', marketCap: 88, sector: 'Technology / Hardware', exchange: 'NYSE', basePrice: 122.50 },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', chineseName: '硬币基地', marketCap: 52, sector: 'FinTech / Crypto', exchange: 'NASDAQ', basePrice: 215.00 },
  { symbol: 'MSTR', name: 'MicroStrategy Inc.', chineseName: '微策略', marketCap: 44, sector: 'FinTech / Tech', exchange: 'NASDAQ', basePrice: 198.50 },
  { symbol: 'HOOD', name: 'Robinhood Markets', chineseName: '罗宾汉券商', marketCap: 28, sector: 'FinTech / Brokerage', exchange: 'NASDAQ', basePrice: 26.80 },
  { symbol: 'RDDT', name: 'Reddit Inc.', chineseName: '红迪论坛', marketCap: 30, sector: 'Communication Services', exchange: 'NYSE', basePrice: 78.40 },
  { symbol: 'NFLX', name: 'Netflix Inc.', chineseName: '奈飞', marketCap: 305, sector: 'Media / Streaming', exchange: 'NASDAQ', basePrice: 705.00 },
  { symbol: 'BABA', name: 'Alibaba Group', chineseName: '阿里巴巴', marketCap: 220, sector: 'Consumer Discretionary', exchange: 'NYSE', basePrice: 101.50 },
  { symbol: 'JPM', name: 'JPMorgan Chase', chineseName: '摩根大通', marketCap: 630, sector: 'Financial Services', exchange: 'NYSE', basePrice: 222.00 },
  { symbol: 'GS', name: 'Goldman Sachs', chineseName: '高盛集团', marketCap: 172, sector: 'Financial Services', exchange: 'NYSE', basePrice: 512.00 },
  { symbol: 'LLY', name: 'Eli Lilly', chineseName: '礼来制药', marketCap: 860, sector: 'Pharmaceuticals', exchange: 'NYSE', basePrice: 915.00 },

  // 低于10美元 / 市值低于5B的股票 (重点支持)
  { symbol: 'SOFI', name: 'SoFi Technologies', chineseName: 'SoFi金融', marketCap: 9.8, sector: 'Financial Services', exchange: 'NASDAQ', basePrice: 9.85 },
  { symbol: 'NIO', name: 'NIO Inc.', chineseName: '蔚来汽车', marketCap: 10.2, sector: 'Automotive / EV', exchange: 'NYSE', basePrice: 5.25 },
  { symbol: 'PLUG', name: 'Plug Power Inc.', chineseName: '普拉格能源', marketCap: 2.35, sector: 'Clean Energy', exchange: 'NASDAQ', basePrice: 2.85 },
  { symbol: 'LCID', name: 'Lucid Group Inc.', chineseName: '路西德电动车', marketCap: 6.8, sector: 'Automotive / EV', exchange: 'NASDAQ', basePrice: 3.15 },
  { symbol: 'RIVN', name: 'Rivian Automotive', chineseName: '锐维安汽车', marketCap: 9.7, sector: 'Automotive / EV', exchange: 'NASDAQ', basePrice: 9.90 },
  { symbol: 'RIOT', name: 'Riot Platforms', chineseName: '防暴区块链', marketCap: 2.65, sector: 'FinTech / Crypto', exchange: 'NASDAQ', basePrice: 8.95 },
  { symbol: 'SOUN', name: 'SoundHound AI', chineseName: '声猎AI', marketCap: 2.15, sector: 'Software & AI', exchange: 'NASDAQ', basePrice: 6.25 },
  { symbol: 'BBAI', name: 'BigBear.ai', chineseName: '大熊AI', marketCap: 0.52, sector: 'Software & AI', exchange: 'NYSE', basePrice: 2.15 },
  { symbol: 'CLOV', name: 'Clover Health', chineseName: '三叶草医疗', marketCap: 1.68, sector: 'Healthcare', exchange: 'NASDAQ', basePrice: 3.42 },
  { symbol: 'OPEN', name: 'Opendoor Technologies', chineseName: '开门科技房产', marketCap: 1.45, sector: 'Real Estate', exchange: 'NASDAQ', basePrice: 2.10 },
  { symbol: 'CHPT', name: 'ChargePoint Holdings', chineseName: '充电点', marketCap: 0.78, sector: 'Industrial', exchange: 'NYSE', basePrice: 1.62 },
  { symbol: 'JOBY', name: 'Joby Aviation', chineseName: '乔比空中出租', marketCap: 4.80, sector: 'Aerospace & Defense', exchange: 'NYSE', basePrice: 6.50 },
  { symbol: 'ACHR', name: 'Archer Aviation', chineseName: '阿切尔航空', marketCap: 1.35, sector: 'Aerospace & Defense', exchange: 'NYSE', basePrice: 4.25 },
  { symbol: 'RUN', name: 'Sunrun Inc.', chineseName: '阳光动力光伏', marketCap: 2.10, sector: 'Clean Energy', exchange: 'NASDAQ', basePrice: 9.40 },
  { symbol: 'MARA', name: 'MARA Holdings', chineseName: '马拉松数字', marketCap: 5.20, sector: 'FinTech / Crypto', exchange: 'NASDAQ', basePrice: 18.20 },
  { symbol: 'F', name: 'Ford Motor', chineseName: '福特汽车', marketCap: 41.5, sector: 'Automotive / EV', exchange: 'NYSE', basePrice: 10.45 },
  { symbol: 'GME', name: 'GameStop Corp.', chineseName: '游戏驿站', marketCap: 9.5, sector: 'Consumer Discretionary', exchange: 'NYSE', basePrice: 21.80 },
  { symbol: 'AMC', name: 'AMC Entertainment', chineseName: 'AMC院线', marketCap: 1.8, sector: 'Communication Services', exchange: 'NYSE', basePrice: 4.55 },
  { symbol: 'SNAP', name: 'Snap Inc.', chineseName: '色拉布', marketCap: 16.5, sector: 'Communication Services', exchange: 'NYSE', basePrice: 10.20 },
  { symbol: 'UBER', name: 'Uber Technologies', chineseName: '优步出行', marketCap: 160.0, sector: 'Technology', exchange: 'NYSE', basePrice: 78.50 },
  { symbol: 'PYPL', name: 'PayPal Holdings', chineseName: '贝宝金融', marketCap: 82.0, sector: 'Financial Services', exchange: 'NASDAQ', basePrice: 79.50 },
  { symbol: 'DKNG', name: 'DraftKings Inc.', chineseName: '选秀国王体育', marketCap: 18.5, sector: 'Consumer Discretionary', exchange: 'NASDAQ', basePrice: 38.60 },
  { symbol: 'BAC', name: 'Bank of America', chineseName: '美国银行', marketCap: 320.0, sector: 'Financial Services', exchange: 'NYSE', basePrice: 42.10 },
  { symbol: 'WMT', name: 'Walmart Inc.', chineseName: '沃尔玛', marketCap: 640.0, sector: 'Consumer Staples', exchange: 'NYSE', basePrice: 80.50 },
  { symbol: 'DIS', name: 'Walt Disney Company', chineseName: '迪士尼', marketCap: 175.0, sector: 'Communication Services', exchange: 'NYSE', basePrice: 95.80 },
];

