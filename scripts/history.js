/**
 * scripts/history.js
 * HistoryManager — persistent history backed by chrome.storage.local (unlimitedStorage).
 *
 * Three entry types:
 *   "ai_generation" — AI chart generation run
 *   "run"           — Automation run (chart publishing)
 *   "import"        — Excel file import session
 *
 * Schema per entry:
 * {
 *   id:         string,         // unique "<timestamp>-<random>"
 *   type:       string,         // "ai_generation" | "run" | "import"
 *   timestamp:  number,         // Date.now()
 *   label:      string,         // Human-readable summary for list display
 *   charts:     Array|null,     // Full chart objects (ai_generation, import)
 *   runSummary: Object|null,    // { total, completed, failed, processedCharts[] }
 *   meta:       Object|null     // Extra info: { platform, model, fileName, ... }
 * }
 */

const HISTORY_KEY = "aplusHistory";
const MAX_ENTRIES = 200;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const HistoryManager = {
  /**
   * Saves a new history entry, prepending it to the list.
   * Trims to MAX_ENTRIES to prevent unbounded growth.
   * @param {Object} entry - Partial entry (id + timestamp auto-assigned)
   * @returns {Promise<Object>} The saved entry with id + timestamp
   */
  async saveEntry(entry) {
    const all = await this.loadAll();
    const saved = {
      id: generateId(),
      timestamp: Date.now(),
      charts: null,
      runSummary: null,
      meta: null,
      ...entry,
    };
    all.unshift(saved);
    await chrome.storage.local.set({ [HISTORY_KEY]: all.slice(0, MAX_ENTRIES) });
    return saved;
  },

  /**
   * Loads all history entries, newest first.
   * @returns {Promise<Array>}
   */
  async loadAll() {
    const result = await chrome.storage.local.get([HISTORY_KEY]);
    return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
  },

  /**
   * Removes a single entry by id.
   * @param {string} id
   * @returns {Promise<Array>} Remaining entries
   */
  async deleteEntry(id) {
    const all = await this.loadAll();
    const filtered = all.filter((e) => e.id !== id);
    await chrome.storage.local.set({ [HISTORY_KEY]: filtered });
    return filtered;
  },

  /**
   * Removes all history entries.
   * @returns {Promise<void>}
   */
  async clearAll() {
    await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  },
};
