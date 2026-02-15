# LAZY Workbench - Analyst Studio

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)
![Platform Windows](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

> **"Capture Everything. Write Nothing."**

**LAZY Workbench** is a professional desktop environment designed for Business Analysts who want to spend more time thinking and less time typing. By combining high-fidelity audio transcription with a localized AI studio, it turns your scattered thoughts and meeting notes into structured, professional requirements.

---

## 🚀 Features

### 🎙️ Meeting Mode
*   **Real-time Transcription**: Powered by OpenAI Whisper for near-perfect accuracy.
*   **Actionable Summaries**: Automatically generates executive summaries, decision logs, and action items.
*   **Visual Waveform**: Confirm audio capture at a glance.

### 🛠️ Analyst Studio (The "Workbench")
*   **User Story Generator**: Dictate a raw brain dump, and get a perfectly formatted Jira User Story with Acceptance Criteria.
*   **Technical Polishing**: Turn shorthand notes into professional technical specifications.
*   **Gap Analysis**: AI-driven prompts to help you find missing requirements.

### 🔒 Privacy First (BYOK)
*   **Bring Your Own Key**: You control your OpenAI API key. Connectivity is direct from your machine to OpenAI.
*   **Local Storage**: All transcripts and stories are stored in a local SQLite database (`~/lazy_data.db`).
*   **Zero-Retention**: We do not see, store, or train on your data.

---

## 📦 Installation

### 1. Prerequisites
*   Python 3.10 or higher
*   [FFmpeg](https://ffmpeg.org/download.html) (installed and added to PATH)
*   An active OpenAI API Key (see [BYOK Guide](BYOK_GUIDE.md))

### 2. Quick Start
```bash
# Clone the repository
git clone https://github.com/ify-gif/Lazy.git

# Install dependencies
pip install -r requirements.txt

# Run the Workbench
python main.py
```

### 3. Configuration
1.  Click the **Settings Gear ⚙️** icon in the top right.
2.  Enter your **OpenAI API Key**.
3.  Choose your model (Recommended: `gpt-4o`).
4.  Click **Save**.

---

## 📚 Documentation

*   **[Setup Guide (BYOK)](BYOK_GUIDE.md)**: Detailed instructions for getting your API key.
*   **[Job Aid](LAZY_JOB_AID.md)**: A functional manual for the application.

---

## 🤝 Contributing

This project is open source! Feel free to fork, submit PRs, or suggest features.

**License**: Distributed under the [MIT License](LICENSE).
