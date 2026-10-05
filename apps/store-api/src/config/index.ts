// Application configuration — read by the composition root (`main.ts`,
// `app.module.ts`). No Nest module of its own.
export { Environment, EnvironmentVariables, validateEnv } from './env.validation';
export { buildPinoHttpOptions } from './pino.config';
export { buildHelmetOptions } from './security.config';
export { TRUSTED_PROXY_HOPS, applyProxyTrust } from './trust-proxy';
