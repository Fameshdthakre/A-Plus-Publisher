// sidepanel.js

import { setupAIGenerator } from "../scripts/ai-generator.js";
import { HistoryManager } from "../scripts/history.js";

// Mock Chrome Extension APIs if running in normal web page for local testing/preview
if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
  window.chrome = {
    storage: {
      local: {
        get: (keys, callback) => {
          callback({});
        },
        remove: (keys, callback) => {
          if (callback) callback();
        },
        set: (data, callback) => {
          if (callback) callback();
        },
      },
    },
    runtime: {
      sendMessage: (message, callback) => {
        if (callback) callback({ status: "ok" });
      },
      onMessage: { addListener: (listener) => { } },
    },
  };
}

function sanitizeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const dataPreview = document.getElementById("dataPreview");
  const previewContainer = document.getElementById("previewContainer");
  const chartCountBadge = document.getElementById("chartCountBadge");

  const clearDataBtn = document.getElementById("clearData");
  const toggleAllChartsBtn = document.getElementById("toggleAllCharts");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusContainer = document.getElementById("statusContainer");
  const progressFill = document.getElementById("progressFill");
  const statusText = document.getElementById("statusText");
  const validationCard = document.getElementById("validationCard");
  const validationList = document.getElementById("validationList");
  const downloadAllChartsBtn = document.getElementById("downloadAllChartsBtn");

  if (downloadAllChartsBtn) {
    downloadAllChartsBtn.addEventListener("click", () => {
      downloadAllChartsAsExcel(parsedData);
    });
  }

  // --- Tab Logic ---
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  // BUG-5: Track the active tab/content element directly for O(1) swap
  // instead of iterating all tabs every click (was O(n) forEach clear+add).
  let activeTabBtn = tabBtns[0];
  let activeTabContent = tabContents[0];
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (activeTabBtn) activeTabBtn.classList.remove("active");
      if (activeTabContent) activeTabContent.classList.remove("active");
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.add("active");
      activeTabBtn = btn;
      activeTabContent = target;
    });
  });

  // --- History Tab UI Listeners ---
  const historyTabBtn = document.querySelector('[data-target="tab-history"]');
  if (historyTabBtn) {
    historyTabBtn.addEventListener("click", () => {
      renderHistory();
    });
  }

  const filterBtns = document.querySelectorAll(".history-filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderHistory(btn.dataset.filter);
    });
  });

  const clearAllHistoryBtn = document.getElementById("clearAllHistoryBtn");
  if (clearAllHistoryBtn) {
    clearAllHistoryBtn.addEventListener("click", async () => {
      if (
        confirm(
          "Are you sure you want to clear all history? This cannot be undone.",
        )
      ) {
        await HistoryManager.clearAll();
        renderHistory();
      }
    });
  }

  const resumeCard = document.getElementById("resumeCard");
  const resumeBtn = document.getElementById("resumeBtn");
  const discardQueueBtn = document.getElementById("discardQueueBtn");
  const resumeText = document.getElementById("resumeText");
  const downloadTemplateBtn = document.getElementById("downloadTemplate");

  let parsedData = null;
  let openAccordionIndex = 0; // Keep track of which accordion is open

  // PERF-1: Debounce validateInputs so rapid keystrokes in text inputs don't
  // trigger full ASIN regex validation on every character. Discrete actions
  // (checkboxes, toggles, add/delete) call validateInputs() directly (no debounce).
  let _validateTimer = null;
  function validateInputsDebounced() {
    clearTimeout(_validateTimer);
    _validateTimer = setTimeout(validateInputs, 150);
  }

  // Check for pending queue
  chrome.storage.local.get(["pendingQueue"], (result) => {
    if (result.pendingQueue && result.pendingQueue.length > 0) {
      dropzone.classList.add("hidden");
      resumeCard.classList.remove("hidden");
      resumeText.textContent = `You have ${result.pendingQueue.length} unfinished chart(s) in the queue.`;
    }
  });

  resumeBtn.addEventListener("click", () => {
    resumeCard.classList.add("hidden");
    statusContainer.classList.remove("hidden");
    chrome.runtime.sendMessage({
      type: "START_AUTOMATION",
      data: { resume: true },
    });
  });

  discardQueueBtn.addEventListener("click", () => {
    if (
      confirm(
        "Are you sure you want to discard the pending automation queue? This will clear all pending charts.",
      )
    ) {
      chrome.storage.local.remove("pendingQueue");
      resumeCard.classList.add("hidden");
      dropzone.classList.remove("hidden");
    }
  });

  dropzone.addEventListener("click", (e) => {
    if (e.target !== downloadTemplateBtn) fileInput.click();
  });

  downloadTemplateBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    generateTemplate();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-active");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-active");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  function makeCell(value, style = {}, type = null) {
    const cellObj = { v: value };
    if (type) cellObj.t = type;
    else
      cellObj.t =
        typeof value === "number"
          ? "n"
          : typeof value === "boolean"
            ? "b"
            : "s";

    cellObj.s = {
      font: { name: "Calibri", sz: 10, ...(style.font || {}) },
      border: {
        top: { style: "thin", color: { rgb: "D9D9D9" } },
        bottom: { style: "thin", color: { rgb: "D9D9D9" } },
        left: { style: "thin", color: { rgb: "D9D9D9" } },
        right: { style: "thin", color: { rgb: "D9D9D9" } },
        ...(style.border || {}),
      },
      fill: style.fill || null,
      alignment: style.alignment || { vertical: "center" },
    };
    return cellObj;
  }

  function generateTemplate() {
    const styles = {
      docTitle: {
        font: { bold: true, sz: 14, color: { rgb: "1F497D" } },
        border: {
          top: { style: "none" },
          bottom: { style: "none" },
          left: { style: "none" },
          right: { style: "none" },
        },
      },
      docSub: {
        font: { italic: true, sz: 10, color: { rgb: "555555" } },
        border: {
          top: { style: "none" },
          bottom: { style: "none" },
          left: { style: "none" },
          right: { style: "none" },
        },
      },
      docEmpty: {
        border: {
          top: { style: "none" },
          bottom: { style: "none" },
          left: { style: "none" },
          right: { style: "none" },
        },
      },
      tblHeader: {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { patternType: "solid", fgColor: { rgb: "1F497D" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      },
      sideLabel: {
        font: { bold: true, color: { rgb: "2C3E50" }, sz: 10 },
        fill: { patternType: "solid", fgColor: { rgb: "F2F4F7" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
      configVal: {
        font: { italic: true, color: { rgb: "333333" }, sz: 10 },
        fill: { patternType: "solid", fgColor: { rgb: "FFF2CC" } },
        alignment: { horizontal: "center", vertical: "center" },
      },
      highlightCol: {
        font: { color: { rgb: "000000" }, sz: 10 },
        fill: { patternType: "solid", fgColor: { rgb: "E2EFDA" } },
        alignment: { horizontal: "center", vertical: "center" },
      },
      normalCol: {
        font: { color: { rgb: "000000" }, sz: 10 },
        alignment: { horizontal: "center", vertical: "center" },
      },
      descText: {
        font: { sz: 10, color: { rgb: "333333" } },
        alignment: { horizontal: "left", vertical: "center", wrapText: true },
      },
    };

    const instructionsData = [
      [
        makeCell(
          "A+ Comparison Chart Builder - Documentation & Instructions",
          styles.docTitle,
        ),
        makeCell("", styles.docEmpty),
      ],
      [
        makeCell(
          "This sheet explains all rules, features, and settings for comparison chart automation.",
          styles.docSub,
        ),
        makeCell("", styles.docEmpty),
      ],
      [makeCell("", styles.docEmpty), makeCell("", styles.docEmpty)],
      [
        makeCell("Feature / Configuration", styles.tblHeader),
        makeCell("Instructions & Practical Guidelines", styles.tblHeader),
      ],
      [
        makeCell("A+ Content Title", styles.sideLabel),
        makeCell(
          "Optional. Enter the overall title/name of your A+ Content project.",
          styles.descText,
        ),
      ],
      [
        makeCell("A+ Draft URL", styles.sideLabel),
        makeCell(
          "Paste the full Amazon A+ Content Draft URL in cell B3.",
          styles.descText,
        ),
      ],
      [
        makeCell("ASIN", styles.sideLabel),
        makeCell(
          "Strictly required. Row 4 contains the ASIN (10-character Amazon Identifier).",
          styles.descText,
        ),
      ],
      [
        makeCell("Highlight Column", styles.sideLabel),
        makeCell(
          "Set exactly one column to TRUE (usually Base Product) and others to FALSE.",
          styles.descText,
        ),
      ],
      [
        makeCell("Toggles: Reviews, Prices, Cart", styles.sideLabel),
        makeCell(
          "Set 'Show Reviews', 'Show Prices', and 'Show Add To Cart Button' to TRUE or FALSE.",
          styles.descText,
        ),
      ],
      [
        makeCell("Title", styles.sideLabel),
        makeCell(
          "Strictly required. The display names/titles of your products.",
          styles.descText,
        ),
      ],
      [
        makeCell("Comparison Metrics", styles.sideLabel),
        makeCell(
          "Rows 9+ represent comparison features. Up to 10 allowed.",
          styles.descText,
        ),
      ],
      [
        makeCell("Checkmarks & Icons", styles.sideLabel),
        makeCell(
          "Green checkmark: 'True', 'Check', '✔', or '✓'.\nEmpty circle: 'False', or 'N'.\nText values: 'Yes', 'No', 'X', or any other text.",
          styles.descText,
        ),
      ],
    ];

    const chartData = [
      [
        makeCell("Label / Attribute", styles.tblHeader),
        makeCell("Base Product", styles.tblHeader),
        makeCell("Competitor 1", styles.tblHeader),
        makeCell("Competitor 2", styles.tblHeader),
        makeCell("Competitor 3", styles.tblHeader),
        makeCell("Competitor 4", styles.tblHeader),
        makeCell("Competitor 5", styles.tblHeader),
      ],
      [
        makeCell("A+ Content Title", styles.sideLabel),
        makeCell("My Premium Comparison Chart", styles.configVal),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
      ],
      [
        makeCell("A+ Draft URL", styles.sideLabel),
        makeCell(
          "https://sellercentral.amazon.com/aplus/edit/...",
          styles.configVal,
        ),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
        makeCell("", styles.configVal),
      ],
      [
        makeCell("ASIN", styles.sideLabel),
        makeCell("B0XXXXXXXX", styles.highlightCol),
        makeCell("B0YYYYYYYY", styles.normalCol),
        makeCell("B0ZZZZZZZZ", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
      [
        makeCell("Highlight Column", styles.sideLabel),
        makeCell("TRUE", styles.highlightCol),
        makeCell("FALSE", styles.normalCol),
        makeCell("FALSE", styles.normalCol),
        makeCell("FALSE", styles.normalCol),
        makeCell("FALSE", styles.normalCol),
        makeCell("FALSE", styles.normalCol),
      ],
      [
        makeCell("Show Reviews", styles.sideLabel),
        makeCell("TRUE", styles.highlightCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
      [
        makeCell("Show Prices", styles.sideLabel),
        makeCell("TRUE", styles.highlightCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
      [
        makeCell("Show Add To Cart Button", styles.sideLabel),
        makeCell("TRUE", styles.highlightCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
      [
        makeCell("Title", styles.sideLabel),
        makeCell("Your Main Product", styles.highlightCol),
        makeCell("Competitor A", styles.normalCol),
        makeCell("Competitor B", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
      [
        makeCell("Customer Rating", styles.sideLabel),
        makeCell("4.8", styles.highlightCol),
        makeCell("4.2", styles.normalCol),
        makeCell("4.5", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
      [
        makeCell("Warranty", styles.sideLabel),
        makeCell("2 Years", styles.highlightCol),
        makeCell("1 Year", styles.normalCol),
        makeCell("6 Months", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
      [
        makeCell("Waterproof", styles.sideLabel),
        makeCell("Yes", styles.highlightCol),
        makeCell("No", styles.normalCol),
        makeCell("Yes", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ],
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(chartData);
    worksheet["!cols"] = [
      { wch: 25 },
      { wch: 30 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
    ];
    const instrSheet = XLSX.utils.aoa_to_sheet(instructionsData);
    instrSheet["!cols"] = [{ wch: 25 }, { wch: 75 }];
    worksheet["!views"] = [{ showGridLines: true }];
    instrSheet["!views"] = [{ showGridLines: true }];

    XLSX.utils.book_append_sheet(workbook, instrSheet, "Instructions");
    XLSX.utils.book_append_sheet(workbook, worksheet, "A+ Comparison Chart");
    XLSX.writeFile(workbook, "APlus_Comparison_Template.xlsx", {
      bookType: "xlsx",
    });
  }

  // Shared style constants for Excel chart sheets
  const CHART_SHEET_STYLES = {
    tblHeader: {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { patternType: "solid", fgColor: { rgb: "1F497D" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    },
    sideLabel: {
      font: { bold: true, color: { rgb: "2C3E50" }, sz: 10 },
      fill: { patternType: "solid", fgColor: { rgb: "F2F4F7" } },
      alignment: { horizontal: "left", vertical: "center" },
    },
    configVal: {
      font: { italic: true, color: { rgb: "333333" }, sz: 10 },
      fill: { patternType: "solid", fgColor: { rgb: "FFF2CC" } },
      alignment: { horizontal: "center", vertical: "center" },
    },
    highlightCol: {
      font: { color: { rgb: "000000" }, sz: 10 },
      fill: { patternType: "solid", fgColor: { rgb: "E2EFDA" } },
      alignment: { horizontal: "center", vertical: "center" },
    },
    normalCol: {
      font: { color: { rgb: "000000" }, sz: 10 },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };

  /**
   * Builds a styled SheetJS worksheet object for a single chart.
   * Shared by both single-chart and all-charts Excel exports.
   */
  function buildChartWorksheet(chart) {
    const styles = CHART_SHEET_STYLES;
    const getColStyle = (colIdx) =>
      chart.highlightColumn && chart.highlightColumn[colIdx]
        ? styles.highlightCol
        : styles.normalCol;

    const headers = [
      makeCell("Label / Attribute", styles.tblHeader),
      makeCell("Base Product", styles.tblHeader),
    ];
    for (let i = 1; i < 6; i++) {
      headers.push(makeCell(`Competitor ${i}`, styles.tblHeader));
    }

    const rows = [
      headers,
      [
        makeCell("A+ Content Title", styles.sideLabel),
        makeCell(chart.contentTitle || "", styles.configVal),
        ...Array.from({ length: 5 }, () => makeCell("", styles.configVal)),
      ],
      [
        makeCell("A+ Draft URL", styles.sideLabel),
        makeCell(chart.draftUrl || "", styles.configVal),
        ...Array.from({ length: 5 }, () => makeCell("", styles.configVal)),
      ],
      [
        makeCell("ASIN", styles.sideLabel),
        ...Array.from({ length: 6 }, (_, idx) => makeCell(chart.asins[idx] || "", getColStyle(idx))),
      ],
      [
        makeCell("Highlight Column", styles.sideLabel),
        ...Array.from({ length: 6 }, (_, idx) => makeCell(chart.highlightColumn[idx] ? "TRUE" : "FALSE", getColStyle(idx))),
      ],
      [
        makeCell("Show Reviews", styles.sideLabel),
        makeCell(chart.showReviews ? "TRUE" : "FALSE", getColStyle(0)),
        ...Array.from({ length: 5 }, (_, idx) => makeCell("", getColStyle(idx + 1))),
      ],
      [
        makeCell("Show Prices", styles.sideLabel),
        makeCell(chart.showPrices ? "TRUE" : "FALSE", getColStyle(0)),
        ...Array.from({ length: 5 }, (_, idx) => makeCell("", getColStyle(idx + 1))),
      ],
      [
        makeCell("Show Add To Cart Button", styles.sideLabel),
        makeCell(chart.showAddToCart ? "TRUE" : "FALSE", getColStyle(0)),
        ...Array.from({ length: 5 }, (_, idx) => makeCell("", getColStyle(idx + 1))),
      ],
      [
        makeCell("Title", styles.sideLabel),
        ...Array.from({ length: 6 }, (_, idx) => makeCell(chart.titles[idx] || "", getColStyle(idx))),
      ],
    ];

    if (Array.isArray(chart.attributes)) {
      chart.attributes.forEach((attr) => {
        if (!attr || !attr.name) return;
        rows.push([
          makeCell(attr.name, styles.sideLabel),
          ...Array.from({ length: 6 }, (_, idx) => makeCell(attr.values[idx] || "", getColStyle(idx))),
        ]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 25 }, { wch: 30 }, { wch: 20 },
      { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
    ];
    ws["!views"] = [{ showGridLines: true }];
    return ws;
  }

  /** Shared Instructions sheet builder */
  function buildInstructionsSheet() {
    const styles = CHART_SHEET_STYLES;
    const noBorder = { border: { top: { style: "none" }, bottom: { style: "none" }, left: { style: "none" }, right: { style: "none" } } };
    const descStyle = { font: { sz: 10, color: { rgb: "333333" } }, alignment: { horizontal: "left", vertical: "center", wrapText: true } };
    const data = [
      [makeCell("A+ Comparison Chart Builder - Documentation & Instructions", { font: { bold: true, sz: 14, color: { rgb: "1F497D" } }, ...noBorder }), makeCell("", noBorder)],
      [makeCell("This sheet explains all rules, features, and settings for comparison chart automation.", { font: { italic: true, sz: 10, color: { rgb: "555555" } }, ...noBorder }), makeCell("", noBorder)],
      [makeCell("", noBorder), makeCell("", noBorder)],
      [makeCell("Feature / Configuration", styles.tblHeader), makeCell("Instructions & Practical Guidelines", styles.tblHeader)],
      [makeCell("A+ Content Title", styles.sideLabel), makeCell("Optional. Enter the overall title/name of your A+ Content project.", descStyle)],
      [makeCell("A+ Draft URL", styles.sideLabel), makeCell("Paste the full Amazon A+ Content Draft URL in cell B3.", descStyle)],
      [makeCell("ASIN", styles.sideLabel), makeCell("Strictly required. Row 4 contains the ASIN (10-character Amazon Identifier).", descStyle)],
      [makeCell("Highlight Column", styles.sideLabel), makeCell("Set exactly one column to TRUE (usually Base Product) and others to FALSE.", descStyle)],
      [makeCell("Toggles: Reviews, Prices, Cart", styles.sideLabel), makeCell("Set 'Show Reviews', 'Show Prices', and 'Show Add To Cart Button' to TRUE or FALSE.", descStyle)],
      [makeCell("Title", styles.sideLabel), makeCell("Strictly required. The display names/titles of your products.", descStyle)],
      [makeCell("Comparison Metrics", styles.sideLabel), makeCell("Rows 9+ represent comparison features. Up to 10 allowed.", descStyle)],
      [makeCell("Checkmarks & Icons", styles.sideLabel), makeCell("Green checkmark: 'True', 'Check', '\u2714', or '\u2713'.\nEmpty circle: 'False', or 'N'.\nText values: 'Yes', 'No', 'X', or any other text.", descStyle)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 25 }, { wch: 75 }];
    ws["!views"] = [{ showGridLines: true }];
    return ws;
  }

  /** Downloads a single chart as a standalone Excel workbook */
  function downloadChartAsExcel(chart) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, buildInstructionsSheet(), "Instructions");
    XLSX.utils.book_append_sheet(workbook, buildChartWorksheet(chart), "A+ Comparison Chart");
    const sanitizedName = (chart.name || "APlus_Chart").replace(/[^a-zA-Z0-9_\-]/g, "_");
    XLSX.writeFile(workbook, `${sanitizedName}.xlsx`, { bookType: "xlsx" });
  }

  /**
   * Downloads all provided charts into a single Excel workbook.
   * Each chart becomes a separate sheet tab named after chart.name.
   * An Instructions sheet is prepended as the first tab.
   */
  function downloadAllChartsAsExcel(charts) {
    if (!charts || charts.length === 0) {
      alert("No charts to download.");
      return;
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, buildInstructionsSheet(), "Instructions");

    // Track used sheet names to avoid duplicates (Excel requires unique tab names)
    const usedNames = new Set(["Instructions"]);
    charts.forEach((chart) => {
      // Excel tab names: max 31 chars, no special chars
      let sheetName = (chart.name || "Chart")
        .replace(/[\\\/?*\[\]:]/g, "_")  // strip Excel-illegal chars
        .slice(0, 31);
      // Deduplicate by appending a counter
      let candidate = sheetName;
      let counter = 2;
      while (usedNames.has(candidate)) {
        const suffix = ` (${counter++})`;
        candidate = sheetName.slice(0, 31 - suffix.length) + suffix;
      }
      usedNames.add(candidate);
      XLSX.utils.book_append_sheet(workbook, buildChartWorksheet(chart), candidate);
    });

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(workbook, `APlus_All_Charts_${ts}.xlsx`, { bookType: "xlsx" });
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      parsedData = [];
      workbook.SheetNames.forEach((sheetName) => {
        if (sheetName.toLowerCase() === "instructions") return;
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (json.length > 0) {
          const chartData = processData(json, sheetName);
          if (chartData.asins.length > 0 || chartData.attributes.length > 0) {
            parsedData.push(chartData);
          }
        }
      });

      if (parsedData.length > 0) {
        openAccordionIndex = 0;
        renderPreview();
        validateInputs();

        // Save to history
        HistoryManager.saveEntry({
          type: "import",
          label: `Import · ${file.name} · ${parsedData.length} charts`,
          charts: JSON.parse(JSON.stringify(parsedData)),
          meta: { fileName: file.name },
        }).then(() => renderHistory());
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function processData(data, sheetName) {
    let contentTitle = "";
    let draftUrl = "";
    let previewUrl = "";
    let asins = [];
    let highlightColumn = [];
    let showReviews = true;
    let showPrices = true;
    let showAddToCart = true;
    let titles = [];
    let attributes = [];

    // PERF-3: Build a label-to-rowIndex map in a single pass to avoid running
    // data.find() (pass 1) followed by data.forEach() (pass 2).
    let activeCols = [];
    const KNOWN_LABELS = new Set([
      "A+ CONTENT TITLE", "A+ DRAFT URL", "ASIN", "HIGHLIGHT COLUMN",
      "SHOW REVIEWS", "SHOW PRICES", "SHOW ADD TO CART BUTTON", "TITLE"
    ]);

    data.forEach((row, idx) => {
      if (idx === 0) return; // skip header row
      const label = String(row[0] || "").trim().toUpperCase();

      // Derive activeCols on the ASIN row (same pass, no separate .find)
      if (label === "ASIN") {
        activeCols = [];
        for (let c = 0; c < 6; c++) {
          if (String(row[c + 1] || "").trim()) activeCols.push(c);
        }
        asins = activeCols.map((c) => String(row[c + 1] || "").trim());
        return;
      }

      if (label === "A+ CONTENT TITLE") {
        contentTitle = String(row[1] || "").trim();
      } else if (label === "A+ DRAFT URL") {
        draftUrl = String(row[1] || "").trim();
        const match = draftUrl.match(/\/content\/([a-f0-9\-]{36})/i);
        if (match && match[1]) {
          previewUrl = `https://vendorcentral.amazon.com/aplus/api/GetContentPreview?contentId=${match[1]}&deviceType=DESKTOP`;
        }
      } else if (label === "HIGHLIGHT COLUMN") {
        // activeCols may not be set yet if HIGHLIGHT row precedes ASIN row;
        // normalise length at the end.
        highlightColumn = (activeCols.length ? activeCols : [0, 1, 2, 3, 4, 5]).map(
          (c) => String(row[c + 1] || "").trim().toUpperCase() === "TRUE"
        );
      } else if (label === "SHOW REVIEWS") {
        showReviews = String(row[1] || "").trim().toUpperCase() === "TRUE";
      } else if (label === "SHOW PRICES") {
        showPrices = String(row[1] || "").trim().toUpperCase() === "TRUE";
      } else if (label === "SHOW ADD TO CART BUTTON") {
        showAddToCart = String(row[1] || "").trim().toUpperCase() === "TRUE";
      } else if (label === "TITLE") {
        titles = (activeCols.length ? activeCols : [0, 1, 2, 3, 4, 5]).map(
          (c) => String(row[c + 1] || "").trim()
        );
      } else if (row[0] && !KNOWN_LABELS.has(label)) {
        const rowLabel = String(row[0]).trim();
        if (/^row\s*(6|7|8|9|10)$/i.test(rowLabel)) return;
        if (attributes.length < 10) {
          const cols = activeCols.length ? activeCols : [0, 1, 2, 3, 4, 5];
          const values = cols.map((c) =>
            row[c + 1] === undefined ? "" : String(row[c + 1]).trim()
          );
          attributes.push({ name: row[0], values });
        }
      }
    });

    if (activeCols.length === 0) activeCols = [0, 1, 2, 3, 4, 5]; // fallback if no ASIN row

    // Ensure array lengths match (normalize)
    const colCount = Math.max(
      asins.length,
      titles.length,
      highlightColumn.length,
      1,
    );
    while (asins.length < colCount) asins.push("");
    while (titles.length < colCount) titles.push("");
    while (highlightColumn.length < colCount) highlightColumn.push(false);
    attributes.forEach((attr) => {
      while (attr.values.length < colCount) attr.values.push("");
    });

    return {
      name: sheetName,
      contentTitle,
      draftUrl,
      previewUrl,
      asins,
      highlightColumn,
      showReviews,
      showPrices,
      showAddToCart,
      titles,
      attributes,
    };
  }

  function renderPreview() {
    previewContainer.textContent = "";
    if (!parsedData || parsedData.length === 0) {
      dropzone.classList.remove("hidden");
      dataPreview.classList.add("hidden");
      return;
    }

    dropzone.classList.add("hidden");
    dataPreview.classList.remove("hidden");
    chartCountBadge.textContent = `${parsedData.length} chart${parsedData.length > 1 ? "s" : ""}`;

    // Show/hide the Download All button based on chart count
    const downloadAllBtn = document.getElementById("downloadAllChartsBtn");
    if (downloadAllBtn) {
      downloadAllBtn.style.display = parsedData.length > 1 ? "inline-flex" : "none";
    }

    // Update toggleAllChartsBtn label dynamically based on selection state
    const allSelected = parsedData.every((chart) => chart.selected !== false);
    if (toggleAllChartsBtn) {
      toggleAllChartsBtn.textContent = allSelected
        ? "☐ Deselect All"
        : "☑ Select All";
    }

    parsedData.forEach((chart, index) => {
      const hasErrors = getChartErrors(chart).length > 0;

      const acc = document.createElement("div");
      acc.className = `chart-accordion ${index === openAccordionIndex ? "open" : ""} ${hasErrors ? "has-errors" : "is-valid"}`;

      const accHeader = document.createElement("div");
      accHeader.className = "accordion-header";
      accHeader.setAttribute("tabindex", "0");
      accHeader.setAttribute("role", "button");
      accHeader.setAttribute(
        "aria-expanded",
        index === openAccordionIndex ? "true" : "false",
      );
      const leftDiv = document.createElement("div");
      leftDiv.className = "accordion-header-left";

      const chevron = document.createElement("span");
      chevron.className = "accordion-chevron";
      chevron.textContent = "▶";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "chart-select-cb";
      cb.checked = chart.selected !== false;
      cb.title = "Select chart for automation";
      cb.setAttribute("aria-label", `Select chart ${chart.name}`);

      const titleSpan = document.createElement("span");
      titleSpan.className = "accordion-title";
      titleSpan.textContent = chart.name;

      leftDiv.append(chevron, cb, titleSpan);

      const badgeSpan = document.createElement("span");
      badgeSpan.className = "accordion-badge";
      badgeSpan.textContent = hasErrors ? "⚠️" : "✅";

      accHeader.append(leftDiv, badgeSpan);

      // Bind checkbox select/deselect
      const selectCb = accHeader.querySelector(".chart-select-cb");
      selectCb.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent toggling accordion expand state
        chart.selected = e.target.checked;
        validateInputs();
      });

      accHeader.addEventListener("click", () => {
        const currentlyOpen = document.querySelector(".chart-accordion.open");
        if (currentlyOpen && currentlyOpen !== acc) {
          currentlyOpen.classList.remove("open");
          const prevHeader = currentlyOpen.querySelector(".accordion-header");
          if (prevHeader) prevHeader.setAttribute("aria-expanded", "false");
        }
        acc.classList.toggle("open");
        const isOpen = acc.classList.contains("open");
        accHeader.setAttribute("aria-expanded", isOpen ? "true" : "false");
        openAccordionIndex = isOpen ? index : -1;
      });
      accHeader.addEventListener("keydown", (e) => {
        if (e.target.classList.contains("chart-select-cb")) {
          // Let the native checkbox handle space and enter keys without expanding accordion
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          accHeader.click();
        }
      });
      acc.appendChild(accHeader);

      const accBody = document.createElement("div");
      accBody.className = "accordion-body";

      const inner = document.createElement("div");
      inner.className = "accordion-body-inner";

      // 1. General Config
      const generalHeaderDiv = document.createElement("div");
      generalHeaderDiv.className = "section-label-container";
      generalHeaderDiv.style.display = "flex";
      generalHeaderDiv.style.justifyContent = "space-between";
      generalHeaderDiv.style.alignItems = "center";
      generalHeaderDiv.style.marginTop = "0.5rem";
      generalHeaderDiv.style.marginBottom = "0.5rem";

      const generalHeader = createSectionHeader("General Config");
      generalHeader.style.margin = "0";
      generalHeader.style.marginTop = "0";

      const downloadExcelBtn = document.createElement("button");
      downloadExcelBtn.className = "btn-text";
      downloadExcelBtn.style.fontSize = "12px";
      downloadExcelBtn.style.color = "#1f497d";
      downloadExcelBtn.style.fontWeight = "bold";
      downloadExcelBtn.style.cursor = "pointer";
      downloadExcelBtn.style.border = "none";
      downloadExcelBtn.style.background = "none";
      downloadExcelBtn.style.padding = "0";
      // MINOR-2: Use textContent for plain text, not innerHTML (safer + no HTML parsing)
      downloadExcelBtn.textContent = "📥 Download Excel (.xlsx)";
      downloadExcelBtn.title = "Download this chart as an Excel file";
      downloadExcelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        downloadChartAsExcel(chart);
      });

      generalHeaderDiv.append(generalHeader, downloadExcelBtn);
      inner.appendChild(generalHeaderDiv);
      inner.appendChild(
        createFieldRow("Content Title", chart.contentTitle, (val) => {
          chart.contentTitle = val;
          validateInputs();
        }),
      );
      inner.appendChild(
        createFieldRow(
          "Draft URL",
          chart.draftUrl,
          (val) => {
            chart.draftUrl = val;
            const match = val.match(/\/content\/([a-f0-9\-]{36})/i);
            chart.previewUrl =
              match && match[1]
                ? `https://vendorcentral.amazon.com/aplus/api/GetContentPreview?contentId=${match[1]}&deviceType=DESKTOP`
                : "";

            const previewEl = acc.querySelector(".preview-link-display");
            if (previewEl) {
              if (chart.previewUrl) {
                previewEl.href = chart.previewUrl;
                previewEl.style.display = "inline";
              } else {
                previewEl.style.display = "none";
              }
            }
            validateInputs();
          },
          "input-url",
        ),
      );

      // Live Preview Link in accordion config
      const previewLinkDiv = document.createElement("div");
      previewLinkDiv.className = "preview-link-container";
      previewLinkDiv.style.margin = "4px 0 12px 12px";
      previewLinkDiv.style.fontSize = "12px";
      const a = document.createElement("a");
      a.className = "preview-link-display";
      a.href = chart.previewUrl || "#";
      a.target = "_blank";
      a.style.color = "#1f497d";
      a.style.fontWeight = "500";
      a.style.textDecoration = "underline";
      a.style.display = chart.previewUrl ? "inline" : "none";
      a.textContent = "👁 View Preview Link";
      previewLinkDiv.appendChild(a);
      inner.appendChild(previewLinkDiv);

      // 2. Global Toggles
      inner.appendChild(createSectionHeader("Display Toggles"));
      const toggleGroup = document.createElement("div");
      toggleGroup.className = "toggle-group";
      toggleGroup.appendChild(
        createToggle("Show Reviews", chart.showReviews, (val) => {
          chart.showReviews = val;
          validateInputs();
        }),
      );
      toggleGroup.appendChild(
        createToggle("Show Prices", chart.showPrices, (val) => {
          chart.showPrices = val;
          validateInputs();
        }),
      );
      toggleGroup.appendChild(
        createToggle("Show Add To Cart", chart.showAddToCart, (val) => {
          chart.showAddToCart = val;
          validateInputs();
        }),
      );
      inner.appendChild(toggleGroup);

      // 3. Products Grid
      inner.appendChild(
        createSectionHeader(`Products (${chart.asins.length}/6)`),
      );
      const prodGrid = document.createElement("div");
      prodGrid.className = "product-grid";

      chart.asins.forEach((asin, colIdx) => {
        const isBase = colIdx === 0;
        const prodCard = document.createElement("div");
        prodCard.className = `product-card ${chart.highlightColumn[colIdx] ? "highlight-product" : ""}`;

        const headerDiv = document.createElement("div");
        headerDiv.className = "product-card-header";

        const labelSpan = document.createElement("span");
        labelSpan.className = `product-card-label ${!isBase ? "competitor-label" : ""}`;
        labelSpan.textContent = isBase
          ? "Base Product"
          : "Competitor " + colIdx;

        const actionsDiv = document.createElement("div");
        actionsDiv.style.display = "flex";
        actionsDiv.style.gap = "0.5rem";
        actionsDiv.style.alignItems = "center";

        const hlLabel = document.createElement("label");
        hlLabel.className = "highlight-check";
        const hlInput = document.createElement("input");
        hlInput.type = "checkbox";
        hlInput.className = "col-highlight-cb";
        hlInput.checked = !!chart.highlightColumn[colIdx];
        const hlSpan = document.createElement("span");
        hlSpan.className = "highlight-check-label";
        hlSpan.textContent = "Highlight";
        hlLabel.append(hlInput, hlSpan);
        actionsDiv.appendChild(hlLabel);

        if (!isBase) {
          const delBtn = document.createElement("button");
          delBtn.className = "btn-icon delete-col-btn";
          delBtn.title = "Remove Product";
          delBtn.setAttribute("aria-label", "Remove Competitor Product");
          delBtn.textContent = "🗑";
          actionsDiv.appendChild(delBtn);
        }

        headerDiv.append(labelSpan, actionsDiv);

        const fieldsDiv = document.createElement("div");
        fieldsDiv.className = "product-fields";

        prodCard.append(headerDiv, fieldsDiv);

        // Bind events for highlight checkbox
        const hlCb = prodCard.querySelector(".col-highlight-cb");
        hlCb.addEventListener("change", (e) => {
          chart.highlightColumn[colIdx] = e.target.checked;
          if (e.target.checked) {
            // BUG-3: Surgical DOM update — only restyle the product cards in this
            // accordion instead of calling renderPreview() which destroys and
            // rebuilds the entire preview (hundreds of DOM nodes per chart).
            chart.highlightColumn = chart.highlightColumn.map((_, i) => i === colIdx);
            const allCards = prodGrid.querySelectorAll(".product-card");
            const allCbs = prodGrid.querySelectorAll(".col-highlight-cb");
            allCards.forEach((card, i) => {
              card.classList.toggle("highlight-product", i === colIdx);
            });
            allCbs.forEach((cb, i) => {
              cb.checked = i === colIdx;
            });
          }
          validateInputs(); // discrete action — call directly, no debounce needed
        });

        // Bind delete button
        const delBtn = prodCard.querySelector(".delete-col-btn");
        if (delBtn) {
          delBtn.addEventListener("click", () => {
            chart.asins.splice(colIdx, 1);
            chart.titles.splice(colIdx, 1);
            chart.highlightColumn.splice(colIdx, 1);
            chart.attributes.forEach((attr) => attr.values.splice(colIdx, 1));
            renderPreview();
            validateInputs();
          });
        }

        // Inputs — use debounced validateInputs for keystrokes (PERF-1)
        fieldsDiv.appendChild(
          createMiniField("ASIN", asin, (val) => {
            chart.asins[colIdx] = val;
            validateInputsDebounced();
          }),
        );
        fieldsDiv.appendChild(
          createMiniField("Title", chart.titles[colIdx], (val) => {
            chart.titles[colIdx] = val;
            validateInputsDebounced();
          }),
        );

        prodGrid.appendChild(prodCard);
      });
      inner.appendChild(prodGrid);

      // Add Product Button
      if (chart.asins.length < 6) {
        const addProdBtn = document.createElement("button");
        addProdBtn.className = "btn-sm";
        addProdBtn.textContent = "+ Add Competitor";
        addProdBtn.addEventListener("click", () => {
          chart.asins.push("");
          chart.titles.push("");
          chart.highlightColumn.push(false);
          chart.attributes.forEach((attr) => attr.values.push(""));
          renderPreview();
          validateInputs();
        });
        inner.appendChild(addProdBtn);
      }

      // 4. Comparison Metrics
      inner.appendChild(
        createSectionHeader(
          `Comparison Metrics (${chart.attributes.length}/10)`,
        ),
      );

      const metricsScroll = document.createElement("div");
      metricsScroll.className = "metrics-scroll";

      const table = document.createElement("table");
      table.className = "metrics-table";

      // Table Header
      const thead = document.createElement("thead");
      const trHead = document.createElement("tr");

      const thMetric = document.createElement("th");
      thMetric.textContent = "Metric Name";
      trHead.appendChild(thMetric);

      for (let c = 0; c < chart.asins.length; c++) {
        const th = document.createElement("th");
        th.textContent = c === 0 ? "Base" : "Comp " + c;
        trHead.appendChild(th);
      }

      const thEmpty = document.createElement("th");
      trHead.appendChild(thEmpty);

      thead.appendChild(trHead);
      table.appendChild(thead);

      // Table Body
      const tbody = document.createElement("tbody");
      chart.attributes.forEach((attr, rIdx) => {
        const tr = document.createElement("tr");

        // Name cell
        const tdName = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "metric-input metric-name";
        nameInput.value = attr.name || "";
        nameInput.addEventListener("input", (e) => {
          attr.name = e.target.value;
          validateInputsDebounced(); // PERF-1: debounced for keystroke inputs
        });
        tdName.appendChild(nameInput);
        tr.appendChild(tdName);

        // Value cells
        for (let c = 0; c < chart.asins.length; c++) {
          const tdVal = document.createElement("td");
          const valInput = document.createElement("input");
          valInput.type = "text";
          valInput.className = "metric-input";
          valInput.value = attr.values[c] || "";
          valInput.addEventListener("input", (e) => {
            attr.values[c] = e.target.value;
            validateInputsDebounced(); // PERF-1: debounced for keystroke inputs
          });
          tdVal.appendChild(valInput);
          tr.appendChild(tdVal);
        }

        // Delete button cell
        const tdDel = document.createElement("td");
        const rowDelBtn = document.createElement("button");
        rowDelBtn.className = "btn-icon";
        rowDelBtn.textContent = "✕";
        rowDelBtn.setAttribute("title", "Remove Metric");
        rowDelBtn.setAttribute(
          "aria-label",
          `Remove Metric Row ${attr.name || ""}`,
        );
        rowDelBtn.style.width = "20px";
        rowDelBtn.style.height = "20px";
        rowDelBtn.style.fontSize = "0.6rem";
        rowDelBtn.addEventListener("click", () => {
          chart.attributes.splice(rIdx, 1);
          renderPreview();
          validateInputs();
        });
        tdDel.appendChild(rowDelBtn);
        tr.appendChild(tdDel);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      metricsScroll.appendChild(table);

      if (chart.attributes.length > 0) {
        inner.appendChild(metricsScroll);
      }

      // Add Metric Button
      if (chart.attributes.length < 10) {
        const addMetBtn = document.createElement("button");
        addMetBtn.className = "btn-sm";
        addMetBtn.textContent = "+ Add Metric";
        addMetBtn.addEventListener("click", () => {
          chart.attributes.push({
            name: "New Metric",
            values: new Array(chart.asins.length).fill(""),
          });
          renderPreview();
          validateInputs();
        });
        inner.appendChild(addMetBtn);
      }

      accBody.appendChild(inner);
      acc.appendChild(accBody);
      previewContainer.appendChild(acc);
    });
  }

  // --- DOM Helpers for Render Preview ---
  function createSectionHeader(title) {
    const div = document.createElement("div");
    div.className = "section-label";
    div.textContent = title;
    return div;
  }

  function createFieldRow(label, value, onChange, extraClass = "") {
    const div = document.createElement("div");
    div.className = "field-row";
    const labelDiv = document.createElement("div");
    labelDiv.className = "field-label";
    labelDiv.textContent = label;
    div.appendChild(labelDiv);
    const input = document.createElement("input");
    input.type = "text";
    input.className = `field-input ${extraClass}`;
    input.value = value || "";
    input.addEventListener("input", (e) => onChange(e.target.value));
    div.appendChild(input);
    return div;
  }

  function createMiniField(label, value, onChange) {
    const div = document.createElement("div");
    div.className = "mini-field-row";
    const labelDiv = document.createElement("div");
    labelDiv.className = "mini-field-label";
    labelDiv.textContent = label;
    div.appendChild(labelDiv);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "mini-field-input";
    input.value = value || "";
    input.addEventListener("input", (e) => onChange(e.target.value));
    div.appendChild(input);
    return div;
  }

  function createToggle(label, isChecked, onChange) {
    const labelEl = document.createElement("label");
    labelEl.className = "toggle-item";
    const spanText = document.createElement("span");
    spanText.className = "toggle-text";
    spanText.textContent = label;

    const divSwitch = document.createElement("div");
    divSwitch.className = "toggle-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!isChecked;
    input.addEventListener("change", (e) => onChange(e.target.checked));
    const slider = document.createElement("span");
    slider.className = "toggle-slider";

    divSwitch.appendChild(input);
    divSwitch.appendChild(slider);
    labelEl.appendChild(divSwitch);
    labelEl.appendChild(spanText);
    return labelEl;
  }  // --- History Logic ---
  function getRelativeTime(timestamp) {
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return rtf.format(-days, "day");
    if (hours > 0) return rtf.format(-hours, "hour");
    if (minutes > 0) return rtf.format(-minutes, "minute");
    return "just now";
  }

  async function renderHistory(filter = "all") {
    const historyList = document.getElementById("historyList");
    const historyEmpty = document.getElementById("historyEmpty");
    if (!historyList) return;

    // Clear previous items except empty state
    const items = historyList.querySelectorAll(".history-entry");
    items.forEach((el) => el.remove());

    const allHistory = await HistoryManager.loadAll();
    const filtered =
      filter === "all"
        ? allHistory
        : allHistory.filter((e) => e.type === filter);

    if (filtered.length === 0) {
      if (historyEmpty) historyEmpty.style.display = "block";
      return;
    }

    if (historyEmpty) historyEmpty.style.display = "none";

    filtered.forEach((entry) => {
      const el = document.createElement("div");
      el.className = "history-entry";
      el.dataset.id = entry.id;

      const header = document.createElement("div");
      header.className = "history-entry-header";

      const icon = document.createElement("div");
      icon.className = "history-entry-icon";
      icon.textContent =
        entry.type === "ai_generation"
          ? "🧠"
          : entry.type === "run"
            ? "▶"
            : "📂";

      const info = document.createElement("div");
      info.className = "history-entry-info";

      const label = document.createElement("div");
      label.className = "history-entry-label";
      label.textContent = entry.label;

      const time = document.createElement("div");
      time.className = "history-entry-time";
      time.textContent = getRelativeTime(entry.timestamp);

      info.append(label, time);

      const badge = document.createElement("div");
      badge.className = `history-entry-badge badge-${entry.type}`;
      badge.textContent =
        entry.type === "ai_generation"
          ? "AI"
          : entry.type === "run"
            ? "RUN"
            : "IMPORT";

      const chevron = document.createElement("div");
      chevron.className = "history-entry-chevron";
      chevron.textContent = "▶";

      header.append(icon, info, badge, chevron);
      el.appendChild(header);

      const body = document.createElement("div");
      body.className = "history-entry-body";

      const bodyInner = document.createElement("div");
      bodyInner.className = "history-entry-body-inner";

      // Render content based on type
      if (entry.type === "ai_generation" || entry.type === "import") {
        if (entry.charts && entry.charts.length > 0) {
          const list = document.createElement("div");
          list.className = "history-charts-list";
          entry.charts.forEach((c) => {
            const chip = document.createElement("div");
            chip.className = "history-chart-chip";
            const nameSpan = document.createElement("span");
            nameSpan.className = "history-chart-chip-name";
            nameSpan.textContent = c.name;
            const asinsSpan = document.createElement("span");
            asinsSpan.className = "history-chart-chip-asins";
            asinsSpan.textContent = (c.asins || []).join(", ");
            chip.append(nameSpan, asinsSpan);
            list.appendChild(chip);
          });
          bodyInner.appendChild(list);
        }
      } else if (entry.type === "run") {
        if (entry.runSummary) {
          const grid = document.createElement("div");
          grid.className = "history-summary-grid";
          grid.innerHTML = `
            <div class="history-summary-cell">
              <div class="history-summary-val">${entry.runSummary.total || 0}</div>
              <div class="history-summary-key">Total</div>
            </div>
            <div class="history-summary-cell">
              <div class="history-summary-val" style="color:var(--success);">${entry.runSummary.completed || 0}</div>
              <div class="history-summary-key">Done</div>
            </div>
            <div class="history-summary-cell">
              <div class="history-summary-val" style="color:var(--error);">${entry.runSummary.failed || 0}</div>
              <div class="history-summary-key">Failed</div>
            </div>
          `;
          bodyInner.appendChild(grid);

          if (
            entry.runSummary.processedCharts &&
            entry.runSummary.processedCharts.length > 0
          ) {
            const runList = document.createElement("div");
            runList.className = "history-charts-list";
            runList.style.marginTop = "0.5rem";
            entry.runSummary.processedCharts.forEach((c) => {
              const item = document.createElement("div");
              item.className = "history-run-item";
              const nameDiv = document.createElement("div");
              nameDiv.className = "history-run-name";
              nameDiv.textContent = c.name;
              const linksDiv = document.createElement("div");
              linksDiv.className = "history-run-links";

              if (c.previewUrl) {
                const a = document.createElement("a");
                a.href = c.previewUrl;
                a.target = "_blank";
                a.textContent = "Preview";
                linksDiv.appendChild(a);
              }
              if (c.draftUrl) {
                const a = document.createElement("a");
                a.href = c.draftUrl;
                a.target = "_blank";
                a.textContent = "Draft";
                linksDiv.appendChild(a);
              }
              item.append(nameDiv, linksDiv);
              runList.appendChild(item);
            });
            bodyInner.appendChild(runList);
          }
        }
      }

      // Actions
      const actions = document.createElement("div");
      actions.className = "history-actions";

      if (entry.type === "ai_generation" || entry.type === "import") {
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "history-action-btn";
        restoreBtn.innerHTML = "↩ Restore";
        restoreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (entry.charts) {
            parsedData = JSON.parse(JSON.stringify(entry.charts));
            openAccordionIndex = 0;
            renderPreview();
            validateInputs();
            // Switch to publisher tab
            const pubTab = document.querySelector(
              '[data-target="tab-publisher"]',
            );
            if (pubTab) pubTab.click();
          }
        });
        actions.appendChild(restoreBtn);

        const exportBtn = document.createElement("button");
        exportBtn.className = "history-action-btn";
        exportBtn.innerHTML = "📦 Export";
        exportBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (entry.charts) {
            downloadAllChartsAsExcel(entry.charts);
          }
        });
        actions.appendChild(exportBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "history-action-btn danger";
      deleteBtn.innerHTML = "🗑 Delete";
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm("Delete this history entry?")) {
          await HistoryManager.deleteEntry(entry.id);
          renderHistory(filter);
        }
      });
      actions.appendChild(deleteBtn);

      bodyInner.appendChild(actions);
      body.appendChild(bodyInner);
      el.appendChild(body);

      // Toggle open
      header.addEventListener("click", () => {
        const isOpen = el.classList.contains("open");
        // Close all others
        historyList
          .querySelectorAll(".history-entry.open")
          .forEach((openEl) => {
            if (openEl !== el) openEl.classList.remove("open");
          });
        el.classList.toggle("open", !isOpen);
      });

      historyList.appendChild(el);
    });
  }

  // --- Validation Logic ---
  function getChartErrors(chart) {
    const errors = [];
    if (!chart.draftUrl) errors.push("Missing A+ Draft URL");

    if (!chart.asins || chart.asins.length === 0) {
      errors.push("Missing ASINs");
    } else {
      if (chart.asins.length > 6)
        errors.push(`Too many ASINs (${chart.asins.length}). Max is 6.`);
      chart.asins.forEach((asin, idx) => {
        if (!asin || !/^[A-Z0-9]{10}$/i.test(asin.trim())) {
          errors.push(
            `Invalid ASIN at position ${idx + 1}: "${asin}". Must be 10 characters.`,
          );
        }
      });
    }

    if (chart.attributes && chart.attributes.length > 10) {
      errors.push(
        `Too many metric rows (${chart.attributes.length}). Max is 10.`,
      );
    }
    return errors;
  }

  function validateInputs() {
    let isValid = true;
    validationList.textContent = "";

    if (!parsedData || parsedData.length === 0) {
      isValid = false;
    } else {
      const selectedCharts = parsedData.filter(
        (chart) => chart.selected !== false,
      );
      if (selectedCharts.length === 0) {
        isValid = false;
        const li = document.createElement("li");
        li.textContent =
          "No charts selected. Please select at least one chart to run automation.";
        validationList.appendChild(li);
      }

      // BUG-1: Compute errors once per chart and reuse in both loops.
      // Previously getChartErrors(chart) was called twice per chart per invocation
      // (once for validation messages, once for accordion badge updates), doubling
      // regex work on every keystroke.
      const errorsCache = parsedData.map((chart) => getChartErrors(chart));

      parsedData.forEach((chart, index) => {
        const chartErrors = errorsCache[index];
        if (chartErrors.length > 0) {
          // Only block automation start if this chart is selected!
          if (chart.selected !== false) {
            isValid = false;
          }
          const prefix = `[${chart.name}] `;
          chartErrors.forEach((err) => {
            const li = document.createElement("li");
            li.textContent = prefix + err;
            validationList.appendChild(li);
          });
        }
      });

      // Update accordion colors based on validation without full re-render
      const accordions = previewContainer.querySelectorAll(".chart-accordion");
      parsedData.forEach((chart, index) => {
        if (accordions[index]) {
          const hasErrors = errorsCache[index].length > 0; // reuse cached result
          accordions[index].classList.toggle("has-errors", hasErrors);
          accordions[index].classList.toggle("is-valid", !hasErrors);
          const badge = accordions[index].querySelector(".accordion-badge");
          if (badge) badge.textContent = hasErrors ? "⚠️" : "✅";
        }
      });
    }

    const hasVisibleErrors = validationList.children.length > 0;
    if (hasVisibleErrors || !isValid) {
      if (parsedData && parsedData.length > 0) {
        validationCard.classList.remove("hidden");
      }
    } else {
      validationCard.classList.add("hidden");
    }

    startBtn.disabled = !isValid;
  }

  if (toggleAllChartsBtn) {
    toggleAllChartsBtn.addEventListener("click", () => {
      if (!parsedData || parsedData.length === 0) return;
      const allSelected = parsedData.every((chart) => chart.selected !== false);
      parsedData.forEach((chart) => {
        chart.selected = !allSelected;
      });
      renderPreview();
      validateInputs();
    });
  }

  clearDataBtn.addEventListener("click", () => {
    if (
      confirm(
        "Are you sure you want to clear the imported chart data? This will remove all changes you have made.",
      )
    ) {
      parsedData = null;
      renderPreview();
      validateInputs();
      fileInput.value = "";
    }
  });

  startBtn.addEventListener("click", () => {
    const selectedCharts = parsedData.filter(
      (chart) => chart.selected !== false,
    );
    if (selectedCharts.length === 0) return; // Safety check

    document.body.classList.add("automation-running");
    statusContainer.classList.remove("hidden");
    startBtn.classList.add("hidden");
    stopBtn.classList.remove("hidden");

    const logList = document.getElementById("logList");
    if (logList) logList.textContent = ""; // Clear previous logs

    chrome.runtime.sendMessage({
      type: "START_AUTOMATION",
      data: { charts: selectedCharts },
    });
  });

  stopBtn.addEventListener("click", () => {
    document.body.classList.remove("automation-running");
    stopBtn.classList.add("hidden");
    startBtn.classList.remove("hidden");
    startBtn.disabled = false;
    startBtn.textContent = "Start Automation";

    chrome.runtime.sendMessage({
      type: "STOP_AUTOMATION",
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "AUTOMATION_STATUS") {
      statusText.textContent = message.status;
      progressFill.style.width = `${message.progress}%`;

      const logList = document.getElementById("logList");
      if (logList) {
        const li = document.createElement("li");
        li.style.marginBottom = "4px";
        const time = new Date().toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        li.textContent = `[${time}] ${message.status}`;
        logList.appendChild(li);

        // auto scroll to bottom
        const logContainer = document.getElementById("logContainer");
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
      }

      const isFinished =
        message.progress === 100 ||
        message.status.includes("Stopped") ||
        message.status.includes("Error:") ||
        message.status.toLowerCase().includes("failed");

      if (isFinished) {
        document.body.classList.remove("automation-running");
        stopBtn.classList.add("hidden");
        startBtn.classList.remove("hidden");
        startBtn.disabled = false;

        if (
          message.status.includes("Error:") ||
          message.status.toLowerCase().includes("failed")
        ) {
          startBtn.textContent = "Start Automation";
        } else {
          startBtn.textContent = message.status.includes("Stopped")
            ? "Start Automation"
            : "Finished!";
          setTimeout(() => {
            if (startBtn.textContent === "Finished!") {
              startBtn.textContent = "Start Automation";
            }
          }, 3000);
        }

        showResultsUI();
      }
    }
  });

  function showResultsUI() {
    chrome.storage.local.get(["processedCharts"], (res) => {
      const processed = res.processedCharts || [];
      if (processed.length === 0) return;

      // Save to history
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      HistoryManager.saveEntry({
        type: "run",
        label: `Run · ${processed.length} charts · ${timeStr}`,
        runSummary: {
          total: processed.length,
          completed: processed.filter((c) => c.previewUrl).length,
          failed: processed.filter((c) => !c.previewUrl).length,
          processedCharts: JSON.parse(JSON.stringify(processed)),
        },
      }).then(() => renderHistory());

      const resultsCard = document.getElementById("resultsCard");
      if (resultsCard) resultsCard.classList.remove("hidden");

      const resultsList = document.getElementById("resultsList");
      if (resultsList) {
        resultsList.textContent = "";
        processed.forEach((chart) => {
          const item = document.createElement("div");
          item.className = "processed-chart-item";
          item.style.padding = "8px";
          item.style.marginBottom = "6px";
          item.style.background = "#f2f4f7";
          item.style.border = "1px solid #d9d9d9";
          item.style.borderRadius = "4px";

          const titleDiv = document.createElement("div");
          titleDiv.style.fontWeight = "600";
          titleDiv.style.fontSize = "13px";
          titleDiv.style.color = "#2c3e50";
          titleDiv.textContent = chart.name;

          const linksDiv = document.createElement("div");
          linksDiv.style.marginTop = "4px";
          linksDiv.style.fontSize = "11px";

          const previewA = document.createElement("a");
          previewA.href = chart.previewUrl || "#";
          previewA.target = "_blank";
          previewA.style.color = "#1f497d";
          previewA.style.fontWeight = "500";
          previewA.style.textDecoration = "underline";
          previewA.style.marginRight = "10px";
          previewA.textContent = "👁 Preview";

          const draftA = document.createElement("a");
          draftA.href = chart.draftUrl || "#";
          draftA.target = "_blank";
          draftA.style.color = "#555";
          draftA.style.textDecoration = "underline";
          draftA.textContent = "🔗 Draft Link";

          linksDiv.append(previewA, draftA);
          item.append(titleDiv, linksDiv);
          resultsList.appendChild(item);
        });
      }

      const bulkOpenBtn = document.getElementById("bulkOpenBtn");
      if (bulkOpenBtn) {
        bulkOpenBtn.onclick = () => {
          const validUrls = processed.map((c) => c.previewUrl).filter(Boolean);
          if (validUrls.length === 0) return;

          chrome.windows.create(
            { url: validUrls[0], state: "maximized" },
            (newWindow) => {
              for (let i = 1; i < validUrls.length; i++) {
                chrome.tabs.create({
                  windowId: newWindow.id,
                  url: validUrls[i],
                  active: false,
                });
              }
            },
          );
        };
      }

      const downloadCsvBtn = document.getElementById("downloadCsvBtn");
      if (downloadCsvBtn) {
        downloadCsvBtn.onclick = () => {
          let csvContent = "\uFEFF"; // UTF-8 BOM
          csvContent +=
            "Chart Name,Original A+ Draft Link,Modified Preview Link\n";
          processed.forEach((chart) => {
            const name = `"${(chart.name || "").replace(/"/g, '""')}"`;
            const draft = `"${(chart.draftUrl || "").replace(/"/g, '""')}"`;
            const preview = `"${(chart.previewUrl || "").replace(/"/g, '""')}"`;
            csvContent += `${name},${draft},${preview}\n`;
          });

          const now = new Date();
          const yy = String(now.getFullYear()).slice(-2);
          const dd = String(now.getDate()).padStart(2, "0");
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          const hh = String(now.getHours()).padStart(2, "0");
          const min = String(now.getMinutes()).padStart(2, "0");

          const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute(
            "download",
            `APlus_Chart_Preview_${yy}${dd}${mm}_${hh}${min}.csv`,
          );
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };
      }
    });
  }

  // Initialize AI Generator module
  setupAIGenerator(
    (newCharts) => {
      if (parsedData && parsedData.length > 0) {
        const append = confirm(`You already have ${parsedData.length} chart(s) in your preview. Do you want to APPEND the newly generated chart(s) to the existing list? (Click Cancel to REPLACE them)`);
        if (append) {
          parsedData.push(...newCharts);
        } else {
          parsedData = newCharts;
        }
      } else {
        parsedData = newCharts;
      }

      // Save to history
      const platform =
        document.getElementById("aiPlatformSelect")?.value || "unknown";
      const model =
        document.getElementById(`${platform}ModelSelect`)?.value || "unknown";

      HistoryManager.saveEntry({
        type: "ai_generation",
        label: `AI Generation · ${newCharts.length} charts · ${platform} ${model}`,
        charts: JSON.parse(JSON.stringify(newCharts)),
        meta: { platform, model },
      }).then(() => renderHistory());
    },
    renderPreview,
    validateInputs,
  );
});
