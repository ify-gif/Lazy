import sys
import os
import json
import ctypes
import keyring
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QLabel, QPushButton, QStackedWidget,
                             QFrame, QSizePolicy)
from PyQt6.QtCore import Qt, QSize, QTimer, QUrl, QObject, pyqtSlot
from PyQt6.QtGui import QColor, QPainter, QLinearGradient, QFont, QIcon
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtWebChannel import QWebChannel
from dotenv import load_dotenv

KEYRING_SERVICE = "lazy-app"
KEYRING_USERNAME = "openai-api-key"

load_dotenv() 

from api_client import APIClient
from audio_engine import AudioEngine
from database_manager import DatabaseManager
from ui.meeting_mode import MeetingMode
from ui.work_tracker_mode import WorkTrackerMode
from ui.settings_dialog import SettingsDialog

def set_native_grey_theme(hwnd):
    # Grey color: 0x00A0A0A0 (BGR format)
    grey_color = 0x00A0A0A0 
    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(ctypes.c_int(grey_color)), 4)

class Bridge(QObject):
    def __init__(self, stack):
        super().__init__()
        self.stack = stack

    @pyqtSlot(int)
    def navigate(self, index):
        self.stack.setCurrentIndex(index)

class LazyApp(QMainWindow):
    def __init__(self):
        super().__init__()
        
        self.setWindowTitle("LAZY - Audio Transcription & Work Tracker")
        self.setMinimumSize(1100, 750)
        
        # Set Window Icon (Absolute Path)
        app_dir = os.path.dirname(os.path.abspath(__file__))
        self.icon_path = os.path.join(app_dir, "assets", "app_icon.ico")
        if os.path.exists(self.icon_path):
            self.setWindowIcon(QIcon(self.icon_path))
        
        self.settings_path = os.path.join(os.path.expanduser("~"), ".lazy_settings.json")
        self.settings = self.load_settings()
        
        self.audio_engine = AudioEngine()
        
        self.db_manager = DatabaseManager()
        self.api_client = self.init_api_client()
        
        self.init_ui()
        self.load_styles()
        
        # Apply Grey Theme after showing or in init if HWND is ready
        QTimer.singleShot(0, self.apply_theme)

    def apply_theme(self):
        if sys.platform == 'win32':
            set_native_grey_theme(int(self.winId()))

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
        stored_key = keyring.get_password(KEYRING_SERVICE, KEYRING_USERNAME)
        if stored_key:
            defaults['openaiApiKey'] = stored_key
        elif os.getenv('OPENAI_API_KEY'):
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
            json.dump(safe_settings, f)

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
        
        header_layout.addStretch()
        
        # Logo Icon Button (PNG Version, 80x40)
        self.logo_btn = QPushButton()
        self.logo_btn.setObjectName("LogoIconButton")
        self.logo_btn.setFixedSize(90, 50)
        self.logo_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.logo_btn.clicked.connect(lambda: self.stack.setCurrentIndex(0))
        
        app_dir = os.path.dirname(os.path.abspath(__file__))
        png_logo = os.path.join(app_dir, "assets", "icon.png")
        if os.path.exists(png_logo):
            self.logo_btn.setIcon(QIcon(png_logo))
            self.logo_btn.setIconSize(QSize(80, 40))
        elif os.path.exists(self.icon_path):
            self.logo_btn.setIcon(QIcon(self.icon_path))
            self.logo_btn.setIconSize(QSize(80, 40))
            
        header_layout.addWidget(self.logo_btn)
        header_layout.addStretch()
        
        self.settings_btn = QPushButton("⚙")
        self.settings_btn.setObjectName("SettingsBtn")
        self.settings_btn.setFixedSize(45, 45)
        self.settings_btn.setStyleSheet("""
            QPushButton {
                font-size: 20px;
                color: #e4e4e7;
                background-color: transparent;
                border: 2px solid #27272a;
                border-radius: 6px;
                padding: 2px;
            }
            QPushButton:hover {
                border: 2px solid #3b82f6;
                background-color: rgba(59, 130, 246, 0.1);
            }
            QPushButton:pressed {
                background-color: rgba(59, 130, 246, 0.2);
            }
        """)
        self.settings_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.settings_btn.clicked.connect(self.open_settings)
        header_layout.addWidget(self.settings_btn)
        self.main_layout.addWidget(self.header)

        # Content
        self.stack = QStackedWidget()
        self.stack.addWidget(self.create_landing_page())
        self.meeting_mode = MeetingMode(self.audio_engine, self.db_manager, self.get_api_client, self.show_toast)
        self.stack.addWidget(self.meeting_mode)
        self.tracker_mode = WorkTrackerMode(self.audio_engine, self.db_manager, self.get_api_client, self.show_toast)
        self.stack.addWidget(self.tracker_mode)
        self.main_layout.addWidget(self.stack)
        
        # Footer
        self.footer = QFrame()
        self.footer.setFixedHeight(40)
        self.footer.setObjectName("Footer")
        footer_layout = QHBoxLayout(self.footer)
        self.status_icon = QFrame()
        self.status_icon.setFixedSize(8, 8)
        self.status_icon.setStyleSheet("background: #10b981; border-radius: 4px;")
        footer_layout.addWidget(self.status_icon)
        self.status_label = QLabel("Ready")
        footer_layout.addWidget(self.status_label)
        footer_layout.addStretch()
        v_label = QLabel("v1.2.3")
        footer_layout.addWidget(v_label)
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
        
        view.setStyleSheet("background-color: black;")
        view.page().setBackgroundColor(QColor("black"))
        
        self.bridge = Bridge(self.stack)
        self.channel = QWebChannel()
        self.channel.registerObject("backend", self.bridge)
        view.page().setWebChannel(self.channel)
        
        app_dir = os.path.dirname(os.path.abspath(__file__))
        html_path = os.path.join(app_dir, "assets", "landing.html")
        view.setUrl(QUrl.fromLocalFile(html_path))
        return view

    def open_settings(self):
        dialog = SettingsDialog(self.settings, self.save_settings, self)
        dialog.exec()

    def on_page_changed(self, index):
        is_landing = (index == 0)
        if is_landing:
            # Delay hiding to let the Spline viewer render
            QTimer.singleShot(50, self._hide_header_footer)
        else:
            self.header.setVisible(True)
            self.footer.setVisible(True)

    def _hide_header_footer(self):
        self.header.setVisible(False)
        self.footer.setVisible(False)

    def show_toast(self, message, msg_type="info"):
        self.toast_label.setText(message)
        colors = {"success": "#10b981", "error": "#ef4444", "warning": "#f59e0b", "info": "#3b82f6"}
        color = colors.get(msg_type, "#3b82f6")
        self.toast_label.setStyleSheet(f"background: #1e293b; color: white; border-radius: 20px; padding: 0 20px; border: 2px solid {color}; font-weight: bold;")
        self.toast_label.adjustSize()
        self.toast_label.move((self.width() - self.toast_label.width()) // 2, self.height() - 100)
        self.toast_label.show()
        QTimer.singleShot(3000, self.toast_label.hide)

    def load_styles(self):
        if os.path.exists("styles.qss"):
            with open("styles.qss", "r") as f:
                self.setStyleSheet(f.read())

if __name__ == "__main__":
    # Stabilization flags (RE-ENABLED TO FIX DISTORTION)
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--disable-gpu-compositing --disable-gpu-rasterization"

    if sys.platform == 'win32':
        myappid = 'com.lazy.app.v1.2'
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)

    app = QApplication(sys.argv)
    
    app_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(app_dir, "assets", "app_icon.ico")
    if os.path.exists(icon_path):
        icon = QIcon(icon_path)
        app.setWindowIcon(icon)

    window = LazyApp()
    window.show()
    sys.exit(app.exec())
