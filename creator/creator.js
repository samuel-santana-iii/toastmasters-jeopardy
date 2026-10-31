'use strict';

const MAX_CATEGORIES = 6;
const MAX_QUESTIONS = 5;
const VALUE_STEP = 100;
const AUTOSAVE_DELAY = 400;

// The set chosen in the dropdown, which the set actions apply to
let selectedSetId = null;

// The set open in the editor. A damaged set can be selected but not opened.
let currentSetId = null;
let board = null;

let isDirty = false;
let saveTimer = null;

let renderedOptions = null;

// Tracks which question is open in the edit modal
let editCtx = { catIdx: null, qIdx: null };

// Backups waiting for their checklist, and the entries of the one on screen
let pendingBackups = [];
let importEntries = [];

// Safe HTML escaping for dynamic content
function esc(val) {
    return String(val == null ? '' : val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'question-set';
}

function setStatus(message, isError) {
    const status = document.getElementById('save-status');
    status.textContent = message;
    status.classList.toggle('save-status-error', !!isError);
}

function showStorageError(message) {
    const el = document.getElementById('storage-error');
    el.textContent = message || '';
    el.style.display = message ? '' : 'none';
}

// ── Autosave ─────────────────────────────────────────────────────────────────

function markDirty() {
    isDirty = true;
    setStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, AUTOSAVE_DELAY);
    renderIssues();
}

// A failed save stays dirty, so the edit is retried and isn't lost from the page
function flushSave() {
    clearTimeout(saveTimer);
    if (!isDirty || currentSetId == null) return;

    const result = SetsStore.update(currentSetId, board);
    if (result.ok) {
        isDirty = false;
        setStatus('Saved');
        renderLibrary();
    } else {
        setStatus('Not saved: ' + result.error, true);
    }
}

window.addEventListener('pagehide', flushSave);

// Keep the list current when another tab changes the sets
window.addEventListener('storage', renderLibrary);

// ── Set library ──────────────────────────────────────────────────────────────

function setState(set) {
    const issues = SetsStore.playabilityIssues(set.board);
    if (SetsStore.validateBoard(set.board).length > 0) {
        return { label: 'damaged', text: 'Damaged: ' + issues[0] };
    }
    if (issues.length) return { label: 'incomplete', text: 'Incomplete: ' + issues[0] };
    return { label: '', text: 'Ready to play' };
}

function renderLibrary() {
    const select = document.getElementById('set-select');
    const stateEl = document.getElementById('set-state');
    const result = SetsStore.list();
    const unavailable = !result.ok;
    const sets = unavailable ? [] : result.sets;
    const selected = sets.find(function (set) { return set.id === selectedSetId; });

    showStorageError(unavailable ? result.error : null);
    document.getElementById('library-empty').style.display = !unavailable && sets.length === 0 ? '' : 'none';

    const options = sets.length === 0
        ? '<option value="">No saved sets</option>'
        : (selected ? '' : '<option value=""></option>') + sets.map(function (set) {
            const label = setState(set).label;
            return `<option value="${esc(set.id)}">${esc(set.name)}${label ? ' (' + label + ')' : ''}</option>`;
        }).join('');
    // Rebuilding the options closes the dropdown, so only do it when they change
    if (options !== renderedOptions) {
        select.innerHTML = options;
        renderedOptions = options;
    }
    select.value = selected ? selected.id : '';
    select.disabled = sets.length === 0;

    const state = selected ? setState(selected) : null;
    stateEl.textContent = state ? state.text : selectedSetId != null && !unavailable ? 'This set no longer exists.' : '';
    stateEl.classList.toggle('set-state-issue', !state || state.text !== 'Ready to play');

    ['new-set-btn', 'import-btn'].forEach(function (id) {
        document.getElementById(id).disabled = unavailable;
    });
    ['rename-set-btn', 'duplicate-set-btn', 'export-set-btn', 'delete-set-btn'].forEach(function (id) {
        document.getElementById(id).disabled = !selected;
    });
    document.getElementById('export-all-btn').disabled = sets.length === 0;
}

function setSetInUrl(id) {
    const url = id == null ? location.pathname : location.pathname + '?set=' + encodeURIComponent(id);
    history.replaceState(null, '', url);
}

function openSet(id) {
    flushSave();
    // A failed save leaves the edits only on this page, so don't replace them
    if (isDirty) {
        renderLibrary();
        return;
    }

    const result = id == null ? null : SetsStore.get(id);
    const found = !!result && result.ok;
    const usable = found && SetsStore.validateBoard(result.set.board).length === 0;

    selectedSetId = found ? id : null;
    currentSetId = usable ? id : null;
    board = usable ? result.set.board : null;

    setSetInUrl(selectedSetId);
    document.getElementById('editor').style.display = usable ? '' : 'none';
    setStatus('');
    if (usable) {
        renderBoard();
        syncFinalJeopardy();
    }
    renderIssues();
    renderLibrary();
}

function openMostRecent() {
    const result = SetsStore.list();
    const sets = result.ok ? result.sets : [];
    const first = sets.find(function (set) {
        return SetsStore.validateBoard(set.board).length === 0;
    }) || sets[0];
    openSet(first ? first.id : null);
}

document.getElementById('set-select').addEventListener('change', function () {
    if (this.value) openSet(this.value);
});

document.getElementById('new-set-btn').addEventListener('click', function () {
    const name = prompt('Name for the new question set (up to ' + SetsStore.MAX_NAME_LENGTH + ' characters):', 'New question set');
    if (name === null) return;
    const result = SetsStore.create(name);
    if (!result.ok) {
        showStorageError(result.error);
        return;
    }
    openSet(result.set.id);
    reportIfShortened(name);
});

function reportIfShortened(name) {
    if (SetsStore.isNameTooLong(name)) {
        setStatus('Name shortened to ' + SetsStore.MAX_NAME_LENGTH + ' characters.');
    } else if (!isDirty) {
        setStatus('');
    }
}

// Actions read the selected set from storage, so pending edits are saved first
function withSelectedSet(action) {
    return function () {
        flushSave();
        const found = SetsStore.get(selectedSetId);
        if (!found.ok) {
            showStorageError(found.error);
            renderLibrary();
            return;
        }
        action(found.set);
    };
}

document.getElementById('rename-set-btn').addEventListener('click', withSelectedSet(function (set) {
    const name = prompt('New name for this set (up to ' + SetsStore.MAX_NAME_LENGTH + ' characters):', set.name);
    if (name === null) return;
    const result = SetsStore.rename(set.id, name);
    if (!result.ok) {
        showStorageError(result.error);
        return;
    }
    renderLibrary();
    reportIfShortened(name);
}));

document.getElementById('duplicate-set-btn').addEventListener('click', withSelectedSet(function (set) {
    const result = SetsStore.duplicate(set.id);
    if (!result.ok) {
        showStorageError(result.error);
        return;
    }
    openSet(result.set.id);
}));

document.getElementById('export-set-btn').addEventListener('click', withSelectedSet(function (set) {
    SetsStore.download(slugify(set.name) + '.json', SetsStore.exportSet(set));
}));

document.getElementById('delete-set-btn').addEventListener('click', withSelectedSet(function (set) {
    if (!confirm('Delete "' + set.name + '"? This cannot be undone.')) return;
    const result = SetsStore.remove(set.id);
    if (!result.ok) {
        showStorageError(result.error);
        return;
    }
    // The deleted set's unsaved edits have nowhere left to go
    isDirty = false;
    currentSetId = null;
    openMostRecent();
}));

document.getElementById('export-all-btn').addEventListener('click', function () {
    flushSave();
    const result = SetsStore.list();
    if (!result.ok) {
        showStorageError(result.error);
        return;
    }
    const date = new Date().toISOString().slice(0, 10);
    SetsStore.download('table-topics-backup-' + date + '.json', SetsStore.exportAll(result.sets));
});

// ── Rendering ────────────────────────────────────────────────────────────────

function renderBoard() {
    document.getElementById('board-jeopardy').innerHTML = buildBoardHTML();
    const secondRound = board['double-jeopardy'];
    document.getElementById('second-round-note').style.display =
        Array.isArray(secondRound) && secondRound.length > 0 ? '' : 'none';
}

function tileLabel(q) {
    if (q.question.trim() !== '') return q.question;
    return q.image ? '(image)' : '(empty)';
}

function buildBoardHTML() {
    let html = '<div class="board-row">';

    board['jeopardy'].forEach((category, catIdx) => {
        html += `
            <div class="category-col">
                <div class="category-header">
                    <input
                        class="category-name-input"
                        data-cat="${catIdx}"
                        value="${esc(category.name)}"
                        placeholder="Category name"
                        aria-label="Category name"
                    >
                    <button class="remove-cat-btn" data-cat="${catIdx}" title="Remove category" aria-label="Remove category">&times;</button>
                </div>`;

        category.questions.forEach((q, qIdx) => {
            html += `
                <button class="question-tile" data-cat="${catIdx}" data-q="${qIdx}">
                    <span class="question-tile-text">${esc(tileLabel(q))}</span>
                    ${q['daily-double'] ? '<span class="dd-badge">Daily Double</span>' : ''}
                </button>`;
        });

        if (category.questions.length < MAX_QUESTIONS) {
            html += `<button class="add-q-btn" data-cat="${catIdx}">+ Add Question</button>`;
        }

        html += '</div>';
    });

    if (board['jeopardy'].length < MAX_CATEGORIES) {
        html += `
            <div class="add-cat-col">
                <button class="add-cat-btn">+ Add Category</button>
            </div>`;
    }

    html += '</div>';
    return html;
}

function renderIssues() {
    const issues = board ? SetsStore.playabilityIssues(board) : [];
    document.getElementById('set-issues').textContent = issues.length ? 'Before playing: ' + issues[0] : '';
}

// Point values follow row order, and only the changed category is renumbered
function renumberCategory(category) {
    category.questions.forEach(function (q, i) {
        q.value = (i + 1) * VALUE_STEP;
    });
}

// ── Board event delegation ───────────────────────────────────────────────────

document.getElementById('board-jeopardy').addEventListener('click', function (e) {
    const tile = e.target.closest('.question-tile');
    if (tile) {
        openEdit(+tile.dataset.cat, +tile.dataset.q);
        return;
    }

    const removeCat = e.target.closest('.remove-cat-btn');
    if (removeCat) {
        const category = board['jeopardy'][+removeCat.dataset.cat];
        if (category.questions.length > 0 && !confirm('Remove this category and its questions?')) return;
        board['jeopardy'].splice(+removeCat.dataset.cat, 1);
        renderBoard();
        markDirty();
        return;
    }

    const addQ = e.target.closest('.add-q-btn');
    if (addQ) {
        const catIdx = +addQ.dataset.cat;
        const cat = board['jeopardy'][catIdx];
        cat.questions.push({ question: "" });
        renumberCategory(cat);
        renderBoard();
        markDirty();
        openEdit(catIdx, cat.questions.length - 1);
        return;
    }

    const addCat = e.target.closest('.add-cat-btn');
    if (addCat) {
        board['jeopardy'].push({ name: "", questions: [] });
        renderBoard();
        markDirty();
        const inputs = document.querySelectorAll('.category-name-input');
        inputs[inputs.length - 1].focus();
    }
});

document.getElementById('board-jeopardy').addEventListener('input', function (e) {
    const input = e.target.closest('.category-name-input');
    if (input) {
        board['jeopardy'][+input.dataset.cat].name = input.value;
        markDirty();
    }
});

// ── Edit modal ───────────────────────────────────────────────────────────────

function currentQuestion() {
    const { catIdx, qIdx } = editCtx;
    if (catIdx == null) return null;
    return board['jeopardy'][catIdx].questions[qIdx];
}

function openEdit(catIdx, qIdx) {
    editCtx = { catIdx, qIdx };
    const q = board['jeopardy'][catIdx].questions[qIdx];

    document.getElementById('edit-question').value = q.question || '';
    document.getElementById('edit-daily-double').checked = !!q['daily-double'];

    $('#edit-modal').modal('show');
}

$('#edit-modal').on('shown.bs.modal', function () {
    document.getElementById('edit-question').focus();
});

// Live-update model from modal inputs
document.getElementById('edit-question').addEventListener('input', function () {
    const q = currentQuestion();
    if (q) {
        q.question = this.value;
        markDirty();
    }
});

document.getElementById('edit-daily-double').addEventListener('change', function () {
    const q = currentQuestion();
    if (q) {
        q['daily-double'] = this.checked;
        markDirty();
    }
});

document.getElementById('edit-delete-btn').addEventListener('click', function () {
    const { catIdx, qIdx } = editCtx;
    const category = board['jeopardy'][catIdx];
    category.questions.splice(qIdx, 1);
    renumberCategory(category);
    editCtx = { catIdx: null, qIdx: null };
    markDirty();
    $('#edit-modal').modal('hide');
});

// Re-render after modal closes to reflect any changes on tiles
$('#edit-modal').on('hidden.bs.modal', function () {
    editCtx = { catIdx: null, qIdx: null };
    renderBoard();
    flushSave();
});

// ── Final Jeopardy ───────────────────────────────────────────────────────────

document.getElementById('fj-category').addEventListener('input', function () {
    board['final-jeopardy'].category = this.value;
    markDirty();
});

document.getElementById('fj-question').addEventListener('input', function () {
    board['final-jeopardy'].question = this.value;
    markDirty();
});

function syncFinalJeopardy() {
    const fj = board['final-jeopardy'];
    document.getElementById('fj-category').value = fj.category || '';
    document.getElementById('fj-question').value = fj.question || '';
}

// ── Import ───────────────────────────────────────────────────────────────────

function appendImportReport(lines) {
    const report = document.getElementById('import-report');
    report.insertAdjacentHTML('beforeend', lines.map(function (line) {
        return `<div class="${line.isError ? 'import-report-error' : ''}">${esc(line.text)}</div>`;
    }).join(''));
    report.style.display = report.children.length ? '' : 'none';
}

function saveImported(name, importedBoard) {
    const result = SetsStore.create(name, importedBoard);
    if (!result.ok) {
        return { line: { text: 'Not imported: "' + name + '". ' + result.error, isError: true } };
    }
    const shortened = SetsStore.isNameTooLong(name) ? ' The name was shortened.' : '';
    return { set: result.set, line: { text: 'Imported "' + result.set.name + '".' + shortened } };
}

function readFile(file) {
    return new Promise(function (resolve) {
        const reader = new FileReader();
        reader.onload = function () { resolve({ file: file, text: reader.result }); };
        reader.onerror = function () { resolve({ file: file, text: null }); };
        reader.readAsText(file);
    });
}

document.getElementById('import-btn').addEventListener('click', function () {
    document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', function (e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (files.length === 0) return;

    flushSave();
    document.getElementById('import-report').innerHTML = '';
    Promise.all(files.map(readFile)).then(function (results) {
        const lines = [];
        let lastImported = null;

        results.forEach(function (entry) {
            const label = entry.file.name;
            if (entry.text === null) {
                lines.push({ text: label + ': the file could not be read.', isError: true });
                return;
            }
            const parsed = SetsStore.parseImport(entry.text, label);
            if (parsed.kind === 'backup') {
                pendingBackups.push({ filename: label, sets: parsed.sets });
            } else if (parsed.errors.length) {
                lines.push({ text: label + ': ' + parsed.errors[0], isError: true });
            } else {
                const saved = saveImported(parsed.name, parsed.board);
                lines.push(saved.line);
                if (saved.set) lastImported = saved.set;
            }
        });

        appendImportReport(lines);
        if (lastImported && currentSetId == null) {
            openSet(lastImported.id);
        } else {
            renderLibrary();
        }
        showNextBackup();
    });
});

function showNextBackup() {
    const backup = pendingBackups.shift();
    if (!backup) return;

    document.getElementById('import-filename').textContent = backup.filename;
    if (backup.sets.length === 0) {
        appendImportReport([{ text: backup.filename + ': this backup has no sets.', isError: true }]);
        showNextBackup();
        return;
    }

    const stored = SetsStore.list();
    const taken = stored.ok ? stored.sets.map(function (set) { return set.name.toLowerCase(); }) : [];

    importEntries = backup.sets;
    document.getElementById('import-checklist').innerHTML = importEntries.map(function (entry, i) {
        const invalid = entry.errors.length > 0;
        const savedName = SetsStore.clipName(entry.name).toLowerCase();
        const clash = !invalid && taken.indexOf(savedName) !== -1;
        if (!invalid) taken.push(savedName);
        const notes = invalid ? ['Cannot import: ' + entry.errors[0]] : [];
        if (clash) notes.push('A set with this name exists, so this will be saved as a copy.');
        if (!invalid && SetsStore.isNameTooLong(entry.name)) {
            notes.push('The name will be shortened to ' + SetsStore.MAX_NAME_LENGTH + ' characters.');
        }
        const note = notes.join(' ');
        return `
            <label class="import-row ${invalid ? 'import-row-invalid' : ''}">
                <input type="checkbox" class="import-check" data-entry="${i}" ${invalid ? 'disabled' : 'checked'}>
                <span>
                    <span class="import-name">${esc(entry.name)}</span>
                    ${note ? `<span class="import-note">${esc(note)}</span>` : ''}
                </span>
            </label>`;
    }).join('');

    updateImportConfirm();
    $('#import-modal').modal('show');
}

function selectedImportChecks() {
    return Array.from(document.querySelectorAll('.import-check:checked'));
}

function updateImportConfirm() {
    const count = selectedImportChecks().length;
    const button = document.getElementById('import-confirm');
    button.textContent = 'Import ' + count + (count === 1 ? ' set' : ' sets');
    button.disabled = count === 0;
}

function setAllImportChecks(checked) {
    document.querySelectorAll('.import-check:not(:disabled)').forEach(function (box) {
        box.checked = checked;
    });
    updateImportConfirm();
}

document.getElementById('import-checklist').addEventListener('change', updateImportConfirm);
document.getElementById('import-select-all').addEventListener('click', function () { setAllImportChecks(true); });
document.getElementById('import-select-none').addEventListener('click', function () { setAllImportChecks(false); });

document.getElementById('import-confirm').addEventListener('click', function () {
    let lastImported = null;
    const lines = selectedImportChecks().map(function (box) {
        const entry = importEntries[+box.dataset.entry];
        const saved = saveImported(entry.name, entry.board);
        if (saved.set) lastImported = saved.set;
        return saved.line;
    });

    appendImportReport(lines);
    if (lastImported && currentSetId == null) {
        openSet(lastImported.id);
    } else {
        renderLibrary();
    }
    $('#import-modal').modal('hide');
});

$('#import-modal').on('hidden.bs.modal', showNextBackup);

// ── Init ─────────────────────────────────────────────────────────────────────

(function init() {
    const requested = new URLSearchParams(location.search).get('set');
    const found = requested ? SetsStore.get(requested) : null;
    if (found && found.ok) {
        openSet(requested);
    } else {
        openMostRecent();
    }
})();
