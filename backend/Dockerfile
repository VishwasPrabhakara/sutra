FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app
COPY . .

# Cloud Run injects the PORT env var; uvicorn must listen on it
ENV PORT=8080
EXPOSE 8080

# Run with one worker — Cloud Run handles scaling
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}