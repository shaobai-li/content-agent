# ========== 阶段一：安装依赖 ==========
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ========== 阶段二：运行（仅拷贝依赖与代码） ==========
FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY . .

RUN find /usr/local/lib/python3.11 -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; \
    find /usr/local/lib/python3.11 -name "*.pyc" -delete 2>/dev/null; true

EXPOSE 8000
# 便于调试：可直接覆盖 CMD 进入 shell（docker run -it --entrypoint bash ...）
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
