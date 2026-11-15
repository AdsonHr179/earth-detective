import os

APP_NAME = "Earth Detective"
APP_VERSION = "0.1.0"
API_PREFIX = "/api/v1"
DATA_SOURCE = "meteomatics"
CORS_ORIGINS = tuple(
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
)
MAX_REQUEST_BODY_BYTES = 16_384
MAX_CONCURRENT_ANALYSES = 4
ANALYSIS_CACHE_MAX_SIZE = 32
ANALYSIS_CACHE_TTL_SECONDS = 300
