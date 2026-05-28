// sidepanel.js

import { setupAIGenerator } from "../scripts/ai-generator.js";
import { HistoryManager } from "../scripts/history.js";
import { SandboxRenderer } from "../scripts/sandbox-renderer.js";
import {
  MODULE_REGISTRY,
  getAIReadyModules,
  getTemplateHeaders,
  getModuleById,
  MAX_MODULES_PER_DRAFT,
} from "../scripts/modules.js";

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
      onMessage: { addListener: (listener) => {} },
    },
  };
}

/**
 * M5: Builds a preview URL from a draft URL, auto-detecting Vendor vs Seller Central.
 * Supports both domains since the user works with both.
 */
function buildPreviewUrl(draftUrl) {
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
  const exportLogsBtn = document.getElementById("exportLogsBtn");
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

  // --- Module Picker Collapse Logic ---
  const modulePickerHeader = document.getElementById("modulePickerHeader");
  const modulePickerContent = document.getElementById("modulePickerContent");
  const modulePickerChevron = document.getElementById("modulePickerChevron");

  if (modulePickerHeader && modulePickerContent && modulePickerChevron) {
    modulePickerHeader.addEventListener("click", () => {
      const isHidden = modulePickerContent.classList.contains("hidden");
      if (isHidden) {
        modulePickerContent.classList.remove("hidden");
        modulePickerChevron.style.transform = "rotate(0deg)";
      } else {
        modulePickerContent.classList.add("hidden");
        modulePickerChevron.style.transform = "rotate(-90deg)";
      }
    });
  }

  const modulePickerHeaderControls = document.getElementById(
    "modulePickerHeaderControls",
  );
  if (modulePickerHeaderControls) {
    modulePickerHeaderControls.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // --- Feedback Button Handler ---
  const feedbackBtn = document.getElementById("btn-feedback");
  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const manifest =
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.getManifest
          ? chrome.runtime.getManifest()
          : { name: "A-Plus Publisher Pro", version: "1.0.0" };
      let appName = manifest.name;
      if (
        typeof chrome !== "undefined" &&
        chrome.i18n &&
        chrome.i18n.getMessage
      ) {
        const i18nName = chrome.i18n.getMessage("appName");
        if (i18nName) appName = i18nName;
      }
      const version = `${appName} ${manifest.version}`;
      const baseUrl =
        "https://docs.google.com/forms/d/e/1FAIpQLSeZ4zNH3_Jiov3JnTa5K2VXffCCkDSsh-KvK_h3kIxmbejoIg/viewform";
      const versionFieldId = "entry.2030262534";
      const params = new URLSearchParams();
      params.append("usp", "pp_url");
      if (versionFieldId) params.append(versionFieldId, version);
      const finalUrl = `${baseUrl}?${params.toString()}`;

      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: finalUrl });
      } else {
        window.open(finalUrl, "_blank");
      }
    });
  }

  // --- Version Badge Logic ---
  const versionBadge = document.getElementById("app-version-badge");
  if (versionBadge) {
    const manifest =
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.getManifest
        ? chrome.runtime.getManifest()
        : { version: "1.0.0" };
    versionBadge.textContent = `v${manifest.version}`;
  }

  // --- Amazon Preview Sandbox Global Toggles ---
  const btnDesktop = document.getElementById("btnSandboxDesktop");
  const btnMobile = document.getElementById("btnSandboxMobile");
  if (btnDesktop && btnMobile) {
    btnDesktop.addEventListener("click", () => {
      btnDesktop.classList.add("active");
      btnMobile.classList.remove("active");
      SandboxRenderer.setGlobalViewMode("desktop");
      renderPreview();
    });
    btnMobile.addEventListener("click", () => {
      btnMobile.classList.add("active");
      btnDesktop.classList.remove("active");
      SandboxRenderer.setGlobalViewMode("mobile");
      renderPreview();
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

  // ─── Module Picker Grid (Publisher tab, multi-select up to 5) ───
  const modulePickerGrid = document.getElementById("modulePickerGrid");
  const moduleCountBadge = document.getElementById("moduleCountBadge");
  const toggleAllModulesBtn = document.getElementById("toggleAllModulesBtn");
  let selectedModuleIds = [];
  let currentMaxModules = MAX_MODULES_PER_DRAFT;

  const overrideLimitToggle = document.getElementById("overrideLimitToggle");
  if (overrideLimitToggle) {
    overrideLimitToggle.addEventListener("change", (e) => {
      currentMaxModules = e.target.checked ? 99 : MAX_MODULES_PER_DRAFT;

      const instruction = document.getElementById("modulePickerInstruction");
      if (instruction) {
        instruction.textContent = e.target.checked
          ? "Choose module types for your A+ Content layout (No Limit)."
          : "Choose up to 5 module types for your A+ Content layout.";
      }

      // If turning limit back on, trim selected modules to valid limits
      if (!e.target.checked) {
        let validIds = [];
        let counts = {};
        for (let id of selectedModuleIds) {
          counts[id] = (counts[id] || 0) + 1;
          const mod = getModuleById(id);
          const modMax = mod ? mod.maxPerDraft || 5 : 5;
          if (counts[id] <= modMax && validIds.length < MAX_MODULES_PER_DRAFT) {
            validIds.push(id);
          }
        }
        selectedModuleIds = validIds;
      }

      updateModulePickerState();
    });
  }

  if (toggleAllModulesBtn) {
    toggleAllModulesBtn.addEventListener("click", () => {
      const allSelected = MODULE_REGISTRY.every((mod) =>
        selectedModuleIds.includes(mod.id),
      );

      if (allSelected) {
        // Deselect all
        selectedModuleIds = [];
      } else {
        // Select all: ensure every module has at least 1 count
        // If not in No Limit mode, automatically turn No Limit on
        if (currentMaxModules !== 99) {
          if (overrideLimitToggle) {
            overrideLimitToggle.checked = true;
            overrideLimitToggle.dispatchEvent(new Event("change"));
          }
        }

        MODULE_REGISTRY.forEach((mod) => {
          if (!selectedModuleIds.includes(mod.id)) {
            selectedModuleIds.push(mod.id);
          }
        });
      }

      updateModulePickerState();
    });
  }

  function renderModulePicker() {
    if (!modulePickerGrid) return;
    modulePickerGrid.textContent = "";

    MODULE_REGISTRY.forEach((mod) => {
      const card = document.createElement("div");
      card.className = "module-picker-card";
      card.dataset.moduleId = mod.id;
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute(
        "aria-label",
        `Toggle selection for module ${mod.name}`,
      );
      if (selectedModuleIds.includes(mod.id)) card.classList.add("selected");

      // Check mark
      const check = document.createElement("div");
      check.className = "module-check";
      check.textContent = "✓";
      card.appendChild(check);

      // AI badge
      if (mod.aiReady) {
        const aiBadge = document.createElement("div");
        aiBadge.className = "module-ai-badge";
        aiBadge.textContent = "AI";
        card.appendChild(aiBadge);
      }

      // Thumbnail
      const img = document.createElement("img");
      img.className = "module-thumb";
      img.src = mod.thumbnail;
      img.alt = mod.name;
      img.loading = "lazy";
      card.appendChild(img);

      // Label
      const label = document.createElement("div");
      label.className = "module-label";
      label.textContent = mod.shortName;
      card.appendChild(label);

      card.addEventListener("click", () => {
        const currentCount = selectedModuleIds.filter(
          (id) => id === mod.id,
        ).length;
        if (currentCount > 0) {
          // Deselect all instances of this module
          selectedModuleIds = selectedModuleIds.filter((id) => id !== mod.id);
        } else if (selectedModuleIds.length < currentMaxModules) {
          // Select: add first instance
          selectedModuleIds.push(mod.id);
        }
        updateModulePickerState();
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      });

      modulePickerGrid.appendChild(card);
    });

    updateModulePickerState();
  }

  function updateModulePickerState() {
    const count = selectedModuleIds.length;
    if (moduleCountBadge) {
      moduleCountBadge.textContent = `${count} / ${currentMaxModules === 99 ? "∞" : currentMaxModules} selected`;
    }

    if (toggleAllModulesBtn) {
      const allSelected = MODULE_REGISTRY.every((mod) =>
        selectedModuleIds.includes(mod.id),
      );
      toggleAllModulesBtn.textContent = allSelected
        ? "☐ Deselect All"
        : "☑ Select All";
    }

    const cards = modulePickerGrid.querySelectorAll(".module-picker-card");
    cards.forEach((card) => {
      const id = card.dataset.moduleId;
      const mod = getModuleById(id);
      const currentCount = selectedModuleIds.filter((x) => x === id).length;
      const isSelected = currentCount > 0;

      const modMax =
        currentMaxModules === 99 ? 99 : mod ? mod.maxPerDraft || 5 : 5;
      const isModuleMaxReached = currentCount >= modMax;
      const isGlobalMaxReached = count >= currentMaxModules;
      const cannotIncrement = isModuleMaxReached || isGlobalMaxReached;

      card.classList.toggle("selected", isSelected);
      card.classList.toggle("max-reached", !isSelected && cannotIncrement);

      // Handle multi-instance counter controls
      if (
        isSelected &&
        mod &&
        (mod.maxPerDraft > 1 || currentMaxModules === 99)
      ) {
        let controls = card.querySelector(".module-controls");
        if (!controls) {
          controls = document.createElement("div");
          controls.className = "module-controls";

          const minusBtn = document.createElement("button");
          minusBtn.className = "control-btn minus-btn";
          minusBtn.textContent = "−";
          minusBtn.title = "Decrease count";
          minusBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = selectedModuleIds.indexOf(id);
            if (idx !== -1) {
              selectedModuleIds.splice(idx, 1);
              updateModulePickerState();
            }
          });

          const countSpan = document.createElement("span");
          countSpan.className = "control-count";

          const plusBtn = document.createElement("button");
          plusBtn.className = "control-btn plus-btn";
          plusBtn.textContent = "+";
          plusBtn.title = "Increase count";
          plusBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (selectedModuleIds.length < currentMaxModules) {
              const curr = selectedModuleIds.filter((x) => x === id).length;
              const mMax = currentMaxModules === 99 ? 99 : mod.maxPerDraft || 5;
              if (curr < mMax) {
                selectedModuleIds.push(id);
                updateModulePickerState();
              }
            }
          });

          controls.append(minusBtn, countSpan, plusBtn);
          card.appendChild(controls);
        }

        const countSpan = controls.querySelector(".control-count");
        countSpan.textContent = `${currentCount}x`;

        const minusBtn = controls.querySelector(".minus-btn");
        const plusBtn = controls.querySelector(".plus-btn");
        plusBtn.disabled = cannotIncrement;
      } else {
        const controls = card.querySelector(".module-controls");
        if (controls) {
          controls.remove();
        }
      }
    });

    renderSelectedModulesTray();
  }

  function renderSelectedModulesTray() {
    const tray = document.getElementById("selectedModulesTray");
    const dlContainer = document.getElementById("downloadTemplateContainer");

    if (!tray) return;

    tray.innerHTML = "";
    if (selectedModuleIds.length === 0) {
      tray.innerHTML =
        '<div class="modules-tray-empty">No modules selected</div>';
      if (dlContainer) dlContainer.style.display = "none";
      return;
    }

    if (dlContainer) dlContainer.style.display = "block";

    selectedModuleIds.forEach((id, index) => {
      const mod = getModuleById(id);
      if (!mod) return;

      const chip = document.createElement("div");
      chip.className = "tray-chip";
      chip.draggable = true;
      chip.dataset.index = index;

      const thumb = document.createElement("img");
      thumb.className = "tray-chip-thumb";
      thumb.src = mod.thumbnail || "../icons/icon128.png";
      thumb.onerror = () => {
        thumb.src = "../icons/icon128.png";
      };

      const name = document.createElement("span");
      name.textContent = `${index + 1}. ${mod.shortName}`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "tray-chip-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove module";
      removeBtn.addEventListener("click", () => {
        selectedModuleIds.splice(index, 1);
        updateModulePickerState();
      });

      // Drag and drop events for reordering
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        chip.classList.add("dragging");
        e.dataTransfer.setData("text/plain", index);
      });

      chip.addEventListener("dragend", () => {
        chip.classList.remove("dragging");
        tray
          .querySelectorAll(".tray-chip")
          .forEach((c) => (c.style.border = ""));
      });

      chip.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        chip.style.border = "1px solid var(--primary)";
      });

      chip.addEventListener("dragleave", () => {
        chip.style.border = "";
      });

      chip.addEventListener("drop", (e) => {
        e.preventDefault();
        chip.style.border = "";
        const draggedIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (draggedIndex !== index && !isNaN(draggedIndex)) {
          const item = selectedModuleIds.splice(draggedIndex, 1)[0];
          selectedModuleIds.splice(index, 0, item);
          updateModulePickerState();
        }
      });

      chip.append(thumb, name, removeBtn);
      tray.appendChild(chip);
    });
  }

  renderModulePicker();

  // ─── AI Module Type Dropdown (single-select, AI-ready only) ────
  const aiModuleTypeSelect = document.getElementById("aiModuleTypeSelect");
  if (aiModuleTypeSelect) {
    const aiModules = getAIReadyModules();
    // Default to Comparison Chart (module-5) if available
    aiModules.forEach((mod) => {
      const opt = document.createElement("option");
      opt.value = mod.id;
      opt.textContent = mod.name;
      if (mod.id === "module-5") opt.selected = true;
      aiModuleTypeSelect.appendChild(opt);
    });
  }

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

    // Determine which modules to generate templates for
    const modulesToGenerate =
      selectedModuleIds.length > 0
        ? selectedModuleIds.map((id) => getModuleById(id)).filter(Boolean)
        : [getModuleById("module-5")]; // Default: Comparison Chart

    const workbook = XLSX.utils.book_new();

    // Instructions sheet
    const hasStandardModules = modulesToGenerate.some(
      (mod) => mod.id !== "module-5",
    );
    const hasComparisonChart = modulesToGenerate.some(
      (mod) => mod.id === "module-5",
    );
    const numberedModulesStr = modulesToGenerate
      .map((mod, index) => `${index + 1}. ${mod.name}`)
      .join("\n");

    const instrData = [
      [
        makeCell("A+ Publisher Pro - Template Instructions", styles.docTitle),
        makeCell("", styles.docEmpty),
      ],
      [
        makeCell(
          "Each sheet tab represents one A+ module. Fill in the values and import the file back into the extension.",
          styles.docSub,
        ),
        makeCell("", styles.docEmpty),
      ],
      [makeCell("", styles.docEmpty), makeCell("", styles.docEmpty)],
      [
        makeCell("Field", styles.tblHeader),
        makeCell("Instructions", styles.tblHeader),
      ],
      [
        makeCell("Module Type", styles.sideLabel),
        makeCell("Auto-filled. Do NOT change this value.", styles.descText),
      ],
      [
        makeCell("A+ Content Title", styles.sideLabel),
        makeCell("Optional. Name of your A+ Content project.", styles.descText),
      ],
      [
        makeCell("A+ Draft URL", styles.sideLabel),
        makeCell(
          "Paste the full Amazon A+ Content Draft URL.",
          styles.descText,
        ),
      ],
    ];

    if (hasStandardModules) {
      instrData.push(
        [
          makeCell("Standard Modules", styles.tblHeader),
          makeCell(
            "Instructions for standard row-based layouts",
            styles.tblHeader,
          ),
        ],
        [
          makeCell("Image Fields", styles.sideLabel),
          makeCell(
            "Image fields are listed for reference. Use the Amazon editor to upload images manually.",
            styles.descText,
          ),
        ],
        [
          makeCell("Text Fields", styles.sideLabel),
          makeCell(
            "Fill in text values. Respect the character limits shown in parentheses.",
            styles.descText,
          ),
        ],
      );
    }

    if (hasComparisonChart) {
      instrData.push(
        [
          makeCell("Comparison Chart", styles.tblHeader),
          makeCell(
            "Instructions for columnar Comparison Chart module",
            styles.tblHeader,
          ),
        ],
        [
          makeCell("ASINs", styles.sideLabel),
          makeCell(
            "Enter the Base Product ASIN in the first column, and Competitor ASINs in subsequent columns.",
            styles.descText,
          ),
        ],
        [
          makeCell("Metrics / Text", styles.sideLabel),
          makeCell(
            "Fill out the attributes for each product column (e.g. checkmarks, text).",
            styles.descText,
          ),
        ],
      );
    }

    // Add Selected Modules row at the very end
    instrData.push(
      [makeCell("", styles.docEmpty), makeCell("", styles.docEmpty)],
      [
        makeCell("Selected Modules", styles.sideLabel),
        makeCell(numberedModulesStr, styles.descText),
      ],
    );

    const instrSheet = XLSX.utils.aoa_to_sheet(instrData);
    instrSheet["!cols"] = [{ wch: 25 }, { wch: 75 }];

    // Set auto row heights based on newlines in the cell content
    instrSheet["!rows"] = instrData.map((row) => {
      let maxLines = 1;
      row.forEach((cell) => {
        if (cell && cell.v && typeof cell.v === "string") {
          const lines = cell.v.split("\n").length;
          if (lines > maxLines) {
            maxLines = lines;
          }
        }
      });
      // Base height is ~18 for single line, then add ~14 points for each additional line
      return { hpt: maxLines * 14 + 6 };
    });

    XLSX.utils.book_append_sheet(workbook, instrSheet, "Instructions");

    // Generate a sheet for each selected module
    const usedNames = new Set(["Instructions"]);
    modulesToGenerate.forEach((mod) => {
      if (mod.id === "module-5") {
        // Special: Comparison Chart uses the original columnar layout
        const titleStyle = {
          font: { bold: true, sz: 14, color: { rgb: "1F497D" } },
          ...styles.docEmpty,
        };
        const chartData = [
          [
            makeCell("Comparison Chart", titleStyle),
            makeCell("", styles.docEmpty),
            ...Array.from({ length: 5 }, () => makeCell("", styles.docEmpty)),
          ],
          [
            makeCell("", styles.docEmpty),
            makeCell("", styles.docEmpty),
            ...Array.from({ length: 5 }, () => makeCell("", styles.docEmpty)),
          ],
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
            makeCell("Module Type", styles.sideLabel),
            makeCell("module-5", styles.configVal),
            ...Array.from({ length: 5 }, () => makeCell("", styles.configVal)),
          ],
          [
            makeCell("A+ Content Title", styles.sideLabel),
            makeCell("My Premium Comparison Chart", styles.configVal),
            ...Array.from({ length: 5 }, () => makeCell("", styles.configVal)),
          ],
          [
            makeCell("A+ Draft URL", styles.sideLabel),
            makeCell(
              "https://sellercentral.amazon.com/aplus/edit/...",
              styles.configVal,
            ),
            ...Array.from({ length: 5 }, () => makeCell("", styles.configVal)),
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
            ...Array.from({ length: 5 }, () => makeCell("", styles.normalCol)),
          ],
          [
            makeCell("Show Prices", styles.sideLabel),
            makeCell("TRUE", styles.highlightCol),
            ...Array.from({ length: 5 }, () => makeCell("", styles.normalCol)),
          ],
          [
            makeCell("Show Add To Cart Button", styles.sideLabel),
            makeCell("TRUE", styles.highlightCol),
            ...Array.from({ length: 5 }, () => makeCell("", styles.normalCol)),
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
        const ws = XLSX.utils.aoa_to_sheet(chartData);
        ws["!cols"] = [
          { wch: 25 },
          { wch: 30 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
        ];
        const moduleIdsString = MODULE_REGISTRY.map((m) => m.id).join(",");
        ws["!dataValidation"] = [
          {
            sqref: "B4:B4",
            type: "list",
            allowBlank: false,
            formula1: `"${moduleIdsString}"`,
          },
          {
            sqref: "B8:G11",
            type: "list",
            allowBlank: true,
            formula1: '"TRUE,FALSE"',
          },
        ];

        const tabName = dedupeSheetName("Comparison Chart", usedNames);
        XLSX.utils.book_append_sheet(workbook, ws, tabName);
      } else {
        // Generic module: vertical key/value layout
        const rows = [
          [makeCell(mod.name, styles.docTitle), makeCell("", styles.docEmpty)],
          [makeCell("", styles.docEmpty), makeCell("", styles.docEmpty)],
          [
            makeCell("Field", styles.tblHeader),
            makeCell("Value", styles.tblHeader),
          ],
          [
            makeCell("Module Type", styles.sideLabel),
            makeCell(mod.id, styles.configVal),
          ],
          [
            makeCell("A+ Content Title", styles.sideLabel),
            makeCell("", styles.configVal),
          ],
          [
            makeCell("A+ Draft URL", styles.sideLabel),
            makeCell("", styles.configVal),
          ],
        ];

        // Add each field from the module schema
        for (const field of mod.fields) {
          const maxNote = field.maxLength
            ? ` (max ${field.maxLength} chars)`
            : "";
          if (field.repeat && field.repeat > 1) {
            for (let i = 1; i <= field.repeat; i++) {
              const label = `${field.label} ${i}${maxNote}`;
              const placeholder =
                field.type === "image" ? "(upload in Amazon editor)" : "";
              rows.push([
                makeCell(label, styles.sideLabel),
                makeCell(placeholder, styles.normalCol),
              ]);
            }
          } else {
            const label = `${field.label}${maxNote}`;
            const placeholder =
              field.type === "image" ? "(upload in Amazon editor)" : "";
            rows.push([
              makeCell(label, styles.sideLabel),
              makeCell(placeholder, styles.normalCol),
            ]);
          }
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{ wch: 35 }, { wch: 60 }];

        const moduleIdsString = MODULE_REGISTRY.map((m) => m.id).join(",");
        ws["!dataValidation"] = [
          {
            sqref: "B4:B4",
            type: "list",
            allowBlank: false,
            formula1: `"${moduleIdsString}"`,
          },
        ];

        const tabName = dedupeSheetName(mod.shortName, usedNames);
        XLSX.utils.book_append_sheet(workbook, ws, tabName);
      }
    });

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const timestampStr = `${yy}-${mm}-${dd}_${hh}-${min}`;

    XLSX.writeFile(
      workbook,
      `APlus_Template_${modulesToGenerate.length}_Modules_${timestampStr}.xlsx`,
      { bookType: "xlsx" },
    );
  }

  /** Ensures unique Excel sheet tab names (max 31 chars, no illegal chars) */
  function dedupeSheetName(name, usedSet) {
    let safe = name.replace(/[\\\/?*\[\]:]/g, "_").slice(0, 31);
    let candidate = safe;
    let counter = 2;
    while (usedSet.has(candidate)) {
      const suffix = ` (${counter++})`;
      candidate = safe.slice(0, 31 - suffix.length) + suffix;
    }
    usedSet.add(candidate);
    return candidate;
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
    const moduleId = chart.moduleId || "module-5";

    if (moduleId === "module-5") {
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

      const docEmpty = {
        border: {
          top: { style: "none" },
          bottom: { style: "none" },
          left: { style: "none" },
          right: { style: "none" },
        },
      };
      const titleStyle = {
        font: { bold: true, sz: 14, color: { rgb: "1F497D" } },
        ...docEmpty,
      };

      const rows = [
        [
          makeCell("Comparison Chart", titleStyle),
          makeCell("", docEmpty),
          ...Array.from({ length: 5 }, () => makeCell("", docEmpty)),
        ],
        [
          makeCell("", docEmpty),
          makeCell("", docEmpty),
          ...Array.from({ length: 5 }, () => makeCell("", docEmpty)),
        ],
        headers,
        [
          makeCell("Module Type", styles.sideLabel),
          makeCell(moduleId, styles.configVal),
          ...Array.from({ length: 5 }, () => makeCell("", styles.configVal)),
        ],
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
          ...Array.from({ length: 6 }, (_, idx) =>
            makeCell(chart.asins[idx] || "", getColStyle(idx)),
          ),
        ],
        [
          makeCell("Highlight Column", styles.sideLabel),
          ...Array.from({ length: 6 }, (_, idx) =>
            makeCell(
              chart.highlightColumn[idx] ? "TRUE" : "FALSE",
              getColStyle(idx),
            ),
          ),
        ],
        [
          makeCell("Show Reviews", styles.sideLabel),
          makeCell(chart.showReviews ? "TRUE" : "FALSE", getColStyle(0)),
          ...Array.from({ length: 5 }, (_, idx) =>
            makeCell("", getColStyle(idx + 1)),
          ),
        ],
        [
          makeCell("Show Prices", styles.sideLabel),
          makeCell(chart.showPrices ? "TRUE" : "FALSE", getColStyle(0)),
          ...Array.from({ length: 5 }, (_, idx) =>
            makeCell("", getColStyle(idx + 1)),
          ),
        ],
        [
          makeCell("Show Add To Cart Button", styles.sideLabel),
          makeCell(chart.showAddToCart ? "TRUE" : "FALSE", getColStyle(0)),
          ...Array.from({ length: 5 }, (_, idx) =>
            makeCell("", getColStyle(idx + 1)),
          ),
        ],
        [
          makeCell("Title", styles.sideLabel),
          ...Array.from({ length: 6 }, (_, idx) =>
            makeCell(chart.titles[idx] || "", getColStyle(idx)),
          ),
        ],
      ];

      if (Array.isArray(chart.attributes)) {
        chart.attributes.forEach((attr) => {
          if (!attr || !attr.name) return;
          rows.push([
            makeCell(attr.name, styles.sideLabel),
            ...Array.from({ length: 6 }, (_, idx) =>
              makeCell(attr.values[idx] || "", getColStyle(idx)),
            ),
          ]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 25 },
        { wch: 30 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
      ];
      ws["!views"] = [{ showGridLines: true }];

      const moduleIdsString = MODULE_REGISTRY.map((m) => m.id).join(",");
      ws["!dataValidation"] = [
        {
          sqref: "B4:B4",
          type: "list",
          allowBlank: false,
          formula1: `"${moduleIdsString}"`,
        },
        {
          sqref: "B8:G11",
          type: "list",
          allowBlank: true,
          formula1: '"TRUE,FALSE"',
        },
      ];

      return ws;
    } else {
      const mod = getModuleById(moduleId);
      const docEmpty = {
        border: {
          top: { style: "none" },
          bottom: { style: "none" },
          left: { style: "none" },
          right: { style: "none" },
        },
      };
      const rows = [
        [
          makeCell(mod ? mod.name : "A+ Module", styles.tblHeader),
          makeCell("", docEmpty),
        ],
        [makeCell("", docEmpty), makeCell("", docEmpty)],
        [
          makeCell("Field", styles.tblHeader),
          makeCell("Value", styles.tblHeader),
        ],
        [
          makeCell("Module Type", styles.sideLabel),
          makeCell(moduleId, styles.configVal),
        ],
        [
          makeCell("A+ Content Title", styles.sideLabel),
          makeCell(chart.contentTitle || "", styles.configVal),
        ],
        [
          makeCell("A+ Draft URL", styles.sideLabel),
          makeCell(chart.draftUrl || "", styles.configVal),
        ],
      ];

      if (mod && chart.fields) {
        mod.fields.forEach((field) => {
          const maxNote = field.maxLength
            ? ` (max ${field.maxLength} chars)`
            : "";
          if (field.repeat && field.repeat > 1) {
            const vals = chart.fields[field.key] || [];
            for (let i = 1; i <= field.repeat; i++) {
              const label = `${field.label} ${i}${maxNote}`;
              const val =
                vals[i - 1] ||
                (field.type === "image" ? "(upload in Amazon editor)" : "");
              rows.push([
                makeCell(label, styles.sideLabel),
                makeCell(val, styles.normalCol),
              ]);
            }
          } else {
            const label = `${field.label}${maxNote}`;
            const val =
              chart.fields[field.key] ||
              (field.type === "image" ? "(upload in Amazon editor)" : "");
            rows.push([
              makeCell(label, styles.sideLabel),
              makeCell(val, styles.normalCol),
            ]);
          }
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 35 }, { wch: 60 }];
      ws["!views"] = [{ showGridLines: true }];

      const moduleIdsString = MODULE_REGISTRY.map((m) => m.id).join(",");
      ws["!dataValidation"] = [
        {
          sqref: "B4:B4",
          type: "list",
          allowBlank: false,
          formula1: `"${moduleIdsString}"`,
        },
      ];

      return ws;
    }
  }

  /** Shared Instructions sheet builder */
  function buildInstructionsSheet() {
    const styles = CHART_SHEET_STYLES;
    const noBorder = {
      border: {
        top: { style: "none" },
        bottom: { style: "none" },
        left: { style: "none" },
        right: { style: "none" },
      },
    };
    const descStyle = {
      font: { sz: 10, color: { rgb: "333333" } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    };
    const data = [
      [
        makeCell("A+ Comparison Chart Builder - Documentation & Instructions", {
          font: { bold: true, sz: 14, color: { rgb: "1F497D" } },
          ...noBorder,
        }),
        makeCell("", noBorder),
      ],
      [
        makeCell(
          "This sheet explains all rules, features, and settings for comparison chart automation.",
          {
            font: { italic: true, sz: 10, color: { rgb: "555555" } },
            ...noBorder,
          },
        ),
        makeCell("", noBorder),
      ],
      [makeCell("", noBorder), makeCell("", noBorder)],
      [
        makeCell("Feature / Configuration", styles.tblHeader),
        makeCell("Instructions & Practical Guidelines", styles.tblHeader),
      ],
      [
        makeCell("A+ Content Title", styles.sideLabel),
        makeCell(
          "Optional. Enter the overall title/name of your A+ Content project.",
          descStyle,
        ),
      ],
      [
        makeCell("A+ Draft URL", styles.sideLabel),
        makeCell(
          "Paste the full Amazon A+ Content Draft URL in cell B3.",
          descStyle,
        ),
      ],
      [
        makeCell("ASIN", styles.sideLabel),
        makeCell(
          "Strictly required. Row 4 contains the ASIN (10-character Amazon Identifier).",
          descStyle,
        ),
      ],
      [
        makeCell("Highlight Column", styles.sideLabel),
        makeCell(
          "Set exactly one column to TRUE (usually Base Product) and others to FALSE.",
          descStyle,
        ),
      ],
      [
        makeCell("Toggles: Reviews, Prices, Cart", styles.sideLabel),
        makeCell(
          "Set 'Show Reviews', 'Show Prices', and 'Show Add To Cart Button' to TRUE or FALSE.",
          descStyle,
        ),
      ],
      [
        makeCell("Title", styles.sideLabel),
        makeCell(
          "Strictly required. The display names/titles of your products.",
          descStyle,
        ),
      ],
      [
        makeCell("Comparison Metrics", styles.sideLabel),
        makeCell(
          "Rows 9+ represent comparison features. Up to 10 allowed.",
          descStyle,
        ),
      ],
      [
        makeCell("Checkmarks & Icons", styles.sideLabel),
        makeCell(
          "Green checkmark: 'True', 'Check', '\u2714', or '\u2713'.\nEmpty circle: 'False', or 'N'.\nText values: 'Yes', 'No', 'X', or any other text.",
          descStyle,
        ),
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 25 }, { wch: 75 }];
    ws["!views"] = [{ showGridLines: true }];
    return ws;
  }

  /** Downloads a single chart as a standalone Excel workbook */
  function downloadChartAsExcel(chart) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      buildInstructionsSheet(),
      "Instructions",
    );
    const sheetLabel =
      chart.moduleId === "module-5"
        ? "A+ Comparison Chart"
        : getModuleById(chart.moduleId)?.shortName || "A+ Module";
    XLSX.utils.book_append_sheet(
      workbook,
      buildChartWorksheet(chart),
      sheetLabel,
    );
    const sanitizedName = (chart.name || "APlus_Chart").replace(
      /[^a-zA-Z0-9_\-]/g,
      "_",
    );
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
    XLSX.utils.book_append_sheet(
      workbook,
      buildInstructionsSheet(),
      "Instructions",
    );

    // Track used sheet names to avoid duplicates (Excel requires unique tab names)
    const usedNames = new Set(["Instructions"]);
    charts.forEach((chart) => {
      // Excel tab names: max 31 chars, no special chars
      let sheetName = (chart.name || "Chart")
        .replace(/[\\\/?*\[\]:]/g, "_") // strip Excel-illegal chars
        .slice(0, 31);
      // Deduplicate by appending a counter
      let candidate = sheetName;
      let counter = 2;
      while (usedNames.has(candidate)) {
        const suffix = ` (${counter++})`;
        candidate = sheetName.slice(0, 31 - suffix.length) + suffix;
      }
      usedNames.add(candidate);
      XLSX.utils.book_append_sheet(
        workbook,
        buildChartWorksheet(chart),
        candidate,
      );
    });

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(workbook, `APlus_All_Charts_${ts}.xlsx`, {
      bookType: "xlsx",
    });
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
          if (chartData) {
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
    let explicitModuleId = null;

    // Search the first 15 rows for "Module Type" cell
    const searchLimit = Math.min(data.length, 15);
    for (let i = 0; i < searchLimit; i++) {
      const firstCell = String((data[i] && data[i][0]) || "")
        .trim()
        .toUpperCase();
      if (firstCell === "MODULE TYPE") {
        explicitModuleId = String(data[i][1] || "").trim();
        break;
      }
    }

    // Default to "module-5" (Comparison Chart) ONLY if no Module Type was explicitly provided in the sheet.
    const moduleId = explicitModuleId || "module-5";
    const mod = getModuleById(moduleId);

    // If a Module Type was explicitly provided but it's not in our library, disable it as an invalid module!
    if (explicitModuleId && !mod) {
      return {
        name: sheetName,
        moduleId: explicitModuleId,
        contentTitle: "",
        draftUrl: "",
        previewUrl: "",
        selected: false,
        fields: {},
      };
    }

    // If we detected a valid generic module, process it vertically:
    if (mod && moduleId !== "module-5") {
      let contentTitle = "";
      let draftUrl = "";
      let previewUrl = "";
      const fields = {};

      // Initialize default values for the fields based on schema
      mod.fields.forEach((f) => {
        if (f.repeat && f.repeat > 1) {
          fields[f.key] = new Array(f.repeat).fill("");
        } else {
          fields[f.key] = "";
        }
      });

      // Scan rows to extract fields, contentTitle, and draftUrl
      data.forEach((row) => {
        if (!row || row.length === 0) return;
        const rawLabel = String(row[0] || "").trim();
        const value = String(row[1] === undefined ? "" : row[1]).trim();
        const labelUpper = rawLabel.toUpperCase();

        if (labelUpper === "A+ CONTENT TITLE") {
          contentTitle = value;
          return;
        }
        if (labelUpper === "A+ DRAFT URL") {
          draftUrl = value;
          previewUrl = buildPreviewUrl(draftUrl);
          return;
        }
        if (
          labelUpper === "MODULE TYPE" ||
          labelUpper === "FIELD" ||
          rawLabel === mod.name
        ) {
          // Skip header/config rows
          return;
        }

        // Clean label: strip "(max ... chars)" suffix
        const cleanLabel = rawLabel
          .replace(/\s*\(max\s+\d+\s+chars\)/i, "")
          .trim();

        // Match against module fields schema
        for (const field of mod.fields) {
          if (field.repeat && field.repeat > 1) {
            for (let i = 1; i <= field.repeat; i++) {
              if (cleanLabel === `${field.label} ${i}`) {
                fields[field.key][i - 1] = value;
                break;
              }
            }
          } else {
            if (cleanLabel === field.label) {
              fields[field.key] = value;
              break;
            }
          }
        }
      });

      return {
        name: sheetName,
        moduleId,
        contentTitle,
        draftUrl,
        previewUrl,
        selected: true,
        fields,
      };
    }

    // Otherwise, process as comparison chart (module-5)
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

    let activeCols = [];
    const KNOWN_LABELS = new Set([
      "A+ CONTENT TITLE",
      "A+ DRAFT URL",
      "ASIN",
      "HIGHLIGHT COLUMN",
      "SHOW REVIEWS",
      "SHOW PRICES",
      "SHOW ADD TO CART BUTTON",
      "TITLE",
      "MODULE TYPE",
      "COMPARISON CHART",
      "FIELD",
      "LABEL / ATTRIBUTE",
    ]);

    data.forEach((row, idx) => {
      const label = String(row[0] || "")
        .trim()
        .toUpperCase();

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
        previewUrl = buildPreviewUrl(draftUrl);
      } else if (label === "HIGHLIGHT COLUMN") {
        highlightColumn = (
          activeCols.length ? activeCols : [0, 1, 2, 3, 4, 5]
        ).map(
          (c) =>
            String(row[c + 1] || "")
              .trim()
              .toUpperCase() === "TRUE",
        );
      } else if (label === "SHOW REVIEWS") {
        showReviews =
          String(row[1] || "")
            .trim()
            .toUpperCase() === "TRUE";
      } else if (label === "SHOW PRICES") {
        showPrices =
          String(row[1] || "")
            .trim()
            .toUpperCase() === "TRUE";
      } else if (label === "SHOW ADD TO CART BUTTON") {
        showAddToCart =
          String(row[1] || "")
            .trim()
            .toUpperCase() === "TRUE";
      } else if (label === "TITLE") {
        titles = (activeCols.length ? activeCols : [0, 1, 2, 3, 4, 5]).map(
          (c) => String(row[c + 1] || "").trim(),
        );
      } else if (row[0] && !KNOWN_LABELS.has(label)) {
        const rowLabel = String(row[0]).trim();
        if (/^row\s*(6|7|8|9|10)$/i.test(rowLabel)) return;
        if (attributes.length < 10) {
          const cols = activeCols.length ? activeCols : [0, 1, 2, 3, 4, 5];
          const values = cols.map((c) =>
            row[c + 1] === undefined ? "" : String(row[c + 1]).trim(),
          );
          attributes.push({ name: row[0], values });
        }
      }
    });

    if (activeCols.length === 0) activeCols = [0, 1, 2, 3, 4, 5];

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
      moduleId: "module-5",
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
      downloadAllBtn.style.display =
        parsedData.length > 1 ? "inline-flex" : "none";
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
      const hasWarnings = !chart.draftUrl;
      const statusClass = hasErrors
        ? "has-errors"
        : hasWarnings
          ? "has-warnings"
          : "is-valid";

      const acc = document.createElement("div");
      acc.className = `chart-accordion ${index === openAccordionIndex ? "open" : ""} ${statusClass}`;

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
      badgeSpan.textContent = hasErrors ? "❌" : hasWarnings ? "⚠️" : "✅";
      badgeSpan.title = hasErrors
        ? `Errors:\n${getChartErrors(chart).join("\n")}`
        : hasWarnings
          ? "Missing A+ Draft URL (A new draft will be created automatically)"
          : "Valid";

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

      const inlineVal = document.createElement("div");
      inlineVal.className = "chart-inline-validation hidden";
      inlineVal.style.marginBottom = "1rem";
      inlineVal.style.padding = "0.75rem";
      inlineVal.style.backgroundColor = "rgba(0,0,0,0.2)";
      inlineVal.style.borderRadius = "var(--radius-sm)";
      inner.appendChild(inlineVal);

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
            chart.previewUrl = buildPreviewUrl(val);

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

      // 2. Conditional rendering based on module type
      if (chart.moduleId === "module-5") {
        // Global Toggles
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

        // Products Grid (Tabular Column Formate)
        inner.appendChild(
          createSectionHeader(`Products (${chart.asins.length}/6)`),
        );

        const prodScroll = document.createElement("div");
        prodScroll.className = "metrics-scroll";

        const prodTable = document.createElement("table");
        prodTable.className = "metrics-table";

        // Table Header
        const prodThead = document.createElement("thead");
        const prodTrHead = document.createElement("tr");

        const thProdField = document.createElement("th");
        thProdField.textContent = "Product Info";
        prodTrHead.appendChild(thProdField);

        for (let c = 0; c < chart.asins.length; c++) {
          const th = document.createElement("th");
          if (c === 0) {
            th.textContent = "Base";
          } else {
            th.style.whiteSpace = "nowrap";

            const spanLabel = document.createElement("span");
            spanLabel.textContent = "Comp " + c + " ";

            const delBtn = document.createElement("button");
            delBtn.className = "btn-icon";
            delBtn.textContent = "🗑";
            delBtn.title = "Remove Competitor";
            delBtn.style.display = "inline-block";
            delBtn.style.marginLeft = "4px";
            delBtn.style.fontSize = "0.75rem";
            delBtn.addEventListener("click", () => {
              chart.asins.splice(c, 1);
              chart.titles.splice(c, 1);
              chart.highlightColumn.splice(c, 1);
              chart.attributes.forEach((attr) => attr.values.splice(c, 1));
              renderPreview();
              validateInputs();
            });
            th.append(spanLabel, delBtn);
          }
          prodTrHead.appendChild(th);
        }
        prodThead.appendChild(prodTrHead);
        prodTable.appendChild(prodThead);

        const prodTbody = document.createElement("tbody");

        // ASIN Row
        const trAsin = document.createElement("tr");
        const tdAsinLabel = document.createElement("td");
        tdAsinLabel.textContent = "ASIN";
        tdAsinLabel.style.fontWeight = "bold";
        trAsin.appendChild(tdAsinLabel);

        for (let c = 0; c < chart.asins.length; c++) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.type = "text";
          input.className = "metric-input";
          input.value = chart.asins[c] || "";
          input.addEventListener("input", (e) => {
            chart.asins[c] = e.target.value;
            validateInputsDebounced();
          });
          td.appendChild(input);
          trAsin.appendChild(td);
        }
        prodTbody.appendChild(trAsin);

        // Title Row
        const trTitle = document.createElement("tr");
        const tdTitleLabel = document.createElement("td");
        tdTitleLabel.textContent = "Title";
        tdTitleLabel.style.fontWeight = "bold";
        trTitle.appendChild(tdTitleLabel);

        for (let c = 0; c < chart.asins.length; c++) {
          const td = document.createElement("td");
          const input = document.createElement("input");
          input.type = "text";
          input.className = "metric-input";
          input.value = chart.titles[c] || "";
          input.addEventListener("input", (e) => {
            chart.titles[c] = e.target.value;
            validateInputsDebounced();
          });
          td.appendChild(input);
          trTitle.appendChild(td);
        }
        prodTbody.appendChild(trTitle);

        // Highlight Row
        const trHl = document.createElement("tr");
        const tdHlLabel = document.createElement("td");
        tdHlLabel.textContent = "Highlight";
        tdHlLabel.style.fontWeight = "bold";
        trHl.appendChild(tdHlLabel);

        for (let c = 0; c < chart.asins.length; c++) {
          const td = document.createElement("td");
          td.style.textAlign = "center";

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = !!chart.highlightColumn[c];
          checkbox.addEventListener("change", (e) => {
            chart.highlightColumn[c] = e.target.checked;
            if (e.target.checked) {
              chart.highlightColumn = chart.highlightColumn.map(
                (_, i) => i === c,
              );
              renderPreview();
            }
            validateInputs();
          });
          td.appendChild(checkbox);
          trHl.appendChild(td);
        }
        prodTbody.appendChild(trHl);

        prodTable.appendChild(prodTbody);
        prodScroll.appendChild(prodTable);
        inner.appendChild(prodScroll);

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

        // Comparison Metrics
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
      } else {
        // Generic module fields layout
        const mod = getModuleById(chart.moduleId);
        if (mod) {
          inner.appendChild(createSectionHeader(`${mod.name} Fields`));

          mod.fields.forEach((field) => {
            if (field.type === "image") {
              const imgRow = createFieldRow(
                field.label,
                "(upload in Amazon editor)",
                () => {},
                "input-disabled",
              );
              const input = imgRow.querySelector("input");
              if (input) input.disabled = true;
              inner.appendChild(imgRow);
            } else {
              const maxNote = field.maxLength
                ? ` (max ${field.maxLength} chars)`
                : "";
              const isTextarea = field.type === "textarea";

              if (field.repeat && field.repeat > 1) {
                if (!Array.isArray(chart.fields[field.key])) {
                  chart.fields[field.key] = new Array(field.repeat).fill("");
                }
                const vals = chart.fields[field.key];
                for (let i = 0; i < field.repeat; i++) {
                  const label = `${field.label} ${i + 1}${maxNote}`;
                  const val = vals[i] || "";
                  if (isTextarea) {
                    inner.appendChild(
                      createTextareaRow(label, val, (newVal) => {
                        chart.fields[field.key][i] = newVal;
                        validateInputsDebounced();
                      }),
                    );
                  } else {
                    inner.appendChild(
                      createFieldRow(label, val, (newVal) => {
                        chart.fields[field.key][i] = newVal;
                        validateInputsDebounced();
                      }),
                    );
                  }
                }
              } else {
                const label = `${field.label}${maxNote}`;
                const val = chart.fields[field.key] || "";
                if (isTextarea) {
                  inner.appendChild(
                    createTextareaRow(label, val, (newVal) => {
                      chart.fields[field.key] = newVal;
                      validateInputsDebounced();
                    }),
                  );
                } else if (field.type === "boolean") {
                  inner.appendChild(
                    createToggle(label, !!val, (newVal) => {
                      chart.fields[field.key] = newVal;
                      validateInputsDebounced();
                    }),
                  );
                } else {
                  inner.appendChild(
                    createFieldRow(label, val, (newVal) => {
                      chart.fields[field.key] = newVal;
                      validateInputsDebounced();
                    }),
                  );
                }
              }
            }
          });
        }
      }

      // Live Amazon Preview Sandbox
      const sandboxContainer = document.createElement("div");
      sandboxContainer.className = "sandbox-container";
      inner.appendChild(sandboxContainer);

      SandboxRenderer.render(
        sandboxContainer,
        chart,
        (type, rowIdx, colIdx, newVal) => {
          if (type === "metric" && chart.moduleId === "module-5") {
            chart.attributes[rowIdx].values[colIdx] = newVal;
            renderPreview();
            validateInputsDebounced();
          } else if (type === "field" && chart.moduleId !== "module-5") {
            if (colIdx !== null && colIdx !== undefined) {
              chart.fields[rowIdx][colIdx] = newVal;
            } else {
              chart.fields[rowIdx] = newVal;
            }
            renderPreview();
            validateInputsDebounced();
          }
        },
      );

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

  function createTextareaRow(label, value, onChange, extraClass = "") {
    const div = document.createElement("div");
    div.className = "field-row textarea-row";
    const labelDiv = document.createElement("div");
    labelDiv.className = "field-label";
    labelDiv.textContent = label;
    div.appendChild(labelDiv);
    const textarea = document.createElement("textarea");
    textarea.className = `field-input ${extraClass}`;
    textarea.value = value || "";
    textarea.style.minHeight = "60px";
    textarea.style.resize = "vertical";
    textarea.addEventListener("input", (e) => onChange(e.target.value));
    div.appendChild(textarea);
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
  } // --- History Logic ---
  // BOLT OPTIMIZATION: Instantiate Intl.RelativeTimeFormat once in DomContentLoaded scope to avoid GC/re-creation overhead during history rendering.
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  function getRelativeTime(timestamp) {
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

      if (entry.type === "run") {
        const exportCsvBtn = document.createElement("button");
        exportCsvBtn.className = "history-action-btn";
        exportCsvBtn.innerHTML = "📊 Export CSV";
        exportCsvBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (entry.runSummary && entry.runSummary.processedCharts) {
            let csvContent = "\uFEFF"; // UTF-8 BOM
            csvContent +=
              "Chart Name,Original A+ Draft Link,Modified Preview Link\n";
            entry.runSummary.processedCharts.forEach((c) => {
              const name = `"${(c.name || "").replace(/"/g, '""')}"`;
              const draft = `"${(c.draftUrl || "").replace(/"/g, '""')}"`;
              const preview = `"${(c.previewUrl || "").replace(/"/g, '""')}"`;
              csvContent += `${name},${draft},${preview}\n`;
            });

            const now = new Date(entry.timestamp);
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
              `APlus_Chart_Run_${yy}${dd}${mm}_${hh}${min}.csv`,
            );
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        });
        actions.appendChild(exportCsvBtn);
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

    if (chart.moduleId === "module-5") {
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

      if (chart.titles) {
        chart.titles.forEach((title, idx) => {
          if (title && title.length > 80) {
            errors.push(
              `Product Title at position ${idx + 1} exceeds 80 characters (current: ${title.length}).`,
            );
          }
        });
      }

      if (chart.attributes) {
        if (chart.attributes.length > 10) {
          errors.push(
            `Too many metric rows (${chart.attributes.length}). Max is 10.`,
          );
        }
        chart.attributes.forEach((attr, rIdx) => {
          if (attr.values) {
            attr.values.forEach((val, cIdx) => {
              if (val && val.length > 250) {
                errors.push(
                  `Metric "${attr.name || "Row " + (rIdx + 1)}" value at position ${cIdx + 1} exceeds 250 characters (current: ${val.length}).`,
                );
              }
            });
          }
        });
      }
    } else {
      const mod = getModuleById(chart.moduleId);
      if (!mod) {
        errors.push(`Unknown module type: "${chart.moduleId}"`);
      } else {
        if (!chart.fields) {
          errors.push("Missing module fields configuration");
        } else {
          mod.fields.forEach((field) => {
            if (field.type === "image") return;

            if (field.repeat && field.repeat > 1) {
              const vals = chart.fields[field.key] || [];
              for (let i = 0; i < field.repeat; i++) {
                const val = vals[i] || "";
                if (field.maxLength && val.length > field.maxLength) {
                  errors.push(
                    `Field "${field.label} ${i + 1}" exceeds ${field.maxLength} characters (current: ${val.length}).`,
                  );
                }
                if (field.required && !val.trim()) {
                  errors.push(`Field "${field.label} ${i + 1}" is required.`);
                }
              }
            } else {
              const val = chart.fields[field.key] || "";
              if (field.maxLength && val.length > field.maxLength) {
                errors.push(
                  `Field "${field.label}" exceeds ${field.maxLength} characters (current: ${val.length}).`,
                );
              }
              if (field.required && !val.trim()) {
                errors.push(`Field "${field.label}" is required.`);
              }
            }
          });
        }
      }
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
            li.style.color = "#ef4444"; // Red for blocking errors
            validationList.appendChild(li);
          });
        }
      });

      // Update accordion colors based on validation without full re-render
      const accordions = previewContainer.querySelectorAll(".chart-accordion");
      parsedData.forEach((chart, index) => {
        if (accordions[index]) {
          const hasErrors = errorsCache[index].length > 0; // reuse cached result
          const hasWarnings = !chart.draftUrl;

          accordions[index].classList.toggle("has-errors", hasErrors);
          accordions[index].classList.toggle(
            "has-warnings",
            !hasErrors && hasWarnings,
          );
          accordions[index].classList.toggle(
            "is-valid",
            !hasErrors && !hasWarnings,
          );

          const badge = accordions[index].querySelector(".accordion-badge");
          if (badge) {
            badge.textContent = hasErrors ? "❌" : hasWarnings ? "⚠️" : "✅";
            badge.title = hasErrors
              ? `Errors:\n${errorsCache[index].join("\n")}`
              : hasWarnings
                ? "Missing A+ Draft URL (A new draft will be created automatically)"
                : "Valid";
          }

          const inlineVal = accordions[index].querySelector(
            ".chart-inline-validation",
          );
          if (inlineVal) {
            if (hasErrors) {
              inlineVal.innerHTML = "";
              const ul = document.createElement("ul");
              ul.style.cssText =
                "margin:0; padding-left: 1.5rem; color: #ef4444; font-size: 0.8rem;";
              errorsCache[index].forEach((err) => {
                const li = document.createElement("li");
                li.style.cssText = "margin-bottom: 0.25rem;";
                li.textContent = err; // 🛡️ Sentinel: Safe text rendering of untrusted Excel input
                ul.appendChild(li);
              });
              inlineVal.appendChild(ul);
              inlineVal.classList.remove("hidden");
            } else if (hasWarnings) {
              inlineVal.innerHTML = `<p style="margin:0; color: #f59e0b; font-size: 0.8rem;">⚠️ Missing A+ Draft URL (A new draft will be created automatically)</p>`;
              inlineVal.classList.remove("hidden");
            } else {
              inlineVal.innerHTML = "";
              inlineVal.classList.add("hidden");
            }
          }
        }
      });
    }

    // Since we're using inline validation, we no longer need the global validation card.
    // Ensure it remains hidden to avoid clutter.
    validationCard.classList.add("hidden");

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

  const openPortalBtn = document.getElementById("openPortalBtn");
  if (openPortalBtn) {
    openPortalBtn.addEventListener("click", () => {
      const portal = document.getElementById("portalSelect").value;
      const domain = document.getElementById("domainSelect").value;

      let url = "";
      if (portal === "seller") {
        url = `https://sellercentral.amazon.${domain}/enhanced-content/content-manager`;
      } else {
        url = `https://vendorcentral.amazon.${domain}/hz/vendor/members/aplus/content-manager`;
      }

      if (chrome && chrome.tabs) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, "_blank");
      }
    });
  }

  startBtn.addEventListener("click", () => {
    const selectedCharts = parsedData.filter(
      (chart) => chart.selected !== false,
    );
    if (selectedCharts.length === 0) return; // Safety check

    // Enrich charts with their module schema so automation script gets all the rules
    const enrichedCharts = selectedCharts.map((chart) => {
      return {
        ...chart,
        moduleSchema: getModuleById(chart.moduleId || "module-5"),
      };
    });

    document.body.classList.add("automation-running");
    statusContainer.classList.remove("hidden");
    startBtn.classList.add("hidden");
    stopBtn.classList.remove("hidden");

    const logList = document.getElementById("logList");
    if (logList) logList.textContent = ""; // Clear previous logs

    const portal = document.getElementById("portalSelect")?.value || "vendor";
    const domain = document.getElementById("domainSelect")?.value || "com";

    chrome.runtime.sendMessage({
      type: "START_AUTOMATION",
      data: {
        charts: enrichedCharts,
        portal: portal,
        domain: domain,
      },
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

  if (exportLogsBtn) {
    exportLogsBtn.addEventListener("click", () => {
      const logList = document.getElementById("logList");
      if (!logList) return;

      const logItems = logList.querySelectorAll("li");
      if (logItems.length === 0) {
        alert("No logs available to export.");
        return;
      }

      const iconToType = {
        "❌": "Error",
        "✅": "Success",
        "🧩": "Module",
        "⏳": "Waiting",
        "⚡": "System",
        ℹ️: "Info",
      };

      const escapeCSV = (str) => `"${String(str).replace(/"/g, '""')}"`;

      const csvRows = ["Timestamp,Type,Message"];

      logItems.forEach((li) => {
        const spans = li.querySelectorAll("span");
        if (spans.length === 3) {
          const time = spans[0].textContent;
          const icon = spans[1].textContent;
          const msg = spans[2].textContent;
          const type = iconToType[icon] || "Unknown";
          csvRows.push(
            `${escapeCSV(time)},${escapeCSV(type)},${escapeCSV(msg)}`,
          );
        } else {
          // Fallback if structure changes
          csvRows.push(`"",${escapeCSV("Info")},${escapeCSV(li.textContent)}`);
        }
      });

      const csvString = csvRows.join("\r\n");
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aplus_publisher_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "AUTOMATION_STATUS") {
      statusText.textContent = message.status;
      progressFill.style.width = `${message.progress}%`;

      const logList = document.getElementById("logList");
      if (logList) {
        const li = document.createElement("li");
        const time = new Date().toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        li.style.marginBottom = "8px";
        li.style.padding = "8px 10px";
        li.style.borderRadius = "var(--radius-sm)";
        li.style.fontSize = "0.75rem";
        li.style.display = "flex";
        li.style.gap = "8px";
        li.style.alignItems = "flex-start";
        li.style.borderLeft = "3px solid transparent";

        let icon = "ℹ️";
        let bgColor = "var(--highlight-bg)";
        let borderColor = "var(--primary)";

        const textLower = message.status.toLowerCase();
        if (textLower.includes("error") || textLower.includes("failed")) {
          icon = "❌";
          bgColor = "var(--error-soft)";
          borderColor = "var(--error)";
        } else if (
          textLower.includes("success") ||
          textLower.includes("completed") ||
          textLower.includes("all charts processed")
        ) {
          icon = "✅";
          bgColor = "var(--success-soft)";
          borderColor = "var(--success)";
        } else if (
          textLower.includes("module") ||
          textLower.includes("processing block")
        ) {
          icon = "🧩";
          borderColor = "var(--warning)";
        } else if (
          textLower.includes("waiting") ||
          textLower.includes("navigating")
        ) {
          icon = "⏳";
          borderColor = "var(--text-muted)";
        } else if (textLower.includes("injecting")) {
          icon = "⚡";
        }

        li.style.backgroundColor = bgColor;
        li.style.borderLeftColor = borderColor;

        li.innerHTML = `
          <span style="opacity: 0.6; font-family: monospace; white-space: nowrap; margin-top: 1px;"></span>
          <span style="font-size: 12px; line-height: 1.2;"></span>
          <span style="flex: 1; color: var(--text-main); font-weight: 500; line-height: 1.4; word-break: break-word;"></span>
        `;
        // 🛡️ Sentinel: Prevent XSS from untrusted status strings via innerHTML
        li.children[0].textContent = time;
        li.children[1].textContent = icon;
        li.children[2].textContent = message.status;
        logList.appendChild(li);

        // auto scroll to bottom
        const logContainer = document.getElementById("logContainer");
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
      }

      const isFinished =
        message.status.includes("All charts processed!") ||
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

      // Sync automatically created draft URLs to in-memory parsedData and update accordion UI inputs
      processed.forEach((procChart) => {
        const matchingIndex = parsedData.findIndex(
          (c) => c.name === procChart.name,
        );
        if (matchingIndex !== -1) {
          const matchingChart = parsedData[matchingIndex];
          matchingChart.draftUrl = procChart.draftUrl;
          matchingChart.previewUrl = procChart.previewUrl;

          const accordions =
            previewContainer.querySelectorAll(".chart-accordion");
          if (accordions[matchingIndex]) {
            const acc = accordions[matchingIndex];
            const urlInput = acc.querySelector(".input-url");
            if (urlInput) {
              urlInput.value = procChart.draftUrl || "";
            }
            const previewEl = acc.querySelector(".preview-link-display");
            if (previewEl) {
              if (procChart.previewUrl) {
                previewEl.href = procChart.previewUrl;
                previewEl.style.display = "inline";
              } else {
                previewEl.style.display = "none";
              }
            }
          }
        }
      });

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

        // Check if any processed chart has a limit error
        const limitReachedCharts = processed.filter(
          (c) => c.error && c.error.includes("Limit reached: Max 5 modules"),
        );
        if (limitReachedCharts.length > 0) {
          const banner = document.createElement("div");
          banner.style.background = "#fff3cd";
          banner.style.border = "1px solid #ffeeba";
          banner.style.color = "#856404";
          banner.style.padding = "10px";
          banner.style.borderRadius = "4px";
          banner.style.marginBottom = "10px";
          banner.style.fontSize = "12px";
          banner.style.fontWeight = "500";
          banner.style.display = "flex";
          banner.style.alignItems = "center";
          banner.style.gap = "8px";

          const iconSpan = document.createElement("span");
          iconSpan.style.fontSize = "16px";
          iconSpan.textContent = "⚠️";

          const textSpan = document.createElement("span");
          textSpan.textContent = `Notice: ${limitReachedCharts.length} chart(s) could not be populated because the target A+ draft already has the maximum limit of 5 modules.`;

          banner.append(iconSpan, textSpan);
          resultsList.appendChild(banner);
        }

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

          item.appendChild(titleDiv);

          if (chart.error) {
            item.style.borderLeft = "4px solid #e74c3c";
            const errorDiv = document.createElement("div");
            errorDiv.style.color = "#e74c3c";
            errorDiv.style.fontWeight = "500";
            errorDiv.style.marginTop = "4px";
            errorDiv.style.fontSize = "11px";
            errorDiv.textContent = `❌ Error: ${chart.error}`;
            item.appendChild(errorDiv);

            // Add draft link anyway if it exists so they can check it
            if (chart.draftUrl) {
              const draftDiv = document.createElement("div");
              draftDiv.style.marginTop = "4px";
              draftDiv.style.fontSize = "11px";
              const draftA = document.createElement("a");
              draftA.href = chart.draftUrl;
              draftA.target = "_blank";
              draftA.style.color = "#555";
              draftA.style.textDecoration = "underline";
              draftA.textContent = "🔗 View Draft";
              draftDiv.appendChild(draftA);
              item.appendChild(draftDiv);
            }
          } else {
            item.style.borderLeft = "4px solid #2ecc71";
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
            item.appendChild(linksDiv);
          }

          resultsList.appendChild(item);
        });
      }

      const bulkOpenBtn = document.getElementById("bulkOpenBtn");
      if (bulkOpenBtn) {
        bulkOpenBtn.onclick = () => {
          const validUrls = processed.map((c) => c.previewUrl).filter(Boolean);
          if (validUrls.length === 0) return;

          // P3: Guard — chrome.windows may not be available in sidepanel context
          if (chrome.windows && chrome.windows.create) {
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
          } else {
            // Fallback: open each URL in a new tab
            validUrls.forEach((url) =>
              chrome.tabs.create({ url, active: false }),
            );
          }
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
        const append = confirm(
          `You already have ${parsedData.length} chart(s) in your preview. Do you want to APPEND the newly generated chart(s) to the existing list? (Click Cancel to REPLACE them)`,
        );
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
