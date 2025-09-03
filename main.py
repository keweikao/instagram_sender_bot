#!/usr/bin/env python3
"""
Instagram DM Bot 主啟動檔案
根據環境變數決定啟動哪個版本
"""

import os
import sys

# 檢查是否為簡化測試模式
if os.environ.get('SIMPLE_MODE', '').lower() == 'true':
    print("啟動簡化測試模式...")
    from simple_app import app
else:
    print("啟動完整版本...")
    from app import app

if __name__ == '__main__':
    # 獲取端口
    port = int(os.environ.get('PORT', 8080))
    print(f"🌐 服務啟動於: 0.0.0.0:{port}")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        threaded=True
    )