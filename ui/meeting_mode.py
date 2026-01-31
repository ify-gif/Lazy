from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                             QPushButton, QTextEdit, QFrame, QComboBox, QScrollArea,
                             QListWidget, QListWidgetItem, QDialog)
from api_client import APIClient
from ui.utils import Worker

class MeetingMode(QWidget):
    def __init__(self, audio_engine, db_manager, get_api_client_cb, on_toast, parent=None):
        super().__init__(parent)
        self.audio_engine = audio_engine
        self.db_manager = db_manager
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
        header_container = QVBoxLayout()
        meeting_label = QLabel("MEETING TRANSCRIPTION")
        meeting_label.setStyleSheet("color: #6366f1; font-weight: bold; letter-spacing: 1px; font-size: 11px;")
        header_container.addWidget(meeting_label)
        
        self.title_input = QTextEdit()
        self.title_input.setPlaceholderText("Enter meeting title...")
        self.title_input.setFixedHeight(45)
        self.title_input.setObjectName("MeetingTitleInput")
        self.title_input.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        header_container.addWidget(self.title_input)
        toolbar.addLayout(header_container)
        
        toolbar.addStretch()
        
        self.history_btn = QPushButton("History")
        self.history_btn.setFixedSize(100, 40)
        self.history_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.history_btn.clicked.connect(self.show_history)
        toolbar.addWidget(self.history_btn)
        layout.addLayout(toolbar)
        
        # Controls
        controls_card = QFrame()
        controls_card.setObjectName("ControlsCard")
        controls_card.setStyleSheet("#ControlsCard { background: #0f172a; border-radius: 12px; border: 1px solid #1e293b; }")
        controls_layout = QHBoxLayout(controls_card)
        controls_layout.setContentsMargins(15, 10, 15, 10)
        
        controls_layout.addWidget(QLabel("INPUT DEVICE:"))
        self.device_combo = QComboBox()
        self.device_combo.setFixedWidth(250)
        self.load_devices()
        controls_layout.addWidget(self.device_combo)
        
        controls_layout.addSpacing(20)
        
        self.record_btn = QPushButton("Start Recording")
        self.record_btn.setFixedWidth(180)
        self.record_btn.setObjectName("PrimaryButton")
        self.record_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.record_btn.clicked.connect(self.toggle_recording)
        controls_layout.addWidget(self.record_btn)
        
        self.timer_label = QLabel("00:00:00")
        self.timer_label.setStyleSheet("font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 16px; font-weight: bold; color: #ef4444; margin-left: 10px;")
        self.timer_label.hide()
        controls_layout.addWidget(self.timer_label)
        
        controls_layout.addStretch()
        
        self.save_btn = QPushButton("Save To Cloud")
        self.save_btn.setObjectName("SuccessButton")
        self.save_btn.setStyleSheet("background: #10b981; border: none; font-weight: bold;")
        self.save_btn.clicked.connect(self.save_transcript)
        self.save_btn.hide()
        controls_layout.addWidget(self.save_btn)
        
        layout.addWidget(controls_card)
        
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
            
        self.on_toast("Transcribing audio...", "info")
        self.worker = Worker(api_client.transcribe_audio, path)
        self.worker.finished.connect(self.on_transcription_success)
        self.worker.error.connect(self.on_worker_error)
        self.worker.start()

    def on_transcription_success(self, text):
        self.transcript_edit.setPlainText(text)
        self.on_toast("Transcription complete", "success")
        self.save_btn.show()
        self.reset_record_btn()

    def generate_summary(self):
        transcript = self.transcript_edit.toPlainText()
        if not transcript: return
        
        api_client = self.get_api_client()
        if not api_client:
            self.on_toast("API keys not configured", "error")
            return
            
        self.on_toast("Generating summary...", "info")
        self.worker = Worker(api_client.generate_meeting_summary, transcript)
        self.worker.finished.connect(self.on_summary_success)
        self.worker.error.connect(self.on_worker_error)
        self.worker.start()

    def on_summary_success(self, summary):
        self.summary_view.setPlainText(summary)
        self.on_toast("Summary generated", "success")

    def on_worker_error(self, message):
        self.on_toast(message, "error")
        self.reset_record_btn()

    def show_history(self):
        dialog = QDialog(self)
        dialog.setWindowTitle("Meeting History")
        dialog.setFixedSize(500, 400)
        layout = QVBoxLayout(dialog)
        
        list_widget = QListWidget()
        items = self.db_manager.get_transcripts()
        for item in items:
            list_item = QListWidgetItem(f"{item['title']} ({item['recording_date'][:10]})")
            list_item.setData(Qt.ItemDataRole.UserRole, item)
            list_widget.addItem(list_item)
            
        layout.addWidget(list_widget)
        
        load_btn = QPushButton("Load Selected")
        def load():
            curr = list_widget.currentItem()
            if curr:
                data = curr.data(Qt.ItemDataRole.UserRole)
                self.title_input.setPlainText(data['title'])
                self.transcript_edit.setPlainText(data['content'])
                self.summary_view.setPlainText(data['summary'])
                dialog.accept()
        
        load_btn.clicked.connect(load)
        layout.addWidget(load_btn)
        dialog.exec()

    def save_transcript(self):
        title = self.title_input.toPlainText() or "Untitled Meeting"
        content = self.transcript_edit.toPlainText()
        summary = self.summary_view.toPlainText()
        
        if not content: return
        
        try:
            data = {
                'title': title,
                'content': content,
                'summary': summary,
                'duration': self.seconds_elapsed
            }
            self.db_manager.save_transcript(data)
            self.on_toast("Transcript saved locally", "success")
        except Exception as e:
            self.on_toast(f"Failed to save: {str(e)}", "error")

    def reset_record_btn(self):
        self.record_btn.setText("Start Recording")
        self.record_btn.setObjectName("PrimaryButton")
        self.record_btn.setEnabled(True)
        self.record_btn.style().unpolish(self.record_btn)
        self.record_btn.style().polish(self.record_btn)
        self.timer_label.hide()
