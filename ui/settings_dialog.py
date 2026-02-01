import requests
import sys
from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                             QLineEdit, QPushButton, QFormLayout, QSpinBox, QComboBox)
from PyQt6.QtCore import Qt
from ui.utils import set_native_grey_theme


def validate_openai_key(api_key: str) -> tuple[bool, str]:
    """Validate an OpenAI API key by making a test request."""
    if not api_key:
        return False, "API key is empty"
    if not api_key.startswith('sk-'):
        return False, "Invalid format (should start with 'sk-')"

    try:
        response = requests.get(
            'https://api.openai.com/v1/models',
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=10
        )
        if response.ok:
            return True, "API key is valid"
        elif response.status_code == 401:
            return False, "Invalid API key"
        else:
            return False, f"API error: {response.status_code}"
    except requests.Timeout:
        return False, "Connection timed out"
    except requests.RequestException as e:
        return False, f"Connection error: {str(e)}"


class SettingsDialog(QDialog):
    def __init__(self, current_settings, on_save, audio_engine=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setFixedWidth(650) # Increased to 650 to prevent label clipping
        self.settings = current_settings
        self.on_save = on_save
        self.audio_engine = audio_engine
        self.init_ui()
        
        if sys.platform == 'win32':
            set_native_grey_theme(int(self.winId()))

    def init_ui(self):
        self.setObjectName("SettingsDialog")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(35, 35, 35, 35)

        form = QFormLayout()
        form.setSpacing(20)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.AllNonFixedFieldsGrow)
        
        # Consistent label styling
        label_style = "color: #e4e4e7; font-weight: bold;"

        # API Key row with validate button
        key_layout = QHBoxLayout()
        self.openai_key = QLineEdit(self.settings.get('openaiApiKey', ''))
        self.openai_key.setEchoMode(QLineEdit.EchoMode.Password)
        self.openai_key.setFixedHeight(40)
        key_layout.addWidget(self.openai_key)

        self.validate_btn = QPushButton("Validate")
        self.validate_btn.setFixedWidth(110)
        self.validate_btn.setFixedHeight(40)
        self.validate_btn.setStyleSheet("border: 1px solid #d0d0d0;")
        self.validate_btn.clicked.connect(self.validate_key)
        key_layout.addWidget(self.validate_btn)

        api_label = QLabel("OpenAI API Key:")
        api_label.setMinimumWidth(160) # Ensure enough space for the label
        api_label.setStyleSheet(label_style)
        form.addRow(api_label, key_layout)

        self.validation_label = QLabel("")
        self.validation_label.setStyleSheet("font-size: 11px; margin-left: 5px;")
        form.addRow("", self.validation_label)

        self.openai_model = QLineEdit(self.settings.get('openaiModel', 'gpt-4o'))
        self.openai_model.setFixedHeight(40)
        model_label = QLabel("OpenAI Model:")
        model_label.setMinimumWidth(160)
        model_label.setStyleSheet(label_style)
        form.addRow(model_label, self.openai_model)

        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(100, 100000)
        self.max_tokens.setValue(self.settings.get('openaiMaxTokens', 4000))
        self.max_tokens.setFixedHeight(40)
        tokens_label = QLabel("Max Tokens:")
        tokens_label.setMinimumWidth(160)
        tokens_label.setStyleSheet(label_style)
        form.addRow(tokens_label, self.max_tokens)

        # Audio Input Device
        self.device_combo = QComboBox()
        self.device_combo.setFixedHeight(40)
        if self.audio_engine:
            devices = self.audio_engine.get_audio_devices()
            saved_device_id = self.settings.get('audioInputDevice', 0)
            for i, dev in enumerate(devices):
                if dev['max_input_channels'] > 0:
                    self.device_combo.addItem(dev['name'], i)
                    if i == saved_device_id:
                        self.device_combo.setCurrentIndex(self.device_combo.count() - 1)
        
        audio_label = QLabel("Audio Input Device:")
        audio_label.setMinimumWidth(160)
        audio_label.setStyleSheet(label_style)
        form.addRow(audio_label, self.device_combo)

        layout.addLayout(form)

        btns = QHBoxLayout()
        btns.setContentsMargins(0, 20, 0, 0)
        
        save_btn = QPushButton("Save")
        save_btn.setStyleSheet("border: 1px solid #d0d0d0; padding: 8px 25px;")
        save_btn.clicked.connect(self.handle_save)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.setStyleSheet("border: 1px solid #d0d0d0; padding: 8px 25px;")
        cancel_btn.clicked.connect(self.reject)

        btns.addStretch()
        btns.addWidget(cancel_btn)
        btns.addWidget(save_btn)

        layout.addLayout(btns)

    def validate_key(self):
        self.validate_btn.setEnabled(False)
        self.validate_btn.setText("⟳ Validating...")
        self.validation_label.setText("Validating...")
        self.validation_label.setStyleSheet("color: #64748b; font-size: 11px;")

        # Process events to update UI before blocking request
        from PyQt6.QtWidgets import QApplication
        QApplication.processEvents()

        api_key = self.openai_key.text()
        is_valid, message = validate_openai_key(api_key)

        if is_valid:
            self.validation_label.setText(message)
            self.validation_label.setStyleSheet("color: #10b981; font-size: 11px;")
        else:
            self.validation_label.setText(message)
            self.validation_label.setStyleSheet("color: #ef4444; font-size: 11px;")

        self.validate_btn.setEnabled(True)
        self.validate_btn.setText("Validate")

    def handle_save(self):
        new_settings = {
            'openaiApiKey': self.openai_key.text(),
            'openaiModel': self.openai_model.text(),
            'openaiMaxTokens': self.max_tokens.value(),
            'audioInputDevice': self.device_combo.currentData() or 0
        }
        self.on_save(new_settings)
        self.accept()
