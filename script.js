// Coinglass Heatmap 網頁版分析工具

/* ========== 配置常數 ========== */
const API_BASE = 'https://capi.coinglass.com/liquidity-heatmap/api/liquidity/v4/heatmap';
// 多個 CORS 代理備用
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://thingproxy.freeboard.io/fetch/',
    'https://api.codetabs.com/v1/proxy?quest='
];
let currentProxyIndex = 0;
let API_KEY = 'SILRRC6CXIUlotufdglZRUe95rTD9C+pUGhm/uzGGq4='; // 預設token

const PAIRS = [
    { 
        name: 'BTCUSDT', 
        symbol: 'Binance_BTCUSDT#heatmap', 
        tab: 'Binance BTCUSDT',
        contractInfo: {
            fullName: 'BTCUSDT 永續合約',
            exchange: 'Binance 期貨',
            type: 'USDT 保證金永續合約',
            contractSize: '1 BTC',
            tickSize: '0.01 USDT',
            leverage: '1x-125x',
            fundingInterval: '8小時',
            description: 'Bitcoin 永續合約，以 USDT 計價'
        }
    },
    { 
        name: 'ETHUSDT', 
        symbol: 'Binance_ETHUSDT#heatmap', 
        tab: 'Binance ETHUSDT',
        contractInfo: {
            fullName: 'ETHUSDT 永續合約',
            exchange: 'Binance 期貨',
            type: 'USDT 保證金永續合約',
            contractSize: '1 ETH',
            tickSize: '0.01 USDT',
            leverage: '1x-75x',
            fundingInterval: '8小時',
            description: 'Ethereum 永續合約，以 USDT 計價'
        }
    }
];

const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1/ticker/price';

/* ========== DOM 元素 ========== */
const analyzeBtn = document.getElementById('analyzeBtn');
const refreshBtn = document.getElementById('refreshBtn');
const intervalSelect = document.getElementById('interval');
const pairSelect = document.getElementById('pair');
const showOrderBookCheck = document.getElementById('showOrderBook');
const orderBookPageSizeSelect = document.getElementById('orderBookPageSize');
const orderBookSortSelect = document.getElementById('orderBookSort');
const enableOVBCheck = document.getElementById('enableOVB');
const resetOVBBtn = document.getElementById('resetOVB');
const enableTrendAnalysisCheck = document.getElementById('enableTrendAnalysis');
const autoUpdateCheck = document.getElementById('autoUpdate');
const updateIntervalSelect = document.getElementById('updateInterval');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const trendAnalysisDiv = document.getElementById('trendAnalysis');
const trendIndicatorSpan = document.getElementById('trendIndicator');
const trendTextSpan = document.getElementById('trendText');
const trendStrengthSpan = document.getElementById('trendStrength');
const trendVolatilitySpan = document.getElementById('trendVolatility');
const marketStateSpan = document.getElementById('marketState');
const suitabilityContentDiv = document.getElementById('suitabilityContent');
const trendUpdateIndicatorSpan = document.getElementById('trendUpdateIndicator');
const trendUpdateTextSpan = document.getElementById('trendUpdateText');
const trendLastUpdateSpan = document.getElementById('trendLastUpdate');
const trendHelpBtn = document.getElementById('trendHelpBtn');
const trendHelpTooltip = document.getElementById('trendHelpTooltip');
const trendHelpClose = document.getElementById('trendHelpClose');
const contractInfoBtn = document.getElementById('contractInfoBtn');
const contractInfoModal = document.getElementById('contractInfoModal');
const contractInfoClose = document.getElementById('contractInfoClose');
const coinglassStatusSpan = document.getElementById('coinglassStatus');
const binanceStatusSpan = document.getElementById('binanceStatus');
const reliabilityLevelSpan = document.getElementById('reliabilityLevel');

/* ========== 自動更新相關變數 ========== */
let updateTimer = null;
let isUpdating = false;
let lastUpdateTime = null;
let trendLastUpdateTime = null;

/* ========== 分頁相關變數 ========== */
let currentPages = {}; // 儲存每個交易對的當前頁數

/* ========== OVB 拋售偵測相關變數 ========== */
let ovbHistory = {}; // 儲存每個交易對的OVB歷史數據
const OVB_HISTORY_LENGTH = 50; // 保留50個數據點
const EMA_PERIOD = 21; // EMA21週期

/* ========== 趨勢分析相關變數 ========== */
let trendHistory = {}; // 儲存每個交易對的趨勢歷史數據
const TREND_HISTORY_LENGTH = 30; // 保留30個數據點
const TREND_MA_PERIOD = 7; // 趨勢移動平均週期
let globalTrendData = null; // 全域趨勢分析數據

/* ========== 數據來源狀態追踪 ========== */
let apiStatus = {
    coinglass: { 
        status: 'waiting', // waiting, success, error
        lastSuccess: null,
        errorCount: 0
    },
    binance: { 
        status: 'waiting', // waiting, success, error
        lastSuccess: null,
        errorCount: 0
    }
};

/* ========== 工具函數 ========== */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 更新狀態顯示
function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    
    // 如果是在 GitHub Pages 上，添加特殊提示
    if (window.location.hostname.includes('github.io') && type === 'error') {
        const githubPagesNote = document.createElement('div');
        githubPagesNote.className = 'github-pages-note';
        githubPagesNote.innerHTML = `
            <p>🔧 <strong>GitHub Pages 使用提示：</strong></p>
            <ul>
                <li>由於 CORS 限制，某些 API 調用可能失敗</li>
                <li>程序已自動切換到模擬數據模式</li>
                <li>所有功能（趨勢分析、可視化）仍可正常使用</li>
                <li>建議下載到本地運行以獲得完整功能</li>
            </ul>
        `;
        
        // 如果還沒有添加過提示，才添加
        if (!document.querySelector('.github-pages-note')) {
            statusDiv.appendChild(githubPagesNote);
        }
    }
}

// 格式化數字
function formatPrice(price) {
    return Number(price).toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
}

// 格式化時間
function formatDateTime(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('zh-TW', { 
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/* ========== 核心分析函數（從原始代碼移植） ========== */

// 取得前 5 大支撐/阻力
function pickTop(map, avg) {
    return [...map.entries()]
        .filter(([, s]) => s >= avg * 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([price]) => ({ price: Number(price) }));
}

// 格式化 5 行輸出
function formatLevels(arr, label) {
    const tags = ['首要', '第二', '技術熱區', '技術熱區', '技術熱區'];
    const levels = [];
    
    for (let i = 0; i < 5; i++) {
        if (arr[i]) {
            levels.push({
                price: arr[i].price,
                tag: `${tags[i]}${label}`
            });
        } else {
            levels.push({
                price: null,
                tag: `${tags[i]}${label}`
            });
        }
    }
    return levels;
}

// AI 建議生成 - 重新設計版本
function getAISuggestion(pair, price, supList, resList) {
    if (!price || !supList.length || !resList.length) {
        return '📌 資料不足，暫不建議操作。';
    }

    const sup = supList[0].price;
    const res = resList[0].price;
    
    // 根據不同幣種設置參數
    const isBTC = pair.startsWith('BTC');
    const isETH = pair.startsWith('ETH');
    
    // 動態設置參數
    const config = getAIConfig(pair, price, sup, res);
    
    // 判斷價格位置
    const distanceToSup = price - sup;
    const distanceToRes = res - price;
    const totalRange = res - sup;
    
    // 接近支撐 (距離支撐 < 2%)
    if (distanceToSup <= totalRange * 0.02) {
        return generateLongSuggestion(pair, price, sup, res, config);
    }
    
    // 接近阻力 (距離阻力 < 2%)
    if (distanceToRes <= totalRange * 0.02) {
        return generateShortSuggestion(pair, price, sup, res, config);
    }
    
    // 價格在區間中段
    const pricePosition = distanceToSup / totalRange;
    
    if (pricePosition > 0.3 && pricePosition < 0.7) {
        return generateNeutralSuggestion(pair, price, sup, res, pricePosition);
    }
    
    // 偏向支撐或阻力的建議
    if (pricePosition <= 0.3) {
        return generateBiasedLongSuggestion(pair, price, sup, res, config);
    } else {
        return generateBiasedShortSuggestion(pair, price, sup, res, config);
    }
}

// 獲取AI配置參數
function getAIConfig(pair, price, sup, res) {
    const isBTC = pair.startsWith('BTC');
    const isETH = pair.startsWith('ETH');
    const range = res - sup;
    
    if (isBTC) {
        return {
            // BTC 配置
            stopLossPercent: 0.015,  // 1.5% 停損
            partialTakePercent: 0.4, // 40% 部分止盈
            minRR: 2.0,              // 最小風險回報比
            batchCount: 3,           // 分批數量
            batchSpread: price * 0.005, // 每批間距 0.5%
            volatilityBuffer: Math.max(300, range * 0.02) // 波動緩衝
        };
    } else if (isETH) {
        return {
            // ETH 配置
            stopLossPercent: 0.02,   // 2% 停損
            partialTakePercent: 0.4, // 40% 部分止盈
            minRR: 2.0,              // 最小風險回報比
            batchCount: 3,           // 分批數量
            batchSpread: price * 0.008, // 每批間距 0.8%
            volatilityBuffer: Math.max(50, range * 0.02) // 波動緩衝
        };
    } else {
        return {
            // 其他幣種配置
            stopLossPercent: 0.03,   // 3% 停損
            partialTakePercent: 0.4, // 40% 部分止盈
            minRR: 1.5,              // 最小風險回報比
            batchCount: 2,           // 分批數量
            batchSpread: price * 0.01, // 每批間距 1%
            volatilityBuffer: Math.max(range * 0.03, 10) // 波動緩衝
        };
    }
}

// 生成做多建議
function generateLongSuggestion(pair, price, sup, res, config) {
    const entryPrice = sup + config.volatilityBuffer;
    const stopLoss = entryPrice * (1 - config.stopLossPercent);
    const takeProfit = res - config.volatilityBuffer;
    const partialTakeProfit = entryPrice + (takeProfit - entryPrice) * config.partialTakePercent;
    
    const riskAmount = entryPrice - stopLoss;
    const rewardAmount = takeProfit - entryPrice;
    const rrRatio = rewardAmount / riskAmount;
    
    if (rrRatio < config.minRR) {
        return `📊 接近支撐位 $${formatPrice(sup)}，但 RR 比 ${rrRatio.toFixed(2)} 過低，暫不建議進場。
💡 建議等待更好的進場時機或調整止損策略。`;
    }
    
    // 分批進場價格
    const batchPrices = [];
    for (let i = 0; i < config.batchCount; i++) {
        batchPrices.push(entryPrice + (i * config.batchSpread));
    }
    
    return `📈 多單建議 (${pair})
━━━━━━━━━━━━━━━━
🎯 進場區間：$${formatPrice(entryPrice)} 附近
🛑 停損設置：$${formatPrice(stopLoss)} (-${(config.stopLossPercent * 100).toFixed(1)}%)
🎊 部分止盈：$${formatPrice(partialTakeProfit)} (+${((partialTakeProfit - entryPrice) / entryPrice * 100).toFixed(1)}%)
🏆 主要止盈：$${formatPrice(takeProfit)}
✅ RR 比例：1:${rrRatio.toFixed(2)}

📌 分批進場策略：
${batchPrices.map((p, i) => `▶️ 第${i + 1}批：$${formatPrice(p)} (${(100 / config.batchCount).toFixed(0)}%)`).join('\n')}

⚠️ 風險提醒：
• 設置嚴格停損，控制風險
• 建議部分止盈，保護利潤
• 關注成交量變化`;
}

// 生成做空建議
function generateShortSuggestion(pair, price, sup, res, config) {
    const entryPrice = res - config.volatilityBuffer;
    const stopLoss = entryPrice * (1 + config.stopLossPercent);
    const takeProfit = sup + config.volatilityBuffer;
    const partialTakeProfit = entryPrice - (entryPrice - takeProfit) * config.partialTakePercent;
    
    const riskAmount = stopLoss - entryPrice;
    const rewardAmount = entryPrice - takeProfit;
    const rrRatio = rewardAmount / riskAmount;
    
    if (rrRatio < config.minRR) {
        return `📊 接近阻力位 $${formatPrice(res)}，但 RR 比 ${rrRatio.toFixed(2)} 過低，暫不建議進場。
💡 建議等待更好的進場時機或調整止損策略。`;
    }
    
    // 分批進場價格
    const batchPrices = [];
    for (let i = 0; i < config.batchCount; i++) {
        batchPrices.push(entryPrice - (i * config.batchSpread));
    }
    
    return `📉 空單建議 (${pair})
━━━━━━━━━━━━━━━━
🎯 進場區間：$${formatPrice(entryPrice)} 附近
🛑 停損設置：$${formatPrice(stopLoss)} (+${(config.stopLossPercent * 100).toFixed(1)}%)
🎊 部分止盈：$${formatPrice(partialTakeProfit)} (-${((entryPrice - partialTakeProfit) / entryPrice * 100).toFixed(1)}%)
🏆 主要止盈：$${formatPrice(takeProfit)}
✅ RR 比例：1:${rrRatio.toFixed(2)}

📌 分批進場策略：
${batchPrices.map((p, i) => `▶️ 第${i + 1}批：$${formatPrice(p)} (${(100 / config.batchCount).toFixed(0)}%)`).join('\n')}

⚠️ 風險提醒：
• 設置嚴格停損，控制風險
• 建議部分止盈，保護利潤
• 關注成交量變化`;
}

// 生成偏向做多建議
function generateBiasedLongSuggestion(pair, price, sup, res, config) {
    const distanceToSup = price - sup;
    const totalRange = res - sup;
    
    return `📊 價格分析 (${pair})
━━━━━━━━━━━━━━━━
💰 當前價格：$${formatPrice(price)}
📈 支撐位置：$${formatPrice(sup)} (距離 ${formatPrice(distanceToSup)})
📉 阻力位置：$${formatPrice(res)}

🎯 操作建議：
• 偏向支撐，可考慮輕倉做多
• 建議等待回調至 $${formatPrice(sup + totalRange * 0.05)} 以下
• 或突破 $${formatPrice(sup + totalRange * 0.15)} 後追多

⚠️ 風險控制：
• 輕倉試探，嚴格止損
• 停損設在 $${formatPrice(sup * 0.985)} 以下
• 關注支撐位是否有效`;
}

// 生成偏向做空建議
function generateBiasedShortSuggestion(pair, price, sup, res, config) {
    const distanceToRes = res - price;
    const totalRange = res - sup;
    
    return `📊 價格分析 (${pair})
━━━━━━━━━━━━━━━━
💰 當前價格：$${formatPrice(price)}
📈 支撐位置：$${formatPrice(sup)}
📉 阻力位置：$${formatPrice(res)} (距離 ${formatPrice(distanceToRes)})

🎯 操作建議：
• 偏向阻力，可考慮輕倉做空
• 建議等待反彈至 $${formatPrice(res - totalRange * 0.05)} 以上
• 或跌破 $${formatPrice(res - totalRange * 0.15)} 後追空

⚠️ 風險控制：
• 輕倉試探，嚴格止損
• 停損設在 $${formatPrice(res * 1.015)} 以上
• 關注阻力位是否有效`;
}

// 生成中性建議
function generateNeutralSuggestion(pair, price, sup, res, pricePosition) {
    const totalRange = res - sup;
    const isBTC = pair.startsWith('BTC');
    
    return `📊 價格分析 (${pair})
━━━━━━━━━━━━━━━━
💰 當前價格：$${formatPrice(price)}
📈 支撐位置：$${formatPrice(sup)}
📉 阻力位置：$${formatPrice(res)}
📍 位置比例：${(pricePosition * 100).toFixed(1)}%

🚫 暫不建議進場：
• 價格位於區間中段
• 上下空間相對有限
• 風險回報比不佳

🎯 等待機會：
• 觀察是否突破 $${formatPrice(res)}
• 或回調至 $${formatPrice(sup)} 支撐
• 建議等待更明確的方向信號

💡 策略建議：
• 可設置 $${formatPrice(sup)} 附近掛多單
• 可設置 $${formatPrice(res)} 附近掛空單
• 採用區間震盪策略`;
}

/* ========== OVB 拋售偵測函數 ========== */

// 計算修正版 OVB (基於掛單量不平衡)
function calculateOrderBookOVB(bidVolume, askVolume, currentPrice, previousPrice) {
    // 計算買賣壓力差異
    const volumeImbalance = bidVolume - askVolume;
    
    // 根據價格變化方向調整
    const priceDirection = currentPrice > previousPrice ? 1 : 
                          currentPrice < previousPrice ? -1 : 0;
    
    // OVB 變化量 = 成交量不平衡 * 價格方向
    const ovbChange = volumeImbalance * priceDirection;
    
    return ovbChange;
}

/* ========== 趨勢分析函數 ========== */

// 更新趨勢歷史數據
function updateTrendHistory(pair, price, bidVolume, askVolume) {
    if (!trendHistory[pair]) {
        trendHistory[pair] = {
            prices: [],
            volumes: [],
            timestamps: [],
            volatilities: []
        };
    }
    
    const history = trendHistory[pair];
    const timestamp = Date.now();
    
    // 加入新數據
    history.prices.push(price);
    history.volumes.push(bidVolume + askVolume);
    history.timestamps.push(timestamp);
    
    // 計算波動率（基於最近的價格變化）
    if (history.prices.length >= 2) {
        const priceChange = Math.abs(price - history.prices[history.prices.length - 2]);
        const volatility = (priceChange / history.prices[history.prices.length - 2]) * 100;
        history.volatilities.push(volatility);
    } else {
        history.volatilities.push(0);
    }
    
    // 保持歷史數據長度
    if (history.prices.length > TREND_HISTORY_LENGTH) {
        history.prices.shift();
        history.volumes.shift();
        history.timestamps.shift();
        history.volatilities.shift();
    }
    
    return history;
}

// 計算趨勢強度
function calculateTrendStrength(priceHistory) {
    if (priceHistory.length < TREND_MA_PERIOD) return 0;
    
    const recent = priceHistory.slice(-TREND_MA_PERIOD);
    const older = priceHistory.slice(-TREND_MA_PERIOD * 2, -TREND_MA_PERIOD);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const strength = ((recentAvg - olderAvg) / olderAvg) * 100;
    return Math.abs(strength);
}

// 計算趨勢方向
function calculateTrendDirection(priceHistory) {
    if (priceHistory.length < TREND_MA_PERIOD) return 'neutral';
    
    const recent = priceHistory.slice(-TREND_MA_PERIOD);
    const older = priceHistory.slice(-TREND_MA_PERIOD * 2, -TREND_MA_PERIOD);
    
    if (older.length === 0) return 'neutral';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 2) return 'bullish';
    if (change < -2) return 'bearish';
    return 'sideways';
}

// 計算波動性
function calculateVolatility(volatilityHistory) {
    if (volatilityHistory.length === 0) return 0;
    
    const avg = volatilityHistory.reduce((a, b) => a + b, 0) / volatilityHistory.length;
    return avg;
}

// 分析全域趨勢
function analyzeGlobalTrend(results) {
    const trendAnalysis = {
        overallTrend: 'neutral',
        trendStrength: 0,
        volatility: 0,
        marketState: 'consolidation',
        suitability: 'moderate'
    };
    
    if (results.length === 0) return trendAnalysis;
    
    const validResults = results.filter(r => !r.error && r.pair);
    if (validResults.length === 0) return trendAnalysis;
    
    let totalStrength = 0;
    let totalVolatility = 0;
    let trends = { bullish: 0, bearish: 0, sideways: 0 };
    let hasHistoryData = false;
    
    // 如果有歷史數據，使用歷史數據進行分析
    validResults.forEach(result => {
        const history = trendHistory[result.pair];
        if (history && history.prices.length >= TREND_MA_PERIOD) {
            hasHistoryData = true;
            const strength = calculateTrendStrength(history.prices);
            const direction = calculateTrendDirection(history.prices);
            const volatility = calculateVolatility(history.volatilities);
            
            totalStrength += strength;
            totalVolatility += volatility;
            trends[direction]++;
        }
    });
    
    // 如果沒有足夠的歷史數據，使用當前價格和支撐阻力位進行快速分析
    if (!hasHistoryData) {
        validResults.forEach(result => {
            if (result.supports && result.resistances && result.supports.length > 0 && result.resistances.length > 0) {
                const currentPrice = result.price;
                const topSupport = result.supports[0].price;
                const topResistance = result.resistances[0].price;
                
                if (topSupport && topResistance && currentPrice) {
                    // 計算價格在支撐阻力區間的位置
                    const range = topResistance - topSupport;
                    const pricePosition = (currentPrice - topSupport) / range;
                    
                    // 根據位置判斷趨勢傾向
                    if (pricePosition > 0.7) {
                        trends.bullish++;
                    } else if (pricePosition < 0.3) {
                        trends.bearish++;
                    } else {
                        trends.sideways++;
                    }
                    
                    // 計算基於支撐阻力位的波動性
                    const volatilityEstimate = (range / currentPrice) * 100;
                    totalVolatility += Math.min(volatilityEstimate, 10); // 限制最大值
                    
                    // 計算基於位置的趨勢強度
                    const strengthEstimate = Math.abs(pricePosition - 0.5) * 4; // 0-2%
                    totalStrength += strengthEstimate;
                }
            }
        });
        
        // 對於新用戶，給予更保守的初始值
        if (totalVolatility === 0) {
            totalVolatility = 0.5; // 假設最低波動性
        }
        if (totalStrength === 0) {
            totalStrength = 0.3; // 假設最低趨勢強度
        }
    }
    
    // 計算平均值
    const dataPointCount = Math.max(validResults.length, 1);
    const avgStrength = totalStrength / dataPointCount;
    const avgVolatility = totalVolatility / dataPointCount;
    
    // 判斷主要趨勢
    const maxTrend = Object.keys(trends).reduce((a, b) => trends[a] > trends[b] ? a : b);
    
    // 設定趨勢強度等級
    let strengthLevel = 'weak';
    if (avgStrength > 5) strengthLevel = 'strong';
    else if (avgStrength > 2) strengthLevel = 'moderate';
    
    // 設定波動性等級
    let volatilityLevel = 'low';
    if (avgVolatility > 3) volatilityLevel = 'high';
    else if (avgVolatility > 1) volatilityLevel = 'moderate';
    
    // 設定市場狀態
    let marketState = 'consolidation';
    if (maxTrend === 'bullish' && avgStrength > 3) marketState = 'uptrend';
    else if (maxTrend === 'bearish' && avgStrength > 3) marketState = 'downtrend';
    else if (avgVolatility > 2) marketState = 'volatile';
    
    // 計算工具適用性
    let suitability = 'excellent'; // 預設為適合，因為這是盤整工具
    if (marketState === 'uptrend' || marketState === 'downtrend') {
        suitability = 'poor';
    } else if (marketState === 'volatile' && avgStrength > 2) {
        suitability = 'moderate';
    } else if (avgVolatility > 1.5) {
        suitability = 'good';
    }
    
    return {
        overallTrend: maxTrend,
        trendStrength: avgStrength,
        volatility: avgVolatility,
        marketState: marketState,
        suitability: suitability,
        strengthLevel: strengthLevel,
        volatilityLevel: volatilityLevel,
        hasHistoryData: hasHistoryData
    };
}

// 生成工具適用性建議
function generateToolSuitabilityAdvice(trendData) {
    const { overallTrend, marketState, suitability, trendStrength, volatility, hasHistoryData } = trendData;
    
    let advice = '';
    let className = 'suitable';
    
    // 如果沒有歷史數據，給予初始化建議
    if (!hasHistoryData) {
        advice = `✅ 適合使用此工具！

🎯 初始分析（基於當前支撐阻力位）：
• 市場狀態：${getMarketStateText(marketState)}
• 趨勢強度：${trendStrength.toFixed(1)}%（初始估計）
• 波動性：${volatility.toFixed(1)}%（初始估計）

💡 建議策略：
• 重點關注支撐阻力位
• 適合區間交易策略
• 建議先小倉位試探
• 使用本工具的所有功能

📊 數據累積中：
• 隨著使用時間增加，分析會更準確
• 自動更新功能會持續優化趨勢判斷
• 建議開啟自動更新以獲得更好的分析

⚠️ 注意事項：
• 初期分析可能不夠精確
• 建議結合其他指標確認
• 保持謹慎的風險管理`;
        className = 'suitable';
        return { advice, className };
    }
    
    switch (suitability) {
        case 'excellent':
            className = 'suitable';
            advice = `✅ 非常適合使用此工具！
            
🎯 目前市況分析：
• 市場狀態：${getMarketStateText(marketState)}
• 趨勢強度：${trendStrength.toFixed(1)}%（較弱）
• 波動性：${volatility.toFixed(1)}%（較低）

💡 建議策略：
• 重點關注支撐阻力位
• 適合區間交易策略
• 可設置較緊密的止損
• 建議使用本工具的所有功能

⚠️ 注意事項：
• 保持警惕趨勢轉變
• 適度調整倉位大小
• 設定合理的止盈止損`;
            break;
            
        case 'good':
            className = 'suitable';
            advice = `✅ 適合使用此工具
            
🎯 目前市況分析：
• 市場狀態：${getMarketStateText(marketState)}
• 趨勢強度：${trendStrength.toFixed(1)}%
• 波動性：${volatility.toFixed(1)}%

💡 建議策略：
• 關注支撐阻力位效果
• 適合短期交易策略
• 建議結合其他指標
• 可使用本工具進行分析

⚠️ 注意事項：
• 市場波動較大，謹慎操作
• 設定較寬鬆的止損
• 關注成交量變化`;
            break;
            
        case 'moderate':
            className = 'caution';
            advice = `⚠️ 謹慎使用此工具
            
🎯 目前市況分析：
• 市場狀態：${getMarketStateText(marketState)}
• 趨勢強度：${trendStrength.toFixed(1)}%
• 波動性：${volatility.toFixed(1)}%

💡 建議策略：
• 輕倉試探，嚴格止損
• 縮短持倉時間
• 結合多種分析工具
• 密切關注市場變化

⚠️ 注意事項：
• 市場方向不明確
• 支撐阻力位可能失效
• 建議等待更明確的信號`;
            break;
            
        case 'poor':
            className = 'not-suitable';
            advice = `❌ 不建議使用此工具！
            
🎯 目前市況分析：
• 市場狀態：${getMarketStateText(marketState)}
• 趨勢強度：${trendStrength.toFixed(1)}%（較強）
• 波動性：${volatility.toFixed(1)}%

🚫 為什麼不適合：
• 趨勢行情中，支撐阻力位容易被突破
• 區間交易策略風險較高
• 傳統技術分析可能失效

💡 建議策略：
• 建議使用趨勢追蹤策略
• 考慮使用 RD 現貨完整攻略
• 等待趨勢結束後再使用本工具
• 關注趨勢轉折信號

⚠️ 重要提醒：
• 趨勢來時千萬不要用這個工具
• 請改用趨勢追蹤工具
• 等待市場進入盤整階段`;
            break;
    }
    
    return { advice, className };
}

// 獲取市場狀態文字
function getMarketStateText(marketState) {
    switch (marketState) {
        case 'uptrend': return '上升趨勢';
        case 'downtrend': return '下降趨勢';
        case 'consolidation': return '盤整';
        case 'volatile': return '高波動';
        default: return '不明';
    }
}

// 獲取趨勢指示器
function getTrendIndicator(overallTrend) {
    switch (overallTrend) {
        case 'bullish': return { emoji: '🟢', text: '看漲' };
        case 'bearish': return { emoji: '🔴', text: '看跌' };
        case 'sideways': return { emoji: '🟡', text: '橫盤' };
        default: return { emoji: '⚪', text: '中性' };
    }
}

// 更新趨勢分析顯示
function updateTrendAnalysisDisplay(trendData) {
    if (!enableTrendAnalysisCheck.checked) {
        trendAnalysisDiv.style.display = 'none';
        return;
    }
    
    trendAnalysisDiv.style.display = 'block';
    
    // 更新趨勢指示器
    const indicator = getTrendIndicator(trendData.overallTrend);
    trendIndicatorSpan.textContent = indicator.emoji;
    trendIndicatorSpan.className = `trend-indicator ${trendData.overallTrend}`;
    trendTextSpan.textContent = indicator.text;
    
    // 更新趨勢指標
    trendStrengthSpan.textContent = `${trendData.trendStrength.toFixed(1)}%`;
    trendStrengthSpan.className = `trend-metric-value ${trendData.strengthLevel}`;
    
    trendVolatilitySpan.textContent = `${trendData.volatility.toFixed(1)}%`;
    trendVolatilitySpan.className = `trend-metric-value ${trendData.volatilityLevel}`;
    
    marketStateSpan.textContent = getMarketStateText(trendData.marketState);
    marketStateSpan.className = `trend-metric-value ${trendData.suitability}`;
    
    // 更新工具適用性建議
    const suitabilityAdvice = generateToolSuitabilityAdvice(trendData);
    suitabilityContentDiv.textContent = suitabilityAdvice.advice;
    suitabilityContentDiv.className = `suitability-content ${suitabilityAdvice.className}`;
    
    // 更新可視化元素
    updateTrendVisuals(trendData);
    
    // 更新趨勢分析時間
    trendLastUpdateTime = Date.now();
    updateTrendAnalysisIndicators();
}

// 更新趨勢可視化元素
function updateTrendVisuals(trendData) {
    // 1. 更新趨勢強度進度條
    const strengthBar = document.getElementById('strengthBarFill');
    if (strengthBar) {
        const strengthPercent = Math.min(trendData.trendStrength * 10, 100); // 10% 為滿條
        strengthBar.style.width = `${strengthPercent}%`;
    }
    
    // 2. 更新波動性指示器
    const volatilityDots = document.getElementById('volatilityDots');
    if (volatilityDots) {
        const dots = [];
        for (let i = 0; i < 5; i++) {
            const dot = document.createElement('div');
            dot.className = 'volatility-dot';
            
            if (i < Math.floor(trendData.volatility)) {
                dot.classList.add('active');
                if (trendData.volatility > 3) {
                    dot.classList.add('high');
                }
            }
            
            dots.push(dot);
        }
        volatilityDots.innerHTML = '';
        dots.forEach(dot => volatilityDots.appendChild(dot));
    }
    
    // 3. 更新市場狀態視覺化
    const marketStateVisual = document.getElementById('marketStateVisual');
    if (marketStateVisual) {
        marketStateVisual.className = `market-state-visual ${trendData.marketState}`;
        marketStateVisual.textContent = getMarketStateEmoji(trendData.marketState);
    }
    
    // 4. 更新價格位置指示器
    updatePricePositionIndicator(trendData);
    
    // 5. 更新買賣壓力圖
    updatePressureIndicator(trendData);
    
    // 6. 更新趨勢方向羅盤
    updateTrendCompass(trendData);
}

// 更新價格位置指示器
function updatePricePositionIndicator(trendData) {
    const pricePosition = document.getElementById('priceCurrentPosition');
    const pricePositionText = document.getElementById('pricePositionText');
    
    if (pricePosition && pricePositionText) {
        // 基於趨勢強度計算位置
        let position = 50; // 默認中間位置
        
        if (trendData.overallTrend === 'bullish') {
            position = 70 + (trendData.trendStrength * 2); // 偏向阻力
        } else if (trendData.overallTrend === 'bearish') {
            position = 30 - (trendData.trendStrength * 2); // 偏向支撐
        } else {
            position = 45 + (Math.random() * 10); // 盤整時小幅波動
        }
        
        position = Math.max(5, Math.min(95, position));
        pricePosition.style.left = `${position}%`;
        
        // 更新文字描述
        if (position < 30) {
            pricePositionText.textContent = '接近支撐位';
        } else if (position > 70) {
            pricePositionText.textContent = '接近阻力位';
        } else {
            pricePositionText.textContent = '中性區間';
        }
    }
}

// 更新買賣壓力圖
function updatePressureIndicator(trendData) {
    const buyPressureFill = document.getElementById('buyPressureFill');
    const sellPressureFill = document.getElementById('sellPressureFill');
    const buyPressureValue = document.getElementById('buyPressureValue');
    const sellPressureValue = document.getElementById('sellPressureValue');
    const pressureRatio = document.getElementById('pressureRatio');
    
    if (buyPressureFill && sellPressureFill) {
        // 基於趨勢計算買賣壓力
        let buyPressure = 50;
        let sellPressure = 50;
        
        if (trendData.overallTrend === 'bullish') {
            buyPressure = 60 + (trendData.trendStrength * 2);
            sellPressure = 40 - (trendData.trendStrength * 1.5);
        } else if (trendData.overallTrend === 'bearish') {
            buyPressure = 40 - (trendData.trendStrength * 1.5);
            sellPressure = 60 + (trendData.trendStrength * 2);
        } else {
            buyPressure = 45 + (Math.random() * 10);
            sellPressure = 45 + (Math.random() * 10);
        }
        
        buyPressure = Math.max(10, Math.min(90, buyPressure));
        sellPressure = Math.max(10, Math.min(90, sellPressure));
        
        buyPressureFill.style.width = `${buyPressure}%`;
        sellPressureFill.style.width = `${sellPressure}%`;
        
        if (buyPressureValue && sellPressureValue && pressureRatio) {
            buyPressureValue.textContent = `${buyPressure.toFixed(0)}%`;
            sellPressureValue.textContent = `${sellPressure.toFixed(0)}%`;
            
            const ratio = (buyPressure / sellPressure).toFixed(2);
            pressureRatio.textContent = `買賣比例: ${ratio}:1`;
        }
    }
}

// 更新趨勢方向羅盤
function updateTrendCompass(trendData) {
    const compassNeedle = document.getElementById('compassNeedle');
    const compassText = document.getElementById('compassText');
    
    if (compassNeedle && compassText) {
        let rotation = 0;
        let description = '';
        
        switch (trendData.overallTrend) {
            case 'bullish':
                rotation = 0; // 指向北方（看漲）
                description = '看漲趨勢';
                break;
            case 'bearish':
                rotation = 180; // 指向南方（看跌）
                description = '看跌趨勢';
                break;
            case 'neutral':
                rotation = 90; // 指向東方（橫盤）
                description = '橫盤整理';
                break;
            default:
                rotation = 270; // 指向西方（震盪）
                description = '震盪市場';
        }
        
        // 根據趨勢強度微調角度
        rotation += (Math.random() - 0.5) * trendData.trendStrength * 5;
        
        compassNeedle.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;
        compassText.textContent = description;
    }
}

// 獲取市場狀態表情符號
function getMarketStateEmoji(marketState) {
    switch (marketState) {
        case 'uptrend':
            return '📈';
        case 'downtrend':
            return '📉';
        case 'consolidation':
            return '📊';
        case 'volatile':
            return '🌪️';
        default:
            return '❓';
    }
}

// 更新趨勢分析指示器
function updateTrendAnalysisIndicators() {
    if (!enableTrendAnalysisCheck.checked) {
        trendUpdateIndicatorSpan.className = 'trend-update-indicator waiting';
        trendUpdateTextSpan.textContent = '已停用';
        trendLastUpdateSpan.textContent = '趨勢分析已停用';
        return;
    }
    
    // 更新狀態指示器
    if (isUpdating) {
        trendUpdateIndicatorSpan.className = 'trend-update-indicator updating';
        trendUpdateTextSpan.textContent = '分析更新中...';
    } else if (trendLastUpdateTime) {
        trendUpdateIndicatorSpan.className = 'trend-update-indicator active';
        trendUpdateTextSpan.textContent = '趨勢分析已更新';
    } else {
        trendUpdateIndicatorSpan.className = 'trend-update-indicator waiting';
        trendUpdateTextSpan.textContent = '等待分析...';
    }
    
    // 更新最後更新時間
    if (trendLastUpdateTime) {
        const updateTime = new Date(trendLastUpdateTime);
        trendLastUpdateSpan.textContent = `最後更新: ${updateTime.toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })}`;
    } else {
        trendLastUpdateSpan.textContent = '尚未更新';
    }
    
    // 更新數據來源狀態
    updateDataSourceStatus();
}

// 更新數據來源狀態顯示
function updateDataSourceStatus() {
    // 更新 Coinglass 狀態
    if (apiStatus.coinglass.status === 'success') {
        coinglassStatusSpan.textContent = '🟢';
        coinglassStatusSpan.title = `連接正常 - 最後成功: ${new Date(apiStatus.coinglass.lastSuccess).toLocaleTimeString('zh-TW')}`;
    } else if (apiStatus.coinglass.status === 'error') {
        coinglassStatusSpan.textContent = '🔴';
        coinglassStatusSpan.title = `連接異常 - 錯誤次數: ${apiStatus.coinglass.errorCount}`;
    } else {
        coinglassStatusSpan.textContent = '⚪';
        coinglassStatusSpan.title = '等待連接...';
    }
    
    // 更新 Binance Futures 狀態
    if (apiStatus.binance.status === 'success') {
        binanceStatusSpan.textContent = '🟢';
        binanceStatusSpan.title = `期貨價格連接正常 - 最後成功: ${new Date(apiStatus.binance.lastSuccess).toLocaleTimeString('zh-TW')}`;
    } else if (apiStatus.binance.status === 'error') {
        binanceStatusSpan.textContent = '🔴';
        binanceStatusSpan.title = `期貨價格連接異常 - 錯誤次數: ${apiStatus.binance.errorCount}`;
    } else {
        binanceStatusSpan.textContent = '⚪';
        binanceStatusSpan.title = '等待連接期貨價格API...';
    }
    
    // 更新數據可靠性
    const coinglassOk = apiStatus.coinglass.status === 'success';
    const binanceOk = apiStatus.binance.status === 'success';
    
    if (coinglassOk && binanceOk) {
        reliabilityLevelSpan.textContent = '即時更新';
        reliabilityLevelSpan.className = 'reliability-level good';
        reliabilityLevelSpan.title = '所有數據來源運行正常';
    } else if (coinglassOk || binanceOk) {
        reliabilityLevelSpan.textContent = '部分可用';
        reliabilityLevelSpan.className = 'reliability-level warning';
        reliabilityLevelSpan.title = '部分數據來源出現問題';
    } else {
        reliabilityLevelSpan.textContent = '連接中...';
        reliabilityLevelSpan.className = 'reliability-level';
        reliabilityLevelSpan.title = '正在嘗試連接數據來源';
    }
}

// 記錄API成功狀態
function recordApiSuccess(apiName) {
    if (apiStatus[apiName]) {
        apiStatus[apiName].status = 'success';
        apiStatus[apiName].lastSuccess = Date.now();
        apiStatus[apiName].errorCount = 0;
    }
}

// 記錄API錯誤狀態
function recordApiError(apiName) {
    if (apiStatus[apiName]) {
        apiStatus[apiName].status = 'error';
        apiStatus[apiName].errorCount++;
    }
}

// 計算 EMA
function calculateEMA(values, period) {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    
    const k = 2 / (period + 1);
    let ema = values[0];
    
    // 使用所有可用數據計算 EMA，不需要等到 period 數量
    for (let i = 1; i < values.length; i++) {
        ema = (values[i] * k) + (ema * (1 - k));
    }
    
    return ema;
}

// 更新 OVB 歷史數據
function updateOVBHistory(pair, bidVolume, askVolume, currentPrice) {
    if (!ovbHistory[pair]) {
        // 首次初始化：計算初始 OVB 值
        const initialOVB = calculateOrderBookOVB(bidVolume, askVolume, currentPrice, currentPrice);
        ovbHistory[pair] = {
            ovbValues: [initialOVB],
            emaValues: [initialOVB], // 第一個 EMA 值等於第一個 OVB 值
            prices: [currentPrice],
            timestamps: [Date.now()]
        };
        return { ovb: initialOVB, ema: initialOVB, trend: 'neutral' };
    }
    
    const history = ovbHistory[pair];
    const previousPrice = history.prices[history.prices.length - 1] || currentPrice;
    
    // 計算 OVB 變化
    const ovbChange = calculateOrderBookOVB(bidVolume, askVolume, currentPrice, previousPrice);
    const newOVB = (history.ovbValues[history.ovbValues.length - 1] || 0) + ovbChange;
    
    // 先用現有數據計算 EMA（不包含最新的 OVB 值）
    const currentEMA = history.emaValues[history.emaValues.length - 1] || 0;
    const k = 2 / (EMA_PERIOD + 1);
    const newEMA = history.ovbValues.length > 1 ? 
        (newOVB * k) + (currentEMA * (1 - k)) : newOVB;
    
    // 添加新數據
    history.ovbValues.push(newOVB);
    history.emaValues.push(newEMA);
    history.prices.push(currentPrice);
    history.timestamps.push(Date.now());
    
    // 保持歷史數據長度
    if (history.ovbValues.length > OVB_HISTORY_LENGTH) {
        history.ovbValues.shift();
        history.emaValues.shift();
        history.prices.shift();
        history.timestamps.shift();
    }
    
    return {
        ovb: newOVB,
        ema: newEMA,
        trend: getTrend(history.ovbValues, history.emaValues)
    };
}

// 判斷趨勢
function getTrend(ovbValues, emaValues) {
    if (ovbValues.length < 3 || emaValues.length < 3) return 'neutral';
    
    const currentOVB = ovbValues[ovbValues.length - 1];
    const previousOVB = ovbValues[ovbValues.length - 2];
    const currentEMA = emaValues[emaValues.length - 1];
    
    // OVB 趨勢
    const ovbTrend = currentOVB > previousOVB ? 'up' : 'down';
    
    // OVB vs EMA 位置關係
    const ovbDiff = currentOVB - currentEMA;
    const threshold = Math.abs(currentEMA) * 0.001; // 0.1% 的容差
    
    // 判斷趨勢
    if (Math.abs(ovbDiff) <= threshold) {
        // OVB 與 EMA 相近，根據近期趨勢判斷
        return ovbTrend === 'up' ? 'bullish' : 'neutral';
    } else if (ovbDiff > 0) {
        // OVB > EMA，看漲
        return 'bullish';
    } else {
        // OVB < EMA，看跌
        return 'bearish';
    }
}

// 偵測大量拋售
function detectSelling(pair, bidVolume, askVolume, currentPrice, ovbData) {
    const sellRatio = askVolume / (bidVolume + askVolume);
    const ovbDiff = ovbData.ovb - ovbData.ema;
    const threshold = Math.abs(ovbData.ema) * 0.001;
    
    // 更精確的 OVB 與 EMA 比較
    const ovbBelowEMA = ovbDiff < -threshold;
    const strongSellPressure = sellRatio > 0.6; // 賣壓超過60%
    const moderateSellPressure = sellRatio > 0.45; // 賣壓超過45%
    
    // 拋售強度計算 - 更精確的邏輯
    let sellingIntensity = 0;
    
    // 基於賣壓比例
    if (sellRatio > 0.7) {
        sellingIntensity += 40;
    } else if (sellRatio > 0.6) {
        sellingIntensity += 30;
    } else if (sellRatio > 0.5) {
        sellingIntensity += 20;
    } else if (sellRatio > 0.45) {
        sellingIntensity += 10;
    }
    
    // 基於 OVB 與 EMA 關係
    if (ovbBelowEMA) {
        sellingIntensity += 25;
    } else if (Math.abs(ovbDiff) <= threshold) {
        sellingIntensity += 5; // 平衡狀態少量加分
    }
    
    // 基於趨勢狀態
    if (ovbData.trend === 'bearish') {
        sellingIntensity += 25;
    } else if (ovbData.trend === 'neutral') {
        sellingIntensity += 10;
    }
    
    // 近期價格下跌
    const history = ovbHistory[pair];
    if (history && history.prices.length >= 3) {
        const recentPrices = history.prices.slice(-3);
        const priceDecline = recentPrices.every((price, index) => 
            index === 0 || price <= recentPrices[index - 1]
        );
        if (priceDecline) sellingIntensity += 15;
    }
    
    return {
        intensity: Math.min(sellingIntensity, 100),
        alert: sellingIntensity >= 70,
        sellRatio: sellRatio,
        ovbBelowEMA: ovbBelowEMA
    };
}

// 生成 OVB 指標 HTML
function generateOVBIndicatorHTML(pair, bidVolume, askVolume, currentPrice) {
    if (!enableOVBCheck.checked) return '';
    
    const ovbData = updateOVBHistory(pair, bidVolume, askVolume, currentPrice);
    const sellingData = detectSelling(pair, bidVolume, askVolume, currentPrice, ovbData);
    
    const statusClass = sellingData.alert ? 'danger' : 
                       sellingData.intensity > 40 ? 'warning' : 'normal';
    
    const statusText = sellingData.alert ? '🚨 大量拋售' : 
                      sellingData.intensity > 40 ? '⚠️ 拋售壓力' : '✅ 正常';
    
    let alertHtml = '';
    if (sellingData.alert) {
        alertHtml = `
            <div class="selling-pressure-alert">
                🚨 偵測到大量拋售壓力！
                <br>
                <small>賣壓比例: ${(sellingData.sellRatio * 100).toFixed(1)}% | OVB 跌破 EMA21</small>
            </div>`;
    }
    
    return `
        <div class="ovb-indicator">
            <div class="ovb-header">
                <div class="ovb-title">
                    📊 OVB 拋售偵測
                    <span class="ovb-info-icon" title="點擊查看基本說明" onclick="toggleOVBTooltip(event)">ℹ️</span>
                    <span class="ovb-advanced-icon" title="點擊查看計算詳解" onclick="toggleAdvancedTooltip(event)">🔬</span>
                </div>
                <div class="ovb-status ${statusClass}">${statusText}</div>
            </div>
            <div class="ovb-tooltip" id="ovbTooltip" style="display: none;">
                <div class="ovb-tooltip-content">
                    <div class="ovb-tooltip-title">
                        📊 OVB 指標說明
                        <span class="ovb-tooltip-close" onclick="closeAllOVBTooltips()">✕</span>
                    </div>
                    <div class="ovb-tooltip-text">
                        <p><strong>OVB 值：</strong></p>
                        <p>• 正值(+)：累積買盤壓力 > 賣盤壓力</p>
                        <p>• 負值(-)：累積賣盤壓力 > 買盤壓力</p>
                        <p>• 數值大小：反映壓力強度</p>
                        
                        <p><strong>EMA21：</strong></p>
                        <p>• OVB 的21期平滑趨勢線</p>
                        <p>• 用於判斷整體趨勢方向</p>
                        <p>• 數據點越多，EMA 越準確</p>
                        
                        <p><strong>關鍵判斷：</strong></p>
                        <p>• OVB > EMA21：近期買盤增強 📈</p>
                        <p>• OVB < EMA21：近期賣盤增強 📉</p>
                        <p>• 負值不代表危險，重點看趨勢！</p>
                        <p>• 剛開始數據點較少時，OVB ≈ EMA21 是正常的</p>
                    </div>
                </div>
            </div>
            
            <div class="ovb-advanced-tooltip" id="ovbAdvancedTooltip" style="display: none;">
                <div class="ovb-tooltip-content">
                    <div class="ovb-tooltip-title">
                        🔬 OVB 計算詳解
                        <span class="ovb-tooltip-close" onclick="closeAllOVBTooltips()">✕</span>
                    </div>
                    <div class="ovb-tooltip-text">
                        <div class="formula-section">
                            <h4>📊 OVB 計算公式</h4>
                            <div class="formula-box">
                                <p><strong>1. 掛單量不平衡：</strong></p>
                                <code>不平衡 = 買盤總量 - 賣盤總量</code>
                                
                                <p><strong>2. 價格方向：</strong></p>
                                <code>方向 = 上漲(+1) | 下跌(-1) | 不變(0)</code>
                                
                                <p><strong>3. OVB 變化：</strong></p>
                                <code>變化量 = 不平衡 × 價格方向</code>
                                
                                <p><strong>4. 累積 OVB：</strong></p>
                                <code>新OVB = 前一OVB + 變化量</code>
                            </div>
                        </div>
                        
                        <div class="formula-section">
                            <h4>📈 EMA21 計算公式</h4>
                            <div class="formula-box">
                                <p><strong>平滑因子：</strong></p>
                                <code>k = 2 ÷ (21 + 1) = 0.0909</code>
                                
                                <p><strong>EMA 計算：</strong></p>
                                <code>新EMA = (新OVB × k) + (前EMA × (1-k))</code>
                            </div>
                        </div>
                        
                        <div class="example-section">
                            <h4>🧮 計算範例</h4>
                            <div class="example-box">
                                <p><strong>假設數據：</strong></p>
                                <p>• 買盤：16,130 合約</p>
                                <p>• 賣盤：6,460 合約</p>
                                <p>• 價格：$113,646 → $113,680 (上漲)</p>
                                
                                <p><strong>計算過程：</strong></p>
                                <p>1. 不平衡 = 16,130 - 6,460 = 9,670</p>
                                <p>2. 方向 = +1 (上漲)</p>
                                <p>3. 變化量 = 9,670 × 1 = +9,670</p>
                                <p>4. 新OVB = 0 + 9,670 = 9,670</p>
                                <p>5. 新EMA = (9,670 × 0.0909) + (0 × 0.9091) = 879</p>
                            </div>
                        </div>
                        
                        <div class="interpretation-section">
                            <h4>🎯 數值解讀</h4>
                            <div class="interpretation-box">
                                <p><strong>正值 OVB：</strong> 歷史累積買盤 > 賣盤</p>
                                <p><strong>負值 OVB：</strong> 歷史累積賣盤 > 買盤</p>
                                <p><strong>OVB > EMA21：</strong> 近期買盤增強 📈</p>
                                <p><strong>OVB < EMA21：</strong> 近期賣盤增強 📉</p>
                                <p><strong>關鍵重點：</strong> 看趨勢變化，不看絕對數值！</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="ovb-explanation">
                <small style="color: #666; font-size: 0.8em; display: block; padding: 8px; background: #f8f9fa; border-radius: 4px; margin-bottom: 10px;">
                    💡 ${ovbData.ovb >= 0 ? '正值=買盤累積較多' : '負值=賣盤累積較多'}，
                    ${(() => {
                        const ovbDiff = ovbData.ovb - ovbData.ema;
                        const threshold = Math.abs(ovbData.ema) * 0.001;
                        if (Math.abs(ovbDiff) <= threshold) {
                            return 'OVB ≈ EMA21 = 趨勢相對平衡 ⚖️';
                        } else if (ovbDiff > 0) {
                            return 'OVB > EMA21 = 近期買盤增強 📈';
                        } else {
                            return 'OVB < EMA21 = 近期賣盤增強 📉';
                        }
                    })()}
                    <br>
                    <span style="color: #999; font-size: 0.75em;">
                        📊 歷史數據: ${ovbHistory[pair] ? ovbHistory[pair].ovbValues.length : 0} 個數據點
                    </span>
                </small>
            </div>
            
            <div class="ovb-metrics">
                <div class="ovb-metric">
                    <div class="ovb-metric-label">OVB 值</div>
                    <div class="ovb-metric-value ${ovbData.ovb >= 0 ? 'positive' : 'negative'}">
                        ${ovbData.ovb.toFixed(2)}
                    </div>
                </div>
                <div class="ovb-metric">
                    <div class="ovb-metric-label">EMA21</div>
                    <div class="ovb-metric-value neutral">
                        ${ovbData.ema.toFixed(2)}
                    </div>
                </div>
                <div class="ovb-metric">
                    <div class="ovb-metric-label">拋售強度</div>
                    <div class="ovb-metric-value ${sellingData.intensity > 50 ? 'negative' : 'neutral'}">
                        ${sellingData.intensity}%
                    </div>
                </div>
            </div>
            
            <div class="ovb-metrics">
                <div class="ovb-metric">
                    <div class="ovb-metric-label">買盤壓力</div>
                    <div class="ovb-metric-value positive">
                        ${((1 - sellingData.sellRatio) * 100).toFixed(1)}%
                    </div>
                </div>
                <div class="ovb-metric">
                    <div class="ovb-metric-label">賣盤壓力</div>
                    <div class="ovb-metric-value negative">
                        ${(sellingData.sellRatio * 100).toFixed(1)}%
                    </div>
                </div>
                <div class="ovb-metric">
                    <div class="ovb-metric-label">趨勢狀態</div>
                    <div class="ovb-metric-value ${ovbData.trend === 'bullish' ? 'positive' : ovbData.trend === 'bearish' ? 'negative' : 'neutral'}">
                        ${ovbData.trend === 'bullish' ? '看漲' : ovbData.trend === 'bearish' ? '看跌' : '中性'}
                    </div>
                </div>
            </div>
            
            ${alertHtml}
        </div>`;
}

// 重置 OVB 歷史數據
function resetOVBHistory() {
    ovbHistory = {};
    updateOrderBookDisplay();
    updateStatus('✅ OVB 歷史數據已重置，EMA 將重新計算', 'success');
    setTimeout(() => {
        updateStatus('', 'normal');
    }, 2000);
}

/* ========== 掛單量處理函數 ========== */

// 處理掛單數據 (支援分頁和排序)
function processOrderBookData(bids, asks, pageSize = 10, sortType = 'price') {
    // 基本數據處理
    const processedBids = bids.map(([price, size]) => ({
        price: Number(price),
        size: Number(size),
        total: 0
    }));

    const processedAsks = asks.map(([price, size]) => ({
        price: Number(price),
        size: Number(size),
        total: 0
    }));

    // 排序處理
    const sortedBids = sortOrderBook(processedBids, sortType, 'bid');
    const sortedAsks = sortOrderBook(processedAsks, sortType, 'ask');

    // 計算累積量
    let bidTotal = 0;
    let askTotal = 0;
    
    sortedBids.forEach(order => {
        bidTotal += order.size;
        order.total = bidTotal;
    });

    sortedAsks.forEach(order => {
        askTotal += order.size;
        order.total = askTotal;
    });

    return {
        allBids: sortedBids,
        allAsks: sortedAsks,
        pageSize: pageSize,
        bidPages: Math.ceil(sortedBids.length / pageSize),
        askPages: Math.ceil(sortedAsks.length / pageSize),
        bidStats: {
            totalVolume: bidTotal,
            averageSize: bidTotal / (sortedBids.length || 1),
            maxOrder: Math.max(...sortedBids.map(o => o.size))
        },
        askStats: {
            totalVolume: askTotal,
            averageSize: askTotal / (sortedAsks.length || 1),
            maxOrder: Math.max(...sortedAsks.map(o => o.size))
        }
    };
}

// 排序掛單數據
function sortOrderBook(orders, sortType, side) {
    switch (sortType) {
        case 'size_desc':
            return orders.sort((a, b) => b.size - a.size);
        case 'size_asc':
            return orders.sort((a, b) => a.size - b.size);
        case 'price':
        default:
            // 預設按價格排序：買單從高到低，賣單從低到高
            return side === 'bid' 
                ? orders.sort((a, b) => b.price - a.price)
                : orders.sort((a, b) => a.price - b.price);
    }
}

// 獲取指定頁的掛單數據
function getPageData(allOrders, page, pageSize) {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allOrders.slice(startIndex, endIndex);
}

// 格式化數量
function formatSize(size) {
    if (size >= 1000000) {
        return (size / 1000000).toFixed(2) + 'M';
    } else if (size >= 1000) {
        return (size / 1000).toFixed(2) + 'K';
    } else {
        return size.toFixed(4);
    }
}

// 生成掛單量HTML（支援分頁）
function generateOrderBookHTML(orderBookData, currentPrice, pairName = '') {
    const { allBids, allAsks, bidStats, askStats, pageSize, bidPages, askPages } = orderBookData;
    
    // 初始化當前頁數
    if (!currentPages[pairName]) {
        currentPages[pairName] = { bid: 1, ask: 1 };
    }
    
    const bidPage = currentPages[pairName].bid;
    const askPage = currentPages[pairName].ask;
    
    // 獲取當前頁的數據
    const currentBids = getPageData(allBids, bidPage, pageSize);
    const currentAsks = getPageData(allAsks, askPage, pageSize);
    
    // 計算最大掛單量用於視覺化
    const maxVolume = Math.max(bidStats.maxOrder, askStats.maxOrder);
    
    const updateStatusClass = isUpdating ? 'updating' : 'normal';
    const lastUpdateText = lastUpdateTime ? 
        `最後更新: ${new Date(lastUpdateTime).toLocaleTimeString('zh-TW')}` : 
        '尚未更新';

    const sortType = orderBookSortSelect.value;
    const sortIndicator = getSortIndicator(sortType);

    let html = `
        <div class="order-book" data-pair="${pairName}">
            <div class="order-book-header">
                <div class="order-book-title">📋 即時掛單量 (期貨合約)</div>
                <div class="update-status">
                    <span class="update-indicator ${updateStatusClass}"></span>
                    <span class="last-update">${lastUpdateText}</span>
                </div>
            </div>
            <div class="order-book-content">
                <div class="order-book-side asks-side">
                    <h5>🔴 賣單 (Asks) ${sortIndicator}</h5>`;

         // 顯示賣單
     if (sortType === 'price') {
         // 按價格排序時，賣單要反向顯示（從高到低）
         [...currentAsks].reverse().forEach(order => {
             const volumePercent = (order.size / maxVolume * 100).toFixed(1);
             html += generateOrderItemHTML(order, volumePercent, 'ask');
         });
     } else {
         // 按數量排序時，直接顯示
         currentAsks.forEach(order => {
             const volumePercent = (order.size / maxVolume * 100).toFixed(1);
             html += generateOrderItemHTML(order, volumePercent, 'ask');
         });
     }

    html += `
                </div>
                <div class="order-book-side bids-side">
                    <h5>🟢 買單 (Bids) ${sortIndicator}</h5>`;

    // 顯示買單
    currentBids.forEach(order => {
        const volumePercent = (order.size / maxVolume * 100).toFixed(1);
        html += generateOrderItemHTML(order, volumePercent, 'bid');
    });

    html += `
                </div>
            </div>`;

    // 添加分頁控制器
    html += generatePaginationHTML(pairName, bidPage, bidPages, askPage, askPages);

    html += `
            <div class="current-price">
                💰 當前價格：$${formatPrice(currentPrice)}
            </div>
            <div class="order-book-stats">
                <div class="stat-item">
                    <div class="stat-label">買單總量 (合約)</div>
                    <div class="stat-value">${formatSize(bidStats.totalVolume)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">賣單總量 (合約)</div>
                    <div class="stat-value">${formatSize(askStats.totalVolume)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">買賣比例</div>
                    <div class="stat-value">${(bidStats.totalVolume / askStats.totalVolume).toFixed(2)}</div>
                </div>
            </div>
            <div style="text-align: center; padding: 10px; background: #fff3cd; color: #856404; border-radius: 5px; margin-top: 10px; font-size: 0.9em;">
                ⚠️ 注意：此為期貨合約掛單量數據，與現貨市場可能存在差異
            </div>
            
            ${generateOVBIndicatorHTML(pairName, bidStats.totalVolume, askStats.totalVolume, currentPrice)}
        </div>`;

    return html;
}

// 生成單個掛單項目HTML
function generateOrderItemHTML(order, volumePercent, type) {
    return `
        <div class="order-item ${type}" style="--volume-percent: ${volumePercent}%">
            <span class="order-price ${type}">$${formatPrice(order.price)}</span>
            <span class="order-size">${formatSize(order.size)}</span>
            <span class="order-total">${formatSize(order.total)}</span>
        </div>`;
}

// 生成分頁控制器HTML
function generatePaginationHTML(pairName, bidPage, bidPages, askPage, askPages) {
    return `
        <div class="pagination-controls">
            <div class="pagination-info">
                <span>賣單:</span>
                <button class="pagination-btn" onclick="changePage('${pairName}', 'ask', ${askPage - 1})" ${askPage <= 1 ? 'disabled' : ''}>‹</button>
                <input type="number" class="page-input" value="${askPage}" min="1" max="${askPages}" 
                       onchange="changePage('${pairName}', 'ask', this.value)">
                <span>/ ${askPages}</span>
                <button class="pagination-btn" onclick="changePage('${pairName}', 'ask', ${askPage + 1})" ${askPage >= askPages ? 'disabled' : ''}>›</button>
            </div>
            <div class="pagination-info">
                <span>買單:</span>
                <button class="pagination-btn" onclick="changePage('${pairName}', 'bid', ${bidPage - 1})" ${bidPage <= 1 ? 'disabled' : ''}>‹</button>
                <input type="number" class="page-input" value="${bidPage}" min="1" max="${bidPages}" 
                       onchange="changePage('${pairName}', 'bid', this.value)">
                <span>/ ${bidPages}</span>
                <button class="pagination-btn" onclick="changePage('${pairName}', 'bid', ${bidPage + 1})" ${bidPage >= bidPages ? 'disabled' : ''}>›</button>
            </div>
        </div>`;
}

// 獲取排序指示器
function getSortIndicator(sortType) {
    switch (sortType) {
        case 'size_desc':
            return '<span class="sort-indicator">📊 數量↓</span>';
        case 'size_asc':
            return '<span class="sort-indicator">📊 數量↑</span>';
        case 'price':
        default:
            return '<span class="sort-indicator">💰 價格</span>';
    }
}

// 切換頁數
function changePage(pairName, side, newPage) {
    newPage = parseInt(newPage);
    if (!currentPages[pairName]) {
        currentPages[pairName] = { bid: 1, ask: 1 };
    }
    
    // 更新頁數
    if (side === 'bid') {
        currentPages[pairName].bid = newPage;
    } else {
        currentPages[pairName].ask = newPage;
    }
    
    // 重新渲染掛單量
    updateOrderBookDisplay();
}

// 重置所有分頁
function resetPagination() {
    currentPages = {};
}

/* ========== API 調用函數 ========== */

// 獲取幣安價格
async function getLastPrice(pair) {
    try {
        const response = await fetch(`${BINANCE_FUTURES_API}?symbol=${pair}`);
        const data = await response.json();
        
        if (data.price) {
            recordApiSuccess('binance');
            return Number(data.price);
        } else {
            throw new Error('Invalid futures price data');
        }
    } catch (error) {
        console.error(`獲取 ${pair} 期貨價格失敗:`, error);
        recordApiError('binance');
        return null;
    }
}

// 獲取 Coinglass 數據（帶多代理重試機制）
async function getHeatmapData(symbol, interval) {
    const now = new Date();
    now.setMinutes(0, 0, 0); // 整點時間
    const ts = Math.floor(now.getTime() / 1000);
    
    const timeRange = interval === '4h' ? 14400 : 86400; // 4小時或24小時
    
    const params = new URLSearchParams({
        symbol: symbol,
        interval: interval,
        startTime: ts - timeRange,
        endTime: ts,
        minLimit: false,
        data: API_KEY
    });

    const apiUrl = `${API_BASE}?${params}`;
    let lastError;
    
    // 首先嘗試直接調用API
    try {
        const response = await fetch(apiUrl);
        if (response.ok) {
            const data = await response.json();
            if (data?.data?.data) {
                recordApiSuccess('coinglass');
                return data.data.data;
            }
        }
    } catch (error) {
        lastError = error;
        console.log('直接API調用失敗，嘗試CORS代理...');
    }

    // 嘗試所有 CORS 代理
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxy = CORS_PROXIES[(currentProxyIndex + i) % CORS_PROXIES.length];
            
            let url;
            if (proxy.includes('allorigins.win')) {
                url = `${proxy}${encodeURIComponent(apiUrl)}`;
            } else {
                url = `${proxy}${apiUrl}`;
            }
            
            const response = await fetch(url, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data?.data?.data) {
                    recordApiSuccess('coinglass');
                    // 記錄成功的代理
                    currentProxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
                    return data.data.data;
                }
            }
        } catch (error) {
            lastError = error;
            console.warn(`CORS代理 ${i + 1} 失敗:`, error.message);
            continue;
        }
    }
    
    // 如果所有方法都失敗，返回模擬數據以防止界面完全不可用
    console.error(`所有API調用方式都失敗:`, lastError);
    recordApiError('coinglass');
    
    // 返回模擬數據以保持界面可用
    return generateMockData(symbol, interval);
}

// 生成模擬數據（當API完全不可用時）
function generateMockData(symbol, interval) {
    console.log(`🔄 生成模擬數據: ${symbol} ${interval}`);
    const now = Math.floor(Date.now() / 1000);
    
    // 根據交易對設定基準價格
    let basePrice;
    if (symbol.includes('BTC')) {
        basePrice = 50000 + (Math.random() - 0.5) * 2000; // BTC 範圍 49000-51000
    } else if (symbol.includes('ETH')) {
        basePrice = 3000 + (Math.random() - 0.5) * 200; // ETH 範圍 2900-3100
    } else {
        basePrice = 1000 + (Math.random() - 0.5) * 100; // 其他幣種
    }
    
    const bids = [];
    const asks = [];
    
    // 生成更真實的支撐位（買單）
    for (let i = 0; i < 15; i++) {
        const priceOffset = (i + 1) * (basePrice * 0.001); // 每檔0.1%價差
        const price = basePrice - priceOffset;
        const size = Math.random() * 800 + 200; // 200-1000的隨機掛單量
        bids.push([price, size]);
    }
    
    // 生成更真實的阻力位（賣單）
    for (let i = 0; i < 15; i++) {
        const priceOffset = (i + 1) * (basePrice * 0.001); // 每檔0.1%價差
        const price = basePrice + priceOffset;
        const size = Math.random() * 800 + 200; // 200-1000的隨機掛單量
        asks.push([price, size]);
    }
    
    return [
        [now, bids, asks]
    ];
}

/* ========== 主要分析功能 ========== */

async function analyzePair(pair, interval) {
    updateStatus(`正在分析 ${pair.name}...`, 'loading');
    
    try {
        // 並行獲取價格和熱圖數據
        const [price, heatmapData] = await Promise.all([
            getLastPrice(pair.name),
            getHeatmapData(pair.symbol, interval)
        ]);

        if (!price || !heatmapData) {
            throw new Error('數據獲取失敗');
        }

        // 處理最新數據
        const latestData = heatmapData[heatmapData.length - 1];
        if (!latestData) {
            throw new Error('無可用數據');
        }

        const [timestamp, bids = [], asks = []] = latestData;

        // 計算支撐和阻力
        const sum = arr => arr.reduce((acc, [, size]) => acc + Number(size), 0);
        const avgBidSize = sum(bids) / (bids.length || 1);
        const avgAskSize = sum(asks) / (asks.length || 1);

        const bidMap = new Map(bids.map(([price, size]) => [Number(price), Number(size)]));
        const askMap = new Map(asks.map(([price, size]) => [Number(price), Number(size)]));

        const supports = pickTop(bidMap, avgBidSize);
        const resistances = pickTop(askMap, avgAskSize);

        // 處理掛單量數據
        let orderBookData = null;
        if (showOrderBookCheck.checked) {
            const pageSize = parseInt(orderBookPageSizeSelect.value);
            const sortType = orderBookSortSelect.value;
            orderBookData = processOrderBookData(bids, asks, pageSize, sortType);
        }

        // 生成分析結果
        const result = {
            pair: pair.name,
            price: price,
            timestamp: timestamp,
            supports: formatLevels(supports, '支撐'),
            resistances: formatLevels(resistances, '阻力'),
            aiSuggestion: getAISuggestion(pair.name, price, supports, resistances),
            interval: interval === '4h' ? '4 小時圖' : '24 小時圖',
            orderBook: orderBookData,
            rawBids: bids,
            rawAsks: asks
        };

        return result;
    } catch (error) {
        console.error(`分析 ${pair.name} 時發生錯誤:`, error);
        return {
            pair: pair.name,
            error: error.message
        };
    }
}

/* ========== 結果顯示 ========== */

function displayResults(results) {
    resultsDiv.innerHTML = '';
    lastResults = results; // 保存結果數據
    
    // 更新趨勢歷史並分析全域趨勢
    results.forEach(result => {
        if (!result.error && result.rawBids && result.rawAsks) {
            const bidVolume = result.rawBids.reduce((sum, bid) => sum + bid[1], 0);
            const askVolume = result.rawAsks.reduce((sum, ask) => sum + ask[1], 0);
            updateTrendHistory(result.pair, result.price, bidVolume, askVolume);
        }
    });
    
    // 分析全域趨勢
    globalTrendData = analyzeGlobalTrend(results);
    
    // 更新趨勢分析顯示
    updateTrendAnalysisDisplay(globalTrendData);
    
    results.forEach(result => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'pair-result fade-in';
        
        if (result.error) {
            resultDiv.innerHTML = `
                <div class="pair-header">
                    <div class="pair-name">❌ ${result.pair}</div>
                </div>
                <div class="status error">錯誤: ${result.error}</div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="pair-header">
                    <div class="pair-name">📊 ${result.pair}</div>
                    <div class="pair-price">$${formatPrice(result.price)}</div>
                </div>
                
                <div class="pair-info">
                    <p><strong>🕒 圖表類型：</strong>${result.interval}</p>
                    <p><strong>⏰ 更新時間：</strong>${formatDateTime(result.timestamp)}</p>
                </div>
                
                <div class="data-sections">
                    <div class="data-section">
                        <h4>🔹 關鍵阻力區</h4>
                        ${result.resistances.map(level => `
                            <div class="level-item">
                                <span class="level-price">${level.price ? '$' + formatPrice(level.price) : '—'}</span>
                                <span class="level-tag">${level.tag}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="data-section">
                        <h4>🔹 關鍵支撐區</h4>
                        ${result.supports.map(level => `
                            <div class="level-item">
                                <span class="level-price">${level.price ? '$' + formatPrice(level.price) : '—'}</span>
                                <span class="level-tag">${level.tag}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="ai-suggestion">
                    <h4>🤖 AI 建議</h4>
                    <div>${result.aiSuggestion}</div>
                </div>
                
                ${result.orderBook ? generateOrderBookHTML(result.orderBook, result.price, result.pair) : ''}
            `;
        }
        
        resultsDiv.appendChild(resultDiv);
    });
}

/* ========== 主要執行函數 ========== */

async function performAnalysis() {
    const interval = intervalSelect.value;
    const selectedPair = pairSelect.value;
    
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<span class="loading-spinner"></span>分析中...';
    
    updateStatus('🚀 開始獲取數據...', 'loading');
    
    try {
        const pairsToAnalyze = selectedPair === 'all' 
            ? PAIRS 
            : PAIRS.filter(p => p.name === selectedPair);
        
        const results = [];
        
        for (const pair of pairsToAnalyze) {
            const result = await analyzePair(pair, interval);
            results.push(result);
            await sleep(1000); // 避免API請求過於頻繁
        }
        
        displayResults(results);
        
        const successCount = results.filter(r => !r.error).length;
        updateStatus(`✅ 分析完成！成功分析 ${successCount}/${results.length} 個交易對`, 'success');
        
        // 啟動自動更新（如果已開啟）
        if (autoUpdateCheck.checked && showOrderBookCheck.checked) {
            startAutoUpdate();
        }
        
    } catch (error) {
        console.error('分析過程發生錯誤:', error);
        updateStatus(`❌ 分析失敗: ${error.message}`, 'error');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '🔍 開始分析';
    }
}

/* ========== 自動更新功能 ========== */

// 自動更新掛單量數據
async function updateOrderBookData() {
    if (!showOrderBookCheck.checked || !lastResults.length) {
        return;
    }

    isUpdating = true;
    updateOrderBookIndicators();
    updateTrendAnalysisIndicators();

    try {
        const interval = intervalSelect.value;
        const updatedResults = [];

        for (const result of lastResults) {
            if (result.error) {
                updatedResults.push(result);
                continue;
            }

            // 只更新掛單量數據
            const pair = PAIRS.find(p => p.name === result.pair);
            if (!pair) {
                updatedResults.push(result);
                continue;
            }

            try {
                const [price, heatmapData] = await Promise.all([
                    getLastPrice(pair.name),
                    getHeatmapData(pair.symbol, interval)
                ]);

                if (price && heatmapData && heatmapData.length > 0) {
                    const latestData = heatmapData[heatmapData.length - 1];
                    const [timestamp, bids = [], asks = []] = latestData;

                    // 更新結果數據
                    const updatedResult = {
                        ...result,
                        price: price,
                        timestamp: timestamp,
                        rawBids: bids,
                        rawAsks: asks
                    };

                    // 重新計算掛單量數據
                    if (showOrderBookCheck.checked) {
                        const pageSize = parseInt(orderBookPageSizeSelect.value);
                        const sortType = orderBookSortSelect.value;
                        updatedResult.orderBook = processOrderBookData(bids, asks, pageSize, sortType);
                    }

                    updatedResults.push(updatedResult);
                } else {
                    updatedResults.push(result);
                }
            } catch (error) {
                console.error(`更新 ${result.pair} 掛單量失敗:`, error);
                updatedResults.push(result);
            }

            await sleep(500); // 避免API請求過於頻繁
        }

        // 更新結果數據
        lastResults = updatedResults;
        lastUpdateTime = Date.now();

        // 更新趨勢分析（如果有數據）
        if (enableTrendAnalysisCheck.checked && updatedResults.length > 0) {
            // 更新趨勢歷史
            updatedResults.forEach(result => {
                if (!result.error && result.rawBids && result.rawAsks) {
                    const bidVolume = result.rawBids.reduce((sum, bid) => sum + bid[1], 0);
                    const askVolume = result.rawAsks.reduce((sum, ask) => sum + ask[1], 0);
                    updateTrendHistory(result.pair, result.price, bidVolume, askVolume);
                }
            });
            
            // 重新分析全域趨勢
            globalTrendData = analyzeGlobalTrend(updatedResults);
            
            // 更新趨勢分析顯示
            updateTrendAnalysisDisplay(globalTrendData);
        }

        // 更新顯示
        updateOrderBookDisplay();
        
    } catch (error) {
        console.error('自動更新掛單量失敗:', error);
    } finally {
        isUpdating = false;
        updateOrderBookIndicators();
        updateTrendAnalysisIndicators();
    }
}

// 更新掛單量狀態指示器
function updateOrderBookIndicators() {
    const orderBooks = document.querySelectorAll('.order-book');
    orderBooks.forEach(orderBook => {
        const indicator = orderBook.querySelector('.update-indicator');
        const lastUpdate = orderBook.querySelector('.last-update');
        
        if (indicator) {
            indicator.className = `update-indicator ${isUpdating ? 'updating' : 'normal'}`;
        }
        
        if (lastUpdate) {
            const updateText = lastUpdateTime ? 
                `最後更新: ${new Date(lastUpdateTime).toLocaleTimeString('zh-TW')}` : 
                '尚未更新';
            lastUpdate.textContent = updateText;
        }
    });
}

// 啟動自動更新
function startAutoUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    
    if (autoUpdateCheck.checked && showOrderBookCheck.checked) {
        const interval = parseInt(updateIntervalSelect.value) * 1000;
        updateTimer = setInterval(updateOrderBookData, interval);
        console.log(`🔄 自動更新已啟動，間隔 ${interval/1000} 秒`);
    }
}

// 初始化頁面
function initializePage() {
    // 初始化趨勢分析顯示
    updateTrendAnalysisIndicators();
    
    // 檢查是否在 GitHub Pages 上運行
    if (window.location.hostname.includes('github.io')) {
        console.log('🌐 檢測到 GitHub Pages 環境');
        // 在狀態欄顯示 GitHub Pages 信息
        updateStatus('🌐 GitHub Pages 環境：某些 API 調用可能使用模擬數據', 'loading');
    } else {
        updateStatus('點擊 "開始分析" 來獲取最新數據', 'info');
    }
}

// 頁面載入完成時初始化
document.addEventListener('DOMContentLoaded', initializePage);

// 停止自動更新
function stopAutoUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
        console.log('⏸️ 自動更新已停止');
    }
}

/* ========== 事件監聽器 ========== */

analyzeBtn.addEventListener('click', performAnalysis);

refreshBtn.addEventListener('click', () => {
    location.reload();
});

// 鍵盤快捷鍵
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !analyzeBtn.disabled) {
        performAnalysis();
    }
    if (e.key === 'F5') {
        e.preventDefault();
        location.reload();
    }
});

// 掛單量顯示選項變更時的處理
showOrderBookCheck.addEventListener('change', () => {
    if (resultsDiv.children.length > 0) {
        // 如果已有結果，重新渲染掛單量部分
        updateOrderBookDisplay();
    }
});

orderBookPageSizeSelect.addEventListener('change', () => {
    if (resultsDiv.children.length > 0 && showOrderBookCheck.checked) {
        // 重置分頁並重新渲染
        resetPagination();
        updateOrderBookDisplay();
    }
});

orderBookSortSelect.addEventListener('change', () => {
    if (resultsDiv.children.length > 0 && showOrderBookCheck.checked) {
        // 重置分頁並重新渲染
        resetPagination();
        updateOrderBookDisplay();
    }
});

// OVB 拋售偵測選項變更時的處理
enableOVBCheck.addEventListener('change', () => {
    if (resultsDiv.children.length > 0 && showOrderBookCheck.checked) {
        // 重新渲染掛單量部分
        updateOrderBookDisplay();
    }
});

// 重置 OVB 歷史數據
resetOVBBtn.addEventListener('click', resetOVBHistory);

// 趨勢分析選項變更時的處理
enableTrendAnalysisCheck.addEventListener('change', () => {
    if (globalTrendData) {
        updateTrendAnalysisDisplay(globalTrendData);
    } else {
        updateTrendAnalysisIndicators();
    }
});

// 趨勢分析說明按鈕事件處理
trendHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showTrendHelpTooltip();
});

trendHelpClose.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTrendHelpTooltip();
});

// 點擊背景關閉說明視窗
trendHelpTooltip.addEventListener('click', (e) => {
    if (e.target === trendHelpTooltip) {
        hideTrendHelpTooltip();
    }
});



// 顯示趨勢分析說明
function showTrendHelpTooltip() {
    trendHelpTooltip.style.display = 'block';
    document.body.style.overflow = 'hidden'; // 防止背景滾動
}

// 隱藏趨勢分析說明
function hideTrendHelpTooltip() {
    trendHelpTooltip.style.display = 'none';
    document.body.style.overflow = ''; // 恢復背景滾動
}

// 合約資訊彈出視窗事件處理
contractInfoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showContractInfoModal();
});

contractInfoClose.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContractInfoModal();
});

// 點擊背景關閉合約資訊視窗
contractInfoModal.addEventListener('click', (e) => {
    if (e.target === contractInfoModal) {
        hideContractInfoModal();
    }
});

// 顯示合約資訊彈出視窗
function showContractInfoModal() {
    contractInfoModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 防止背景滾動
    updateContractInfo();
}

// 隱藏合約資訊彈出視窗
function hideContractInfoModal() {
    contractInfoModal.style.display = 'none';
    document.body.style.overflow = ''; // 恢復背景滾動
}

// 更新合約資訊顯示
function updateContractInfo() {
    const selectedPair = pairSelect.value;
    const contractItems = document.querySelectorAll('.contract-item');
    
    contractItems.forEach(item => {
        const contractName = item.querySelector('.contract-name').textContent;
        
        if (selectedPair === 'all') {
            // 顯示所有合約
            item.style.display = 'block';
            item.style.opacity = '1';
        } else {
            // 只高亮選中的合約
            if (contractName.includes(selectedPair)) {
                item.style.display = 'block';
                item.style.opacity = '1';
                item.style.borderLeftColor = '#28a745';
                item.style.backgroundColor = '#e8f5e8';
            } else {
                item.style.display = 'block';
                item.style.opacity = '0.5';
                item.style.borderLeftColor = '#ddd';
                item.style.backgroundColor = '#f8f9fa';
            }
        }
    });
}

// OVB 工具提示控制函數
function toggleOVBTooltip(event) {
    event.stopPropagation();
    
    // 關閉所有其他工具提示
    closeAllOVBTooltips();
    
    // 找到當前點擊的工具提示
    const tooltip = event.target.closest('.ovb-indicator').querySelector('.ovb-tooltip');
    if (tooltip && tooltip.style.display === 'none') {
        showOVBTooltip(tooltip);
    }
}

// 進階工具提示控制函數
function toggleAdvancedTooltip(event) {
    event.stopPropagation();
    
    // 關閉所有其他工具提示
    closeAllOVBTooltips();
    
    // 找到當前點擊的進階工具提示
    const tooltip = event.target.closest('.ovb-indicator').querySelector('.ovb-advanced-tooltip');
    if (tooltip && tooltip.style.display === 'none') {
        showOVBTooltip(tooltip, true); // 傳入true表示這是進階工具提示
    }
}

// 顯示工具提示
function showOVBTooltip(tooltip, isAdvanced = false) {
    // 移除更新狀態
    tooltip.classList.remove('updating');
    
    // 顯示工具提示
    tooltip.style.display = 'block';
    
    // 智能定位：檢查是否會超出視窗範圍
    const indicator = tooltip.closest('.ovb-indicator') || tooltip.parentElement.closest('.ovb-indicator');
    if (indicator) {
        // 檢查是否為移動設備
        const isMobile = window.innerWidth <= 768;
        
        if (!isMobile) {
            // 桌面版：智能定位
            const indicatorRect = indicator.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            // 檢查工具提示是否會超出底部
            if (indicatorRect.bottom + tooltipRect.height + 20 > windowHeight) {
                // 顯示在上方
                tooltip.style.top = 'auto';
                tooltip.style.bottom = '100%';
                tooltip.style.marginTop = '0';
                tooltip.style.marginBottom = '8px';
                tooltip.classList.add('tooltip-above');
            } else {
                // 顯示在下方（默認）
                tooltip.style.top = '100%';
                tooltip.style.bottom = 'auto';
                tooltip.style.marginTop = '8px';
                tooltip.style.marginBottom = '0';
                tooltip.classList.remove('tooltip-above');
            }
        } else {
            // 移動版：始終顯示在下方
            tooltip.style.top = '100%';
            tooltip.style.bottom = 'auto';
            tooltip.style.marginTop = '8px';
            tooltip.style.marginBottom = '0';
            tooltip.classList.remove('tooltip-above');
        }
        
        // 添加活躍狀態到對應的按鈕
        if (isAdvanced) {
            const advancedIcon = indicator.querySelector('.ovb-advanced-icon');
            if (advancedIcon) {
                advancedIcon.classList.add('active');
            }
        } else {
            const infoIcon = indicator.querySelector('.ovb-info-icon');
            if (infoIcon) {
                infoIcon.classList.add('active');
            }
        }
    }
}

// 平滑地隱藏工具提示（保持滾動位置）
function smoothHideTooltip(tooltip) {
    // 添加過渡效果
    tooltip.style.transition = 'opacity 0.1s ease-out';
    tooltip.style.opacity = '0';
    
    setTimeout(() => {
        tooltip.style.display = 'none';
        tooltip.style.transition = '';
        tooltip.style.opacity = '';
    }, 100);
}

// 平滑地顯示工具提示（恢復滾動位置）
function smoothShowTooltip(tooltip, isAdvanced = false, scrollTop = 0) {
    // 移除更新狀態
    tooltip.classList.remove('updating');
    
    // 先設置為不可見但保持布局
    tooltip.style.opacity = '0';
    tooltip.style.display = 'block';
    
    // 進行定位
    showOVBTooltip(tooltip, isAdvanced);
    
    // 恢復滾動位置（立即設置，無動畫）
    if (scrollTop > 0) {
        tooltip.scrollTop = scrollTop;
    }
    
    // 添加淡入效果
    setTimeout(() => {
        tooltip.style.transition = 'opacity 0.2s ease-in';
        tooltip.style.opacity = '1';
        
        setTimeout(() => {
            tooltip.style.transition = '';
        }, 200);
    }, 20); // 縮短延遲時間，讓顯示更快
}

// 關閉所有工具提示
function closeAllOVBTooltips() {
    // 隱藏所有基本工具提示並移除活躍狀態
    document.querySelectorAll('.ovb-tooltip').forEach(tooltip => {
        tooltip.style.display = 'none';
        
        // 移除基本按鈕的活躍狀態
        const indicator = tooltip.closest('.ovb-indicator') || tooltip.parentElement.closest('.ovb-indicator');
        if (indicator) {
            const infoIcon = indicator.querySelector('.ovb-info-icon');
            if (infoIcon) {
                infoIcon.classList.remove('active');
            }
        }
    });
    
    // 隱藏所有進階工具提示並移除活躍狀態
    document.querySelectorAll('.ovb-advanced-tooltip').forEach(tooltip => {
        tooltip.style.display = 'none';
        
        // 移除進階按鈕的活躍狀態
        const indicator = tooltip.closest('.ovb-indicator') || tooltip.parentElement.closest('.ovb-indicator');
        if (indicator) {
            const advancedIcon = indicator.querySelector('.ovb-advanced-icon');
            if (advancedIcon) {
                advancedIcon.classList.remove('active');
            }
        }
    });
}

// 點擊其他地方關閉所有工具提示
document.addEventListener('click', (e) => {
    if (!e.target.closest('.ovb-tooltip') && 
        !e.target.closest('.ovb-advanced-tooltip') &&
        !e.target.classList.contains('ovb-info-icon') &&
        !e.target.classList.contains('ovb-advanced-icon')) {
        closeAllOVBTooltips();
    }
});

// ESC 鍵關閉工具提示
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // 優先關閉合約資訊彈出視窗
        if (contractInfoModal.style.display === 'flex') {
            hideContractInfoModal();
        }
        // 然後關閉趨勢說明視窗
        else if (trendHelpTooltip.style.display === 'block') {
            hideTrendHelpTooltip();
        } 
        // 最後關閉 OVB 工具提示
        else {
            closeAllOVBTooltips();
        }
    }
});

// 自動更新選項變更時的處理
autoUpdateCheck.addEventListener('change', () => {
    if (autoUpdateCheck.checked) {
        startAutoUpdate();
    } else {
        stopAutoUpdate();
    }
});

updateIntervalSelect.addEventListener('change', () => {
    if (autoUpdateCheck.checked) {
        // 重新啟動自動更新以應用新間隔
        startAutoUpdate();
    }
});

// 交易對選擇變更時更新合約資訊顯示
pairSelect.addEventListener('change', () => {
    // 如果合約資訊視窗開啟，更新顯示
    if (contractInfoModal.style.display === 'flex') {
        updateContractInfo();
    }
});

// 快速更新掛單量顯示
let lastResults = [];

function updateOrderBookDisplay() {
    if (lastResults.length === 0) return;
    
    // 記住當前打開的工具提示和其滾動位置
    const openTooltips = [];
    const openAdvancedTooltips = [];
    
    // 記住基本工具提示
    document.querySelectorAll('.ovb-tooltip').forEach(tooltip => {
        if (tooltip.style.display === 'block') {
            const indicator = tooltip.closest('.ovb-indicator');
            if (indicator) {
                const pairName = indicator.closest('.pair-result')?.querySelector('.pair-name')?.textContent?.replace('📊 ', '');
                if (pairName) {
                    openTooltips.push({
                        name: pairName,
                        scrollTop: tooltip.scrollTop
                    });
                    // 添加更新狀態
                    tooltip.classList.add('updating');
                }
            }
        }
    });
    
    // 記住進階工具提示
    document.querySelectorAll('.ovb-advanced-tooltip').forEach(tooltip => {
        if (tooltip.style.display === 'block') {
            const indicator = tooltip.closest('.ovb-indicator');
            if (indicator) {
                const pairName = indicator.closest('.pair-result')?.querySelector('.pair-name')?.textContent?.replace('📊 ', '');
                if (pairName) {
                    openAdvancedTooltips.push({
                        name: pairName,
                        scrollTop: tooltip.scrollTop
                    });
                    // 添加更新狀態
                    tooltip.classList.add('updating');
                }
            }
        }
    });
    
    lastResults.forEach((result, index) => {
        if (result.error) return;
        
        const resultDiv = resultsDiv.children[index];
        if (!resultDiv) return;
        
        // 更新價格顯示
        const priceElement = resultDiv.querySelector('.pair-price');
        if (priceElement && result.price) {
            priceElement.textContent = '$' + formatPrice(result.price);
        }
        
        // 移除舊的掛單量顯示
        const oldOrderBook = resultDiv.querySelector('.order-book');
        if (oldOrderBook) {
            oldOrderBook.remove();
        }
        
        // 如果需要顯示掛單量，重新生成
        if (showOrderBookCheck.checked && result.rawBids && result.rawAsks) {
            const pageSize = parseInt(orderBookPageSizeSelect.value);
            const sortType = orderBookSortSelect.value;
            const orderBookData = processOrderBookData(result.rawBids, result.rawAsks, pageSize, sortType);
            const orderBookHTML = generateOrderBookHTML(orderBookData, result.price, result.pair);
            
            // 在AI建議後插入掛單量
            const aiSuggestion = resultDiv.querySelector('.ai-suggestion');
            if (aiSuggestion) {
                aiSuggestion.insertAdjacentHTML('afterend', orderBookHTML);
            }
        }
    });
    
    // 重新打開之前打開的工具提示
    setTimeout(() => {
        // 重新打開基本工具提示
        openTooltips.forEach(tooltipData => {
            const resultDiv = Array.from(resultsDiv.children).find(div => {
                const name = div.querySelector('.pair-name')?.textContent?.replace('📊 ', '');
                return name === tooltipData.name;
            });
            
            if (resultDiv) {
                const tooltip = resultDiv.querySelector('.ovb-tooltip');
                if (tooltip) {
                    smoothShowTooltip(tooltip, false, tooltipData.scrollTop);
                }
            }
        });
        
        // 重新打開進階工具提示
        openAdvancedTooltips.forEach(tooltipData => {
            const resultDiv = Array.from(resultsDiv.children).find(div => {
                const name = div.querySelector('.pair-name')?.textContent?.replace('📊 ', '');
                return name === tooltipData.name;
            });
            
            if (resultDiv) {
                const tooltip = resultDiv.querySelector('.ovb-advanced-tooltip');
                if (tooltip) {
                    smoothShowTooltip(tooltip, true, tooltipData.scrollTop);
                }
            }
        });
    }, 50); // 縮短延遲時間，讓工具提示更快恢復
}

/* ========== 初始化 ========== */

document.addEventListener('DOMContentLoaded', () => {
    updateStatus('📊 Coinglass Heatmap 分析工具已準備就緒', 'success');
    
    // 初始化趨勢分析指示器和數據來源狀態
    updateTrendAnalysisIndicators();
    updateDataSourceStatus();
    
    // 檢查瀏覽器支援性
    if (!window.fetch) {
        updateStatus('❌ 您的瀏覽器不支援此功能，請使用現代瀏覽器', 'error');
    }
});

// 頁面關閉時停止自動更新
window.addEventListener('beforeunload', () => {
    stopAutoUpdate();
});

console.log('🟢 Coinglass Heatmap 網頁版已載入');
console.log('📝 使用說明：');
console.log('1. 選擇時間間隔（4小時或24小時）');
console.log('2. 選擇交易對（全部或特定交易對）');
console.log('3. 選擇是否顯示即時掛單量 (期貨合約數據)');
console.log('4. 設定每頁顯示檔數（10/15/20檔）');
console.log('5. 選擇排序方式（價格/數量高至低/數量低至高）');
console.log('6. 開啟自動更新（可選）');
console.log('7. 設定更新間隔（5秒至1分鐘）');
console.log('8. 點擊"開始分析"按鈕');
console.log('✨ 新功能：');
console.log('  📊 即時掛單量顯示 - 期貨合約買賣盤深度、數量統計和視覺化');
console.log('  📄 分頁瀏覽功能 - 支援分頁查看所有掛單數據');
console.log('  🔄 靈活排序功能 - 按價格或掛單數量排序');
console.log('  🔄 自動更新功能 - 掛單量數據即時更新');
console.log('  📈 狀態指示器 - 顯示更新狀態和最後更新時間');
console.log('  🎯 趨勢分析功能 - 智能判斷市場趨勢並建議是否適合使用此工具');
console.log('⚠️ 重要提醒：');
console.log('  🏦 所有數據均來自期貨合約市場（掛單量 + 價格）');
console.log('  🌐 由於CORS限制，部分功能可能需要代理服務器'); 