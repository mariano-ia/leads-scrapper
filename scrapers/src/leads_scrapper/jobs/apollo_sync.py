"""Apollo sync job entry point.

Invocado por .github/workflows/apollo_sync.yml semanalmente.
Implementación completa en Week 2 plan.
"""

import argparse
import sys

from leads_scrapper.utils.logging import get_logger, setup_logging


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    logger = get_logger("apollo_sync")

    parser = argparse.ArgumentParser(description="Apollo sync job")
    parser.add_argument(
        "--mode",
        choices=["initial", "delta", "targeted_contacts"],
        default="delta",
    )
    args = parser.parse_args(argv)

    logger.info("apollo_sync starting", extra={"mode": args.mode})
    logger.warning("Week 1 stub: not implemented yet, exiting 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
