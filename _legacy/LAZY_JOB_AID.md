# Professional Job Aid: LAZY Work Tracker Studio

## 1. Executive Summary
LAZY is a specialized workstation designed for Business Analysts to streamline the transition from raw meeting discussion to structured project documentation. The application leverages AI-powered transcription and polishing to ensure technical requirements are captured with precision and professional clarity.

---

## 2. Core Operational Modes

### 2.1 Meeting Transcription Mode
This mode is designed for real-time capture during stakeholder interviews, requirements gathering sessions, or stand-up meetings.

**Key Functional Walkthrough:**
1. **Initiate Session**: Enter a descriptive title in the meeting input field.
2. **Audio Capture**: Click the "Start Recording" button. Monitor the waveform visualizer to ensure active audio levels.
   [PASTE IMAGE: Meeting Mode Interface]
3. **Draft Review**: Once recording is stopped, the transcription is processed automatically. You may edit the raw text directly in the transcript pane.
4. **Strategic Summary**: Use the "Generate AI Summary" function to extract key decisions, action items, and technical specifications.
5. **Persistence**: Save the record to the local database for historical reference or export as a formatted document.

### 2.2 Work Tracker Studio
The Studio is an iterative workspace for drafting Jira User Stories and technical comments through dictation or manual entry.

**Key Functional Walkthrough:**
1. **Story Generation**: Use the "Overview" section to dictate the core intent of a feature. The AI will generate a structured User Story following the "As a... I want... So that..." format.
   [PASTE IMAGE: Work Tracker Studio]
2. **Iterative Polishing**: Add specific technical comments. Each entry can be "polished" by the AI to remove filler words and align with professional technical standards.
3. **Version Control**: Manage multiple drafts via the "Saved Stories" sidebar. Search and reload previous work to refine requirements over multiple sessions.

---

## 3. Advanced Features 

### 3.1 The BA Cheat Sheet
Accessible via the pulsating info icon in the header, this popover provides instant access to standard BA frameworks, including:
- **Gherkin Syntax** (Given/When/Then)
- **BA Trigger Words** (Logic gaps, constraints, edge cases)
- **Technical Checklists**

### 3.2 System Tray Workflow
The application is designed for background efficiency:
- **Minimize to Tray**: Closing or minimizing the main window moves the application to the System Tray. Double-click the tray icon to restore.
- **Context Menu**: Right-click the tray icon to access Settings, restore the window, or exit the application completely.
   [PASTE IMAGE: System Tray Context Menu]

---

## 4. Best Practices for Business Analysts

- **Audio Proximity**: Maintain a distance of 6-12 inches from the microphone for optimal transcription accuracy.
- **Strategic Dictation**: When recording story overviews, speak in "logical blocks." Mention specific data constraints or integration points explicitly to assist the AI in generating more accurate technical context.
- **The "Pulse" Check**: Ensure the pulsating green icon is active; this indicates the technical assistance engine is ready for input.
- **Iterative Exporting**: Review the "Live Preview" in the Work Tracker regularly before the final export to ensure the narrative flow of the story remains consistent.

---

## 5. Frequently Asked Questions (FAQ)

**Q: Where is my data stored?**
A: All transcripts and stories are stored in a local SQLite database (`lazy_data.db`) located in your user directory. No data is stored on remote servers other than the transient audio sent for transcription.

**Q: Why is my transcription not appearing?**
A: Verify your OpenAI API Key in the Settings menu. Ensure you have a stable internet connection and that the correct audio input device is selected.

**Q: Can I recover a deleted story?**
A: No. Deleting an item from the history sidebar permanently removes it from the local database to ensure strict privacy management.

**Q: Does the app need to be open to record?**
A: Yes, the application must be active. However, it can be minimized to the System Tray while you refer to other documentation or your browser.

---

## 6. Technical Specifications Reference

- **API Architecture**: OpenAI (Whisper for audio, GPT-4o for logic).
- **Security**: Local-first storage with Bring Your Own Key (BYOK) support.
- **Portability**: Native Windows application with System Tray persistency.
