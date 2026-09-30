import path from 'node:path';

export const PORT = Number(process.env.PORT || 8080);
export const JWT_SECRET = process.env.JWT_SECRET;
export const STATIC_DIR = process.env.STATIC_DIR || path.resolve('public');

/** Stops the server early when a required secret is missing or too short. */
export function assertConfig() {
  if (!JWT_SECRET || JWT_SECRET.length < 16) {
    console.error('JWT_SECRET must be set to a random string of at least 16 characters');
    process.exit(1);
  }
}
