# Reiimei v0.2.1

*reiimei* (REE-h-may), n. The cold, luminous stillness peculiar to a clear winter night; especially the sensation of moonlight upon frost, when darkness seems to brighten rather than recede.

An offline-first notes app for Windows and iPhone, built as a Progressive Web App (PWA). No Mac, no App Store, no developer fee.

## What changed in v0.2.1

- All files now sit in one folder, so they can be uploaded to GitHub from an iPhone in one step

## What changed in v0.2.0

- Renamed from Inkwell to Reiimei
- New look: moonlit blue and frost in light and dark themes, with ivory-gold for tags and pinned notes
- New icon: a reiimei cut open, on a winter night sky
- The definition of reiimei appears when no note is open
- Fonts (Marcellus and Newsreader) are saved for offline use after the first online launch
- Backups from Inkwell v0.1.0 can still be imported

## Features

- **Folders**: create, rename, delete (deleting a folder moves its notes to "Notes"; nothing is lost)
- **Tags**: add with Enter or a comma, remove with × or Backspace; filter by tag in the sidebar
- **Offline editing**: every keystroke is saved on the device first; the app opens with no connection
- **Sync**: free Supabase backend; syncs on launch, every minute, a few seconds after edits, and when you come back online
- **Conflict safety**: if the same note is edited on two devices before they sync, the newer edit wins and the other is kept as a "Conflicted copy" note
- Search (text and tags), pinning, Recently Deleted with restore, JSON backup and restore
- **Logging and startup diagnostics**: Settings › Diagnostics shows checks run at each launch; Settings › Log can be copied or downloaded

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css` | The interface |
| `app.js` | App logic, diagnostics, settings |
| `db.js` | On-device database (IndexedDB) |
| `sync.js` | Supabase sync and conflict handling |
| `logger.js` | Rolling log (last 1000 entries) |
| `sw.js` | Service worker: makes the app open offline |
| `manifest.webmanifest` | Install metadata |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App icons |
| `supabase-setup.sql` | Creates the sync tables and security rules |

## 1. Try it on your laptop

PWAs must be served by a web server, not opened by double-clicking. In this folder, run:

```
python -m http.server 8000
```

Then open http://localhost:8000 in Edge or Chrome. Notes work immediately, saved on this laptop only.

## 2. Put it online with GitHub Pages (works from an iPhone)

The iPhone needs an HTTPS address. GitHub Pages hosts the app for free. Only the app's code goes to GitHub; your notes never do.

1. **Unzip on the iPhone.** Save the zip to the Files app, then tap it. Files creates a `Reiimei v0.2.1` folder.
2. **Create the repository.** In Safari, sign in at github.com, tap **+** › **New repository**. Name it `reiimei`, set it to **Public** (free Pages needs a public repository), and tap **Create repository**.
3. **Upload the files.** On the new repository's page, tap **uploading an existing file**. Tap **choose your files**, then **Browse**, open the `Reiimei v0.2.1` folder, tap **Select**, select all 13 files, and tap **Open**. Scroll down and tap **Commit changes**.
   - If you don't see the upload link, tap the **aA** button in Safari's address bar › **Request Desktop Website** and try again.
4. **Turn on Pages.** In the repository, open **Settings** › **Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main** and **/ (root)**, then tap **Save**.
5. **Wait a minute or two**, then reload the Pages screen. It shows your address, which looks like `https://yourname.github.io/reiimei/`.

On a laptop, Netlify Drop (app.netlify.com/drop) is another option: drag the folder onto the page.

## 3. Install it

- **iPhone**: open the address in **Safari** › Share › **Add to Home Screen**. Open it from the Home Screen icon from then on, not from Safari; installed apps get their own storage that iOS does not clear.
- **Windows**: open the address in Edge › the install icon in the address bar (or ⋯ › Apps › Install). It gets a Start menu entry and its own window.

## 4. Turn on sync

1. Create a free project at supabase.com.
2. Open **SQL Editor** › New query, paste all of `supabase-setup.sql`, click **Run**.
3. Open **Project Settings › API** (labelled API Keys in newer dashboards) and copy the **Project URL** and the **anon / publishable** key. Never use the `service_role` or secret key.
4. Optional: in **Authentication › Sign In / Providers › Email**, turn off "Confirm email" if you'd rather skip the confirmation email for your own account.
5. In Reiimei: Settings › Sync, paste the URL and key, enter an email and password, and click **Create account** (first device) or **Sign in** (other devices).

Each user can only see their own notes; the database enforces this with row level security.

## Updating the app

The service worker caches the app files. When you change any file, bump `VERSION` in `sw.js` (and `APP_VERSION` in `app.js`), then upload. Devices pick up the new version the next time the app is opened online, and use it from the following launch.

## Troubleshooting

- **Settings › Diagnostics** shows whether storage, offline support, and sync are working, with a plain-language reason when something isn't.
- **Settings › Log** › Download gives a text log of everything the app did, including sync results and errors.
- **"Test connection"** in Settings › Sync confirms the URL, key, sign-in, and tables are all correct.

## Known limits in v0.2.1

- Plain text only (no bold, checklists, or images yet)
- Folders are one level deep
- Items in Recently Deleted stay there until a future "empty" feature is added
- The first launch needs a connection for the fonts; until then the app uses similar system fonts
