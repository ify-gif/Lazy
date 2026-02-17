import sys
import os
import json
import ctypes
import keyring
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QLabel, QPushButton, QStackedWidget,
                             QFrame, QSystemTrayIcon, QMenu)
from PyQt6.QtCore import Qt, QSize, QTimer, QUrl, QObject, pyqtSlot, QIODevice
from PyQt6.QtGui import QColor, QIcon, QAction, QShortcut, QKeySequence
from PyQt6.QtNetwork import QLocalServer, QLocalSocket
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEnginePage
from PyQt6.QtWebChannel import QWebChannel
from dotenv import load_dotenv

KEYRING_SERVICE = "lazy-app"
KEYRING_USERNAME = "openai-api-key"

load_dotenv()

# Initialize logging FIRST (before other imports)
from logger_config import logger

logger.info("="*60)
logger.info("LAZY Application Starting")
logger.info(f"Python version: {sys.version}")
logger.info(f"Platform: {sys.platform}")
logger.info(f"Working directory: {os.getcwd()}")
logger.info("="*60)

from version import __version__
from updater import check_for_update
from api_client import APIClient
from audio_engine import AudioEngine
from database_manager import DatabaseManager
from ui.meeting_mode import MeetingMode
from ui.work_tracker_mode import WorkTrackerMode
from ui.settings_dialog import SettingsDialog
from ui.theme_manager import ThemeManager
from ui.utils import set_native_grey_theme, set_window_icon_windows, PulsatingIcon, CheatSheetPopover
from offline_queue import OfflineQueue


class Bridge(QObject):
    def __init__(self, stack, open_settings_cb=None):
        super().__init__()
        self.stack = stack
        self._open_settings = open_settings_cb

    @pyqtSlot(int)
    def navigate(self, index):
        self.stack.setCurrentIndex(index)

    @pyqtSlot()
    def openSettings(self):
        if self._open_settings:
            self._open_settings()

from PyQt6.QtGui import QIcon, QDesktopServices, QAction, QFontDatabase
# ...
class LazyApp(QMainWindow):
    def __init__(self):
        super().__init__()
        logger.info("LazyApp initializing")

        # Load Custom Fonts
        app_dir = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(app_dir, "assets", "fonts")
        if os.path.exists(fonts_dir):
            for filename in os.listdir(fonts_dir):
                if filename.lower().endswith(".ttf"):
                    font_path = os.path.join(fonts_dir, filename)
                    font_id = QFontDatabase.addApplicationFont(font_path)
                    if font_id != -1:
                        family = QFontDatabase.applicationFontFamilies(font_id)[0]
                        logger.info(f"Loaded font: {family}")
                    else:
                        logger.warning(f"Failed to load font: {font_path}")

        self.setWindowTitle("LAZY - Audio Transcription & Work Tracker")
        self.setMinimumSize(1100, 750)

        # Set Window Icon (Absolute Path) - ENHANCED VERSION
        app_dir = os.path.dirname(os.path.abspath(__file__))

        # Try new light mode icon first, then fallbacks
        icon_candidates = [
            os.path.join(app_dir, "assets", "app_icon_new.ico"), # High res distinct icon
            os.path.join(app_dir, "assets", "lazy_icon.ico"),  # New multi-res version
            os.path.join(app_dir, "assets", "app_icon_square.ico"),
            os.path.join(app_dir, "assets", "app_icon.ico"),
            os.path.join(app_dir, "assets", "icon.png")
        ]

        self.icon_path = None
        for icon_file in icon_candidates:
            if os.path.exists(icon_file):
                self.icon_path = icon_file
                break

        # Set icon immediately via PyQt6
        if self.icon_path:
            icon = QIcon(self.icon_path)
            if not icon.isNull():
                self.setWindowIcon(icon)
                print(f"PyQt6 icon set from: {self.icon_path}")
            else:
                print(f"Failed to load icon: {self.icon_path}")

        self.settings_path = os.path.join(os.path.expanduser("~"), ".lazy_settings.json")
        self.settings = self.load_settings()
        logger.info(f"Settings loaded from: {self.settings_path}")

        self.audio_engine = AudioEngine()
        logger.info("AudioEngine initialized")

        self.db_manager = DatabaseManager()
        logger.info("DatabaseManager initialized")

        self.api_client = self.init_api_client()
        logger.info(f"APIClient initialized: configured={self.api_client is not None}")

        # Initialize offline queue for background sync
        self.offline_queue = OfflineQueue(self.db_manager, self.api_client, self)
        pending = self.offline_queue.get_pending_count()
        if pending > 0:
            logger.info(f"Offline queue has {pending} pending recordings")

        self.init_ui()
        # Apply initial theme
        current_theme = self.settings.get('theme', 'dark')
        ThemeManager.apply_theme(QApplication.instance(), current_theme)
        logger.info(f"UI initialized and {current_theme} theme applied")

        # Apply Grey Theme and Windows icon after showing or in init if HWND is ready
        QTimer.singleShot(0, self.apply_theme)
        QTimer.singleShot(100, self.apply_windows_icon)  # Apply icon via Windows API
        QTimer.singleShot(3000, self.check_for_updates)  # Check after 3s so startup feels instant

        # Setup system tray icon
        self.setup_system_tray()

        # Setup keyboard shortcuts
        self.setup_keyboard_shortcuts()

    def apply_theme(self):
        if sys.platform == 'win32':
            set_native_grey_theme(int(self.winId()))

    def apply_windows_icon(self):
        """Apply icon using Windows API for taskbar/title bar"""
        if sys.platform == 'win32' and self.icon_path and os.path.exists(self.icon_path):
            print(f"\nApplying Windows API icon from: {self.icon_path}")
            set_window_icon_windows(int(self.winId()), self.icon_path)

    def setup_system_tray(self):
        """Initialize system tray icon with context menu"""
        # Create system tray icon using the same icon as the window
        self.tray_icon = QSystemTrayIcon(self)

        # Set the icon (use the same icon as the window)
        if self.icon_path and os.path.exists(self.icon_path):
            icon = QIcon(self.icon_path)
            self.tray_icon.setIcon(icon)

        # Create context menu for tray icon
        tray_menu = QMenu()

        # Show/Hide action
        show_action = QAction("Show LAZY", self)
        show_action.triggered.connect(self.show_window)
        tray_menu.addAction(show_action)

        # Separator
        tray_menu.addSeparator()

        # Exit action
        exit_action = QAction("Exit", self)
        exit_action.triggered.connect(self.quit_application)
        tray_menu.addAction(exit_action)

        # Set the context menu
        self.tray_icon.setContextMenu(tray_menu)

        # Connect double-click to show window
        self.tray_icon.activated.connect(self.on_tray_icon_activated)

        # Set tooltip
        self.tray_icon.setToolTip("LAZY - Audio Transcription & Work Tracker")

        # Show the tray icon
        self.tray_icon.show()

    def setup_keyboard_shortcuts(self):
        """Setup global keyboard shortcuts for the application.
        
        Shortcuts:
            Ctrl+,    - Open Settings
            Ctrl+H    - Go to Home/Landing page
            Ctrl+1    - Switch to Meeting Mode
            Ctrl+2    - Switch to Work Tracker Mode
            Escape    - Go back to Home or close dialogs
        """
        logger.info("Setting up keyboard shortcuts")

        # Ctrl+, to open Settings (common pattern in many apps)
        settings_shortcut = QShortcut(QKeySequence("Ctrl+,"), self)
        settings_shortcut.activated.connect(self.open_settings)

        # Ctrl+H to go Home
        home_shortcut = QShortcut(QKeySequence("Ctrl+H"), self)
        home_shortcut.activated.connect(self.go_to_home)

        # Ctrl+1 for Meeting Mode
        meeting_shortcut = QShortcut(QKeySequence("Ctrl+1"), self)
        meeting_shortcut.activated.connect(lambda: self.stack.setCurrentIndex(1))

        # Ctrl+2 for Work Tracker Mode
        tracker_shortcut = QShortcut(QKeySequence("Ctrl+2"), self)
        tracker_shortcut.activated.connect(lambda: self.stack.setCurrentIndex(2))

        # Escape to go back to Home (or close popover if open)
        escape_shortcut = QShortcut(QKeySequence(Qt.Key.Key_Escape), self)
        escape_shortcut.activated.connect(self._handle_escape)

        # Store references to prevent garbage collection
        self._shortcuts = [settings_shortcut, home_shortcut, meeting_shortcut, 
                          tracker_shortcut, escape_shortcut]

    def _handle_escape(self):
        """Handle Escape key - close popover or go to home."""
        if hasattr(self, 'cheat_sheet') and self.cheat_sheet.isVisible():
            self.cheat_sheet.hide()
        elif self.stack.currentIndex() != 0:
            self.stack.setCurrentIndex(0)

    def on_tray_icon_activated(self, reason):
        """Handle tray icon activation (click, double-click, etc.)"""
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.show_window()

    def show_window(self):
        """Show and restore the main window"""
        self.show()
        self.setWindowState(self.windowState() & ~Qt.WindowState.WindowMinimized | Qt.WindowState.WindowActive)
        self.activateWindow()
        self.raise_()

    def hide_to_tray(self):
        """Hide window to system tray"""
        self.hide()
        # Optional: Show a notification
        if self.tray_icon.supportsMessages():
            self.tray_icon.showMessage(
                "LAZY",
                "Application minimized to tray. Double-click the tray icon to restore.",
                QSystemTrayIcon.MessageIcon.Information,
                2000  # 2 seconds
            )

    def quit_application(self):
        """Completely exit the application"""
        # Stop any ongoing recordings
        if hasattr(self, 'audio_engine'):
            self.audio_engine.stop_recording()

        # Hide tray icon
        if hasattr(self, 'tray_icon'):
            self.tray_icon.hide()

        # Close the application
        QApplication.quit()

    def closeEvent(self, event):
        """Handle window close event - minimize to tray instead of closing"""
        # Prevent the window from closing
        event.ignore()

        # Hide to system tray instead
        self.hide_to_tray()

    def changeEvent(self, event):
        """Handle window state changes (minimize, etc.)"""
        if event.type() == event.Type.WindowStateChange:
            if self.windowState() & Qt.WindowState.WindowMinimized:
                # User clicked minimize button - hide to tray
                QTimer.singleShot(0, self.hide_to_tray)

        super().changeEvent(event)

    def load_settings(self):
        defaults = {
            'openaiApiKey': '',
            'openaiModel': os.getenv('OPENAI_MODEL', 'gpt-4o'),
            'openaiMaxTokens': int(os.getenv('OPENAI_MAX_TOKENS', 4000))
        }
        if os.path.exists(self.settings_path):
            with open(self.settings_path, 'r') as f:
                saved = json.load(f)
                defaults.update({k: v for k, v in saved.items() if v and k != 'openaiApiKey'})

        # Load API key from secure storage (keyring) or env var as fallback
        # Load API key from secure storage (keyring) or env var as fallback
        try:
            stored_key = keyring.get_password(KEYRING_SERVICE, KEYRING_USERNAME)
            if stored_key:
                defaults['openaiApiKey'] = stored_key
        except Exception:
            pass

        if not defaults['openaiApiKey'] and os.getenv('OPENAI_API_KEY'):
            defaults['openaiApiKey'] = os.getenv('OPENAI_API_KEY')

        return defaults

    def save_settings(self, new_settings):
        self.settings = new_settings

        # Store API key securely in OS keyring
        api_key = new_settings.get('openaiApiKey', '')
        if api_key:
            keyring.set_password(KEYRING_SERVICE, KEYRING_USERNAME, api_key)
        else:
            try:
                keyring.delete_password(KEYRING_SERVICE, KEYRING_USERNAME)
            except keyring.errors.PasswordDeleteError:
                pass

        # Save non-sensitive settings to JSON file
        safe_settings = {k: v for k, v in new_settings.items() if k != 'openaiApiKey'}
        with open(self.settings_path, 'w') as f:
            json.dump(safe_settings, f, indent=4) # Indent for readability

        # Check for theme change and apply if needed
        new_theme = new_settings.get('theme', 'dark')
        # We don't have 'old_theme' here easily unless we stored it before update
        # But applying theme is cheap, so we can just re-apply or check against current QApp property if we set one
        # For now, just apply it.
        ThemeManager.apply_theme(QApplication.instance(), new_theme)
        
        # Update Landing Page if visible
        if hasattr(self, 'landing_view'):
            self.landing_view.page().runJavaScript(f"setTheme('{new_theme}');")
            self._update_landing_bg(new_theme)

        self.api_client = self.init_api_client()

    def init_api_client(self):
        if self.settings.get('openaiApiKey'):
            return APIClient(
                openai_api_key=self.settings['openaiApiKey'],
                openai_model=self.settings['openaiModel'],
                openai_max_tokens=self.settings['openaiMaxTokens']
            )
        return None

    def get_api_client(self):
        return self.api_client

    def get_settings(self):
        return self.settings

    def init_ui(self):
        self.central_widget = QWidget()
        self.central_widget.setObjectName("CentralWidget")
        self.setCentralWidget(self.central_widget)
        
        self.main_layout = QVBoxLayout(self.central_widget)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(0)
        
        # Header
        self.header = QFrame()
        self.header.setFixedHeight(80)
        header_layout = QHBoxLayout(self.header)
        header_layout.setContentsMargins(30, 10, 30, 10)
        header_layout.setAlignment(Qt.AlignmentFlag.AlignVCenter) # Force vertical centering
        
        # FAR LEFT: Cheat Sheet Info Icon (Mirrors Settings Gear)
        self.info_btn = PulsatingIcon("ⓘ", self.header)
        self.info_btn.clicked.connect(self.toggle_cheat_sheet)
        self.info_btn.hide() # Only visible in Work Tracker mode
        header_layout.addWidget(self.info_btn, alignment=Qt.AlignmentFlag.AlignVCenter)

        header_layout.addStretch()
        
        # Logo Icon Button (PNG Version, 80x40)
        self.logo_btn = QPushButton()
        self.logo_btn.setObjectName("LogoIconButton")
        self.logo_btn.setFixedSize(90, 50)
        self.logo_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.logo_btn.clicked.connect(self.go_to_home)
        
        # Prefer .ico files for transparency if icon.png has black background
        # self.icon_path is already determined in __init__ with correct priority
        if self.icon_path and os.path.exists(self.icon_path):
             self.logo_btn.setIcon(QIcon(self.icon_path))
             self.logo_btn.setIconSize(QSize(80, 40))
        else:
             # Fallback
             pass
            
        header_layout.addWidget(self.logo_btn, alignment=Qt.AlignmentFlag.AlignVCenter)
        header_layout.addStretch()
        
        self.settings_btn = QPushButton("⚙")
        self.settings_btn.setObjectName("SettingsBtn")
        self.settings_btn.setFixedSize(32, 32)
        self.settings_btn.setStyleSheet("""
            QPushButton {
                font-size: 16px;
                background-color: transparent;
                border: none;
                padding: 0px;
            }
            QPushButton:hover {
                color: #4f46e5;
            }
        """)
        self.settings_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.settings_btn.clicked.connect(self.open_settings)
        header_layout.addWidget(self.settings_btn, alignment=Qt.AlignmentFlag.AlignVCenter)
        self.main_layout.addWidget(self.header)

        # Cheat Sheet Popover (Stationary Overlay)
        self.cheat_sheet = CheatSheetPopover(self.central_widget)
        self.cheat_sheet.hide()

        # Content
        self.stack = QStackedWidget()
        self.stack.addWidget(self.create_landing_page())
        self.meeting_mode = MeetingMode(self.audio_engine, self.db_manager, self.get_api_client, self.show_toast, self.set_status, self.get_settings)
        self.stack.addWidget(self.meeting_mode)
        self.tracker_mode = WorkTrackerMode(self.audio_engine, self.db_manager, self.get_api_client, self.show_toast, self.set_status, self.get_settings)
        self.stack.addWidget(self.tracker_mode)
        self.main_layout.addWidget(self.stack)
        
        # Footer
        self.footer = QFrame()
        self.footer.setFixedHeight(40)
        self.footer.setObjectName("Footer")
        footer_layout = QHBoxLayout(self.footer)
        self.status_icon = QFrame()
        self.status_icon.setFixedSize(8, 8)
        self.status_icon.setStyleSheet("background: #14b8a6; border-radius: 4px;")
        footer_layout.addWidget(self.status_icon)
        self.status_label = QLabel("Status")
        footer_layout.addWidget(self.status_label)
        footer_layout.addStretch()
        self.version_label = QLabel(f"v{__version__}")
        footer_layout.addWidget(self.version_label)
        self.main_layout.addWidget(self.footer)
        
        # Toast
        self.toast_label = QLabel(self.central_widget)
        self.toast_label.hide()
        self.toast_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.toast_label.setFixedHeight(40)
        
        self.stack.currentChanged.connect(self.on_page_changed)
        self.on_page_changed(0)

    def create_landing_page(self):
        view = QWebEngineView()
        settings = view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.ShowScrollBars, False)
        settings.setAttribute(QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False)

        # Keep the page lifecycle active even when not visible to prevent blank screen on return
        view.page().setLifecycleState(QWebEnginePage.LifecycleState.Active)



        # Inject theme when loaded
        view.loadFinished.connect(self.on_landing_load_finished)

        self.bridge = Bridge(self.stack, open_settings_cb=self.open_settings)
        self.channel = QWebChannel()
        self.channel.registerObject("backend", self.bridge)
        view.page().setWebChannel(self.channel)

        app_dir = os.path.dirname(os.path.abspath(__file__))
        html_path = os.path.join(app_dir, "assets", "landing.html")
        
        # Pass theme as query parameter to prevent FOUC
        current_theme = self.settings.get('theme', 'dark')
        url = QUrl.fromLocalFile(html_path)
        url.setQuery(f"theme={current_theme}")
        view.setUrl(url)
        
        # Set initial background color to match theme (prevent white flash)
        self._update_landing_bg(current_theme)

        # Store reference to prevent garbage collection
        self.landing_view = view

        return view

    def _update_landing_bg(self, theme_name):
        """Set the WebView background color to match the theme."""
        if hasattr(self, 'landing_view'):
            palette = ThemeManager.get_palette(theme_name)
            bg_color = palette.get('background', '#1a1a1a')
            self.landing_view.page().setBackgroundColor(QColor(bg_color))

    def go_to_home(self):
        """Navigate to the Landing Page (Index 0)."""
        # Ensure we are ready to show the home page
        self.stack.setCurrentIndex(0)
        
    def on_landing_load_finished(self):
        current_theme = self.settings.get('theme', 'dark')
        self.landing_view.page().runJavaScript(f"setTheme('{current_theme}');")
        # Ensure background is correct after load
        self._update_landing_bg(current_theme)

    def open_settings(self):
        dialog = SettingsDialog(self.settings, self.save_settings, self.audio_engine, self)
        dialog.exec()

    def on_page_changed(self, index):
        is_landing = (index == 0)
        is_work_tracker = (index == 2)

        # Optimize landing page lifecycle to save resources when not visible
        if hasattr(self, 'landing_view'):
            # Keep landing page active to prevent "blank screen" / reload delay on return
            # self.landing_view.page().setLifecycleState(QWebEnginePage.LifecycleState.Active)
            pass

        if is_landing:
            QTimer.singleShot(50, self._hide_header_footer)
            self.info_btn.hide()
        else:
            self.header.setVisible(True)
            self.footer.setVisible(True)
            # Toggle far-left info icon visibility based on mode
            self.info_btn.setVisible(is_work_tracker)

        if hasattr(self, 'cheat_sheet'):
            self.cheat_sheet.hide()

    def toggle_cheat_sheet(self):
        if self.cheat_sheet.isVisible():
            self.cheat_sheet.hide()
        else:
            # Position stationary popover on the left, below the far-left icon
            self.cheat_sheet.move(20, self.header.height() + 10)
            self.cheat_sheet.show()
            self.cheat_sheet.raise_()

    def _hide_header_footer(self):
        self.header.setVisible(False)
        self.footer.setVisible(False)

    def set_status(self, message, color="#10b981"):
        """Update the footer status bar"""
        self.status_label.setText(message)
        self.status_icon.setStyleSheet(f"background: {color}; border-radius: 4px;")

    def check_for_updates(self):
        """Kick off update check on a background thread."""
        from ui.utils import Worker
        self._update_worker = Worker(check_for_update)
        self._update_worker.finished.connect(self.on_update_result, Qt.ConnectionType.QueuedConnection)
        self._update_worker.error.connect(lambda e: logger.warning(f"Update check error: {e}"))
        self._update_worker.start()

    def on_update_result(self, result):
        """Called on main thread with the result from check_for_update()."""
        if not result.get("update_available"):
            return

        latest = result["latest_version"]
        self._update_url = result["download_url"]
        logger.info(f"Update available: v{__version__} -> v{latest}")

        # Turn version label into a clickable update link
        self.version_label.setText(f"Update available: v{latest}")
        self.version_label.setStyleSheet("color: #4f46e5; font-weight: bold; text-decoration: underline; cursor: pointer;")
        self.version_label.setCursor(Qt.CursorShape.PointingHandCursor)
        self.version_label.mousePressEvent = lambda e: self._open_update_url(self._update_url)

    def _open_update_url(self, url):
        """Open the GitHub releases page in the default browser."""
        from PyQt6.QtGui import QDesktopServices
        QDesktopServices.openUrl(QUrl(url))

    def show_toast(self, message, msg_type="info"):
        self.toast_label.setText(message)
        colors = {"success": "#14b8a6", "error": "#ef4444", "warning": "#fcd34d", "info": "#818cf8"}
        color = colors.get(msg_type, "#3b82f6")
        self.toast_label.setStyleSheet(f"background: #1a212b; color: white; border-radius: 20px; padding: 0 20px; border: 2px solid {color}; font-weight: bold;")
        self.toast_label.adjustSize()
        self.toast_label.move((self.width() - self.toast_label.width()) // 2, self.height() - 100)
        self.toast_label.show()
        QTimer.singleShot(3000, self.toast_label.hide)

    def load_styles(self):
        # Get the directory where the script/exe is located
        if getattr(sys, 'frozen', False):
            # Running as compiled exe - PyInstaller extracts files to _internal
            app_dir = os.path.dirname(sys.executable)
            # Check multiple possible locations
            style_candidates = [
                os.path.join(app_dir, "styles.qss"),
                os.path.join(app_dir, "_internal", "styles.qss"),
                os.path.join(sys._MEIPASS, "styles.qss") if hasattr(sys, '_MEIPASS') else None
            ]
        else:
            # Running as script
            app_dir = os.path.dirname(os.path.abspath(__file__))
            style_candidates = [os.path.join(app_dir, "styles.qss")]

        # Try each candidate location
        for style_path in style_candidates:
            if style_path and os.path.exists(style_path):
                with open(style_path, "r", encoding="utf-8") as f:
                    self.setStyleSheet(f.read())
                print(f"✓ Loaded stylesheet from: {style_path}")
                return

        print(f"Warning: styles.qss not found in any expected location")

    def init_single_instance(self):
        """Setup single instance enforcement"""
        self.local_server = QLocalServer()
        self.local_server.newConnection.connect(self.handle_new_connection)
        
        # Unique identifier for the application
        server_name = "lazy_app_single_instance_lock"
        
        # Try to remove any standardized server if it exists (e.g. from a crash)
        QLocalServer.removeServer(server_name)
        
        if not self.local_server.listen(server_name):
            # If listen fails, we might just continue or log error
            # But the check happens in main()
            logger.error(f"Failed to start local server: {self.local_server.errorString()}")

    def handle_new_connection(self):
        """Handle incoming connection from a new instance"""
        socket = self.local_server.nextPendingConnection()
        if socket.waitForReadyRead(1000):
            message = socket.readAll().data().decode('utf-8')
            if message == "SHOW_WINDOW":
                logger.info("Received SHOW_WINDOW command from another instance")
                self.show_window()
                # Also ensure we unminimize if needed
                self.setWindowState(self.windowState() & ~Qt.WindowState.WindowMinimized | Qt.WindowState.WindowActive)
                self.activateWindow()
                self.raise_()
        socket.disconnectFromServer()

if __name__ == "__main__":
    # CHECK FOR EXISTING INSTANCE
    app_id = "lazy_app_single_instance_lock"
    socket = QLocalSocket()
    socket.connectToServer(app_id)
    if socket.waitForConnected(500):
        # Successfully connected to existing instance
        print("Another instance is already running. Focusing existing window...")
        socket.write(b"SHOW_WINDOW")
        socket.waitForBytesWritten(1000)
        socket.disconnectFromServer()
        sys.exit(0)
    
    # Needs to be called before QApplication
    # Stabilization flags (RE-ENABLED TO FIX DISTORTION)
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-gpu-compositing --disable-gpu-rasterization"

    if sys.platform == 'win32':
        myappid = 'com.lazy.app.v1.2'
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)

    app = QApplication(sys.argv)

    app_dir = os.path.dirname(os.path.abspath(__file__))

    # Try to set application-level icon (prefer new light mode icon)
    icon_candidates = [
        os.path.join(app_dir, "assets", "lazy_icon.ico"),  # New multi-res version
        os.path.join(app_dir, "assets", "app_icon_square.ico"),
        os.path.join(app_dir, "assets", "app_icon.ico"),
        os.path.join(app_dir, "assets", "icon.png")
    ]

    for icon_path in icon_candidates:
        if os.path.exists(icon_path):
            icon = QIcon(icon_path)
            if not icon.isNull():
                app.setWindowIcon(icon)
                print(f"Application icon set from: {icon_path}")
                break

    window = LazyApp()
    window.init_single_instance() # Start listening
    window.show()
    logger.info("Main window shown, entering event loop")

    exit_code = app.exec()
    logger.info(f"Application exiting with code: {exit_code}")
    sys.exit(exit_code)
