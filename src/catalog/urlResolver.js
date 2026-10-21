// @ts-check

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeRelativePath(value) {
  const withSlashes = value.replaceAll('\\', '/');
  let decoded = withSlashes;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new Error(`CONTENT_PATH_UNSAFE: ${value}`);
    }
  }

  const decodedSlashes = decoded.replaceAll('\\', '/');
  if (
    decodedSlashes.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(decodedSlashes) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decodedSlashes) ||
    decodedSlashes.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error(`CONTENT_PATH_UNSAFE: ${value}`);
  }
  return withSlashes;
}

/**
 * Resolve a manifest-listed asset under Vite's configured public base.
 *
 * @param {string} baseUrl
 * @param {string} root
 * @param {string} relativePath
 * @returns {string}
 */
export function resolvePublicAsset(baseUrl, root, relativePath) {
  const normalizedRoot = normalizeRelativePath(root).replace(/^\/+|\/+$/g, '');
  const normalizedRelative = normalizeRelativePath(relativePath).replace(/^\/+/, '');
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const base = new URL(normalizedBase, 'https://content.invalid');
  const encodedPath = `${normalizedRoot}/${normalizedRelative}`
    .split('/')
    .map((segment) => encodeURIComponent(segment).replaceAll("'", '%27'))
    .join('/');
  const resolved = new URL(encodedPath, base);
  if (!resolved.pathname.startsWith(base.pathname)) {
    throw new Error(`CONTENT_PATH_UNSAFE: ${relativePath}`);
  }
  return resolved.pathname;
}
