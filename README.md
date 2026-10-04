# Reiimei v0.14.3

*reiimei* (REE-h-may), n. The cold, luminous stillness peculiar to a clear winter night; especially the effect of moonlight upon frost, illuminating the night without dispelling it.

An offline-first notes app for Windows and iPhone, built as a Progressive Web App (PWA). No Mac, no App Store, no developer fee.

## What changed in v0.14.3

- **Formatting on a computer is laid out in labelled groups**, all shown at once: Text (bold, italic, underline, strikethrough, highlight), Headings (heading, superscript, subscript), Lists (bullets, numbers, checklist), Indent (move out, move in), Insert (quote, code, link, Sources, Paper), Tools (Copy, plus Registers and Continuity in Storyboard), and View where a note has one (Preview, Outline, Board, Run). Format and Font sit side by side underneath. A phone, or a narrow window, keeps the row of section chips.
- **Paragraph tools fixed in Text notes.** Numbered lists, Move in, Move out and Quote now work, also on several selected paragraphs, and none of them can freeze the app any more. Move in works on the first item of a list too. On a plain paragraph, Move in says it works on list items.
- **Typing "1. " starts a numbered list**, and "- " or "* " a bulleted one, as in a word processor.
- **Swipes on a phone.** Swipe in from the left edge to go back a screen. Swipe a note to the left in the list to show Pin and Delete (Restore and Delete in Recently Deleted); Delete offers Undo. Swipe back, or tap the note, to hide them.
- **The Reiimei page.** It now covers the whole screen. On a phone it opens with the app and says "Click here to get started."; tapping it goes to the home page with all your folders and tags. On a computer, clicking **Reiimei** shows the definition alone, and clicking it goes back to where you were.
- **On a computer the title lines up with the tags** and is a little smaller.

## What changed in v0.14.2

- **On a phone, Reiimei opens on the Reiimei page.** The definition is the home page, with "Click here to get started." at the bottom. Tap anywhere on it to go on to your notes. Tap **Reiimei** at the top of the folder list to come back to it. On a computer nothing changes: the page stays hidden until you click **Reiimei**, and clicking it starts a new note.

## What changed in v0.14.1

- **Text notes: write the way you would in Word.** **Text** is a new note format, listed first in **Format** (Text, Markdown, Populi). Bold looks bold, headings look like headings, lists and checklists look like lists, with no symbols to type and no switching between editing and preview. The **Text**, **Paragraph** and **Insert** buttons work on the selected words, and **Ctrl+B**, **Ctrl+I** and **Ctrl+U** work as usual. **Heading** steps through Heading 1, 2 and 3 and back to normal text. Tap the box in front of a checklist item to tick it. Pasting keeps bold, italics, headings and lists and drops everything else.
- **Text is the default for new notes**, on every device once it has this version. You can still pick Markdown or Populi in **Settings › Writing**. Notes you already have keep their format.
- A Text note is stored as Markdown, so switching a note between Text and Markdown changes nothing in it, and sharing, papers, Copy, citations, search and sync work as before. Citations such as `[@smith2020, 42]` stay as you type them and are filled in when you share, copy or make a paper. Markdown and Populi notes keep **Preview**; Text notes do not need it.
- One new file, `ui-rich.js`: 42 files now. No Supabase changes.

## What changed in v0.14.0

- **Titles.** Each note has a title line above its tags. What you type there is the note's title in the list, in shared files and as a paper's title. Leave it empty and the first line of the text is the title, as before, so older notes look the same; that line shows greyed in the empty title box. **Enter** in the title moves to the text. Titles sync and are encrypted with the rest of the note. Search finds titles too.
- **The Reiimei page is hidden.** Tap **Reiimei** at the top of the folder list to show the definition page, and tap it again to hide it. Tap anywhere on the page to start a new note in the mode and folder you are in. On a computer, the empty space where a note would be shows the same page and works the same way.
- **A simpler note header.** One row: back (or close), the note's folder as a single label, and a **⋯** menu with **Share**, **Pin** and **Delete**. Tap the folder label to move the note to another folder or project; the same list has **Move to another mode**, which replaces the mode menu that used to sit beside the folder. A small gold dot on **⋯** marks a pinned note. Folder and mode lists open as a sheet from the bottom on a phone.
- **"Saved" is gone.** The header only says something when a change is not saved yet (after a second or so) or when saving failed.
- **The toolbar.** **Format** and **Font** have moved into a **Note** section, as full-width rows. **Preview** and **Outline** (and **Board** in Storyboard) are together in a new **View** section. Every section still starts closed. On a phone the sections are one row of chips at the bottom of the note, just above the keyboard, which scrolls sideways; a section opens as a sheet above the chips, one at a time, and tapping its chip again closes it. Toolbar buttons no longer take the keyboard away on a phone.
- No new files and no Supabase changes. Still 41 files.

## What changed in v0.13.2

- **Reiimei Display v1.1.** The app now uses all six styles (Light, Regular, Bold, and an italic of each). The new version has 405 characters, including `# @ & * + = < > _ [ ] { }`, accented letters, curly quotes and dashes, so Markdown and code now show in your own font instead of a stand-in. Lowercase letters still appear as small caps by design.
- **Marcellus and Newsreader are gone.** The app no longer loads anything from Google Fonts and needs no internet for fonts. The Font menu now offers Reiimei Display, Echolume, System serif and System sans-serif. Notes that were set to Marcellus or Newsreader now show in Reiimei Display. The definition screen and source lists use Reiimei Display too.
- 41 files now (five new font files).

## What changed in v0.13.1

- **Update fix.** After uploading v0.13.0, some devices showed "Reiimei could not start: can't access property addEventListener". The app saved copies of its files for offline use, and during an update it could save the browser's older copy of a file (the browser holds files for a few minutes) next to the new page. The app now always fetches fresh copies when it updates. **If your device is stuck on that error:** upload v0.13.1, then close and reopen Reiimei twice; if the error is still there, clear this site's data for the Reiimei address in the browser settings (your notes sync from Supabase), or on iPhone remove the app from the Home Screen and add it again.

## What changed in v0.13.0

- **Reiimei Display is the interface font** and the default font for notes. Reiimei Display has a limited character set (no `# @ & * + = < > _ [ ] { }`, no accented letters), so those characters are drawn in the next font in the list (Marcellus, then a system serif).
- **One font menu, in each note.** The **Aa** button and the Fonts tab in Settings are gone. Each note has a **Font** menu in its toolbar that sets the text and headings of that note. Reiimei fonts (Reiimei Display, Echolume) are listed first, then a separate group of existing fonts (Newsreader, Marcellus, system sans-serif). The choice is saved with the note and syncs. Fonts you picked in the old Settings tab no longer apply.
- **The toolbar is sectioned and collapsed.** A row of section chips replaces the long row of buttons, and every section starts closed. Writing notes: **Text**, **Paragraph**, **Insert**, **Tools**. Code notes: **Edit**, **Navigate**, **Tools**. Click a chip to open or close its buttons. Preview keeps the Tools section open so you can get back to editing.
- **About page** in Settings: version, release date, how Reiimei is running, this device, credits, and a button that copies the version info.
- **Note lists are named for what they show:** Notes, Research notes, Coding notes, Storyboard notes, and **All notes** when Show all modes is on.
- Fixed the phone editor header running off the screen with the wider interface font.

## What changed in v0.12.0 (Coding mode)

- **Coding Projects.** Like Research and Storyboard, Coding mode now shows **Projects** instead of Folders. Every coding note lives in a project and gets the project name as a locked tag. Code notes you already had are placed in a project called **Unsorted**. New notes in Coding mode start as code (Python, or the last language you chose).
- **More languages:** JavaScript, CSS, JSON and SQL join Python, HTML5 and XML. Each has coloring, Tab and Enter indenting, comment toggling (JSON has no comments), and Tidy. **Run** (JavaScript) runs the code in the same sealed frame as HTML and prints `console.log` output. **Check** (JSON) reports whether it is valid, points to the problem, and shows it pretty printed.
- **Name check.** A dotted underline appears under a name that is not defined anywhere you would expect but is very close to one that is, such as `calcuate_total` when `calculate_total` exists. Click the underlined name to see the suggestion, then tap it to fix the spelling, or choose **Keep my spelling**. Names that look like nothing you have defined are left alone, and so are comments and strings. Names that only differ by a number, a plural "s", or extra words at the end (`item1` and `item2`, `item` and `items`) are treated as different names on purpose. A name you are still typing is not underlined. **Where names come from:** the note itself, the other code notes in the same project, and the language's built-in names. **Languages checked:** Python, JavaScript, SQL, CSS (property names and `var(--x)`), and HTML (tag names, and the JavaScript and CSS inside it). **Keep my spelling** is remembered for the whole project and syncs.
- **Autocomplete.** As you type a name, matching names from the note, the project and the language appear. **Tab** or **Enter** accepts the highlighted one (Up and Down choose another, or tap it). Anything else you type keeps what you typed, and **Escape** hides the list. Reiimei never replaces a name on its own.
- **Snippets.** Each project has a shared snippet library: save the selected code (or the whole note) under a name, and insert it into any code note in that project. Inserted lines take on the indentation of the line you are on. The list shows snippets for the note's language, with a box to show all.
- **Find and replace** in code notes (**Ctrl+F** or **Find**): matches are highlighted, with match case, whole word, replace one, and replace all (with Undo).
- **Outline** in code notes: functions and classes (Python, JavaScript), headings, ids and scripts (HTML), rules (CSS), statements (SQL), keys (JSON), and elements (XML), each with its line number. Tap one to jump to it.
- Snippets and kept spellings live in one hidden note per project, like Storyboard registers. Two devices that change them at the same time are merged, and a deleted snippet stays deleted. Deleting a project deletes its snippets.

## What changed in v0.11.1

- **Sync fix.** Sync could stop with "JSON.parse: unexpected end of data" when Supabase answered a successful save with an empty reply. Reiimei now accepts that reply. The error text also no longer tells you to re-run the Supabase SQL unless the server really reported a missing column.

## What changed in v0.11.0 (Storyboard mode)

- **Projects.** Storyboard has its own **Projects**, separate from Research. Every Storyboard note lives in one project, gets the project's name as an automatic tag (locked, not counted toward the five-tag limit), and notes with no project go to **Unsorted**. Deleting a project moves its notes to Unsorted and deletes its registers.
- **Scene cards.** A storyboard is one note. Each scene is a card with a title, location, time, characters, a status (Idea, Drafted, Final) and what happens. The **Board** button switches between cards and the same text (each scene is a "## Heading" with Location, Time, Characters and Status lines under it, so everything still works as an ordinary note). Drag cards to reorder, or use the arrows (on a phone). The board shows progress, such as "2 of 5 final".
- **Copy script** gives readable script-style text (SCENE 1: TITLE, location, time, characters, then the scene). Sharing a storyboard as a Word file or web page uses the normal Share tools.
- **Registers.** Each project can have several registers, each for one kind of thing: **Characters, Locations, Items, Settings,** or **Custom** registers you name. A register can be divided into sections. Every entry opens into a **dossier**: other names, a section, facts (label and value, such as Home: Dunmore or Eyes: green) and free dossier notes. Scene cards suggest names from your Characters and Locations registers.
- **Continuity check.** The **Continuity** button compares what your notes say with the facts in your registers, only when you press it. Choose **This note** or **All notes in this project**. Each possible discrepancy shows the register fact beside the note's wording, with **Go to it** (selects the mention in the text), **Update the register** (accept the note's version) and **It is intended** (dismiss it, and it stays dismissed). Anything not in a register is never checked, even if a new character appears in a note.
  - It reads clear statements only: "from X", "born in X", "lives in X", "eyes were X" or "X eyes", "X hair", "N years old", "works as X", and "Label: value" or "Label is value" for any fact label you create. It works on sentences that name the entry (or one of its other names). A sentence that says "she" without the name is not checked, and unusual wording can be missed or occasionally flagged by mistake.
- Registers are stored in a hidden note in each project that never appears in lists, search, tags or counts. If two devices edit registers at the same time, the copies are merged automatically.
- No Supabase change is needed. A story project is stored as a folder named "[Story] Name", so an older version of Reiimei would show that prefix.

## What changed in v0.10.0 (Research mode)

- **Projects.** In Research mode the sidebar shows **Projects** instead of Folders. Every Research note lives in exactly one project. A new Research note goes into the project you are viewing (or the last one you used). The other modes keep their ordinary folders.
- **Automatic project tag.** Each Research note carries its project's name as a tag. You cannot remove it, it follows the project if you rename it, it works as a tag filter across all modes, and it does not count toward the five-tag limit.
- **Unsorted.** Research notes that had no project (older notes with sources, or any note you move into Research) go into a project called **Unsorted**. Deleting a project moves its notes to Unsorted. Moving a note out of Research takes it out of its project.
- **Project library.** In a Research note, **Sources** has a **Project library** section listing the sources used by other notes in the same project. **Add to this note** copies one in. The picker above it can also show another project's sources, and **Import** copies one into this note. Each project keeps its own list, and importing never changes the other project.
- **Reading status and notes on a source.** Each source can be marked To read, Reading, or Done, and carries your own notes. Change the status right in the Sources list.
- **Quote.** Select text in a note, tap **Quote**, pick the source and page, and Reiimei inserts a block quote with the citation. **Save for later** keeps a quote for the whole project, and saved quotes can be inserted into any note in it.
- **Outline.** **Outline** shows a note's headings. Tap one to jump to it, or use the arrows to move a section (with its sub-sections) up or down. Undo is offered after each move. Markdown notes only.
- Quote and Outline appear only on Research notes.
- No Supabase change is needed. A project is stored as a folder whose name starts with "[Project] ", so an older version of Reiimei would show that prefix.

## What changed in v0.9.0

- **Modes.** Four modes: **Notes**, **Research**, **Coding** and **Storyboard**. The switcher sits at the top of the sidebar, and Ctrl+1 to Ctrl+4 jump between them (in a browser tab, Ctrl+1 to 4 may switch browser tabs instead; the installed app does not have that problem). Your last mode is remembered on each device.
- **A mode filters your notes.** All Notes, This device and folders show only the notes of the current mode, with counts to match. **Show all modes**, at the top of the note list, lists every mode together and labels each note with its mode.
- **Search, tags and Recently Deleted cover every mode.** Folders and tags are shared by all modes.
- **Every note has a mode.** New notes start in the mode you are in. Notes written before modes are sorted for you: code notes go to Coding, notes with sources go to Research, everything else goes to Notes. To change one, tap the folder label at the top of the note and choose **Move to another mode** (before v0.14.0 this was the mode menu next to the folder menu). Your other devices follow after sync.
- **A note keeps the tools it needs.** Open a code note from Notes mode and it still shows its code tools.
- This release is the framework. Each mode's own features come next, one mode at a time. Until then the modes differ in what they list, not yet in what they offer.

## What changed in v0.8.0

- **Lists.** Bullet and numbered list buttons (Markdown and Populi notes). Enter continues a list; Enter on an empty item ends it. Tab / Shift+Tab (or the new indent / outdent buttons on a phone) nest items, and numbers renumber themselves. Ctrl+Shift+8 and Ctrl+Shift+7 are shortcuts. List edits can be undone.
- **Settings is a page, not a popup.** The gear opens the settings tab list where the note list normally is, and the options where the note would be. Press Esc, the gear, or any folder to leave. On a phone it moves list, then options.
- **Empty notes are deleted.** A note closed with no content is permanently deleted at once. It never sits blank and never goes to Recently Deleted.
- **Erased-text cache.** If you erase a whole note, its text is kept in one slot shared by all your devices and surviving restarts. The first brand-new empty note you open (on any device) shows **Paste erased text**. Using it clears the slot; opening a separate second new note clears it too. Ctrl+Z can no longer pull erased text into a different note.
- **Copy and paste across notes** works.
- **Tags list** at the bottom of the sidebar (collapsible). Click a tag to see its notes in every folder; click more, up to five, to narrow to notes that have all of them. Chips with × sit above the note list.

Note: a device still on v0.7 would show the hidden cache record in Recently Deleted until it is updated.

## What changed in v0.7.0

- **Sort and show.** The sort icon above the note list (next to Select) opens **Sort and show**. Sort every list by **Last updated**, **Date written**, or **Tag**, newest or oldest first (A to Z or Z to A for tags). A dot on the icon means the view is not the default; **Reset view** puts it back. The choice is saved on each device.
- **Where written.** Every new note remembers the device it was written on. In **All Notes** you can sort by where written, and tick or untick devices to hide or show their notes. When more than one device has written notes, each note shows its device name.
- **"Notes" is now "This device".** Under All Notes, this shows only the notes written on the device you are holding. (Notes that are in no folder are still in All Notes.)
- **Name your devices** in Sort and show. Renaming updates every note written there and syncs to your other devices. On first launch after upgrading, Reiimei asks you to name the device and whether your existing notes were written on it. Answer "Yes, written here" only on the device where you wrote them.

## What changed in v0.6.0

- **Round app icon.** The moon now sits on a circular night-sky badge with transparent corners instead of a square. (iPhone always draws its own rounded square around home-screen icons, so it will show the badge on a dark tile.)
- **Fonts tab.** Settings has a new **Fonts** tab, and the **Aa** button in the editor toolbar opens it directly. Pick a face for headings and the wordmark (Marcellus, Reiimei Display, or Echolume) and a face for note text (Newsreader, Reiimei Display, Echolume, or system sans-serif). All three custom fonts are built in, so they work offline.
- **Reiimei Display font** added (Krowsingre Publishing LLC).
- **Duplicate notes fixed.** A note could be copied ("Conflicted copy") after auto-save when a sync ran while you were typing. Saving, uploading, and downloading now take turns, this device recognises its own uploads, and text typed during a sync is never overwritten. If you already have copies, use Settings › Backup › **Find conflicted copies**.
- **Recently Deleted** now lets you **Restore** a note, **Delete permanently** (one note), or **Empty** the whole folder. Permanent deletion wipes the text on every device.
- **Select several notes.** Tap **Select** above the note list (on a phone you can also press and hold a note; on a laptop, Ctrl-click). Then **Share**, **Delete**, or in Recently Deleted **Restore** or **Delete forever**.
- **Close note.** The **×** at the top of the editor (or the Esc key) closes the open note and shows the Reiimei page. On a phone, the back arrow does this.

## What changed in v0.5.0

- **New app icon:** the frosted crescent moon with its star, on a winter night sky. Android gets a version with extra margin for round icons.
- **Echolume font option.** Settings › Fonts has a heading font and a note font. Echolume is Krowsingre Publishing's capitals and small caps family; it is bundled with the app, so it works offline.
- **Updated definition** on the opening screen.

## What changed in v0.4.1

- In Settings › Sync, the Supabase project URL and key fold into one line once they have worked, showing the project name. Tap **Change** to show them. They fold again after the next successful sign-in, and open by themselves if the URL or key stops working.

## What changed in v0.4.0

- **Code notes.** Set any note to Python, HTML5, or XML. Code is colored as you type, with line numbers, smart Tab and Enter, comment toggling, and Tidy. HTML5 renders as a live page, with its CSS and JavaScript, in a sealed-off frame. XML is checked for errors and shown as a tree. Code blocks in Markdown notes are colored too.
- **Sharing.** Share one note as text (share sheet, email, text message, or copy) or as a file. Share a folder, a tag, a list, or any notes you check, as one combined document with a section per note (Word, web page, Markdown, or text) or as a .zip of separate files.

## What changed in v0.3.0

- **Encryption you can turn on and off.** A passphrase seals every note on the device and before it syncs. Includes a lock screen, auto-lock, passphrase change, and an erase option for a forgotten passphrase.
- **Security hardening.** A content security policy, safe rendering of formatted text, no referrer leaks, and a security checklist in Settings.
- **Markdown and Populi markup.** Each note is set to one or the other, with a formatting toolbar, a preview, and conversion between the two. **Copy for Populi** turns any note into Populi markup.
- **MLA 9 and APA 7.** Add sources (books, chapters, journal articles, web pages), insert in-text citations, and get a Works Cited or References list. Switch a note between MLA and APA at any time without changing what you entered.
- **Papers.** Lay out a note as an MLA paper or an APA student paper, then download a Word file or print or save a PDF.

## What changed in v0.2.2

- All headings are set in small caps: the Reiimei wordmark, list titles, sidebar section labels, dialog and Settings titles, Settings tabs, and the word on the definition screen

## What changed in v0.2.1

- All files now sit in one folder, so they can be uploaded to GitHub from an iPhone in one step

## What changed in v0.2.0

- Renamed from Inkwell to Reiimei
- New look: moonlit blue and frost in light and dark themes, with ivory-gold for tags and pinned notes
- New icon: a reiimei cut open, on a winter night sky
- The definition of reiimei appears when no note is open
- Every font is built into the app and works offline
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
| `ui-writing.js` | Toolbar, preview, conversion, copying, sources, papers |
| `ui-rich.js` | Text notes: formatted editing, kept as Markdown underneath |
| `ui-security.js` | Lock screen and encryption settings |
| `code.js`, `ui-code.js` | Code coloring, editing helpers, tidy, HTML, XML and JSON previews, JavaScript runner |
| `codeintel.js`, `ui-coding.js` | Coding mode: name check, autocomplete, find and replace, outline, snippets |
| `render.html`, `render.js` | The sealed-off frame that renders HTML notes |
| `Echolume-VF.woff2`, `Echolume-Italic-VF.woff2` | Echolume font (variable weight), © Krowsingre Publishing LLC |
| `ReiimeiDisplay-Regular.woff` | Reiimei Display font, © Krowsingre Publishing LLC |
| `share.js`, `ui-share.js` | Sharing as text, combined documents, and archives |
| `format.js` | Markdown and Populi markup engine |
| `cite.js` | MLA 9 and APA 7 citation rules |
| `paper.js`, `zip.js` | Paper layout, Word (.docx) and print output |
| `crypto.js` | Passphrase encryption (PBKDF2 and AES-GCM) |
| `db.js` | On-device database (IndexedDB) |
| `sync.js` | Supabase sync and conflict handling |
| `logger.js` | Rolling log (last 1000 entries) |
| `sw.js` | Service worker: makes the app open offline |
| `manifest.webmanifest` | Install metadata |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-maskable-512.png` | App icons |
| `supabase-setup.sql` | Creates or upgrades the sync tables and security rules |

## 1. Try it on your laptop

PWAs must be served by a web server, not opened by double-clicking. In this folder, run:

```
python -m http.server 8000
```

Then open http://localhost:8000 in Edge or Chrome. Notes work immediately, saved on this laptop only.

## 2. Put it online with GitHub Pages (works from an iPhone)

The iPhone needs an HTTPS address. GitHub Pages hosts the app for free. Only the app's code goes to GitHub; your notes never do.

1. **Unzip on the iPhone.** Save the zip to the Files app, then tap it. Files creates a `Reiimei v0.14.3` folder.
2. **Create the repository.** In Safari, sign in at github.com, tap **+** › **New repository**. Name it `reiimei`, set it to **Public** (free Pages needs a public repository), and tap **Create repository**.
3. **Upload the files.** On the new repository's page, tap **uploading an existing file**. Tap **choose your files**, then **Browse**, open the `Reiimei v0.14.3` folder, tap **Select**, select all 42 files, and tap **Open**. Scroll down and tap **Commit changes**.
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

## Security

**What encryption protects.** With encryption on, each note's text, tags, format, sources, and paper details, and each folder's name, are sealed with AES-256-GCM using a key made from your passphrase (PBKDF2-SHA-256, 600,000 rounds). They are sealed on the device before they are saved, and stay sealed on Supabase. The passphrase and key are never stored or sent anywhere; the key exists only in memory while Reiimei is unlocked.

**What stays readable.** To keep sync working, these are not sealed: which folder a note is in, whether it is pinned or deleted, and when it was created and changed.

**Things to know.**
- If you forget your passphrase, no one can recover the notes. Another unlocked device can turn encryption off and back on with a new passphrase. Otherwise, the lock screen can erase the device so you can start over.
- Changing the passphrase on one device makes the others ask for the new one the next time they sync.
- Backups from **Settings › Backup** are not encrypted. Keep them somewhere private.
- Notes synced before encryption was turned on may remain in Supabase's own backups or logs for a while.
- The security policy only allows sync with addresses ending in `supabase.co` or `supabase.in`. A custom Supabase domain would need a change in `index.html`.

**Checklist.** Settings › Security repeats this list:
1. Turn on two-factor authentication for GitHub. Anyone who could change the app's code could read notes as you type them.
2. Turn on two-factor authentication for Supabase.
3. After creating your sync account, turn off new sign-ups in Supabase (**Authentication › Sign In / Providers › Allow new users to sign up**).
4. Use a unique password for sync.
5. Keep your devices locked with a passcode and up to date.

## Sharing the link

Anyone can open your Reiimei address, but they never see your notes. Notes live in each person's own browser, and synced notes are tied to the account that wrote them. A visitor starts with an empty app. The repository holds only the app's code.

## Writing

**Titles.** Type a title in the line above the tags, or leave it empty to use the text's first line.

**Formats.** Choose Text, Markdown or Populi for each note in the toolbar's **Note** section. Text shows formatting as you write; Markdown and Populi use symbols, with a **Preview**. **Settings › Writing** sets the default for new notes and shows the syntax for both. Converting a note keeps everything both formats share. Markdown features Populi lacks (headings, lists, quotes, code, tables, strikethrough) are kept as plain text, and you are asked first. **Undo** appears right after converting.

**Citations.** Open **Sources** to add what you are citing, then tap **Cite** to insert a citation where your cursor was. Citations are short codes in your text:

| You type | APA 7 | MLA 9 |
|---|---|---|
| `[@smith2019, 42]` | (Smith, 2019, p. 42) | (Smith 42) |
| `[@smith2019, 42-45]` | (Smith, 2019, pp. 42–45) | (Smith 42-45) |
| `[@smith2019, para. 3]` | (Smith, 2019, para. 3) | (Smith, par. 3) |
| `[@smith2019; @lee2020]` | (Lee & Park, 2020; Smith, 2019) | (Smith; Lee and Park) |
| `@lee2020` | Lee and Park (2020) | Lee and Park |

Titles are typed once. Reiimei applies title case for MLA and sentence case for APA. Wrap words that must keep their capitals in braces, like `{Texas}` or `{Erikson}`.

**Papers.** **Paper** formats the note as an APA 7 student paper (title page, page numbers, bold headings, References) or an MLA 9 paper (heading block, last name and page number, Works Cited). The note's headings become paper headings. **Download Word file** gives a .docx for Word, Google Docs, or Pages. On iPhone it opens the share sheet, where **Save to Files** works. **Print or save PDF** works too, but iPhone may leave out page numbers, so use the Word file for submissions.

## Code

Choose **Python**, **HTML5**, **XML**, **JavaScript**, **CSS**, **JSON**, or **SQL** from **Format** in the toolbar's **Note** section (or make one the default in **Settings › Writing**). Switching between writing and code never changes the text; **Undo** appears right after.

- **Tab** and **Shift+Tab** indent and outdent. **Enter** keeps the indentation, adds a level after a Python line ending in `:` or an opening HTML/XML tag, and drops a level after `return`, `pass`, `break`, `continue`, or `raise`.
- **Ctrl+/** (or **Comment**) comments or uncomments the selected lines.
- **Tidy** fixes indentation: Python tabs become 4 spaces and trailing spaces go; HTML and XML lines are re-indented by tag nesting. Text inside `<pre>`, `<script>`, `<style>`, and `<textarea>` is left alone. Undo is offered.
- **Render** (HTML5) runs the page with its CSS and JavaScript. It runs in a sealed-off frame with its own origin, so the page cannot read your notes, Reiimei's storage, or the app. It works offline after the first online launch.
- **Check** (XML) reports whether the XML is well formed, shows the line with the problem, or shows the document as a collapsible tree.
- **Run** (JavaScript) runs the code in the sealed frame and shows `console.log` output.
- **Check** (JSON) validates and pretty prints. CSS and SQL are colored and tidied; they have no preview.
- Python is colored and indented but does not run; running Python in the browser needs a large add-on that could be added later.
- Coding mode adds Find, Snippets, Outline, the name check and autocomplete; see "What changed in v0.12.0".
- The note list titles code notes by the HTML `<title>`, or the first comment line.
- In Markdown notes, fenced code blocks such as ```` ```python ```` are colored in Preview.

## Sharing

- **One note:** **⋯** › **Share** at the top of the note. **Send as text** offers the share sheet, Email, Text message, and Copy, in plain text, Markdown, or Populi markup. **Send as a file** offers Word, web page, Markdown, or text, and code notes can be sent as their own .py, .html, or .xml file.
- **Several notes:** the share button above the note list shares the list you are looking at (All Notes, a folder, a tag, or search results). Uncheck any notes you want to leave out. A folder's **⋯** menu also has **Share folder**.
- **One document** puts every note in its own section with its title, folder, tags, and date. Word files start each note on a new page. Web pages include a table of contents.
- **Separate files (.zip)** keeps your folders and saves each note as its own file: Markdown notes as .md, Populi notes as .txt with Populi markup, and code notes as .py, .html, or .xml. A Contents.txt lists everything.
- Citations are filled in, and each note's reference list is included.
- **Share file…** opens the share sheet, where Mail, Messages, and Save to Files can take the file. Where a browser cannot share files (most Windows browsers), use **Download** and attach the file to an email.
- Shared copies are not encrypted, even when encryption is on.

## Updating the app

On GitHub, open the repository › **Add file** › **Upload files**, choose only the changed files, and tap **Commit changes**. Files with the same name replace the old ones. Within a minute or two, Pages republishes.


The service worker caches the app files. When you change any file, bump `VERSION` in `sw.js` (and `APP_VERSION` in `app.js`), then upload. Devices pick up the new version the next time the app is opened online, and use it from the following launch.

## Troubleshooting

- **Settings › Diagnostics** shows whether storage, offline support, and sync are working, with a plain-language reason when something isn't.
- **Settings › Log** › Download gives a text log of everything the app did, including sync results and errors.
- **"Test connection"** in Settings › Sync confirms the URL, key, sign-in, and tables are all correct.

## Known limits in v0.14.3

- Images can be linked but not attached
- Sources belong to one note; there is no shared library yet
- Citation types: books, chapters, journal articles, and web pages
- Python code is not run
- The name check does not read other files outside Reiimei, so a name from a library you import can look undefined if it is close to one of yours; use **Keep my spelling**
- The name check and autocomplete do not cover XML or JSON
- Email and text-message links carry text only; to attach a file, use Share file… or Download
- Folders are one level deep
- Recently Deleted is never emptied automatically; empty it yourself when you like
- The first launch needs a connection for the fonts; until then the app uses similar system fonts
