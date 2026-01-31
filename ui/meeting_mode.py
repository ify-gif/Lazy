from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel,
                             QPushButton, QTextEdit, QFrame, QComboBox, QScrollArea,
                             QListWidget, QListWidgetItem, QDialog, QLineEdit)
from ui.utils import Worker, LoadingDialog, IndustrialToggleSwitch

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
        self.title_input = QTextEdit()
        self.title_input.setPlaceholderText("Meeting Title...")
        self.title_input.setFixedHeight(40)
        self.title_input.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        toolbar.addWidget(self.title_input)
        
        toolbar.addStretch()
        
        self.history_btn = QPushButton("📋 History")
        self.history_btn.clicked.connect(self.show_history)
        toolbar.addWidget(self.history_btn)
        layout.addLayout(toolbar)
        
        # Controls
        controls = QHBoxLayout()
        controls.addWidget(QLabel("Input:"))
        self.device_combo = QComboBox()
        self.load_devices()
        controls.addWidget(self.device_combo)

        self.record_btn = IndustrialToggleSwitch()
        self.record_btn.toggled.connect(self.toggle_recording)
        controls.addWidget(self.record_btn)
        
        self.timer_label = QLabel("00:00:00")
        self.timer_label.setStyleSheet("font-family: monospace; font-weight: bold; color: #ef4444;")
        self.timer_label.hide()
        controls.addWidget(self.timer_label)
        
        controls.addStretch()
        
        self.save_btn = QPushButton("💾 Save")
        self.save_btn.clicked.connect(self.save_transcript)
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
        self.summary_btn = QPushButton("✨ Generate AI Summary")
        self.summary_btn.clicked.connect(self.generate_summary)
        actions.addWidget(self.summary_btn)

        self.export_btn = QPushButton("📤 Export")
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

    def toggle_recording(self, is_on):
        if is_on:
            device_id = self.device_combo.currentData()
            self.audio_engine.start_recording(device_id)
            self.seconds_elapsed = 0
            self.timer_label.show()
            self.timer.start(1000)
            self.on_toast("🎤 Recording started", "info")
        else:
            self.timer.stop()
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
            self.on_toast("API key not configured. Open Settings to add your API key.", "error")
            self.audio_engine.cleanup_temp_file(path)
            self.reset_record_btn()
            return

        self._current_audio_path = path
        self._loading_dialog = LoadingDialog("🎤 Transcribing your audio...", self)
        self._loading_dialog.show()

        self.worker = Worker(api_client.transcribe_audio, path)
        self.worker.finished.connect(self.on_transcription_success)
        self.worker.error.connect(self.on_worker_error)
        self.worker.start()

    def on_transcription_success(self, text):
        if hasattr(self, '_loading_dialog'):
            self._loading_dialog.close()
        self.transcript_edit.setPlainText(text)
        self.on_toast("✓ Transcription complete", "success")
        self.save_btn.show()
        self.reset_record_btn()
        if hasattr(self, '_current_audio_path'):
            self.audio_engine.cleanup_temp_file(self._current_audio_path)

    def generate_summary(self):
        transcript = self.transcript_edit.toPlainText()
        if not transcript:
            self.on_toast("No transcript to summarize. Record a meeting first.", "warning")
            return

        api_client = self.get_api_client()
        if not api_client:
            self.on_toast("API key not configured. Open Settings to add your API key.", "error")
            return

        self._loading_dialog = LoadingDialog("✨ Generating AI summary...", self)
        self._loading_dialog.show()

        self.worker = Worker(api_client.generate_meeting_summary, transcript)
        self.worker.finished.connect(self.on_summary_success)
        self.worker.error.connect(self.on_worker_error)
        self.worker.start()

    def on_summary_success(self, summary):
        if hasattr(self, '_loading_dialog'):
            self._loading_dialog.close()
        self.summary_view.setPlainText(summary)
        self.on_toast("✓ Summary generated", "success")

    def on_worker_error(self, message):
        if hasattr(self, '_loading_dialog'):
            self._loading_dialog.close()
        # Provide helpful error messages
        if "401" in message or "Invalid" in message or "unauthorized" in message.lower():
            self.on_toast("Invalid API key. Check Settings and try again.", "error")
        elif "timeout" in message.lower() or "connection" in message.lower():
            self.on_toast("Network error. Check your connection and try again.", "error")
        else:
            self.on_toast(f"Error: {message}", "error")
        self.reset_record_btn()
        if hasattr(self, '_current_audio_path'):
            self.audio_engine.cleanup_temp_file(self._current_audio_path)

    def show_history(self):
        dialog = QDialog(self)
        dialog.setWindowTitle("Meeting History")
        dialog.setFixedSize(500, 400)
        dialog.setStyleSheet("background-color: #000000;")
        layout = QVBoxLayout(dialog)

        items = self.db_manager.get_transcripts()

        if not items:
            # Empty state
            empty_label = QLabel("📝 No meetings recorded yet\n\nStart recording to build your history")
            empty_label.setStyleSheet("color: #64748b; font-size: 14px; padding: 40px;")
            empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            layout.addWidget(empty_label)
        else:
            # Search bar
            search_layout = QHBoxLayout()
            search_input = QLineEdit()
            search_input.setPlaceholderText("🔍 Search meetings...")
            search_input.setStyleSheet("background-color: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a; padding: 5px; border-radius: 4px;")
            search_layout.addWidget(search_input)
            layout.addLayout(search_layout)

            list_widget = QListWidget()
            list_widget.setStyleSheet("background-color: #0a0a0a; color: #e4e4e7; border: 1px solid #27272a;")

            def populate_list(search_text=""):
                list_widget.clear()
                search_lower = search_text.lower()
                for item in items:
                    title = item['title'].lower()
                    date = item['recording_date'][:10]
                    if search_lower in title or search_lower in date:
                        list_item = QListWidgetItem(f"📌 {item['title']} ({date})")
                        list_item.setData(Qt.ItemDataRole.UserRole, item)
                        list_widget.addItem(list_item)

            search_input.textChanged.connect(lambda text: populate_list(text))
            populate_list()
            layout.addWidget(list_widget)

            load_btn = QPushButton("📂 Load Selected")
            load_btn.setObjectName("PrimaryButton")

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
        self.record_btn.set_on(False)
        self.record_btn.setEnabled(True)
        self.timer_label.hide()
