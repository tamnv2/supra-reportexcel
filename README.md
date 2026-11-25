# Supra Report Excel — bootstrap

Infrastructure only. No business code, workbook, credentials or release binaries included.
Production updates are deliberately disabled until authenticated release distribution, signed manifests, version compatibility and Windows/Excel tests are complete.

## Cloudflare Workers Builds
1. Make this repository private before adding internal code.
2. Create private R2 bucket `supra-reportexcel-releases` (Standard).
3. Import this repository into Workers & Pages. Worker: `updatereportexcel`; production branch: `main`; root: repository root; build: `node --test`; deploy: `npx wrangler deploy`. Disable non-production builds for now.
4. The Wrangler configuration binds R2 as `RELEASES` and declares the custom domain. Ensure the deployment identity has access to the zone `supra.cc.cd`; if necessary attach the custom domain from the Worker dashboard with authorized account access.
5. Check https://updatereportexcel.supra.cc.cd/health (200 and storage ready). /manifest.json must return 404 NO_RELEASE.

No GitHub Actions secret is needed for this initial Workers Builds integration. Do not put tokens into this repository. R2 remains private. No other repositories, Workers, DNS records or buckets are in scope.
