// Coinglass Heatmap 網頁版分析工具

/* ========== 配置常數 ========== */
const API_BASE = 'https://capi.coinglass.com/liquidity-heatmap/api/liquidity/v4/heatmap';
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/'; // CORS 代理
let API_KEY = 'SILRRC6CXIUlotufdglZRUe95rTD9C+pUGhm/uzGGq4='; // 預設token

const PAIRS = [
    { name: 'BTCUSDT', symbol: 'Binance_BTCUSDT#heatmap', tab: 'Binance BTCUSDT' },
    { name: 'ETHUSDT', symbol: 'Binance_ETHUSDT#heatmap', tab: 'Binance ETHUSDT' }
];

const BINANCE_API = 'https://api.binance.com/api/v3/ticker/price';

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
const autoUpdateCheck = document.getElementById('autoUpdate');
const updateIntervalSelect = document.getElementById('updateInterval');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');

/* ========== 自動更新相關變數 ========== */
let updateTimer = null;
let isUpdating = false;
let lastUpdateTime = null;

/* ========== 分頁相關變數 ========== */
let currentPages = {}; // 儲存每個交易對的當前頁數

/* ========== OVB 拋售偵測相關變數 ========== */
let ovbHistory = {}; // 儲存每個交易對的OVB歷史數據
const OVB_HISTORY_LENGTH = 50; // 保留50個數據點
const EMA_PERIOD = 21; // EMA21週期

/* ========== 工具函數 ========== */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 更新狀態顯示
function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
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

// AI 建議生成
function getAISuggestion(pair, price, supList, resList) {
    if (!price || !supList.length || !resList.length) {
        return '📌 資料不足，暫不建議操作。';
    }

    const sup = supList[0].price;
    const res = resList[0].price;
    const step = pair.startsWith('BTC') ? 30 : 15;
    const near = step * 5; // BTC±150、ETH±75

    if (price - sup <= near) {
        const rr = (res - price) / (price - (sup - step * 3));
        return `📈 建議進場：接近支撐 $${formatPrice(sup)} 可掛多單
🎯 止盈目標：$${formatPrice(res)}
🛑 停損設在：$${formatPrice(sup - step * 3)}
✅ RR 倍數：約 ${rr.toFixed(2)} 倍

📌 分批示範：
▶️ $${formatPrice(sup)} / $${formatPrice(sup - step)} / $${formatPrice(sup - step * 2)}`;
    }

    if (res - price <= near) {
        const rr = (price - sup) / ((res + step * 3) - price);
        return `📉 建議進場：接近阻力 $${formatPrice(res)} 可掛空單
🎯 止盈目標：$${formatPrice(sup)}
🛑 停損設在：$${formatPrice(res + step * 3)}
✅ RR 倍數：約 ${rr.toFixed(2)} 倍

📌 分批示範：
▶️ $${formatPrice(res)} / $${formatPrice(res + step)} / $${formatPrice(res + step * 2)}`;
    }

    return `📊 價格位於 $${formatPrice(sup)} – $${formatPrice(res)} 區間中段，RR 不佳，暫不建議進出場。`;
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
                    <span class="ovb-info-icon" title="點擊查看說明" onclick="toggleOVBTooltip(event)">ℹ️</span>
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
        const response = await fetch(`${BINANCE_API}?symbol=${pair}`);
        const data = await response.json();
        return Number(data.price);
    } catch (error) {
        console.error(`獲取 ${pair} 價格失敗:`, error);
        return null;
    }
}

// 獲取 Coinglass 數據
async function getHeatmapData(symbol, interval) {
    try {
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

        // 嘗試直接調用API，如果CORS失敗則使用代理
        let response;
        try {
            response = await fetch(`${API_BASE}?${params}`);
            if (!response.ok) throw new Error('Direct API failed');
        } catch (error) {
            console.log('使用CORS代理...');
            response = await fetch(`${CORS_PROXY}${API_BASE}?${params}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
        }

        const data = await response.json();
        return data?.data?.data;
    } catch (error) {
        console.error(`獲取 ${symbol} 數據失敗:`, error);
        return null;
    }
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

        // 更新顯示
        updateOrderBookDisplay();
        
    } catch (error) {
        console.error('自動更新掛單量失敗:', error);
    } finally {
        isUpdating = false;
        updateOrderBookIndicators();
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

// 顯示工具提示
function showOVBTooltip(tooltip) {
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
        
        // 添加活躍狀態到按鈕
        const infoIcon = indicator.querySelector('.ovb-info-icon');
        if (infoIcon) {
            infoIcon.classList.add('active');
        }
    }
}

// 關閉所有工具提示
function closeAllOVBTooltips() {
    // 隱藏所有工具提示並移除活躍狀態
    document.querySelectorAll('.ovb-tooltip').forEach(tooltip => {
        tooltip.style.display = 'none';
        
        // 移除按鈕的活躍狀態
        const indicator = tooltip.closest('.ovb-indicator') || tooltip.parentElement.closest('.ovb-indicator');
        if (indicator) {
            const infoIcon = indicator.querySelector('.ovb-info-icon');
            if (infoIcon) {
                infoIcon.classList.remove('active');
            }
        }
    });
}

// 點擊其他地方關閉所有工具提示
document.addEventListener('click', (e) => {
    if (!e.target.closest('.ovb-tooltip') && 
        !e.target.classList.contains('ovb-info-icon')) {
        closeAllOVBTooltips();
    }
});

// ESC 鍵關閉工具提示
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllOVBTooltips();
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

// 快速更新掛單量顯示
let lastResults = [];

function updateOrderBookDisplay() {
    if (lastResults.length === 0) return;
    
    // 記住當前打開的工具提示
    const openTooltips = [];
    document.querySelectorAll('.ovb-tooltip').forEach(tooltip => {
        if (tooltip.style.display === 'block') {
            const indicator = tooltip.closest('.ovb-indicator');
            if (indicator) {
                const pairName = indicator.closest('.pair-result')?.querySelector('.pair-name')?.textContent?.replace('📊 ', '');
                if (pairName) {
                    openTooltips.push(pairName);
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
        openTooltips.forEach(pairName => {
            const resultDiv = Array.from(resultsDiv.children).find(div => {
                const name = div.querySelector('.pair-name')?.textContent?.replace('📊 ', '');
                return name === pairName;
            });
            
            if (resultDiv) {
                const tooltip = resultDiv.querySelector('.ovb-tooltip');
                if (tooltip) {
                    showOVBTooltip(tooltip);
                }
            }
        });
    }, 100); // 稍微延遲以確保DOM更新完成
}

/* ========== 初始化 ========== */

document.addEventListener('DOMContentLoaded', () => {
    updateStatus('📊 Coinglass Heatmap 分析工具已準備就緒', 'success');
    
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
console.log('⚠️ 重要提醒：');
console.log('  🏦 掛單量數據來自期貨合約，與現貨市場存在差異');
console.log('  🌐 由於CORS限制，部分功能可能需要代理服務器'); 