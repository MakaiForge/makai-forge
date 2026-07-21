import hmac
import json
import logging
import re
import sys
import threading
import time
import urllib.parse
import http.client
from typing import Any, Optional

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("protonforge.rpc")


class QBittorrentClient:
    def __init__(self, host="localhost", port=8080, max_retries=3, retry_delay=1):
        self.host = host
        self.port = port
        self.logged_in = True
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def request(self, method, path, data=None):
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": f"http://{self.host}:{self.port}",
        }

        last_error = None
        for attempt in range(self.max_retries):
            conn = http.client.HTTPConnection(self.host, self.port, timeout=10)
            try:
                if data:
                    conn.request(method, f"/api/v2/{path}", urllib.parse.urlencode(data), headers)
                else:
                    conn.request(method, f"/api/v2/{path}", headers=headers)

                resp = conn.getresponse()
                text = resp.read().decode()

                try:
                    return json.loads(text)
                except:
                    return text
            except Exception as e:
                last_error = e
                is_connection_error = isinstance(e, ConnectionRefusedError) or (
                    isinstance(e, OSError) and e.errno == 111
                )
                if is_connection_error and attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                    continue
            finally:
                conn.close()

        logger.error(f"QBittorrent API error: {last_error}")
        return {"error": str(last_error)}

    def get_torrents(self):
        result = self.request("GET", "torrents/info")
        if isinstance(result, list):
            return result
        return []

    def get_torrent(self, hash):
        result = self.request("GET", f"torrents/info?hash={hash}")
        if isinstance(result, list) and len(result) > 0:
            return result[0]
        return None

    def add_magnet(self, magnet, save_path):
        result = self.request("POST", "torrents/add", {"urls": magnet, "savepath": save_path})
        return "Ok" in str(result) or result == True

    def pause_torrent(self, hash):
        return self.request("POST", "torrents/pause", {"hashes": hash})

    def resume_torrent(self, hash):
        return self.request("POST", "torrents/resume", {"hashes": hash})

    def delete_torrent(self, hash, delete_files=False):
        return self.request("POST", "torrents/delete", {"hashes": hash, "deleteFiles": "true" if delete_files else "false"})

    def map_state(self, state):
        state_map = {
            "metaDL": {"isDownloadingMetadata": True, "isCheckingFiles": False},
            "checking": {"isDownloadingMetadata": False, "isCheckingFiles": True},
            "downloading": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "seeding": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "pausedDL": {"isDownloadingMetadata": False, "isCheckingFiles": False},
            "completed": {"isDownloadingMetadata": False, "isCheckingFiles": False},
        }
        return state_map.get(state, {"isDownloadingMetadata": False, "isCheckingFiles": False})


qb_client = QBittorrentClient()


def parse_cli_args(argv):
    if len(argv) >= 6:
        return (argv[1], argv[3], argv[4], argv[5])
    if len(argv) >= 5:
        return (argv[1], argv[2], argv[3], argv[4])
    if len(argv) >= 4:
        return (argv[1], "", argv[2], argv[3])
    raise ValueError("invalid_arguments")


torrent_port, rpc_password, start_download_payload, start_seeding_payload = parse_cli_args(sys.argv)

downloads = {}
downloads_lock = threading.RLock()
downloading_game_id = -1

MAGNET_HASH_HEX_RE = re.compile(r"^[a-fA-F0-9]{40}$")
MAGNET_HASH_BASE32_RE = re.compile(r"^[a-zA-Z2-7]{32}$")

TORRENT_FILES_CACHE_TTL_SECONDS = 300
TORRENT_FILES_CACHE_MAX_ITEMS = 128
torrent_files_cache = {}
torrent_files_cache_lock = threading.RLock()
stdout_lock = threading.RLock()


class RpcError(Exception):
    def __init__(self, code: str, message: Optional[str] = None):
        super().__init__(message or code)
        self.code = code
        self.message = message or code


def load_json_payload(raw_payload: str):
    if not raw_payload:
        return None
    return json.loads(urllib.parse.unquote(raw_payload))


def validate_magnet_uri(magnet: str):
    if not isinstance(magnet, str):
        raise ValueError("invalid_magnet")
    magnet = magnet.strip()
    if not magnet.startswith("magnet:"):
        raise ValueError("invalid_magnet")
    if len(magnet) > 8192:
        raise ValueError("invalid_magnet")
    parsed = urllib.parse.urlparse(magnet)
    query = urllib.parse.parse_qs(parsed.query)
    xt_values = query.get("xt") or []
    info_hash = None
    for xt in xt_values:
        if not xt.startswith("urn:btih:"):
            continue
        hash_candidate = xt[len("urn:btih:"):].strip()
        if MAGNET_HASH_HEX_RE.match(hash_candidate) or MAGNET_HASH_BASE32_RE.match(hash_candidate):
            info_hash = hash_candidate.lower()
            break
    if info_hash is None:
        raise ValueError("invalid_magnet")
    return magnet, info_hash


def get_cached_torrent_files(info_hash: str):
    with torrent_files_cache_lock:
        item = torrent_files_cache.get(info_hash)
        if not item:
            return None
        if time.time() - item["timestamp"] > TORRENT_FILES_CACHE_TTL_SECONDS:
            torrent_files_cache.pop(info_hash, None)
            return None
        return item["value"]


def set_cached_torrent_files(info_hash: str, value):
    with torrent_files_cache_lock:
        if len(torrent_files_cache) >= TORRENT_FILES_CACHE_MAX_ITEMS:
            oldest_key = min(torrent_files_cache, key=lambda k: torrent_files_cache[k]["timestamp"])
            torrent_files_cache.pop(oldest_key, None)
        torrent_files_cache[info_hash] = {"timestamp": time.time(), "value": value}


def validate_rpc_password_value(password: Optional[str]):
    if rpc_password == "":
        return True
    if not isinstance(password, str):
        return False
    return hmac.compare_digest(password, rpc_password)


def start_torrent_download(game_id, url, save_path):
    global downloading_game_id
    if not url.startswith("magnet"):
        raise RpcError("invalid_url", "Only magnet links supported")

    success = qb_client.add_magnet(url, save_path)
    if not success:
        raise RpcError("torrent_add_failed", "Failed to add magnet to QBittorrent")

    time.sleep(2)
    torrents = qb_client.get_torrents()
    hash = None
    for t in torrents:
        if t.get("name", "").startswith("magnet"):
            hash = t.get("hash")
            break

    with downloads_lock:
        downloads[game_id] = {"hash": hash, "save_path": save_path}

    downloading_game_id = game_id
    logger.info(f"Started download for {game_id} with hash {hash}")


def bootstrap_downloads():
    global downloading_game_id
    initial_download = load_json_payload(start_download_payload)
    if initial_download:
        downloading_game_id = initial_download["game_id"]
        try:
            if initial_download["url"].startswith("magnet"):
                start_torrent_download(initial_download["game_id"], initial_download["url"], initial_download["save_path"])
        except Exception as error:
            downloading_game_id = -1
            logger.error("Error starting initial download: %s", error)


def map_qbittorrent_state_to_libtorrent(state):
    state_map = {
        "metaDL": 2,
        "forcedMetaDL": 2,
        "checkingDL": 1,
        "checkingUP": 1,
        "checkingResumeData": 1,
        "allocating": 1,
        "downloading": 3,
        "forcedDL": 3,
        "stalledDL": 3,
        "uploading": 5,
        "forcedUP": 5,
        "stalledUP": 5,
        "completed": 4,
        "pausedUP": 4,
        "pausedDL": 0,
        "queuedDL": 0,
        "queuedUP": 0,
        "moving": 0,
        "error": 0,
        "missingFiles": 0,
        "unknown": 0,
    }
    return state_map.get(state, 0)


def status():
    with downloads_lock:
        game_id = downloading_game_id
    if game_id == -1:
        return None
    download_info = downloads.get(game_id)
    if not download_info:
        return None
    hash = download_info.get("hash")
    if not hash:
        return None
    torrent = qb_client.get_torrent(hash)
    if not torrent:
        return None
    qb_state = torrent.get("state", 0)
    status_code = map_qbittorrent_state_to_libtorrent(qb_state)
    return {
        "folderName": torrent.get("name", ""),
        "fileSize": torrent.get("size", 0),
        "progress": torrent.get("progress", 0),
        "downloadSpeed": torrent.get("dlspeed", 0),
        "uploadSpeed": torrent.get("upspeed", 0),
        "numPeers": torrent.get("num_leechs", 0),
        "numSeeds": torrent.get("num_seeds", 0),
        "status": status_code,
        "bytesDownloaded": int(torrent.get("progress", 0) * torrent.get("size", 0)),
    }


def seed_status():
    with downloads_lock:
        items = list(downloads.items())
    seed_payload = []
    for game_id, info in items:
        if not info:
            continue
        hash = info.get("hash")
        if not hash:
            continue
        torrent = qb_client.get_torrent(hash)
        if not torrent:
            continue
        qb_state = torrent.get("state", "")
        status_code = map_qbittorrent_state_to_libtorrent(qb_state)
        if qb_state in ["uploading", "forcedUP", "stalledUP"]:
            seed_payload.append({
                "gameId": game_id,
                "folderName": torrent.get("name", ""),
                "fileSize": torrent.get("size", 0),
                "progress": torrent.get("progress", 0),
                "downloadSpeed": torrent.get("dlspeed", 0),
                "uploadSpeed": torrent.get("upspeed", 0),
                "numPeers": torrent.get("num_leechs", 0),
                "numSeeds": torrent.get("num_seeds", 0),
                "status": status_code,
                "bytesDownloaded": int(torrent.get("progress", 0) * torrent.get("size", 0)),
            })
    return seed_payload


def set_download_limit(limit_bytes: Optional[int]):
    if limit_bytes is None or limit_bytes < 0:
        qb_client.request("POST", "api/v2/transfer/setDownloadLimit", {"limit": -1})
    else:
        qb_client.request("POST", "api/v2/transfer/setDownloadLimit", {"limit": limit_bytes})


def action(data: Optional[dict] = None):
    global downloading_game_id
    data = data or {}
    action_name = data.get("action")
    game_id = data.get("game_id")
    if not action_name:
        raise RpcError("invalid_action")
    requires_game_id = {"start", "pause", "cancel", "resume_seeding", "pause_seeding"}
    if action_name in requires_game_id and not game_id:
        raise RpcError("invalid_game_id")

    try:
        if action_name == "start":
            url = data.get("url")
            if not isinstance(url, str):
                raise RpcError("invalid_url")
            save_path = data.get("save_path")
            if not isinstance(save_path, str):
                raise RpcError("invalid_save_path")
            if url.startswith("magnet"):
                start_torrent_download(game_id, url, save_path)
            else:
                raise RpcError("invalid_url")
            downloading_game_id = game_id
        elif action_name == "pause":
            info = downloads.get(game_id)
            if info and info.get("hash"):
                qb_client.pause_torrent(info["hash"])
            if downloading_game_id == game_id:
                downloading_game_id = -1
        elif action_name == "cancel":
            info = downloads.pop(game_id, None)
            if info and info.get("hash"):
                qb_client.delete_torrent(info["hash"], False)
            if downloading_game_id == game_id:
                downloading_game_id = -1
        elif action_name == "resume_seeding":
            start_torrent_download(game_id, data["url"], data["save_path"])
        elif action_name == "pause_seeding":
            info = downloads.pop(game_id, None)
            if info and info.get("hash"):
                qb_client.delete_torrent(info["hash"], False)
        elif action_name == "set_download_limit":
            set_download_limit(data.get("max_download_speed_bytes_per_second"))
        else:
            raise RpcError("invalid_action")
    except RpcError:
        raise
    except Exception as error:
        raise RpcError("internal_error", str(error))
    return None


def write_response(payload: dict):
    serialized = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    with stdout_lock:
        sys.stdout.write(serialized + "\n")
        sys.stdout.flush()


def build_error_response(request_id: Any, code: str, message: Optional[str] = None):
    return {"id": request_id, "error": {"code": code, "message": message or code}}


def dispatch_method(method: str, params: Optional[dict]):
    if method == "status":
        return status()
    if method == "seed_status":
        return seed_status()
    if method == "action":
        return action(params)
    raise RpcError("method_not_found", f"Unknown method: {method}")


def handle_request(request_payload: dict):
    request_id = request_payload.get("id")
    method = request_payload.get("method")
    params = request_payload.get("params")
    rpc_password_value = request_payload.get("rpc_password")

    if not validate_rpc_password_value(rpc_password_value):
        write_response(build_error_response(request_id, "unauthorized", "Unauthorized"))
        return
    if request_id is None:
        write_response(build_error_response(None, "invalid_request", "Missing request id"))
        return
    if not isinstance(method, str) or not method:
        write_response(build_error_response(request_id, "invalid_method", "Invalid method"))
        return

    try:
        result = dispatch_method(method, params)
        write_response({"id": request_id, "result": result})
    except RpcError as error:
        write_response(build_error_response(request_id, error.code, error.message))
    except Exception as error:
        logger.error("Unhandled RPC dispatcher error: %s", error, exc_info=True)
        write_response(build_error_response(request_id, "internal_error", "internal_error"))


def start_stdio_rpc_loop():
    write_response({"event": "ready", "protocolVersion": 1})
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except Exception:
            write_response(build_error_response(None, "invalid_json", "Invalid JSON"))
            continue
        if not isinstance(payload, dict):
            write_response(build_error_response(None, "invalid_request", "Request must be an object"))
            continue
        thread = threading.Thread(target=handle_request, args=(payload,), daemon=True)
        thread.start()


bootstrap_downloads()

if __name__ == "__main__":
    start_stdio_rpc_loop()