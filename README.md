# Instagram Automation System 🤖

自動化 Instagram 店家開發與 DM 行銷系統

## 🎯 系統概述

這是一個完整的 Instagram 自動化行銷系統，結合了 AI 驅動的資料收集和智能 DM 發送功能。

### 系統架構

```
Google Apps Script (爬蟲+定時器) → Google Sheets (資料庫) → HTTP API → Python Bot (Instagram DM)
```

## ✨ 主要功能

- 🕷️ **智能爬蟲**: 自動抓取 Instagram 新開店家資訊
- 🧠 **AI 分析**: Gemini AI 分析店家資訊和名稱相似度
- ✅ **人工審核**: 透過 Google Sheets 手動控制發送對象
- 🤖 **自動發送**: Python Bot 自動發送個人化 DM
- 📊 **完整追蹤**: 記錄發送狀態和結果統計
- 🛡️ **安全機制**: 內建發送頻率限制，避免帳號風險

## 📂 專案結構

```
instagram-automation-system/
├── google-apps-script/           # Google Apps Script 爬蟲
│   └── instagram-scraper-final.gs
├── instagram-bot/                # Python Instagram Bot
│   ├── app.py                   # Zeabur 優化版本
│   ├── instagram_bot.py         # 本地開發版本
│   ├── requirements.txt         # Python 依賴
│   ├── Dockerfile              # Docker 容器配置
│   ├── zeabur.json             # Zeabur 部署配置
│   ├── railway.json            # Railway 部署配置
│   └── .env.example            # 環境變數範例
└── docs/                        # 文檔
    └── README.md               # 詳細使用說明
```

## 🚀 快速開始

### 1. 部署 Python Bot 到 Zeabur

1. **Fork 此專案到你的 GitHub**

2. **連接 Zeabur**:
   - 前往 [Zeabur](https://zeabur.com)
   - 連接你的 GitHub repository
   - 選擇 `instagram-bot` 資料夾部署

3. **設定環境變數**:
   ```env
   INSTAGRAM_USERNAME=你的Instagram帳號
   INSTAGRAM_PASSWORD=你的Instagram密碼
   DAILY_LIMIT=50
   HOURLY_LIMIT=10
   MIN_INTERVAL=60
   MAX_INTERVAL=180
   ```

4. **取得部署 URL**:
   部署完成後會得到類似 `https://your-app.zeabur.app` 的 URL

### 2. 設定 Google Apps Script

1. **建立新的 Google Apps Script 專案**

2. **複製程式碼**:
   將 `google-apps-script/instagram-scraper-final.gs` 內容複製到專案中

3. **設定 API 金鑰**:
   - Apify API Token
   - Gemini API Key

4. **更新 Python Bot URL**:
   ```javascript
   const pythonBotUrl = 'https://your-app.zeabur.app'; // 替換為你的實際 URL
   ```

5. **設定觸發器**:
   - 函式: `scheduledRun`
   - 事件來源: 時間驅動觸發器
   - 執行頻率: 每日/每週

### 3. 測試系統

1. **測試 Python Bot**:
   ```bash
   curl -X POST https://your-app.zeabur.app/test \
     -H "Content-Type: application/json" \
     -d '{"action":"test","message":"Hello"}'
   ```

2. **測試 Apps Script**:
   - 執行 `testPythonBotConnection()` 測試連接
   - 執行 `main()` 測試爬蟲功能

## 📋 工作流程

1. **自動爬蟲**: Apps Script 定時執行，抓取新開店家資訊
2. **AI 分析**: 使用 Gemini 分析店家資訊，計算相似度
3. **自動標記**: 相似度 ≥ 70% 的項目標記為「待審核」
4. **人工審核**: 在 Google Sheets 中審核並標記「發送」
5. **自動發送**: Python Bot 自動發送 DM 並更新狀態
6. **結果追蹤**: 完整記錄發送結果和統計資訊

## 📊 Google Sheets 欄位說明

| 欄位 | 說明 |
|------|------|
| 發送狀態 | `待審核`/`發送`/`已發送`/`發送失敗`/`不符合` |
| DM內容 | 自動生成的個人化訊息（可編輯） |
| 名稱相似度 | 店家名稱與 IG 帳號的相似度百分比 |
| 發送時間 | 實際發送時間記錄 |
| 備註 | 發送結果和錯誤訊息 |

## 🛡️ 安全機制

- **發送限制**: 每日最多 50 個，每小時最多 10 個
- **隨機間隔**: 1-3 分鐘隨機等待時間
- **人工審核**: 只發送手動標記的項目
- **錯誤處理**: 完整的錯誤記錄和重試機制
- **帳號保護**: 專為避免 Instagram 限制而設計

## 🔧 API 端點

- `GET /` - 服務狀態
- `GET /health` - 健康檢查
- `POST /test` - 連接測試
- `POST /send_dms` - 發送 DM
- `GET /status` - Bot 狀態查詢

## 📚 詳細文檔

更多詳細說明請參考 `docs/README.md`

## 🤝 貢獻

歡迎提交 Issues 和 Pull Requests！

## ⚠️ 免責聲明

請遵守 Instagram 服務條款和相關法規。此工具僅供學習和合法商業用途。

## 📄 授權

MIT License

---

**需要支援？** 請查看 Issues 或建立新的 Issue。