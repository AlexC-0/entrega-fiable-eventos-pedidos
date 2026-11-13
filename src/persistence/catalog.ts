import * as initial from './migrations/001-core.js';
import * as listIndex from './migrations/003-list-index.js';
import * as diagnostics from './migrations/002-diagnostics.js';
export interface Migration { readonly version: number; readonly sql: string }
export const queueMigrations: readonly Migration[] = Object.freeze([initial,diagnostics,listIndex]);
