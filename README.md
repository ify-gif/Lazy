# LAZY - Local Audio-to-YAML Jira Engine

A premium web application for recording meetings, transcribing audio, and generating Jira-formatted work stories with AI assistance. Features real-time waveform visualization, intelligent history management, and a beautiful modern interface.

## Features

### 🎙️ Meeting Transcription Mode
- **Real-time Audio Waveform Visualization** - See your audio as you record
- **Multi-device Support** - Choose any microphone (built-in, USB, Bluetooth)
- **AI-Powered Transcription** - Automatic transcription using Whisper AI (OpenAI or Groq)
- **Intelligent Summarization** - Claude AI generates structured meeting summaries with:
  - Participant identification
  - Key decisions and conclusions
  - Action items with owners
- **Editable Transcripts** - Edit and refine transcripts before saving
- **Smart History** - Save, search, and reload previous transcripts
- **One-Click Export** - Download formatted .txt files or copy to clipboard
- **Auto-Save** - Automatically saves to database with full history

### 📝 Work Tracker Mode
- **Push-to-Talk Dictation** - Hold button to record overview
- **AI Story Generation** - Automatically creates:
  - Professional Jira-style summary titles
  - Clear, contextual descriptions
  - Proper formatting for tickets
- **Iterative Comments** - Add multiple polished comments:
  - Dictate technical details
  - AI automatically polishes for professionalism
  - Edit or remove comments before export
- **Live Preview** - See story formatted in real-time
- **Rich Export Options** - Copy, download, or save to database
- **Version History** - Track drafts and completed stories

### 🎨 Premium UI/UX Features
- **Modern Gradient Design** - Beautiful color schemes with depth and polish
- **Dark Mode** - Toggle between light and dark themes
- **Toast Notifications** - Non-intrusive feedback for all actions
- **Smooth Animations** - Micro-interactions and transitions throughout
- **Responsive Layout** - Card-based design with optimal spacing
- **Loading States** - Skeleton loaders and progress indicators
- **Empty States** - Helpful prompts when no content exists

### 💾 Data Persistence
- **Supabase Database Integration** - All transcripts and stories saved
- **Full History Sidebar** - Browse, search, and filter past items
- **Smart Search** - Find content across titles and descriptions
- **Quick Actions** - Delete, edit, or reload from history
- **Auto-Timestamps** - Track when items were created
- **Word Count & Stats** - View metrics for transcripts

## Quick Start

### 1. Get API Keys

**Claude API Key** (for AI summaries and story generation)
- Visit [console.anthropic.com](https://console.anthropic.com/)
- Create an account and generate an API key

**Whisper API Key** (for audio transcription)

Choose one provider:
- **Groq** (Recommended - 10x faster, generous free tier)
  - Visit [console.groq.com](https://console.groq.com/)
  - Create account and get API key
  - Best for real-time transcription

- **OpenAI** (Alternative - reliable, pay-per-use)
  - Visit [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  - Create account and get API key

### 2. Configure Settings

1. Click the **Settings** icon (gear) in the top right
2. Enter your **Claude API Key**
3. Select **Whisper provider** (Groq recommended)
4. Enter your **Whisper API Key**
5. Optionally adjust Claude model and token limits
6. Click **Save**

Your settings are saved locally and persist across sessions.

### 3. Grant Microphone Access

When prompted by your browser, click **Allow** to enable microphone access.

## Usage Guide

### Meeting Transcription

1. **Start a New Meeting**
   - Switch to "Meeting Transcription" mode
   - Give your meeting a title (or use auto-generated)
   - Select your preferred microphone from dropdown

2. **Record**
   - Click the blue "Start Recording" button
   - Watch the real-time waveform visualization
   - Recording timer shows elapsed time
   - Click red "Stop Recording" when done

3. **Transcribe**
   - Audio is automatically transcribed after stopping
   - Wait for the AI processing notification
   - Edit transcript text if needed

4. **Generate Summary**
   - Click "Generate AI Summary" button
   - Claude analyzes your transcript
   - View structured summary in right panel
   - Copy summary to clipboard or edit as needed

5. **Save & Export**
   - Click "Save" to store in database with searchable history
   - Click "Export" to download formatted .txt file
   - Use "Copy" buttons to copy content to clipboard

6. **Access History**
   - Click "History" button to view all past transcripts
   - Search by title or content
   - Click any item to reload it
   - Delete old transcripts you don't need

**Output Format:**
```
LAZY Meeting Transcript
Date: January 30, 2026 2:30 PM
Duration: 45 minutes
Title: Q1 Planning Meeting

=== TRANSCRIPT ===
[Full transcript with speaker notes...]

=== SUMMARY ===
Participants: Alice, Bob, Charlie

Key Decisions:
- Approved Q1 roadmap priorities
- Budget increase of 15% for new hires

Action Items:
- [ ] Alice: Finalize hiring plan by Feb 5
- [ ] Bob: Update project timeline
```

### Work Tracker

1. **Create Story Overview**
   - Switch to "Work Tracker" mode
   - Hold "Hold to Record" button while speaking your overview
   - Or type/paste your overview directly
   - Describe the problem, solution, and requirements

2. **Generate Story**
   - Click "Generate Story with AI"
   - Claude creates professional Jira-style story:
     - Summary: Concise, action-oriented title
     - Description: Clear 2-4 sentence context
   - Edit summary or description as needed

3. **Add Comments**
   - Use the right panel to add details
   - Hold "Record" button to dictate comments
   - Or type comments directly
   - Click "Polish & Add Comment"
   - AI refines for professionalism
   - Repeat for multiple comments
   - Remove comments with trash icon

4. **Save & Export**
   - Click "Save" to store draft in database
   - Click "Copy" to copy formatted story to clipboard
   - Click "Export Story" to download as .txt file
   - Stories marked as "exported" in history

5. **Manage Stories**
   - Click "New" to start fresh story
   - Click "History" to view all past stories
   - Load drafts to continue working
   - Search through your story archive

**Output Format:**
```
LAZY Work Story
Created: January 30, 2026 3:45 PM

SUMMARY
Implement user authentication with SSO support

DESCRIPTION
Add single sign-on authentication to the platform to enable
enterprise customers to use their existing identity providers.
This will reduce friction for large deployments and improve
security compliance.

COMMENT 1
Technical approach: Integrate Auth0 for SSO with support
for SAML 2.0 and OAuth 2.0. Configure tenant isolation
and role-based access control.

COMMENT 2
Acceptance criteria: Users can login via Google Workspace,
Microsoft Azure AD, and Okta. Session management with 24hr
token expiry. Admin dashboard for tenant configuration.
```

## UI/UX Highlights

### Design Principles
- **Premium Feel** - Gradient backgrounds, smooth shadows, depth
- **Modern Aesthetics** - Card-based layouts, rounded corners, professional typography
- **Micro-interactions** - Hover states, button animations, smooth transitions
- **Visual Feedback** - Toast notifications, loading states, progress indicators
- **Responsive Design** - Works seamlessly on different screen sizes

### Visual Elements
- **Waveform Visualization** - Real-time audio feedback during recording
- **Gradient Headers** - Dark modern header with gradient text
- **Pulse Animations** - Recording indicators and status badges
- **Skeleton Loaders** - Smooth loading states for history
- **Color-Coded Actions** - Blue for recording, green for success, red for stop
- **Floating Action Buttons** - Prominent CTAs with hover effects

### Dark Mode
- Toggle dark/light mode with moon/sun icon
- Persistent across sessions
- Optimized color schemes for both modes
- Smooth transition animations

## Advanced Features

### History & Search
- **Smart Search** - Search across all transcripts and stories
- **Filter by Date** - Recent items shown first
- **Quick Preview** - See snippets before loading
- **Delete Management** - Remove unwanted items
- **Load & Continue** - Resume work on drafts

### Copy & Export
- **Copy to Clipboard** - One-click copy for transcripts, summaries, stories
- **Export as Text** - Download formatted .txt files
- **Auto-Naming** - Intelligent file naming from content
- **Timestamp Metadata** - All files include creation dates

### Performance
- **Lazy Loading** - Efficient history pagination
- **Optimized Queries** - Indexed database searches
- **Debounced Search** - Smooth search experience
- **Skeleton Loading** - Perceived performance boost

## Tips & Best Practices

### Recording Quality
- **Environment** - Use quiet space for best transcription
- **Microphone** - USB or Bluetooth headsets work better than laptop mics
- **Distance** - Keep mic 6-12 inches from mouth
- **Speaking Pace** - Normal conversational speed is ideal

### Meeting Transcription
- **Clear Speech** - Enunciate clearly for accurate transcription
- **Name Mentions** - Explicitly say names for participant tracking
- **Action Items** - Clearly state action items with owners
- **Review & Edit** - Always review transcript before generating summary

### Work Tracker
- **Concise Overviews** - 30-90 seconds is ideal length
- **Context First** - Start with problem, then solution
- **Technical Details** - Add technical notes as comments
- **Multiple Comments** - Break down requirements into separate comments
- **Edit Before Export** - Review AI-generated content

### API Usage & Costs
- **Whisper (Groq)** - Free tier: 14,400 minutes/day (recommended)
- **Whisper (OpenAI)** - $0.006 per minute (~$0.36/hour)
- **Claude Sonnet** - $3 per million input tokens (~$0.01-0.03 per summary)
- **Tip** - Groq is 10-20x faster and free for most use cases

## Keyboard Shortcuts

Coming soon:
- `Ctrl+N` - New transcript/story
- `Ctrl+S` - Save current item
- `Ctrl+E` - Export
- `Ctrl+H` - Show history
- `Ctrl+,` - Open settings
- `Space` - Start/stop recording (when focused)

## Technical Details

**Built with:**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Supabase (database)
- Web Audio API (waveform visualization)
- Whisper API - OpenAI/Groq (transcription)
- Claude API - Anthropic (summarization & story generation)

**Architecture:**
- Component-based React architecture
- Custom hooks for state management
- Supabase Row Level Security for data access
- LocalStorage for settings persistence
- Toast notification system
- Real-time audio visualization

**Browser Support:**
- Chrome 90+
- Edge 90+
- Firefox 88+
- Safari 14+

**Requirements:**
- HTTPS or localhost (for microphone access)
- Modern browser with Web Audio API support
- Active internet connection (for API calls)

## Privacy & Security

- ✅ **API Keys Stored Locally** - Never sent to our servers
- ✅ **Client-Side Processing** - Settings stored in browser only
- ✅ **Direct API Calls** - Audio sent directly to OpenAI/Groq
- ✅ **Database Privacy** - Row Level Security policies
- ✅ **No Tracking** - No analytics or telemetry
- ✅ **No Server Storage** - Audio never stored on our servers
- ✅ **Secure Exports** - Files saved to your local Downloads folder

**Data Flow:**
1. Audio recorded in browser
2. Sent directly to Whisper API (OpenAI/Groq)
3. Transcript sent to Claude API
4. Results saved to Supabase database
5. No intermediary servers or storage

## Troubleshooting

**Microphone not detected**
- Check browser permissions in Settings → Privacy
- Ensure microphone is connected and working
- Try refreshing the page
- Check system audio settings
- Grant microphone permission when prompted

**Transcription failed**
- Verify API keys are correct in Settings
- Check internet connection
- Ensure audio file isn't corrupted (try shorter recording first)
- Check API provider status page
- Verify API quota/credits

**Summary generation failed**
- Verify Claude API key is correct
- Check API quota/credits at console.anthropic.com
- Ensure transcript has content
- Try again (temporary API issues)
- Check browser console for errors

**Can't hear audio during recording**
- This is normal behavior - app only records, doesn't play back
- Recording timer confirms it's working
- Check transcription results to verify recording quality

**History not loading**
- Check internet connection
- Verify Supabase environment variables
- Clear browser cache and reload
- Check browser console for errors

**Dark mode not working**
- Try toggling dark mode off and on
- Clear browser cache
- Check if browser has dark mode forced
- Try different browser

## Support & Resources

**API Documentation:**
- [Claude API Docs](https://docs.anthropic.com/)
- [OpenAI Whisper Docs](https://platform.openai.com/docs/guides/speech-to-text)
- [Groq API Docs](https://console.groq.com/docs)
- [Supabase Docs](https://supabase.com/docs)

**Get Help:**
- Check troubleshooting section above
- Review browser console for errors
- Verify API keys are active
- Test with shorter recordings first

## What's New in v1.0

- ✨ **Premium UI** - Complete redesign with modern aesthetics
- 🎵 **Waveform Visualization** - Real-time audio visualization
- 💾 **Database Integration** - Supabase for persistent history
- 🔍 **Smart Search** - Search and filter through history
- 🎨 **Dark Mode** - Beautiful dark theme support
- 🔔 **Toast Notifications** - Non-intrusive feedback system
- 📋 **Copy to Clipboard** - Quick copy functionality
- ⚡ **Performance** - Optimized loading and animations
- 🎯 **Better UX** - Improved workflows and interactions

---

**Version:** 1.0.0
**Last Updated:** January 31, 2026
**License:** MIT
