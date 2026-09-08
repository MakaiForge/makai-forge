#!/usr/bin/env python3
"""Wine log capture — spawns command, writes stdout/stderr to a log file.

Usage: wine_log.py --logfile <path> <command> [args...]

The child process gets its own session (start_new_session=True) so it
survives if this logger is killed or crashes.
"""

import sys
import os
import subprocess
import threading
from datetime import datetime


def main():
    if len(sys.argv) < 3 or sys.argv[1] != "--logfile":
        print("Usage: wine_log.py --logfile <path> <command> [args...]", file=sys.stderr)
        sys.exit(1)

    logfile = sys.argv[2]
    command = sys.argv[3]
    args = sys.argv[4:]

    ts = datetime.now().isoformat()
    try:
        proc = subprocess.Popen(
            [command] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            env={**os.environ},
        )
    except Exception as e:
        with open(logfile, "a") as f:
            f.write(f"[{ts}] Failed to spawn: {e}\n")
        sys.exit(1)

    with open(logfile, "w", buffering=1) as f:
        f.write(f"[{ts}] Spawned PID {proc.pid}\n")

        def _read_stream(stream):
            try:
                for raw_line in iter(stream.readline, b""):
                    line = raw_line.decode("utf-8", errors="replace").rstrip("\n").rstrip("\r")
                    if line:
                        f.write(line + "\n")
                        f.flush()
            except ValueError:
                pass
            finally:
                stream.close()

        t = threading.Thread(target=_read_stream, args=(proc.stdout,), daemon=True)
        t.start()

        proc.wait()
        t.join(timeout=5)

        ts = datetime.now().isoformat()
        f.write(f"[{ts}] Exited with code {proc.returncode}\n")


if __name__ == "__main__":
    main()
