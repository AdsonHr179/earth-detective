"""Write the JSON Schema for newly created V1 analysis responses."""
import json
from pathlib import Path

from pydantic import TypeAdapter

from app.schemas import AnalysisResponse, NasaAnalysisResponse


def schema_for_new_analysis() -> dict:
    schema = TypeAdapter(NasaAnalysisResponse | AnalysisResponse).json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Earth Detective V1 analysis response"
    definitions = schema["$defs"]
    trend = definitions["TrendResult"]
    trend["required"] += ["inference_status", "inference_reason", "applicable", "alpha"]
    status = trend["properties"]["inference_status"]
    trend["properties"]["inference_status"] = status["anyOf"][0]
    trend["properties"]["inference_reason"].pop("default")
    evidence = ("p_value", "confidence_interval", "significant")
    trend["allOf"] = [
        {
            "if": {"properties": {"inference_status": {"const": "validated"}}},
            "then": {"properties": {
                "applicable": {"const": True}, "slope_per_decade": {"type": "number"},
                **{field: {"not": {"type": "null"}} for field in evidence},
            }},
            "else": {"properties": {
                "inference_reason": {"type": "string", "minLength": 1},
                **{field: {"type": "null"} for field in evidence},
            }},
        },
        {
            "if": {"properties": {"inference_status": {"const": "descriptive"}}},
            "then": {"properties": {"applicable": {"const": True}, "slope_per_decade": {"type": "number"}}},
        },
        {
            "if": {"properties": {"inference_status": {"enum": ["insufficient_data", "unsupported"]}}},
            "then": {"properties": {
                "applicable": {"const": False}, "slope_per_decade": {"type": "null"},
                "direction": {"const": "undetermined"},
            }},
        },
    ]
    definitions["SeriesPoint"]["properties"]["timestamp"]["format"] = "date"
    for field in definitions["RequestedPeriod"]["properties"].values():
        field["format"] = "date"
    for field in definitions["EffectivePeriod"]["properties"].values():
        field["anyOf"][0]["format"] = "date"

    # Require NASA-only fields on NASA responses while keeping the common shape open to additions.
    schema["if"] = {"properties": {"variable_id": {"pattern": "^nasa_"}}}
    schema["then"] = {"$ref": "#/$defs/NasaAnalysisResponse"}
    return schema


if __name__ == "__main__":
    target = Path(__file__).resolve().parents[1] / "contracts" / "analysis-response.schema.json"
    target.write_text(json.dumps(schema_for_new_analysis(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
