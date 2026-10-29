# Reiimei for iPhone (1.0.0, in progress)

The native Reiimei app. Typing goes into iOS's own text box, so dictation, capitals, predictive
text, holding delete and moving the cursor behave as in Apple's apps. It is built and sent to
TestFlight by GitHub (`.github/workflows/ios.yml`) whenever this folder changes on the `native`
branch. The web app on `main` is not affected.

Milestone 1 (now): a list of notes and a note to write in, kept on the phone. Next: the shared core
from the web app (formatting, encryption, the Bible, Paper), the formatting deck, then sync. You
choose the cloud: iCloud Drive, Dropbox, Google Drive, OneDrive, WebDAV or Supabase. After that
comes moving your notes in from the web app.

## One-time setup (GitHub and Apple)

1. In this repository on GitHub: Settings › Secrets and variables › Actions › New repository
   secret. Add `APPLE_TEAM_ID`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` and `APPLE_API_KEY_P8` (the
   whole `.p8` file's text), the same four as The Bound Vigil uses.
2. In App Store Connect: Apps › + › New App, platform iOS, name Reiimei, bundle ID
   `com.krowsingre.reiimei`. The first build registers the bundle ID if it isn't there yet.
3. Run Actions › iPhone app › Run workflow (or push to `native`). When it finishes, the build
   appears in TestFlight.
