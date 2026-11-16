import os
from urllib.parse import urlsplit


def allowed_origins() -> list[str]:
    origins = [item.strip() for item in os.environ.get("ALLOWED_ORIGINS", "").split(",") if item.strip()]
    for origin in origins:
        url = urlsplit(origin)
        if (url.scheme not in {"http", "https"} or not url.hostname or url.path
                or url.query or url.fragment or url.username is not None
                or any(char.isspace() or char in "*?#" for char in origin)):
            raise ValueError("ALLOWED_ORIGINS requires comma-separated HTTP(S) origins with no path.")
        _ = url.port
    return origins


def unverified_providers_enabled() -> bool:
    return os.environ.get("ENABLE_UNVERIFIED_PROVIDERS", "").strip() == "1"


APP_NAME = "Earth Detective"
APP_VERSION = "0.1.0"
API_PREFIX = "/api/v1"
DATA_SOURCE = "nasa-power"
UNVERIFIED_PROVIDER_WARNING = "This provider is disabled for this release. Set ENABLE_UNVERIFIED_PROVIDERS=1 only for an explicitly tested deployment."
MAX_REQUEST_BODY_BYTES = 16_384
MAX_CONCURRENT_ANALYSES = 4
ANALYSIS_CACHE_MAX_SIZE = 32
ANALYSIS_CACHE_TTL_SECONDS = 300
