# Instagram DM 自動發送系統

## 系統架構

```
Google Apps Script (爬蟲+定時器) → Google Sheets (資料庫) → HTTP Request → Python Bot (Instagram DM)
```

## 功能特色

- 🕷️ **自動爬蟲**: 定時抓取 Instagram 新開店家資訊
- 🧠 **AI 分析**: 使用 Gemini AI 分析店家資訊和相似度
- ✅ **人工審核**: 透過 Google Sheets 手動審核發送對象
- 🤖 **自動發送**: Python Bot 自動發送個人化 DM
- 📊 **完整追蹤**: 記錄發送狀態和結果
- 🛡️ **安全限制**: 內建發送頻率限制，避免被封鎖

## 安裝步驟

### 1. 設定 Python 環境

```bash
# 1. 複製設定檔
cp .env.example .env

# 2. 編輯 .env 檔案，填入你的 Instagram 帳號密碼
nano .env

# 3. 啟動 Bot
./start_bot.sh
```

### 2. 設定 Google Apps Script

1. 將 `instagram-scraper-final.gs` 內容複製到 Google Apps Script
2. 設定 API 金鑰 (Apify + Gemini)
3. 設定 Google Sheets
4. 在程式碼中更新 `pythonBotUrl` 為你的 Python Bot URL

### 3. 設定觸發器

在 Google Apps Script 中設定時間觸發器：
- **函式**: `scheduledRun`
- **事件來源**: 時間驅動觸發器
- **時間類型**: 每日/每週

## 使用流程

### 手動測試

1. **測試爬蟲**: 執行 `main()` 函式
2. **測試連接**: 執行 `testPythonBotConnection()`
3. **查看統計**: 執行 `showDMStatistics()`

### 人工審核流程

1. 爬蟲執行後，查看 Google Sheets
2. 檢查「相似度 >= 70%」且「發送狀態 = 待審核」的項目
3. 編輯「DM內容」欄位（如需要）
4. 將「發送狀態」改為「發送」
5. Bot 會自動發送並更新狀態

### 自動化流程

設定觸發器執行 `scheduledRun()`:
1. 執行爬蟲收集資料
2. 等待 30 秒供人工審核
3. 自動發送已標記的 DM
4. 更新發送結果到 Google Sheets

## Google Sheets 欄位說明

| 欄位 | 說明 |
|------|------|
| 發現時間 | 貼文發現時間 |
| 來源標籤 | 使用的 hashtag |
| 店家名稱 | AI 識別的店家名稱 |
| 地區 | 店家所在地區 |
| 地址 | 店家地址 |
| 類型 | 店家類型 |
| 聯繫資訊 | 電話、Line 等聯繫方式 |
| IG帳號 | Instagram 用戶名 |
| IG顯示名稱 | Instagram 顯示名稱 |
| IG地標 | Instagram 地標資訊 |
| 名稱相似度 | 店家名稱與 IG 名稱相似度 |
| 貼文網址 | 原始貼文連結 |
| **發送狀態** | 待審核/發送/已發送/發送失敗/不符合 |
| **DM內容** | 要發送的訊息內容 |
| 發送時間 | 實際發送時間 |
| 備註 | 相關備註 |

## 發送狀態說明

- **待審核**: 相似度 >= 70%，等待人工確認
- **發送**: 已通過審核，等待 Bot 發送
- **已發送**: 成功發送
- **發送失敗**: 發送過程中出錯
- **不符合**: 相似度 < 70%，不建議發送

## 安全機制

- **發送限制**: 每日最多 50 個，每小時最多 10 個
- **發送間隔**: 1-3 分鐘隨機間隔
- **人工審核**: 只發送標記為「發送」的項目
- **錯誤處理**: 完整記錄發送結果和錯誤訊息

## 注意事項

1. **Instagram 帳號安全**: 使用專用帳號，避免主帳號被限制
2. **內容合規**: 確保 DM 內容符合 Instagram 社群守則
3. **發送頻率**: 遵守內建限制，避免被標記為垃圾訊息
4. **定期檢查**: 監控發送結果和帳號狀態

## 故障排除

### Python Bot 無法啟動
- 檢查 Chrome 和 ChromeDriver 是否安裝
- 確認 .env 檔案設定正確
- 查看終端機錯誤訊息

### 無法登入 Instagram
- 檢查帳號密碼是否正確
- 嘗試手動登入確認帳號狀態
- 檢查是否需要雙重驗證

### Google Apps Script 無法連接 Python Bot
- 確認 Python Bot 正在運行
- 檢查防火牆設定
- 更新 `pythonBotUrl` 為正確的 URL

## API 端點

- `POST /test` - 測試連接
- `POST /send_dms` - 發送 DM
- `GET /status` - 取得 Bot 狀態

## 技術支援

如有問題，請檢查：
1. 系統日誌
2. Google Apps Script 執行記錄
3. Google Sheets 狀態欄位