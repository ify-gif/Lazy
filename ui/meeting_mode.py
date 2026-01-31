from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                             QPushButton, QTextEdit, QFrame, QComboBox, QScrollArea)
from PyQt6.QtCore import Qt, QTimer
from api_client import APIClient

class MeetingMode(QWidget):
    def __init__(self, audio_engine, get_api_client_cb, on_toast, parent=None):
        super().__init__(parent)
        self.audio_engine = audio_engine
        self.get_api_client = get_api_client_cb
        self.on_toast = on_toast
        
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_timer)
        self.seconds_elapsed = 0
        
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 20, 30, 20)
        layout.setSpacing(20)
        
        # Toolbar
        toolbar = QHBoxLayout()
        self.title_input = QTextEdit()
        self.title_input.setPlaceholderText("Meeting Title...")
        self.title_input.setFixedHeight(40)
        self.title_input.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        toolbar.addWidget(self.title_input)
        
        toolbar.addStretch()
        
        self.history_btn = QPushButton("History")
        toolbar.addWidget(self.history_btn)
        layout.addLayout(toolbar)
        
        # Controls
        controls = QHBoxLayout()
        controls.addWidget(QLabel("Input:"))
        self.device_combo = QComboBox()
        self.load_devices()
        controls.addWidget(self.device_combo)
        
        self.record_btn = QPushButton("Start Recording")
        self.record_btn.setFixedWidth(180)
        self.record_btn.setObjectName("PrimaryButton")
        self.record_btn.clicked.connect(self.toggle_recording)
        controls.addWidget(self.record_btn)
        
        self.timer_label = QLabel("00:00:00")
        self.timer_label.setStyleSheet("font-family: monospace; font-weight: bold; color: #ef4444;")
        self.timer_label.hide()
        controls.addWidget(self.timer_label)
        
        controls.addStretch()
        
        self.save_btn = QPushButton("Save")
        self.save_btn.hide()
        controls.addWidget(self.save_btn)
        
        layout.addLayout(controls)
        
        # Content Area
        content = QHBoxLayout()
        
        # Transcript Side
        transcript_container = QVBoxLayout()
        transcript_container.addWidget(QLabel("Transcript"))
        self.transcript_edit = QTextEdit()
        self.transcript_edit.setPlaceholderText("Your transcript will appear here...")
        transcript_container.addWidget(self.transcript_edit)
        
        # Actions under transcript
        actions = QHBoxLayout()
        self.summary_btn = QPushButton("Generate AI Summary")
        self.summary_btn.clicked.connect(self.generate_summary)
        actions.addWidget(self.summary_btn)
        
        self.export_btn = QPushButton("Export")
        actions.addWidget(self.export_btn)
        transcript_container.addLayout(actions)
        
        content.addLayout(transcript_container, 2)
        
        # Summary Side
        self.summary_container = QFrame()
        self.summary_container.setFixedWidth(300)
        self.summary_container.setObjectName("SummaryContainer")
        summary_layout = QVBoxLayout(self.summary_container)
        summary_layout.addWidget(QLabel("AI Summary"))
        self.summary_view = QTextEdit()
        self.summary_view.setReadOnly(True)
        summary_layout.addWidget(self.summary_view)
        
        content.addWidget(self.summary_container)
        
        layout.addLayout(content)

    def load_devices(self):
        devices = self.audio_engine.get_audio_devices()
        for i, dev in enumerate(devices):
            if dev['max_input_channels'] > 0:
                self.device_combo.addItem(dev['name'], i)

    def toggle_recording(self):
        if not self.audio_engine.is_recording():
            device_id = self.device_combo.currentData()
            self.audio_engine.start_recording(device_id)
            self.record_btn.setText("Stop Recording")
            self.record_btn.setObjectName("RecordingButton")
            self.record_btn.setProperty("class", "recording") # For QSS
            self.record_btn.style().unpolish(self.record_btn)
            self.record_btn.style().polish(self.record_btn)
            
            self.seconds_elapsed = 0
            self.timer_label.show()
            self.timer.start(1000)
            self.on_toast("Recording started", "info")
        else:
            self.timer.stop()
            self.record_btn.setText("Transcribing...")
            self.record_btn.setEnabled(False)
            
            path = self.audio_engine.stop_recording()
            self.transcribe(path)

    def update_timer(self):
        self.seconds_elapsed += 1
        h = self.seconds_elapsed // 3600
        m = (self.seconds_elapsed % 3600) // 60
        s = self.seconds_elapsed % 60
        self.timer_label.setText(f"{h:02d}:{m:02d}:{s:02d}")

    def transcribe(self, path):
        api_client = self.get_api_client()
        if not api_client:
            self.on_toast("API keys not configured", "error")
            self.reset_record_btn()
            return
            
        try:
            self.on_toast("Transcribing audio...", "info")
            # In a real app, this should be in a separate thread to not block UI
            text = api_client.transcribe_audio(path)
            self.transcript_edit.setPlainText(text)
            self.on_toast("Transcription complete", "success")
            self.save_btn.show()
        except Exception as e:
            self.on_toast(str(e), "error")
        finally:
            self.reset_record_btn()

    def generate_summary(self):
        transcript = self.transcript_edit.toPlainText()
        if not transcript: return
        
        api_client = self.get_api_client()
        try:
            self.on_toast("Generating summary...", "info")
            summary = api_client.generate_meeting_summary(transcript)
            self.summary_view.setPlainText(summary)
            self.on_toast("Summary generated", "success")
        except Exception as e:
            self.on_toast(str(e), "error")

    def reset_record_btn(self):
        self.record_btn.setText("Start Recording")
        self.record_btn.setObjectName("PrimaryButton")
        self.record_btn.setEnabled(True)
        self.record_btn.style().unpolish(self.record_btn)
        self.record_btn.style().polish(self.record_btn)
        self.timer_label.hide()
