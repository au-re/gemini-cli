/**
 * Minimal browser stub for google-auth-library.
 * Provides placeholder classes used by the core library.
 */

export class OAuth2Client {}
export class GoogleAuth {
  // getClient is used in Node environments; here it just throws if called.
  async getClient(): Promise<never> {
    throw new Error('GoogleAuth is not available in the browser environment');
  }
}
export class Compute {}

export default {
  OAuth2Client,
  GoogleAuth,
  Compute,
};
