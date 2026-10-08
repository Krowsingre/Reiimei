# Reiimei v0.17.2

*reiimei* (REE-h-may), n. The cold, luminous stillness peculiar to a clear winter night; especially the effect of moonlight upon frost, illuminating the night without dispelling it.

An offline-first notes app for Windows and iPhone, built as a Progressive Web App (PWA). No Mac, no App Store, no developer fee.

## What changed in v0.17.2

- **Title & Tags and Formatting are named in the header row** (computer), beside the folder name, which frees a whole row. Click one to open it below the header; opening one folds the other. Focus works as before.
- **One List button.** Each press steps through bullets, numbers, a checklist and back to plain text (Markdown and Populi notes too; Populi has no checklist). Inside a longer list only the chosen lines change. **Ctrl+Shift+8** and **Ctrl+Shift+7** still go straight to bullets and numbers. Moving items in and out sits in the same box.
- **Insert is one menu** (computer): **Add ▾** offers Quote, Code, Link and Sources (and Quote a source in Research). **Paper** moved to **Tools**. On a phone the Insert sheet is unchanged.
- **A shorter toolbar.** Format and Font are narrower, and **Options** (Brackets, Copy [ ], Case, Spacing) sits beside them on the same row; each still folds by itself. In a narrow window Options moves below.
- **On a phone**, the modes are one drop-down at the top of the home page (with All modes), in place of the four buttons and Show all modes, and the **Note** sheet names its two parts: Format & Font, and Options.
- **A phone checklist** (below, *Checking a new version on a phone*) lists what to try on an iPhone after each update.
- Still 90 files. No Supabase changes.
- **Upload these files** (changed since v0.17.1): `app.js`, `index.html`, `styles.css`, `sw.js`, `ui-rich.js`, `ui-writing.js`, `README.md`.

## What changed in v0.17.1

- **Versions.** **⋯ › Versions…** lists earlier copies of the note: one every few minutes while you write, one when you leave the note, one before a sync replaces its text, and one before you restore an older version. Choose one to see it, then **Restore this version**; the current text is kept as a version first, and Undo takes the restore back. The newest 30 versions of each note are kept on this device (sealed when encryption is on); they are not synced.
- **Nothing typed is lost when the app closes.** Every change to the open note is also written straight away to this device's quick storage. If the app is closed, reloaded or crashes before the note is saved, the text is put back the next time Reiimei starts, with a message and Undo.
- **A beta copy can sit beside the live app.** Served from a folder with "beta" in its name (for example `yourname.github.io/reiimei-beta/`), Reiimei keeps its own notes, settings, sign-in and offline copy on each device, shows **Beta** next to its name and in **Settings › About**, and calls itself Reiimei Beta. It never touches the live app's notes on that device; the two meet only through sync. See **Trying a new version first (beta copy)** below.
- Two new files, `channel.js` and `versions.js`: 90 files now. No Supabase changes.
- **Upload these files** (changed since v0.17.0): `app.js`, `boot.js`, `channel.js` (new), `db.js`, `index.html`, `logger.js`, `styles.css`, `sw.js`, `sync.js`, `versions.js` (new), `README.md`.

## What changed in v0.17.0

- **One Undo for everything.** Every change to a note can now be undone and redone the same way: typing, pasting, cutting, the formatting buttons, Aa, fonts, line spacing and Brackets. Use **Ctrl+Z** to undo and **Ctrl+Y** or **Ctrl+Shift+Z** to redo (Cmd on a Mac), the new **↶ Undo** and **↷ Redo** buttons at the start of the toolbar (in the **Text** sheet on a phone), or the phone's own Undo (shake, or swipe left with three fingers). Typing without a pause is undone as one step, as in a word processor; everything else is a step of its own, and the cursor goes back to where the change was. Each note keeps its own history while Reiimei is open, so Undo never reaches into another note. Before, cutting, Aa and pasting several lines could not be undone with Ctrl+Z.
- **Holding Delete** keeps deleting, as it should; this was checked and Reiimei does not get in its way.
- One new file, `history.js`: 88 files now. No Supabase changes.
- **Upload these files** (changed since v0.16.7): `app.js`, `history.js` (new), `index.html`, `sw.js`, `ui-rich.js`, `README.md`.

## What changed in v0.16.7

- **The formatting chips no longer cover the text (phone).** The row of chips at the foot of a note (Text, Paragraph, Insert, Tools, Note) could sit on top of the line you were typing, with the text showing through. The chips are now always drawn in front of the note, and the note scrolls so the line with the cursor stays fully above the chips, as well as above the keyboard, while you type, dictate or tap a line.
- Includes everything in v0.16.6. Still 87 files. No Supabase changes.

## What changed in v0.16.6

- **Dictation no longer writes words twice (phone).** Speaking into a note could show the first word, then write the whole sentence again when the microphone was switched off ("thethe quick brown dog"). In an empty line, Reiimei put the cursor just after the invisible mark that holds the line open, and words being formed from there go wrong (on a computer the same thing left a stray letter). The cursor now goes before it. Reiimei also leaves the text box alone while you type or dictate (it used to touch it when saving and syncing in the background), and never redraws the note while words are still being formed.
- **The note follows the cursor above the keyboard (phone).** When typing or dictating takes the cursor below the keyboard, the note now scrolls so the line you are on stays in view.
- **A Shift+Enter at the end of a line is kept.** A line break at the end of a line, followed by Enter, leaves an empty line. That empty line was being lost when the note was saved, so it disappeared once the note was shown again (after a sync, on your other device, or after reopening). It is now kept. Line breaks in the middle of a line, blank lines and copying and pasting work as before.
- Still 87 files. No Supabase changes.

## What changed in v0.16.5

- **Modes in one drop-down (computer).** Notes, Research, Coding and Storyboard are now one drop-down at the top of the sidebar, with the number of notes in each. Its last choice, **All modes**, lists the notes from every mode and takes the place of the **Show all modes** button. Ctrl+1 to Ctrl+4 still switch modes. When the sidebar is folded to icons, and on a phone, the mode buttons stay as they were.
- **Title & Tags, then Formatting (computer).** The note header has two parts now: **Title & Tags**, which open and close together, and **Formatting** beneath them. One opens at a time: opening one folds the other. Both can be folded, and then their names sit side by side. Each device remembers which one is open.
- **Formatting in three rows (computer).** **Buttons** (Text, Headings, Lists, Indent, Insert and Tools), then **Format & Font**, then **Options** (Brackets, Copy [ ], Case and Spacing). Each row folds to its name by itself, and folded rows sit side by side. Format and Font are now boxes like the button groups, and each folds to its name the same way. The phone keeps its layout.
- Still 87 files. No Supabase changes.

## What changed in v0.16.4

- **Copy with or without the [labels].** When **Brackets** is on, a small **Copy [ ]** tick appears beside it. Ticked (the usual), copying and pasting keep the labels. Unticked, copying, cutting and **Tools › Copy** leave the [labels] out, and so does pasting into the note; a line that held only a label goes with it, and the blank lines you typed stay. The tick belongs to this device.
- **Aa (capitals).** On the same row as Format, Font, Brackets and Spacing. If the text is not properly capitalized, Aa gives every line and every sentence a capital first letter and makes "i" into "I" (I'm, I'll…), changing nothing else. If it already is, Aa makes everything lowercase. It works on the selected words, or on the whole note when nothing is selected, and Undo (in the message, or Ctrl+Z in Markdown notes) puts it back. [Labels], citations, links, web addresses, font marks, code and words like iPhone are left as they are.
- One new file, `capitals.js`: 87 files now. No Supabase changes.

## What changed in v0.16.3

- **The Reiimei page on a phone is centred.** Each line (the word, how to say it, the definition, the example and "Click here to get started.") is centred across the screen instead of starting at the left. The spacing from top to bottom is unchanged.
- Still 86 files. No Supabase changes.

## What changed in v0.16.2

- **A Text note is written line by line.** Each Enter starts a new line right under the last one, without the gap that used to follow every line, so a blank line in the note is one you typed. Copying matches it: pasted elsewhere, each line arrives as a line, and only your blank lines are blank (v0.15.2 turned the old gap into a blank line, which put an extra line break between every line). Pasting into a note works the same way in reverse.
- **Line spacing starts at 1.** Spacing now counts line spacing as a word processor does: 1 is single spacing (the new default), 1.5 is one and a half, 2 is double. If you had set a line spacing before, check it once in Spacing.
- **The Reiimei page spacing, on every browser.** The definition sits as one centred block in the upper middle of the page, and "Click here to get started." sits well below it, near the bottom of a phone screen. (The earlier layout relied on something older iPhone browsers do not do, so there the line sat right under the example sentence.)
- Still 86 files. No Supabase changes.

## What changed in v0.16.1

- **Focus uses the whole width.** In Focus the note now keeps its usual layout, just wider: the folder name and the text start at the left, the Focus and **⋯** buttons sit at the far right, and folded Title, Tags and Formatting line up side by side on one line. (v0.16.0 put everything in a narrow column in the middle.)
- Still 86 files. No Supabase changes.

## What changed in v0.16.0

- **Focus (computer).** The new button next to a note's **⋯** (or **Ctrl+Shift+F**) lets the note fill the whole window: the sidebar and the note list step aside, and the note keeps its usual layout across the whole width. The same button, **Esc** or Ctrl+Shift+F brings everything back exactly as it was, with your place in the note kept. It is not the browser's full screen, and Reiimei always opens with it off.
- **A narrower note list (computer).** Drag the right edge of the note list to make it narrower, down to about an inch; its usual width is the widest. Double-click the edge to put it back, or use the arrow keys on it. When it is narrow the list shows just the titles, and **Sort and show**, **Select** and **Share** move into a **⋯** menu. Each device remembers the width.
- **Spacing.** **Spacing** in a note's toolbar (next to Format and Font) sets the note's line height, the space between letters and the space between words, with sliders, and **Use the defaults** to go back. The defaults for every note are in **Settings › Fonts & Styles › Spacing**. Spacing applies to the whole note.
- **Brackets, for lyrics and any writing in sections.** Turn on **Brackets** next to Format and Font, and every [label] in the note, such as [Verse 1], [Chorus] or [Refrain], shows as a note in the background: muted, on a soft tint. You still type in it like any other text, and copying, sharing and exports keep the brackets as they are. Citations ([@smith2020, 42]), links, checklist boxes and font marks are never treated as labels. Brackets is set for each note (and syncs with it); **Settings › Formatting › Brackets** turns it on for new notes. It works in Text and Markdown notes, and in Preview.
- **Fold away what you are not using (computer).** **Title**, **Tags** and **Formatting** each have a small heading with a chevron above them: click it to fold that part down to just its name, and folded parts sit side by side. Each group of formatting buttons (Text, Headings, Lists and the rest) folds too: click its name and only the name stays, in a box just as wide as the name. Each device remembers what you folded.
- **Blank lines made with line breaks are kept.** v0.15.2 kept a blank line made by pressing Enter twice. A blank line made of two line breaks in one paragraph (Shift+Enter twice, typing on an iPhone, or pasted text) was still being lost when the note was saved. It is now kept too, and stays after closing and reopening the note, after updating, and in copies.
- One new file, `brackets.js`: 86 files now. No Supabase changes.

## What changed in v0.15.2

- **Copying from a Text note keeps its line spacing.** Copy and Cut now put the text on the clipboard themselves. Pasted as plain text (Notes, Messages, Notepad, an email), each paragraph is followed by one blank line, as it looks in Reiimei, and every extra blank line you typed is kept; list items stay one per line with their bullets or numbers, and checklists show [ ] and [x]. Pasted into Word, Google Docs, Pages or Populi, paragraphs and blank lines arrive as real paragraphs. Fonts set on selected words are left out. **Tools › Copy › Copy as plain text** spaces the text the same way.
- **Blank lines you type are kept.** Before, an empty line between paragraphs in a Text note disappeared the next time the note was opened. It is now saved (as `&nbsp;`, the usual Markdown way to write an empty paragraph), so it stays in the note, in sharing and in copies.
- **Pasting text into a Text note keeps its blank lines too:** one blank line between lines becomes the normal gap between paragraphs, and more than one is kept.
- Still 85 files. No Supabase changes.

## What changed in v0.15.1

- **Settings › Fonts & Styles and Formatting are laid out properly.** Each page has headed groups of rows (the setting's name on the left, the choice on the right, a short line of help under it). Fonts & Styles: **Interface** (Interface font, from every installed font) and **Editor fonts**, which brings the old Fonts to offer and Font for new notes together: tick the fonts a note's Font menu offers (a card for each font pack, each name shown in its own face), and choose the **Default** that new notes start in, from the ticked fonts only. Untick the default and the first ticked font becomes the default (you are told). Formatting: **New notes** (Format, Citation style) and **Reference** (Markdown, Populi and citation cards).
- **Fixed: the font list in Settings could be empty, and the new-note font could list only one font, on the first launch after an update.** That launch can get the new page with the previous version's scripts. Reiimei now notices this and reloads once, by itself, as soon as the new version is ready, so the page and its scripts always match. The list is also redrawn every time you open Fonts & Styles.
- One new file, `boot.js`: 85 files now. No Supabase changes.

## What changed in v0.15.0

- **Subfolders (Notes mode).** A folder can hold subfolders, one level deep. Open a folder's **⋯** menu and choose **New subfolder…**. Subfolders are listed under their folder, which gets its own chevron to show or hide them. **Move to…** in a folder's menu puts it inside another folder or back at the top (a folder that has subfolders stays at the top). In a note's folder list, subfolders appear under their folder.
  Deleting never loses notes: a subfolder's notes go to the folder it was in; a folder's own notes go to Notes and its subfolders move to the top level with their notes. You are asked first.
  Subfolders need no Supabase changes: like projects, a subfolder is marked in its name. A device still on an older version shows that mark (such as "[In 1f2e…] Receipts") as part of the folder's name until it is updated.
- **Folders heading.** **Folders** can be shown or hidden with a chevron, like **Tags**, and the **+** next to it makes a new folder (it replaces **New**).
- **A narrower sidebar on a computer.** The button next to the Reiimei name folds the sidebar to a rail of icons (modes as their first letter, your lists and folders as icons, with their names when you point at them). Press it again to open it. Each device remembers.
- **The toolbar stays on one line on a computer.** If the groups would not fit (a wide interface font or a narrow window), the whole toolbar is drawn smaller, down to half size, instead of wrapping.
- **Note text lines up** with the title and the tags on a computer, instead of starting further in. Lines still stop at a comfortable length.
- **The Reiimei page** keeps its text centred as one block, with the definition higher up and "Click here to get started." lower down. On a computer the splash shows the definition alone, centred.
- **The Reiimei name** at the top of the folder list now uses the interface font. The definition page stays in Reiimei Display.
- **Settings › Writing is now two sections.** **Fonts & Styles** has the interface font, a new **Font for new notes**, and **Fonts to offer**: tick or untick each font (with All and None for each pack: Reiimei, Ilunir, and the device's own) to choose which appear in each note's Font menu and in the lists. At least one font always stays, and a font a note already uses is kept (marked "hidden" in its menu). These choices belong to the device. **Formatting** has the rest: the format and citation style for new notes, and the Markdown and Populi cheat sheets.
- **Formatting and fonts follow the selection (Text notes).** With words selected, bold, italic, underline, strikethrough, highlight, superscript, subscript and code change only those words; with nothing selected, they change the whole note. Headings, lists, checklists, quotes and moving list items in and out change the paragraphs the selection touches, or the paragraph you are in. The **Font** menu with words selected sets the font of those words only; with nothing selected it sets the note's font, as before.
  A font on selected words is kept as a small mark in the note's text (`[[f:flow]]words[[/f]]`). It shows in the note and in Preview, and switching between Text and Markdown keeps it (in Markdown you see the mark). Sharing, Copy, papers and Word files keep the words but not their font. Converting to Populi asks first, because Populi cannot keep it. In Markdown notes the Font menu also marks selected words; Populi notes have one font for the whole note.
- Still 84 files. No Supabase changes.

## What changed in v0.14.6

- **Ilunir replaces Lunarian.** The Ilunir family (Flow, Flow New Moon, Flow Eclipse, Flow Codex and Flow Sigil in seven styles each, plus Moonlit Hand, Cipher Hand, Chancery, Earthshine, Phase Line and Codex Capitals) takes the Lunarian fonts' place in each note's Font menu and in Settings › Writing › Interface font. Notes and settings that used a Lunarian font now show the matching Ilunir font. The Lunarian files are gone.
- **Echolume is the interface font.** Menus, lists, settings and buttons use Echolume unless you choose another in Settings › Writing › Interface font (a choice you made before is kept). The Reiimei name and the definition page stay in Reiimei Display, and new notes still start in Reiimei Display.
- Still 84 files (41 Ilunir fonts in place of 41 Lunarian fonts). Upload them all, and delete the old `Lunarian*.woff` files from the repository if you like; nothing uses them now. No Supabase changes.

## What changed in v0.14.5

- **Lunarian fonts v1.1.** Two new families, **Lunarian Flow New Moon** (faceted sigil forms) and **Lunarian Flow Eclipse** (swashes and tails), each in Thin, Regular, Bold, ExtraBold, Thin Italic, Italic and Bold Italic. They are in each note's Font menu and in Settings › Writing › Interface font, next to Lunarian Flow. Lunarian Flow Sigil is updated to v1.1. The other Lunarian fonts are unchanged.
- 14 new font files: 84 files now. No Supabase changes.

## What changed in v0.14.4

- **The Lunarian fonts are built in.** Lunarian Flow, Flow Codex and Flow Sigil (each in Thin, Regular, Bold, ExtraBold, Thin Italic, Italic and Bold Italic), and Moonlit Hand, Cipher Hand, Chancery, Earthshine, Phase Line and Codex Capitals. They are in each note's **Font** menu, after Reiimei Display and Echolume, and work offline. Lunarian covers Latin-1 accented letters but not ® ™ € £ § ¶ · × ÷; those characters are drawn in Reiimei Display.
- **Interface font.** **Settings › Writing › Interface font** sets the font for menus, lists, settings and buttons. It starts as Reiimei Display. The Reiimei name and the definition page always use Reiimei Display, and each note keeps its own Font. The choice belongs to this device, like the other settings.
- **Swipes changed.** Swipe a note left to show **Delete**, or all the way left to delete it (with Undo). Swipe right to show **Pin** and **Share**, or all the way right to pin it. In Recently Deleted, right is **Restore** and left is **Delete** forever (you are asked first). Swiping in from the left edge still goes back a screen, except when you start on a note in the list, where it swipes the note.
- 28 new files (27 fonts and `fonts.js`): 70 files now. No Supabase changes.

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
| `ReiimeiDisplay-*.woff` | Reiimei Display font (six styles), © Krowsingre Publishing LLC |
| `Ilunir*.woff` | Ilunir fonts (41 files), © Krowsingre Publishing LLC |
| `fonts.js` | The list of fonts for the Font menu and the interface font setting |
| `capitals.js` | The Aa button: capitals at the start of lines and sentences, or all lowercase |
| `history.js` | One Undo and Redo for every change to a note: text, formatting, fonts, spacing and Brackets |
| `versions.js` | Versions: earlier copies of each note, kept on this device, with Restore |
| `channel.js` | Tells the live app from a beta copy, so each keeps its own notes and settings on a device |
| `brackets.js` | Brackets: [section labels] shown as notes in the background |
| `boot.js` | Start-up check: reloads once if an update left the page and its scripts on different versions |
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

1. **Unzip on the iPhone.** Save the zip to the Files app, then tap it. Files creates a `Reiimei v0.17.2` folder.
2. **Create the repository.** In Safari, sign in at github.com, tap **+** › **New repository**. Name it `reiimei`, set it to **Public** (free Pages needs a public repository), and tap **Create repository**.
3. **Upload the files.** On the new repository's page, tap **uploading an existing file**. Tap **choose your files**, then **Browse**, open the `Reiimei v0.17.2` folder, tap **Select**, select all 90 files, and tap **Open**. Scroll down and tap **Commit changes**.
   - If you don't see the upload link, tap the **aA** button in Safari's address bar › **Request Desktop Website** and try again.
4. **Turn on Pages.** In the repository, open **Settings** › **Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main** and **/ (root)**, then tap **Save**.
5. **Wait a minute or two**, then reload the Pages screen. It shows your address, which looks like `https://yourname.github.io/reiimei/`.

On a laptop, Netlify Drop (app.netlify.com/drop) is another option: drag the folder onto the page.


## Checking a new version on a phone

Chrome on a computer can only imitate an iPhone, so after each update try these on the phone itself (a minute or two):

1. **It updated.** Settings › About shows the new version (open the app twice if it still shows the old one).
2. **Typing.** In a new note, type a few lines past the bottom of the screen: the line you are on stays above the keyboard and above the formatting chips, and the chips never cover the text.
3. **Dictation.** Dictate a sentence into a new note: the words appear as you speak, and switching the microphone off leaves one copy, not two.
4. **Holding Delete** keeps deleting, faster the longer you hold it.
5. **Undo.** Shake the phone (or swipe left with three fingers) to undo what you typed; Undo and Redo are also in the **Text** sheet.
6. **Line breaks.** A blank line typed with Return twice is still there after closing and reopening the note, and after a sync.
7. **The layout.** The mode drop-down is at the top of the home page; the **Note** sheet shows Format & Font, then Options; **Insert** opens its own sheet; the List button steps bullets → numbers → checklist → none.
8. **Sync.** A change made on the phone shows on the computer, and the other way round.

Anything that looks wrong: a screenshot and the step number is all that is needed.

## Trying a new version first (beta copy)

A beta copy is a second Reiimei, at its own address, for trying a new version before it replaces the live app. It uses the same Supabase project; nothing needs setting up in Supabase.

1. **Make a second repository.** On github.com tap **+** › **New repository**, name it `reiimei-beta` (the name must contain "beta"), set it to **Public**, and create it.
2. **Upload the new version** into it, as in step 3 of *Put it online*: all the files of the new folder.
3. **Turn on Pages** for it, as in step 4. Its address is `https://yourname.github.io/reiimei-beta/`.
4. **Open it** in Safari. It says **Beta** next to its name. It starts empty: its notes, settings and sign-in are its own.
5. **Sync.** In **Settings › Sync**, enter the same Supabase URL and key as the live app.
   - Sign in with **the same account** to try the new version with your real notes. Whatever the beta changes reaches the live app through sync, so only do this once you trust the version.
   - Or sign up with **a second email address** to try it with test notes that never reach your real ones (each account only ever sees its own notes).
6. **Add it to the Home Screen** (Share › **Add to Home Screen**), named **Reiimei Beta**. It is a separate app from the live one.
7. **Promote it.** When the beta has proved itself, upload the same files to the live `reiimei` repository (the "Upload these files" list in *What changed*). Then upload the next version to the beta first.

The live app and the beta copy never share notes on a device; they only meet through sync. An older live app (v0.17.0 or earlier) may clear the beta's offline copy once when it updates; the beta simply downloads it again.

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

## Known limits in v0.17.2

- Images can be linked but not attached
- Sources belong to one note; there is no shared library yet
- Citation types: books, chapters, journal articles, and web pages
- Python code is not run
- The name check does not read other files outside Reiimei, so a name from a library you import can look undefined if it is close to one of yours; use **Keep my spelling**
- The name check and autocomplete do not cover XML or JSON
- Email and text-message links carry text only; to attach a file, use Share file… or Download
- Folders go one level deep: a folder in Notes can hold subfolders, but a subfolder cannot
- Recently Deleted is never emptied automatically; empty it yourself when you like
- The first launch needs a connection for the fonts; until then the app uses similar system fonts
