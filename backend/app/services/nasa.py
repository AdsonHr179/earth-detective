from __future__ import annotations

import hashlib
import json
import math
import os
import time
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timezone
from functools import lru_cache
from threading import Lock
from urllib.parse import urlencode, urlsplit

import aiohttp
import h5py
import httpx
import numpy as np
from fsspec.implementations.http import HTTPFileSystem
from curl_cffi.requests.exceptions import RequestException as FetcherRequestError
from scrapling.fetchers import Fetcher

from app.schemas import SeriesPoint, VariableCatalogItem

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
POWER = "https://power.larc.nasa.gov/api/temporal/monthly/point"
ARCHIVE_HOST = "data.gesdisc.earthdata.nasa.gov"
MAX_MONTHS = 120
NASA_SITES = (
    ("imerg", "Dataset documentation", "https://gpm.nasa.gov/data/imerg"),
    ("merra2", "Dataset documentation", "https://gmao.gsfc.nasa.gov/gmao-products/merra-2/"),
    ("gldas", "Dataset documentation", "https://ldas.gsfc.nasa.gov/gldas"),
    ("earthdata", "Discovery and access", "https://www.earthdata.nasa.gov"),
    ("ges_disc", "Archive catalog", "https://disc.gsfc.nasa.gov/datasets?keywords=GLDAS"),
)
NASA_SITE_URLS = {site: url for site, _, url in NASA_SITES}


class NasaAccessError(Exception):
    pass


class NasaDataError(Exception):
    pass


@dataclass(frozen=True)
class Product:
    name: str
    unit: str
    description: str
    version: str
    source_url: str
    start: date
    variable: str
    collection: str | None = None
    end: date | None = None
    group: str = "/"
    longitude_first: bool = False


PRODUCTS = {
    "nasa_power_temperature": Product(
        "NASA POWER · Air temperature at 2 m", "°C",
        "Monthly mean temperature derived from MERRA-2 and distributed by NASA POWER.",
        "nasa-power-monthly", "https://power.larc.nasa.gov/docs/services/api/temporal/monthly/",
        date(1981, 1, 1), "T2M",
    ),
    "nasa_imerg_precipitation": Product(
        "IMERG Final V07 · Precipitation", "mm/month",
        "Monthly precipitation estimated by satellite and adjusted with rain gauge data.",
        "imerg-final-v07", NASA_SITE_URLS["imerg"], date(1998, 1, 1), "precipitation",
        "C2723754851-GES_DISC", date(2025, 9, 30), "/Grid", True,
    ),
    "nasa_merra2_temperature": Product(
        "MERRA-2 · Air temperature at 2 m", "°C",
        "Monthly mean air temperature from the MERRA-2 single-level diagnostics archive.",
        "merra2-5.12.4", NASA_SITE_URLS["merra2"], date(1980, 1, 1), "T2M",
        "C1276812859-GES_DISC",
    ),
    "nasa_gldas_soil_water": Product(
        "GLDAS Noah v2.1 · Soil water (0–10 cm)", "kg/m²",
        "Modeled monthly water mass per unit area in the top 10 cm of soil.",
        "gldas-noah-v2.1", NASA_SITE_URLS["gldas"], date(2000, 1, 1), "SoilMoi0_10cm_inst",
        "C1342986036-GES_DISC",
    ),
}


def catalogue() -> list[VariableCatalogItem]:
    return [
        VariableCatalogItem(
            id=key, name=product.name, unit=product.unit, description=product.description,
            source="NASA GES DISC" if product.collection else "NASA POWER / MERRA-2",
            group="NASA Earth data",
        )
        for key, product in PRODUCTS.items()
    ]


def earthdata_token() -> str:
    return os.environ.get("EARTHDATA_TOKEN", "").strip()


def product_end(product: Product) -> date | None:
    if not product.collection:
        return date(date.today().year - 1, 12, 31)
    return product.end


def _get(url: str, **kwargs):
    return Fetcher.get(url, timeout=12, retries=1, stealthy_headers=False, **kwargs)


def _json(url: str, params: dict) -> dict:
    try:
        response = _get(url, params=params)
        if response.status != 200:
            raise NasaDataError(f"NASA returned HTTP {response.status}.")
        payload = json.loads(response.body)
        if not isinstance(payload, dict):
            raise NasaDataError("NASA returned an unexpected data format.")
        return payload
    except (ValueError, OSError, RuntimeError, FetcherRequestError) as exc:
        raise NasaDataError("NASA data could not be retrieved or parsed.") from exc


_SOURCE_LOCK = Lock()


def source_pages() -> list[dict]:
    with _SOURCE_LOCK:
        return _source_pages(int(time.monotonic() // 3600))


@lru_cache(maxsize=1)
def _source_pages(_hour: int) -> list[dict]:
    sources = []
    for site, role, url in NASA_SITES:
        try:
            response = _get(url)
            row = {
                "id": site, "role": role, "url": url, "status": response.status,
                "title": response.css("title::text").get() if response.status == 200 else None,
                "description": (
                    response.css('meta[name="description"]::attr(content)').get()
                    if response.status == 200 else None
                ),
            }
        except Exception:
            row = {"id": site, "role": role, "url": url, "status": None, "title": None, "description": None}
        sources.append(row)
    return sources


def next_month(month: date) -> date:
    return date(month.year + (month.month == 12), month.month % 12 + 1, 1)


def full_months(start: date, end: date) -> list[date]:
    month = start.replace(day=1)
    if start.day != 1:
        month = next_month(month)
    months = []
    while (month.year, month.month) <= (end.year, end.month):
        if month.year == end.year and month.month == end.month and end.day < monthrange(end.year, end.month)[1]:
            break
        months.append(month)
        if len(months) > MAX_MONTHS:
            raise ValueError(f"Select up to {MAX_MONTHS} complete calendar months for a NASA analysis.")
        if (month.year, month.month) == (end.year, end.month):
            break
        month = next_month(month)
    if not months:
        raise ValueError("The requested period must include a complete calendar month.")
    return months


def _archive_urls(product: Product, months: list[date]) -> dict[date, str]:
    last = months[-1]
    end = last.replace(day=monthrange(last.year, last.month)[1])
    payload = _json(CMR, {
        "collection_concept_id": product.collection,
        "temporal": f"{months[0]}T00:00:00Z,{end}T23:59:59Z",
        "page_size": len(months) + 2,
    })
    try:
        entries = payload["feed"]["entry"]
        expected = set(months)
        urls = {}
        for entry in entries:
            month = date.fromisoformat(entry["time_start"][:10]).replace(day=1)
            if month not in expected:
                continue
            for link in entry.get("links", []):
                href = link.get("href", "")
                parsed = urlsplit(href)
                if (
                    not link.get("inherited") and link.get("rel", "").endswith("/data#")
                    and parsed.scheme == "https" and parsed.netloc == ARCHIVE_HOST
                    and parsed.path.startswith("/data/") and parsed.path.lower().endswith((".nc4", ".hdf5"))
                ):
                    urls[month] = href
                    break
        if expected and entries and not urls:
            raise NasaDataError("NASA CMR returned no usable archive download URLs.")
        return urls
    except (KeyError, TypeError, ValueError) as exc:
        raise NasaDataError("NASA CMR returned unexpected granule metadata.") from exc


def _cell_value(handle: h5py.File, product: Product, latitude: float, longitude: float, month: date) -> float | None:
    group = handle[product.group]
    latitudes = np.asarray(group["lat"][:])
    longitudes = np.asarray(group["lon"][:])
    dataset = group[product.variable]
    expected_shape = (
        (1, len(longitudes), len(latitudes)) if product.longitude_first
        else (1, len(latitudes), len(longitudes))
    )
    if dataset.shape != expected_shape:
        raise NasaDataError("The NASA archive grid layout is different from the configured product.")
    half_step = abs(float(latitudes[1]) - float(latitudes[0])) / 2
    if not float(latitudes.min()) - half_step <= latitude <= float(latitudes.max()) + half_step:
        return None
    lat_index = int(np.argmin(np.abs(latitudes - latitude)))
    lon_index = int(np.argmin(np.abs((longitudes - longitude + 180) % 360 - 180)))
    raw = float(dataset[0, lon_index, lat_index] if product.longitude_first else dataset[0, lat_index, lon_index])
    if not math.isfinite(raw) or raw <= -9990 or abs(raw) >= 1e14:
        return None
    for attr in ("_FillValue", "missing_value"):
        if attr in dataset.attrs and raw in np.asarray(dataset.attrs[attr]).ravel():
            return None
    scale = float(np.asarray(dataset.attrs.get("scale_factor", 1)).ravel()[0])
    offset = float(np.asarray(dataset.attrs.get("add_offset", 0)).ravel()[0])
    value = raw * scale + offset
    if product.longitude_first:
        value *= monthrange(month.year, month.month)[1] * 24
    elif product.variable == "T2M":
        value -= 273.15
    return value if math.isfinite(value) and (product.variable == "T2M" or value >= 0) else None


def _archive_values(product: Product, months: list[date], latitude: float, longitude: float) -> dict[date, float | None]:
    token = earthdata_token()
    if not token:
        raise NasaAccessError("Set EARTHDATA_TOKEN in the backend environment to access this NASA archive.")
    urls = _archive_urls(product, months)
    filesystem = HTTPFileSystem(
        headers={"Accept-Encoding": "identity"},
        client_kwargs={"timeout": aiohttp.ClientTimeout(total=25)},
        skip_instance_cache=True,
    )
    values = {}
    with httpx.Client(follow_redirects=True, timeout=20) as archive:
        for month, url in urls.items():
            for attempt in range(2):
                try:
                    # Resolve the Earthdata redirect once and use the signed URL for the range reads.
                    with archive.stream("GET", url, headers={
                        "Authorization": f"Bearer {token}", "Range": "bytes=0-0",
                        "Accept-Encoding": "identity",
                    }) as probe:
                        if probe.status_code == 401 or probe.url.host == "urs.earthdata.nasa.gov":
                            raise NasaAccessError("Authorize NASA GESDISC DATA ARCHIVE in Earthdata Login and verify the token.")
                        probe.raise_for_status()
                        if probe.status_code != 206 or probe.url.scheme != "https":
                            raise NasaDataError("The NASA archive did not provide a ranged download.")
                        size = int(probe.headers["Content-Range"].rsplit("/", 1)[-1])
                        download_url = str(probe.url)
                    with filesystem.open(
                        download_url, "rb", size=size, block_size=262144,
                        cache_type="blockcache", cache_options={"maxblocks": 12},
                    ) as remote:
                        with h5py.File(remote, "r") as handle:
                            values[month] = _cell_value(handle, product, latitude, longitude, month)
                    break
                except (OSError, KeyError, IndexError, ValueError, aiohttp.ClientError, httpx.HTTPError) as exc:
                    if attempt == 1:
                        raise NasaDataError(f"NASA archive transfer failed for {month:%Y-%m}.") from exc
    return values


def _power_values(
    months: list[date], latitude: float, longitude: float,
) -> tuple[dict[date, float], dict[str, str]]:
    params = {
        "parameters": "T2M", "community": "AG", "longitude": longitude, "latitude": latitude,
        "format": "JSON", "start": months[0].year, "end": months[-1].year,
    }
    payload = _json(POWER, params)
    try:
        header = payload["header"]
        if header.get("sources") != ["MERRA2"]:
            raise NasaDataError("The NASA POWER response does not identify MERRA-2 as its sole source.")
        if payload["parameters"]["T2M"]["units"] != "C":
            raise NasaDataError("NASA POWER returned an unexpected temperature unit.")
        missing = header["fill_value"]
        if type(missing) not in (int, float) or not math.isfinite(missing):
            raise NasaDataError("NASA POWER returned an invalid missing-value marker.")
        months_by_key = payload["properties"]["parameter"]["T2M"]
        values = {}
        for month in months:
            value = months_by_key.get(month.strftime("%Y%m"))
            if type(value) in (int, float) and value != missing and math.isfinite(value):
                values[month] = float(value)
        # Hash canonical JSON so whitespace changes do not change the revision fingerprint.
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        provenance = {
            "query_url": f"{POWER}?{urlencode(params)}",
            "response_sha256": hashlib.sha256(encoded).hexdigest(),
            "source_api_version": header["api"]["version"],
            "time_standard": header["time_standard"],
        }
        return values, provenance
    except (KeyError, TypeError, AttributeError, OverflowError) as exc:
        raise NasaDataError("NASA POWER returned an unexpected monthly series.") from exc


@dataclass(frozen=True)
class MonthlyObservations:
    series: list[SeriesPoint]
    retrieved_at: str
    provenance: dict[str, str]


def monthly_series(product: Product, months: list[date], latitude: float, longitude: float) -> MonthlyObservations:
    if product.collection:
        values, provenance = _archive_values(product, months, latitude, longitude), {"collection": product.collection}
    else:
        values, provenance = _power_values(months, latitude, longitude)
    return MonthlyObservations(
        series=[
            SeriesPoint(
                timestamp=month.isoformat(), value=values.get(month), unit=product.unit,
                quality_flags="ok" if values.get(month) is not None else "missing",
                coverage_fraction=1.0 if values.get(month) is not None else 0.0,
            )
            for month in months
        ],
        retrieved_at=datetime.now(timezone.utc).isoformat(),
        provenance=provenance,
    )
