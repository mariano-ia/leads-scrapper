"""Structured logging setup. JSON output para CI/GitHub Actions logs limpios."""

import json
import logging
import sys
from typing import IO, Any


class JsonFormatter(logging.Formatter):
    """Formatter que emite cada log como una línea JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        reserved = {
            "name", "msg", "args", "levelname", "levelno", "pathname",
            "filename", "module", "exc_info", "exc_text", "stack_info",
            "lineno", "funcName", "created", "msecs", "relativeCreated",
            "thread", "threadName", "processName", "process", "message",
        }
        for key, value in record.__dict__.items():
            if key not in reserved:
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def setup_logging(
    level: int = logging.INFO,
    stream: IO[str] | None = None,
) -> None:
    """Configura el root logger con JsonFormatter. Idempotente."""
    root = logging.getLogger()
    root.setLevel(level)
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Retorna un logger nombrado. Llamar setup_logging() una vez al inicio."""
    return logging.getLogger(name)
