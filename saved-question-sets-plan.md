# Saved Question Sets Plan

Branch: `ft-saved-question-sets`

## Context
Boards can only be loaded from a JSON file each time the game starts. The Board Creator (`creator/index.html`) can edit a board, but nothing links to it, it saves nothing between visits, and it still has Jeopardy-era fields.

This work lets a Table Topics Master create named question sets, keep them in the browser, play them from the game's load screen, and move them between browsers with export/import.

## Decisions
- **Set:** a complete, named board in the current JSON format.
- **Editor:** rework the existing creator and link it from the game.
- **Deployment:** hosted static site. The game and creator share localStorage, and sets stay in the user's own browser.
- **Editable fields:** category names, question text, Daily Double, and the final round (category and question).
- **Limits:** 6 categories, 5 questions per category.
- **Out of scope:** `host.html`, `js/jeopardy-host.js`, the Bootstrap 5 upgrade, themes, and the Daily Double prize redesign.

## Data Formats

### Stored data
Key: `toastmasters-jeopardy:sets`. The prefix matters because sites on a shared origin, such as GitHub Pages project sites under one account, share localStorage.

```json
{
  "version": 1,
  "sets": [
    { "id": "uuid", "name": "Cars", "updatedAt": "2026-10-30T12:00:00.000Z", "board": {} }
  ]
}
```

### Single-set export
A plain board file, exactly the current format. The game can load it directly. The set name comes from the filename on import, e.g. `cars.json` becomes "cars".

### Export-all backup
```json
{
  "type": "table-topics-backup",
  "version": 1,
  "exportedAt": "2026-10-30T12:00:00.000Z",
  "sets": [{ "name": "Cars", "board": {} }]
}
```

### Unedited data is preserved
Older boards can contain `double-jeopardy` rounds, `image`, `answer`, and custom `value` fields. The editor doesn't show these but keeps them when saving, and the game still plays them.

## Validation
Both are in the shared store module, because both pages need them.

**Structural (`validateBoard`)** decides whether a file can be imported or a board can be opened:
- `jeopardy` is an array of categories, each with a string `name` and a `questions` array
- each question has a string `question`
- `double-jeopardy`, if present, has the same shape
- `final-jeopardy` is an object
- `image`, if present, is a string

**Playability (`playabilityIssues`)** decides whether an autosaved draft can be played:
- at least one category has at least one question
- no category is empty, and no question or category name is blank
- the final round has a category and question

The game crashes on a board with no `final-jeopardy` object (`loadBoard` reads `currentBoard['image']` on `undefined`), so this check must block that case.

Boards over the 6 x 5 limit still import and play, because the limit only stops the editor adding more.

## Steps

### Step 1: Shared store (`js/sets-store.js`, new)
Plain script exposing a `SetsStore` global, loaded by both pages.
- CRUD: `list`, `get`, `create`, `update`, `rename`, `duplicate`, `remove`
- Re-read storage before every write, so a second open tab doesn't overwrite other sets
- Handle unavailable storage, full storage, and corrupt data with a returned error rather than an exception. Corrupt data is never overwritten automatically.
- `validateBoard`, `playabilityIssues`, `parseImport` (detects single board or backup), `uniqueName` ("Cars (2)")
- `exportSet`, `exportAll`, plus a download helper based on the current logic in `creator.js`

### Step 2: Fix unsafe rendering in the game (`js/jeopardy.js`)
Imported files can now be saved and replayed, and the game builds HTML from board text. A malicious shared board could run script on the site's origin and read every saved set.
- Escape category names, values, and final round text in `loadBoard`
- Render images in `showClue` and `loadBoard` through element attributes rather than the unquoted `<img src=...>` string, and accept only `http(s):`, `data:image/`, and relative paths

### Step 3: Game load screen (`index.html`, `js/jeopardy.js`)
- Extract a shared `startGame(data)` from the file reader callback
- List saved sets at the top of `#game-load-modal`, most recently edited first, each with a **Play** button
- Disable **Play** on incomplete sets and show the reason
- Keep the file picker for one-off boards
- Show bad JSON, invalid boards, and backup files in `#game-load-error`. Bad JSON currently throws an uncaught exception from `$.parseJSON`. A backup gets a message directing the user to the creator.
- Add a **Manage question sets** link to `creator/index.html`
- Show an empty state when no sets exist

### Step 4: Set management in the creator (`creator/index.html`, `creator/creator.js`, `css/creator.css`)
- Replace the "Load JSON" flow with a set library: **New**, **Rename**, **Duplicate**, **Delete** (with confirmation), **Export**
- Add **Export all** and **Import**
- Open the most recent set by `?set=<id>`, so a refresh stays on the same set
- Autosave with a short debounce, and flush when the modal closes and on `pagehide`. Show a "Saved" or error status in the toolbar.
- Add a **Back to game** link

### Step 5: Rework the editor for Table Topics (`creator/index.html`, `creator/creator.js`, `css/creator.css`)
- Remove the Double Jeopardy section from the UI, and show a note when a set contains a preserved second round
- Remove the answer, point value, and image inputs from the modal and final round
- Remove the JavaScript uppercase conversion, and review the `text-transform` rules in `css/creator.css` so inputs show text as typed
- Show a shortened question in each tile, since the tile's dollar value no longer tells questions apart
- Keep Daily Double and its tile badge
- Assign values as row x 100, matching `board.json`. When a question is added or deleted, renumber that category only. Untouched categories keep their existing values.
- Replace the "ENTER YOUR QUESTION HERE." default text with an empty question and placeholder
- Keep the 6 x 5 limits, and add a hint that 4 categories with 4-5 questions usually suits a meeting

### Step 6: Import flow (`creator/creator.js`, `creator/index.html`)
- Allow selecting multiple files. Each file's result is reported, so one bad file doesn't stop the others.
- **Single-set file:** imports immediately, and name clashes are saved as "Name (2)"
- **Backup file:** shows a checklist of its sets
  - All valid sets are ticked by default, with **Select all** and **Select none**
  - Invalid sets are shown unticked and disabled, with the reason
  - Name clashes are flagged and saved as copies
  - The confirm button shows the count, e.g. **Import 3 sets**
- Nothing is ever overwritten by an import
- Report a full-storage failure and which sets were not saved

### Step 7: Docs (`Readme.md`, `TODO.md`)
- Describe saved sets, the editor, export/import, and that sets live only in the current browser
- Recommend **Export all** as a backup
- Update the installation section for hosting

## Files
| File | Change |
|------|--------|
| `js/sets-store.js` | New: storage, validation, import/export |
| `js/jeopardy.js` | `startGame`, saved set list, error handling, escaping |
| `index.html` | Set list, creator link, store script |
| `creator/creator.js` | Set library, autosave, import flow, field changes |
| `creator/index.html` | Library UI, import modal, removed fields |
| `css/creator.css` | Library and checklist styles, uppercase review |
| `css/jeopardy.css` | Saved set list styles |
| `Readme.md` | Usage docs |

## Verification
The repo has no test framework, and this plan doesn't add one. Test in Chrome and Firefox against a local static server (`python3 -m http.server`).

**Sets and editing**
- [ ] Create, rename, duplicate, and delete a set, and confirm that changes survive a refresh
- [ ] Edit, then immediately refresh: the edit is kept
- [ ] The 6 category and 5 question limits are enforced
- [ ] Adding and deleting questions renumbers only that category

**Playing**
- [ ] A saved set plays through to the final round, and **New Game** returns to the load screen
- [ ] Incomplete sets can't be played, and the reason is shown
- [ ] `board.json` and `table-topics/board_cars.json` still load through the file picker
- [ ] Bad JSON and backup files show a message in the file picker, not a crash

**Export and import**
- [ ] A set round-trips through export and import unchanged
- [ ] A board with a second round, images, and answers keeps them after edit and save, and the second round still plays
- [ ] Backup checklist: select all, select none, partial selection, invalid sets, and name clashes all behave as described
- [ ] Importing several files with one bad file imports the good ones and reports the bad one

**Failure cases**
- [ ] A board with `<img src=x onerror=alert(1)>` in its text, category, and image fields shows inert text and runs no script
- [ ] Full storage shows an error and keeps the editor's contents
- [ ] Corrupt stored data shows an error and isn't overwritten
- [ ] Two open tabs editing different sets don't overwrite each other
