#!/usr/bin/env python3
"""
Instagram DM 自動發送 Bot
接收來自 Google Apps Script 的 HTTP 請求，自動發送 Instagram Direct Messages
"""

import time
import json
import logging
import random
import os
from dotenv import load_dotenv
from datetime import datetime
from flask import Flask, request, jsonify
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# 設定日誌
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 讀取 .env 檔案中的環境變數
load_dotenv()

# Instagram 設定
INSTAGRAM_CONFIG = {
    'username': os.getenv('INSTAGRAM_USERNAME'),
    'password': os.getenv('INSTAGRAM_PASSWORD'),
    'base_url': 'https://www.instagram.com',
    'login_url': 'https://www.instagram.com/accounts/login/',
}

# 發送限制設定
RATE_LIMITS = {
    'daily_limit': 1500,        # 每日最多發送數量
    'hourly_limit': 1500,       # 每小時最多發送數量 (與每日相同，等於取消獨立限制)
    'min_interval': 60,         # 發送間隔秒數 (1分鐘)
    'max_interval': 180,        # 最大間隔秒數 (3分鐘)
}

# 全域變量
driver = None
daily_sent_count = 0
hourly_sent_count = 0
last_reset_hour = datetime.now().hour
last_sent_time = 0

class InstagramBot:
    def __init__(self):
        self.driver = None
        self.is_logged_in = False
        
    def setup_driver(self):
        """設定 Chrome 瀏覽器"""
        try:
            chrome_options = Options()
            chrome_options.add_argument('--headless')  # 無頭模式
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
            
            self.driver = webdriver.Chrome(options=chrome_options)
            logger.info("✅ Chrome 瀏覽器設定完成")
            return True
            
        except Exception as e:
            logger.error(f"❌ 設定瀏覽器失敗: {str(e)}")
            return False
    
    def login(self):
        """登入 Instagram"""
        try:
            if not self.driver:
                logger.error("瀏覽器未初始化")
                return False
                
            logger.info("正在登入 Instagram...")
            self.driver.get(INSTAGRAM_CONFIG['login_url'])
            
            # 等待頁面載入
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.NAME, "username"))
            )
            
            # 輸入帳號密碼
            username_input = self.driver.find_element(By.NAME, "username")
            password_input = self.driver.find_element(By.NAME, "password")
            
            username_input.send_keys(INSTAGRAM_CONFIG['username'])
            password_input.send_keys(INSTAGRAM_CONFIG['password'])
            
            # 點擊登入按鈕
            login_button = self.driver.find_element(By.XPATH, "//button[@type='submit']")
            login_button.click()
            
            # 等待登入完成
            time.sleep(5)
            
            # 檢查是否登入成功
            if "instagram.com" in self.driver.current_url and "login" not in self.driver.current_url:
                logger.info("✅ Instagram 登入成功")
                self.is_logged_in = True
                return True
            else:
                logger.error("❌ Instagram 登入失敗")
                return False
                
        except Exception as e:
            logger.error(f"❌ Instagram 登入過程發生錯誤: {str(e)}")
            return False
    
    def send_direct_message(self, username, message):
        """發送 Instagram Direct Message"""
        try:
            if not self.is_logged_in:
                logger.error("尚未登入 Instagram")
                return False
            
            logger.info(f"正在發送 DM 給 @{username}")
            
            # 前往用戶頁面
            user_url = f"{INSTAGRAM_CONFIG['base_url']}/{username}/"
            self.driver.get(user_url)
            
            # 等待頁面載入
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "article"))
            )
            
            # 尋找並點擊 "訊息" 按鈕
            try:
                message_button = WebDriverWait(self.driver, 5).until(
                    EC.element_to_be_clickable((By.XPATH, "//div[text()='訊息']"))
                )
                message_button.click()
            except TimeoutException:
                # 嘗試其他可能的按鈕文字
                try:
                    message_button = WebDriverWait(self.driver, 5).until(
                        EC.element_to_be_clickable((By.XPATH, "//div[text()='Message']"))
                    )
                    message_button.click()
                except TimeoutException:
                    logger.error(f"找不到 @{username} 的訊息按鈕")
                    return False
            
            # 等待訊息輸入框出現
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//textarea[@placeholder]"))
            )
            
            # 輸入訊息
            message_input = self.driver.find_element(By.XPATH, "//textarea[@placeholder]")
            message_input.send_keys(message)
            
            # 點擊發送按鈕
            send_button = self.driver.find_element(By.XPATH, "//button[text()='傳送']")
            send_button.click()
            
            # 等待發送完成
            time.sleep(3)
            
            logger.info(f"✅ 成功發送 DM 給 @{username}")
            return True
            
        except Exception as e:
            logger.error(f"❌ 發送 DM 給 @{username} 失敗: {str(e)}")
            return False
    
    def close(self):
        """關閉瀏覽器"""
        if self.driver:
            self.driver.quit()
            logger.info("瀏覽器已關閉")

# 全域 Bot 實例
bot = InstagramBot()

def check_rate_limits():
    """檢查發送限制"""
    global daily_sent_count, hourly_sent_count, last_reset_hour, last_sent_time
    
    current_hour = datetime.now().hour
    current_time = time.time()
    
    # 重置小時計數器
    if current_hour != last_reset_hour:
        hourly_sent_count = 0
        last_reset_hour = current_hour
    
    # 檢查限制
    if daily_sent_count >= RATE_LIMITS['daily_limit']:
        return False, "已達每日發送限制"
    
    if hourly_sent_count >= RATE_LIMITS['hourly_limit']:
        return False, "已達每小時發送限制"
    
    if current_time - last_sent_time < RATE_LIMITS['min_interval']:
        return False, "發送間隔太短"
    
    return True, "可以發送"

def update_rate_limit_counters():
    """更新發送計數器"""
    global daily_sent_count, hourly_sent_count, last_sent_time
    
    daily_sent_count += 1
    hourly_sent_count += 1
    last_sent_time = time.time()

@app.route('/test', methods=['POST'])
def test_connection():
    """測試連接端點"""
    try:
        data = request.json
        logger.info(f"收到測試請求: {data}")
        
        return jsonify({
            'success': True,
            'message': 'Python Instagram Bot 運行正常',
            'timestamp': datetime.now().isoformat(),
            'received_data': data
        }), 200
        
    except Exception as e:
        logger.error(f"測試連接時發生錯誤: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/send_dms', methods=['POST'])
def send_dms():
    """發送 DM 端點"""
    try:
        data = request.json
        logger.info(f"收到 DM 發送請求，共 {len(data.get('data', []))} 個項目")
        
        if not data or 'data' not in data:
            return jsonify({
                'success': False,
                'error': '無效的請求資料'
            }), 400
        
        dm_list = data['data']
        results = []
        
        # 確保 Bot 已初始化和登入
        if not bot.driver:
            logger.info("初始化 Instagram Bot...")
            if not bot.setup_driver():
                return jsonify({
                    'success': False,
                    'error': '無法初始化瀏覽器'
                }), 500
        
        if not bot.is_logged_in:
            logger.info("登入 Instagram...")
            if not bot.login():
                return jsonify({
                    'success': False,
                    'error': '無法登入 Instagram'
                }), 500
        
        # 處理每個 DM
        for dm_item in dm_list:
            try:
                # 檢查發送限制
                can_send, limit_message = check_rate_limits()
                if not can_send:
                    logger.warning(f"跳過 @{dm_item['igUsername']}: {limit_message}")
                    results.append({
                        'rowIndex': dm_item['rowIndex'],
                        'igUsername': dm_item['igUsername'],
                        'success': False,
                        'error': limit_message
                    })
                    continue
                
                # 發送 DM
                success = bot.send_direct_message(
                    dm_item['igUsername'], 
                    dm_item['dmContent']
                )
                
                if success:
                    update_rate_limit_counters()
                    
                results.append({
                    'rowIndex': dm_item['rowIndex'],
                    'igUsername': dm_item['igUsername'],
                    'success': success,
                    'error': None if success else '發送失敗'
                })
                
                # 隨機等待避免被偵測
                if success:
                    wait_time = random.randint(RATE_LIMITS['min_interval'], RATE_LIMITS['max_interval'])
                    logger.info(f"等待 {wait_time} 秒...")
                    time.sleep(wait_time)
                
            except Exception as e:
                logger.error(f"處理 @{dm_item['igUsername']} 時發生錯誤: {str(e)}")
                results.append({
                    'rowIndex': dm_item['rowIndex'],
                    'igUsername': dm_item['igUsername'],
                    'success': False,
                    'error': str(e)
                })
        
        # 統計結果
        success_count = sum(1 for r in results if r['success'])
        total_count = len(results)
        
        logger.info(f"DM 發送完成: {success_count}/{total_count} 成功")
        
        return jsonify({
            'success': True,
            'results': results,
            'summary': {
                'total': total_count,
                'success': success_count,
                'failed': total_count - success_count
            }
        }), 200
        
    except Exception as e:
        logger.error(f"發送 DM 時發生錯誤: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/status', methods=['GET'])
def get_status():
    """取得 Bot 狀態"""
    return jsonify({
        'bot_initialized': bot.driver is not None,
        'logged_in': bot.is_logged_in,
        'daily_sent': daily_sent_count,
        'hourly_sent': hourly_sent_count,
        'daily_limit': RATE_LIMITS['daily_limit'],
        'hourly_limit': RATE_LIMITS['hourly_limit'],
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    logger.info("🚀 Instagram DM Bot 啟動中...")
    logger.info("請確保已安裝 Chrome 瀏覽器和 ChromeDriver")
    logger.info("請在 INSTAGRAM_CONFIG 中設定您的 Instagram 帳號密碼")
    
    # 啟動 Flask 服務
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )