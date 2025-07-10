// CORS 代理伺服器 - 解決 Coinglass API 跨域問題
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// 啟用 CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 靜態檔案服務 (可選 - 如果想要同時提供網頁服務)
app.use(express.static('.'));

// Coinglass API 代理
app.use('/api/coinglass', createProxyMiddleware({
    target: 'https://capi.coinglass.com',
    changeOrigin: true,
    pathRewrite: {
        '^/api/coinglass': '', // 移除 /api/coinglass 前綴
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[${new Date().toISOString()}] 代理請求: ${req.method} ${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`[${new Date().toISOString()}] 代理回應: ${proxyRes.statusCode} ${req.url}`);
    },
    onError: (err, req, res) => {
        console.error(`[${new Date().toISOString()}] 代理錯誤:`, err.message);
        res.status(500).json({ error: '代理伺服器錯誤', message: err.message });
    }
}));

// Binance API 代理 (備用)
app.use('/api/binance', createProxyMiddleware({
    target: 'https://api.binance.com',
    changeOrigin: true,
    pathRewrite: {
        '^/api/binance': '', // 移除 /api/binance 前綴
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`[${new Date().toISOString()}] Binance 代理請求: ${req.method} ${req.url}`);
    }
}));

// 健康檢查端點
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'CORS 代理伺服器運行正常'
    });
});

// 首頁重導向
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 錯誤處理
app.use((error, req, res, next) => {
    console.error('伺服器錯誤:', error);
    res.status(500).json({ error: '內部伺服器錯誤' });
});

// 404 處理
app.use((req, res) => {
    res.status(404).json({ error: '找不到請求的資源' });
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log('🚀 CORS 代理伺服器已啟動');
    console.log(`📡 伺服器位址: http://localhost:${PORT}`);
    console.log(`🌐 網頁服務: http://localhost:${PORT}/`);
    console.log(`💊 健康檢查: http://localhost:${PORT}/health`);
    console.log('');
    console.log('📋 API 端點:');
    console.log(`   Coinglass: http://localhost:${PORT}/api/coinglass/...`);
    console.log(`   Binance:   http://localhost:${PORT}/api/binance/...`);
    console.log('');
    console.log('⚙️  使用方法:');
    console.log('   1. 啟動此代理伺服器');
    console.log('   2. 修改 script.js 中的 API_BASE');
    console.log(`   3. 將 API_BASE 改為: http://localhost:${PORT}/api/coinglass/liquidity-heatmap/api/liquidity/v4/heatmap`);
    console.log('');
    console.log('🛑 按 Ctrl+C 停止伺服器');
});

// 優雅關閉
process.on('SIGINT', () => {
    console.log('\n🛑 正在關閉伺服器...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 正在關閉伺服器...');
    process.exit(0);
}); 