from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel, 
                             QLineEdit, QPushButton, QComboBox, QFormLayout, QSpinBox)
from PyQt6.QtCore import Qt

class SettingsDialog(QDialog):
    def __init__(self, current_settings, on_save, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setFixedWidth(400)
        self.settings = current_settings
        self.on_save = on_save
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        
        form = QFormLayout()
        
        self.claude_key = QLineEdit(self.settings.get('claudeApiKey', ''))
        self.claude_key.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow("Claude API Key:", self.claude_key)
        
        self.whisper_provider = QComboBox()
        self.whisper_provider.addItems(["groq", "openai"])
        self.whisper_provider.setCurrentText(self.settings.get('whisperProvider', 'groq'))
        form.addRow("Whisper Provider:", self.whisper_provider)
        
        self.whisper_key = QLineEdit(self.settings.get('whisperApiKey', ''))
        self.whisper_key.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow("Whisper API Key:", self.whisper_key)
        
        self.claude_model = QLineEdit(self.settings.get('claudeModel', 'claude-3-5-sonnet-20240620'))
        form.addRow("Claude Model:", self.claude_model)
        
        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(100, 100000)
        self.max_tokens.setValue(self.settings.get('claudeMaxTokens', 4000))
        form.addRow("Max Tokens:", self.max_tokens)
        
        layout.addLayout(form)
        
        btns = QHBoxLayout()
        save_btn = QPushButton("Save")
        save_btn.clicked.connect(self.handle_save)
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        
        btns.addStretch()
        btns.addWidget(cancel_btn)
        btns.addWidget(save_btn)
        
        layout.addLayout(btns)

    def handle_save(self):
        new_settings = {
            'claudeApiKey': self.claude_key.text(),
            'whisperProvider': self.whisper_provider.currentText(),
            'whisperApiKey': self.whisper_key.text(),
            'claudeModel': self.claude_model.text(),
            'claudeMaxTokens': self.max_tokens.value()
        }
        self.on_save(new_settings)
        self.accept()
