'use strict';

// Saved question sets, shared by the game and the creator.
// Methods that touch storage return { ok: true, ... } or { ok: false, error }.
var SetsStore = (function () {
    const STORAGE_KEY = 'toastmasters-jeopardy:sets';
    const STORAGE_VERSION = 1;
    const BACKUP_TYPE = 'table-topics-backup';
    const BACKUP_VERSION = 1;
    const DEFAULT_NAME = 'Untitled set';
    const MAX_NAME_LENGTH = 40;

    function fail(error) {
        return { ok: false, error: error };
    }

    function isObject(val) {
        return val !== null && typeof val === 'object' && !Array.isArray(val);
    }

    function isBlank(val) {
        return typeof val !== 'string' || val.trim() === '';
    }

    function clone(val) {
        return JSON.parse(JSON.stringify(val));
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    function isValidStoredSet(set) {
        return isObject(set) && typeof set.id === 'string' && typeof set.name === 'string';
    }

    function read() {
        let raw;
        try {
            raw = window.localStorage.getItem(STORAGE_KEY);
        } catch (_) {
            return fail('This browser is blocking local storage, so question sets cannot be saved here.');
        }
        if (raw === null) return { ok: true, sets: [] };

        let data;
        try {
            data = JSON.parse(raw);
        } catch (_) {
            data = null;
        }
        if (!isObject(data) || data.version !== STORAGE_VERSION ||
            !Array.isArray(data.sets) || !data.sets.every(isValidStoredSet)) {
            return fail('The saved question sets in this browser could not be read. They have been left untouched.');
        }
        return { ok: true, sets: data.sets };
    }

    function write(sets) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, sets: sets }));
            return { ok: true };
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                return fail('Browser storage is full. Export and delete some sets, then try again.');
            }
            return fail('The question set could not be saved in this browser.');
        }
    }

    // Reads immediately before each write, so another open tab's sets are kept.
    // A failed read is returned without writing, which protects unreadable data.
    function mutate(change) {
        const current = read();
        if (!current.ok) return current;

        const result = change(current.sets);
        if (!result.ok) return result;

        const saved = write(current.sets);
        return saved.ok ? result : saved;
    }

    function findSet(sets, id) {
        return sets.find(function (set) { return set.id === id; });
    }

    function makeId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    // Counts whole characters, so an emoji is never cut in half
    function clipName(name, maxLength) {
        return Array.from(name.trim()).slice(0, maxLength || MAX_NAME_LENGTH).join('').trim();
    }

    function isNameTooLong(name) {
        return Array.from(name.trim()).length > MAX_NAME_LENGTH;
    }

    function uniqueName(name, existingNames) {
        const taken = existingNames.map(function (n) { return n.toLowerCase(); });
        const base = isBlank(name) ? DEFAULT_NAME : clipName(name);
        let candidate = base;
        for (let n = 2; taken.indexOf(candidate.toLowerCase()) !== -1; n++) {
            const suffix = ' (' + n + ')';
            candidate = clipName(base, MAX_NAME_LENGTH - suffix.length) + suffix;
        }
        return candidate;
    }

    function namesOf(sets) {
        return sets.map(function (set) { return set.name; });
    }

    // ── Sets ─────────────────────────────────────────────────────────────────

    function newBoard() {
        return {
            "jeopardy": [],
            "double-jeopardy": [],
            "final-jeopardy": { category: "", question: "" }
        };
    }

    // Most recently edited first
    function list() {
        const current = read();
        if (!current.ok) return current;
        const sets = current.sets.slice().sort(function (a, b) {
            return String(b.updatedAt).localeCompare(String(a.updatedAt));
        });
        return { ok: true, sets: sets };
    }

    function get(id) {
        const current = read();
        if (!current.ok) return current;
        const set = findSet(current.sets, id);
        return set ? { ok: true, set: set } : fail('That question set no longer exists.');
    }

    function create(name, board) {
        return mutate(function (sets) {
            const set = {
                id: makeId(),
                name: uniqueName(name, namesOf(sets)),
                updatedAt: new Date().toISOString(),
                board: board || newBoard()
            };
            sets.push(set);
            return { ok: true, set: set };
        });
    }

    function update(id, board) {
        return mutate(function (sets) {
            const set = findSet(sets, id);
            if (!set) return fail('That question set no longer exists.');
            set.board = board;
            set.updatedAt = new Date().toISOString();
            return { ok: true, set: set };
        });
    }

    function rename(id, name) {
        return mutate(function (sets) {
            const set = findSet(sets, id);
            if (!set) return fail('That question set no longer exists.');
            const others = sets.filter(function (s) { return s !== set; });
            set.name = uniqueName(name, namesOf(others));
            set.updatedAt = new Date().toISOString();
            return { ok: true, set: set };
        });
    }

    function duplicate(id) {
        return mutate(function (sets) {
            const source = findSet(sets, id);
            if (!source) return fail('That question set no longer exists.');
            const set = {
                id: makeId(),
                name: uniqueName(source.name + ' copy', namesOf(sets)),
                updatedAt: new Date().toISOString(),
                board: clone(source.board)
            };
            sets.push(set);
            return { ok: true, set: set };
        });
    }

    function remove(id) {
        return mutate(function (sets) {
            const index = sets.findIndex(function (set) { return set.id === id; });
            if (index === -1) return fail('That question set no longer exists.');
            sets.splice(index, 1);
            return { ok: true };
        });
    }

    // ── Validation ───────────────────────────────────────────────────────────

    function validateRound(round, label, errors) {
        if (!Array.isArray(round)) {
            errors.push(label + ' must be a list of categories.');
            return;
        }
        round.forEach(function (category, catIdx) {
            const where = label + ' category ' + (catIdx + 1);
            if (!isObject(category) || typeof category.name !== 'string') {
                errors.push(where + ' needs a name.');
                return;
            }
            if (!Array.isArray(category.questions)) {
                errors.push(where + ' needs a list of questions.');
                return;
            }
            category.questions.forEach(function (q, qIdx) {
                const qWhere = where + ', question ' + (qIdx + 1);
                if (!isObject(q) || typeof q.question !== 'string') {
                    errors.push(qWhere + ' needs question text.');
                } else if (q.image !== undefined && q.image !== null && typeof q.image !== 'string') {
                    errors.push(qWhere + ' has an invalid image.');
                }
            });
        });
    }

    // Can this data be imported or opened at all?
    function validateBoard(board) {
        if (!isObject(board)) return ['This is not a question set.'];

        const errors = [];
        validateRound(board['jeopardy'], 'Round one', errors);
        if (board['double-jeopardy'] !== undefined) {
            validateRound(board['double-jeopardy'], 'Round two', errors);
        }

        const final = board['final-jeopardy'];
        if (!isObject(final)) {
            errors.push('The final round is missing.');
        } else {
            ['category', 'question'].forEach(function (field) {
                if (final[field] !== undefined && typeof final[field] !== 'string') {
                    errors.push('The final round ' + field + ' must be text.');
                }
            });
            if (final.image !== undefined && final.image !== null && typeof final.image !== 'string') {
                errors.push('The final round has an invalid image.');
            }
        }
        return errors;
    }

    // Can this board be played as it stands? Drafts are allowed to fail this.
    function playabilityIssues(board) {
        const errors = validateBoard(board);
        if (errors.length) return errors;

        const issues = [];
        const categories = board['jeopardy'];
        if (!categories.some(function (c) { return c.questions.length > 0; })) {
            issues.push('Add at least one question.');
        }
        categories.forEach(function (category, catIdx) {
            const label = isBlank(category.name) ? 'Category ' + (catIdx + 1) : '"' + category.name.trim() + '"';
            if (isBlank(category.name)) issues.push('Category ' + (catIdx + 1) + ' needs a name.');
            if (category.questions.length === 0) issues.push(label + ' has no questions.');
            // Image-only prompts from older boards have no text but can still be played
            if (category.questions.some(function (q) { return isBlank(q.question) && !q.image; })) {
                issues.push(label + ' has a blank question.');
            }
        });
        if (isBlank(board['final-jeopardy'].category)) issues.push('The final round needs a category.');
        if (isBlank(board['final-jeopardy'].question)) issues.push('The final round needs a question.');
        return issues;
    }

    // ── Export / Import ──────────────────────────────────────────────────────

    function exportSet(set) {
        return JSON.stringify(set.board, null, 2);
    }

    function exportAll(sets) {
        return JSON.stringify({
            type: BACKUP_TYPE,
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            sets: sets.map(function (set) {
                return { name: set.name, board: set.board };
            })
        }, null, 2);
    }

    function nameFromFilename(filename) {
        return String(filename || '').replace(/\.json$/i, '');
    }

    // Returns { kind: 'board', name, board, errors } for a single-set file,
    // { kind: 'backup', sets: [{ name, board, errors }] } for a backup,
    // or { kind: 'invalid', errors } for anything else.
    function parseImport(text, filename) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (_) {
            return { kind: 'invalid', errors: ['This file is not valid JSON.'] };
        }

        if (isObject(data) && data.type === BACKUP_TYPE) {
            if (data.version !== BACKUP_VERSION) {
                return { kind: 'invalid', errors: ['This backup was made by a newer version of the app.'] };
            }
            if (!Array.isArray(data.sets)) {
                return { kind: 'invalid', errors: ['This backup has no list of sets.'] };
            }
            return {
                kind: 'backup',
                sets: data.sets.map(function (entry, i) {
                    if (!isObject(entry) || isBlank(entry.name)) {
                        return { name: 'Set ' + (i + 1), board: null, errors: ['This set has no name.'] };
                    }
                    return { name: entry.name.trim(), board: entry.board, errors: validateBoard(entry.board) };
                })
            };
        }

        return { kind: 'board', name: nameFromFilename(filename), board: data, errors: validateBoard(data) };
    }

    function download(filename, text) {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return {
        list: list,
        get: get,
        create: create,
        update: update,
        rename: rename,
        duplicate: duplicate,
        remove: remove,
        newBoard: newBoard,
        MAX_NAME_LENGTH: MAX_NAME_LENGTH,
        clipName: clipName,
        isNameTooLong: isNameTooLong,
        uniqueName: uniqueName,
        validateBoard: validateBoard,
        playabilityIssues: playabilityIssues,
        exportSet: exportSet,
        exportAll: exportAll,
        parseImport: parseImport,
        download: download
    };
})();
