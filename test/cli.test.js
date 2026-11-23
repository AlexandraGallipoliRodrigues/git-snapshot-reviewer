const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseArguments} = require('../src/server');

test('the CLI accepts a separate clone and revisions without interpreting shell characters', () => {
    assert.deepEqual(
        parseArguments([
            '--repo',
            '/a clone/webapp',
            '--base=origin/master',
            '--head',
            'feature; example',
            '--port',
            '0',
        ]),
        {repo: '/a clone/webapp', base: 'origin/master', head: 'feature; example', port: 0},
    );
    assert.deepEqual(parseArguments(['--help']), {help: true});
});

test('the CLI rejects missing arguments, unknown flags and invalid ports', () => {
    for (const args of [
        ['--repo'],
        ['--repo', '--base'],
        ['--unknown'],
        ['--port', 'NaN'],
        ['--port', '-1'],
        ['--port', '65536'],
        ['--port', '1.5'],
    ])
        assert.throws(() => parseArguments(args));
});
