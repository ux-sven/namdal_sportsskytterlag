import { defineConfig } from 'astro/config';

// SITE_URL og BASE_PATH settes av GitHub Actions (se .github/workflows/deploy-web.yml).
// Med eget domene (namdalssl.no) blir BASE_PATH tom.
export default defineConfig({
  site: process.env.SITE_URL || 'https://namdalssl.no',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
