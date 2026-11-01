import { Logo } from "@store/store-client";

// Without an uploaded logo (`logoUrl` null) the Logo renders its typographic
// fallback: monogram square + the store name. The header and footer pass the
// admin's SeoSettings.logoUrl when one exists. `siteName` is required — the
// server-resolved `resolveSiteName(seo)`; "CaseStore" is the SITE_NAME default.
export const Typographic = () => <Logo siteName="CaseStore" logoUrl={null} />;
