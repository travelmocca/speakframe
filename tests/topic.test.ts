import { expect, it } from 'vitest';
import { parseTopic } from '../src/lib/topic';
it('returns spoken topic text without inventing a new title', () => {
  expect(parseTopic('{"hasSpeech":true,"title":"  我想讲一下项目延期的原因。  "}')).toBe('我想讲一下项目延期的原因。');
});
it('rejects silence, empty words, invalid JSON and oversized topics', () => {
  expect(() => parseTopic('{"hasSpeech":false,"title":""}')).toThrow('没有识别到');
  expect(() => parseTopic('{"hasSpeech":true,"title":"   "}')).toThrow();
  expect(() => parseTopic('not JSON')).toThrow();
  expect(() => parseTopic(JSON.stringify({ hasSpeech: true, title: '话'.repeat(121) }))).toThrow('120');
});
