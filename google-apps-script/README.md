# Google Apps Script 爬蟲系統

## 📝 檔案說明

- `instagram-scraper-final.gs` - 主要的 Google Apps Script 程式碼

## 🚀 設定步驟

### 1. 建立新的 Google Apps Script 專案
1. 前往 [Google Apps Script](https://script.google.com)
2. 點擊「新增專案」
3. 將 `instagram-scraper-final.gs` 的內容複製到編輯器中
4. 儲存專案並命名為「Instagram Automation System」

### 2. 設定 API 金鑰

執行以下函式來設定 API 金鑰：

```javascript
// 1. 設定 API 金鑰
setupApiKeys()

// 2. 設定 Google Sheets
setupSpreadsheet()

// 3. 檢查設定狀態
checkAllConfiguration()
```

### 3. 更新 Python Bot URL

在程式碼中找到以下行並更新：

```javascript
const pythonBotUrl = 'YOUR_PYTHON_BOT_URL'; // 替換為你的 Zeabur URL
```

例如：
```javascript
const pythonBotUrl = 'https://your-app.zeabur.app';
```

### 4. 設定觸發器

1. 在 Apps Script 編輯器中點擊左側的「觸發器」
2. 點擊「新增觸發器」
3. 設定如下：
   - **執行的函式**: `scheduledRun`
   - **部署作業**: Head
   - **事件來源**: 時間驅動觸發器
   - **時間驅動觸發器類型**: 
     - 每日計時器 (每天執行)
     - 每週計時器 (每週執行)
   - **時間**: 選擇適合的執行時間

## 🎯 主要函式說明

### 核心功能
- `main()` - 主要爬蟲執行函式
- `scheduledRun()` - 定時執行：爬蟲 + 觸發 DM Bot
- `triggerInstagramBot()` - 觸發 Python Instagram Bot

### 測試函式
- `testSingleHashtag()` - 測試單一標籤爬蟲
- `testPythonBotConnection()` - 測試與 Python Bot 的連接
- `testApifyConnection()` - 測試 Apify API 連接

### 設定函式
- `setupApiKeys()` - 設定 API 金鑰
- `setupSpreadsheet()` - 設定 Google Sheets
- `checkAllConfiguration()` - 檢查所有設定狀態

### DM 管理函式
- `getPendingDMList()` - 取得待發送的 DM 列表
- `markHighSimilarityForReview()` - 標記高相似度項目
- `showDMStatistics()` - 顯示 DM 發送統計

### 設定管理函式
- `setNewResultsLimit()` - 設定抓取數量（對話框）
- `setResultsLimitQuick(數字)` - 快速設定抓取數量
- `clearResultsLimit()` - 清除抓取數量設定

## 🔧 設定項目

### 必填設定
1. **Apify API Token** - 用於 Instagram 資料抓取
2. **Gemini API Key** - 用於 AI 內容分析
3. **Google Sheets ID** - 資料儲存位置
4. **Python Bot URL** - Zeabur 部署後的 URL

### 可調整參數

```javascript
// 抓取標籤
const HASHTAGS_TO_SCRAPE = ['新開幕', '試營運', '新店報報'];

// 預設抓取數量
const DEFAULT_RESULTS_LIMIT = 50;

// 最大抓取數量
const MAX_RESULTS_LIMIT = 1000;

// 最大執行時間（毫秒）
const MAX_EXECUTION_TIME = 5.5 * 60 * 1000;
```

## 📊 執行流程

### 手動執行
1. **測試設定**: `checkAllConfiguration()`
2. **執行爬蟲**: `main()`
3. **查看統計**: `showDMStatistics()`
4. **觸發發送**: `triggerInstagramBot()`

### 自動執行
設定觸發器後，系統會：
1. 定時執行爬蟲收集資料
2. AI 分析並標記高相似度項目
3. 等待 30 秒供人工審核
4. 自動觸發 Python Bot 發送 DM
5. 更新發送結果到 Google Sheets

## 🛠️ 故障排除

### API 設定問題
```javascript
// 檢查設定狀態
checkAllConfiguration();

// 重新設定 API 金鑰
setupApiKeys();

// 清除所有設定
clearAllConfiguration();
```

### 連接測試
```javascript
// 測試 Apify 連接
testApifyConnection();

// 測試 Python Bot 連接  
testPythonBotConnection();

// 測試爬蟲功能
testSingleHashtag();
```

### 常見錯誤
- **API Token 無效**: 重新申請並設定 API 金鑰
- **Google Sheets 無法存取**: 檢查工作表權限設定
- **Python Bot 無法連接**: 確認 URL 正確且服務正在運行

## 📝 日誌查看

在 Apps Script 編輯器中：
1. 執行任何函式
2. 點擊「執行」旁邊的「檢視」→「日誌」
3. 查看詳細的執行記錄和錯誤資訊

## ⚠️ 注意事項

1. **執行時間限制**: Google Apps Script 單次執行最多 6 分鐘
2. **API 配額**: 注意 Apify 和 Gemini 的 API 使用量
3. **觸發器限制**: 免費帳戶每日觸發器執行次數有限
4. **錯誤處理**: 程式包含完整錯誤處理，失敗不會影響後續執行