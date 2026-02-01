import sys
from PyQt6.QtCore import Qt, QTimer, QSize
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel,
                             QPushButton, QTextEdit, QFrame, QScrollArea,
                             QListWidget, QListWidgetItem, QDialog, QLineEdit, QApplication, QMessageBox)
from ui.utils import Worker, LoadingDialog, WaveformVisualizer, set_native_grey_theme, StyledConfirmDialog
from ui.export_utils import export_meeting

class MeetingMode(QWidget):
    def __init__(self, audio_engine, db_manager, get_api_client_cb, on_toast, set_status_cb, parent=None):
        super().__init__(parent)
        self.audio_engine = audio_engine
        self.db_manager = db_manager
        self.get_api_client = get_api_client_cb
        self.on_toast = on_toast
        self.set_status = set_status_cb

        self.timer = QTimer()
        self.timer.timeout.connect(self.update_timer)
        self.seconds_elapsed = 0
        self.recording_active = False

        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 20, 30, 20)
        layout.setSpacing(20)
        
        # Toolbar
        toolbar = QHBoxLayout()
        toolbar.setSpacing(10) # Move buttons closer
        
        self.title_input = QLineEdit()
        self.title_input.setPlaceholderText("Meeting Title...")
        self.title_input.setFixedWidth(400) # Reduced width
        self.title_input.setFixedHeight(40)
        self.title_input.setStyleSheet("""
            QLineEdit {
                background-color: #e8e8e8;
                border: 2px solid #3b82f6; /* Stands out (Blue) */
                border-radius: 8px;
                padding: 0 12px;
                color: #000000;
                font-size: 14px;
            }
            QLineEdit:focus {
                border: 2px solid #2563eb;
            }
        """)
        toolbar.addWidget(self.title_input)
        
        # Record Button in Toolbar (Added prominent border)
        self.record_btn = QPushButton("Start Recording")
        self.record_btn.clicked.connect(self.toggle_recording)
        self.record_btn.setFixedWidth(150)
        self.record_btn.setFixedHeight(40)
        self.record_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.record_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                border: 1px solid #d0d0d0; /* Standing out border */
                border-radius: 6px;
                padding: 5px 15px;
                color: #e4e4e7;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: rgba(59, 130, 246, 0.1);
                border: 1px solid #3b82f6;
            }
        """)
        toolbar.addWidget(self.record_btn)

        # Recording indicators in Toolbar
        self.recording_dot = QFrame()
        self.recording_dot.setFixedSize(10, 10)
        self.recording_dot.setStyleSheet("background-color: transparent; border-radius: 5px;")
        self.recording_dot.hide()
        toolbar.addWidget(self.recording_dot)

        self.timer_label = QLabel("00:00:00")
        self.timer_label.setStyleSheet("font-family: monospace; font-weight: bold; color: #ef4444; font-size: 14px;")
        self.timer_label.hide()
        toolbar.addWidget(self.timer_label)

        self.waveform = WaveformVisualizer()
        self.waveform.setFixedWidth(120)
        self.waveform.hide()
        toolbar.addWidget(self.waveform)

        toolbar.addStretch()
        
        self.history_btn = QPushButton("History")
        self.history_btn.setFixedHeight(40)
        self.history_btn.setStyleSheet("border: 1px solid #d0d0d0; padding: 0 20px;")
        self.history_btn.clicked.connect(self.show_history)
        toolbar.addWidget(self.history_btn)

        self.save_btn = QPushButton("Save")
        self.save_btn.setFixedHeight(40)
        self.save_btn.setStyleSheet("border: 1px solid #d0d0d0; padding: 0 20px;")
        self.save_btn.clicked.connect(self.save_transcript)
        self.save_btn.hide()
        toolbar.addWidget(self.save_btn)

        layout.addLayout(toolbar)
        
        # Content Area
        content = QHBoxLayout()
        
        # Transcript Side
        self.transcript_frame = QFrame()
        self.transcript_frame.setObjectName("TranscriptContainer")
        transcript_layout = QVBoxLayout(self.transcript_frame)
        transcript_layout.setContentsMargins(15, 15, 15, 15)
        transcript_layout.setSpacing(10)
        
        transcript_header = QHBoxLayout()
        transcript_header.addWidget(QLabel("Transcript"))
        
        transcript_header.addStretch()
        
        # New Session / Clear Link
        self.clear_btn = QPushButton("Clear/New Session")
        self.clear_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.clear_btn.setStyleSheet("""
            QPushButton {
                background: transparent;
                color: #10b981;
                border: none;
                font-size: 10px;
                text-decoration: underline;
                font-weight: normal;
            }
            QPushButton:hover {
                color: #34d399;
            }
        """)
        self.clear_btn.clicked.connect(self.clear_session)
        transcript_header.addWidget(self.clear_btn)
        
        transcript_header.addStretch()
        
        self.transcript_stats = QLabel("0 words • 0 chars")
        self.transcript_stats.setStyleSheet("color: #a1a1aa; font-size: 11px; font-weight: bold;")
        transcript_header.addWidget(self.transcript_stats)
        transcript_layout.addLayout(transcript_header)

        self.transcript_edit = QTextEdit()
        self.transcript_edit.setPlaceholderText("Your transcript will appear here...")
        self.transcript_edit.textChanged.connect(self.update_transcript_stats)
        transcript_layout.addWidget(self.transcript_edit)
        
        # Actions under transcript
        actions = QHBoxLayout()
        self.summary_btn = QPushButton("Generate AI Summary")
        self.summary_btn.setStyleSheet("border: 1px solid #d0d0d0;")
        self.summary_btn.clicked.connect(self.generate_summary)
        actions.addWidget(self.summary_btn)
        transcript_layout.addLayout(actions)
        
        content.addWidget(self.transcript_frame, 2)
        
        # Summary Side
        self.summary_container = QFrame()
        self.summary_container.setFixedWidth(300)
        self.summary_container.setObjectName("SummaryContainer")
        summary_layout = QVBoxLayout(self.summary_container)
 
        summary_header = QHBoxLayout()
        summary_header.addWidget(QLabel("AI Summary"))
        summary_header.addStretch()
        self.copy_summary_btn = QPushButton("Copy")
        self.copy_summary_btn.setFixedWidth(60)
        self.copy_summary_btn.setStyleSheet("""
            QPushButton {
                font-size: 10px;
                padding: 3px 6px;
                background-color: transparent;
                border: 1px solid #d0d0d0;
                border-radius: 3px;
                color: #3b82f6;
            }
            QPushButton:hover {
                background-color: rgba(59, 130, 246, 0.1);
            }
        """)
        self.copy_summary_btn.clicked.connect(self.copy_summary_to_clipboard)
        summary_header.addWidget(self.copy_summary_btn)
        summary_layout.addLayout(summary_header)

        self.summary_view = QTextEdit()
        self.summary_view.setReadOnly(True)
        summary_layout.addWidget(self.summary_view)

        content.addWidget(self.summary_container)
        
        layout.addLayout(content)

    def toggle_recording(self):
        if not self.recording_active:
            # Start recording with device from settings
            device_id = None  # Use default if not set
            self.audio_engine.start_recording(device_id)
            self.audio_engine.on_data = self.waveform.update_level

            self.seconds_elapsed = 0
            self.timer_label.show()
            self.waveform.show()
            self.recording_dot.show()
            self.timer.start(1000)
            self.set_status("Recording...", "#ef4444")

            # Visual feedback - red button with prominent border
            self.record_btn.setText("Stop Recording")
            self.record_btn.setStyleSheet("""
                QPushButton {
                    background-color: rgba(239, 68, 68, 0.2);
                    border: 2px solid #ef4444;
                    border-radius: 6px;
                    padding: 5px 15px;
                    color: #ef4444;
                    font-weight: bold;
                }
                QPushButton:hover {
                    background-color: rgba(239, 68, 68, 0.3);
                }
            """)

            # Pulsing dot animation
            self.pulse_timer = QTimer()
            self.pulse_state = True
            self.pulse_timer.timeout.connect(self.pulse_indicator)
            self.pulse_timer.start(600)

            self.on_toast("Recording started", "info")
            self.recording_active = True
        else:
            # Stop recording
            self.timer.stop()
            if hasattr(self, 'pulse_timer'):
                self.pulse_timer.stop()

            self.record_btn.setEnabled(False)
            self.recording_active = False
            self.waveform.hide()
            self.recording_dot.hide()
            self.audio_engine.on_data = None

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
        self._loading_dialog = LoadingDialog("Transcribing your audio...", self)
        self._loading_dialog.show()
        self.set_status("Transcribing...", "#3b82f6")

        self.worker = Worker(api_client.transcribe_audio, path)
        self.worker.finished.connect(self.on_transcription_success)
        self.worker.error.connect(self.on_worker_error)
        self.worker.start()

    def on_transcription_success(self, text):
        if hasattr(self, '_loading_dialog'):
            self._loading_dialog.close()
        self.transcript_edit.setPlainText(text)
        self.update_transcript_stats()
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
            self.set_status("Error: Invalid API Key", "#ef4444")
        elif "timeout" in message.lower() or "connection" in message.lower():
            self.on_toast("Network error. Check your connection and try again.", "error")
            self.set_status("Error: Network Failure", "#ef4444")
        else:
            self.on_toast(f"Error: {message}", "error")
            self.set_status(f"Error: {message}", "#ef4444")
        self.reset_record_btn()
        if hasattr(self, '_current_audio_path'):
            self.audio_engine.cleanup_temp_file(self._current_audio_path)

    def show_history(self):
        dialog = QDialog(self)
        dialog.setWindowTitle("Meeting History")
        dialog.setFixedSize(600, 500)
        dialog.setStyleSheet("""
            QDialog {
                background-color: #000000;
                border: 1px solid #ffffff;
            }
        """)
        if sys.platform == 'win32':
            set_native_grey_theme(int(dialog.winId()))
            
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(15)

        items = self.db_manager.get_transcripts()

        if not items:
            # Empty state
            empty_label = QLabel("📝 No meetings recorded yet\n\nStart recording to build your history")
            empty_label.setStyleSheet("color: #64748b; font-size: 14px; padding: 40px;")
            empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            layout.addWidget(empty_label)
        else:
            # Search bar
            search_input = QLineEdit()
            search_input.setPlaceholderText("Search meetings...")
            search_input.setFixedHeight(40)
            search_input.setStyleSheet("""
                QLineEdit {
                    background-color: #e8e8e8;
                    color: #000000;
                    border: 1px solid #d0d0d0;
                    padding: 0 10px;
                    border-radius: 4px;
                }
                QLineEdit:focus {
                    border: 1px solid #3b82f6;
                }
            """)
            layout.addWidget(search_input)

            # Records Container (mimicking TranscriptContainer in main app)
            records_frame = QFrame()
            records_frame.setObjectName("TranscriptContainer")
            records_frame.setStyleSheet("""
                #TranscriptContainer {
                    background-color: #09090b;
                    border: 1px solid #d0d0d0;
                    border-radius: 12px;
                }
            """)
            records_layout = QVBoxLayout(records_frame)
            records_layout.setContentsMargins(15, 15, 15, 15)
            
            records_header = QLabel("Saved Meetings")
            records_header.setStyleSheet("color: #e4e4e7; font-size: 11px; font-weight: normal; letter-spacing: 1px;")
            records_layout.addWidget(records_header)

            list_widget = QListWidget()
            list_widget.setStyleSheet("""
                QListWidget {
                    background-color: #e8e8e8;
                    color: #000000;
                    border: 1px solid #cccccc;
                    border-radius: 8px;
                    outline: none;
                }
                QListWidget::item {
                    padding: 12px;
                    border-bottom: 1px solid #d1d1d1;
                    color: #000000;
                }
                QListWidget::item:last {
                    border-bottom: none;
                }
                QListWidget::item:hover {
                    background-color: #c0c0c0;
                }
                QListWidget::item:selected {
                    background-color: #ffffff;
                    color: #000000;
                    border: 1px solid #000000;
                }
            """)
            records_layout.addWidget(list_widget)
            layout.addWidget(records_frame)

            def delete_meeting(item_data):
                confirm = StyledConfirmDialog("Delete Meeting", 
                                            f"Are you sure you want to delete '{item_data['title']}'?",
                                            dialog)
                
                if confirm.exec() == QDialog.DialogCode.Accepted:
                    self.db_manager.delete_item('transcripts', item_data['id'])
                    self.on_toast("Meeting deleted", "success")
                    nonlocal items
                    items = self.db_manager.get_transcripts()
                    populate_list(search_input.text())

            def populate_list(search_text=""):
                list_widget.clear()
                search_lower = search_text.lower()
                for item in items:
                    title_text = item['title']
                    date_text = item['recording_date'][:10]
                    if search_lower in title_text.lower() or search_lower in date_text.lower():
                        list_item = QListWidgetItem(list_widget)
                        list_item.setSizeHint(QSize(0, 50))
                        list_item.setData(Qt.ItemDataRole.UserRole, item)
                        
                        # Row Widget
                        row_widget = QWidget()
                        row_layout = QHBoxLayout(row_widget)
                        row_layout.setContentsMargins(15, 0, 15, 0)
                        
                        label = QLabel(f"{title_text} ({date_text})")
                        label.setStyleSheet("color: #000000; font-size: 13px;")
                        row_layout.addWidget(label)
                        
                        row_layout.addStretch()
                        
                        del_btn = QPushButton("Delete")
                        del_btn.setCursor(Qt.CursorShape.PointingHandCursor)
                        del_btn.setStyleSheet("""
                            QPushButton {
                                color: #ef4444;
                                background-color: transparent;
                                border: none;
                                font-size: 11px;
                                text-decoration: underline;
                                font-weight: normal;
                                padding: 0;
                            }
                        """)
                        del_btn.clicked.connect(lambda checked, i=item: delete_meeting(i))
                        row_layout.addWidget(del_btn)
                        
                        list_widget.setItemWidget(list_item, row_widget)

            search_input.textChanged.connect(lambda text: populate_list(text))
            populate_list()

            # Buttons layout
            btns_layout = QHBoxLayout()
            btns_layout.setSpacing(10)

            open_btn = QPushButton("Open Meeting")
            open_btn.setFixedHeight(45)
            open_btn.setStyleSheet("""
                QPushButton {
                    background-color: transparent;
                    border: 1px solid #ffffff;
                    border-radius: 6px;
                    color: #ffffff;
                }
                QPushButton:hover {
                    background-color: rgba(255, 255, 255, 0.1);
                }
            """)

            def load():
                curr = list_widget.currentItem()
                if curr:
                    data = curr.data(Qt.ItemDataRole.UserRole)
                    self.title_input.setText(data['title'])
                    self.transcript_edit.setPlainText(data['content'])
                    self.summary_view.setPlainText(data['summary'])
                    dialog.accept()

            open_btn.clicked.connect(load)
            btns_layout.addWidget(open_btn)

            export_btn = QPushButton("Export")
            export_btn.setFixedHeight(45)
            export_btn.setStyleSheet("""
                QPushButton {
                    background-color: transparent;
                    border: 1px solid #ffffff;
                    border-radius: 6px;
                    color: #ffffff;
                }
                QPushButton:hover {
                    background-color: rgba(255, 255, 255, 0.1);
                }
            """)

            def export_selected():
                curr = list_widget.currentItem()
                if curr:
                    data = curr.data(Qt.ItemDataRole.UserRole)
                    success, message = export_meeting(self, data['title'], data['content'], data['summary'])
                    if success:
                        self.on_toast(message, "success")
                    else:
                        self.on_toast(message, "warning" if "cancelled" in message.lower() else "error")

            export_btn.clicked.connect(export_selected)
            btns_layout.addWidget(export_btn)

            layout.addLayout(btns_layout)

        dialog.exec()

    def save_transcript(self):
        title = self.title_input.text() or "Untitled Meeting"
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
        self.recording_active = False
        self.record_btn.setText("Start Recording")
        self.record_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                border: 1px solid #d0d0d0;
                border-radius: 6px;
                padding: 5px 15px;
                color: #e4e4e7;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: rgba(59, 130, 246, 0.1);
                border: 1px solid #3b82f6;
            }
        """)
        self.record_btn.setEnabled(True)
        self.timer_label.hide()
        self.set_status("Status", "#10b981")

    def pulse_indicator(self):
        """Pulse the recording indicator dot"""
        self.pulse_state = not self.pulse_state
        if self.pulse_state:
            self.recording_dot.setStyleSheet("background-color: #ef4444; border-radius: 5px;")
        else:
            self.recording_dot.setStyleSheet("background-color: #991b1b; border-radius: 5px;")

    def update_transcript_stats(self):
        """Update word count and character count"""
        text = self.transcript_edit.toPlainText()
        words = len(text.split()) if text.strip() else 0
        chars = len(text)
        self.transcript_stats.setText(f"{words} words • {chars} chars")

    def copy_summary_to_clipboard(self):
        """Copy summary text to clipboard"""
        text = self.summary_view.toPlainText()
        if text:
            QApplication.clipboard().setText(text)
            self.on_toast("✓ Summary copied to clipboard", "success")
        else:
            self.on_toast("No summary to copy", "warning")

    def clear_session(self):
        # Safety Valve: check for unsaved content
        has_content = (self.title_input.text().strip() or 
                       self.transcript_edit.toPlainText().strip() or 
                       self.summary_view.toPlainText().strip())
        
        if has_content:
            confirm = StyledConfirmDialog("Start New Session?", 
                                        "Unsaved progress will be cleared. Proceed?",
                                        self)
            if confirm.exec() != QDialog.DialogCode.Accepted:
                return

        # Reset UI
        self.title_input.clear()
        self.transcript_edit.clear()
        self.summary_view.clear()
        self.seconds_elapsed = 0
        self.timer_label.setText("00:00:00")
        self.timer_label.hide()
        self.save_btn.hide()
        
        self.on_toast("Meeting workbench cleared", "info")
