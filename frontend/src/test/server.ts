import { setupServer } from 'msw/node';

// No default handlers: every test declares the responses it needs, so nothing
// resembling real data can leak into app behavior.
export const server = setupServer();
