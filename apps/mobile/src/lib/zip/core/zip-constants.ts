/**
 * ZIP and ZIP64 specification constants.
 *
 * All magic numbers, signatures, version codes, flags, and field size limits
 * are defined here so that the rest of the codec never contains bare integer
 * literals for these values.
 */

// ─── Local file header ───────────────────────────────────────────────────────
export const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

// ─── Central directory ───────────────────────────────────────────────────────
export const ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
export const ZIP_CENTRAL_DIRECTORY_DIGITAL_SIGNATURE = 0x05054b50;

// ─── End of central directory (classic) ─────────────────────────────────────
export const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

// ─── ZIP64 end of central directory ─────────────────────────────────────────
export const ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06064b50;
export const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50;

// ─── Extra field IDs ─────────────────────────────────────────────────────────
export const ZIP64_EXTRA_FIELD_ID = 0x0001;

// ─── General-purpose bit flags ───────────────────────────────────────────────
export const ZIP_UTF8_FLAG = 2048;

// ─── Compression methods ─────────────────────────────────────────────────────
export const ZIP_COMPRESSION_METHOD_STORE = 0;
export const ZIP_COMPRESSION_METHOD_DEFLATE = 8;

// ─── Version-needed values ───────────────────────────────────────────────────
/** Minimum version needed for a classic ZIP entry. */
export const ZIP_CLASSIC_VERSION = 20;
/** Minimum version needed for a ZIP64 entry. */
export const ZIP64_VERSION = 45;

// ─── Fixed structure sizes (bytes) ───────────────────────────────────────────
export const ZIP_EOCD_MIN_SIZE = 22;
export const ZIP64_END_OF_CENTRAL_DIRECTORY_SIZE = 56;
export const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE = 20;

// ─── ZIP64 EOCD record data payload size (bigint, used in EOCD write/validate) ─
export const ZIP64_EOCD_RECORD_DATA_SIZE = 44n;

// ─── Classic-format sentinel values that signal a ZIP64 overflow ─────────────
/** 0xffff — a saturated 16-bit ZIP field indicating the real value is in ZIP64. */
export const UINT16_MAX = 0xffffn;
/** 0xffffffff — a saturated 32-bit ZIP field indicating the real value is in ZIP64. */
export const UINT32_MAX = 0xffffffffn;
