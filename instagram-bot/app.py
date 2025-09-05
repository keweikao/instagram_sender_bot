#!/usr/bin/env python3
"""
Instagram DM 自動發送 Bot - Zeabur 優化版本
接收來自 Google Apps Script 的 HTTP 請求，自動發送 Instagram Direct Messages
"""

import os
import time
import json
import logging
import random
from datetime import datetime
from flask import Flask, request, jsonify
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# 設定日誌
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 從環境變數讀取配置
INSTAGRAM_CONFIG = {
    'username': os.getenv('INSTAGRAM_USERNAME', 'your_username'),
    'password': os.getenv('INSTAGRAM_PASSWORD', 'your_password'),
    'base_url': 'https://www.instagram.com',
    'login_url': 'https://www.instagram.com/accounts/login/',
}

# 發送限制設定
RATE_LIMITS = {
    'daily_limit': int(os.getenv('DAILY_LIMIT', '50')),
    'hourly_limit': int(os.getenv('HOURLY_LIMIT', '10')),
    'min_interval': int(os.getenv('MIN_INTERVAL', '60')),
    'max_interval': int(os.getenv('MAX_INTERVAL', '180')),
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
        """設定 Chrome 瀏覽器 - Zeabur 優化版本"""
        try:
            chrome_options = Options()
            chrome_options.add_argument('--headless=new')  # 使用新版 headless 模式
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--disable-extensions')
            chrome_options.add_argument('--disable-plugins')
            chrome_options.add_argument('--disable-images')
            # chrome_options.add_argument('--disable-javascript')  # 移除：Instagram 需要 JavaScript
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
            chrome_options.add_argument('--remote-debugging-port=9222')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            
            # 針對容器環境的優化
            chrome_options.add_argument('--memory-pressure-off')
            chrome_options.add_argument('--max_old_space_size=4096')
            # chrome_options.add_argument('--single-process')  # 可能導致崩潰，移除
            chrome_options.add_argument('--disable-background-timer-throttling')
            chrome_options.add_argument('--disable-renderer-backgrounding')
            chrome_options.add_argument('--disable-backgrounding-occluded-windows')
            chrome_options.add_argument('--disable-ipc-flooding-protection')
            chrome_options.add_argument('--disable-default-apps')
            chrome_options.add_argument('--disable-sync')
            
            # 使用系統安裝的 Chrome，讓 Selenium 自動管理 ChromeDriver
            from selenium.webdriver.chrome.service import Service
            from selenium.webdriver.common.service import utils
            
            # 嘗試使用系統的 ChromeDriver，如果沒有則使用 webdriver-manager
            try:
                # 讓 Selenium 自動下載匹配的 ChromeDriver
                self.driver = webdriver.Chrome(options=chrome_options)
            except Exception as driver_error:
                logger.warning(f"自動 ChromeDriver 失敗，嘗試手動指定: {str(driver_error)}")
                # 如果自動下載失敗，嘗試使用 webdriver-manager
                try:
                    from webdriver_manager.chrome import ChromeDriverManager
                    service = Service(ChromeDriverManager().install())
                    self.driver = webdriver.Chrome(service=service, options=chrome_options)
                except ImportError:
                    logger.error("未安裝 webdriver-manager，請手動安裝: pip install webdriver-manager")
                    raise driver_error
            
            self.driver.set_page_load_timeout(30)
            self.driver.implicitly_wait(10)
            
            logger.info("✅ Chrome 瀏覽器設定完成")
            return True
            
        except Exception as e:
            logger.error(f"❌ 設定瀏覽器失敗: {str(e)}")
            return False
    
    def login(self):
        """登入 Instagram - 增強錯誤處理"""
        try:
            if not self.driver:
                logger.error("瀏覽器未初始化")
                return False
                
            logger.info("正在登入 Instagram...")
            self.driver.get(INSTAGRAM_CONFIG['login_url'])
            
            # 等待頁面載入
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.NAME, "username"))
            )
            
            # 輸入帳號密碼 - 使用更可靠的選擇器
            try:
                username_input = self.driver.find_element(By.NAME, "username")
            except:
                # 後備選擇器
                username_input = self.driver.find_element(By.XPATH, "//input[@name='username']")
            
            try:
                password_input = self.driver.find_element(By.NAME, "password") 
            except:
                # 後備選擇器
                password_input = self.driver.find_element(By.XPATH, "//input[@name='password']")
            
            username_input.clear()
            username_input.send_keys(INSTAGRAM_CONFIG['username'])
            time.sleep(1)
            
            password_input.clear()
            password_input.send_keys(INSTAGRAM_CONFIG['password'])
            time.sleep(1)
            
            # 點擊登入按鈕
            login_button = self.driver.find_element(By.XPATH, "//button[@type='submit']")
            login_button.click()
            
            # 等待登入完成 - 增加等待時間確保會話穩定
            logger.info("等待登入會話建立...")
            time.sleep(15)  # 增加到15秒
            
            # 檢查是否需要處理安全驗證
            try:
                # 檢查是否有 "Save Your Login Info" 提示
                save_info_not_now = WebDriverWait(self.driver, 5).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Not Now')]"))
                )
                save_info_not_now.click()
                time.sleep(2)
            except TimeoutException:
                pass  # 沒有出現該提示，繼續
            
            # 檢查是否登入成功 - 更嚴格的驗證
            current_url = self.driver.current_url
            logger.info(f"登入後 URL: {current_url}")
            
            # 確保真正登入成功
            success_indicators = [
                "instagram.com" in current_url and "login" not in current_url,
                "accounts/login" not in current_url,
                "/accounts/onetap" not in current_url
            ]
            
            if all(success_indicators):
                # 額外驗證：嘗試訪問首頁確認會話有效
                logger.info("驗證登入會話有效性...")
                self.driver.get("https://www.instagram.com/")
                time.sleep(3)
                
                final_url = self.driver.current_url
                logger.info(f"會話驗證後 URL: {final_url}")
                
                if "login" not in final_url:
                    logger.info("✅ Instagram 登入成功且會話有效")
                    self.is_logged_in = True
                    return True
                else:
                    logger.error(f"❌ 登入會話無效，被重定向到: {final_url}")
                    return False
            else:
                logger.error(f"❌ Instagram 登入失敗，當前 URL: {current_url}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Instagram 登入過程發生錯誤: {str(e)}")
            return False
    
    def send_direct_message(self, username, message):
        """發送 Instagram Direct Message - 增強穩定性"""
        try:
            if not self.is_logged_in:
                logger.error("尚未登入 Instagram")
                return False
            
            logger.info(f"正在發送 DM 給 @{username}")
            
            # 確保登入狀態穩定 - 等待更長時間
            logger.info("等待登入狀態穩定...")
            time.sleep(10)  # 增加到10秒
            
            # 檢查當前登入狀態
            current_url_before = self.driver.current_url
            logger.info(f"發送 DM 前的 URL: {current_url_before}")
            
            # 前往用戶頁面
            user_url = f"{INSTAGRAM_CONFIG['base_url']}/{username}/"
            logger.info(f"正在訪問用戶頁面: {user_url}")
            self.driver.get(user_url)
            
            # 等待頁面載入 - 增加超時時間
            WebDriverWait(self.driver, 20).until(
                EC.presence_of_element_located((By.TAG_NAME, "main"))
            )
            
            # 檢查是否被重定向到登入頁面
            current_url = self.driver.current_url
            if "login" in current_url:
                logger.error(f"被重定向到登入頁面: {current_url}")
                logger.error("登入會話可能已失效，需要重新登入")
                
                # 嘗試重新登入
                logger.info("嘗試重新登入...")
                if self.login():
                    logger.info("重新登入成功，重試訪問用戶頁面")
                    time.sleep(3)
                    self.driver.get(user_url)
                    WebDriverWait(self.driver, 20).until(
                        EC.presence_of_element_located((By.TAG_NAME, "main"))
                    )
                else:
                    logger.error("重新登入失敗")
                    return False
            
            # 檢查用戶是否存在
            if "Sorry, this page isn't available" in self.driver.page_source:
                logger.error(f"❌ 用戶 @{username} 不存在或已被刪除")
                return False
            
            # 尋找並點擊 "Message" 按鈕 - 擴展選擇器
            message_button_found = False
            
            # 增強的按鈕選擇器 - 基於 GitHub 最佳實踐
            button_selectors = [
                # 使用 normalize-space() 函數 - GitHub 推薦的最佳實踐
                "//div[normalize-space(.)='Message']",
                "//div[normalize-space(text())='Message']", 
                "//span[normalize-space(.)='Message']",
                "//button[normalize-space(.)='Message']",
                "//div[normalize-space(.)='訊息']",
                "//span[normalize-space(.)='訊息']",
                "//button[normalize-space(.)='訊息']",
                
                # 標準文字選擇器
                "//div[text()='Message']",
                "//span[text()='Message']",
                "//button[text()='Message']",
                "//div[text()='訊息']",
                "//span[text()='訊息']",
                "//button[text()='訊息']",
                
                # Instagram 常見的按鈕結構
                "//div[@role='button' and normalize-space(.)='Message']",
                "//div[@role='button' and contains(., 'Message')]",
                "//button[@type='button' and normalize-space(.)='Message']",
                "//button[@type='button' and text()='Message']",
                
                # 包含文字的選擇器 - 排除 Messages
                "//div[contains(text(), 'Message') and not(contains(text(), 'Messages'))]",
                "//span[contains(text(), 'Message') and not(contains(text(), 'Messages'))]",
                "//button[contains(text(), 'Message') and not(contains(text(), 'Messages'))]",
                "//div[contains(text(), '訊息')]",
                
                # 基於 aria-label 的選擇器
                "//*[contains(@aria-label, 'Message')]",
                "//*[contains(@aria-label, '訊息')]",
                "//*[@aria-label='Message']",
                
                # 絕對路徑選擇器 - 來自 Stack Overflow 
                "/html/body/div[2]/div/div/div[1]/div/div/div/div[1]/section/main/div/header/section/div[1]/div[2]/div/div[2]",
                
                # Direct message 相關連結
                "//a[contains(@href, '/direct/')]",
                "//a[contains(@href, '/direct/new/')]",
                
                # 更寬泛的選擇器
                "//button[contains(@class, 'message')]",
                "//div[contains(@class, 'message')]",
                "//*[contains(@data-testid, 'message')]",
                
                # CSS 選擇器轉 XPath
                "//*[contains(@class, '_acan') and text()='Message']",
                "//*[contains(@class, '_acas') and text()='Message']"
            ]
            
            logger.info(f"嘗試尋找 @{username} 的訊息按鈕...")
            
            for i, selector in enumerate(button_selectors, 1):
                try:
                    logger.info(f"嘗試選擇器 {i}/{len(button_selectors)}: {selector}")
                    message_button = WebDriverWait(self.driver, 3).until(
                        EC.element_to_be_clickable((By.XPATH, selector))
                    )
                    logger.info(f"✅ 找到訊息按鈕，使用選擇器: {selector}")
                    message_button.click()
                    message_button_found = True
                    time.sleep(2)  # 等待點擊生效
                    break
                except TimeoutException:
                    continue
                except Exception as e:
                    logger.warning(f"選擇器 {i} 出錯: {str(e)}")
                    continue
            
            if not message_button_found:
                # 記錄頁面信息用於調試
                logger.error(f"❌ 找不到 @{username} 的訊息按鈕")
                logger.info(f"當前頁面 URL: {self.driver.current_url}")
                
                # 詳細調試信息
                try:
                    # 記錄頁面標題
                    page_title = self.driver.title
                    logger.info(f"頁面標題: {page_title}")
                    
                    # 尋找所有可能的按鈕元素
                    buttons = self.driver.find_elements(By.TAG_NAME, "button")
                    logger.info(f"頁面上共有 {len(buttons)} 個按鈕")
                    
                    for i, button in enumerate(buttons[:10]):  # 只記錄前10個
                        try:
                            button_text = button.text.strip()
                            if button_text:
                                logger.info(f"按鈕 {i+1}: '{button_text}'")
                        except:
                            pass
                    
                    # 尋找所有包含 "message" 文字的元素
                    message_elements = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'Message') or contains(text(), 'message') or contains(text(), '訊息')]")
                    logger.info(f"包含 message 文字的元素: {len(message_elements)}")
                    
                    for i, elem in enumerate(message_elements[:5]):  # 只記錄前5個
                        try:
                            elem_text = elem.text.strip()
                            tag_name = elem.tag_name
                            logger.info(f"Message 元素 {i+1}: <{tag_name}> '{elem_text}'")
                        except:
                            pass
                            
                except Exception as debug_error:
                    logger.warning(f"調試信息獲取失敗: {str(debug_error)}")
                
                # 檢查是否是私人帳號
                if "This Account is Private" in self.driver.page_source:
                    logger.error(f"@{username} 是私人帳號，無法發送訊息")
                    return False
                    
                # 檢查是否需要關注才能發訊息
                if "Follow to message" in self.driver.page_source:
                    logger.error(f"需要先關注 @{username} 才能發送訊息")
                    return False
                    
                return False
            
            # 等待訊息輸入框出現
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.XPATH, "//textarea"))
            )
            
            # 輸入訊息
            message_input = self.driver.find_element(By.XPATH, "//textarea")
            message_input.clear()
            message_input.send_keys(message)
            
            time.sleep(1)
            
            # 點擊發送按鈕
            send_selectors = [
                "//button[text()='Send']",
                "//button[text()='傳送']",
                "//button[contains(@type, 'submit')]"
            ]
            
            send_button_found = False
            for selector in send_selectors:
                try:
                    send_button = self.driver.find_element(By.XPATH, selector)
                    send_button.click()
                    send_button_found = True
                    break
                except NoSuchElementException:
                    continue
            
            if not send_button_found:
                logger.error("❌ 找不到發送按鈕")
                return False
            
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
            try:
                self.driver.quit()
                logger.info("瀏覽器已關閉")
            except:
                pass

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

@app.route('/', methods=['GET'])
def home():
    """首頁"""
    return jsonify({
        'service': 'Instagram DM Bot',
        'status': 'running',
        'version': '1.0.3',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/health', methods=['GET'])
def health_check():
    """健康檢查端點"""
    return jsonify({
        'status': 'healthy',
        'bot_initialized': bot.driver is not None,
        'logged_in': bot.is_logged_in,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/test', methods=['GET', 'POST'])
def test_connection():
    """測試連接端點"""
    try:
        data = request.json or {} if request.method == 'POST' else {}
        logger.info(f"收到測試請求 ({request.method}): {data}")
        
        return jsonify({
            'success': True,
            'message': 'Python Instagram Bot 運行正常',
            'environment': 'Zeabur',
            'timestamp': datetime.now().isoformat(),
            'method': request.method,
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
        if not data or 'data' not in data:
            return jsonify({
                'success': False,
                'error': '無效的請求資料'
            }), 400
        
        dm_list = data['data']
        logger.info(f"收到 DM 發送請求，共 {len(dm_list)} 個項目")
        
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
        'environment': 'Zeabur',
        'instagram_username': INSTAGRAM_CONFIG['username'],
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    logger.info("🚀 Instagram DM Bot 啟動中...")
    logger.info("環境: Zeabur 雲端部署")
    
    # Zeabur 使用 PORT 8080
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"🌐 啟動 Flask 服務於端口: {port}")
    
    # 啟動 Flask 服務
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        threaded=True
    )