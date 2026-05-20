import { AIProvider } from "./ai-provider.js";

export function setupAIGenerator(setParsedData, renderPreview, validateInputs) {
  // --- Settings UI ---
  const platformSelect = document.getElementById("aiPlatformSelect");
  const saveBtn = document.getElementById("saveSettingsBtn");

  // OpenAI Elements
  const openaiRow = document.getElementById("openaiKeyRow");
  const openaiModelRow = document.getElementById("openaiModelRow");
  const openaiCustomRow = document.getElementById("openaiCustomRow");
  const openaiKey = document.getElementById("openaiKeyInput");
  const openaiModelSelect = document.getElementById("openaiModelSelect");
  const openaiCustomInput = document.getElementById("openaiCustomInput");

  // Gemini Elements
  const geminiRow = document.getElementById("geminiKeyRow");
  const geminiModelRow = document.getElementById("geminiModelRow");
  const geminiCustomRow = document.getElementById("geminiCustomRow");
  const geminiKey = document.getElementById("geminiKeyInput");
  const geminiModelSelect = document.getElementById("geminiModelSelect");
  const geminiCustomInput = document.getElementById("geminiCustomInput");

  // Claude Elements
  const claudeRow = document.getElementById("claudeKeyRow");
  const claudeModelRow = document.getElementById("claudeModelRow");
  const claudeCustomRow = document.getElementById("claudeCustomRow");
  const claudeKey = document.getElementById("claudeKeyInput");
  const claudeModelSelect = document.getElementById("claudeModelSelect");
  const claudeCustomInput = document.getElementById("claudeCustomInput");

  function updateKeyVisibility() {
    const platform = platformSelect.value;

    openaiRow.classList.toggle("hidden", platform !== "openai");
    openaiModelRow.classList.toggle("hidden", platform !== "openai");
    openaiCustomRow.classList.toggle(
      "hidden",
      platform !== "openai" || openaiModelSelect.value !== "custom",
    );

    geminiRow.classList.toggle("hidden", platform !== "gemini");
    geminiModelRow.classList.toggle("hidden", platform !== "gemini");
    geminiCustomRow.classList.toggle(
      "hidden",
      platform !== "gemini" || geminiModelSelect.value !== "custom",
    );

    claudeRow.classList.toggle("hidden", platform !== "claude");
    claudeModelRow.classList.toggle("hidden", platform !== "claude");
    claudeCustomRow.classList.toggle(
      "hidden",
      platform !== "claude" || claudeModelSelect.value !== "custom",
    );
  }

  if (platformSelect) {
    platformSelect.addEventListener("change", updateKeyVisibility);
    openaiModelSelect.addEventListener("change", updateKeyVisibility);
    geminiModelSelect.addEventListener("change", updateKeyVisibility);
    claudeModelSelect.addEventListener("change", updateKeyVisibility);

    // Load Settings
    chrome.storage.local.get(["aiSettings"], (result) => {
      const settings = result.aiSettings || {
        aiPlatform: "openai",
        openai: {},
        gemini: {},
        claude: {},
      };
      platformSelect.value = settings.aiPlatform || "openai";

      // Load OpenAI
      openaiKey.value = settings.openai?.key || "";
      const oModel = settings.openai?.model || "gpt-4o";
      if (["gpt-4o", "gpt-4o-mini"].includes(oModel)) {
        openaiModelSelect.value = oModel;
      } else if (oModel) {
        openaiModelSelect.value = "custom";
        openaiCustomInput.value = oModel;
      }

      // Load Gemini
      geminiKey.value = settings.gemini?.key || "";
      const gModel = settings.gemini?.model || "gemini-2.0-flash";
      if (["gemini-2.0-flash", "gemini-2.5-pro"].includes(gModel)) {
        geminiModelSelect.value = gModel;
      } else if (gModel) {
        geminiModelSelect.value = "custom";
        geminiCustomInput.value = gModel;
      }

      // Load Claude
      claudeKey.value = settings.claude?.key || "";
      const cModel = settings.claude?.model || "claude-3-5-sonnet-20241022";
      if (
        ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"].includes(
          cModel,
        )
      ) {
        claudeModelSelect.value = cModel;
      } else if (cModel) {
        claudeModelSelect.value = "custom";
        claudeCustomInput.value = cModel;
      }

      updateKeyVisibility();
    });

    saveBtn.addEventListener("click", () => {
      const settings = {
        aiPlatform: platformSelect.value,
        openai: {
          key: openaiKey.value,
          model:
            openaiModelSelect.value === "custom"
              ? openaiCustomInput.value
              : openaiModelSelect.value,
        },
        gemini: {
          key: geminiKey.value,
          model:
            geminiModelSelect.value === "custom"
              ? geminiCustomInput.value
              : geminiModelSelect.value,
        },
        claude: {
          key: claudeKey.value,
          model:
            claudeModelSelect.value === "custom"
              ? claudeCustomInput.value
              : claudeModelSelect.value,
        },
      };
      chrome.storage.local.set({ aiSettings: settings }, () => {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "Saved!";
        setTimeout(() => {
          saveBtn.textContent = originalText;
        }, 2000);
      });
    });
  }

  // --- AI Generator UI ---
  const dropzone = document.getElementById("aiDropzone");
  const fileInput = document.getElementById("aiFileInput");
  const mappingUI = document.getElementById("aiMappingUI");
  const sheetSelect = document.getElementById("aiSheetSelect");
  const headerRowInput = document.getElementById("aiHeaderRow");
  const generateBtn = document.getElementById("generateChartBtn");

  const mapSelects = {
    asin: document.getElementById("mapAsin"),
    title: document.getElementById("mapTitle"),
    bullets: document.getElementById("mapBullets"),
    desc: document.getElementById("mapDesc"),
    specs: document.getElementById("mapSpecs"),
    category: document.getElementById("mapCategory"),
  };

  const validationHelper = document.getElementById("aiMappingValidationHelper");

  function updateMappingStatus() {
    const asinVal = mapSelects.asin?.value || "";
    const titleVal = mapSelects.title?.value || "";
    const categoryVal = mapSelects.category?.value || "";
    const bulletsVal = mapSelects.bullets?.value || "";
    const descVal = mapSelects.desc?.value || "";

    const requiredKeys = ["asin", "title", "category", "bullets", "desc"];

    Object.entries(mapSelects).forEach(([key, select]) => {
      if (!select) return;
      if (select.value !== "") {
        select.classList.add("mapped-success");
        select.classList.remove("mapped-warning");
      } else {
        select.classList.remove("mapped-success");
        if (requiredKeys.includes(key)) {
          select.classList.add("mapped-warning");
        } else {
          select.classList.remove("mapped-warning");
        }
      }
    });

    const isAllRequiredMapped =
      asinVal !== "" &&
      titleVal !== "" &&
      categoryVal !== "" &&
      bulletsVal !== "" &&
      descVal !== "";

    if (generateBtn) {
      generateBtn.disabled = !isAllRequiredMapped;
      generateBtn.style.opacity = isAllRequiredMapped ? "1" : "0.6";
      generateBtn.style.cursor = isAllRequiredMapped ? "pointer" : "not-allowed";
    }

    if (validationHelper) {
      validationHelper.classList.toggle("hidden", isAllRequiredMapped);
    }
  }

  // Register change listeners for real-time validation status
  Object.values(mapSelects).forEach((select) => {
    if (select) {
      select.addEventListener("change", updateMappingStatus);
    }
  });

  const STRATEGY_DESCRIPTIONS = {
    balanced: "<strong>Balanced CRO (Standard)</strong><br>A structured mix of Hero highlights, checkmarks (10:6), and clean metrics. Best for general products.",
    premium: "<strong>Premium Justification</strong><br>Focuses on quality, materials, and high-end aesthetics. Uses more descriptive checkmarks (10:7) to convey value.",
    technical: "<strong>Technical Focus</strong><br>Emphasizes precise specifications, dimensions, and raw performance data. Checkmarks are used sparingly (10:4).",
    usability: "<strong>Usability & Lifestyle</strong><br>Translates specs into daily benefits (e.g., 'Lasts All Day'). Balanced checkmarks (10:6) focusing on user experience."
  };

  const strategySelect = document.getElementById("aiStrategySelect");
  const strategyInfoCard = document.getElementById("aiStrategyInfoCard");
  if (strategySelect && strategyInfoCard) {
    const updateStrategyCard = () => {
      strategyInfoCard.innerHTML = STRATEGY_DESCRIPTIONS[strategySelect.value] || STRATEGY_DESCRIPTIONS.balanced;
    };
    strategySelect.addEventListener("change", updateStrategyCard);
    updateStrategyCard(); // Initialize
  }

  function showAIError(message) {
    const errorDiv = document.getElementById("aiErrorDiv");
    const errorText = document.getElementById("aiErrorText");
    if (errorDiv && errorText) {
      if (
        message.includes("high demand") ||
        message.includes("experiencing high demand")
      ) {
        errorText.textContent =
          "Gemini is currently overloaded. Please wait a few moments and try again.";
      } else {
        errorText.textContent = message;
      }
      errorDiv.classList.remove("hidden");
      errorDiv.style.display = "flex";
    }
  }

  function hideAIError() {
    const errorDiv = document.getElementById("aiErrorDiv");
    if (errorDiv) {
      errorDiv.classList.add("hidden");
      errorDiv.style.display = "none";
    }
  }

  let currentWorkbook = null;
  let currentSheetData = null; // raw 2D array from sheet

  if (dropzone) {
    dropzone.addEventListener("click", () => fileInput.click());

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
  }

  const changeFileBtn = document.getElementById("aiChangeFileBtn");
  if (changeFileBtn) {
    changeFileBtn.addEventListener("click", () => {
      mappingUI.classList.add("hidden");
      if (dropzone) dropzone.style.display = "block";
      if (fileInput) fileInput.value = "";
      currentWorkbook = null;
      currentSheetData = null;
    });
  }

  function handleFile(file) {
    // Sentinel Security Fix: Prevent DoS by limiting file size (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(
        "File is too large. Please upload a file smaller than 10MB to prevent memory issues.",
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      currentWorkbook = XLSX.read(data, { type: "array" });

      sheetSelect.textContent = "";
      currentWorkbook.SheetNames.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sheetSelect.appendChild(opt);
      });

      if (currentWorkbook.SheetNames.length > 0) {
        loadSheet(currentWorkbook.SheetNames[0]);
        mappingUI.classList.remove("hidden");
        dropzone.style.display = "none"; // hide dropzone once loaded
      }
    };
    reader.readAsArrayBuffer(file);
  }

  if (sheetSelect) {
    sheetSelect.addEventListener("change", (e) => {
      loadSheet(e.target.value);
    });

    headerRowInput.addEventListener("change", () => {
      populateHeaders();
    });
  }

  function loadSheet(sheetName) {
    const worksheet = currentWorkbook.Sheets[sheetName];
    currentSheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    populateHeaders();
  }

  function populateHeaders() {
    if (!currentSheetData || currentSheetData.length === 0) return;

    let headerRowIdx = parseInt(headerRowInput.value) - 1;
    if (isNaN(headerRowIdx) || headerRowIdx < 0) headerRowIdx = 0;

    const headers = currentSheetData[headerRowIdx] || [];

    Object.values(mapSelects).forEach((select) => {
      const currentVal = select.value;
      select.textContent = "";
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "--Select/Ignore--";
      select.appendChild(defaultOpt);
      headers.forEach((h, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = h || `Column ${idx + 1}`;
        select.appendChild(opt);
      });

      // try to restore previous selection if it exists
      if (currentVal && headers[currentVal]) {
        select.value = currentVal;
      }
    });

    // Auto-guess columns
    if (headers.length > 0) {
      headers.forEach((h, idx) => {
        const text = String(h).toLowerCase();
        if (text.includes("asin") && !mapSelects.asin.value)
          mapSelects.asin.value = idx;
        if (text.includes("title") && !mapSelects.title.value)
          mapSelects.title.value = idx;
        if (text.includes("bullet") && !mapSelects.bullets.value)
          mapSelects.bullets.value = idx;
        if (text.includes("desc") && !mapSelects.desc.value)
          mapSelects.desc.value = idx;
        if (text.includes("spec") && !mapSelects.specs.value)
          mapSelects.specs.value = idx;
        if (
          (text.includes("category") || text.includes("department")) &&
          !mapSelects.category.value
        )
          mapSelects.category.value = idx;
      });
    }
    updateMappingStatus();
  }

  const autoMapBtn = document.getElementById("aiAutoMapBtn");
  if (autoMapBtn) {
    autoMapBtn.addEventListener("click", () => {
      runSmartAutoMap();
    });
  }

  function runSmartAutoMap() {
    if (!currentSheetData || currentSheetData.length === 0) {
      alert("Please upload a sheet first before using Auto-Map.");
      return;
    }

    let headerRowIdx = parseInt(headerRowInput.value) - 1;
    if (isNaN(headerRowIdx) || headerRowIdx < 0) headerRowIdx = 0;

    const headers = currentSheetData[headerRowIdx] || [];
    if (headers.length === 0) return;

    // Clean previous success highlights
    Object.values(mapSelects).forEach((select) => {
      if (select) {
        select.classList.remove("mapped-success-highlight");
      }
    });

    // 1. Synonym Keyword Maps
    const keywordMaps = {
      asin: [
        "asin",
        "asin_code",
        "item_id",
        "product_id",
        "parent_asin",
        "child_asin",
        "standard_product_id",
      ],
      title: [
        "title",
        "name",
        "product_name",
        "item_name",
        "product_title",
        "item_title",
        "description_short",
        "header",
        "subject",
      ],
      bullets: [
        "bullet",
        "key_feature",
        "feature_bullet",
        "bullet_point",
        "bulletpoint",
        "bullets",
        "description_bullet",
        "features",
      ],
      desc: [
        "description",
        "desc",
        "product_description",
        "item_description",
        "detail_description",
        "overview",
        "summary",
        "body",
      ],
      specs: [
        "spec",
        "specification",
        "technical_spec",
        "technical_detail",
        "dimensions",
        "weight",
        "attribute",
        "metadata",
        "properties",
        "details",
      ],
      category: [
        "category",
        "categories",
        "department",
        "browse_node",
        "browse node",
        "browse nodes",
        "product_type",
        "sub_category",
        "subcategory",
        "niche",
        "group",
        "type",
      ],
    };

    const mappedIndices = {};
    const mappedFields = new Set();

    // Step 1: Match headers exactly or by clean synonym inclusion
    headers.forEach((h, colIdx) => {
      const cleanText = String(h)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const rawText = String(h).trim().toLowerCase();

      for (const [field, keywords] of Object.entries(keywordMaps)) {
        if (mappedFields.has(field)) continue;

        // Check exact word matches or substantial matches
        const matched = keywords.some((keyword) => {
          const cleanKeyword = keyword.replace(/[^a-z0-9]/g, "");
          return (
            cleanText === cleanKeyword ||
            rawText === keyword ||
            rawText.includes(` ${keyword}`) ||
            rawText.includes(`${keyword} `) ||
            (keyword.length > 3 && rawText.includes(keyword))
          );
        });

        if (matched) {
          mappedIndices[field] = colIdx;
          mappedFields.add(field);
          break;
        }
      }
    });

    // Step 2: Content-Based Inspectors (inspect first 5 data rows to check cell structure)
    const rowCount = Math.min(currentSheetData.length, headerRowIdx + 6);

    // Let's inspect columns for fields that are still unmapped
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      // Collect sample data values from this column
      const samples = [];
      for (let rIdx = headerRowIdx + 1; rIdx < rowCount; rIdx++) {
        if (
          currentSheetData[rIdx] &&
          currentSheetData[rIdx][colIdx] !== undefined
        ) {
          samples.push(String(currentSheetData[rIdx][colIdx]).trim());
        }
      }

      if (samples.length === 0) continue;

      // Check for ASIN pattern (e.g. standard B0... or 10-char alphanum code matching /^[B0-9][A-Z0-9]{9}$/)
      if (!mappedFields.has("asin")) {
        const isAsinLike = samples.every((val) =>
          /^[B0-9][A-Z0-9]{9}$/i.test(val),
        );
        if (isAsinLike) {
          mappedIndices["asin"] = colIdx;
          mappedFields.add("asin");
          continue;
        }
      }

      // Check for Bullets pattern (e.g. starts with standard bullet chars, contains multiple HTML list items, or array brackets)
      if (!mappedFields.has("bullets")) {
        const isBulletLike = samples.some(
          (val) =>
            val.includes("<li>") ||
            val.startsWith("[") ||
            val.includes("\n•") ||
            val.includes("\n-") ||
            val.split(/[•\-*]/).length > 2,
        );
        if (isBulletLike) {
          mappedIndices["bullets"] = colIdx;
          mappedFields.add("bullets");
          continue;
        }
      }

      // Check for Description pattern (e.g. long string with HTML tags like <p>, <div> or long paragraph text)
      if (!mappedFields.has("desc")) {
        const isDescLike = samples.some(
          (val) =>
            val.length > 150 &&
            (val.includes("<p>") ||
              val.includes("<br>") ||
              val.includes("</div>")),
        );
        if (isDescLike) {
          mappedIndices["desc"] = colIdx;
          mappedFields.add("desc");
          continue;
        }
      }
    }

    // Step 3: Apply the mapped values to selector elements and trigger micro-animations
    let mapCount = 0;
    Object.entries(mappedIndices).forEach(([field, colIdx]) => {
      const select = mapSelects[field];
      if (select) {
        select.value = colIdx;
        select.classList.add("mapped-success-highlight");
        mapCount++;

        // Clear animation class after standard delay
        setTimeout(() => {
          select.classList.remove("mapped-success-highlight");
        }, 2000);
      }
    });

    updateMappingStatus();

    if (mapCount > 0) {
      // Play dynamic user notification feedback
      const toast = document.createElement("div");
      toast.style.position = "fixed";
      toast.style.bottom = "20px";
      toast.style.right = "20px";
      toast.style.background = "#10b981";
      toast.style.color = "#fff";
      toast.style.padding = "10px 16px";
      toast.style.borderRadius = "8px";
      toast.style.fontSize = "12px";
      toast.style.fontWeight = "600";
      toast.style.zIndex = "99999";
      toast.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      toast.textContent = `⚡ Smart Mapped ${mapCount} Columns successfully!`;

      document.body.appendChild(toast);
      requestAnimationFrame(() => (toast.style.opacity = "1"));
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    } else {
      alert(
        "Could not auto-detect columns based on header keywords or values. Please select them manually.",
      );
    }
  }

  let currentOpportunities = [];

  function parseAllProducts() {
    if (!currentSheetData) return null;
    const asinCol = mapSelects.asin.value;
    const titleCol = mapSelects.title.value;
    const categoryCol = mapSelects.category.value;
    const bulletsCol = mapSelects.bullets.value;
    const descCol = mapSelects.desc.value;

    if (
      asinCol === "" ||
      titleCol === "" ||
      categoryCol === "" ||
      bulletsCol === "" ||
      descCol === ""
    ) {
      return null;
    }

    let headerRowIdx = parseInt(headerRowInput.value) - 1;
    if (isNaN(headerRowIdx) || headerRowIdx < 0) headerRowIdx = 0;

    const allProducts = [];

    for (let i = headerRowIdx + 1; i < currentSheetData.length; i++) {
      const row = currentSheetData[i];
      if (!row || !row[asinCol]) continue; // Skip empty rows or rows without ASIN

      const asin = String(row[asinCol]).trim();
      const title = String(row[titleCol] || "").trim();
      if (!asin) continue;

      const pd = { ASIN: asin, Title: title };
      if (mapSelects.bullets.value !== "")
        pd.Bullets = row[mapSelects.bullets.value];
      if (mapSelects.desc.value !== "")
        pd.Description = row[mapSelects.desc.value];
      if (mapSelects.specs.value !== "")
        pd.Specifications = row[mapSelects.specs.value];
      if (mapSelects.category.value !== "")
        pd.Category = row[mapSelects.category.value];

      allProducts.push(pd);
    }
    return allProducts;
  }

  function showOpportunities(opps) {
    currentOpportunities = opps;
    const opportunitiesUI = document.getElementById("aiOpportunitiesUI");
    const mappingUIDiv = document.getElementById("aiMappingUI");
    const oppList = document.getElementById("aiOppList");
    const oppText = document.getElementById("aiOppText");

    const allProducts = parseAllProducts() || [];
    const productMap = {};
    allProducts.forEach((p) => (productMap[p.ASIN] = p));

    if (opportunitiesUI && mappingUIDiv && oppList) {
      mappingUIDiv.classList.add("hidden");
      opportunitiesUI.classList.remove("hidden");

      oppList.textContent = "";
      oppText.textContent = `Found ${opps.length} ASIN grouping opportunities!`;

      if (opps.length === 0) {
        const empty = document.createElement("div");
        empty.style.textAlign = "center";
        empty.style.padding = "1rem";
        empty.style.color = "var(--text-muted)";
        empty.style.fontSize = "0.8rem";
        empty.textContent =
          "No logical groupings found. Try adjusting your data or using another file.";
        oppList.appendChild(empty);
      } else {
        opps.forEach((opp, idx) => {
          const card = document.createElement("div");
          card.className = "opp-group-card" + (idx < 10 ? " selected" : "");

          const header = document.createElement("div");
          header.className = "opp-group-header";

          const title = document.createElement("div");
          title.className = "opp-group-title";
          title.innerHTML = `${opp.groupName} <span class="opp-asin-count-badge">${opp.asins.length} ASINs</span>`;

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = idx < 10;
          checkbox.dataset.idx = idx;
          checkbox.setAttribute(
            "aria-label",
            `Select group: ${opp.groupName}`,
          );

          header.append(title, checkbox);

          const asinList = document.createElement("div");
          asinList.className = "opp-asin-list";

          opp.asins.forEach((asin) => {
            const chip = document.createElement("span");
            chip.className = "opp-asin-chip";
            chip.textContent = asin;
            const productTitle = productMap[asin]?.Title || "";
            if (productTitle) {
              chip.title = productTitle;
            }
            asinList.appendChild(chip);
          });

          card.append(header, asinList);
          oppList.appendChild(card);
        });
      }

      // Wire Proceed Button
      const proceedBtn = document.getElementById("proceedGenerateBtn");
      const toggleAllBtn = document.getElementById("aiToggleSelectAllBtn");

      if (proceedBtn) {
        const updateProceedState = () => {
          const checkboxes = oppList.querySelectorAll(
            'input[type="checkbox"]',
          );
          const selected = Array.from(checkboxes).filter((cb) => cb.checked);

          proceedBtn.disabled = selected.length === 0;
          proceedBtn.style.opacity = selected.length === 0 ? "0.5" : "1";
          proceedBtn.style.cursor =
            selected.length === 0 ? "not-allowed" : "pointer";
          proceedBtn.textContent = selected.length > 0 ? `Generate ${selected.length} Charts →` : "Proceed to Generate Charts";

          // Limit selection to maximum 10 charts
          const isMaxReached = selected.length >= 10;
          checkboxes.forEach((cb) => {
            const cardEl = cb.closest(".opp-group-card");
            if (cardEl) {
              cardEl.classList.toggle("selected", cb.checked);
              if (!cb.checked) {
                cb.disabled = isMaxReached;
                cardEl.classList.toggle("max-reached", isMaxReached);
              } else {
                cb.disabled = false;
                cardEl.classList.remove("max-reached");
              }
            }
          });

          if (toggleAllBtn) {
            const allSelected = Array.from(checkboxes).every(cb => cb.checked || cb.disabled);
            toggleAllBtn.textContent = allSelected && selected.length > 0 ? "☐ Deselect All" : "☑ Select All";
          }
        };

        oppList.addEventListener("change", updateProceedState);
        
        if (toggleAllBtn) {
          toggleAllBtn.onclick = () => {
            const checkboxes = Array.from(oppList.querySelectorAll('input[type="checkbox"]'));
            const currentlySelected = checkboxes.filter(cb => cb.checked).length;
            const willSelectAll = currentlySelected < 10 && currentlySelected < checkboxes.length;
            
            let selectedCount = 0;
            checkboxes.forEach(cb => {
              if (willSelectAll) {
                if (selectedCount < 10) {
                  cb.checked = true;
                  selectedCount++;
                } else {
                  cb.checked = false;
                }
              } else {
                cb.checked = false;
              }
            });
            updateProceedState();
          };
        }

        updateProceedState(); // Run once to set initial state

        proceedBtn.onclick = async () => {
          const settingsResult = await new Promise((resolve) => {
            chrome.storage.local.get(["aiSettings"], (res) => resolve(res));
          });
          const latestSettings = settingsResult.aiSettings || {
            aiPlatform: "openai",
            openai: {},
            gemini: {},
            claude: {},
          };

          const selectedCheckboxes = oppList.querySelectorAll(
            'input[type="checkbox"]:checked',
          );
          const selectedIdxs = Array.from(selectedCheckboxes).map((cb) =>
            parseInt(cb.dataset.idx),
          );

          const selectedGroups = selectedIdxs.map(
            (idx) => currentOpportunities[idx],
          );

          if (selectedGroups.length === 0) {
            alert("Please select at least one group to proceed.");
            return;
          }

          const allProducts = parseAllProducts();
          if (!allProducts || allProducts.length === 0) {
            alert("No spreadsheet product data available. Please upload a spreadsheet first.");
            return;
          }

          proceedBtn.disabled = true;
          const progressContainer = document.getElementById("aiProgressContainer");
          const progressText = document.getElementById("aiProgressText");
          if (progressContainer) progressContainer.classList.remove("hidden");
          if (progressText) progressText.textContent = `Generating ${selectedGroups.length} charts...`;
          hideAIError();

          try {
            const strategySelect =
              document.getElementById("aiStrategySelect");
            const selectedStrategy = strategySelect
              ? strategySelect.value
              : "balanced";
            await generateChartsForGroups(
              selectedGroups,
              allProducts,
              latestSettings,
              setParsedData,
              renderPreview,
              validateInputs,
              selectedStrategy,
            );
            // Reset UI
            opportunitiesUI.classList.add("hidden");
            mappingUIDiv.classList.remove("hidden");
            const dropzone = document.getElementById("aiDropzone");
            if (dropzone) dropzone.style.display = "block";
            const fileInput = document.getElementById("aiFileInput");
            if (fileInput) fileInput.value = "";
          } catch (err) {
            showAIError(err.message);
          } finally {
            proceedBtn.disabled = false;
            proceedBtn.textContent = `Generate ${selectedGroups.length} Charts →`;
            if (progressContainer) progressContainer.classList.add("hidden");
          }
        };
      }

      const clearOppBtn = document.getElementById("aiClearOppBtn");
      if (clearOppBtn) {
        clearOppBtn.onclick = () => {
          opportunitiesUI.classList.add("hidden");
          mappingUIDiv.classList.remove("hidden");
        };
      }
    }
  }

  // Wire Export button
  const exportOppBtn = document.getElementById("exportOppBtn");
  if (exportOppBtn) {
    exportOppBtn.addEventListener("click", () => {
      if (!currentOpportunities || currentOpportunities.length === 0) {
        alert("No opportunities available to export.");
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentOpportunities, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "ASIN_Grouping_Opportunities.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  // Wire Import button and hidden file input
  const importOppBtn = document.getElementById("importOppBtn");
  const importOppFile = document.getElementById("importOppFile");
  if (importOppBtn && importOppFile) {
    importOppBtn.addEventListener("click", () => {
      // Validate that Excel file is loaded and mapped
      const asinCol = mapSelects.asin.value;
      const titleCol = mapSelects.title.value;
      const categoryCol = mapSelects.category.value;
      const bulletsCol = mapSelects.bullets.value;
      const descCol = mapSelects.desc.value;

      if (!currentSheetData) {
        alert("Please upload a product data Excel file first.");
        return;
      }
      if (
        asinCol === "" ||
        titleCol === "" ||
        categoryCol === "" ||
        bulletsCol === "" ||
        descCol === ""
      ) {
        alert(
          "Please map all required columns (ASIN, Category, Title, Bullets, and Description) first so imported groups can be resolved.",
        );
        return;
      }
      importOppFile.click();
    });

    importOppFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          // Validate structure
          const isValidArray = Array.isArray(parsed) && parsed.every(item =>
            item && typeof item === "object" && typeof item.groupName === "string" && Array.isArray(item.asins)
          );
          if (!isValidArray) {
            throw new Error("JSON structure must be an array of groups, each having 'groupName' (string) and 'asins' (array of strings).");
          }

          showOpportunities(parsed);
        } catch (err) {
          alert("Failed to parse JSON file: " + err.message);
        } finally {
          importOppFile.value = ""; // Reset file input
        }
      };
      reader.readAsText(file);
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener("click", async () => {
      const allProducts = parseAllProducts();
      if (!allProducts) {
        alert(
          "ASIN, Category, Title, Bullets, and Description columns must be mapped.",
        );
        return;
      }

      if (allProducts.length < 2) {
        alert("Need at least 2 products to identify opportunities.");
        return;
      }

      generateBtn.disabled = true;
      const originalText = generateBtn.textContent;
      generateBtn.textContent = "Analyzing Opportunities...";
      hideAIError();

      const progressContainer = document.getElementById("aiProgressContainer");
      const progressText = document.getElementById("aiProgressText");
      if (progressContainer) progressContainer.classList.remove("hidden");
      if (progressText) progressText.textContent = "Step 1: Reading spreadsheet data...";

      try {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(["aiSettings"], (res) => resolve(res));
        });
        const settings = result.aiSettings || {
          aiPlatform: "openai",
          openai: {},
          gemini: {},
          claude: {},
        };

        const opportunitiesData = allProducts
          .map((p) => ({
            ASIN: p.ASIN,
            Title: p.Title,
            Categories: p.Category || "",
          }))
          .slice(0, 50); // Cap at 50 ASINs for opportunities analysis
          
        if (progressText) progressText.textContent = "Step 2: Analyzing product groupings via AI...";
        
        const opportunities = await AIProvider.identifyOpportunities(
          opportunitiesData,
          settings,
        );

        console.log("Identified opportunities:", opportunities);
        showOpportunities(opportunities);
      } catch (error) {
        console.error(error);
        showAIError(error.message);
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = originalText;
        if (progressContainer) progressContainer.classList.add("hidden");
      }
    });
  }

  async function generateChartsForGroups(
    groups,
    allProducts,
    settings,
    setParsedData,
    renderPreview,
    validateInputs,
    strategy = "balanced",
  ) {
    const productMap = {};
    allProducts.forEach((p) => (productMap[p.ASIN] = p));

    const validChunks = groups
      .map((g) => {
        const products = g.asins.map((asin) => productMap[asin]).filter(Boolean);
        return { group: g, products };
      })
      .filter((entry) => entry.products.length >= 2)
      .slice(0, 10);

    if (validChunks.length === 0) {
      throw new Error("No valid chunks with at least 2 products.");
    }

    const settledResults = await Promise.allSettled(
      validChunks.map(async (entry) => {
        const { group, products: chunk } = entry;
        const chartResult = await AIProvider.generateChart(
          chunk,
          settings,
          strategy,
        );

        // generateChart now returns { metrics, shortTitles }
        const metricsArray = Array.isArray(chartResult) ? chartResult : (chartResult.metrics || []);
        const shortTitles = (chartResult && !Array.isArray(chartResult)) ? (chartResult.shortTitles || {}) : {};

        const asinsList = chunk.map((p) => p.ASIN);
        // Use AI-generated short titles with Excel titles as fallback
        const titlesList = chunk.map((p) => {
          const aiTitle = shortTitles[p.ASIN];
          return (aiTitle && aiTitle.trim()) ? aiTitle.trim() : p.Title;
        });

        const baseAsin = asinsList[0];
        const sheetName =
          validChunks.length > 1
            ? `AI Chart - ${baseAsin}`
            : "AI Generated Chart";

        return {
          name: sheetName,
          contentTitle: group.groupName || `AI Comp - ${baseAsin}`,
          draftUrl: "",
          previewUrl: "",
          asins: asinsList,
          highlightColumn: asinsList.map((_, i) => i === 0),
          showReviews: true,
          showPrices: true,
          showAddToCart: true,
          titles: titlesList,
          attributes: metricsArray.map((m) => {
            const values = asinsList.map((asin) => m.values[asin] || "");
            return { name: m.metricName, values: values };
          }),
        };
      }),
    );

    const chartsArray = settledResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    const failedCount = settledResults.filter(
      (r) => r.status === "rejected",
    ).length;
    if (failedCount > 0) {
      const firstError = settledResults.find(
        (r) => r.status === "rejected",
      )?.reason;
      console.warn(`${failedCount} chart chunk(s) failed:`, firstError);
      if (chartsArray.length === 0) {
        throw new Error(
          `All ${failedCount} chart generation(s) failed: ${firstError?.message}`,
        );
      }
      alert(
        `⚠️ ${failedCount} of ${validChunks.length} chart(s) failed to generate and were skipped. ${chartsArray.length} chart(s) were saved successfully.`,
      );
    }

    if (chartsArray.length === 0) {
      throw new Error("No charts were generated successfully.");
    }

    setParsedData(chartsArray);

    // Switch to Publisher tab and show preview
    const pubTab = document.querySelector('[data-target="tab-publisher"]');
    if (pubTab) pubTab.click();

    renderPreview();
    validateInputs();
  }
}
