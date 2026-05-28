/**
 * scripts/utils.js
 * Common utility functions for A-Plus Publisher
 */

/**
 * Builds a preview URL from a draft URL, auto-detecting Vendor vs Seller Central.
 * Supports both domains since the user works with both.
 * @param {string} draftUrl - The URL of the current draft
 * @returns {string} - The preview URL, or empty string if invalid
 */
export function buildPreviewUrl(draftUrl) {
  if (!draftUrl) return "";
  const match = draftUrl.match(/\/content\/([a-f0-9\-]{36})/i);
  if (!match || !match[1]) return "";

  try {
    const parsed = new URL(draftUrl);
    return `https://${parsed.host}/aplus/api/GetContentPreview?contentId=${match[1]}&deviceType=DESKTOP`;
  } catch (e) {
    const domain = draftUrl.includes("vendorcentral")
      ? "vendorcentral.amazon.com"
      : "sellercentral.amazon.com";
    return `https://${domain}/aplus/api/GetContentPreview?contentId=${match[1]}&deviceType=DESKTOP`;
  }
}
