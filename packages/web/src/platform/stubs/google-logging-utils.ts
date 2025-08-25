/**
 * Minimal browser stub for google-logging-utils used by gcp-metadata.
 * Returns no-op logging functions.
 */

export function log() {
  const fn: any = () => {};
  fn.info = fn;
  fn.warn = fn;
  fn.error = fn;
  fn.debug = fn;
  fn.on = () => fn;
  fn.sublog = () => fn;
  return fn;
}

export const env = { nodeEnables: '' };
export function setBackend() {}
