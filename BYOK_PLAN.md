# BYOK Public Release Strategy

## Goal
Transform LAZY into a community-ready tool by implementing a **Bring Your Own Key (BYOK)** model. This ensures user privacy while keeping the application free and sustainable.

## ⚠️ Security Sanitization
> [!IMPORTANT]
> Your personal OpenAI API Key in the `.env` file will be cleared to prevent accidental exposure when sharing the code.

## Proposed Changes

### 1. Environment & Security
- **File**: `.env`
- **Action**: Clear the `OPENAI_API_KEY` value.
- **Action**: Add descriptive placeholder comments for new users.

### 2. Settings UI Upgrade
- **File**: `ui/settings_dialog.py`
- **Action**: Add a clickable help link: "Need a key? [Get your OpenAI API Key here](https://platform.openai.com/api-keys)".
- **Action**: Improve button states for a more consumer-grade feel.

### 3. Smart Onboarding (First-Run)
- **File**: `main.py`
- **Action**: If no valid API key is found on launch, automatically trigger the Settings dialog.
- **Action**: Show a "Ready to Work?" welcome toast.

### 4. Community Documentation
- **File**: `BYOK_GUIDE.md` (NEW)
- **Action**: Create a step-by-step walkthrough for BAs to set up their own AI environment.

## Verification Plan
1. **Fresh Start**: Delete `.lazy_settings.json` and ensure the app prompts for a key.
2. **Validation**: Test with a fake `sk-...` key to ensure the validator blocks it.
3. **Workflow**: Confirm stories still generate correctly with a valid key.
