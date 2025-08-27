/**
 * Instagram 店家資訊爬蟲系統
 * 最終正確版本 - 修正 Actor ID 格式
 */

// ================== 基本設定 ==================
const APIFY_ACTOR_ID = 'apify~instagram-hashtag-scraper';  // 正確格式：用 ~ 不是 /
const SHEET_NAME = 'Instagram_Leads';
const HASHTAGS_TO_SCRAPE = ['新開幕', '試營運', '新店報報'];
const DEFAULT_RESULTS_LIMIT = 50;
const MAX_RESULTS_LIMIT = 1000;
const MAX_EXECUTION_TIME = 5.5 * 60 * 1000;

/**
 * 主函式 - 程式進入點
 */
function main() {
  const startTime = new Date().getTime();
  Logger.log('=== Instagram 店家爬蟲開始執行 ===');
  
  // 檢查並自動設定 API（如果未設定會跳出對話框）
  if (!validateApiConfiguration()) {
    Logger.log('API 設定不完整，程式結束');
    return;
  }
  
  // 自動模式：使用已儲存的設定或預設值
  const resultsLimit = getAutomatedResultsLimit();
  
  // 取得並自動設定 Google Sheets（如果未設定會跳出對話框）
  const spreadsheet = getConfiguredSpreadsheet();
  if (!spreadsheet) {
    Logger.log('無法取得或設定工作表，程式結束');
    return;
  }
  
  Logger.log(`本次執行將抓取每個標籤最多 ${resultsLimit} 篇貼文`);
  Logger.log(`資料將儲存到: ${spreadsheet.getName()}`);
  
  // 初始化統計
  const stats = {
    totalPosts: 0,
    newStores: 0,
    errors: 0,
    duplicates: 0,
    oldPosts: 0,
    nonFoodBusiness: 0,
    duplicateAccounts: 0, // 新增：重複帳號貼文數
    resultsLimit: resultsLimit,
    spreadsheet: spreadsheet
  };
  
  try {
    // 確保工作表存在
    initializeSheet(spreadsheet);
    
    for (const hashtag of HASHTAGS_TO_SCRAPE) {
      // 檢查執行時間
      if (new Date().getTime() - startTime > MAX_EXECUTION_TIME) {
        Logger.log('接近執行時間限制，提前結束');
        break;
      }
      
      Logger.log(`開始處理 #${hashtag}`);
      processHashtag(hashtag, stats, resultsLimit);
    }
    
  } catch (error) {
    Logger.log(`主程式執行錯誤: ${error.toString()}`);
    stats.errors++;
  }
  
  // 輸出統計結果
  logFinalStats(stats);
  Logger.log('=== 執行完成 ===');
}

/**
 * 處理單個 hashtag
 */
function processHashtag(hashtag, stats, resultsLimit) {
  try {
    const posts = fetchPostsFromApify(hashtag, resultsLimit);
    Logger.log(`從 #${hashtag} 抓取到 ${posts.length} 篇貼文`);
    stats.totalPosts += posts.length;
    
    // 先進行帳號去重處理
    const uniquePosts = filterUniqueAccountPosts(posts);
    const removedDuplicates = posts.length - uniquePosts.length;
    stats.duplicateAccounts += removedDuplicates;
    Logger.log(`帳號去重後剩餘: ${uniquePosts.length} 篇貼文 (已移除 ${removedDuplicates} 篇重複帳號貼文)`);
    
    for (const post of uniquePosts) {
      if (!post.caption || post.caption.trim().length === 0) {
        continue;
      }
      
      // 檢查是否為重複貼文
      if (isDuplicatePost(post.url, stats.spreadsheet)) {
        Logger.log(`跳過重複貼文: ${post.url}`);
        stats.duplicates++;
        continue;
      }
      
      // 檢查發文時間是否在3個月內
      if (!isPostWithinTimeLimit(post.timestamp)) {
        Logger.log(`跳過過舊貼文: ${post.timestamp} (超過3個月)`);
        stats.oldPosts++;
        continue;
      }
      
      // 提取位置資訊作為額外參考
      const locationInfo = post.locationName || post.location || post.place || '';
      const analysisResult = analyzeCaptionWithGemini(post.caption, locationInfo);
      
      if (analysisResult && 
          analysisResult.is_newly_opened_store === true && 
          analysisResult.is_food_business === true) {
        Logger.log(`發現新餐飲店家: ${analysisResult.store_name} (${analysisResult.specialty}) - 帳號: ${post.ownerUsername}`);
        
        const rowData = buildRowData(post, analysisResult, hashtag);
        writeToSheet(rowData, stats.spreadsheet);
        stats.newStores++;
      } else if (analysisResult) {
        // 記錄被篩選掉的原因
        let reason = '';
        if (!analysisResult.is_newly_opened_store) reason += '非新店';
        if (!analysisResult.is_food_business) {
          reason += (reason ? '且' : '') + '非餐飲業';
          stats.nonFoodBusiness++;
        }
        Logger.log(`跳過店家: ${analysisResult.store_name || '未知'} - 原因: ${reason}`);
      }
      
      // 防止 API 請求過於頻繁
      Utilities.sleep(500);
    }
    
  } catch (error) {
    Logger.log(`處理 #${hashtag} 時發生錯誤: ${error.toString()}`);
    stats.errors++;
  }
}

/**
 * 從 Apify 抓取貼文 - 使用正確的同步 API
 */
function fetchPostsFromApify(hashtag, resultsLimit) {
  const apiToken = getApiToken('APIFY_API_TOKEN');
  
  // 使用正確的同步端點格式
  const syncUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;
  
  // Actor 的輸入參數
  const inputData = {
    hashtags: [hashtag],
    resultsLimit: resultsLimit || DEFAULT_RESULTS_LIMIT
  };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(inputData),
    muteHttpExceptions: true,
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  };
  
  try {
    Logger.log(`正在同步執行 Apify Instagram Hashtag Scraper...`);
    Logger.log(`目標標籤: #${hashtag}, 抓取數量: ${resultsLimit}`);
    
    const response = UrlFetchApp.fetch(syncUrl, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`API 回應狀態碼: ${statusCode}`);
    
    if (statusCode === 408) {
      Logger.log('請求超時 (5分鐘)，Actor 執行時間過長');
      return [];
    } else if (statusCode === 401) {
      Logger.log('認證失敗，請檢查 Apify API Token 是否正確');
      return [];
    } else if (statusCode === 404) {
      Logger.log(`找不到 Actor: ${APIFY_ACTOR_ID}，請檢查 Actor ID 是否正確`);
      return [];
    } else if (statusCode !== 200 && statusCode !== 201) {
      Logger.log(`API 請求失敗，回應內容: ${responseText}`);
      throw new Error(`Apify API 請求失敗，狀態碼: ${statusCode}`);
    }
    
    const results = JSON.parse(responseText);
    Logger.log(`成功取得 ${results.length} 筆資料`);
    
    // 記錄第一筆資料的結構以便除錯
    if (results.length > 0) {
      Logger.log(`第一筆資料範例: ${JSON.stringify(results[0], null, 2).substring(0, 500)}...`);
    }
    
    return Array.isArray(results) ? results : [];
    
  } catch (error) {
    Logger.log(`Apify API 請求錯誤: ${error.toString()}`);
    return [];
  }
}

/**
 * 取得已設定的 Google Sheets（如果未設定會自動跳出對話框）
 */
function getConfiguredSpreadsheet() {
  try {
    const properties = PropertiesService.getScriptProperties();
    let savedSpreadsheetId = properties.getProperty('SPREADSHEET_ID');
    
    if (!savedSpreadsheetId) {
      Logger.log('尚未設定試算表 ID，跳出設定對話框');
      savedSpreadsheetId = promptForSpreadsheetId();
      if (!savedSpreadsheetId) {
        Logger.log('未設定試算表 ID，無法執行');
        return null;
      }
      properties.setProperty('SPREADSHEET_ID', savedSpreadsheetId);
      Logger.log('Google Sheets ID 設定完成');
    }
    
    try {
      const spreadsheet = SpreadsheetApp.openById(savedSpreadsheetId);
      Logger.log(`使用已設定的試算表: ${spreadsheet.getName()}`);
      return spreadsheet;
    } catch (error) {
      Logger.log(`無法開啟已設定的試算表 (ID: ${savedSpreadsheetId})，可能已被刪除或無權限`);
      // 清除無效的設定並重新詢問
      properties.deleteProperty('SPREADSHEET_ID');
      Logger.log('已清除無效的試算表設定，請重新執行');
      return null;
    }
    
  } catch (error) {
    Logger.log(`取得試算表設定時發生錯誤: ${error.toString()}`);
    return null;
  }
}

/**
 * 提示使用者輸入 Google Sheets ID 或 URL
 */
function promptForSpreadsheetId() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt(
      '設定 Google Sheets',
      '請輸入 Google Sheets 的完整網址或試算表 ID：\n\n範例:\nhttps://docs.google.com/spreadsheets/d/1ABC...XYZ/edit\n或直接輸入試算表 ID\n\n留空將建立新的試算表:',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() !== ui.Button.OK) {
      return null;
    }
    
    const input = response.getResponseText().trim();
    
    if (!input) {
      // 建立新試算表
      const newSpreadsheet = SpreadsheetApp.create('Instagram 店家爬蟲資料');
      const spreadsheetId = newSpreadsheet.getId();
      
      Logger.log(`已建立新試算表: ${newSpreadsheet.getName()}`);
      Logger.log(`試算表網址: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
      
      // 初始化工作表
      initializeSheet(newSpreadsheet);
      
      ui.alert(
        '試算表已建立',
        `新試算表已建立並設定完成！\n\n試算表名稱: ${newSpreadsheet.getName()}\n網址: https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        ui.ButtonSet.OK
      );
      
      return spreadsheetId;
    }
    
    // 解析輸入的網址或 ID
    let spreadsheetId = input;
    if (input.includes('docs.google.com/spreadsheets/d/')) {
      const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        spreadsheetId = match[1];
      }
    }
    
    // 驗證試算表是否可以開啟
    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      Logger.log(`已設定試算表: ${spreadsheet.getName()}`);
      
      // 初始化工作表
      initializeSheet(spreadsheet);
      
      return spreadsheetId;
    } catch (error) {
      ui.alert('錯誤', '無法開啟指定的試算表，請檢查網址或 ID 是否正確', ui.ButtonSet.OK);
      return null;
    }
    
  } catch (error) {
    Logger.log(`設定試算表時發生錯誤: ${error.toString()}`);
    return null;
  }
}

/**
 * 設定要使用的試算表 (一次性設定)
 */
function setupSpreadsheet() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    const response = ui.prompt(
      '設定儲存試算表',
      '請輸入 Google Sheets 的完整網址或試算表 ID：\n（留空則建立新的試算表）',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() !== ui.Button.OK) {
      Logger.log('使用者取消設定試算表');
      return;
    }
    
    const input = response.getResponseText().trim();
    
    if (!input) {
      // 建立新試算表
      const newSpreadsheet = SpreadsheetApp.create('Instagram 店家爬蟲資料');
      const spreadsheetId = newSpreadsheet.getId();
      
      // 儲存設定
      const properties = PropertiesService.getScriptProperties();
      properties.setProperty('SPREADSHEET_ID', spreadsheetId);
      
      Logger.log(`已建立並設定新試算表: ${newSpreadsheet.getName()}`);
      Logger.log(`試算表網址: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
      
      // 初始化工作表
      initializeSheet(newSpreadsheet);
      
      return;
    }
    
    // 解析輸入的網址或 ID
    let spreadsheetId = input;
    if (input.includes('docs.google.com/spreadsheets/d/')) {
      const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        spreadsheetId = match[1];
      }
    }
    
    // 嘗試開啟試算表
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    // 儲存設定
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty('SPREADSHEET_ID', spreadsheetId);
    
    Logger.log(`已設定試算表: ${spreadsheet.getName()}`);
    Logger.log(`試算表網址: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
    
    // 初始化工作表
    initializeSheet(spreadsheet);
    
  } catch (error) {
    Logger.log(`設定試算表時發生錯誤: ${error.toString()}`);
    SpreadsheetApp.getUi().alert('錯誤', '無法開啟指定的試算表，請檢查網址或 ID 是否正確', SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * 使用 Gemini 分析貼文內容
 */
function analyzeCaptionWithGemini(caption, locationInfo = '') {
  const apiKey = getApiKey('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
  
  const prompt = buildAnalysisPrompt(caption, locationInfo);
  
  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1000
    }
  };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    
    if (statusCode !== 200) {
      Logger.log(`Gemini API 錯誤回應: ${response.getContentText()}`);
      throw new Error(`Gemini API 請求失敗，狀態碼: ${statusCode}`);
    }
    
    const jsonResponse = JSON.parse(response.getContentText());
    
    if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) {
      Logger.log('Gemini 沒有返回有效結果');
      return null;
    }
    
    const analysisText = jsonResponse.candidates[0].content.parts[0].text;
    return parseGeminiResponse(analysisText);
    
  } catch (error) {
    Logger.log(`Gemini 分析失敗: ${error.toString()}`);
    return null;
  }
}

/**
 * 建立分析提示詞
 */
function buildAnalysisPrompt(caption, locationInfo = '') {
  const locationText = locationInfo ? `\n地標資訊: "${locationInfo}"` : '';
  
  return `你是商業情報分析師，專門識別新開幕的餐飲店家。請分析以下貼文內容：

貼文內容: "${caption}"${locationText}

請嚴格按照以下 JSON 格式回應，不要包含任何其他文字：
{
  "is_newly_opened_store": boolean,
  "is_food_business": boolean,
  "store_name": "店家名稱或N/A",
  "district": "縣市區域或N/A", 
  "address": "詳細地址或N/A",
  "specialty": "店家類型或N/A",
  "contact_info": "聯繫資訊（電話、訂位網址、Line ID、官方帳號等）或N/A"
}

判斷標準：
1. 店家名稱識別：
   - 優先從貼文內容中尋找店家名稱
   - 如果貼文內容沒有明確的店家名稱，可以使用地標資訊作為店家名稱
   - 地標資訊通常是店家的實際名稱（如："老虎城購物中心"、"鼎王麻辣鍋"等）
   - 如果地標資訊看起來像商店名稱，請優先使用它作為 store_name

2. 地區限制：
   - 只接受台灣地區的店家（台北、新北、桃園、台中、台南、高雄等台灣縣市）
   - 如果是海外地區（日本、韓國、美國、歐洲等），請將所有判定設為 false

3. 新開幕判定：
   - 明確提及"新開幕"、"試營運"、"新店"、"開幕"、"開業"等關鍵字
   - 如果只是一般營業貼文，is_newly_opened_store 請設為 false

4. 餐飲業判定 (is_food_business)：
   - 必須是餐飲相關業務才設為 true
   - 包括：餐廳、咖啡廳、飲料店、小吃攤、烘焙坊、甜點店、火鍋店、燒烤店、日料店、中式料理、西式料理、速食店、早餐店、夜市攤販等
   - 排除：服飾店、美容店、書店、3C店、家具店、健身房等非餐飲業

5. 聯繫資訊：
   - 電話號碼、訂位網址、Line ID、官方社群帳號、預約連結等
   - 多個聯繫方式用 "；" 分隔

重要：只有同時符合台灣地區 + is_newly_opened_store=true + is_food_business=true 的店家才是目標！`;
}

/**
 * 解析 Gemini 回應
 */
function parseGeminiResponse(text) {
  try {
    // 清理可能的 markdown 標記
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 嘗試找到 JSON 部分
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // 如果沒有找到，嘗試直接解析
    return JSON.parse(cleanText);
    
  } catch (error) {
    Logger.log(`解析 Gemini 回應失敗: ${error.toString()}`);
    Logger.log(`原始回應: ${text}`);
    return null;
  }
}

/**
 * 檢查是否為重複貼文
 */
function isDuplicatePost(url, spreadsheet) {
  if (!url) return false;
  
  try {
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) return false;
    
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) return false; // 只有標題行
    
    const urlColumn = 12; // 第12欄是貼文網址
    const urls = sheet.getRange(2, urlColumn, lastRow - 1, 1).getValues();
    
    return urls.some(row => row[0] === url);
    
  } catch (error) {
    Logger.log(`檢查重複貼文時發生錯誤: ${error.toString()}`);
    return false;
  }
}

/**
 * 計算兩個字串的相似度 (使用簡單的字元比對)
 * 返回 0-100 的相似度百分比
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // 統一轉換為小寫並移除特殊字元
  const clean1 = str1.toLowerCase().replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
  const clean2 = str2.toLowerCase().replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
  
  if (clean1 === clean2) return 100;
  if (clean1.length === 0 || clean2.length === 0) return 0;
  
  // 檢查子字串包含關係
  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    const minLength = Math.min(clean1.length, clean2.length);
    const maxLength = Math.max(clean1.length, clean2.length);
    return Math.round((minLength / maxLength) * 100);
  }
  
  // 計算共同字元數量
  const chars1 = clean1.split('');
  const chars2 = clean2.split('');
  let commonChars = 0;
  
  chars1.forEach(char => {
    if (chars2.includes(char)) {
      commonChars++;
    }
  });
  
  // 計算相似度百分比
  const similarity = (commonChars * 2) / (chars1.length + chars2.length) * 100;
  return Math.round(similarity);
}

/**
 * 建立要寫入工作表的資料
 */
function buildRowData(post, analysisResult, hashtag) {
  // 取得 IG 顯示名稱 (可能的欄位名稱: ownerFullName, displayName, fullName)
  const igDisplayName = post.ownerFullName || post.displayName || post.fullName || 'N/A';
  
  // 取得位置資訊
  const locationInfo = post.locationName || post.location || post.place || 'N/A';
  
  // 計算店家名稱與 IG 顯示名稱的相似度
  const storeName = analysisResult.store_name || '';
  const similarity = igDisplayName !== 'N/A' ? calculateSimilarity(storeName, igDisplayName) : 0;
  
  // 根據相似度自動建議DM內容
  const suggestedDM = generateSuggestedDM(analysisResult, similarity);
  
  return [
    post.timestamp ? new Date(post.timestamp) : new Date(),
    hashtag || 'N/A',
    analysisResult.store_name || 'N/A',
    analysisResult.district || 'N/A', 
    analysisResult.address || 'N/A',
    analysisResult.specialty || 'N/A',
    analysisResult.contact_info || 'N/A',
    post.ownerUsername || 'N/A',
    igDisplayName,
    locationInfo,
    similarity + '%',
    post.url || 'N/A',
    similarity >= 70 ? '待審核' : '不符合', // 發送狀態
    suggestedDM, // DM內容
    '', // 發送時間
    similarity >= 70 ? `相似度${similarity}%，建議發送` : `相似度${similarity}%，不建議發送` // 備註
  ];
}

/**
 * 自動產生建議的 DM 內容
 */
function generateSuggestedDM(analysisResult, similarity) {
  if (similarity < 70) {
    return '不建議發送';
  }
  
  const storeName = analysisResult.store_name || '店家';
  const district = analysisResult.district || '';
  const specialty = analysisResult.specialty || '餐飲';
  
  // 基本 DM 模板
  const templates = [
    `您好！恭喜${storeName}新開幕🎉 我們是專業的${specialty}行銷團隊，想了解是否有合作機會？`,
    `${storeName}您好！看到您在${district}新開幕，我們專精${specialty}推廣，能否進一步討論合作？`,
    `恭喜${storeName}開業大吉！我們團隊專做新店推廣，有興趣了解我們的服務嗎？`
  ];
  
  // 隨機選擇一個模板
  const randomIndex = Math.floor(Math.random() * templates.length);
  return templates[randomIndex];
}

/**
 * 寫入資料到工作表
 */
function writeToSheet(rowData, spreadsheet) {
  try {
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    sheet.appendRow(rowData);
  } catch (error) {
    Logger.log(`寫入工作表失敗: ${error.toString()}`);
    throw error;
  }
}

/**
 * 初始化工作表
 */
function initializeSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    Logger.log(`已建立新工作表: ${SHEET_NAME}`);
  }
  
  // 檢查是否需要建立標題行
  if (sheet.getLastRow() === 0) {
    const headers = ['發現時間', '來源標籤', '店家名稱', '地區', '地址', '類型', '聯繫資訊', 'IG帳號', 'IG顯示名稱', 'IG地標', '名稱相似度', '貼文網址', '發送狀態', 'DM內容', '發送時間', '備註'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // 設定標題行格式
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
    
    Logger.log('已建立標題行');
  }
  
  return sheet;
}

/**
 * 驗證並自動設定 API 金鑰（如果未設定會跳出對話框）
 */
function validateApiConfiguration() {
  const apifyToken = getApiToken('APIFY_API_TOKEN');
  const geminiKey = getApiKey('GEMINI_API_KEY');
  
  // 檢查並設定 Apify API Token
  if (!apifyToken || apifyToken === 'YOUR_APIFY_API_TOKEN') {
    Logger.log('Apify API Token 未設定，跳出設定對話框');
    const newApifyToken = promptForApiKey('Apify API Token', 'https://console.apify.com/account/integrations');
    if (!newApifyToken) {
      Logger.log('未設定 Apify API Token，無法執行');
      return false;
    }
    PropertiesService.getScriptProperties().setProperty('APIFY_API_TOKEN', newApifyToken);
    Logger.log('Apify API Token 設定完成');
  }
  
  // 檢查並設定 Gemini API Key
  if (!geminiKey || geminiKey === 'YOUR_GEMINI_API_KEY') {
    Logger.log('Gemini API Key 未設定，跳出設定對話框');
    const newGeminiKey = promptForApiKey('Gemini API Key', 'https://aistudio.google.com/app/apikey');
    if (!newGeminiKey) {
      Logger.log('未設定 Gemini API Key，無法執行');
      return false;
    }
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', newGeminiKey);
    Logger.log('Gemini API Key 設定完成');
  }
  
  return true;
}

/**
 * 提示使用者輸入 API 金鑰
 */
function promptForApiKey(keyName, helpUrl) {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt(
      `設定 ${keyName}`,
      `請輸入您的 ${keyName}:\n\n如何取得: ${helpUrl}\n\n請輸入金鑰:`,
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() !== ui.Button.OK) {
      return null;
    }
    
    const apiKey = response.getResponseText().trim();
    
    if (!apiKey) {
      ui.alert('錯誤', '請輸入有效的 API 金鑰', ui.ButtonSet.OK);
      return null;
    }
    
    return apiKey;
    
  } catch (error) {
    Logger.log(`取得 ${keyName} 時發生錯誤: ${error.toString()}`);
    return null;
  }
}

/**
 * 安全地取得 API Token
 */
function getApiToken(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key);
  } catch (error) {
    Logger.log(`取得 ${key} 時發生錯誤: ${error.toString()}`);
    return null;
  }
}

/**
 * 安全地取得 API Key
 */
function getApiKey(key) {
  return getApiToken(key);
}

/**
 * 過濾相同帳號的貼文，每個帳號只保留最新的一篇
 */
function filterUniqueAccountPosts(posts) {
  if (!posts || posts.length === 0) {
    return [];
  }
  
  const accountMap = new Map();
  
  for (const post of posts) {
    const username = post.ownerUsername;
    if (!username) {
      continue; // 跳過沒有帳號資訊的貼文
    }
    
    if (!accountMap.has(username)) {
      // 第一次見到這個帳號，直接加入
      accountMap.set(username, post);
    } else {
      // 已經有這個帳號的貼文，比較時間戳記
      const existingPost = accountMap.get(username);
      const existingTime = new Date(existingPost.timestamp || 0);
      const currentTime = new Date(post.timestamp || 0);
      
      // 如果當前貼文更新，就替換
      if (currentTime > existingTime) {
        Logger.log(`帳號 ${username} 有多篇貼文，保留較新的: ${post.timestamp}`);
        accountMap.set(username, post);
      } else {
        Logger.log(`帳號 ${username} 重複貼文已跳過: ${post.timestamp}`);
      }
    }
  }
  
  // 轉換回陣列格式
  const uniquePosts = Array.from(accountMap.values());
  
  // 按時間排序（新到舊）
  uniquePosts.sort((a, b) => {
    const timeA = new Date(a.timestamp || 0);
    const timeB = new Date(b.timestamp || 0);
    return timeB - timeA;
  });
  
  return uniquePosts;
}

/**
 * 檢查貼文是否在時間限制內（3個月）
 */
function isPostWithinTimeLimit(timestamp) {
  if (!timestamp) {
    Logger.log('⚠️ 貼文無時間戳記，預設為符合時間範圍');
    return true; // 如果沒有時間戳記，預設通過檢查
  }
  
  try {
    const postDate = new Date(timestamp);
    const currentDate = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(currentDate.getMonth() - 3);
    
    const isWithinLimit = postDate >= threeMonthsAgo;
    
    if (!isWithinLimit) {
      const daysDiff = Math.floor((currentDate - postDate) / (1000 * 60 * 60 * 24));
      Logger.log(`貼文時間: ${postDate.toISOString().split('T')[0]}, 距今: ${daysDiff} 天`);
    }
    
    return isWithinLimit;
    
  } catch (error) {
    Logger.log(`時間檢查錯誤: ${error.toString()}, timestamp: ${timestamp}`);
    return true; // 發生錯誤時預設通過
  }
}

/**
 * 輸出最終統計
 */
function logFinalStats(stats) {
  Logger.log('=== 執行統計 ===');
  Logger.log(`抓取限制設定: ${stats.resultsLimit} 篇/標籤`);
  Logger.log(`總處理貼文數: ${stats.totalPosts}`);
  Logger.log(`發現新餐飲店家: ${stats.newStores}`);
  Logger.log(`重複帳號貼文: ${stats.duplicateAccounts} (同帳號多篇)`);
  Logger.log(`重複貼文數: ${stats.duplicates} (已收集過)`);
  Logger.log(`過舊貼文數: ${stats.oldPosts} (超過3個月)`);
  Logger.log(`非餐飲業店家: ${stats.nonFoodBusiness}`);
  Logger.log(`發生錯誤數: ${stats.errors}`);
  Logger.log(`篩選條件: 帳號去重 + 3個月內 + 新開幕 + 餐飲業`);
}

/**
 * 取得使用者輸入的抓取數量
 */
function getResultsLimitFromUser() {
  try {
    // 取得目前儲存的設定，如果沒有則使用預設值
    const properties = PropertiesService.getScriptProperties();
    const savedLimit = properties.getProperty('RESULTS_LIMIT') || DEFAULT_RESULTS_LIMIT;
    
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt(
      '設定爬蟲數量',
      `請輸入每個標籤要抓取的貼文數量 (目前: ${savedLimit}, 最大: ${MAX_RESULTS_LIMIT}):`,
      ui.ButtonSet.OK_CANCEL
    );
    
    // 檢查使用者是否按了取消
    if (response.getSelectedButton() !== ui.Button.OK) {
      return null;
    }
    
    const inputText = response.getResponseText().trim();
    
    // 驗證輸入
    if (!inputText) {
      Logger.log('使用者未輸入數量，使用預設值');
      return parseInt(savedLimit);
    }
    
    const inputNumber = parseInt(inputText);
    
    // 驗證數字有效性
    if (isNaN(inputNumber) || inputNumber <= 0) {
      ui.alert('輸入錯誤', '請輸入有效的正整數', ui.ButtonSet.OK);
      return getResultsLimitFromUser(); // 遞迴重新詢問
    }
    
    // 檢查是否超過最大限制
    if (inputNumber > MAX_RESULTS_LIMIT) {
      ui.alert(
        '數量超過限制', 
        `輸入的數量 (${inputNumber}) 超過最大限制 (${MAX_RESULTS_LIMIT})\n將自動設定為最大值。`,
        ui.ButtonSet.OK
      );
      const finalLimit = MAX_RESULTS_LIMIT;
      // 儲存設定
      properties.setProperty('RESULTS_LIMIT', finalLimit.toString());
      return finalLimit;
    }
    
    // 儲存使用者的設定
    properties.setProperty('RESULTS_LIMIT', inputNumber.toString());
    Logger.log(`使用者設定抓取數量: ${inputNumber}`);
    
    return inputNumber;
    
  } catch (error) {
    Logger.log(`取得使用者輸入時發生錯誤: ${error.toString()}`);
    Logger.log(`使用預設值: ${DEFAULT_RESULTS_LIMIT}`);
    return DEFAULT_RESULTS_LIMIT;
  }
}

/**
 * 快速設定抓取數量 (不使用對話框)
 */
function setResultsLimit(limit) {
  if (!limit || isNaN(limit) || limit <= 0) {
    Logger.log('請提供有效的正整數');
    return;
  }
  
  if (limit > MAX_RESULTS_LIMIT) {
    Logger.log(`輸入的數量超過最大限制，將設定為 ${MAX_RESULTS_LIMIT}`);
    limit = MAX_RESULTS_LIMIT;
  }
  
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty('RESULTS_LIMIT', limit.toString());
    Logger.log(`已設定抓取數量為: ${limit}`);
  } catch (error) {
    Logger.log(`設定抓取數量時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 查看目前的抓取數量設定
 */
function getCurrentResultsLimit() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const currentLimit = properties.getProperty('RESULTS_LIMIT') || DEFAULT_RESULTS_LIMIT;
    Logger.log(`目前抓取數量設定: ${currentLimit}`);
    Logger.log(`預設值: ${DEFAULT_RESULTS_LIMIT}`);
    Logger.log(`最大限制: ${MAX_RESULTS_LIMIT}`);
    return parseInt(currentLimit);
  } catch (error) {
    Logger.log(`查看設定時發生錯誤: ${error.toString()}`);
    return DEFAULT_RESULTS_LIMIT;
  }
}

// ================== 設定用函式 ==================

/**
 * 設定 API 金鑰 - 執行一次即可
 */
function setupApiKeys() {
  const APIFY_TOKEN = 'YOUR_APIFY_API_TOKEN';    // <-- 請修改這裡
  const GEMINI_KEY = 'YOUR_GEMINI_API_KEY';      // <-- 請修改這裡
  
  if (APIFY_TOKEN === 'YOUR_APIFY_API_TOKEN' || GEMINI_KEY === 'YOUR_GEMINI_API_KEY') {
    Logger.log('請先在 setupApiKeys() 函式中填入正確的 API 金鑰');
    return;
  }
  
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.setProperties({
      'APIFY_API_TOKEN': APIFY_TOKEN,
      'GEMINI_API_KEY': GEMINI_KEY
    });
    
    Logger.log('API 金鑰設定成功！現在可以執行 main() 函式');
  } catch (error) {
    Logger.log(`設定 API 金鑰時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 查看目前的所有設定狀態
 */
function checkAllConfiguration() {
  const properties = PropertiesService.getScriptProperties();
  const apifyToken = properties.getProperty('APIFY_API_TOKEN');
  const geminiKey = properties.getProperty('GEMINI_API_KEY');
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  const resultsLimit = properties.getProperty('RESULTS_LIMIT') || DEFAULT_RESULTS_LIMIT;
  
  Logger.log('=== 系統設定狀態 ===');
  Logger.log(`Apify Token: ${apifyToken ? '已設定 ✓' : '未設定 ✗'}`);
  Logger.log(`Gemini Key: ${geminiKey ? '已設定 ✓' : '未設定 ✗'}`);
  Logger.log(`Google Sheets: ${spreadsheetId ? '已設定 ✓' : '未設定 ✗'}`);
  Logger.log(`抓取數量: ${resultsLimit} 篇/標籤`);
  
  if (spreadsheetId) {
    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      Logger.log(`試算表名稱: ${spreadsheet.getName()}`);
      Logger.log(`試算表網址: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
    } catch (error) {
      Logger.log('⚠️  試算表無法開啟，可能已被刪除或無權限');
    }
  }
  
  Logger.log('');
  if (apifyToken && geminiKey && spreadsheetId) {
    Logger.log('🎉 所有設定都已完成，可以執行 main() 函式！');
  } else {
    Logger.log('❌ 請完成以下設定：');
    if (!apifyToken || !geminiKey) Logger.log('   - 執行 setupApiKeys() 設定 API 金鑰');
    if (!spreadsheetId) Logger.log('   - 執行 setupSpreadsheet() 設定試算表');
  }
}

/**
 * 查看目前的 API 設定狀態 (向後相容)
 */
function checkApiConfiguration() {
  checkAllConfiguration();
}

/**
 * 清除所有設定 (重新設定時使用)
 */
function clearAllConfiguration() {
  try {
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty('APIFY_API_TOKEN');
    properties.deleteProperty('GEMINI_API_KEY');
    properties.deleteProperty('SPREADSHEET_ID');
    properties.deleteProperty('RESULTS_LIMIT');
    Logger.log('已清除所有設定');
  } catch (error) {
    Logger.log(`清除設定時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 測試單一 hashtag (用於除錯)
 */
function testSingleHashtag() {
  const testHashtag = '新開幕';
  const testLimit = 5;
  
  Logger.log(`=== 測試單一標籤: #${testHashtag} ===`);
  
  if (!validateApiConfiguration()) {
    Logger.log('API 設定不完整');
    return;
  }
  
  Logger.log(`使用的 Actor ID: ${APIFY_ACTOR_ID}`);
  
  const posts = fetchPostsFromApify(testHashtag, testLimit);
  Logger.log(`測試結果: 取得 ${posts.length} 篇貼文`);
  
  if (posts.length > 0) {
    Logger.log('✅ 測試成功！');
    Logger.log('第一篇貼文範例:');
    const firstPost = posts[0];
    const igDisplayName = firstPost.ownerFullName || firstPost.displayName || firstPost.fullName || 'N/A';
    
    // 顯示完整資料結構以便分析位置欄位
    Logger.log('完整貼文資料結構:');
    Logger.log(JSON.stringify(firstPost, null, 2));
    
    Logger.log(`- IG帳號: ${firstPost.ownerUsername || 'N/A'}`);
    Logger.log(`- IG顯示名稱: ${igDisplayName}`);
    Logger.log(`- 地標/位置: ${firstPost.locationName || firstPost.location || firstPost.place || 'N/A'}`);
    Logger.log(`- 時間: ${firstPost.timestamp || 'N/A'}`);
    Logger.log(`- 網址: ${firstPost.url || 'N/A'}`);
    Logger.log(`- 內容摘要: ${(firstPost.caption || '').substring(0, 100)}...`);
    
    // 測試時間篩選
    const isWithinTime = isPostWithinTimeLimit(firstPost.timestamp);
    Logger.log(`- 時間篩選: ${isWithinTime ? '符合 ✓ (3個月內)' : '過舊 ✗ (超過3個月)'}`);
    
    if (isWithinTime) {
      // 測試 AI 分析
      if (firstPost.caption) {
        Logger.log('正在測試 Gemini AI 分析...');
        const locationInfoForAnalysis = firstPost.locationName || firstPost.location || firstPost.place || '';
        const analysis = analyzeCaptionWithGemini(firstPost.caption, locationInfoForAnalysis);
        if (analysis) {
          Logger.log('✅ AI 分析成功！');
          Logger.log(`- 是否為新店: ${analysis.is_newly_opened_store ? '是 ✓' : '否 ✗'}`);
          Logger.log(`- 是否為餐飲業: ${analysis.is_food_business ? '是 ✓' : '否 ✗'}`);
          Logger.log(`- 符合收集條件: ${(analysis.is_newly_opened_store && analysis.is_food_business) ? '是 ✅' : '否 ❌'}`);
          Logger.log(`- 店家名稱: ${analysis.store_name || 'N/A'} ${locationInfoForAnalysis ? '(含地標輔助)' : ''}`);
          Logger.log(`- 地區: ${analysis.district || 'N/A'}`);
          Logger.log(`- 地址: ${analysis.address || 'N/A'}`);
          Logger.log(`- 類型: ${analysis.specialty || 'N/A'}`);
          Logger.log(`- 聯繫資訊: ${analysis.contact_info || 'N/A'}`);
          
          // 測試名稱相似度
          const similarity = igDisplayName !== 'N/A' ? calculateSimilarity(analysis.store_name || '', igDisplayName) : 0;
          Logger.log(`- 名稱相似度: ${similarity}% (店家名稱 vs IG顯示名稱)`);
          
          // 如果有位置資訊，也測試與位置的相似度
          const displayLocationInfo = firstPost.locationName || firstPost.location || firstPost.place || '';
          if (displayLocationInfo) {
            const locationSimilarity = calculateSimilarity(analysis.store_name || '', displayLocationInfo);
            Logger.log(`- 位置相似度: ${locationSimilarity}% (店家名稱 vs IG地標)`);
          }
        }
      }
    } else {
      Logger.log('⏰ 貼文超過3個月，將被篩選排除');
    }
  } else {
    Logger.log('沒有取得任何貼文，請檢查:');
    Logger.log('1. Apify API Token 是否正確');
    Logger.log('2. Actor ID 是否正確');
    Logger.log('3. 標籤是否存在內容');
  }
}

/**
 * 自動執行模式取得抓取數量（不使用對話框）
 * 優先使用 DEFAULT_RESULTS_LIMIT，除非有特別設定過
 */
function getAutomatedResultsLimit() {
  try {
    // 直接使用程式碼中設定的預設值
    Logger.log(`使用程式碼預設抓取數量: ${DEFAULT_RESULTS_LIMIT}`);
    return DEFAULT_RESULTS_LIMIT;
    
  } catch (error) {
    Logger.log(`取得抓取數量設定時發生錯誤: ${error.toString()}`);
    Logger.log(`使用預設值: ${DEFAULT_RESULTS_LIMIT}`);
    return DEFAULT_RESULTS_LIMIT;
  }
}

/**
 * 清除抓取數量設定，使用預設值
 */
function clearResultsLimit() {
  try {
    PropertiesService.getScriptProperties().deleteProperty('RESULTS_LIMIT');
    Logger.log('已清除 RESULTS_LIMIT 設定，將使用預設值');
    Logger.log(`預設值為: ${DEFAULT_RESULTS_LIMIT}`);
  } catch (error) {
    Logger.log(`清除設定時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 設定新的抓取數量 (帶對話框輸入)
 */
function setNewResultsLimit() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt(
      '設定抓取數量',
      `請輸入要抓取的貼文數量 (最大: ${MAX_RESULTS_LIMIT}):`,
      ui.ButtonSet.OK_CANCEL
    );
    
    if (response.getSelectedButton() !== ui.Button.OK) {
      Logger.log('使用者取消設定');
      return;
    }
    
    const inputText = response.getResponseText().trim();
    const limit = parseInt(inputText);
    
    if (isNaN(limit) || limit <= 0) {
      ui.alert('錯誤', '請輸入有效的正整數', ui.ButtonSet.OK);
      return;
    }
    
    if (limit > MAX_RESULTS_LIMIT) {
      ui.alert('警告', `輸入的數量超過最大限制，將設定為 ${MAX_RESULTS_LIMIT}`, ui.ButtonSet.OK);
      PropertiesService.getScriptProperties().setProperty('RESULTS_LIMIT', MAX_RESULTS_LIMIT.toString());
      Logger.log(`已設定抓取數量為: ${MAX_RESULTS_LIMIT}`);
    } else {
      PropertiesService.getScriptProperties().setProperty('RESULTS_LIMIT', limit.toString());
      Logger.log(`已設定抓取數量為: ${limit}`);
    }
    
  } catch (error) {
    Logger.log(`設定抓取數量時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 快速設定抓取數量 (直接指定數字)
 */
function setResultsLimitQuick(limit) {
  if (!limit) {
    Logger.log('請提供數量，例如: setResultsLimitQuick(50)');
    return;
  }
  
  if (isNaN(limit) || limit <= 0) {
    Logger.log('請提供有效的正整數');
    return;
  }
  
  if (limit > MAX_RESULTS_LIMIT) {
    Logger.log(`輸入的數量超過最大限制，將設定為 ${MAX_RESULTS_LIMIT}`);
    limit = MAX_RESULTS_LIMIT;
  }
  
  try {
    PropertiesService.getScriptProperties().setProperty('RESULTS_LIMIT', limit.toString());
    Logger.log(`已設定抓取數量為: ${limit}`);
  } catch (error) {
    Logger.log(`設定抓取數量時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 取得待發送的 DM 列表（發送狀態為 "發送" 的項目）
 */
function getPendingDMList() {
  try {
    const spreadsheet = getConfiguredSpreadsheet();
    if (!spreadsheet) {
      Logger.log('找不到設定的試算表');
      return [];
    }
    
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      Logger.log('沒有資料');
      return [];
    }
    
    // 讀取所有資料
    const data = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
    const pendingDMs = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const sendStatus = row[12]; // 發送狀態欄位
      const dmContent = row[13];  // DM內容欄位
      const igUsername = row[7];  // IG帳號欄位
      const storeName = row[2];   // 店家名稱
      
      if (sendStatus === '發送' && dmContent && igUsername !== 'N/A') {
        pendingDMs.push({
          rowIndex: i + 2, // 實際行號
          igUsername: igUsername,
          storeName: storeName,
          dmContent: dmContent,
          district: row[3],
          specialty: row[5]
        });
      }
    }
    
    Logger.log(`找到 ${pendingDMs.length} 個待發送的 DM`);
    return pendingDMs;
    
  } catch (error) {
    Logger.log(`取得待發送列表時發生錯誤: ${error.toString()}`);
    return [];
  }
}

/**
 * 更新發送狀態
 */
function updateSendStatus(rowIndex, status, timestamp = '', note = '') {
  try {
    const spreadsheet = getConfiguredSpreadsheet();
    if (!spreadsheet) return;
    
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // 更新發送狀態 (第13欄)
    sheet.getRange(rowIndex, 13).setValue(status);
    
    // 更新發送時間 (第15欄)
    if (timestamp) {
      sheet.getRange(rowIndex, 15).setValue(timestamp);
    }
    
    // 更新備註 (第16欄)
    if (note) {
      sheet.getRange(rowIndex, 16).setValue(note);
    }
    
  } catch (error) {
    Logger.log(`更新發送狀態時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 標記高相似度項目供審核
 */
function markHighSimilarityForReview() {
  try {
    const spreadsheet = getConfiguredSpreadsheet();
    if (!spreadsheet) {
      Logger.log('找不到設定的試算表');
      return;
    }
    
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      Logger.log('沒有資料');
      return;
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
    let markedCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const similarity = parseInt(row[10].replace('%', '')); // 名稱相似度
      const sendStatus = row[12]; // 發送狀態
      
      if (similarity >= 70 && (sendStatus === '待審核' || sendStatus === '不符合')) {
        // 標記為待審核
        sheet.getRange(i + 2, 13).setValue('待審核');
        sheet.getRange(i + 2, 16).setValue(`相似度${similarity}%，建議人工審核`);
        markedCount++;
      }
    }
    
    Logger.log(`已標記 ${markedCount} 個高相似度項目供審核`);
    
  } catch (error) {
    Logger.log(`標記審核項目時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 顯示 DM 發送統計
 */
function showDMStatistics() {
  try {
    const spreadsheet = getConfiguredSpreadsheet();
    if (!spreadsheet) return;
    
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      Logger.log('沒有資料');
      return;
    }
    
    const data = sheet.getRange(2, 13, lastRow - 1, 1).getValues(); // 發送狀態欄
    const stats = {
      total: data.length,
      pending: 0,    // 待審核
      approved: 0,   // 發送
      sent: 0,       // 已發送
      failed: 0,     // 發送失敗
      rejected: 0    // 不符合
    };
    
    data.forEach(row => {
      const status = row[0];
      switch(status) {
        case '待審核': stats.pending++; break;
        case '發送': stats.approved++; break;
        case '已發送': stats.sent++; break;
        case '發送失敗': stats.failed++; break;
        case '不符合': stats.rejected++; break;
      }
    });
    
    Logger.log('=== DM 發送統計 ===');
    Logger.log(`總項目數: ${stats.total}`);
    Logger.log(`待審核: ${stats.pending}`);
    Logger.log(`已審核(發送): ${stats.approved}`);
    Logger.log(`已發送: ${stats.sent}`);
    Logger.log(`發送失敗: ${stats.failed}`);
    Logger.log(`不符合條件: ${stats.rejected}`);
    
  } catch (error) {
    Logger.log(`顯示統計時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 觸發 Python Instagram Bot 發送 DM
 */
function triggerInstagramBot() {
  try {
    const pendingDMs = getPendingDMList();
    
    if (pendingDMs.length === 0) {
      Logger.log('沒有待發送的 DM');
      return;
    }
    
    Logger.log(`準備觸發 Python Bot 發送 ${pendingDMs.length} 個 DM`);
    
    // Python Bot 的 URL (需要替換為實際的 URL)
    const pythonBotUrl = 'YOUR_PYTHON_BOT_URL'; // <-- 替換為你的 Python Bot URL
    
    // 發送 HTTP Request 到 Python Bot
    const payload = {
      action: 'send_dms',
      data: pendingDMs
    };
    
    const options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 300000 // 5分鐘超時
    };
    
    const response = UrlFetchApp.fetch(pythonBotUrl, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`Python Bot 回應狀態: ${statusCode}`);
    Logger.log(`Python Bot 回應內容: ${responseText}`);
    
    if (statusCode === 200) {
      Logger.log('✅ 成功觸發 Python Bot');
      
      // 解析回應並更新狀態
      try {
        const result = JSON.parse(responseText);
        updateDMResults(result);
      } catch (error) {
        Logger.log(`解析 Python Bot 回應時發生錯誤: ${error.toString()}`);
      }
    } else {
      Logger.log('❌ 觸發 Python Bot 失敗');
    }
    
  } catch (error) {
    Logger.log(`觸發 Python Bot 時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 更新 DM 發送結果到 Google Sheets
 */
function updateDMResults(results) {
  try {
    if (!results.success || !results.results) {
      Logger.log('Python Bot 回應格式錯誤');
      return;
    }
    
    results.results.forEach(result => {
      const status = result.success ? '已發送' : '發送失敗';
      const timestamp = new Date().toLocaleString();
      const note = result.error || '發送成功';
      
      updateSendStatus(result.rowIndex, status, timestamp, note);
      Logger.log(`更新第${result.rowIndex}行: ${result.igUsername} - ${status}`);
    });
    
    Logger.log(`已更新 ${results.results.length} 個發送結果`);
    
  } catch (error) {
    Logger.log(`更新發送結果時發生錯誤: ${error.toString()}`);
  }
}

/**
 * 定時執行：爬蟲 + 觸發發送 Bot
 */
function scheduledRun() {
  Logger.log('=== 定時執行開始 ===');
  
  // 1. 執行爬蟲
  Logger.log('步驟1: 執行 Instagram 爬蟲');
  main();
  
  // 等待 30 秒讓用戶有時間審核
  Logger.log('等待 30 秒供人工審核...');
  Utilities.sleep(30000);
  
  // 2. 觸發 Instagram Bot
  Logger.log('步驟2: 觸發 Instagram DM Bot');
  triggerInstagramBot();
  
  Logger.log('=== 定時執行完成 ===');
}

/**
 * 測試 HTTP 觸發功能
 */
function testPythonBotConnection() {
  const pythonBotUrl = 'YOUR_PYTHON_BOT_URL'; // <-- 替換為你的測試 URL
  
  const payload = {
    action: 'test',
    message: 'Hello from Google Apps Script!'
  };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    Logger.log('正在測試與 Python Bot 的連接...');
    const response = UrlFetchApp.fetch(pythonBotUrl, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`狀態碼: ${statusCode}`);
    Logger.log(`回應內容: ${responseText}`);
    
    if (statusCode === 200) {
      Logger.log('✅ Python Bot 連接測試成功');
    } else {
      Logger.log('❌ Python Bot 連接測試失敗');
    }
    
  } catch (error) {
    Logger.log(`連接測試失敗: ${error.toString()}`);
  }
}

/**
 * 測試 Apify API 連接 (最基本測試)
 */
function testApifyConnection() {
  const apiToken = getApiToken('APIFY_API_TOKEN');
  
  Logger.log('=== 測試 Apify API 連接 ===');
  
  if (!apiToken) {
    Logger.log('❌ 找不到 Apify API Token');
    return;
  }
  
  // 測試最簡單的 API 呼叫
  const testUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiToken}`
    },
    muteHttpExceptions: true
  };
  
  try {
    Logger.log(`正在測試 Actor 資訊: ${APIFY_ACTOR_ID}`);
    
    const response = UrlFetchApp.fetch(testUrl, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`回應狀態碼: ${statusCode}`);
    
    if (statusCode === 200) {
      const actorInfo = JSON.parse(responseText);
      Logger.log(`✅ API 連接成功！`);
      Logger.log(`Actor 名稱: ${actorInfo.data.name}`);
      Logger.log(`Actor 描述: ${actorInfo.data.description || 'N/A'}`);
    } else if (statusCode === 401) {
      Logger.log('❌ API Token 無效，請檢查設定');
    } else if (statusCode === 404) {
      Logger.log(`❌ 找不到 Actor: ${APIFY_ACTOR_ID}`);
      Logger.log('可能的原因:');
      Logger.log('1. Actor ID 格式錯誤');
      Logger.log('2. Actor 不存在或已被刪除');
      Logger.log('3. 沒有權限存取此 Actor');
    } else {
      Logger.log(`❌ 未預期的錯誤，狀態碼: ${statusCode}`);
      Logger.log(`回應內容: ${responseText}`);
    }
    
  } catch (error) {
    Logger.log(`❌ 連接測試失敗: ${error.toString()}`);
  }
}