import requests
from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                             QLineEdit, QPushButton, QFormLayout, QSpinBox)
from PyQt6.QtCore import Qt


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
    def __init__(self, current_settings, on_save, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setFixedWidth(450)
        self.settings = current_settings
        self.on_save = on_save
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)

        form = QFormLayout()

        # API Key row with validate button
        key_layout = QHBoxLayout()
        self.openai_key = QLineEdit(self.settings.get('openaiApiKey', ''))
        self.openai_key.setEchoMode(QLineEdit.EchoMode.Password)
        key_layout.addWidget(self.openai_key)

        self.validate_btn = QPushButton("✓ Validate")
        self.validate_btn.setFixedWidth(90)
        self.validate_btn.clicked.connect(self.validate_key)
        key_layout.addWidget(self.validate_btn)

        form.addRow("OpenAI API Key:", key_layout)

        self.validation_label = QLabel("")
        self.validation_label.setStyleSheet("font-size: 11px;")
        form.addRow("", self.validation_label)

        self.openai_model = QLineEdit(self.settings.get('openaiModel', 'gpt-4o'))
        form.addRow("OpenAI Model:", self.openai_model)

        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(100, 100000)
        self.max_tokens.setValue(self.settings.get('openaiMaxTokens', 4000))
        form.addRow("Max Tokens:", self.max_tokens)

        layout.addLayout(form)

        btns = QHBoxLayout()
        save_btn = QPushButton("💾 Save")
        save_btn.clicked.connect(self.handle_save)
        cancel_btn = QPushButton("✕ Cancel")
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
        self.validate_btn.setText("✓ Validate")

    def handle_save(self):
        new_settings = {
            'openaiApiKey': self.openai_key.text(),
            'openaiModel': self.openai_model.text(),
            'openaiMaxTokens': self.max_tokens.value()
        }
        self.on_save(new_settings)
        self.accept()
