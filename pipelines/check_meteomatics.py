from __future__ import annotations

import datetime as dt
import logging
import os
from pathlib import Path

import meteomatics.api as api
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")
logging.getLogger(api.__name__).setLevel(logging.WARNING)


def main() -> None:
    username = os.environ.get("METEOMATICS_USERNAME")
    password = os.environ.get("METEOMATICS_PASSWORD")
    if not username or not password:
        raise SystemExit(
            "Set METEOMATICS_USERNAME and METEOMATICS_PASSWORD in the environment."
        )

    coordinates = [(47.4202, 9.3698)]
    parameters = [
        "t_2m:C",
        "precip_1h:mm",
        "wind_speed_10m:ms",
        "wind_dir_10m:d",
    ]
    start = dt.datetime.now(dt.timezone.utc).replace(
        minute=0, second=0, microsecond=0
    )
    end = start + dt.timedelta(days=3)

    result = api.query_time_series(
        coordinates,
        start,
        end,
        dt.timedelta(hours=1),
        parameters,
        username,
        password,
        model="mix",
    )
    print(result)


if __name__ == "__main__":
    main()
