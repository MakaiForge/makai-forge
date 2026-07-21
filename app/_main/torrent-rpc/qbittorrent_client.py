import http.client
import urllib.parse
import json
import logging

logger = logging.getLogger("protonforge.qbittorrent")


class QBittorrentClient:
    def __init__(self, host="localhost", port=3001):
        self.host = host
        self.port = port
        self.logged_in = True

    def request(self, method, path, data=None):
        conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": f"http://{self.host}:{self.port}",
        }

        try:
            if data:
                conn.request(
                    method, f"/{path}", urllib.parse.urlencode(data), headers
                )
            else:
                conn.request(method, f"/{path}", headers=headers)

            resp = conn.getresponse()
            text = resp.read().decode()

            try:
                return json.loads(text)
            except:
                return text
        except Exception as e:
            logger.error(f"QBittorrent API error: {e}")
            return {"error": str(e)}
        finally:
            conn.close()

    def get_torrents(self):
        result = self.request("GET", "torrents")
        if isinstance(result, list):
            return result
        return []

    def get_torrent(self, hash):
        torrents = self.get_torrents()
        for t in torrents:
            if t.get("hash", "").lower() == hash.lower():
                return t
        return None

    def add_magnet(self, magnet, save_path):
        result = self.request("POST", "add", {"url": magnet})
        return "Adicionado" in str(result) or result == "ok"

    def pause_torrent(self, hash):
        return self.request("GET", f"pause?hash={hash}")

    def resume_torrent(self, hash):
        return self.request("GET", f"resume?hash={hash}")

    def delete_torrent(self, hash, delete_files=False):
        return self.request("GET", f"delete?hash={hash}")

    def get_files(self, hash):
        return self.request("GET", f"files?hash={hash}")

    def map_state(self, state):
        state_map = {
            "metaDL": {"isDownloadingMetadata": True, "isCheckingFiles": False},
            "checking": {"isDownloadingMetadata": False, "isCheckingFiles": True},
            "checkingResumeData": {"isDownloadingMetadata": False, "isCheckingFiles": True},
            "downloading": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "forcedDL": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "seeding": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "forcedUpload": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "pausedDL": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "pausedUP": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "completed": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "moving": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "error": {"isDownloadingMetadata": False, "isCheckingFiles": False},
        }
        return state_map.get(state, {"isDownloadingMetadata": False, "isCheckingFiles": False})


qb_client = QBittorrentClient()