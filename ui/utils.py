from PyQt6.QtCore import QThread, pyqtSignal, Qt, QTimer, QSize, QPropertyAnimation, QRect, QPoint, QEasingCurve
from PyQt6.QtWidgets import QDialog, QVBoxLayout, QLabel, QFrame, QWidget
from PyQt6.QtGui import QColor, QPainter, QFont, QPen
import traceback
import math


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
        # We'll use a simple border rotation effect
        style = f"border: 3px solid #27272a; border-top: 3px solid #3b82f6; border-radius: 25px; transform: rotate({self.spinner_angle}deg);"
        # PyQt6 QSS doesn't support rotation, so we'll just update the visual slightly
        self.spinner.setStyleSheet("border: 3px solid #27272a; border-top: 3px solid #3b82f6; border-right: 3px solid #3b82f6; border-radius: 25px;")

    def set_message(self, message: str):
        """Update the loading message"""
        self.message_label.setText(message)

    def closeEvent(self, event):
        """Stop timer on close"""
        self.spinner_timer.stop()
        super().closeEvent(event)


class IndustrialToggleSwitch(QWidget):
    """Vertical industrial toggle switch - click to toggle"""
    toggled = pyqtSignal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.is_on = False

        # Dimensions (vertical)
        self.switch_width = 112  # w-28
        self.switch_height = 224  # h-56
        self.handle_height = 128  # h-32
        self.MAX_TRAVEL = 80

        self.setFixedSize(self.switch_width, self.switch_height)
        self.handle_y = 0

        # Animation
        self.animation = QPropertyAnimation(self, b"handle_position")
        self.animation.setDuration(300)
        self.animation.setEasingCurve(QEasingCurve.Type.OutElastic)

        # Click detection
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def get_handle_position(self):
        return self.handle_y

    def set_handle_position(self, y):
        self.handle_y = y
        self.update()

    handle_position = property(get_handle_position, set_handle_position)

    def toggle(self):
        """Toggle switch state with animation"""
        self.is_on = not self.is_on
        self.animation.stop()
        self.animation.setStartValue(self.handle_y)
        self.animation.setEndValue(24 + self.MAX_TRAVEL if self.is_on else 24)
        self.animation.start()
        self.toggled.emit(self.is_on)

    def set_on(self, state):
        """Set switch to ON or OFF"""
        if self.is_on != state:
            self.toggle()

    def mousePressEvent(self, event):
        """Click to toggle"""
        if event.button() == Qt.MouseButton.LeftButton:
            self.toggle()

    def paintEvent(self, event):
        """Draw vertical industrial switch"""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Housing
        housing = QRect(16, 12, 80, 200)
        painter.fillRect(housing, QColor("#171717"))
        painter.setPen(QPen(QColor("#404040"), 2))
        painter.drawRoundedRect(housing, 24, 24)

        # Inner shadow
        painter.setPen(QPen(QColor("#000000"), 1))
        painter.drawRoundedRect(housing.adjusted(2, 2, -2, -2), 22, 22)

        # Caution stripes at bottom
        stripe_y = housing.bottom() - 32
        for i in range(0, 80, 20):
            painter.setPen(QPen(QColor("#1f1f1f"), 2))
            painter.drawLine(housing.left() + i, stripe_y, housing.left() + i + 20, stripe_y + 20)

        # Rail slot
        rail_rect = QRect(housing.center().x() - 3, housing.top() + 12, 6, housing.height() - 24)
        painter.fillRect(rail_rect, QColor("#000000"))
        painter.setPen(QPen(QColor("#1a1a1a"), 1))
        painter.drawRect(rail_rect)

        # LED indicator (color based on state)
        led_color = QColor("#10b981") if self.is_on else QColor("#7f1d1d")
        led_glow = self.MAX_TRAVEL / 2
        current_y = self.handle_y - 24
        progress = min(1.0, max(0.0, current_y / self.MAX_TRAVEL))
        led_color = QColor(
            int(68 + (16 - 68) * progress),
            int(26 + (185 - 26) * progress),
            int(26 + (129 - 129) * progress),
        )
        painter.setPen(QPen(QColor("#1a1a1a"), 1))
        painter.fillRect(QRect(housing.left() - 8, housing.top() - 6, 96, 4), led_color)

        # Status text (OFF/ON)
        painter.setFont(QFont("Courier", 6, QFont.Weight.Bold))
        painter.setPen(QColor("#475569"))
        painter.drawText(housing.right() + 4, housing.top() + 16, "OFF")
        painter.drawText(housing.right() + 4, housing.bottom() - 8, "ON")

        # Handle
        handle_rect = QRect(housing.left() + 8, int(self.handle_y), housing.width() - 16, self.handle_height)

        # Handle background gradient
        handle_color = QColor("#1e4d3f") if self.is_on else QColor("#374151")
        painter.fillRect(handle_rect, handle_color)
        painter.setPen(QPen(QColor("#4b5563"), 1))
        painter.drawRoundedRect(handle_rect, 8, 8)

        # Grip texture
        painter.setPen(QPen(QColor("#2d2d2d"), 1))
        for i in range(3):
            y = handle_rect.top() + 16 + i * 8
            painter.drawLine(handle_rect.left() + 8, y, handle_rect.right() - 8, y)

        # Handle text with fade effect
        text = "ONLINE" if self.is_on else "STANDBY"
        text_color = QColor("#10b981") if self.is_on else QColor("#9ca3af")
        painter.setPen(text_color)
        painter.setFont(QFont("Courier", 8, QFont.Weight.Bold))
        painter.drawText(handle_rect, Qt.AlignmentFlag.AlignCenter, text)
