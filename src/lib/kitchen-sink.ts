/**
 * Whether /kitchen-sink may render. Fails closed: true only under `next dev`
 * (NODE_ENV "development") or on a Vercel preview deployment (VERCEL_ENV
 * "preview"), false for everything else, a missing VERCEL_ENV included.
 *
 * NODE_ENV alone cannot tell a preview from production: every command other
 * than `next dev` sets it to "production". VERCEL_ENV is present only when the
 * Vercel project exposes system environment variables, so the check asks for
 * "preview" rather than ruling out "production", which would fail open.
 */
export function isKitchenSinkVisible(env: {
  nodeEnv?: string;
  vercelEnv?: string;
}): boolean {
  return env.nodeEnv === "development" || env.vercelEnv === "preview";
}
