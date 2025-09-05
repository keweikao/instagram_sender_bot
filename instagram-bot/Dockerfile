FROM python:3.11-slim

WORKDIR /app

# 安裝系統依賴和 Chrome
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    curl \
    gnupg \
    ca-certificates \
    --no-install-recommends \
    # 新增 Google Chrome GPG 金鑰
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    # 清理
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/*




# 複製並安裝 Python 依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式
COPY . .

# 環境變數
ENV PYTHONPATH=/app
ENV FLASK_ENV=production

EXPOSE 8080

CMD ["python", "app.py"]