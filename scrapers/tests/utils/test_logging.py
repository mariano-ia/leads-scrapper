"""Test structured logging setup."""

from io import StringIO


def test_get_logger_returns_named_logger() -> None:
    from leads_scrapper.utils.logging import get_logger

    logger = get_logger("test.module")
    assert logger.name == "test.module"


def test_logger_outputs_structured_json() -> None:
    from leads_scrapper.utils.logging import get_logger, setup_logging

    buffer = StringIO()
    setup_logging(stream=buffer)
    logger = get_logger("test.json")
    logger.info("hello", extra={"company_id": "abc123"})

    output = buffer.getvalue()
    assert "hello" in output
    assert "company_id" in output
    assert "abc123" in output
