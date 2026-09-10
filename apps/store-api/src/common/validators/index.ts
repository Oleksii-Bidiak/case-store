export * from './password-policy.decorator';
export * from './is-ua-phone.decorator';
// `env.validation.ts` imported this one by full path while every other consumer
// went through the barrel — an inconsistency, not a rule. Exported here so the
// next validator does not have to guess which convention applies (TASK-407).
export * from './is-origin-list.decorator';
