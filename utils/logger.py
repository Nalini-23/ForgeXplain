"""
logger.py
---------
Centralized logging setup. Every module calls get_logger(__name__) so logs
are consistently formatted and written both to console and to a rotating
log file under /logs, which is useful for debugging in Docker/production.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from utils.config import LOGS_DIR

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:  # avoid duplicate handlers on Streamlit re-runs
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    try:
        file_handler = RotatingFileHandler(
            LOGS_DIR / "forgexplain.log", maxBytes=2_000_000, backupCount=3
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except OSError:
        pass  # read-only filesystem fallback (e.g. some cloud environments)

    logger.propagate = False
    return logger
