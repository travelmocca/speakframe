import { expect, it } from 'vitest';
import { parseReflectionSpeech } from '../src/lib/reflection-speech';
it('keeps spoken reflections faithful and rejects silence, malformed or oversized responses', () => {
  expect(parseReflectionSpeech('{"hasSpeech":true,"text":" 我发现应该先讲结论。 "}')).toBe('我发现应该先讲结论。');
  expect(() => parseReflectionSpeech('{"hasSpeech":false,"text":""}')).toThrow();
  expect(() => parseReflectionSpeech('invalid')).toThrow();
  expect(() => parseReflectionSpeech(JSON.stringify({ hasSpeech: true, text: '字'.repeat(4001) }))).toThrow('4000');
});
