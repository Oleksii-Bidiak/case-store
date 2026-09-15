import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The structural half of invariant 5 (TASK-477, plan 178 decision 2).
 *
 * `permission-template.service.spec.ts` proves the BEHAVIOUR — edit a template,
 * nobody moves. This file proves there is nothing in the schema that could make
 * that behaviour hard to keep: `user_permissions` holds a person and a key and
 * nothing else, so "which template did this come from" is a question the database
 * cannot answer and therefore a question no future code can start depending on.
 *
 * Written as a source-text assertion rather than a runtime one for the same
 * reason `permission.catalog.spec.ts` reads migration SQL: the thing being
 * protected is a DECISION, and the moment somebody writes `templateId String` in
 * this model they should be reading the paragraph below, not discovering a subtle
 * behavioural failure three sprints later.
 *
 * IF YOU ARE HERE BECAUSE THIS TEST FAILED: you have probably just added a link
 * from a person's permissions back to the template they were set up from, most
 * likely so a screen can show «за шаблоном Оператор замовлень». That is the
 * design plan 178 considered and rejected, and the two reasons are worth
 * re-reading before you delete this test:
 *
 *   1. With a link, editing a template silently changes what somebody already
 *      working may do. Nobody performed that change on that person, and nobody
 *      will find it in the audit log by their name.
 *   2. The link desynchronises the first time one person is given one key beyond
 *      their template — which is the normal case, not the edge one. You then need
 *      a rule for what "still on the template" means, and every answer to that is
 *      worse than not having the link.
 *
 * If a screen needs to show which template somebody was set up from, that is a
 * fact about an EVENT, not about their current rights: it is already in the audit
 * row `permissionTemplate.apply` writes, and it stays correct even after their
 * permissions are edited afterwards.
 */
const SCHEMA = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');

function modelBody(name: string): string {
  const start = SCHEMA.indexOf(`model ${name} {`);
  expect(start).toBeGreaterThan(-1);
  const end = SCHEMA.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return SCHEMA.slice(start, end);
}

describe('the copy rule is structural (TASK-477, invariant 5)', () => {
  it('found the schema (an empty read would pass every rule below)', () => {
    expect(SCHEMA.length).toBeGreaterThan(1000);
    expect(SCHEMA).toContain('model UserPermission {');
    expect(SCHEMA).toContain('model PermissionTemplate {');
  });

  it('gives a granted permission no link back to a template', () => {
    const body = modelBody('UserPermission');

    expect(body).not.toMatch(/templateId/);
    expect(body).not.toMatch(/PermissionTemplate/);
  });

  it('gives a template no link forward to the people set up from it', () => {
    // The other direction of the same rule. A `users User[]` here would be the
    // same mistake wearing a different hat: it would make "who is on this
    // template" answerable, and the next step is always keeping them in sync.
    const body = modelBody('PermissionTemplate');

    expect(body).not.toMatch(/UserPermission/);
    expect(body).not.toMatch(/\bUser\b/);
  });

  it('keeps a template item a plain key, so applying one can only ever be a copy', () => {
    const body = modelBody('PermissionTemplateItem');

    expect(body).toContain('permission String');
    expect(body).not.toMatch(/\bUser\b/);
  });
});
