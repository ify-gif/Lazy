import requests
import sys
from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                             QLineEdit, QPushButton, QFormLayout, QSpinBox, QComboBox)
from PyQt6.QtCore import Qt, QTimer
from ui.utils import set_native_grey_theme, Worker
from logger_config import logger


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
        # Track background workers to prevent garbage collection
        self._validation_worker = None
        self._audio_test_active = False
        self._recorded_audio = None
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
        label_style = "font-weight: bold;"  # colour inherited from global QLabel rule

        # --- Appearance Section ---
        appearance_label = QLabel("Appearance")
        appearance_label.setStyleSheet("color: #f59e0b; font-size: 14px; font-weight: bold; margin-bottom: 5px;")
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
        api_header.setStyleSheet("color: #f59e0b; font-size: 14px; font-weight: bold; margin-bottom: 5px;")
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
        self.validate_btn.setStyleSheet("padding: 8px 12px;")
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
        # Reduce padding to prevent text clipping in fixed-width button
        self.test_audio_btn.setStyleSheet("padding: 8px 12px;")
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
        save_btn.setObjectName("PrimaryButton")
        save_btn.clicked.connect(self.handle_save)
        
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)

        btns.addStretch()
        btns.addWidget(cancel_btn)
        btns.addWidget(save_btn)

        layout.addLayout(btns)

    def validate_key(self):
        """Validate API key in background thread to avoid UI blocking."""
        self.validate_btn.setEnabled(False)
        self.validate_btn.setText("⟳ Validating...")
        self.validation_label.setText("Validating...")
        self.validation_label.setStyleSheet("color: #737373; font-size: 11px;")

        api_key = self.openai_key.text()
        
        # Run validation in background thread
        self._validation_worker = Worker(validate_openai_key, api_key)
        self._validation_worker.finished.connect(self._on_validation_complete)
        self._validation_worker.error.connect(self._on_validation_error)
        self._validation_worker.start()

    def _on_validation_complete(self, result: tuple):
        """Handle validation result from background worker."""
        is_valid, message = result
        
        if is_valid:
            self.validation_label.setText(message)
            self.validation_label.setStyleSheet("color: #14b8a6; font-size: 11px;")
        else:
            self.validation_label.setText(message)
            self.validation_label.setStyleSheet("color: #ef4444; font-size: 11px;")

        self.validate_btn.setEnabled(True)
        self.validate_btn.setText("Validate")

    def _on_validation_error(self, error_msg: str):
        """Handle validation error from background worker."""
        self.validation_label.setText(f"Validation error: {error_msg}")
        self.validation_label.setStyleSheet("color: #ef4444; font-size: 11px;")
        self.validate_btn.setEnabled(True)
        self.validate_btn.setText("Validate")

    def test_audio(self):
        """Test audio recording and playback using non-blocking approach.
        
        Uses QTimer callbacks to avoid blocking the UI thread:
        1. Start recording (non-blocking, sounddevice streams in background)
        2. After 2 seconds, stop recording and start playback
        3. After playback duration, show success message
        """
        import sounddevice as sd

        # Prevent multiple concurrent tests
        if self._audio_test_active:
            return

        # Get selected device
        device_id = self.device_combo.currentData()
        if device_id is None:
            self.audio_status_label.setText("Please select a device first")
            self.audio_status_label.setStyleSheet("color: #ef4444; font-size: 11px;")
            return

        logger.info(f"Audio test starting with device {device_id}")
        self._audio_test_active = True
        self._audio_device_id = device_id
        self._audio_data = []
        self._samplerate = 16000
        self._record_duration = 2.0  # seconds

        # Update UI
        self.test_audio_btn.setEnabled(False)
        self.test_audio_btn.setText("Recording...")
        self.audio_status_label.setText("Recording 2 seconds...")
        self.audio_status_label.setStyleSheet("color: #4f46e5; font-size: 11px;")

        try:
            # Start recording with callback (non-blocking)
            def audio_callback(indata, frames, time, status):
                if status:
                    logger.warning(f"Audio status: {status}")
                self._audio_data.append(indata.copy())

            self._audio_stream = sd.InputStream(
                samplerate=self._samplerate,
                channels=1,
                device=device_id,
                callback=audio_callback,
                dtype='float32'
            )
            self._audio_stream.start()

            # Schedule stop recording after duration
            QTimer.singleShot(int(self._record_duration * 1000), self._on_recording_complete)

        except Exception as e:
            logger.exception("Audio test failed to start")
            self._on_audio_test_error(str(e))

    def _on_recording_complete(self):
        """Called when recording duration is complete."""
        import sounddevice as sd
        import numpy as np

        try:
            # Stop recording stream
            if hasattr(self, '_audio_stream') and self._audio_stream:
                self._audio_stream.stop()
                self._audio_stream.close()
                self._audio_stream = None

            if not self._audio_data:
                self._on_audio_test_error("No audio data recorded")
                return

            # Concatenate recorded audio
            self._recorded_audio = np.concatenate(self._audio_data, axis=0)
            logger.info(f"Recording complete: {len(self._recorded_audio)} samples")

            # Update UI for playback
            self.test_audio_btn.setText("Playing...")
            self.audio_status_label.setText("Playing back recording...")

            # Start playback (non-blocking with callback)
            sd.play(self._recorded_audio, self._samplerate)

            # Schedule completion check after playback duration
            playback_duration_ms = int((len(self._recorded_audio) / self._samplerate) * 1000) + 100
            QTimer.singleShot(playback_duration_ms, self._on_playback_complete)

        except Exception as e:
            logger.exception("Error during recording completion")
            self._on_audio_test_error(str(e))

    def _on_playback_complete(self):
        """Called when playback is complete."""
        import sounddevice as sd
        sd.stop()  # Ensure playback is stopped
        
        logger.info("Audio test successful")
        self.audio_status_label.setText("✓ Audio test successful!")
        self.audio_status_label.setStyleSheet("color: #14b8a6; font-size: 11px;")
        self._reset_audio_test_state()

    def _on_audio_test_error(self, error_msg: str):
        """Handle audio test error."""
        logger.error(f"Audio test failed: {error_msg}")
        self.audio_status_label.setText(f"✗ Test failed: {error_msg}")
        self.audio_status_label.setStyleSheet("color: #ef4444; font-size: 11px;")
        self._reset_audio_test_state()

    def _reset_audio_test_state(self):
        """Reset audio test state and UI."""
        self._audio_test_active = False
        self._audio_data = []
        self._recorded_audio = None
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
