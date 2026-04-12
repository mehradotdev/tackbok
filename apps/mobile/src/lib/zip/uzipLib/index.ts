/**
 * TypeScript port of UZIP.js from Photopea. https://github.com/photopea/UZIP.js
 *
 * This local copy is trimmed to the subset this repo uses for backup ZIP
 * parsing and encoding. Unused tar, 7z, gzip, LZMA, and old JS shim/declaration
 * files were intentionally dropped because this codebase does not need those
 * features.
 */
// Prefer parse and encode as the public ZIP API. Raw DEFLATE helpers stay
// internal to the ZIP implementation.
export { encode, parse } from './zip-container';