// =============================================================================
// Metabase Embed URL generator — server-side ONLY
// JANGAN import file ini dari client components.
// Secret di-sign server-side; tidak pernah mencapai browser.
// =============================================================================

import { z } from 'zod';
import jwt from 'jsonwebtoken';

const MetabaseEnvSchema = z.object({
  METABASE_SITE_URL:     z.string().url(),
  METABASE_SECRET_KEY:   z.string().min(1),
  METABASE_DASHBOARD_ID: z.coerce.number().int().positive(),
});

function getMetabaseConfig() {
  const result = MetabaseEnvSchema.safeParse({
    METABASE_SITE_URL:     process.env.METABASE_SITE_URL,
    METABASE_SECRET_KEY:   process.env.METABASE_SECRET_KEY,
    METABASE_DASHBOARD_ID: process.env.METABASE_DASHBOARD_ID,
  });
  return result.success ? result.data : null;
}

/**
 * Generate signed Metabase static embed URL (HS256, exp = +10 min).
 * Returns null when METABASE_* env vars are absent/invalid — caller shows placeholder.
 * Call ONLY from server components or route handlers.
 */
export function metabaseEmbedUrl(): string | null {
  const config = getMetabaseConfig();
  if (!config) return null;

  const payload = {
    resource: { dashboard: config.METABASE_DASHBOARD_ID },
    params:   {},
    exp:      Math.round(Date.now() / 1000) + 10 * 60,
  };

  const token = jwt.sign(payload, config.METABASE_SECRET_KEY, { algorithm: 'HS256' });
  return `${config.METABASE_SITE_URL}/embed/dashboard/${token}#bordered=false&titled=false`;
}
