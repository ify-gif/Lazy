import sys
import os
import json
import numpy as np
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QPushButton, QStackedWidget,
                             QFrame, QSizePolicy, QGraphicsDropShadowEffect)
from PyQt6.QtCore import Qt, QSize, pyqtSignal, QTimer, QPropertyAnimation, QRect
from PyQt6.QtGui import QColor, QPainter, QLinearGradient, QFont
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env

from api_client import APIClient
from audio_engine import AudioEngine
from database_manager import DatabaseManager
from ui.meeting_mode import MeetingMode
from ui.work_tracker_mode import WorkTrackerMode
from ui.settings_dialog import SettingsDialog

class WaveformVisualizer(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(120)
        self.data = np.zeros(50)
        
    def set_data(self, indata):
        # Calculate RMS for visualization
        rms = np.sqrt(np.mean(indata**2))
        self.data = np.roll(self.data, -1)
        self.data[-1] = rms
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        w = self.width()
        h = self.height()
        
        painter.fillRect(self.rect(), QColor(0, 0, 0, 0)) # Transparent
        
        bar_count = len(self.data)
        bar_width = w / bar_count
        
        for i in range(bar_count):
            val = self.data[i]
            bar_h = val * h * 10
            if bar_h > h: bar_h = h
            if bar_h < 4: bar_h = 4
            
            x = i * bar_width
            y = (h - bar_h) / 2
            
            gradient = QLinearGradient(0, y, 0, y + bar_h)
            gradient.setColorAt(0, QColor("#60a5fa"))
            gradient.setColorAt(1, QColor("#a855f7"))
            
            painter.setBrush(gradient)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.drawRoundedRect(int(x), int(y), int(bar_width - 2), int(bar_h), 4, 4)

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LAZY - Audio Transcription & Work Tracker")
        self.setMinimumSize(1100, 750)
        
        self.settings_path = os.path.join(os.path.expanduser("~"), ".lazy_settings.json")
        self.settings = self.load_settings()
        
        self.audio_engine = AudioEngine()
        self.audio_engine.on_data = self.handle_audio_data
        
        self.db_manager = DatabaseManager()
        self.api_client = self.init_api_client()
        
        self.init_ui()
        self.load_styles()

    def handle_audio_data(self, data):
        self.visualizer.set_data(data)

    def load_settings(self):
        # Default priority: JSON Settings > .env > Hardcoded defaults
        defaults = {
            'openaiApiKey': os.getenv('OPENAI_API_KEY', ''),
            'openaiModel': os.getenv('OPENAI_MODEL', 'gpt-4o'),
            'openaiMaxTokens': int(os.getenv('OPENAI_MAX_TOKENS', 4000))
        }
        
        if os.path.exists(self.settings_path):
            with open(self.settings_path, 'r') as f:
                saved = json.load(f)
                # Overwrite defaults with saved settings if they exist
                defaults.update({k: v for k, v in saved.items() if v})
                
        return defaults

    def save_settings(self, new_settings):
        self.settings = new_settings
        with open(self.settings_path, 'w') as f:
            json.dump(new_settings, f)
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
        header_layout.setContentsMargins(30, 0, 30, 0)
        
        self.logo_btn = QPushButton("LAZY")
        self.logo_btn.setObjectName("TitleLabel")
        self.logo_btn.setFlat(True)
        self.logo_btn.clicked.connect(lambda: self.stack.setCurrentIndex(0))
        header_layout.addWidget(self.logo_btn)
        
        header_layout.addStretch()
        
        self.settings_btn = QPushButton("Settings")
        self.settings_btn.clicked.connect(self.open_settings)
        header_layout.addWidget(self.settings_btn)
        
        self.main_layout.addWidget(self.header)

        # Visualizer Bar
        self.vis_container = QFrame()
        vis_layout = QVBoxLayout(self.vis_container)
        vis_layout.setContentsMargins(30, 0, 30, 10)
        self.visualizer = WaveformVisualizer()
        vis_layout.addWidget(self.visualizer)
        self.main_layout.addWidget(self.vis_container)
        
        # Stacked Widget
        self.stack = QStackedWidget()
        
        # Landing
        self.stack.addWidget(self.create_landing_page())
        
        # Meeting Mode
        self.meeting_mode = MeetingMode(self.audio_engine, self.db_manager, self.get_api_client, self.show_toast)
        self.stack.addWidget(self.meeting_mode)
        
        # Work Tracker Mode
        self.tracker_mode = WorkTrackerMode(self.audio_engine, self.db_manager, self.get_api_client, self.show_toast)
        self.stack.addWidget(self.tracker_mode)
        
        self.main_layout.addWidget(self.stack)
        
        # Status Bar
        self.footer = QFrame()
        self.footer.setFixedHeight(40)
        self.footer.setStyleSheet("border-top: 1px solid #334155; background: #0f172a;")
        footer_layout = QHBoxLayout(self.footer)
        footer_layout.setContentsMargins(20, 0, 20, 0)
        
        self.status_icon = QFrame()
        self.status_icon.setFixedSize(8, 8)
        self.status_icon.setStyleSheet("background: #10b981; border-radius: 4px;")
        footer_layout.addWidget(self.status_icon)
        
        self.status_label = QLabel("Ready")
        self.status_label.setStyleSheet("color: #94a3b8; font-size: 11px;")
        footer_layout.addWidget(self.status_label)
        
        footer_layout.addStretch()
        v_label = QLabel("v1.0.0")
        v_label.setStyleSheet("color: #475569; font-size: 11px;")
        footer_layout.addWidget(v_label)
        
        self.main_layout.addWidget(self.footer)
        
        # Toast Overlay
        self.toast_label = QLabel(self.central_widget)
        self.toast_label.hide()
        self.toast_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.toast_label.setFixedHeight(40)
        self.toast_label.setStyleSheet("background: #1e293b; color: white; border-radius: 20px; padding: 0 20px; border: 1px solid #3b82f6;")

    def create_landing_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        title = QLabel("Choose Your Workspace")
        title.setStyleSheet("font-size: 32px; font-weight: bold; color: white; margin-bottom: 40px;")
        layout.addWidget(title, alignment=Qt.AlignmentFlag.AlignCenter)
        
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(40)
        
        m_btn = QPushButton("Meeting Transcription")
        m_btn.setFixedSize(300, 180)
        m_btn.setObjectName("PrimaryButton")
        m_btn.clicked.connect(lambda: self.stack.setCurrentIndex(1))
        
        t_btn = QPushButton("Work Tracker")
        t_btn.setFixedSize(300, 180)
        t_btn.setObjectName("PrimaryButton")
        t_btn.clicked.connect(lambda: self.stack.setCurrentIndex(2))
        
        btn_layout.addWidget(m_btn)
        btn_layout.addWidget(t_btn)
        
        layout.addLayout(btn_layout)
        return page

    def open_settings(self):
        dialog = SettingsDialog(self.settings, self.save_settings, self)
        dialog.exec()

    def show_toast(self, message, msg_type="info"):
        self.toast_label.setText(message)
        color = "#3b82f6" # info (blue)
        if msg_type == "success": color = "#10b981"
        if msg_type == "error": color = "#ef4444"
        if msg_type == "warning": color = "#f59e0b"
        
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
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
