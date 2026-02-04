# Bring Your Own Key (BYOK) Setup Guide

## Overview
LAZY is designed as a standalone workstation that connects directly to the OpenAI API using your personal credentials. This ensuring that your project data remains isolated and under your direct control.

---

## 1. Obtain Your OpenAI API Key

1. **Create an Account**: Visit [OpenAI Platform](https://platform.openai.com/signup) and create an account.
2. **Access API Keys**: Navigate to the **API Keys** section in your dashboard sidebar (or visit [platform.openai.com/api-keys](https://platform.openai.com/api-keys)).
3. **Generate Key**: Click **Create new secret key**.
   - Note: Give the key a descriptive name like "LAZY Work Tracker."
4. **Secure the Key**: Copy the key immediately and save it in a secure location. You will not be able to view it again on the OpenAI website.

---

## 2. Configure LAZY

1. **Launch LAZY**: Open the application on your workspace.
2. **Open Settings**: Click the gear icon located in the upper right corner of the application header.
3. **Enter Key**: Paste your secret key (`sk-...`) into the **OpenAI API Key** field.
4. **Validation**: Click the **Validate** button to ensure your key is active and correctly formatted.
5. **Save**: Click **Save Settings**. The application will now be ready for transcription and AI polishing.

---

## 3. Understanding Usage and Costs

LAZY utilizes the following models:
- **Whisper**: For converting audio meetings into text transcripts.
- **GPT-4o**: For generating summaries and professional Jira comments.

OpenAI operates on a pay-as-you-go model. For typical Business Analyst workloads (10-15 meetings a month), the costs are generally minimal. You can monitor your usage and set spend limits at [platform.openai.com/usage](https://platform.openai.com/usage).

---

## 4. Troubleshooting

- **Validation Failed**: Ensure there are no leading or trailing spaces in the key field. Verify that your OpenAI account has an active payment method or remaining trial credits.
- **Connection Error**: Ensure your workstation has an active internet connection, as the API requires a cloud handshake for processing.
