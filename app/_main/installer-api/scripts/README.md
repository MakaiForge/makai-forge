# 🔍 CompatFlow

<div align="center">
  <img src="https://raw.githubusercontent.com/lucasgertke11-bot/CompatFlow_eng/master/compatflow.svg" width="128" height="128">
  <br><br>
  <b>Windows → Linux compatibility and ports checker</b>
</div>

---

## 🎯 What is CompatFlow?

CompatFlow is an app that helps Linux users find native alternatives, game ports (via Lutris), or run Windows programs with Wine.

**Perfect for Linux beginners who don't want to use terminal.**

## ✨ Features

- ✅ Check if Windows programs have native Linux alternatives
- ✅ Find game ports via Lutris
- ✅ Run apps with Wine
- ✅ Context menu in major file managers
- ✅ Database with +200 native Linux apps
- ✅ Automatic port updates

## 🛡️ Security & Transparency

### Open Source
- All code is available here on GitHub
- You can verify exactly what the app does

### What data do we collect?
- **We never collect unnecessary personal data**
- When you request support for a program, we only store:
  - Program name
  - Your message (optional)
  - Request date
- Data is stored in Supabase (secure database)

### Can I contribute?
Yes! You can:
1. Report programs not in the database
2. Request ports for specific games/apps
3. Contribute code on GitHub

## 📦 Installation

```bash
git clone https://github.com/lucasgertke11-bot/CompatFlow_eng.git
cd CompatFlow_eng
sudo bash install-compatflow.sh
```

After installing, restart your file manager.

## 🚀 How to use

1. **Right-click** on a .exe or .msi file
2. Select "🔍 Verify with CompatFlow"
3. The app shows if there's:
   - Native Linux alternative
   - Available port (Lutris)
   - Option to run with Wine

### Commands

```bash
compatflow                    # Open interface
compatflow --update          # Update ports database
compatflow --check-update    # Check for app updates
compatflow --upgrade         # Upgrade the app
```

## 🖥️ Supported file managers

- KDE Dolphin ✓
- GNOME Nautilus ✓
- XFCE Thunar ✓
- Files (Nemo/Caja) ✓

## 📋 Requirements

- Python 3
- PySide6
- requests
- curl

## 📄 License

MIT License - Free to use and modify.

---

**Made with ❤️ to help people migrating to Linux**
