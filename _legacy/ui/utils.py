from PyQt6.QtCore import (QThread, pyqtSignal, Qt, QTimer, QPropertyAnimation, 
                         QEasingCurve, QPoint, pyqtProperty, QSequentialAnimationGroup)
from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QLabel, QFrame, QWidget, 
                             QHBoxLayout, QPushButton, QScrollArea, QGraphicsOpacityEffect)
from PyQt6.QtGui import QColor, QPainter, QPen, QFont
import traceback
import numpy as np
import sys
import ctypes
import threading
from logger_config import logger

def set_native_grey_theme(hwnd):
    """Set Windows native title bar to grey color (matches premium look)"""
    # Grey color: 0x00A0A0A0 (BGR format)
    grey_color = 0x00A0A0A0
    try:
        ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(ctypes.c_int(grey_color)), 4)
    except Exception:
        pass


def set_window_icon_windows(hwnd, icon_path):
    """Forcefully set window icon using Windows API (taskbar + title bar)"""
    if not sys.platform == 'win32':
        return

    try:
        # Constants
        WM_SETICON = 0x0080
        ICON_SMALL = 0  # Title bar icon (16x16)
        ICON_BIG = 1    # Alt+Tab and taskbar icon (32x32)

        # LoadImage constants
        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x00000010
        LR_DEFAULTSIZE = 0x00000040
        LR_SHARED = 0x00008000

        # GetClassLong/SetClassLong constants for taskbar icon override
        GCL_HICON = -14  # Application icon
        GCL_HICONSM = -34  # Small icon
        GCLP_HICON = -14
        GCLP_HICONSM = -34

        # Convert to absolute path
        import os
        abs_icon_path = os.path.abspath(icon_path)

        print(f"\n{'='*60}")
        print(f"LOADING ICON: {abs_icon_path}")
        print(f"{'='*60}")

        # Load multiple icon sizes from the .ico file
        hicon_16 = ctypes.windll.user32.LoadImageW(
            None, abs_icon_path, IMAGE_ICON, 16, 16,
            LR_LOADFROMFILE | LR_SHARED
        )

        hicon_20 = ctypes.windll.user32.LoadImageW(
            None, abs_icon_path, IMAGE_ICON, 20, 20,
            LR_LOADFROMFILE | LR_SHARED
        )

        hicon_32 = ctypes.windll.user32.LoadImageW(
            None, abs_icon_path, IMAGE_ICON, 32, 32,
            LR_LOADFROMFILE | LR_SHARED
        )

        hicon_48 = ctypes.windll.user32.LoadImageW(
            None, abs_icon_path, IMAGE_ICON, 48, 48,
            LR_LOADFROMFILE | LR_SHARED
        )

        # Default size (let Windows choose best)
        hicon_default = ctypes.windll.user32.LoadImageW(
            None, abs_icon_path, IMAGE_ICON, 0, 0,
            LR_LOADFROMFILE | LR_DEFAULTSIZE | LR_SHARED
        )

        success_count = 0

        # Method 1: WM_SETICON (Window-level)
        if hicon_16:
            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_16)
            success_count += 1
            print(f"✓ WM_SETICON small (16x16): {hicon_16}")

        if hicon_32:
            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_32)
            success_count += 1
            print(f"✓ WM_SETICON large (32x32): {hicon_32}")

        # Method 2: SetClassLongPtr (Class-level - affects taskbar)
        # This is MORE aggressive and overrides the Python icon
        try:
            if hicon_16:
                result = ctypes.windll.user32.SetClassLongPtrW(hwnd, GCLP_HICONSM, hicon_16)
                print(f"✓ SetClassLongPtr small (16x16): {result}")
                success_count += 1
        except Exception as e:
            print(f"  SetClassLongPtrW SMALL failed: {e}")
            # Try 32-bit version
            try:
                result = ctypes.windll.user32.SetClassLongW(hwnd, GCL_HICONSM, hicon_16)
                print(f"✓ SetClassLong small (16x16): {result}")
                success_count += 1
            except Exception as e2:
                print(f"  SetClassLongW SMALL also failed: {e2}")

        try:
            # Use the best available large icon
            best_large = hicon_48 or hicon_32 or hicon_default
            if best_large:
                result = ctypes.windll.user32.SetClassLongPtrW(hwnd, GCLP_HICON, best_large)
                print(f"✓ SetClassLongPtr large (taskbar): {result}")
                success_count += 1
        except Exception as e:
            print(f"  SetClassLongPtrW LARGE failed: {e}")
            # Try 32-bit version
            try:
                best_large = hicon_48 or hicon_32 or hicon_default
                if best_large:
                    result = ctypes.windll.user32.SetClassLongW(hwnd, GCL_HICON, best_large)
                    print(f"✓ SetClassLong large (taskbar): {result}")
                    success_count += 1
            except Exception as e2:
                print(f"  SetClassLongW LARGE also failed: {e2}")

        # Method 3: Force taskbar to refresh
        try:
            # Send a message to force taskbar icon refresh
            ctypes.windll.user32.UpdateWindow(hwnd)
            print(f"✓ UpdateWindow called")
        except:
            pass

        print(f"{'='*60}")
        print(f"ICON OPERATIONS COMPLETE: {success_count} successful")
        print(f"{'='*60}\n")

    except Exception as e:
        import traceback
        print(f"\n{'='*60}")
        print(f"ERROR setting window icon:")
        print(f"{'='*60}")
        traceback.print_exc()
        print(f"{'='*60}\n")


class Worker(QThread):
    finished = pyqtSignal(object)
    error = pyqtSignal(str)

    def __init__(self, fn, *args, **kwargs):
        super().__init__()
        self.fn = fn
        self.args = args
        self.kwargs = kwargs

    def run(self):
        thread_id = threading.current_thread().name
        thread_native_id = threading.get_native_id()
        logger.info(f"Worker thread starting: function={self.fn.__name__}, thread={thread_id}, native_id={thread_native_id}")

        try:
            result = self.fn(*self.args, **self.kwargs)
            logger.info(f"Worker thread completed successfully: function={self.fn.__name__}, thread={thread_id}")
            self.finished.emit(result)
        except Exception as e:
            logger.exception(f"Worker thread failed: function={self.fn.__name__}, thread={thread_id}")
            traceback.print_exc()
            self.error.emit(str(e))


class LoadingDialog(QDialog):
    """Modern loading spinner dialog"""

    def __init__(self, message="Processing...", parent=None):
        super().__init__(parent)
        self.setWindowTitle("Loading")
        self.setFixedSize(300, 150)
        self.setModal(True)
        self.setStyleSheet("background-color: #1a212b; border: 1px solid #545454; border-radius: 8px;")
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.FramelessWindowHint)

        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(20)

        # Spinner
        self.spinner = QFrame()
        self.spinner.setFixedSize(50, 50)
        self.spinner.setStyleSheet("border: 3px solid #545454; border-top: 3px solid #818cf8; border-radius: 25px;")
        self.spinner_angle = 0
        self.spinner_timer = QTimer()
        self.spinner_timer.timeout.connect(self._rotate_spinner)
        self.spinner_timer.start(50)

        layout.addWidget(self.spinner, alignment=Qt.AlignmentFlag.AlignCenter)

        # Message
        self.message_label = QLabel(message)
        self.message_label.setStyleSheet("color: #ffffff; font-size: 12px;")
        self.message_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.message_label)

    def _rotate_spinner(self):
        """Rotate the spinner"""
        self.spinner_angle += 10
        if self.spinner_angle >= 360:
            self.spinner_angle = 0
        # PyQt6 QSS doesn't support rotation, so we update the visual with dual-color borders
        self.spinner.setStyleSheet("border: 3px solid #545454; border-top: 3px solid #818cf8; border-right: 3px solid #818cf8; border-radius: 25px;")

    def set_message(self, message: str):
        """Update the loading message"""
        self.message_label.setText(message)

    def closeEvent(self, event):
        """Stop timer on close"""
        self.spinner_timer.stop()
        super().closeEvent(event)


class StyledConfirmDialog(QDialog):
    """Premium-styled confirmation dialog with native frame and custom buttons"""

    def __init__(self, title, message, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setFixedSize(400, 180)
        self.setStyleSheet("""
            QDialog {
                background-color: #1a212b;
                border: 1px solid #545454;
            }
            QLabel {
                color: #ffffff;
                font-size: 14px;
                padding-bottom: 10px;
            }
            QPushButton {
                background-color: transparent;
                border: 1px solid #545454;
                border-radius: 6px;
                color: #ffffff;
                padding: 8px 30px;
                font-size: 13px;
                min-width: 80px;
            }
            QPushButton:hover {
                background-color: #818cf8;
                color: #000000;
                border-color: #818cf8;
            }
        """)
        
        if ctypes and sys.platform == 'win32':
            set_native_grey_theme(int(self.winId()))

        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(20)

        # Message
        self.label = QLabel(message)
        self.label.setWordWrap(True)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.label)

        # Buttons
        btns_layout = QHBoxLayout()
        btns_layout.setSpacing(15)
        btns_layout.addStretch()

        self.yes_btn = QPushButton("Yes")
        self.yes_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.yes_btn.clicked.connect(self.accept)
        btns_layout.addWidget(self.yes_btn)

        self.no_btn = QPushButton("No")
        self.no_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.no_btn.clicked.connect(self.reject)
        btns_layout.addWidget(self.no_btn)
        
        btns_layout.addStretch()
        layout.addLayout(btns_layout)


class WaveformVisualizer(QWidget):
    """Real-time audio waveform visualizer showing input levels"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(40)
        self.bars = 12  # Number of bars in the visualizer
        self.bar_heights = [0] * self.bars
        self.decay_rate = 0.85  # How quickly bars fall back to zero

    def update_level(self, audio_chunk):
        """Update visualizer with new audio data"""
        if audio_chunk is None or len(audio_chunk) == 0:
            return

        # Calculate RMS (root mean square) energy for the chunk
        rms = np.sqrt(np.mean(audio_chunk ** 2))
        # Normalize to 0-1 range (adjust sensitivity as needed)
        level = min(1.0, rms * 5)

        # Update bar heights - shift left and add new value
        self.bar_heights = self.bar_heights[1:] + [level]
        # Apply decay to existing bars for smoother visualization
        self.bar_heights = [h * self.decay_rate for h in self.bar_heights[:-1]] + [self.bar_heights[-1]]

        self.update()

    def paintEvent(self, event):
        """Draw the waveform bars"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        bar_width = self.width() // self.bars
        bar_spacing = 3

        for i, height in enumerate(self.bar_heights):
            x = i * bar_width + bar_spacing // 2
            bar_height = int(height * (self.height() - 6))

            # Color transitions from blue to red based on level
            if height < 0.5:
                color = QColor(59, 130, 246)  # Blue
            elif height < 0.75:
                color = QColor(245, 158, 11)  # Amber
            else:
                color = QColor(239, 68, 68)   # Red

            # Draw bar from bottom
            y = self.height() - bar_height - 3
            painter.fillRect(x, y, bar_width - bar_spacing, bar_height, color)
            painter.setPen(QPen(color, 1))
            painter.drawRect(x, y, bar_width - bar_spacing, bar_height)


class PulsatingIcon(QPushButton):
    """An icon button that pulsates/breathes with a soft glow"""
    def __init__(self, text="ⓘ", parent=None):
        super().__init__("", parent)
        self.setFixedSize(32, 32)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setObjectName("PulsatingInfoIcon")
        
        # Internal layout to hold the label
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # The actual icon text inside a label (this will breathe)
        self.icon_label = QLabel(text)
        self.icon_label.setStyleSheet("color: #14b8a6; font-size: 18px; font-weight: bold; background: transparent;")
        self.icon_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        layout.addWidget(self.icon_label)

        # Style for the button background and border (Empty/Simple)
        self.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                border: none;
                border-radius: 0px;
                padding: 0px;
            }
            QPushButton:hover {
                background-color: transparent;
            }
            QPushButton:pressed {
                background-color: transparent;
            }
        """)

        # Opacity effect ONLY for the icon label
        self.opacity_effect = QGraphicsOpacityEffect(self.icon_label)
        self.icon_label.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(1.0)

        # Smooth In/Out Breathing Animation Loop
        self.anim_group = QSequentialAnimationGroup(self)
        
        # Inhale (Fade in)
        self.inhale = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.inhale.setDuration(1500)
        self.inhale.setStartValue(0.3)
        self.inhale.setEndValue(1.0)
        self.inhale.setEasingCurve(QEasingCurve.Type.InOutSine)
        
        # Exhale (Fade out)
        self.exhale = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.exhale.setDuration(1500)
        self.exhale.setStartValue(1.0)
        self.exhale.setEndValue(0.3)
        self.exhale.setEasingCurve(QEasingCurve.Type.InOutSine)
        
        self.anim_group.addAnimation(self.inhale)
        self.anim_group.addAnimation(self.exhale)
        self.anim_group.setLoopCount(-1) # Infinite loop
        self.anim_group.start()


class CheatSheetPopover(QFrame):
    """A stationary sticky information bubble for cheatsheet content"""
    closed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(380, 500)
        self.setObjectName("CheatSheetPopover")
        self.setStyleSheet("""
            QFrame#CheatSheetPopover {
                background-color: #1a212b;
                border: 2px solid #545454;
                border-radius: 12px;
            }
            QLabel {
                color: #ffffff;
                font-size: 13px;
                line-height: 1.6;
            }
            QLabel#Title {
                font-size: 16px;
                font-weight: bold;
                color: #2dd4bf;
                margin-top: 5px;
                margin-bottom: 5px;
            }
            QLabel#SectionHeader {
                font-weight: bold;
                color: #818cf8;
                margin-top: 15px;
            }
            QScrollArea {
                background: transparent;
                border: none;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header with Close Button
        header = QFrame()
        header.setFixedHeight(40)
        header.setStyleSheet("background: transparent;")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(20, 0, 20, 0) # Symmetric margins
        header_layout.setAlignment(Qt.AlignmentFlag.AlignVCenter)
        
        title_lbl = QLabel("LAZY Cheat Sheet")
        title_lbl.setObjectName("Title")
        header_layout.addWidget(title_lbl, alignment=Qt.AlignmentFlag.AlignVCenter)
        
        header_layout.addStretch()
        
        close_btn = QPushButton("X") # Standard X instead of unicode
        close_btn.setFixedSize(28, 28)
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #ff4444;
                border: none;
                font-size: 16px;
                font-weight: bold;
                padding: 0px;
            }
            QPushButton:hover {
                color: #ff8888;
            }
        """)
        close_btn.clicked.connect(self.hide)
        close_btn.clicked.connect(self.closed.emit)
        header_layout.addWidget(close_btn)
        layout.addWidget(header)

        # Content Area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(20, 10, 20, 20)
        content_layout.setSpacing(10)

        text_content = [
            ("The LAZY Work Tracker Cheat Sheet", "To get perfect Jira stories every time, try to use these \"trigger\" words while you speak."),
            ("1. The Core Story", "Formula: **\"As a [User], I want to [Action], so that [Benefit].\"**\n\nExample: \"As a Product Manager, I want to export the summary as a PDF, so that I can share it with stakeholders who don't have the app.\""),
            ("2. The Acceptance Criteria (Given/When/Then)", "Triggers: Use words like **\"Specifically,\"** **\"Scenario,\"** or **\"Validation.\"**\n\n**Given (The Context)**: \"Given I am on the History page...\"\n**When (The Action)**: \"When I click the export button...\"\n**Then (The Result)**: \"Then a PDF should download with the current date in the filename.\""),
            ("3. Technical Constraints", "Triggers: Use words like **\"Must,\"** **\"Only,\"** or **\"Requirement.\"**\n\nExample: \"The API must return a 404 if the story ID doesn't exist,\" or \"This only works for users with Admin permissions.\"")
        ]

        for title, body in text_content:
            if title:
                h = QLabel(title)
                h.setObjectName("SectionHeader")
                h.setWordWrap(True)
                content_layout.addWidget(h)
            
            b = QLabel(body)
            b.setWordWrap(True)
            content_layout.addWidget(b)

        content_layout.addStretch()
        scroll.setWidget(content_widget)
        layout.addWidget(scroll)

        # Initially hidden
        self.hide()
