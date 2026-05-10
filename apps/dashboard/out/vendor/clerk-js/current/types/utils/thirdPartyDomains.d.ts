/**
 * Domains of third-party embedding platforms (e.g. online IDEs, preview environments)
 * that require special handling for cookies and OAuth flows.
 *
 * These domains need:
 * - `SameSite=None` on cookies to function correctly
 * - Popup-based OAuth flows instead of redirects
 */
export declare const THIRD_PARTY_COOKIE_DOMAINS: string[];
/**
 * Returns `true` if the current origin belongs to a known third-party
 * embedding platform that requires `SameSite=None` on cookies.
 */
export declare function isThirdPartyCookieDomain(): boolean;
