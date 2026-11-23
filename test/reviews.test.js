const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {git} = require('../src/compare');
const {openReviews} = require('../src/reviews');

const firstMark = 'a'.repeat(64);
const secondMark = 'b'.repeat(64);

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-reviews-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo);
    await git(repo, ['init', '-b', 'main']);
    await git(repo, ['config', 'user.name', 'Snapshot reviewer']);
    await git(repo, ['config', 'user.email', 'reviewer@example.test']);
    await fs.writeFile(path.join(repo, '.gitignore'), 'reports/\n');
    await git(repo, ['add', '.gitignore']);
    await git(repo, ['commit', '-m', 'Prepare review fixture']);
    return {root, repo};
}

test('legacy progress is recovered without changing the previous file or the working tree', async (t) => {
    const {repo} = await fixture(t);
    const legacyFile = path.join(repo, 'reports', 'screenshot-review', 'reviews.json');
    await fs.mkdir(path.dirname(legacyFile), {recursive: true});
    await fs.writeFile(legacyFile, JSON.stringify([firstMark]));
    const store = await openReviews(repo);
    assert.equal((await store.read()).has(firstMark), true);
    const marks = await store.set(secondMark, true);
    assert.deepEqual([...marks], [firstMark, secondMark]);
    assert.deepEqual(JSON.parse(await fs.readFile(legacyFile, 'utf8')), [firstMark]);
    assert.ok(store.file.startsWith(await fs.realpath(path.join(repo, '.git'))));
    assert.equal((await git(repo, ['status', '--porcelain'])).trim(), '');
    assert.deepEqual([...(await (await openReviews(repo)).read())], [firstMark, secondMark]);
});

test('linked worktrees share marks and sequential writes preserve other viewers changes', async (t) => {
    const {root, repo} = await fixture(t);
    const linked = path.join(root, 'linked');
    await git(repo, ['worktree', 'add', '-b', 'feature', linked]);
    const first = await openReviews(repo);
    const second = await openReviews(linked);
    assert.equal(first.file, second.file);
    await first.set(firstMark, true);
    await second.set(secondMark, true);
    await first.set(firstMark, false);
    assert.deepEqual([...(await second.read())], [secondMark]);
});

test('queued writes keep both marks and a corrupt file is never silently replaced', async (t) => {
    const {repo} = await fixture(t);
    const store = await openReviews(repo);
    await Promise.all([store.set(firstMark, true), store.set(secondMark, true)]);
    assert.equal((await store.read()).size, 2);
    await fs.writeFile(store.file, 'not valid JSON');
    await assert.rejects(store.set(firstMark, false), /No se puede leer el progreso/);
    assert.equal(await fs.readFile(store.file, 'utf8'), 'not valid JSON');
});
