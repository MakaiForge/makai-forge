import logging
import sys


def setup_logger(name: str = "makrun") -> logging.Logger:
    log = logging.getLogger(name)
    handler = logging.StreamHandler(sys.stderr)
    fmt = logging.Formatter("%(name)s:%(funcName)s:%(lineno)d %(levelname)s: %(message)s")
    handler.setFormatter(fmt)
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    return log


log = setup_logger()
