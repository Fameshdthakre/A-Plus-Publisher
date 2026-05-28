// background.js

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("A-Plus Publisher Extension Installed");
});

// ── Safe Message Helpers ─────────────────────────────────────────────
// These catch "Receiving end does not exist" when the sidepanel or
// content script isn't listening, preventing Uncaught (in promise) errors.

function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message).catch(suppressConnectionError);
  } catch (e) {
    suppressConnectionError(e);
  }
}

function safeSendTabMessage(tabId, message) {
  try {
    chrome.tabs.sendMessage(tabId, message).catch(suppressConnectionError);
  } catch (e) {
    suppressConnectionError(e);
  }
}

function suppressConnectionError(err) {
  // Silently ignore the expected "no receiver" error; log anything else
  if (
    err &&
    err.message &&
    err.message.includes("Receiving end does not exist")
  ) {
    // Expected when sidepanel is closed or content script not injected
    return;
  }
  console.warn("Background message warning:", err);
}

class JobManager {
  constructor() {
    this.queue = [];
    this.currentTabId = null;
    this.isExecuting = false;
    this.portal = "vendor";
    this.domain = "com";
  }

  async start(charts = null, resume = false, portal = null, domain = null) {
    this.isExecuting = true;
    if (resume) {
      const result = await chrome.storage.local.get([
        "pendingQueue",
        "automationPortal",
        "automationDomain",
      ]);
      this.queue = result.pendingQueue || [];
      this.portal = result.automationPortal || "vendor";
      this.domain = result.automationDomain || "com";
    } else if (charts) {
      // Group charts by target draft:
      // 1. If draftUrl is present, group by draftUrl.
      // 2. If draftUrl is missing, group by contentTitle (case-insensitive, fallback to name) if non-empty.
      // 3. Otherwise, treat as its own group of 1 chart.
      const groups = [];
      const urlGroups = {};
      const titleGroups = {};

      for (const chart of charts) {
        if (chart.draftUrl && chart.draftUrl.trim() !== "") {
          const normalizedUrl = chart.draftUrl.trim().toLowerCase();
          if (!urlGroups[normalizedUrl]) {
            urlGroups[normalizedUrl] = [];
            groups.push({
              draftUrl: chart.draftUrl.trim(),
              contentTitle: chart.contentTitle || chart.name || "",
              charts: urlGroups[normalizedUrl],
            });
          }
          urlGroups[normalizedUrl].push(chart);
        } else {
          const title = (chart.contentTitle || "").trim();
          if (title !== "") {
            const normalizedTitle = title.toLowerCase();
            if (!titleGroups[normalizedTitle]) {
              titleGroups[normalizedTitle] = [];
              groups.push({
                draftUrl: null,
                contentTitle: title,
                charts: titleGroups[normalizedTitle],
              });
            }
            titleGroups[normalizedTitle].push(chart);
          } else {
            groups.push({
              draftUrl: null,
              contentTitle: chart.name || "New Draft",
              charts: [chart],
            });
          }
        }
      }

      this.queue = groups;
      this.portal = portal || "vendor";
      this.domain = domain || "com";
      await chrome.storage.local.set({
        pendingQueue: this.queue,
        processedCharts: [],
        automationPortal: this.portal,
        automationDomain: this.domain,
      });
    }

    if (this.queue.length > 0) {
      this.processNext();
    } else {
      this.isExecuting = false;
    }
  }

  stop() {
    this.isExecuting = false;
    this.queue = [];
    chrome.storage.local.remove("pendingQueue");
    safeSendMessage({
      type: "AUTOMATION_STATUS",
      status: "Stopped by user.",
      progress: 0,
    });

    if (this.currentTabId) {
      safeSendTabMessage(this.currentTabId, { type: "STOP_EXECUTION" });
    }
  }

  async completeJob(chart) {
    // Fallback for single chart complete messages (backward compatibility)
    if (chart) {
      await this.completeGroupJob([chart]);
    } else {
      await this.completeGroupJob([]);
    }
  }

  async completeGroupJob(charts) {
    if (!this.isExecuting) return;

    if (this.currentTabId) {
      const tabId = this.currentTabId;
      this.currentTabId = null;

      // Neutralize the "Leave site?" beforeunload dialog before closing
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => {
            window.onbeforeunload = null;
            window.addEventListener(
              "beforeunload",
              (e) => {
                e.stopImmediatePropagation();
                e.preventDefault();
                delete e.returnValue;
              },
              true,
            );
          },
        });
      } catch (e) {
        console.warn("A-Plus Publisher: Could not neutralize beforeunload:", e);
      }

      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          console.log(
            "A-Plus Publisher: Error closing completed tab:",
            chrome.runtime.lastError.message,
          );
        }
      });
    }

    const res = await chrome.storage.local.get(["processedCharts"]);
    let processed = res.processedCharts || [];
    if (charts && Array.isArray(charts)) {
      processed = processed.concat(charts);
      await chrome.storage.local.set({ processedCharts: processed });
    }
    this.processNext();
  }

  processNext() {
    if (!this.isExecuting) return;

    if (this.queue.length === 0) {
      this.isExecuting = false;
      chrome.storage.local.remove("pendingQueue");
      safeSendMessage({
        type: "AUTOMATION_STATUS",
        status: "All charts processed!",
        progress: 100,
      });
      return;
    }

    const nextGroup = this.queue.shift();
    chrome.storage.local.set({ pendingQueue: this.queue });

    let targetUrl = nextGroup.draftUrl;
    if (!targetUrl) {
      const domainVal = this.domain || "com";
      const portalVal = this.portal || "vendor";
      if (portalVal === "seller") {
        targetUrl = `https://sellercentral.amazon.${domainVal}/enhanced-content/content-manager`;
      } else {
        targetUrl = `https://vendorcentral.amazon.${domainVal}/hz/vendor/members/aplus/content-manager`;
      }
    }

    safeSendMessage({
      type: "AUTOMATION_STATUS",
      status: nextGroup.draftUrl
        ? `Navigating to draft: ${nextGroup.contentTitle}...`
        : `Navigating to A+ Content Manager to create draft for ${nextGroup.contentTitle}...`,
      progress: 10,
    });

    chrome.tabs.create({ url: targetUrl, active: true }, (tab) => {
      this.currentTabId = tab.id;

      if (tab && tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true });
      }
      if (tab && tab.id) {
        chrome.tabs.update(tab.id, { active: true });
      }

      const listener = (tabId, info) => {
        if (tabId === this.currentTabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          safeSendMessage({
            type: "AUTOMATION_STATUS",
            status: `Injecting automation engine...`,
            progress: 10,
          });
          chrome.scripting
            .executeScript({
              target: { tabId: tabId },
              files: ["scripts/automation.js"],
            })
            .then(() => {
              setTimeout(() => {
                this.executeWithRetry(this.currentTabId, nextGroup, 0, true);
              }, 1000);
            })
            .catch((err) => {
              console.warn("Injection failed:", err);
              setTimeout(() => {
                this.executeWithRetry(this.currentTabId, nextGroup, 0, false);
              }, 1000);
            });
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  executeWithRetry(tabId, group, attempt, scriptInjected = false) {
    if (!this.isExecuting) {
      console.log(
        "executeWithRetry: Halt execution since isExecuting is false.",
      );
      return;
    }

    if (attempt > 40) {
      // Give it about 60+ seconds max
      safeSendMessage({
        type: "AUTOMATION_STATUS",
        status: `Error: Could not connect to Amazon page.`,
        progress: 0,
      });
      this.isExecuting = false;
      return;
    }

    chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
      if (!this.isExecuting) return;

      if (
        chrome.runtime.lastError ||
        !response ||
        response.status !== "ready"
      ) {
        safeSendMessage({
          type: "AUTOMATION_STATUS",
          status: `Waiting for Amazon to load... (Attempt ${attempt + 1}/40)`,
          progress: 10,
        });

        const delay = Math.min(500 * Math.pow(2, attempt), 8000);

        if (attempt > 0 && attempt % 3 === 0) {
          safeSendMessage({
            type: "AUTOMATION_STATUS",
            status: `Injecting automation engine...`,
            progress: 10,
          });
          chrome.scripting
            .executeScript({
              target: { tabId: tabId },
              files: ["scripts/automation.js"],
            })
            .then(() => {
              setTimeout(
                () => this.executeWithRetry(tabId, group, attempt + 1, true),
                delay,
              );
            })
            .catch((err) => {
              console.warn("Injection failed:", err);
              setTimeout(
                () => this.executeWithRetry(tabId, group, attempt + 1, false),
                delay,
              );
            });
        } else {
          setTimeout(
            () =>
              this.executeWithRetry(tabId, group, attempt + 1, scriptInjected),
            delay,
          );
        }
      } else {
        // It's ready, execute!
        safeSendTabMessage(tabId, {
          type: "EXECUTE_AUTOMATION",
          data: { group: group },
        });
      }
    });
  }
}

const jobManager = new JobManager();

// ── Message Router ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_AUTOMATION") {
    jobManager.start(
      message.data ? message.data.charts : null,
      message.data ? message.data.resume : false,
      message.data ? message.data.portal : null,
      message.data ? message.data.domain : null,
    );
  }

  if (message.type === "CHART_COMPLETED") {
    jobManager.completeJob(message.data ? message.data.chart : null);
  }

  if (message.type === "GROUP_COMPLETED") {
    jobManager.completeGroupJob(message.data ? message.data.charts : null);
  }

  if (message.type === "STOP_AUTOMATION") {
    jobManager.stop();
  }

  if (message.type === "GET_AUTOMATION_STATE") {
    sendResponse({ isRunning: jobManager.isExecuting });
  }

  if (message.type === "CLOSE_CURRENT_TAB" && sender.tab) {
    const tabId = sender.tab.id;
    // Neutralize beforeunload dialog first
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => {
          window.onbeforeunload = null;
          window.addEventListener(
            "beforeunload",
            (e) => {
              e.stopImmediatePropagation();
              e.preventDefault();
              delete e.returnValue;
            },
            true,
          );
        },
      })
      .catch(() => {})
      .finally(() => {
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) {
            console.log(
              "A-Plus Publisher: Could not close tab:",
              chrome.runtime.lastError.message,
            );
          }
        });
      });
  }
});

// ── Network API Interceptor for Deterministic Waits ─────────────────
// Allows automation.js to wait for true save completion instead of arbitrary wait() timeouts.

const amazonApiUrls = [
  "https://*.amazon.com/*",
  "https://*.amazon.in/*",
  "https://*.amazon.co.uk/*",
  "https://*.amazon.ca/*",
  "https://*.amazon.de/*",
  "https://*.amazon.fr/*",
  "https://*.amazon.it/*",
  "https://*.amazon.es/*",
];

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (
      details.url.includes("/aplus/api/") ||
      details.url.includes("/enhanced-content/api/")
    ) {
      if (details.url.toLowerCase().includes("save")) {
        if (details.statusCode >= 200 && details.statusCode < 300) {
          safeSendTabMessage(details.tabId, {
            type: "NETWORK_SAVE_COMPLETE",
            success: true,
          });
        } else {
          safeSendTabMessage(details.tabId, {
            type: "NETWORK_SAVE_COMPLETE",
            success: false,
            statusCode: details.statusCode,
          });
        }
      }
    }
  },
  { urls: amazonApiUrls },
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (
      details.url.includes("/aplus/api/") ||
      details.url.includes("/enhanced-content/api/")
    ) {
      if (details.url.toLowerCase().includes("save")) {
        safeSendTabMessage(details.tabId, {
          type: "NETWORK_SAVE_COMPLETE",
          success: false,
          error: details.error,
        });
      }
    }
  },
  { urls: amazonApiUrls },
);
