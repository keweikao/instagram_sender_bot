FROM python:3.11-slim

WORKDIR /app

# 安裝系統依賴，並直接下載固定版本的 Chrome 和對應的 ChromeDriver
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    --no-install-recommends \
    # 下載並安裝固定版本的 Chrome
    && wget -O /tmp/chrome.zip "https://storage.googleapis.com/chrome-for-testing-public/128.0.6613.84/linux64/chrome-linux64.zip" \
    && unzip /tmp/chrome.zip -d /opt/ \
    && rm /tmp/chrome.zip \
    # 建立一個符號連結，讓 Selenium 能找到 Chrome
    && ln -s /opt/chrome-linux64/chrome /usr/bin/google-chrome \
    # 下載並安裝對應版本的 ChromeDriver
    && wget -O /tmp/chromedriver.zip "https://storage.googleapis.com/chrome-for-testing-public/128.0.6613.84/linux64/chromedriver-linux64.zip" \
    && unzip /tmp/chromedriver.zip -d /usr/local/bin/ \
    && rm /tmp/chromedriver.zip \
    && chmod +x /usr/local/bin/chromedriver \
    # 清理 apt cache
    && rm -rf /var/lib/apt/lists/*




# 複製並安裝 Python 依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式
COPY . .

# 環境變數
ENV PYTHONPATH=/app
ENV FLASK_ENV=production

EXPOSE 8080

CMD ["python", "simple_app.py"]