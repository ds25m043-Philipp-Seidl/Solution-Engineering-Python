FROM python:3.10-slim
WORKDIR /app

# Install OS-level dependencies required by some ML libraries (like SciPy/NumPy)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install them
COPY requirements.txt .
# Use --no-cache-dir to keep the image size down
RUN pip install --no-cache-dir -r requirements.txt

# Copy your ML scripts and pre-trained model files (e.g., .pt or .pkl files)
COPY . .

# Expose the port for your Python API (FastAPI usually defaults to 8000)
EXPOSE 8000

# Start the FastAPI server using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]