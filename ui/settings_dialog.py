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
        label_style = "color: {{ foreground }}; font-weight: bold;"

        # --- Appearance Section ---
        appearance_label = QLabel("Appearance")
        appearance_label.setStyleSheet("color: {{ accent }}; font-size: 14px; font-weight: bold; margin-bottom: 5px;")
        layout.addWidget(appearance_label)

        appearance_form = QFormLayout()
        appearance_form.setSpacing(20)
        appearance_form.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        
        self.theme_combo = QComboBox()
        self.theme_combo.setFixedHeight(40)
        self.theme_combo.addItems(["Dark (Default)", "Light"])
        settings_theme = self.settings.get('theme', 'dark')
        self.theme_combo.setCurrentIndex(1 if settings_theme == 'light' else 0)
        
        theme_label = QLabel("Theme:")
        theme_label.setMinimumWidth(160)
        # Use simple style if labels aren't picking up global Stylesheet yet
        # But we will rely on global stylesheet for colors mostly
        appearance_form.addRow(theme_label, self.theme_combo)
        
        layout.addLayout(appearance_form)
        
        # Spacer
        layout.addSpacing(20)
        
        # --- API Section ---
        api_header = QLabel("API Configuration")
        api_header.setStyleSheet("color: {{ accent }}; font-size: 14px; font-weight: bold; margin-bottom: 5px;")
        layout.addWidget(api_header)

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

        # Audio Input Device with Test Button
        device_layout = QHBoxLayout()

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

        device_layout.addWidget(self.device_combo)

        self.test_audio_btn = QPushButton("Test Audio")
        self.test_audio_btn.setFixedWidth(110)
        self.test_audio_btn.setFixedHeight(40)
        self.test_audio_btn.setStyleSheet("border: 1px solid #d0d0d0;")
        self.test_audio_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.test_audio_btn.clicked.connect(self.test_audio)
        device_layout.addWidget(self.test_audio_btn)

        audio_label = QLabel("Audio Input Device:")
        audio_label.setMinimumWidth(160)
        audio_label.setStyleSheet(label_style)
        form.addRow(audio_label, device_layout)

        # Status label for audio test feedback
        self.audio_status_label = QLabel("")
        self.audio_status_label.setStyleSheet("font-size: 11px; margin-left: 5px;")
        form.addRow("", self.audio_status_label)

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

    def test_audio(self):
        """Test audio recording and playback"""
        from logger_config import logger
        import sounddevice as sd
        import numpy as np

        logger.info("Audio test starting")

        # Get selected device
        device_id = self.device_combo.currentData()
        if device_id is None:
            self.audio_status_label.setText("Please select a device first")
            self.audio_status_label.setStyleSheet("color: #ef4444; font-size: 11px;")
            return

        try:
            # Update UI
            self.test_audio_btn.setEnabled(False)
            self.test_audio_btn.setText("Recording...")
            self.audio_status_label.setText("Recording 2 seconds...")
            self.audio_status_label.setStyleSheet("color: #3b82f6; font-size: 11px;")

            # Process events to update UI
            from PyQt6.QtWidgets import QApplication
            QApplication.processEvents()

            # Record 2 seconds
            samplerate = 16000
            duration = 2.0

            logger.info(f"Recording from device {device_id} for {duration}s")
            recording = sd.rec(int(duration * samplerate),
                              samplerate=samplerate,
                              channels=1,
                              device=device_id)
            sd.wait()  # Wait for recording to complete

            logger.info("Recording complete, playing back")

            # Update UI
            self.test_audio_btn.setText("Playing...")
            self.audio_status_label.setText("Playing back recording...")
            QApplication.processEvents()

            # Play back
            sd.play(recording, samplerate)
            sd.wait()  # Wait for playback to complete

            # Success
            self.audio_status_label.setText("✓ Audio test successful!")
            self.audio_status_label.setStyleSheet("color: #10b981; font-size: 11px;")
            logger.info("Audio test successful")

        except Exception as e:
            logger.exception("Audio test failed")
            self.audio_status_label.setText(f"✗ Test failed: {str(e)}")
            self.audio_status_label.setStyleSheet("color: #ef4444; font-size: 11px;")
        finally:
            # Restore button
            self.test_audio_btn.setEnabled(True)
            self.test_audio_btn.setText("Test Audio")

    def handle_save(self):
        new_settings = {
            'openaiApiKey': self.openai_key.text(),
            'openaiModel': self.openai_model.text(),
            'openaiMaxTokens': self.max_tokens.value(),
            'audioInputDevice': self.device_combo.currentData() or 0,
            'theme': 'light' if self.theme_combo.currentIndex() == 1 else 'dark'
        }
        self.on_save(new_settings)
        self.accept()
