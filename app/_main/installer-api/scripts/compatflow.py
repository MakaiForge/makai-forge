#!/usr/bin/env python3
"""
CompatFlow - Verificador de Compatibilidade + Ports
"""

import sys
import os
import json
import hashlib
import requests
from datetime import datetime
import subprocess

try:
    from PySide6.QtWidgets import (QApplication, QWidget, QLabel, QPushButton,
                                    QVBoxLayout, QHBoxLayout, QFrame, QMessageBox, 
                                    QInputDialog, QDialog, QTextEdit)
    from PySide6.QtCore import Qt
except:
    print("PySide6 necessário: pip3 install PySide6")
    sys.exit(1)

API = "https://api.github.com/repos/lucasgertke11-bot/distroforge-database"
GITHUB_API = "https://api.github.com/repos/lucasgertke11-bot/compatflow"
SUPABASE_URL = "https://ztxafyatsdxwhflyblyk.supabase.co"
SUPABASE_KEY = ""
CACHE_DIR = os.path.expanduser("~/.config/compatflow")
TOKEN_FILE = os.path.join(CACHE_DIR, "token")
CACHE_FILE = os.path.join(CACHE_DIR, "ports.json")
VERSIONS_FILE = os.path.join(CACHE_DIR, "version.json")


def get_token():
    return ""


def set_token(token):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(TOKEN_FILE, "w") as f:
        f.write(token)


def github_get(url):
    token = get_token()
    if not token:
        return None
    import requests
    r = requests.get(url, headers={"Authorization": f"token {token}"}, timeout=10)
    return r


def supabase_download(path):
    url = f"{SUPABASE_URL}/storage/v1/object/public/compatflow/{path}"
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            return resp.text
    except:
        pass
    return None


def supabase_upload(path, content, content_type="text/plain"):
    url = f"{SUPABASE_URL}/storage/v1/object/compatflow/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type
    }
    try:
        resp = requests.post(url, data=content.encode() if isinstance(content, str) else content, headers=headers)
        return resp.status_code in (200, 201)
    except:
        return False


NATIVE = {
    # NAVEGADORES
    "firefox": ("Firefox", "firefox", "Navegador"),
    "chrome": ("Chrome", "google-chrome-stable", "Navegador"),
    "edge": ("Edge", "microsoft-edge-stable", "Navegador"),
    "opera": ("Opera", "opera", "Navegador"),
    "brave": ("Brave", "brave-browser", "Navegador"),
    "vivaldi": ("Vivaldi", "vivaldi", "Navegador"),
    "chromium": ("Chromium", "chromium", "Navegador"),
    "maxthon": ("Maxthon", "maxthon", "Navegador"),
    "palemoon": ("Pale Moon", "palemoon", "Navegador"),
    "falkon": ("Falkon", "falkon", "Navegador"),
    "epiphany": ("Epiphany", "epiphany", "Navegador GNOME"),
    "konqueror": ("Konqueror", "konqueror", "Navegador KDE"),
    
    # COMUNICAÇÃO / MENSAGENS
    "discord": ("Discord", "discord", "Chat para gamers"),
    "telegram": ("Telegram", "telegram-desktop", "Mensagens"),
    "skype": ("Skype", "skypeforlinux", "Videochamadas"),
    "zoom": ("Zoom", "zoom", "Videochamadas"),
    "slack": ("Slack", "slack-desktop", "Trabalho"),
    "teams": ("Microsoft Teams", "teams", "Trabalho"),
    "signal": ("Signal", "signal-desktop", "Mensagens seguras"),
    "whatsapp": ("WhatsApp", "whatsapp-for-linux", "Mensagens"),
    "thunderbird": ("Thunderbird", "thunderbird", "Email"),
    "evolution": ("Evolution", "evolution", "Email/Calendário"),
    "geary": ("Geary", "geary", "Email GNOME"),
    "mumble": ("Mumble", "mumble", "Voz para jogos"),
    "vesktop": ("Vesktop", "vesktop", "Discord customizado"),
    
    # STREAMING / MÚSICA / VÍDEO
    "spotify": ("Spotify", "spotify", "Streaming de música"),
    "vlc": ("VLC", "vlc", "Reprodutor de mídia"),
    "mpv": ("MPV", "mpv", "Reprodutor de mídia"),
    "celluloid": ("Celluloid", "celluloid", "Reprodutor GNOME"),
    "smplayer": ("SMPlayer", "smplayer", "Reprodutor"),
    "kodi": ("Kodi", "kodi", "Media Center"),
    "plex": ("Plex", "plex-media-server", "Media Server"),
    "jellyfin": ("Jellyfin", "jellyfin", "Media Server"),
    "emby": ("Emby", "emby-server", "Media Server"),
    "strawberry": ("Strawberry", "strawberry", "Player música"),
    "rhythmbox": ("Rhythmbox", "rhythmbox", "Player música"),
    "audacious": ("Audacious", "audacious", "Player música"),
    "clementine": ("Clementine", "clementine", "Player música"),
    "deadbeef": ("DeaDBeeF", "deadbeef", "Player música"),
    
    # JOGOS / GAMING
    "steam": ("Steam", "steam", "Plataforma de jogos"),
    "epic": ("Epic Games", "heroic-games-launcher-bin", "Epic Games"),
    "gog": ("GOG Galaxy", "heroic-games-launcher-bin", "GOG"),
    "lutris": ("Lutris", "lutris", "Gerenciador de jogos"),
    "minecraft": ("Minecraft", "minecraft-launcher", "Jogo"),
    "minetest": ("Minetest", "minetest", "Jogo open source"),
    "superTuxKart": ("SuperTuxKart", "supertuxkart", "Jogo"),
    "xonotic": ("Xonotic", "xonotic", "Jogo FPS"),
    "warzone2100": ("Warzone 2100", "warzone2100", "Jogo RTS"),
    "openTTD": ("OpenTTD", "openttd", "Jogo simulação"),
    "openttd": ("OpenTTD", "openttd", "Jogo simulação"),
    "flightgear": ("FlightGear", "flightgear", "Simulador de voo"),
    "neverball": ("Neverball", "neverball", "Jogo"),
    
    # ESCRITÓRIO / PRODUTIVIDADE
    "libreoffice": ("LibreOffice", "libreoffice", "Escritório completo"),
    "onlyoffice": ("OnlyOffice", "onlyoffice-desktopeditors", "Escritório"),
    "wps": ("WPS Office", "wps-office", "Escritório"),
    "softmaker": ("SoftMaker Office", "softmaker-freeoffice", "Escritório"),
    "calligra": ("Calligra Suite", "calligra", "Escritório KDE"),
    "appimagehub": ("AppImageHub", "appimagehub", "Loja de apps"),
    "notion": ("Notion", "notion-app", "Notas"),
    "obsidian": ("Obsidian", "obsidian", "Notas Markdown"),
    "ticktick": ("TickTick", "ticktick", "Tarefas"),
    "todoist": ("Todoist", "todoist", "Tarefas"),
    "evernote": ("Evernote", "evernote", "Notas"),
    "joplin": ("Joplin", "joplin", "Notas"),
    "zettlr": ("Zettlr", "zettlr", "Editor Markdown"),
    "marktext": ("MarkText", "marktext", "Editor Markdown"),
    
    # EDITOR DE CÓDIGO / IDE
    "vscode": ("VS Code", "code", "Editor de código"),
    "vscodium": ("VSCodium", "vscodium", "Editor de código"),
    "sublime": ("Sublime Text", "sublime-text", "Editor de texto"),
    "gedit": ("gedit", "gedit", "Editor GNOME"),
    "kate": ("Kate", "kate", "Editor KDE"),
    "atom": ("Atom", "atom", "Editor GitHub"),
    "brackets": ("Brackets", "brackets", "Editor web"),
    "geany": ("Geany", "geany", "Editor leve"),
    "pluma": ("Pluma", "pluma", "Editor MATE"),
    "mousepad": ("Mousepad", "mousepad", "Editor XFCE"),
    "notepadqq": ("Notepadqq", "notepadqq", "Alternativa Notepad++"),
    "codeblocks": ("Code::Blocks", "codeblocks", "IDE C/C++"),
    "eclipse": ("Eclipse", "eclipse", "IDE Java"),
    "intellij": ("IntelliJ IDEA", "intellij-idea-community", "IDE Java/Kotlin"),
    "clion": ("CLion", "clion", "IDE C/C++"),
    "pycharm": ("PyCharm", "pycharm-community", "IDE Python"),
    "rider": ("Rider", "rider", "IDE .NET"),
    "goland": ("GoLand", "goland", "IDE Go"),
    "phpstorm": ("PHPStorm", "phpstorm", "IDE PHP"),
    "rubymine": ("RubyMine", "rubymine", "IDE Ruby"),
    "webstorm": ("WebStorm", "webstorm", "IDE JavaScript"),
    "datagrip": ("DataGrip", "datagrip", "IDE Database"),
    
    # DESIGN / IMAGENS / FOTOS
    "gimp": ("GIMP", "gimp", "Editor de imagens"),
    "inkscape": ("Inkscape", "inkscape", "Editor vetorial"),
    "blender": ("Blender", "blender", "3D"),
    "krita": ("Krita", "krita", "Pintura digital"),
    "scribus": ("Scribus", "scribus", "Editoração"),
    "darktable": ("Darktable", "darktable", "Fotografia RAW"),
    "rawtherapee": ("RawTherapee", "rawtherapee", "Fotografia RAW"),
    "digikam": ("DigiKam", "digikam", "Gerenciador fotos"),
    "gwenview": ("Gwenview", "gwenview", "Visualizador KDE"),
    "eog": ("Eye of GNOME", "eog", "Visualizador GNOME"),
    "nomacs": ("Nomacs", "nomacs", "Visualizador"),
    "imagemagick": ("ImageMagick", "imagemagick", "CLI imagens"),
    "shotwell": ("Shotwell", "shotwell", "Gerenciador fotos"),
    "kolourpaint": ("KolourPaint", "kolourpaint", "Pintura KDE"),
    "digiKam": ("digiKam", "digikam", "Fotos"),
    
    # VÍDEO / STREAMING / GRAVAÇÃO
    "obs": ("OBS Studio", "obs-studio", "Gravação/Streaming"),
    "kdenlive": ("Kdenlive", "kdenlive", "Editor de vídeo"),
    "ffmpeg": ("FFmpeg", "ffmpeg", "Conversão de mídia"),
    "handbrake": ("HandBrake", "handbrake", "Conversor vídeo"),
    "avidemux": ("Avidemux", "avidemux", "Editor de vídeo"),
    "pitivi": ("PiTiVi", "pitivi", "Editor de vídeo GNOME"),
    "openshot": ("OpenShot", "openshot", "Editor de vídeo"),
    "shotcut": ("Shotcut", "shotcut", "Editor de vídeo"),
    "kazam": ("Kazam", "kazam", "Gravador de tela"),
    "peek": ("Peek", "peek", "GIF screencast"),
    "byzanz": ("Byzanz", "byzanz", "GIF screencast"),
    "vokoscreen": ("VokoSscreen", "vokoscreen", "Gravador de tela"),
    "simpleScreenRecorder": ("SimpleScreenRecorder", "simplescreenrecorder", "Gravador"),
    "miro": ("Miro", "miro", "Vídeo"),
    "daVinci": ("DaVinci Resolve", "davinci-resolve", "Editor profissional"),
    "davinci": ("DaVinci Resolve", "davinci-resolve", "Editor profissional"),
    "audacity": ("Audacity", "audacity", "Editor de áudio"),
    
    # REDE / INTERNET / FTP
    "filezilla": ("FileZilla", "filezilla", "FTP"),
    "cyberduck": ("Cyberduck", "cyberduck", "FTP/S3"),
    "nautilus": ("Nautilus", "nautilus", "Gerenciador GNOME"),
    "dolphin": ("Dolphin", "dolphin", "Gerenciador KDE"),
    "thunar": ("Thunar", "thunar", "Gerenciador XFCE"),
    "nemo": ("Nemo", "nemo", "Gerenciador Cinnamon"),
    "pcmanfm": ("PCManFM", "pcmanfm", "Gerenciador LXDE"),
    "qbt": ("qBittorrent", "qbittorrent", "Torrent"),
    "qbittorrent": ("qBittorrent", "qbittorrent", "Torrent"),
    "deluge": ("Deluge", "deluge", "Torrent"),
    "transmission": ("Transmission", "transmission-gtk", "Torrent"),
    "ktorrent": ("KTorrent", "ktorrent", "Torrent KDE"),
    "amule": ("aMule", "amule", "eDonkey"),
    
    # DESENVOLVIMENTO / DEV TOOLS
    "git": ("Git", "git", "Controle de versão"),
    "docker": ("Docker", "docker", "Containerização"),
    "postman": ("Postman", "postman", "API Testing"),
    "insomnia": ("Insomnia", "insomnia", "API Testing"),
    "curl": ("cURL", "curl", "HTTP CLI"),
    "wget": ("Wget", "wget", "Download CLI"),
    "ssh": ("OpenSSH", "openssh", "SSH"),
    "putty": ("PuTTY", "putty", "SSH/Telnet"),
    "terminator": ("Terminator", "terminator", "Terminal"),
    "guake": ("Guake", "guake", "Terminal dropdown"),
    "tilix": ("Tilix", "tilix", "Terminal tiling"),
    "kitty": ("Kitty", "kitty", "Terminal GPU"),
    "alacritty": ("Alacritty", "alacritty", "Terminal GPU"),
    "tmux": ("Tmux", "tmux", "Terminal multiplexador"),
    "screen": ("Screen", "screen", "Terminal multiplexador"),
    "ansible": ("Ansible", "ansible", "Automação"),
    "vagrant": ("Vagrant", "vagrant", "Dev environments"),
    "gradle": ("Gradle", "gradle", "Build tool"),
    "maven": ("Maven", "maven", "Build tool"),
    "cmake": ("CMake", "cmake", "Build system"),
    "make": ("Make", "make", "Build tool"),
    "gcc": ("GCC", "gcc", "Compilador"),
    "clang": ("Clang", "clang", "Compilador"),
    "rustc": ("Rust", "rustc", "Linguagem"),
    "go": ("Go", "go", "Linguagem"),
    "python": ("Python", "python3", "Linguagem"),
    "nodejs": ("Node.js", "nodejs", "Runtime JS"),
    "npm": ("NPM", "npm", "Gerenciador pacotes JS"),
    "yarn": ("Yarn", "yarn", "Gerenciador pacotes JS"),
    
    # SERVIDORES / BANCO DE DADOS
    "mysql": ("MySQL", "mysql", "Banco de dados"),
    "mariadb": ("MariaDB", "mariadb", "Banco de dados"),
    "postgresql": ("PostgreSQL", "postgresql", "Banco de dados"),
    "sqlite": ("SQLite", "sqlite3", "Banco de dados"),
    "mongodb": ("MongoDB", "mongodb", "Banco NoSQL"),
    "redis": ("Redis", "redis", "Cache"),
    "apache": ("Apache", "apache2", "Servidor web"),
    "nginx": ("Nginx", "nginx", "Servidor web"),
    "lighttpd": ("Lighttpd", "lighttpd", "Servidor web"),
    
    # UTILITÁRIOS / SISTEMA
    "virtualbox": ("VirtualBox", "virtualbox", "Virtualização"),
    "qemu": ("QEMU", "qemu", "Virtualização"),
    "gnome-boxes": ("GNOME Boxes", "gnome-boxes", "Virtualização"),
    "virt-manager": ("Virt Manager", "virt-manager", "Virtualização"),
    "boxes": ("GNOME Boxes", "gnome-boxes", "Virtualização"),
    "keepassxc": ("KeePassXC", "keepassxc", "Gerenciador senhas"),
    "bitwarden": ("Bitwarden", "bitwarden", "Senhas"),
    "veracrypt": ("VeraCrypt", "veracrypt", "Criptografia"),
    "gnupg": ("GPG", "gnupg", "Criptografia"),
    "openssl": ("OpenSSL", "openssl", "SSL/TLS"),
    "timeshift": ("Timeshift", "timeshift", "Backup sistema"),
    "backintime": ("Back In Time", "backintime", "Backup"),
    "grsync": ("Grsync", "grsync", "Rsync GUI"),
    "system-config": ("System Config", "system-config-printer", "Impressoras"),
    "cups": ("CUPS", "cups", "Sistema de impressão"),
    "hplip": ("HPLIP", "hplip", "Impressoras HP"),
    "stacer": ("Stacer", "stacer", "Otimizador"),
    "bleachbit": ("BleachBit", "bleachbit", "Limpeza"),
    "gparted": ("GParted", "gparted", "Gerenciador de discos"),
    "gnome-disks": ("Disks", "gnome-disks", "Gerenciador de discos"),
    "baobab": ("Baobab", "baobab", "Uso de disco"),
    "filelight": ("Filelight", "filelight", "Uso de disco"),
    "htop": ("Htop", "htop", "Monitor de processos"),
    "btop": ("Btop", "btop", "Monitor de recursos"),
    "bashtop": ("Bashtop", "bashtop", "Monitor de recursos"),
    "nvtop": ("NVTOP", "nvtop", "Monitor GPU NVIDIA"),
    "wireshark": ("Wireshark", "wireshark", "Sniffer de rede"),
    "nmap": ("Nmap", "nmap", "Scanner de rede"),
    
    # COMPACTADORES / ARQUIVOS
    "7zip": ("7-Zip", "p7zip-full", "Compactador"),
    "winrar": ("7-Zip", "p7zip-full", "Compactador"),
    "peazip": ("PeaZip", "peazip", "Compactador"),
    "ark": ("Ark", "ark", "Compactador KDE"),
    "file-roller": ("File Roller", "file-roller", "Compactador GNOME"),
    "xarchiver": ("Xarchiver", "xarchiver", "Compactador"),
    "engrampa": ("Engrampa", "engrampa", "Compactador MATE"),
    
    # PDF / DOCUMENTOS
    "evince": ("Evince", "evince", "Leitor PDF GNOME"),
    "okular": ("Okular", "okular", "Leitor PDF KDE"),
    "zathura": ("Zathura", "zathura", "Leitor PDF minimalista"),
    "foxit": ("Foxit", "foxitreader", "Leitor PDF"),
    "pdfarranger": ("PDF Arranger", "pdfarranger", "Editar PDF"),
    "pdftk": ("PDFtk", "pdftk", "Ferramentas PDF"),
    "poppler": ("Poppler Utils", "poppler-utils", "Ferramentas PDF"),
    "libreoffice-draw": ("LibreOffice Draw", "libreoffice-draw", "PDF/Desenho"),
    
    # ACESSO REMOTO
    "anydesk": ("AnyDesk", "anydesk", "Acesso remoto"),
    "teamviewer": ("TeamViewer", "teamviewer", "Acesso remoto"),
    "parsec": ("Parsec", "parsec", "Jogar remotamente"),
    "sunshine": ("Sunshine", "sunshine", "Game streaming"),
    "moonlight": ("Moonlight", "moonlight", "Game streaming"),
    "remmina": ("Remmina", "remmina", "Escritório remoto"),
    "vinagre": ("Vinagre", "vinagre", "Escritório remoto"),
    "krdc": ("KRDC", "krdc", "Escritório remoto KDE"),
    "nomachine": ("NoMachine", "nomachine", "Acesso remoto"),
    "x2go": ("X2Go", "x2goclient", "Acesso remoto"),
    "sshfs": ("SSHFS", "sshfs", "Montar remote"),
    
    # CLOUD / STORAGE
    "dropbox": ("Dropbox", "dropbox", "Cloud storage"),
    "google-drive": ("Google Drive", "google-drive-ocamlfuse", "Cloud storage"),
    "mega": ("MEGA", "megasync", "Cloud storage"),
    "onedrive": ("OneDrive", "onedrive", "Cloud storage"),
    "insync": ("Insync", "insync", "Google Drive"),
    "rclone": ("Rclone", "rclone", "Cloud CLI"),
    
    # VIRTUALIZAÇÃO / EMULAÇÃO
    "dosbox": ("DOSBox", "dosbox", "Emulador DOS"),
    "dosemu": ("DOSEMU", "dosemu", "Emulador DOS"),
    "scummvm": ("ScummVM", "scummvm", "Emulador jogos antigos"),
    "retroarch": ("RetroArch", "retroarch", "Emulador multi-sistema"),
    "pcsx2": ("PCSX2", "pcsx2", "Emulador PlayStation 2"),
    "ppsspp": ("PPSSPP", "ppsspp", "Emulador PSP"),
    "rpcs3": ("RPCS3", "rpcs3", "Emulador PS3"),
    "citra": ("Citra", "citra", "Emulador 3DS"),
    "yuzu": ("Yuzu", "yuzu", "Emulador Switch"),
    "ryujinx": ("Ryujinx", "ryujinx", "Emulador Switch"),
    "xenia": ("Xenia", "xenia", "Emulador Xbox"),
    
    # FONTS / TIPOGRAFIA
    "fonts": ("Font Manager", "font-manager", "Gerenciador de fontes"),
    
    # clipboards
    "clipit": ("ClipIt", "clipit", "Clipboard"),
    "diodon": ("Diodon", "diodon", "Clipboard"),
    "klipper": ("Klipper", "klipper", "Clipboard KDE"),
    
    # SCREENSHOTS
    "spectacle": ("Spectacle", "spectacle", "Screenshot KDE"),
    "gnome-screenshot": (" GNOME Screenshot", "gnome-screenshot", "Screenshot GNOME"),
    "flameshot": ("Flameshot", "flameshot", "Screenshot"),
    "shutter": ("Shutter", "shutter", "Screenshot"),
    
    # LAUNCHERS
    "krunner": ("KRunner", "krunner", "Lançador KDE"),
    "ulauncher": ("ULauncher", "ulauncher", "Lançador"),
    "albert": ("Albert", "albert", "Lançador"),
    "synapse": ("Synapse", "synapse", "Lançador"),
    "kupfer": ("Kupfer", "kupfer", "Lançador"),
    "wofi": ("Wofi", "wofi", "Lançador Wayland"),
    "dmenu": ("dmenu", "dmenu", "Lançador"),
    "rofi": ("Rofi", "rofi", "Lançador/App launcher"),
    
    # DESKTOP / WINDOW MANAGERS
    "kwin": ("KWin", "kwin", "Window Manager KDE"),
    "mutter": ("Mutter", "mutter", "Window Manager GNOME"),
    "compton": ("Compton", "compton", "Compositor"),
    "picom": ("Picom", "picom", "Compositor"),
    
    # THEMING / CUSTOMIZATION
    "kvantum": ("Kvantum", "kvantum", "Tema Qt"),
    "materia": ("Materia", "materia-gtk-theme", "Tema GTK"),
    "arc": ("Arc Theme", "arc-theme", "Tema GTK"),
    "adapta": ("Adapta", "adapta-gtk-theme", "Tema GTK"),
    "numix": ("Numix", "numix-gtk-theme", "Tema GTK"),
    "oomox": ("Oomox", "oomox", "Criador de temas"),
    "lxappearance": ("LXAppearance", "lxappearance", "Aparência LXDE"),
    "oguriskb": ("Oculus", "oguriskb", "Teclado"),
    
    # TOOLS / UTILS
    "wine": ("Wine", "wine", "Executar Windows"),
    "winetricks": ("Winetricks", "winetricks", "Auxiliar Wine"),
    "playonlinux": ("PlayOnLinux", "playonlinux", "Jogos Windows"),
    "bottles": ("Bottles", "bottles", "Ambientes Windows"),
    "crossover": ("CrossOver", "crossover", "Windows compatibility"),
}


def get_app_name(filename):
    name = os.path.basename(filename).lower()
    name = name.replace('.exe', '').replace('.msi', '')
    name = name.replace('setup', '').replace('installer', '').replace('install', '')
    name = name.replace('-', ' ').replace('_', ' ').strip()
    return name


def get_distro():
    if os.path.exists('/etc/arch-release'):
        return "arch"
    elif os.path.exists('/etc/fedora-release'):
        return "fedora"
    elif os.path.exists('/etc/opensuse-release'):
        return "opensuse"
    return "ubuntu"


def get_install_cmd(package):
    distro = get_distro()
    if distro == "arch":
        return f"sudo pacman -S {package}"
    elif distro == "fedora":
        return f"sudo dnf install {package}"
    elif distro == "opensuse":
        return f"sudo zypper install {package}"
    return f"sudo apt install {package}"


def update_cache(silent=False):
    try:
        import requests
        import base64
        os.makedirs(CACHE_DIR, exist_ok=True)
        
        # Primeiro: verificar apenas a versão remote
        remote_content = supabase_download("ports/ports.json")
        if not remote_content:
            r = github_get(f"{API}/contents/data/ports/ports.json")
            if r and r.status_code == 200:
                import base64
                remote_content = base64.b64decode(r.json()["content"]).decode()
        
        if not remote_content:
            if not silent:
                print("⚠️  Arquivo ports.json não encontrado")
            return False
        
        # Extrair versão do remote
        try:
            remote_data = json.loads(remote_content)
            remote_version = remote_data.get("_meta", {}).get("version", "0.0.0")
        except:
            remote_version = "0.0.0"
        
        # Verificar versão local
        local_version = "0.0.0"
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE) as f:
                    local_data = json.load(f)
                    local_version = local_data.get("_meta", {}).get("version", "0.0.0")
            except:
                pass
        
        # Comparar versões
        if remote_version <= local_version:
            if not silent:
                print(f"ℹ️  Ports já estão atualizados (v{local_version})")
            return False
        
        # Salvar novo cache
        with open(CACHE_FILE, 'w') as f:
            f.write(remote_content)
        
        if not silent:
            print(f"✅ Ports atualizados para v{remote_version}!")
        return True
        
    except Exception as e:
        if not silent:
            print(f"❌ Erro ao atualizar cache: {e}")
        return False


def check_update():
    try:
        # Tenta Supabase primeiro
        content = supabase_download("updates/version.json")
        if content:
            return json.loads(content)
        
        # Fallback GitHub
        r = github_get(f"{GITHUB_API}/contents/version.json")
        if r and r.status_code == 200:
            import base64
            content = base64.b64decode(r.json()["content"]).decode()
            return json.loads(content)
        return None
    except:
        return None


def download_update():
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        
        # Arquivos para baixar
        files = ["compatflow.py", "install-compatflow.sh", "uninstall-compatflow.sh", "README_DEV.md"]
        
        # Tenta Supabase primeiro
        for fname in files:
            content = supabase_download(f"updates/{fname}")
            if content:
                with open(os.path.join(CACHE_DIR, fname), 'w') as f:
                    f.write(content)
                print(f"✅ {fname} baixado (Supabase)")
            else:
                # Fallback GitHub
                r = github_get(f"{GITHUB_API}/contents/{fname}")
                if r and r.status_code == 200:
                    import base64
                    content = base64.b64decode(r.json()["content"]).decode()
                    with open(os.path.join(CACHE_DIR, fname), 'w') as f:
                        f.write(content)
                    print(f"✅ {fname} baixado (GitHub)")
        
        # Atualizar versão
        ver = check_update()
        if ver:
            with open(VERSIONS_FILE, 'w') as f:
                json.dump(ver, f)
        
        return True
    except Exception as e:
        print(f"❌ Erro ao baixar update: {e}")
        return False


def load_ports():
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE) as f:
            data = json.load(f)
            if "_template" in data:
                del data["_template"]
            return data
    except:
        return {}


def check_port(clean_name):
    ports = load_ports()
    for port_id, port in ports.items():
        keywords = port.get("keywords", [])
        for kw in keywords:
            if kw in clean_name or clean_name in kw:
                return {"found": True, "port": port, "id": port_id}
    return {"found": False}


def check_native(clean_name):
    for keyword, (app, pkg, desc) in NATIVE.items():
        if keyword in clean_name or clean_name in keyword:
            return {"found": True, "app": app, "package": pkg, "desc": desc}
    return {"found": False}


def analyze(exe_path):
    clean_name = get_app_name(exe_path)
    result = {"original": os.path.basename(exe_path), "clean_name": clean_name}
    
    native = check_native(clean_name)
    if native["found"]:
        result["type"] = "native"
        result.update(native)
        return result
    
    port = check_port(clean_name)
    if port["found"]:
        result["type"] = "port"
        result.update(port)
        return result
    
    result["type"] = "unknown"
    result["app"] = clean_name.title() if clean_name else "Desconhecido"
    return result


def send_request(app_name, note=""):
    import base64
    data = {"app": app_name, "note": note, "date": datetime.now().isoformat(), "status": "pending"}
    checksum = hashlib.md5(app_name.encode()).hexdigest()[:8]
    safe_name = app_name.replace(" ", "_").replace("/", "_").replace("\\", "_")
    unique_id = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"requests/{checksum}_{unique_id}_{safe_name}.json"
    
    url = f"{SUPABASE_URL}/storage/v1/object/compatflow/{filename}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "x-upsert": "true"
    }
    
    try:
        resp = requests.post(url, data=json.dumps(data, indent=2), headers=headers, timeout=15)
        if resp.status_code in (200, 201):
            return True
        print(f"ERRO: {resp.status_code} - {resp.text}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"ERRO requests: {e}", file=sys.stderr)
        return False


def check_installed(package):
    import subprocess
    distro = get_distro()
    try:
        if distro == "arch":
            cmd = ["pacman", "-Q", package]
        else:
            cmd = ["dpkg", "-s", package]
        r = subprocess.run(cmd, capture_output=True, timeout=5)
        return r.returncode == 0
    except:
        return False


def check_lutris():
    return check_installed("lutris") or os.path.exists("/usr/bin/lutris")


def check_wine():
    if os.path.exists("/usr/bin/wine") or os.path.exists("/usr/bin/wine64"):
        return True
    return check_installed("wine") or check_installed("winehq-stable") or check_installed("wine-stable")


class CompatFlow(QWidget):
    def __init__(self, exe_path=None):
        super().__init__()
        self.exe = exe_path
        self.was_updated = update_cache(silent=True)
        self.data = analyze(exe_path) if exe_path else None
        self.setWindowTitle("CompatFlow")
        self.setFixedSize(420, 260)
        self.setStyleSheet(self.get_style())
        self.init_ui()
        if self.data:
            self.update_ui()
    
    def init_ui(self):
        main_layout = QVBoxLayout()
        main_layout.setSpacing(12)
        main_layout.setContentsMargins(15, 15, 15, 15)
        
        self.title = QLabel("🔍 CompatFlow")
        self.title.setObjectName("title")
        self.title.setAlignment(Qt.AlignCenter)
        
        self.update_label = QLabel("")
        self.update_label.setAlignment(Qt.AlignCenter)
        if self.was_updated:
            self.update_label.setText("🔄 Banco atualizado!")
            self.update_label.setStyleSheet("color: #22c55e; font-size: 11px;")
        
        self.info_label = QLabel("Clique com botão direito em um .exe")
        self.info_label.setAlignment(Qt.AlignCenter)
        self.info_label.setWordWrap(True)
        
        btn_layout = QHBoxLayout()
        self.native_btn = QPushButton("🐧 Instalar Nativo")
        self.port_btn = QPushButton("🎮 Instalar Port")
        self.wine_btn = QPushButton("🍷 Rodar com Wine")
        
        btn_layout.addWidget(self.native_btn)
        btn_layout.addWidget(self.port_btn)
        btn_layout.addWidget(self.wine_btn)
        
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        
        self.request_btn = QPushButton("📨 Solicitar Suporte")
        
        main_layout.addWidget(self.title)
        main_layout.addWidget(self.update_label)
        main_layout.addWidget(self.info_label)
        main_layout.addLayout(btn_layout)
        main_layout.addWidget(line)
        main_layout.addWidget(self.request_btn)
        
        self.setLayout(main_layout)
        
        self.native_btn.clicked.connect(self.install_native)
        self.port_btn.clicked.connect(self.install_port)
        self.wine_btn.clicked.connect(self.run_wine)
        self.request_btn.clicked.connect(self.send_request_action)
    
    def update_ui(self):
        t = self.data["type"]
        
        if t == "native":
            self.info_label.setText(f"✅ {self.data['app']} - {self.data['desc']}\nNativo Linux disponível!")
            self.native_btn.setVisible(True)
            self.port_btn.setVisible(False)
            self.native_btn.setEnabled(True)
        elif t == "port":
            port = self.data["port"]
            port_type = port.get("type", "lutris").upper()
            self.info_label.setText(f"🎮 {port['name']}\nPort via {port_type} disponível!")
            self.native_btn.setVisible(False)
            self.port_btn.setVisible(True)
            self.port_btn.setEnabled(True)
        else:
            self.info_label.setText(f"❌ {self.data['app']}\nNão encontrado no banco de dados")
            self.native_btn.setVisible(False)
            self.port_btn.setVisible(False)
    
    def install_native(self):
        if self.data and self.data["type"] == "native":
            pkg = self.data["package"]
            os.system(f"xterm -e '{get_install_cmd(pkg)}'")
            self.close()
    
    def install_port(self):
        if self.data and self.data["type"] == "port":
            port = self.data["port"]
            distro = get_distro()
            port_type = port.get("type", "lutris")
            
            if port_type == "lutris":
                deps = port.get("dependencies", {}).get(distro, [])
                
                missing = []
                for dep in deps:
                    if not check_installed(dep):
                        missing.append(dep)
                
                if missing:
                    deps_cmd = " ".join(missing)
                    QMessageBox.information(self, "Instalando Dependências", f"Instalando: {deps_cmd}")
                    os.system(f"pkexec {get_install_cmd(deps_cmd)}")
                else:
                    QMessageBox.information(self, "Info", "Todas dependências já instaladas!")
                
                script_url = port.get("install", {}).get("script_url")
                if script_url and self.exe:
                    install_dir = "/tmp/compatflow_install"
                    os.system(f"rm -rf {install_dir} && mkdir -p {install_dir}")
                    
                    dest_exe = os.path.join(install_dir, "setup.exe")
                    os.system(f"cp '{self.exe}' '{dest_exe}'")
                    
                    os.system(f"curl -sL '{script_url}' -o {install_dir}/installer.yml")
                    
                    with open(f"{install_dir}/installer.yml", "r") as f:
                        yml_content = f.read()
                    
                    yml_content = yml_content.replace("$SCRIPTDIR/VioletSetup.exe", "$SCRIPTDIR/setup.exe")
                    yml_content = yml_content.replace("N/A:Select the game setup file", "$SCRIPTDIR/setup.exe")
                    
                    with open(f"{install_dir}/installer.yml", "w") as f:
                        f.write(yml_content)
                    
                    QMessageBox.information(self, "Executando", f"Instalando: {os.path.basename(self.exe)}\n\nLutris vai abrir...")
                    
                    wrapper = f"""#!/bin/bash
cd {install_dir}
lutris -i {install_dir}/installer.yml &
"""
                    with open("/tmp/compatflow_run.sh", "w") as f:
                        f.write(wrapper)
                    os.system("chmod +x /tmp/compatflow_run.sh")
                    os.system("bash /tmp/compatflow_run.sh &")
                else:
                    QMessageBox.warning(self, "Erro", "Script ou arquivo não disponível!")
            
            self.close()
    
    def run_wine(self):
        if self.exe:
            os.system(f"wine '{self.exe}' &")
            self.close()
    
    def send_request_action(self):
        if not self.data:
            return
        
        app_name = self.data.get("original", self.data.get("clean_name", ""))
        
        dialog = QDialog(self)
        dialog.setWindowTitle("📨 Solicitar Suporte")
        dialog.setFixedSize(400, 300)
        dialog.setStyleSheet("""
            QDialog { background-color: #1e1e2e; color: #ffffff; }
            QLabel { color: #ffffff; }
            QTextEdit { background-color: #2a2a3a; color: #ffffff; border: 1px solid #3a3a5a; border-radius: 4px; padding: 8px; }
            QPushButton { background-color: #6366f1; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; }
            QPushButton:hover { background-color: #818cf8; }
        """)
        
        layout = QVBoxLayout(dialog)
        layout.setSpacing(15)
        
        layout.addWidget(QLabel(f"📦 {app_name}"))
        layout.addWidget(QLabel("Por que você quer este programa?"))
        
        text_edit = QTextEdit()
        text_edit.setPlaceholderText("Ex: Quero jogar este jogo no Linux...")
        layout.addWidget(text_edit)
        
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()
        
        cancel_btn = QPushButton("Cancelar")
        cancel_btn.setStyleSheet("background-color: #3a3a5a;")
        cancel_btn.clicked.connect(dialog.close)
        btn_layout.addWidget(cancel_btn)
        
        send_btn = QPushButton("Enviar")
        send_btn.clicked.connect(dialog.accept)
        btn_layout.addWidget(send_btn)
        
        layout.addLayout(btn_layout)
        
        if dialog.exec():
            note = text_edit.toPlainText().strip()
            ok = send_request(app_name, note)
            if ok:
                QMessageBox.information(self, "✅ Enviado!", "Solicitação enviada com sucesso!")
            else:
                QMessageBox.warning(self, "❌ Erro", "Falha ao enviar relatório. Verifique sua conexão.")
    
    def get_style(self):
        return """
        QWidget {
            background-color: #1e1e2e;
            color: #ffffff;
            font-size: 13px;
        }
        #title {
            font-size: 16px;
            font-weight: bold;
        }
        QPushButton {
            background-color: #3a3a5a;
            border-radius: 6px;
            padding: 6px;
            min-width: 90px;
        }
        QPushButton:hover {
            background-color: #505080;
        }
        QPushButton:pressed {
            background-color: #2a2a4a;
        }
        QPushButton:disabled {
            background-color: #2a2a3a;
            color: #666;
        }
        QLabel {
            color: #dddddd;
        }
        """


if __name__ == "__main__":
    if "--update" in sys.argv:
        print("Atualizando cache de ports...")
        update_cache()
        sys.exit(0)
    
    if "--check-update" in sys.argv:
        ver = check_update()
        if ver:
            print(f"Versão disponível: {ver.get('version', '?')}")
        else:
            print("Não foi possível verificar atualizações.")
        sys.exit(0)
    
    if "--upgrade" in sys.argv:
        print("Baixando atualização...")
        if download_update():
            print("✅ Atualização baixada! Reinicie o CompatFlow.")
        else:
            print("❌ Falha na atualização. Verifique sua conexão.")
        sys.exit(0)
    
    if "--test" in sys.argv:
        print("Testando análise...")
        test_file = sys.argv[2] if len(sys.argv) > 2 else "/tmp/test.exe"
        result = analyze(test_file)
        print(json.dumps(result, indent=2))
        sys.exit(0)
    
    if "--set-token" in sys.argv:
        if len(sys.argv) > 2:
            set_token(sys.argv[2])
            print("✅ Token configurado!")
        else:
            print("Uso: compatflow --set-token SEU_TOKEN")
        sys.exit(0)
    
    app = QApplication(sys.argv)
    exe = sys.argv[1] if len(sys.argv) > 1 else None
    w = CompatFlow(exe)
    w.show()
    sys.exit(app.exec())

