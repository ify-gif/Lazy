# Bring Your Own Key (BYOK) Guide 🔑

**LAZY Workbench** is designed as a "Logic Augmentation" tool, meaning it uses AI to enhance your workflow. To keep your data private and costs under your control, the application connects directly to OpenAI using **your own personal API key**.

This means:
*   You pay OpenAI directly (usually pennies per day).
*   No middleman marks up the price.
*   Your data policy is between you and OpenAI.

---

## Step 1: Get an OpenAI API Key

1.  Go to [platform.openai.com](https://platform.openai.com/signup).
2.  Sign up or Log in.
3.  Click **Dashboard** > **API Keys** (on the left menu).
4.  Click **+ Create new secret key**.
5.  Name it "Lazy App" and copy the key (starts with `sk-...`).
    *   *Note: You won't be able to see it again, so copy it now!*

> **Important**: You must have a payment method attached to your OpenAI account for the API to work, even for free tiers in some cases.

---

## Step 2: Configure LAZY

1.  Open **LAZY Workbench**.
2.  Click the **Settings Gear ⚙️** icon in the top right.
3.  Paste your key into the **OpenAI API Key** field.
4.  (Optional) Select your preferred model (e.g., `gpt-4o` for best results).
5.  Click **Save**.

The app will securely store your key in your operating system's localized Credential Locker (Windows Credential Manager or macOS Keychain). It is **never** sent to our servers.

---

## Troubleshooting

*   **Error 401 (Unauthorized)**: Your key is incorrect. Try generating a new one.
*   **Error 429 (Rate Limit)**: You may be out of credits. Check your billing settings at [platform.openai.com/billing](https://platform.openai.com/account/billing/overview).

---
*Happy Augmenting!* 🚀
