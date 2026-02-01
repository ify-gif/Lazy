from PyQt6.QtCore import QThread, pyqtSignal, Qt, QTimer
from PyQt6.QtWidgets import QDialog, QVBoxLayout, QLabel, QFrame, QWidget, QHBoxLayout
from PyQt6.QtGui import QColor, QPainter, QPen
import traceback
import numpy as np
import ctypes

def set_native_grey_theme(hwnd):
    """Set Windows native title bar to grey color (matches premium look)"""
    # Grey color: 0x00A0A0A0 (BGR format)
    grey_color = 0x00A0A0A0 
    try:
        ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(ctypes.c_int(grey_color)), 4)
    except Exception:
        pass


class Worker(QThread):
    finished = pyqtSignal(object)
    error = pyqtSignal(str)

    def __init__(self, fn, *args, **kwargs):
        super().__init__()
        self.fn = fn
        self.args = args
        self.kwargs = kwargs

    def run(self):
        try:
            result = self.fn(*self.args, **self.kwargs)
            self.finished.emit(result)
        except Exception as e:
            traceback.print_exc()
            self.error.emit(str(e))


class LoadingDialog(QDialog):
    """Modern loading spinner dialog"""

    def __init__(self, message="Processing...", parent=None):
        super().__init__(parent)
        self.setWindowTitle("Loading")
        self.setFixedSize(300, 150)
        self.setModal(True)
        self.setStyleSheet("background-color: #1e293b; border: 1px solid #27272a; border-radius: 8px;")
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.FramelessWindowHint)

        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(20)

        # Spinner
        self.spinner = QFrame()
        self.spinner.setFixedSize(50, 50)
        self.spinner.setStyleSheet("border: 3px solid #27272a; border-top: 3px solid #3b82f6; border-radius: 25px;")
        self.spinner_angle = 0
        self.spinner_timer = QTimer()
        self.spinner_timer.timeout.connect(self._rotate_spinner)
        self.spinner_timer.start(50)

        layout.addWidget(self.spinner, alignment=Qt.AlignmentFlag.AlignCenter)

        # Message
        self.message_label = QLabel(message)
        self.message_label.setStyleSheet("color: #e4e4e7; font-size: 12px;")
        self.message_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.message_label)

    def _rotate_spinner(self):
        """Rotate the spinner"""
        self.spinner_angle += 10
        if self.spinner_angle >= 360:
            self.spinner_angle = 0
        # PyQt6 QSS doesn't support rotation, so we update the visual with dual-color borders
        self.spinner.setStyleSheet("border: 3px solid #27272a; border-top: 3px solid #3b82f6; border-right: 3px solid #3b82f6; border-radius: 25px;")

    def set_message(self, message: str):
        """Update the loading message"""
        self.message_label.setText(message)

    def closeEvent(self, event):
        """Stop timer on close"""
        self.spinner_timer.stop()
        super().closeEvent(event)


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
