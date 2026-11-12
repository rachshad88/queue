/** URL prefix the app is served under ("" at the root, "/queue" behind a sub-path proxy). Set with BASE_PATH at build time. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
