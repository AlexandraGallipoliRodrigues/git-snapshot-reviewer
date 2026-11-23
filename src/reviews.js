const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {git} = require('./compare');

async function readMarks(file) {
    try {
        const values = JSON.parse(await fs.readFile(file, 'utf8'));
        if (!Array.isArray(values) || values.some((value) => !/^[a-f0-9]{64}$/.test(value)))
            throw new Error('El archivo debe contener una lista de marcas de revisión.');
        return new Set(values);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error(`No se puede leer el progreso guardado en ${file}: ${error.message}`);
    }
}

async function openReviews(repo) {
    const commonDirectory = (await git(repo, ['rev-parse', '--git-common-dir'])).trim();
    const directory = path.join(await fs.realpath(path.resolve(repo, commonDirectory)), 'screenshot-review');
    const file = path.join(directory, 'reviews.json');
    const legacyFile = path.join(repo, 'reports', 'screenshot-review', 'reviews.json');
    const read = async () => (await readMarks(file)) ?? (await readMarks(legacyFile)) ?? new Set();
    let queue = Promise.resolve();
    return {
        file,
        read,
        set: (fingerprint, enabled) => {
            queue = queue
                .catch(() => {})
                .then(async () => {
                    const marks = await read();
                    if (enabled) marks.add(fingerprint);
                    else marks.delete(fingerprint);
                    await fs.mkdir(directory, {recursive: true});
                    const temporaryFile = path.join(directory, `reviews-${randomUUID()}.tmp`);
                    try {
                        await fs.writeFile(temporaryFile, JSON.stringify([...marks], null, 2) + '\n');
                        await fs.rename(temporaryFile, file);
                    } finally {
                        await fs.rm(temporaryFile, {force: true});
                    }
                    return marks;
                });
            return queue;
        },
        flush: () => queue.catch(() => {}),
    };
}

module.exports = {openReviews};
