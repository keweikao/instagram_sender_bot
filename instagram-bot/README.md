# Instagram DM Bot

Python 版本的 Instagram DM 自動發送機器人，支援雲端部署。

## 🚀 雲端部署

### Zeabur 部署（推薦）

1. **連接 GitHub Repository**:
   - 前往 [Zeabur](https://zeabur.com)
   - 連接你的 GitHub repository
   - 選擇 `instagram-bot` 資料夾

2. **設定環境變數**:
   ```env
   INSTAGRAM_USERNAME=你的Instagram帳號
   INSTAGRAM_PASSWORD=你的Instagram密碼
   DAILY_LIMIT=50
   HOURLY_LIMIT=10
   MIN_INTERVAL=60
   MAX_INTERVAL=180
   ```

3. **部署設定**:
   - Zeabur 會自動偵測 `zeabur.json`
   - 使用 `app.py` 作為主程式
   - 自動安裝 Chrome 和相依套件

### Railway 部署

1. **連接 Railway**:
   - 前往 [Railway](https://railway.app)
   - 連接 GitHub repository

2. **設定相同的環境變數**

3. **部署**:
   - Railway 會讀取 `railway.json` 配置
   - 自動使用 Dockerfile 建構

## 💻 本地開發

### 環境需求
- Python 3.11+
- Google Chrome
- ChromeDriver

### 安裝步驟

1. **複製環境變數檔**:
   ```bash
   cp .env.example .env
   ```

2. **編輯 .env 檔案**:
   ```env
   INSTAGRAM_USERNAME=你的Instagram帳號
   INSTAGRAM_PASSWORD=你的Instagram密碼
   DAILY_LIMIT=50
   HOURLY_LIMIT=10
   MIN_INTERVAL=60
   MAX_INTERVAL=180
   ```

3. **安裝相依套件**:
   ```bash
   pip install -r requirements.txt
   ```

4. **安裝 ChromeDriver**:
   ```bash
   # macOS (使用 Homebrew)
   brew install chromedriver
   
   # 或手動下載
   # https://chromedriver.chromium.org/
   ```

5. **啟動服務**:
   ```bash
   python instagram_bot.py  # 本地版本
   python app.py           # Zeabur 版本
   ```

## 📡 API 端點

### GET /
服務狀態檢查
```json
{
  "service": "Instagram DM Bot",
  "status": "running",
  "version": "1.0.0"
}
```

### GET /health
健康檢查
```json
{
  "status": "healthy",
  "bot_initialized": true,
  "logged_in": true
}
```

### POST /test
連接測試
```bash
curl -X POST https://your-app.zeabur.app/test \
  -H "Content-Type: application/json" \
  -d '{"action":"test","message":"Hello"}'
```

### POST /send_dms
發送 DM（由 Google Apps Script 呼叫）
```json
{
  "action": "send_dms",
  "data": [
    {
      "rowIndex": 2,
      "igUsername": "test_user",
      "storeName": "測試餐廳",
      "dmContent": "您好！恭喜新開幕...",
      "district": "台北市",
      "specialty": "餐廳"
    }
  ]
}
```

### GET /status
Bot 狀態查詢
```json
{
  "bot_initialized": true,
  "logged_in": true,
  "daily_sent": 5,
  "hourly_sent": 2,
  "daily_limit": 50,
  "hourly_limit": 10
}
```

## 🔧 設定說明

### 發送限制設定
```env
DAILY_LIMIT=50      # 每日最多發送 50 個 DM
HOURLY_LIMIT=10     # 每小時最多發送 10 個 DM
MIN_INTERVAL=60     # 最小間隔 60 秒
MAX_INTERVAL=180    # 最大間隔 180 秒
```

### Instagram 帳號設定
```env
INSTAGRAM_USERNAME=your_username    # Instagram 帳號
INSTAGRAM_PASSWORD=your_password    # Instagram 密碼
```

**重要提醒**:
- 建議使用專用的 Instagram 帳號
- 不要使用個人主帳號
- 確保帳號沒有開啟雙重驗證（2FA）

## 🛡️ 安全機制

### 發送限制
- **每日限制**: 最多 50 個 DM
- **每小時限制**: 最多 10 個 DM
- **隨機間隔**: 60-180 秒隨機等待
- **自動重置**: 每小時自動重置計數器

### 錯誤處理
- 自動重試機制
- 詳細錯誤記錄
- 狀態追蹤和回報
- 瀏覽器會話管理

### 反偵測機制
- 隨機 User-Agent
- 隨機等待時間
- 模擬人類操作
- 避免頻繁請求

## 🐛 故障排除

### 常見問題

1. **無法登入 Instagram**
   - 檢查帳號密碼是否正確
   - 確認帳號未被限制
   - 檢查是否有雙重驗證

2. **ChromeDriver 錯誤**
   - 確認 Chrome 瀏覽器已安裝
   - 更新 ChromeDriver 版本
   - 檢查路徑設定

3. **發送失敗**
   - 檢查目標用戶是否存在
   - 確認未達發送限制
   - 查看詳細錯誤日誌

### 日誌查看

**本地開發**:
```bash
# 查看即時日誌
python app.py
```

**雲端部署**:
- Zeabur: 在控制台查看「日誌」標籤
- Railway: 在部署頁面查看「Logs」

### 除錯模式

修改 `app.py`:
```python
# 啟用除錯模式
app.run(debug=True)

# 顯示瀏覽器視窗（本地測試）
chrome_options.add_argument('--headless')  # 註解此行
```

## 📊 監控和統計

### 狀態監控
```bash
# 檢查 Bot 狀態
curl https://your-app.zeabur.app/status
```

### 發送統計
- 每日發送數量
- 每小時發送數量
- 成功/失敗比率
- 錯誤類型統計

## 🔄 更新部署

### 自動部署
推送到 GitHub 後，Zeabur 和 Railway 會自動重新部署。

### 手動重啟
在雲端平台的控制台中點擊「重新啟動」。

## 📝 開發筆記

### 檔案結構
- `app.py` - Zeabur 優化版本（推薦用於生產環境）
- `instagram_bot.py` - 本地開發版本
- `Dockerfile` - Docker 容器配置
- `requirements.txt` - Python 依賴清單

### 主要差異
- `app.py` 針對雲端環境優化
- 更好的錯誤處理和日誌記錄
- 支援環境變數配置
- 適合 Serverless 部署

## ⚠️ 注意事項

1. **Instagram 政策**: 遵守 Instagram 服務條款
2. **發送頻率**: 不要超過建議的發送限制
3. **內容合規**: 確保 DM 內容不違反社群規範
4. **帳號安全**: 定期檢查帳號狀態
5. **資源使用**: 注意雲端平台的資源限制