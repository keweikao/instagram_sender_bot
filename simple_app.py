#!/usr/bin/env python3
"""
簡化版本的 Instagram Bot - 用於測試 Zeabur 部署
"""

import os
import logging
from datetime import datetime
from flask import Flask, jsonify

# 設定日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/', methods=['GET'])
def home():
    """首頁 - 簡單測試"""
    logger.info("收到首頁請求")
    return jsonify({
        'service': 'Instagram DM Bot (Simple)',
        'status': 'running',
        'version': '1.0.0-simple',
        'timestamp': datetime.now().isoformat(),
        'message': 'Zeabur 部署測試成功！'
    })

@app.route('/health', methods=['GET'])
def health():
    """健康檢查"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/test', methods=['GET', 'POST'])
def test():
    """測試端點"""
    return jsonify({
        'success': True,
        'message': '測試成功',
        'env_vars': {
            'PORT': os.environ.get('PORT', 'Not set'),
            'INSTAGRAM_USERNAME': os.environ.get('INSTAGRAM_USERNAME', 'Not set'),
        }
    })

if __name__ == '__main__':
    logger.info("🚀 簡化版 Instagram Bot 啟動中...")
    
    # 獲取端口
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"🌐 服務啟動於: 0.0.0.0:{port}")
    
    try:
        app.run(
            host='0.0.0.0',
            port=port,
            debug=True,  # 開啟 debug 以獲得更多資訊
            threaded=True
        )
    except Exception as e:
        logger.error(f"❌ 啟動失敗: {e}")
        raise