/**
 * Minimal stub for chalk in the browser.
 * Returns input strings without styling.
 */
const handler = {
  get: () => (str: string) => str,
};
export default new Proxy({}, handler);
