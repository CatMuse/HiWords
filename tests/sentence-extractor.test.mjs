import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
    stdin: {
        contents: `
            export { extractSentence, extractSentenceFromEditorMultiline } from './src/utils/sentence-extractor';
            export { extractMarkdownContexts } from './src/services/markdown-context-extractor';
        `,
        resolveDir: process.cwd(),
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
});
const { extractSentence, extractSentenceFromEditorMultiline, extractMarkdownContexts } = await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const examples = [
    ['We use tools, e.g. dictionaries, to learn words.', ['tools', 'e.g.', 'dictionaries']],
    ['The result follows Equ. 3 in the paper.', ['result', 'Equ.', 'paper']],
    ['Dr. Smith studies language.', ['Dr.', 'Smith', 'language']],
    ['We mean fruit, i.e. Apples and pears.', ['fruit', 'Apples']],
    ['See Fig. 2 and Eq. (3) for details.', ['See', 'details']],
    ['Prof. J. R. Smith explains the result.', ['Prof.', 'J.', 'R.', 'Smith', 'result']],
    ['The U.S. economy is growing.', ['U.S.', 'economy']],
    ['Her Ph.D. research covers language.', ['Ph.D.', 'research']],
    ['We bought fruit etc. for dinner.', ['fruit', 'dinner']],
    ['The value is 3.14 in this example.', ['value', '3.14', 'example']],
];

for (const [sentence, words] of examples) {
    test(`preserves abbreviations and decimals: ${sentence}`, () => {
        const text = `Previous sentence. ${sentence} Next sentence.`;
        for (const word of words) {
            const offset = text.indexOf(word);
            // Check both sides and the interior of each selected token.
            for (let position = offset; position < offset + word.length; position++) {
                assert.equal(extractSentence(text, position), sentence, `${word} at ${position}`);
            }
            const contexts = extractMarkdownContexts(text, word, null);
            assert.equal(contexts.length, 1, word);
            assert.equal(contexts[0].sentence, sentence, word);
            assert.equal(contexts[0].offset, offset, word);
        }
    });
}

test('sentence-final abbreviations do not swallow the following sentence', () => {
    for (const first of ['We bought fruit etc.', 'She lives in the U.S.', 'He works at Acme Inc.']) {
        const second = 'Then we went home.';
        const text = `${first} ${second}`;
        assert.equal(extractSentence(text, 1), first);
        assert.equal(extractSentence(text, text.indexOf('Then')), second);
        assert.equal(extractMarkdownContexts(text, 'Then', null)[0].sentence, second);
        assert.equal(extractSentence(first, 1), first);
    }
});

test('ordinary boundaries, punctuation clusters, and closing quotes are retained', () => {
    for (const [text, word, expected] of [
        ['One sentence.Next sentence.', 'Next', 'Next sentence.'],
        ['He said “Hello!” Next sentence.', 'Hello', 'He said “Hello!”'],
        ['He said “Hello!” Next sentence.', 'Next', 'Next sentence.'],
        ['Really?! Next sentence.', 'Really', 'Really?!'],
        ['Wait... Next sentence.', 'Wait', 'Wait...'],
        ['第一句话。第二句话！第三句话？', '第二', '第二句话！'],
        ['First line\nSecond line', 'Second', 'Second line'],
        ['First line\r\nSecond line', 'First', 'First line'],
    ]) {
        assert.equal(extractSentence(text, text.indexOf(word)), expected);
    }
});

test('editor extraction keeps hard line breaks while Markdown paragraphs allow soft wraps', () => {
    const text = 'Earlier line\nDr. Smith studies language. Next sentence.';
    const editor = {
        getCursor: () => ({ line: 1, ch: 6 }),
        getValue: () => text,
        getLine: line => text.split('\n')[line],
    };
    assert.equal(extractSentenceFromEditorMultiline(editor), 'Dr. Smith studies language.');
    assert.equal(extractSentence('Ask Dr.\nSmith studies language.', 10), 'Smith studies language.');
    assert.equal(extractMarkdownContexts('Dr.\nSmith studies language.', 'Smith', null)[0].sentence,
        'Dr. Smith studies language.');
    const items = '- Dr. Smith studies language.\n- Another item mentions Smith.';
    assert.deepEqual(extractMarkdownContexts(items, 'Smith', null).map(item => item.sentence),
        ['Dr. Smith studies language.', 'Another item mentions Smith.']);
});

test('empty text, invalid offsets, and end-of-text cursors are handled', () => {
    for (const offset of [-1, 100, NaN, 1.5]) assert.equal(extractSentence('Hello', offset), '');
    assert.equal(extractSentence('', 0), '');
    assert.equal(extractSentence('Hello', 5), 'Hello');
    assert.equal(extractSentence('Hello.', 6), '');
});
