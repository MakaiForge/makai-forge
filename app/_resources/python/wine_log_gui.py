#!/usr/bin/env python3
"""
wine_log_gui.py — Tkinter GUI for displaying Wine/Proton output.

Modes:
  <command> [args...]   — Spawns the command and shows output live
  --tail <file>         — Watches a log file for changes (tail -f)

Note: avoids threading.Thread to prevent XInitThreads xcb crash on Linux.
"""

import sys
import os
import subprocess
import tkinter as tk
from tkinter import scrolledtext, filedialog
from datetime import datetime


BG = "#1e1e1e"
FG = "#d4d4d4"
BTN_BG = "#2d2d2d"
BTN_FG = "#d4d4d4"
SELECT_BG = "#264f78"
TEXT_BG = "#1e1e1e"
TEXT_FG = "#d4d4d4"

POLL_INTERVAL = 200  # ms between polling cycles


class WineLogGUI:
    def __init__(self, root, mode, command_or_file, args_or_none):
        self.root = root
        self.root.title("Makai Forger - Wine Log")
        self.root.geometry("900x600")
        self.root.configure(bg=BG)

        self.mode = mode
        self.running = True
        self.proc = None
        self.buffer = []

        log_dir = os.path.join(os.path.expanduser("~"), ".local", "share", "makai-forger", "logs")
        os.makedirs(log_dir, exist_ok=True)
        self.log_path = os.path.join(log_dir, "umu.log")

        style = {
            "bg": BG,
            "fg": FG,
            "insertbackground": FG,
            "selectbackground": SELECT_BG,
            "font": ("Monospace", 9),
        }

        self.text = scrolledtext.ScrolledText(
            root, wrap="word",
            padx=4, pady=4,
            **style,
        )
        self.text.pack(fill="both", expand=True, padx=5, pady=5)
        self.text.config(state="disabled")

        self.auto_scroll = tk.BooleanVar(value=True)

        btn_frame = tk.Frame(root, bg=BG)
        btn_frame.pack(fill="x", padx=5, pady=(0, 5))

        btn_style = {"bg": BTN_BG, "fg": BTN_FG, "activebackground": SELECT_BG, "bd": 1, "relief": "solid"}
        tk.Button(btn_frame, text="Save As...", command=self.save_as, **btn_style).pack(side="left", padx=2)
        tk.Button(btn_frame, text="Clear", command=self.clear, **btn_style).pack(side="left", padx=2)
        tk.Checkbutton(btn_frame, text="Auto-scroll", variable=self.auto_scroll, bg=BG, fg=FG,
                       selectcolor=BG, activebackground=BG, activeforeground=FG).pack(side="left", padx=10)
        tk.Button(btn_frame, text="Close", command=self.close, **btn_style).pack(side="right", padx=2)

        self.status = tk.Label(root, text="Starting...", anchor="w", bg=BG, fg="#888", font=("Sans", 8))
        self.status.pack(fill="x", padx=5, pady=(0, 5))

        root.protocol("WM_DELETE_WINDOW", self.close)

        if mode == "tail":
            self.filepath = command_or_file
            self.file_pos = 0
            if os.path.exists(self.filepath):
                self.file_pos = os.path.getsize(self.filepath)
                self._write(f"Tailing: {self.filepath}")
                self.status.config(text=f"Tailing {os.path.basename(self.filepath)}")
            else:
                self._write(f"Waiting for log file: {self.filepath}")
                self.status.config(text="Waiting for log file")
            root.after(POLL_INTERVAL, self._tail_poll)
        else:
            self._start_process(command_or_file, args_or_none)

    def _start_process(self, command, args):
        try:
            self.proc = subprocess.Popen(
                [command] + args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
                env={**os.environ},
            )
        except Exception as e:
            self._write(f"Failed to spawn: {e}")
            self.status.config(text="Failed to start")
            return

        self._write(f"Spawned PID {self.proc.pid}")
        self.status.config(text=f"Running (PID: {self.proc.pid})")
        root.after(POLL_INTERVAL, self._proc_poll)

    def _tail_poll(self):
        if not self.running:
            return
        try:
            size = os.path.getsize(self.filepath)
            if size > self.file_pos:
                with open(self.filepath, "r") as f:
                    f.seek(self.file_pos)
                    content = f.read()
                self.file_pos = size
                for line in content.split("\n"):
                    if line:
                        self._write(line)
            self.status.config(text=f"Tailing {os.path.basename(self.filepath)} ({size} bytes)")
        except Exception:
            pass
        self.root.after(POLL_INTERVAL, self._tail_poll)

    def _proc_poll(self):
        if not self.running or not self.proc:
            return
        ret = self.proc.poll()
        if ret is not None:
            self._write(f"Exited with code {ret}")
            self.status.config(text=f"Exited (code: {ret})")
            self.proc = None
            return
        try:
            for raw_line in iter(self.proc.stdout.readline, b""):
                line = raw_line.decode("utf-8", errors="replace").rstrip("\n").rstrip("\r")
                if line:
                    self._write(line)
        except (ValueError, OSError):
            pass
        self.root.after(POLL_INTERVAL, self._proc_poll)

    def _write(self, text):
        ts = datetime.now().isoformat()
        line = f"[{ts}] {text}"
        with open(self.log_path, "a") as f:
            f.write(line + "\n")
        self.text.config(state="normal")
        self.text.insert("end", line + "\n")
        if self.auto_scroll.get():
            self.text.see("end")
        self.text.config(state="disabled")

    def save_as(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".log",
            filetypes=[("Log files", "*.log"), ("All files", "*.*")],
        )
        if path:
            content = self.text.get("1.0", "end-1c")
            with open(path, "w") as f:
                f.write(content)

    def clear(self):
        self.text.config(state="normal")
        self.text.delete("1.0", "end")
        self.text.config(state="disabled")

    def close(self):
        self.running = False
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
        self.root.destroy()


def main():
    if len(sys.argv) < 2:
        print("Usage:", file=sys.stderr)
        print("  wine_log_gui.py <command> [args...]", file=sys.stderr)
        print("  wine_log_gui.py --tail <file>", file=sys.stderr)
        sys.exit(1)

    root = tk.Tk()

    if sys.argv[1] == "--tail":
        if len(sys.argv) < 3:
            print("Usage: wine_log_gui.py --tail <file>", file=sys.stderr)
            sys.exit(1)
        app = WineLogGUI(root, "tail", sys.argv[2], None)
    else:
        app = WineLogGUI(root, "run", sys.argv[1], sys.argv[2:])

    root.mainloop()


if __name__ == "__main__":
    main()
