# Double Check

A local-first workspace for double coding role-play dialogues. Select complete utterances, create an action, choose one label, and give that occurrence a score from 1 to 3.

**Website:** https://chnln.github.io/dawn-double-code/

**Private source repository:** https://github.com/chnln/dawn-double-code

The app is self-contained in this directory. It uses a static HTML/CSS/JavaScript frontend and a zero-dependency Python server managed by **uv**. GitHub Pages serves the same frontend without Python.

## Run locally

Install [uv](https://docs.astral.sh/uv/), then run inside this folder:

```sh
uv sync --locked
uv run serve.py
```

Open **http://127.0.0.1:8765**. To load a local collection of case folders automatically:

```sh
uv run serve.py --data ../second_coder_sample
# Or any other directory:
uv run serve.py --data /absolute/path/to/your/cases --port 8765
```

The server binds to `127.0.0.1` only. It serves only `site/`, with `/api/cases` exposing the explicitly selected local CSV directory to the local app. The surrounding project and original files are never modified. No Python packages are installed globally; uv uses `.venv/`.

## Coding workflow

1. Select a dialogue. Click anywhere on an utterance row to toggle it; multiple and non-adjacent rows are supported.
2. Click **Create action**. You may select only a User turn, or an exchange containing both speakers. The same utterance can support several actions.
3. Click exactly one **Action label**, then a **1–3 score**. Labels and scores are saved immediately; incomplete actions remain visible and exportable.
4. The **Sequence** panel numbers actions from 1, by their earliest evidence utterance. Equal starts keep creation order. Adding, deleting or editing evidence automatically recomputes the sequence; each action also retains a stable UUID.
5. Use **By label** to group repeated occurrences in the phase/label order from the rater form. Click a saved action to see its evidence, revise its label/score, or **Edit turns** and **Save turns**.
6. Export a **JSON backup** regularly. It contains the entire workspace and can be restored on another device or browser.

Keyboard: Tab and Space select rows, Escape cancels a pending selection, Enter creates the selection when no button or form control has focus. On smaller screens the case list scrolls horizontally and action coding appears below the transcript.

## Input formats

CSV must be UTF-8. BOM, CRLF/LF, quoted commas, escaped quotes and multiline utterances are supported. Speaker and Utterance headers are case-insensitive and tolerate spaces/underscores. Both formats work:

```csv
Speaker,Utterance
Character,"Hello, how are you?"
User,Do you have a moment?
```

```csv
Utterance ID,Speaker,Utterance
1,Character,"Hello, how are you?"
2,User,Do you have a moment?
```

The optional numeric column must contain consecutive integers beginning at 1. Every non-empty CSV record is one utterance; line breaks inside quoted text do not start a new utterance. The app uses the actual Speaker value and does not assume alternation or infer speakers from odd/even numbers.

**Import → Case folders** recursively loads each `dialogue.csv` with its sibling `rater_form.csv`. **Dialogue CSV** imports one or several individual dialogues with the default label set. Invalid files are reported before the batch is committed. Importing an identical case again keeps its current annotations.

The rater form supplies `Phase`, `Action` and `Explanation`. Existing Sequence/Score/initiator values are deliberately not used to reconstruct evidence: those forms do not contain utterance references, and prefilled ratings would undermine independent coding. The UI keeps the original action names in exports, including the template spelling `Complement (Positive Feedback)`.

Add a label using **＋ Add** in the action editor, or supply an expanded rater form when importing a new case. Extra labels are stored per dialogue and included in backups. The default labels are in `site/core.js`.

## Scores and exports

This version follows the revised workflow: **each action occurrence receives one score**. Initiator is omitted.

The source instructions instead call for one overall score per action label across the conversation, with absent labels scored 1. These are different measurement units. Double Check does **not** average occurrence scores or silently generate an overall rater-form score. Labels without evidence are shown as “No occurrences annotated”; this is not a decision that they are absent.

- **JSON backup:** all cases, original dialogue text, label definitions, action UUIDs, exact selected utterance IDs and occurrence scores. The JSON schema version is 1. A restore merges other cases and replaces matching cases only after a warning when they already contain annotations.
- **CSV · Action sequence:** current dialogue, one row per action. Includes chronological Sequence, stable Action ID, exact Utterance IDs, speakers, evidence text, phase, original label and occurrence score.
- **CSV · Grouped by label:** current dialogue, all labels in original rater-form order. Repeated sequence numbers and scores appear in corresponding order; missing scores remain blank. Unlabeled actions have a separate row. No overall score is inferred.

CSV exports include a UTF-8 BOM for spreadsheet compatibility, proper quoting, and protection against formula-like cells. Use JSON for an exact-text archive.

## Storage and privacy

Imported files and annotations stay in browser local storage for the current origin. **There is no server-side annotation database, cloud sync or automatic GitHub write.** Different ports, local/online URLs, browsers and devices have separate workspaces. Use JSON export/import to transfer work. Clearing site data or using private browsing can remove local work. Export warnings are shown if browser storage is unavailable.

The private GitHub repository does not make its Pages website private. Only application code and a clearly marked fictional practice dialogue are published. Real research CSVs, local backups and the existing annotation review are outside this repository and the deployment allowlist. The frontend loads no third-party fonts, scripts, analytics or APIs. Never put research transcripts in `site/`.

Two browser tabs should not edit the same workspace concurrently. If another tab changes it, this tab stops overwriting local storage and prompts you to export and reload.

## Publish to GitHub Pages

The repository stays **private**. GitHub Pages must be enabled for private repositories on the owner's GitHub plan (for example GitHub Pro). The public site is built from the dedicated **`gh-pages` branch, root folder**.

With `gh` authenticated and Git configured:

```sh
uv run scripts/deploy.py --repo chnln/dawn-double-code
```

This publishes only `index.html`, `app.js`, `core.js`, `styles.css` and `.nojekyll`. It preserves the branch history, does not force-push, and configures Pages to build from `gh-pages`. No source datasets are uploaded. Source code belongs on `main`; run the script after subsequent source updates. GitHub builds can take a minute or two.

## Verify

Node 18+ is needed only to run the dependency-free tests, not to use or serve the app:

```sh
node --test tests/*.test.mjs
```

Tests cover both CSV formats, multiline/Unicode parsing, invalid files, repeated and overlapping evidence, stable sequence renumbering, backup validation and both exports. If the original `../second_coder_sample/` folder exists, all 8 real cases are also checked. Browser checks cover selection, creation, labels, scoring, evidence editing, save/reload and responsive layouts.

The optional WebMCP interface exposes `read_dialogue_annotations` and `create_dialogue_action` in browsers that support it. Both use the same app state and validation as the interface; unsupported browsers work normally.
