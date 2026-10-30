import { expect, it } from 'vitest';
import { beginDraft, keepDraft, discardDraft, readDraft } from '../src/lib/recording-drafts';
const draft = { blob: new Blob(['recording']), seconds: 1, title: '主题', goal: '目标' };
it('recovers a stopped recording across client route remounts', () => {
  const ticket = beginDraft('route-recovery');
  expect(keepDraft('route-recovery', draft, ticket)).toBe(true);
  expect(readDraft('route-recovery')?.blob).toBe(draft.blob);
  discardDraft('route-recovery');
});
it('does not resurrect a discarded recording when a late onstop arrives', () => {
  const ticket = beginDraft('discard-race'); discardDraft('discard-race');
  expect(keepDraft('discard-race', draft, ticket)).toBe(false);
  expect(readDraft('discard-race')).toBeUndefined();
});
it('does not let an old recorder overwrite a newer take', () => {
  const old = beginDraft('rerecord'), current = beginDraft('rerecord');
  expect(keepDraft('rerecord', draft, old)).toBe(false);
  expect(keepDraft('rerecord', draft, current)).toBe(true);
  discardDraft('rerecord');
});
