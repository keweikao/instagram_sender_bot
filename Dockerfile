FROM python:3.11-slim

WORKDIR /app

# 安裝系統依賴、Chrome 和對應的 ChromeDriver
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    jq \
    --no-install-recommends \
    # 設定 Chrome 的 apt repository
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
    # 安裝最新穩定版 Chrome
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    # 使用新的 JSON API 下載對應的 ChromeDriver
    && CHROME_VERSION=$(google-chrome --version | cut -d ' ' -f3) \
    && CD_URL=$(curl -s https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json | jq -r ".versions[] | select(.version == \"${CHROME_VERSION}\") | .downloads.chromedriver[] | select(.platform == \"linux64\") | .url") \
    && wget -O /tmp/chromedriver.zip "${CD_URL}" \
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