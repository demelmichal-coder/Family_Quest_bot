# Dockerfile pro backend (FastAPI, python:3.11-slim)
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./requirements.txt

# Explicitně upgraduj setuptools na nejnovější verzi před requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --upgrade setuptools \
    && pip install --no-cache-dir -r requirements.txt \
    && pip show setuptools

COPY ./ .

RUN chmod +x start.sh
EXPOSE 8000

# Default CMD - can be overridden by docker-compose command
CMD ["./start.sh"]
