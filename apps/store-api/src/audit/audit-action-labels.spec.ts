import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { entityTypeFromController } from './audit.interceptor';
import {
  OWNER_ONLY_KEY,
  REQUIRE_PERMISSION_KEY,
} from '../auth/permissions/require-permission.decorator';

/**
 * The gate that keeps the admin panel's audit-log labels honest (TASK-430).
 *
 * ── The problem this exists for ──────────────────────────────────────────────
 * The log's «Дія» column used to print the raw key an owner cannot read
 * (`order.updateStatus`, `seoSettings.uploadLogo`). store-admin now names those in
 * Ukrainian — but the set of actions is DERIVED, not declared: `AuditInterceptor`
 * builds every action as `entityTypeFromController(class.name).handlerName`, so it
 * changes whenever a guarded mutating route is added, and nothing in the frontend
 * can notice. Left alone, the label map would be complete on the day it shipped and
 * quietly wrong a release later — with the failure visible only as a machine key on
 * the owner's screen, which is exactly the state this task was raised to fix.
 *
 * So the derivation is re-run here, against the REAL controller classes and the
 * REAL Nest metadata, the same way `permission.catalog.spec.ts` polices the guard
 * annotations. Every audited action must resolve to a label, and every label must
 * still belong to an audited action.
 *
 * ── Why this spec reads a file in another workspace ─────────────────────────
 * The labels are Ukrainian UI copy, so they live in the one place this repo keeps
 * UI copy: `apps/store-admin/src/shared/config/dictionary.ts`. The action set can
 * only be derived HERE, where the controllers and their decorator metadata are. One
 * of the two sides has to cross the boundary, and the cheap direction is this one:
 * the dictionary is read as TEXT and its keys extracted, with no import, no
 * cross-workspace tsconfig, and no build coupling in either direction. If the file
 * or the blocks cannot be found the spec FAILS rather than passing vacuously — a
 * green run must mean the labels were checked.
 */

const SRC_ROOT = resolve(__dirname, '..');

const DICTIONARY_PATH = resolve(__dirname, '../../../store-admin/src/shared/config/dictionary.ts');

/**
 * Nest's `RequestMethod` values for the verbs that change something. Mirrors
 * `MUTATING_METHODS` in `audit.interceptor.ts`: POST=1, PUT=2, DELETE=3, PATCH=4.
 * A GET is a read and is not audited, so its handler needs no label.
 */
const MUTATING_METHODS = new Set(['1', '2', '3', '4']);

interface AuditedAction {
  /** `${entityType}.${handler}` — exactly what the interceptor writes. */
  action: string;
  entityType: string;
  handler: string;
  controller: string;
}

/** Every `*.controller.ts` under src, excluding specs. */
function findControllerFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findControllerFiles(full, found);
      continue;
    }
    if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Re-derive the actions the interceptor will write: a MUTATING handler on a route
 * that carries `@RequirePermission` or `@OwnerOnly()` (its own, or the class's).
 * Mirrors `AuditInterceptor.isAuditable` + the action it composes — if the two ever
 * disagree, this spec is asserting something the runtime does not do.
 */
function discoverAuditedActions(): AuditedAction[] {
  const actions = new Map<string, AuditedAction>();

  for (const file of findControllerFiles(SRC_ROOT)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleExports = require(file) as Record<string, unknown>;

    for (const exported of Object.values(moduleExports)) {
      if (typeof exported !== 'function') {
        continue;
      }
      const controller = exported as new (...args: never[]) => object;
      if (Reflect.getMetadata(PATH_METADATA, controller) === undefined) {
        continue; // not a @Controller
      }

      const classPermission: unknown = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, controller);
      const classOwnerOnly: unknown = Reflect.getMetadata(OWNER_ONLY_KEY, controller);
      const entityType = entityTypeFromController(controller.name);

      const prototype = controller.prototype as Record<string, unknown>;
      for (const handler of Object.getOwnPropertyNames(prototype)) {
        if (handler === 'constructor') {
          continue;
        }
        const method = prototype[handler];
        if (typeof method !== 'function') {
          continue;
        }
        const httpMethod: unknown = Reflect.getMetadata(METHOD_METADATA, method);
        if (httpMethod === undefined || !MUTATING_METHODS.has(String(httpMethod))) {
          continue;
        }

        const guarded = Boolean(
          (Reflect.getMetadata(REQUIRE_PERMISSION_KEY, method as object) as unknown) ??
          (Reflect.getMetadata(OWNER_ONLY_KEY, method as object) as unknown) ??
          classPermission ??
          classOwnerOnly,
        );
        if (!guarded) {
          continue;
        }

        const action = `${entityType}.${handler}`;
        actions.set(action, { action, entityType, handler, controller: controller.name });
      }
    }
  }

  return [...actions.values()].sort((a, b) => a.action.localeCompare(b.action));
}

/**
 * The keys of one object literal in the dictionary, by name.
 *
 * A brace counter over the source text, which is sufficient and stays so: both
 * blocks hold plain string values, and comments are stripped first so a `{` inside
 * one cannot unbalance the scan. Anything unexpected shows up as a key count of
 * zero, which the tests below treat as a failure rather than as "no labels needed".
 */
function dictionaryKeys(source: string, blockName: string): string[] {
  const withoutComments = source.replace(/\/\/[^\n]*/g, '');
  const start = withoutComments.indexOf(`${blockName}: {`);
  if (start === -1) {
    return [];
  }

  let depth = 0;
  let end = -1;
  for (let i = withoutComments.indexOf('{', start); i < withoutComments.length; i += 1) {
    const char = withoutComments[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    return [];
  }

  const body = withoutComments.slice(start, end);
  return [...body.matchAll(/^\s{2,}([A-Za-z][A-Za-z0-9_]*):/gm)].map((match) => match[1]);
}

describe('audit action labels (TASK-430)', () => {
  const audited = discoverAuditedActions();

  const dictionarySource = existsSync(DICTIONARY_PATH) ? readFileSync(DICTIONARY_PATH, 'utf8') : '';
  const entityLabels = new Set(dictionaryKeys(dictionarySource, 'entityLabels'));
  const actionVerbs = new Set(dictionaryKeys(dictionarySource, 'actionVerbs'));

  it('found the admin dictionary and both label blocks (an empty read would pass every rule below)', () => {
    expect(dictionarySource.length).toBeGreaterThan(0);
    expect(entityLabels.size).toBeGreaterThan(20);
    expect(actionVerbs.size).toBeGreaterThan(20);
  });

  it('derives the audited surface (a broken walk would pass every rule below)', () => {
    expect(audited.length).toBeGreaterThan(100);
  });

  it('names the entity type of every audited action', () => {
    const offenders = audited
      .filter((entry) => !entityLabels.has(entry.entityType))
      .map(
        (entry) =>
          `${entry.action} (${entry.controller}) — no "${entry.entityType}" in ` +
          'dict.auditLog.entityLabels, so the log shows the raw key and the entity ' +
          'filter cannot offer it',
      );

    expect([...new Set(offenders)]).toEqual([]);
  });

  it('names the verb of every audited action', () => {
    const offenders = audited
      .filter((entry) => !actionVerbs.has(entry.handler))
      .map(
        (entry) =>
          `${entry.action} (${entry.controller}) — no "${entry.handler}" in ` +
          'dict.auditLog.actionVerbs, so the owner sees the raw key',
      );

    expect(offenders).toEqual([]);
  });

  it('keeps no verb that matches nothing any more', () => {
    // The other direction, and the one that actually rots: a renamed handler leaves
    // a label behind that can never render, and the next author copies it as a
    // pattern. Deleting the stale entry is the fix.
    const used = new Set(audited.map((entry) => entry.handler));
    const dead = [...actionVerbs].filter((verb) => !used.has(verb));

    expect(dead).toEqual([]);
  });
});
