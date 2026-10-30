import { resolve } from 'node:path';
import { Store } from './store';

// Runtime storage is external to the compiled server bundle.
export const DATA_DIR = resolve(/* turbopackIgnore: true */ process.env.APP_DATA_DIR || 'var');
export const MODEL = process.env.QWEN_MODEL || 'qwen3.8-omni-flash';
export const MAX_SECONDS = 600;
export const MAX_BYTES = 50 * 1024 * 1024;
const globalStore = globalThis as typeof globalThis & { expressionStore?: Store };
export function store() { return globalStore.expressionStore ||= new Store(DATA_DIR); }
