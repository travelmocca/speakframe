// Session-memory drafts survive Next's client-side history traversal; saved server recordings remain separate.
type Draft = { blob: Blob; seconds: number; title: string; goal: string; sourceId?: string; issueId?: string };
const drafts = new Map<string, Draft>();
const tickets = new Map<string, number>();
let nextTicket = 0;
export const readDraft = (id: string) => drafts.get(id);
export const beginDraft = (id: string) => { const ticket = ++nextTicket; drafts.delete(id); tickets.set(id, ticket); return ticket; };
export const keepDraft = (id: string, draft: Draft, ticket: number) => { if (tickets.get(id) !== ticket) return false; drafts.set(id, draft); return true; };
export const discardDraft = (id: string) => { drafts.delete(id); tickets.delete(id); };
