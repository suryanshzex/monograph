FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
CMD ["gunicorn", "main:app", "--bind", "0.0.0.0:${PORT}", "--workers", "2", "--threads", "4", "--timeout", "120"]