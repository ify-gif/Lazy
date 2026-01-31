from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                             QPushButton, QTextEdit, QFrame, QScrollArea, QLineEdit)
from PyQt6.QtCore import Qt, pyqtSignal

class WorkTrackerMode(QWidget):
    def __init__(self, audio_engine, get_api_client_cb, on_toast, parent=None):
        super().__init__(parent)
        self.audio_engine = audio_engine
        self.get_api_client = get_api_client_cb
        self.on_toast = on_toast
        
        self.story = None
        self.comments = []
        
        self.init_ui()

    def init_ui(self):
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(30, 20, 30, 20)
        
        # Initial State: Overview Creation
        self.overview_container = QWidget()
        ov_layout = QVBoxLayout(self.overview_container)
        ov_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        ov_title = QLabel("Create Work Story")
        ov_title.setStyleSheet("font-size: 24px; font-weight: bold;")
        ov_layout.addWidget(ov_title, alignment=Qt.AlignmentFlag.AlignCenter)
        
        ov_desc = QLabel("Dictate your story overview and let AI generate a professional Jira story")
        ov_desc.setStyleSheet("color: #64748b; margin-bottom: 20px;")
        ov_layout.addWidget(ov_desc, alignment=Qt.AlignmentFlag.AlignCenter)
        
        self.overview_input = QTextEdit()
        self.overview_input.setPlaceholderText("Record or type your story overview here...")
        self.overview_input.setFixedSize(500, 200)
        ov_layout.addWidget(self.overview_input, alignment=Qt.AlignmentFlag.AlignCenter)
        
        self.record_hold_btn = QPushButton("Hold to Record")
        self.record_hold_btn.setFixedSize(500, 50)
        self.record_hold_btn.setObjectName("RecordHoldButton")
        # Direct event handling for Hold behavior
        self.record_hold_btn.pressed.connect(self.start_recording_ov)
        self.record_hold_btn.released.connect(self.stop_recording_ov)
        ov_layout.addWidget(self.record_hold_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        
        self.generate_btn = QPushButton("Generate Story with AI")
        self.generate_btn.setFixedSize(500, 50)
        self.generate_btn.setObjectName("PrimaryButton")
        self.generate_btn.clicked.connect(self.generate_story)
        ov_layout.addWidget(self.generate_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        
        self.main_layout.addWidget(self.overview_container)
        
        # Story Preview State (Initially Hidden)
        self.story_container = QWidget()
        self.story_container.hide()
        story_layout = QHBoxLayout(self.story_container)
        
        # Left Side: Story Details
        left_side = QVBoxLayout()
        left_side.addWidget(QLabel("SUMMARY"))
        self.summary_edit = QLineEdit()
        left_side.addWidget(self.summary_edit)
        
        left_side.addWidget(QLabel("DESCRIPTION"))
        self.description_edit = QTextEdit()
        left_side.addWidget(self.description_edit)
        
        self.comments_area = QScrollArea()
        self.comments_area.setWidgetResizable(True)
        self.comments_list_widget = QWidget()
        self.comments_list_layout = QVBoxLayout(self.comments_list_widget)
        self.comments_area.setWidget(self.comments_list_widget)
        left_side.addWidget(QLabel("COMMENTS"))
        left_side.addWidget(self.comments_area)
        
        story_layout.addLayout(left_side, 2)
        
        # Right Side: Add Comment
        right_side = QVBoxLayout()
        right_side.addWidget(QLabel("Add Comment"))
        self.comment_input = QTextEdit()
        self.comment_input.setPlaceholderText("Dictate or type details...")
        right_side.addWidget(self.comment_input)
        
        self.polish_btn = QPushButton("Polish & Add Comment")
        self.polish_btn.clicked.connect(self.add_comment)
        right_side.addWidget(self.polish_btn)
        
        story_layout.addLayout(right_side, 1)
        
        self.main_layout.addWidget(self.story_container)

    def start_recording_ov(self):
        self.audio_engine.start_recording()
        self.record_hold_btn.setText("Recording...")
        self.on_toast("Recording overview...", "info")

    def stop_recording_ov(self):
        self.record_hold_btn.setText("Transcribing...")
        path = self.audio_engine.stop_recording()
        api_client = self.get_api_client()
        if api_client and path:
            try:
                text = api_client.transcribe_audio(path)
                self.overview_input.setPlainText(text)
                self.on_toast("Overview transcribed", "success")
            except Exception as e:
                self.on_toast(str(e), "error")
        self.record_hold_btn.setText("Hold to Record")

    def generate_story(self):
        overview = self.overview_input.toPlainText()
        if not overview: return
        
        api_client = self.get_api_client()
        if not api_client: return
        
        try:
            self.on_toast("Generating story...", "info")
            story_data = api_client.generate_story_from_overview(overview)
            self.summary_edit.setText(story_data['summary'])
            self.description_edit.setPlainText(story_data['description'])
            
            self.overview_container.hide()
            self.story_container.show()
            self.on_toast("Story generated!", "success")
        except Exception as e:
            self.on_toast(str(e), "error")

    def add_comment(self):
        text = self.comment_input.toPlainText()
        if not text: return
        
        api_client = self.get_api_client()
        try:
            self.on_toast("Polishing comment...", "info")
            polished = api_client.polish_comment(text)
            self.comments.append(polished)
            self.update_comments_list()
            self.comment_input.clear()
            self.on_toast("Comment added", "success")
        except Exception as e:
            self.on_toast(str(e), "error")

    def update_comments_list(self):
        # Clear current list
        for i in reversed(range(self.comments_list_layout.count())): 
            self.comments_list_layout.itemAt(i).widget().setParent(None)
            
        for comment in self.comments:
            lbl = QLabel(comment)
            lbl.setWordWrap(True)
            lbl.setStyleSheet("background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 5px;")
            self.comments_list_layout.addWidget(lbl)
