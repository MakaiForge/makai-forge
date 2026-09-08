import os
from contextlib import contextmanager
from fcntl import LOCK_EX, LOCK_UN, flock


@contextmanager
def unix_flock(path: str):
    fd = None
    try:
        fd = os.open(path, os.O_CREAT | os.O_WRONLY, 0o644)
        flock(fd, LOCK_EX)
        yield
    finally:
        if fd is not None:
            flock(fd, LOCK_UN)
            os.close(fd)
