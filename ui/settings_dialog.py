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
        
        self.openai_key = QLineEdit(self.settings.get('openaiApiKey', ''))
        self.openai_key.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow("OpenAI API Key:", self.openai_key)
        
        self.openai_model = QLineEdit(self.settings.get('openaiModel', 'gpt-4o'))
        form.addRow("OpenAI Model:", self.openai_model)
        
        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(100, 100000)
        self.max_tokens.setValue(self.settings.get('openaiMaxTokens', 4000))
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
            'openaiApiKey': self.openai_key.text(),
            'openaiModel': self.openai_model.text(),
            'openaiMaxTokens': self.max_tokens.value()
        }
        self.on_save(new_settings)
        self.accept()
