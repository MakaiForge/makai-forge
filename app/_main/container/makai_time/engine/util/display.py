from contextlib import contextmanager


@contextmanager
def xdisplay(no: str):
    d = None
    try:
        from Xlib import display as xdisplay
        d = xdisplay.Display(no)
        yield d
    finally:
        if d is not None:
            d.close()
