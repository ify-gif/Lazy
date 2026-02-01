import sys
from datetime import datetime
from PyQt6.QtCore import Qt, pyqtSignal, QSize, QTimer
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel,
                             QPushButton, QTextEdit, QFrame, QScrollArea, QLineEdit, 
                             QListWidget, QListWidgetItem, QDialog, QMessageBox, QFileDialog)
from ui.utils import Worker, LoadingDialog, WaveformVisualizer, set_native_grey_theme, StyledConfirmDialog

# ============ Comment Widgets ============
class CommentItemWidget(QWidget):
    """Custom widget for a comment row in the sidebar."""
    view_clicked = pyqtSignal(int)
    delete_clicked = pyqtSignal(int)
    
    def __init__(self, index, text, parent=None):
        super().__init__(parent)
        self.index = index
        self.full_text = text
        
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 0, 10, 0) # Matching sidebar padding
        layout.setSpacing(10)
        
        # Preview label (Very truncated to fit UI)
        preview = text[:20] + "..." if len(text) > 20 else text
        self.label = QLabel(preview)
        self.label.setStyleSheet("color: #e4e4e7; font-size: 11px;")
        layout.addWidget(self.label)
        
        # Spacer to push buttons to the right
        layout.addStretch()
        
        # View link
        self.view_btn = QPushButton("View")
        self.view_btn.setFixedWidth(30)
        self.view_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.view_btn.setStyleSheet("""
            QPushButton {
                background: transparent;
                color: #3b82f6;
                border: none;
                font-size: 10px;
                text-decoration: underline;
                padding: 0;
            }
            QPushButton:hover {
                color: #60a5fa;
            }
        """)
        self.view_btn.clicked.connect(lambda: self.view_clicked.emit(self.index))
        layout.addWidget(self.view_btn)
        
        # Delete link
        self.delete_btn = QPushButton("Delete")
        self.delete_btn.setFixedWidth(40)
        self.delete_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.delete_btn.setStyleSheet("""
            QPushButton {
                background: transparent;
                color: #ef4444;
                border: none;
                font-size: 10px;
                text-decoration: underline;
                padding: 0;
            }
            QPushButton:hover {
                color: #f87171;
            }
        """)
        self.delete_btn.clicked.connect(lambda: self.delete_clicked.emit(self.index))
        layout.addWidget(self.delete_btn)

class CommentViewDialog(QDialog):
    """Simple popup to view full comment text."""
    def __init__(self, text, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Comment Details")
        self.setMinimumSize(500, 350) # Bigger as requested
        
        if sys.platform == 'win32':
            set_native_grey_theme(int(self.winId()))

        self.setStyleSheet("""
            QDialog {
                background-color: #09090b;
                border: 1px solid #27272a;
            }
        """)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        
        self.text_area = QTextEdit()
        self.text_area.setPlainText(text)
        self.text_area.setReadOnly(True)
        self.text_area.setStyleSheet("""
            QTextEdit {
                background-color: #18181b;
                color: #e4e4e7;
                border: 1px solid #27272a;
                border-radius: 8px;
                padding: 15px;
                font-size: 14px;
                line-height: 1.5;
            }
        """)
        layout.addWidget(self.text_area)


class WorkTrackerMode(QWidget):
    def __init__(self, audio_engine, db_manager, get_api_client_cb, on_toast, set_status_cb, parent=None):
        super().__init__(parent)
        self.audio_engine = audio_engine
        self.db_manager = db_manager
        self.get_api_client = get_api_client_cb
        self.on_toast = on_toast
        self.set_status = set_status_cb
        
        self.story = {
            'title': '',
            'description': '',
            'overview': '',
            'comments': [],
            'status': 'draft'
        }
        
        self.recording_target = "overview" # Kept for backward compat, though logic shifting
        self.work_mode = "story" # 'story' or 'comment'
        self.recording_state = "idle"
        self.seconds_elapsed = 0
        self.recording_timer = QTimer()
        self.recording_timer.timeout.connect(self.update_timer)
        self.stories = [] # Cache for filtering
        
        self.init_ui()

    def init_ui(self):
        # Main Layout: Horizonal to split Left Sidebar vs Right Workbench
        self.main_layout = QHBoxLayout(self)
        self.main_layout.setContentsMargins(20, 20, 20, 20)
        self.main_layout.setSpacing(20)
        
        # --- LEFT COLUMN (History Sidebar) ---
        self.history_frame = QFrame()
        self.history_frame.setObjectName("SidebarContainer")
        self.history_frame.setFixedWidth(280)
        self.history_frame.setStyleSheet("""
            #SidebarContainer {
                background-color: #09090b;
                border: 1px solid #27272a;
                border-radius: 8px;
            }
        """)
        hist_layout = QVBoxLayout(self.history_frame)
        hist_layout.setContentsMargins(15, 12, 15, 15)
        
        hist_label = QLabel("Saved Stories")
        hist_label.setStyleSheet("color: #a1a1aa; font-size: 11px; letter-spacing: 0.5px; margin-bottom: 5px;")
        hist_layout.addWidget(hist_label)
        
        # Search Sub-bar
        self.hist_search = QLineEdit()
        self.hist_search.setPlaceholderText("Search stories...")
        self.hist_search.setStyleSheet("""
            QLineEdit {
                background-color: #18181b;
                color: #e4e4e7;
                border: 1px solid #27272a;
                border-radius: 4px;
                padding: 6px 10px;
                font-size: 12px;
                margin-bottom: 10px;
            }
        """)
        self.hist_search.textChanged.connect(self.filter_history)
        hist_layout.addWidget(self.hist_search)
        
        self.hist_list = QListWidget()
        self.hist_list.setStyleSheet("""
            QListWidget {
                background-color: transparent;
                border: none;
                outline: none;
            }
            QListWidget::item {
                background-color: #18181b;
                border: 1px solid #27272a;
                border-radius: 6px;
                padding: 0px;
                margin-bottom: 8px;
                color: #e4e4e7;
            }
            QListWidget::item:selected {
                background-color: #27272a;
                border: 1px solid #3b82f6;
                color: #ffffff;
            }
            QListWidget::item:hover {
                background-color: #1c1c1f;
            }
        """)
        self.hist_list.itemClicked.connect(self.load_selected_story)
        hist_layout.addWidget(self.hist_list)
        
        self.main_layout.addWidget(self.history_frame)

        self.main_layout.addWidget(self.history_frame)

        # --- CENTER COLUMN (Transcript & AI Summary Stacked) ---
        center_column = QVBoxLayout()
        center_column.setSpacing(15)
        
        # 1. Transcript Container
        self.transcript_frame = QFrame()
        self.transcript_frame.setObjectName("WorkbenchContainer")
        self.transcript_frame.setStyleSheet("""
            #WorkbenchContainer {
                background-color: #09090b;
                border: 1px solid #27272a;
                border-radius: 8px;
            }
        """)
        trans_layout = QVBoxLayout(self.transcript_frame)
        trans_layout.setContentsMargins(15, 12, 15, 15)
        
        # Header Row
        trans_header = QHBoxLayout()
        trans_label = QLabel("Transcript")
        trans_label.setStyleSheet("color: #a1a1aa; font-size: 11px; letter-spacing: 0.5px;")
        trans_header.addWidget(trans_label)
        
        trans_header.addStretch()
        
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
        trans_header.addWidget(self.clear_btn)
        
        trans_header.addStretch()
        
        self.stats_label = QLabel("0 words • 0 chars")
        self.stats_label.setStyleSheet("color: #71717a; font-size: 11px;")
        trans_header.addWidget(self.stats_label)
        trans_layout.addLayout(trans_header)
        
        # Input Area
        self.overview_input = QTextEdit()
        self.overview_input.setPlaceholderText("Your transcript will appear here...")
        self.overview_input.setStyleSheet("""
            QTextEdit {
                background-color: #18181b;
                color: #e4e4e7;
                border: 1px solid #27272a;
                border-radius: 6px;
                padding: 10px;
                font-size: 13px;
                line-height: 1.4;
            }
        """)
        self.overview_input.textChanged.connect(self.update_stats)
        trans_layout.addWidget(self.overview_input)
        
        # Recording Controls Bar
        controls_bar = QHBoxLayout()
        controls_bar.setSpacing(10)
        
        self.start_btn = QPushButton("Start")
        self.start_btn.setFixedSize(100, 32)
        self.start_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.start_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                border: 1px solid #a1a1aa;
                border-radius: 4px;
                color: #f4f4f5;
                font-size: 12px;
            }
            QPushButton:hover {
                background-color: #27272a;
            }
        """)
        self.start_btn.clicked.connect(self.start_recording)
        controls_bar.addWidget(self.start_btn)
        
        self.pause_btn = QPushButton("Pause")
        self.pause_btn.setFixedSize(100, 32)
        self.pause_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.pause_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                border: 1px solid #a1a1aa;
                border-radius: 4px;
                color: #f4f4f5;
                font-size: 12px;
            }
            QPushButton:hover {
                background-color: #27272a;
            }
        """)
        self.pause_btn.clicked.connect(self.pause_recording)
        self.pause_btn.hide()
        controls_bar.addWidget(self.pause_btn)
        
        self.stop_btn = QPushButton("Stop")
        self.stop_btn.setFixedSize(100, 32)
        self.stop_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.stop_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                border: 1px solid #ef4444;
                border-radius: 4px;
                color: #ef4444;
                font-size: 12px;
            }
            QPushButton:hover {
                background-color: rgba(239, 68, 68, 0.1);
            }
        """)
        self.stop_btn.clicked.connect(self.stop_recording)
        self.stop_btn.hide()
        controls_bar.addWidget(self.stop_btn)
        
        controls_bar.addStretch()
        
        self.timer_label = QLabel("00:00")
        self.timer_label.setStyleSheet("color: #71717a; font-family: 'Consolas', monospace; font-size: 12px; font-weight: bold;")
        self.timer_label.hide()
        controls_bar.addWidget(self.timer_label)
        
        trans_layout.addLayout(controls_bar)
        
        # Generate Button
        self.generate_btn = QPushButton("Generate AI Summary")
        self.generate_btn.setFixedHeight(40)
        self.generate_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.generate_btn.setEnabled(False)
        self.generate_btn.setStyleSheet("""
            QPushButton {
                background-color: #18181b;
                color: #e4e4e7;
                border: 1px solid #a1a1aa;
                border-radius: 6px;
                font-size: 13px;
                margin-top: 5px;
            }
            QPushButton:hover {
                background-color: #27272a;
                border-color: #52525b;
            }
            QPushButton:disabled {
                color: #52525b;
                border-color: #27272a;
            }
        """)
        self.generate_btn.clicked.connect(self.generate_story)
        trans_layout.addWidget(self.generate_btn)
        
        self.generate_btn.clicked.connect(self.generate_story)
        trans_layout.addWidget(self.generate_btn)
        
        # Add Comment Button (New)
        self.add_comment_btn = QPushButton("Add Comment")
        self.add_comment_btn.setFixedHeight(40)
        self.add_comment_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.add_comment_btn.setEnabled(False) # Only enable when story loaded
        self.add_comment_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #a1a1aa;
                border: 1px solid #3f3f46;
                border-radius: 6px;
                font-size: 13px;
                margin-top: 5px;
            }
            QPushButton:hover {
                background-color: #27272a;
                color: #e4e4e7;
                border-color: #52525b;
            }
            QPushButton:disabled {
                color: #3f3f46;
                border-color: #27272a;
            }
        """)
        self.add_comment_btn.clicked.connect(self.enter_comment_mode)
        trans_layout.addWidget(self.add_comment_btn)
        
        center_column.addWidget(self.transcript_frame, 3) # weight 3
        
        # 2. AI Summary Container
        self.summary_frame = QFrame()
        self.summary_frame.setObjectName("WorkbenchContainer")
        self.summary_frame.setStyleSheet("""
            #WorkbenchContainer {
                background-color: #09090b;
                border: 1px solid #27272a;
                border-radius: 8px;
            }
        """)
        summ_layout = QVBoxLayout(self.summary_frame)
        summ_layout.setContentsMargins(15, 12, 15, 15)
        
        summ_header = QHBoxLayout()
        summ_label_title = QLabel("AI Summary")
        summ_label_title.setStyleSheet("color: #a1a1aa; font-size: 11px; letter-spacing: 0.5px;")
        summ_header.addWidget(summ_label_title)
        
        summ_header.addStretch()
        
        copy_btn = QPushButton("Copy Text")
        copy_btn.setFixedSize(90, 30)
        copy_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        copy_btn.setStyleSheet("""
            QPushButton {
                background-color: #27272a;
                border: 1px solid #a1a1aa;
                border-radius: 4px;
                color: #ffffff;
                font-size: 11px;
                font-weight: 600;
                padding: 0px 5px;
            }
            QPushButton:hover {
                background-color: #3f3f46;
                border-color: #52525b;
            }
        """)
        copy_btn.clicked.connect(self.copy_summary)
        summ_header.addWidget(copy_btn, 0, Qt.AlignmentFlag.AlignVCenter)
        summ_layout.addLayout(summ_header)
        
        self.ai_summary_output = QTextEdit()
        self.ai_summary_output.setPlaceholderText("Professional summary will appear here...")
        self.ai_summary_output.setStyleSheet("""
            QTextEdit {
                background-color: #18181b;
                color: #e4e4e7;
                border: 1px solid #27272a;
                border-radius: 6px;
                padding: 10px;
                font-size: 13px;
                line-height: 1.4;
            }
        """)
        summ_layout.addWidget(self.ai_summary_output)
        
        center_column.addWidget(self.summary_frame, 2) # weight 2

        # --- FOOTER BUTTONS ---
        footer_layout = QHBoxLayout()
        footer_layout.setSpacing(10)

        self.save_btn = QPushButton("Save Story")
        self.save_btn.setFixedHeight(45)
        self.save_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.save_btn.setStyleSheet("""
            QPushButton {
                background-color: #18181b;
                color: #e4e4e7;
                border: 1px solid #a1a1aa;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: #27272a;
                border-color: #52525b;
            }
        """)
        self.save_btn.clicked.connect(self.handle_save_action)
        footer_layout.addWidget(self.save_btn, 3) # wide

        self.export_btn = QPushButton("Export to File")
        self.export_btn.setFixedHeight(45)
        self.export_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.export_btn.setStyleSheet("""
            QPushButton {
                background-color: #18181b;
                color: #a1a1aa;
                border: 1px solid #27272a;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
            }
            QPushButton:hover {
                background-color: #27272a;
                border-color: #52525b;
                color: #e4e4e7;
            }
        """)
        self.export_btn.clicked.connect(self.export_story_to_file)
        footer_layout.addWidget(self.export_btn, 1) # narrower

        center_column.addLayout(footer_layout)
        
        self.main_layout.addLayout(center_column, 6) # Center space

        # --- RIGHT COLUMN (Comments Sidebar) ---
        self.comments_frame = QFrame()
        self.comments_frame.setObjectName("SidebarContainer")
        self.comments_frame.setFixedWidth(280)
        self.comments_frame.setStyleSheet("""
            #SidebarContainer {
                background-color: #09090b;
                border: 1px solid #27272a;
                border-radius: 8px;
            }
        """)
        comm_layout = QVBoxLayout(self.comments_frame)
        comm_layout.setContentsMargins(15, 12, 15, 15)
        
        comm_label = QLabel("Story Comments")
        comm_label.setStyleSheet("color: #a1a1aa; font-size: 11px; letter-spacing: 0.5px; margin-bottom: 5px;")
        comm_layout.addWidget(comm_label)
        
        self.comm_list = QListWidget()
        self.comm_list.setStyleSheet("""
            QListWidget {
                background-color: transparent;
                border: none;
                outline: none;
            }
            QListWidget::item {
                background-color: #18181b;
                border: 1px solid #27272a;
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 8px;
                color: #e4e4e7;
            }
        """)
        comm_layout.addWidget(self.comm_list)

        self.main_layout.addWidget(self.comments_frame)
        
        # Initial History Load
        self.refresh_history()

    def update_stats(self):
        text = self.overview_input.toPlainText()
        words = len(text.split())
        chars = len(text)
        self.stats_label.setText(f"{words} words • {chars} chars")
        self.generate_btn.setEnabled(chars > 0)

    def update_timer(self):
        self.seconds_elapsed += 1
        mins = self.seconds_elapsed // 60
        secs = self.seconds_elapsed % 60
        self.timer_label.setText(f"{mins:02d}:{secs:02d}")

    def start_recording(self):
        self.recording_target = "overview" # Used by stop_recording to update input
        self.start_btn.hide()
        self.pause_btn.show()
        self.pause_btn.setText("Pause")
        self.stop_btn.show()
        
        self.audio_engine.start_recording()
        self.recording_state = "recording"
        self.seconds_elapsed = 0
        self.timer_label.setText("00:00")
        self.timer_label.show()
        self.recording_timer.start(1000)
        
        msg = "Recording Comment..." if self.work_mode == "comment" else "Recording Overview..."
        color = "#8b5cf6" if self.work_mode == "comment" else "#ef4444"
        
        self.on_toast("Recording started...", "info")
        self.set_status(msg, color)

    def pause_recording(self):
        if self.recording_state == "recording":
            self.audio_engine.pause_recording()
            self.recording_state = "paused"
            self.recording_timer.stop()
            self.pause_btn.setText("Resume")
            self.on_toast("Recording paused", "info")
            self.set_status("Recording Paused", "#64748b")
        else:
            self.resume_recording()

    def resume_recording(self):
        if self.recording_target != "overview": return
        
        self.audio_engine.resume_recording()
        self.recording_state = "recording"
        self.recording_timer.start(1000)
        self.pause_btn.setText("Pause")
        self.on_toast("Recording resumed", "info")
        self.set_status("Recording Overview...", "#ef4444")

    def stop_recording(self):
        self.recording_timer.stop()
        self.recording_state = "idle"
        self.timer_label.hide()
        
        self.start_btn.show()
        self.start_btn.setText("Start")
        self.pause_btn.hide()
        self.stop_btn.hide()
        
        self.set_status("Transcribing...", "#3b82f6")
        path = self.audio_engine.stop_recording()
        api_client = self.get_api_client()
        
        if api_client and path:
            try:
                text = api_client.transcribe_audio(path)
                current = self.overview_input.toPlainText()
                new_text = f"{current}\n\n{text}".strip() if current else text
                self.overview_input.setPlainText(new_text)
                self.on_toast("Transcript updated", "success")
                self.set_status("Status", "#10b981")
            except Exception as e:
                self.on_toast(str(e), "error")
                self.set_status(f"Error: {str(e)}", "#ef4444")
            finally:
                self.audio_engine.cleanup_temp_file(path)

    def generate_story(self):
        overview = self.overview_input.toPlainText()
        if not overview: return

        api_client = self.get_api_client()
        if not api_client:
            self.on_toast("API key not configured", "error")
            return

        self._loading_dialog = LoadingDialog("Generating Summary...", self)
        self._loading_dialog.show()
        self.set_status("Generating Summary...", "#3b82f6")

        self.worker = Worker(api_client.generate_story_from_overview, overview)
        self.worker.finished.connect(self.on_story_success)
        self.worker.error.connect(self.on_worker_error)
        self.worker.start()

    def on_story_success(self, story_data):
        if hasattr(self, '_loading_dialog'): self._loading_dialog.close()
        
        full_result = f"SUMMARY: {story_data['summary']}\n\nDESCRIPTION:\n{story_data['description']}"
        self.ai_summary_output.setPlainText(full_result)
        
        # Prepare story data
        self.story['overview'] = self.overview_input.toPlainText()
        self.story['title'] = story_data['summary']
        self.story['description'] = story_data['description']
        
        # Save and refresh
        self.save_story()
        self.refresh_history()
        
        self.on_toast("Summary generated & saved", "success")
        self.set_status("Ready", "#10b981")

    def on_worker_error(self, message):
        if hasattr(self, '_loading_dialog'): self._loading_dialog.close()
        self.on_toast(f"Error: {message}", "error")
        self.set_status(f"Error: {message}", "#ef4444")

    def copy_summary(self):
        text = self.ai_summary_output.toPlainText()
        if text:
            from PyQt6.QtWidgets import QApplication
            QApplication.clipboard().setText(text)
            self.on_toast("Copied to clipboard", "success")

    def refresh_history(self):
        self.stories = self.db_manager.get_work_stories()
        self.filter_history()

    def filter_history(self):
        query = self.hist_search.text().lower()
        self.hist_list.clear()
        
        for item in self.stories:
            title = item.get('title', 'Untitled')
            date = item.get('created_at', '')[:10]
            if query in title.lower() or query in date:
                list_item = QListWidgetItem(self.hist_list)
                list_item.setSizeHint(QSize(0, 75)) # Increased height from 65
                list_item.setData(Qt.ItemDataRole.UserRole, item)
                
                # Row Container
                row_widget = QWidget()
                row_layout = QVBoxLayout(row_widget)
                row_layout.setContentsMargins(12, 10, 12, 10) # More vertical padding
                row_layout.setSpacing(4)
                
                # Title and Date row
                top_row = QHBoxLayout()
                title_lbl = QLabel(title)
                title_lbl.setStyleSheet("color: #e4e4e7; font-size: 13px; font-weight: 500;")
                title_lbl.setWordWrap(False)
                top_row.addWidget(title_lbl)
                top_row.addStretch()
                row_layout.addLayout(top_row)
                
                # Action row
                bottom_row = QHBoxLayout()
                date_lbl = QLabel(date)
                date_lbl.setStyleSheet("color: #71717a; font-size: 11px;")
                bottom_row.addWidget(date_lbl)
                bottom_row.addStretch()
                
                del_btn = QPushButton("Delete")
                del_btn.setCursor(Qt.CursorShape.PointingHandCursor)
                del_btn.setStyleSheet("""
                    QPushButton {
                        color: #ef4444;
                        background-color: transparent;
                        border: none;
                        font-size: 11px;
                        text-decoration: underline;
                        padding: 0;
                    }
                """)
                del_btn.clicked.connect(lambda checked, i=item: self.delete_story(i))
                bottom_row.addWidget(del_btn)
                row_layout.addLayout(bottom_row)
                
                self.hist_list.setItemWidget(list_item, row_widget)

    def delete_story(self, item_data):
        confirm = StyledConfirmDialog("Delete Story", 
                                    f"Are you sure you want to delete '{item_data.get('title', 'Untitled')}'?",
                                    self)
        
        if confirm.exec() == QDialog.DialogCode.Accepted:
            self.db_manager.delete_item('work_stories', item_data['id'])
            self.on_toast("Story deleted", "success")
            self.refresh_history()
            # Clear if deleted story was selected
            if self.story and self.story.get('id') == item_data['id']:
                 self.story = {
                    'title': '',
                    'description': '',
                    'overview': '',
                    'comments': [],
                    'status': 'draft'
                }
                 self.overview_input.clear()
                 self.ai_summary_output.clear()
                 self.comm_list.clear()
                 self.add_comment_btn.setEnabled(False) # Disable if story gone

    def load_selected_story(self, list_item):
        data = list_item.data(Qt.ItemDataRole.UserRole)
        # Ensure we are in story mode when loading
        self.exit_comment_mode() 
        
        self.story = data
        self.overview_input.setPlainText(data.get('overview', ''))
        result = f"SUMMARY: {data.get('title', 'Untitled')}\n\nDESCRIPTION:\n{data.get('description', '')}"
        self.ai_summary_output.setPlainText(result)
        
        # Ensure comments is a list
        if isinstance(self.story.get('comments'), str):
             import json
             try:
                 self.story['comments'] = json.loads(self.story.get('comments'))
             except:
                 self.story['comments'] = []
        if not isinstance(self.story.get('comments'), list):
            self.story['comments'] = []
            
        self.load_comments()
        self.add_comment_btn.setEnabled(True)
        self.on_toast("Story loaded", "info")

    def enter_comment_mode(self):
        if not self.story.get('id'):
            self.on_toast("Please select a story first", "error")
            return
            
        self.work_mode = "comment"
        
        # UI Updates for Comment Mode
        self.overview_input.clear()
        self.overview_input.setPlaceholderText("Record or type your comment here...")
        self.ai_summary_output.clear()
        self.ai_summary_output.setPlaceholderText("Comment summary (optional)...")
        
        self.save_btn.setText("Save Comment")
        self.add_comment_btn.setEnabled(False) # Already adding
        self.generate_btn.setEnabled(False) # Optional: disable AI summary for comments for now?
        
        self.set_status(f"Adding comment to: {self.story.get('title', 'Story')}", "#8b5cf6") # Purple status

    def exit_comment_mode(self):
        self.work_mode = "story"
        self.save_btn.setText("Save Story")
        self.add_comment_btn.setEnabled(True)
        self.overview_input.setPlaceholderText("Your transcript will appear here...")
        self.ai_summary_output.setPlaceholderText("Professional summary will appear here...")
        self.set_status("Ready", "#10b981")
        
        # Reload current story data to restore view
        if self.story and self.story.get('id'):
             # Ideally fetch fresh from DB, but for now restore from memory
             self.overview_input.setPlainText(self.story.get('overview', ''))
             result = f"SUMMARY: {self.story.get('title', 'Untitled')}\n\nDESCRIPTION:\n{self.story.get('description', '')}"
             self.ai_summary_output.setPlainText(result)

    def handle_save_action(self):
        if self.work_mode == "story":
            self.save_story()
        else:
            self.save_comment()

    def save_comment(self):
        note = self.overview_input.toPlainText().strip()
        if not note: 
            self.on_toast("Comment is empty", "warning")
            return
            
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        full_note = f"[{timestamp}] {note}"
        
        if 'comments' not in self.story or not isinstance(self.story['comments'], list):
            self.story['comments'] = []
            
        self.story['comments'].append(full_note)
        
        # Save to DB
        try:
            self.db_manager.save_work_story(self.story)
            self.on_toast("Comment saved", "success")
            self.load_comments() # Update sidebar
            self.exit_comment_mode() # Restore workbench
        except Exception as e:
            self.on_toast(f"Failed to save comment: {str(e)}", "error")

    def load_comments(self):
        self.comm_list.clear()
        comments = self.story.get('comments', [])
        for i, note in enumerate(comments):
            item = QListWidgetItem()
            widget = CommentItemWidget(i, note)
            widget.view_clicked.connect(self.view_comment)
            widget.delete_clicked.connect(self.delete_comment)
            self.comm_list.addItem(item)
            self.comm_list.setItemWidget(item, widget)

    def view_comment(self, index):
        comments = self.story.get('comments', [])
        if 0 <= index < len(comments):
            dialog = CommentViewDialog(comments[index], self)
            dialog.exec()

    def delete_comment(self, index):
        comments = self.story.get('comments', [])
        if 0 <= index < len(comments):
            confirm = StyledConfirmDialog("Delete Comment", 
                                        "Are you sure you want to delete this comment?",
                                        self)
            if confirm.exec() == QDialog.DialogCode.Accepted:
                del self.story['comments'][index]
                try:
                    self.db_manager.save_work_story(self.story)
                    self.load_comments()
                    self.on_toast("Comment deleted", "success")
                except Exception as e:
                    self.on_toast(f"Failed to delete: {str(e)}", "error")

    def add_comment(self):
        note = self.comm_input.text().strip()
        if not note: return
        
        if 'comments' not in self.story or not isinstance(self.story['comments'], list):
            self.story['comments'] = []
            
        timestamp = datetime.now().strftime("%H:%M")
        full_note = f"[{timestamp}] {note}"
        self.story['comments'].append(full_note)
        
        self.load_comments()
        self.comm_input.clear()
        
        # Auto-save if it's an existing story
        if self.story.get('id'):
            self.save_story()


    def save_story(self):
        # Update text content before saving
        if not self.story['title'] and self.overview_input.toPlainText():
            self.story['title'] = self.overview_input.toPlainText()[:50] + "..."
            
        full_text = self.ai_summary_output.toPlainText()
        if "SUMMARY: " in full_text and "DESCRIPTION:" in full_text:
            parts = full_text.split("DESCRIPTION:")
            self.story['title'] = parts[0].replace("SUMMARY: ", "").strip()
            self.story['description'] = parts[1].strip()
        
        self.story['overview'] = self.overview_input.toPlainText()

        try:
            self.db_manager.save_work_story(self.story)
            self.refresh_history()
            self.on_toast("Story saved", "success")
            # Enable add comment if saved for first time
            if self.story.get('id'):
                self.add_comment_btn.setEnabled(True)
        except Exception as e:
            self.on_toast(f"Save failed: {str(e)}", "error")

    def save_and_export(self):
        # Just save, export is handled separately now
        self.save_story()

    def export_story_to_file(self):
        if not self.story.get('overview'):
            self.on_toast("Nothing to export!", "error")
            return
            
        file_name, _ = QFileDialog.getSaveFileName(self, "Export Story", 
                                                 f"{self.story.get('title', 'story')}.txt", 
                                                 "Text Files (*.txt);;All Files (*)")
        if file_name:
            try:
                with open(file_name, 'w', encoding='utf-8') as f:
                    f.write(f"TITLE: {self.story.get('title', 'Untitled')}\n")
                    f.write(f"DATE: {self.story.get('created_at', datetime.now().strftime('%Y-%m-%d'))}\n")
                    f.write("-" * 40 + "\n\n")
                    f.write(f"SUMMARY:\n{self.story.get('title', '')}\n\n")
                    f.write(f"DESCRIPTION:\n{self.story.get('description', '')}\n\n")
                    f.write("-" * 40 + "\n\n")
                    f.write("COMMENTS:\n")
                    for c in self.story.get('comments', []):
                        f.write(f"- {c}\n")
                    f.write("\n" + "-" * 40 + "\n")
                    f.write("RAW TRANSCRIPT:\n")
                    f.write(self.story.get('overview', ''))
                
                self.on_toast("Export successful!", "success")
            except Exception as e:
                self.on_toast(f"Export failed: {str(e)}", "error")

    def show_history(self):
        pass # Sidebar is persistent now

    def clear_session(self):
        # Safety Valve: check for unsaved content
        has_content = (self.overview_input.toPlainText().strip() or 
                       self.ai_summary_output.toPlainText().strip())
        
        if has_content:
            confirm = StyledConfirmDialog("Start New Session?", 
                                        "Unsaved progress will be cleared. Proceed?",
                                        self)
            if confirm.exec() != QDialog.DialogCode.Accepted:
                return

        # Reset State
        self.story = {
            'title': '',
            'description': '',
            'overview': '',
            'comments': [],
            'status': 'draft'
        }
        
        # Restore Story Mode
        self.exit_comment_mode()
        
        # Clear UI
        self.overview_input.clear()
        self.ai_summary_output.clear()
        self.comm_list.clear()
        self.add_comment_btn.setEnabled(False)
        
        # Deselect current item in history
        self.hist_list.clearSelection()
        
        self.on_toast("Workbench cleared", "info")
