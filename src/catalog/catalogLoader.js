// @ts-check

import { resolvePublicAsset } from './urlResolver.js';

/** @param {(url:string)=>Promise<Response>} fetcher @param {string} baseUrl */
export async function loadCatalog(fetcher, baseUrl) {
  const url = resolvePublicAsset(baseUrl, 'catalog/v1/', 'catalog.json');
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`CATALOG_FETCH_FAILED: ${response.status}`);
  const catalog = await response.json();
  if (
    catalog?.schemaVersion !== 1 ||
    !Array.isArray(catalog.songs) ||
    !Array.isArray(catalog.skins) ||
    typeof catalog.defaultSkinId !== 'string'
  ) throw new Error('CATALOG_SCHEMA_INVALID');
  return catalog;
}

/** @param {(url:string)=>Promise<Response>} fetcher @param {string} url */
export async function loadManifest(fetcher, url) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`MANIFEST_FETCH_FAILED: ${response.status}`);
  const manifest = await response.json();
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('MANIFEST_SCHEMA_INVALID');
  }
  return manifest;
}
