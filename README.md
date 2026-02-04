# LAZY - Business Analyst Work Tracker Studio

## Professional Requirements Management Desktop Application

LAZY is a purpose-built desktop environment for Business Analysts to manage the lifecycle of project requirements. By integrating high-fidelity audio transcription with AI-driven documentation synthesis, it transitions meeting discussions into polished Jira User Stories and technical specifications.

---

## Technical Prowess

- **Meeting Transcription Engine**: Real-time Whisper-powered audio capture with visual waveform monitoring.
- **Work Tracker Studio**: A structured workbench for drafting, iterating, and polishing user stories and technical comments.
- **BA Cheat Sheet**: Contextual access to Gherkin syntax, trigger words, and logic gap checklists.
- **Local-First Architecture**: High-privacy SQLite storage with professional-grade System Tray persistency.

---

## Core Operations

### Meeting Mode
Capture stakeholder discussions with the "Start Recording" function. Review real-time transcripts and generate executive-level summaries including key decisions and action registries.

### Studio Mode
Convert dictated overviews into structured User Stories. Utilize the AI-driven polishing engine to refine technical commentary and maintain a professional narrative flow.

---

## Implementation & Setup (BYOK)

This application follows a **Bring Your Own Key (BYOK)** model to ensure data privacy and user autonomy.

1. **Prerequisites**: Python 3.10+ and an active OpenAI API Key.
2. **Installation**:
   ```bash
   pip install -r requirements.txt
   python main.py
   ```
3. **Configuration**: Use the application Settings menu to validate and save your API credentials.

For a detailed setup walkthrough, refer to the [BYOK_GUIDE.md](BYOK_GUIDE.md).

---

## Training and Documentation

Comprehensive procedural documentation is available in the [LAZY_JOB_AID.md](LAZY_JOB_AID.md), featuring functional walkthroughs, best practices, and frequently asked questions.

---

## License
Distributed under the MIT License. See `LICENSE.txt` for more information.
