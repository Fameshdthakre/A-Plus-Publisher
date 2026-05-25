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
    if (err && err.message && err.message.includes("Receiving end does not exist")) {
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
            const result = await chrome.storage.local.get(['pendingQueue', 'automationPortal', 'automationDomain']);
            this.queue = result.pendingQueue || [];
            this.portal = result.automationPortal || "vendor";
            this.domain = result.automationDomain || "com";
        } else if (charts) {
            this.queue = charts;
            this.portal = portal || "vendor";
            this.domain = domain || "com";
            await chrome.storage.local.set({ 
                pendingQueue: this.queue, 
                processedCharts: [],
                automationPortal: this.portal,
                automationDomain: this.domain
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
        chrome.storage.local.remove('pendingQueue');
        safeSendMessage({ type: "AUTOMATION_STATUS", status: "Stopped by user.", progress: 0 });

        if (this.currentTabId) {
            safeSendTabMessage(this.currentTabId, { type: "STOP_EXECUTION" });
        }
    }

    async completeJob(chart) {
        if (!this.isExecuting) return;

        if (this.currentTabId) {
            chrome.tabs.remove(this.currentTabId, () => {
                if (chrome.runtime.lastError) {
                    console.log("A-Plus Publisher: Error closing completed tab:", chrome.runtime.lastError.message);
                }
            });
            this.currentTabId = null;
        }

        const res = await chrome.storage.local.get(['processedCharts']);
        let processed = res.processedCharts || [];
        if (chart) {
            processed.push(chart);
            await chrome.storage.local.set({ processedCharts: processed });
        }
        this.processNext();
    }

    processNext() {
        if (!this.isExecuting) return;

        if (this.queue.length === 0) {
            this.isExecuting = false;
            chrome.storage.local.remove('pendingQueue');
            safeSendMessage({ type: "AUTOMATION_STATUS", status: "All charts processed!", progress: 100 });
            return;
        }

        const nextChart = this.queue.shift();
        chrome.storage.local.set({ pendingQueue: this.queue });

        safeSendMessage({
            type: "AUTOMATION_STATUS",
            status: `Navigating to draft for ${nextChart.name}...`,
            progress: 10
        });

        // Use selected portal and domain if draft URL is blank
        let targetUrl = nextChart.draftUrl;
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
            status: nextChart.draftUrl 
                ? `Navigating to draft for ${nextChart.name}...`
                : `Navigating to A+ Content Manager to create draft for ${nextChart.name}...`,
            progress: 10
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
                if (tabId === this.currentTabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    safeSendMessage({ type: "AUTOMATION_STATUS", status: `Injecting automation engine...`, progress: 10 });
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ["scripts/automation.js"]
                    }).then(() => {
                        setTimeout(() => {
                            this.executeWithRetry(this.currentTabId, nextChart, 0, true);
                        }, 1000);
                    }).catch(err => {
                        console.warn("Injection failed:", err);
                        setTimeout(() => {
                            this.executeWithRetry(this.currentTabId, nextChart, 0, false);
                        }, 1000);
                    });
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    }

    executeWithRetry(tabId, chart, attempt, scriptInjected = false) {
        if (!this.isExecuting) {
            console.log("executeWithRetry: Halt execution since isExecuting is false.");
            return;
        }

        if (attempt > 40) { // Give it about 60+ seconds max
            safeSendMessage({ type: "AUTOMATION_STATUS", status: `Error: Could not connect to Amazon page.`, progress: 0 });
            this.isExecuting = false;
            return;
        }

        chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
            if (!this.isExecuting) return;

            if (chrome.runtime.lastError || !response || response.status !== "ready") {
                safeSendMessage({ type: "AUTOMATION_STATUS", status: `Waiting for Amazon to load... (Attempt ${attempt + 1}/40)`, progress: 10 });

                // PERF-4: Exponential backoff — faster on quick-loading pages,
                // patient on slow ones. Caps at 8s. Formula: 500ms * 2^attempt.
                const delay = Math.min(500 * Math.pow(2, attempt), 8000);

                if (attempt > 0 && attempt % 3 === 0) {
                    safeSendMessage({ type: "AUTOMATION_STATUS", status: `Injecting automation engine...`, progress: 10 });
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ["scripts/automation.js"]
                    }).then(() => {
                        setTimeout(() => this.executeWithRetry(tabId, chart, attempt + 1, true), delay);
                    }).catch(err => {
                        console.warn("Injection failed:", err);
                        setTimeout(() => this.executeWithRetry(tabId, chart, attempt + 1, false), delay);
                    });
                } else {
                    setTimeout(() => this.executeWithRetry(tabId, chart, attempt + 1, scriptInjected), delay);
                }
            } else {
                // It's ready, execute!
                safeSendTabMessage(tabId, {
                    type: "EXECUTE_AUTOMATION",
                    data: { chart: chart }
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
            message.data ? message.data.domain : null
        );
    }

    if (message.type === "CHART_COMPLETED") {
        jobManager.completeJob(message.data ? message.data.chart : null);
    }

    if (message.type === "STOP_AUTOMATION") {
        jobManager.stop();
    }

    if (message.type === "AUTOMATION_STATUS") {
        safeSendMessage(message);
    }

    if (message.type === "GET_AUTOMATION_STATE") {
        sendResponse({ isRunning: jobManager.isExecuting });
    }
});
