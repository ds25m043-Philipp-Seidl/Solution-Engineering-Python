# services/seed/Dockerfile
FROM python:3.10-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY migrate.py .

# Run the script when the container starts
CMD ["python", "migrate.py"]