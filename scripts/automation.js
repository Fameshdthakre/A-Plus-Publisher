// scripts/automation.js

if (typeof window.aPlusAutomationLoaded === "undefined") {
  window.aPlusAutomationLoaded = true;
  console.log("A-Plus Publisher: Automation Engine (Katal Edition) Loaded");

  // Intercept page script errors & relay to side panel logs
  window.addEventListener("error", (event) => {
    const errorMsg = event.error
      ? event.error.stack || event.error.message
      : event.message;
    updateStatus(`[Page Error] ${errorMsg}`, 0);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason
      ? event.reason.stack || event.reason.message || event.reason
      : "Unhandled Promise Rejection";
    updateStatus(`[Promise Error] ${reason}`, 0);
  });

  /** M5: Auto-detect Vendor vs Seller Central for preview URLs */
  function buildPreviewUrl(url) {
    if (!url) return "";
    const match = url.match(/\/content\/([a-f0-9\-]{36})/i);
    if (!match || !match[1]) return "";

    try {
      const parsed = new URL(url);
      return `https://${parsed.host}/aplus/api/GetContentPreview?contentId=${match[1]}&deviceType=DESKTOP`;
    } catch (e) {
      const domain = url.includes("vendorcentral")
        ? "vendorcentral.amazon.com"
        : "sellercentral.amazon.com";
      return `https://${domain}/aplus/api/GetContentPreview?contentId=${match[1]}&deviceType=DESKTOP`;
    }
  }

  window.isStopped = false;
  window.currentAutomationChart = null;

  window._networkSaveCompleteResolver = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ status: "ready" });
      return;
    } else if (message.type === "EXECUTE_AUTOMATION") {
      window.isStopped = false;
      startAutomation(message.data);
    } else if (message.type === "STOP_EXECUTION") {
      window.isStopped = true;
    } else if (message.type === "NETWORK_SAVE_COMPLETE") {
      if (window._networkSaveCompleteResolver) {
        window._networkSaveCompleteResolver(message.success);
        window._networkSaveCompleteResolver = null;
      }
    }
  });

  function checkStopped() {
    if (window.isStopped) throw new Error("Automation stopped by user.");
  }

  async function accessDraft(group) {
    const isDashboard =
      window.location.href.includes("/aplus/content-manager") ||
      window.location.href.includes("/enhanced-content/content-manager");

    if (!group.draftUrl && isDashboard) {
      updateStatus("Creating new A+ Content Draft...", 11);
      const createProjBtn = await waitForElement(
        'kat-button[data-component-id="create-project-button"]',
        15000,
      );
      if (!createProjBtn)
        throw new Error('"Start creating A+ content" button not found.');

      checkStopped();
      updateStatus("Clicking 'Start creating A+ content'...", 13);
      clickKatalButton(createProjBtn);

      updateStatus("Waiting for 'Create Basic A+' button...", 15);
      const createBasicBtn = await waitForElement(
        'kat-button[data-component-id="create-emc-standard-button"]',
        10000,
      );
      if (!createBasicBtn)
        throw new Error('"Create Basic A+" button not found.');

      checkStopped();
      updateStatus("Clicking 'Create Basic A+'...", 17);
      clickKatalButton(createBasicBtn);

      await wait(2000);
    }

    updateStatus("Waiting for editor to load...", 19);
    await waitForElement(
      'kat-tab[data-component-id="content-details-tab-edit"]',
      3000,
    );
    checkStopped();

    if (!group.draftUrl) {
      updateStatus("Setting A+ Content Title...", 21);
      const chartTitle = group.contentTitle || "New Draft";
      let contentNameInput =
        findElementDeep(
          'input[part="input"][id*="katal-id"][aria-label*="Content name"]',
        ) || findElementDeep('input[part="input"][aria-label*="Content name"]');

      if (!contentNameInput) {
        contentNameInput =
          findElementDeep('kat-input[label*="Content name"] input') ||
          findElementDeep('input[id*="katal-id"]');
      }

      if (!contentNameInput)
        throw new Error("A+ Content Name input field not found.");
      await fillKatalInput(contentNameInput, chartTitle);
      checkStopped();

      updateStatus("Saving initial empty draft...", 23);
      const saveBtn = findElementDeep(
        'kat-button[data-component-id="save-content-button"]',
      );
      if (!saveBtn) throw new Error("Save Draft button not found.");
      await clickSaveAndVerify(saveBtn);

      updateStatus("Waiting for new Draft URL to register...", 25);
      let newDraftUrl = "";
      await waitForCondition(
        () => {
          const currentUrl = window.location.href;
          if (/\/content\/[a-f0-9\-]{36}/i.test(currentUrl)) {
            newDraftUrl = currentUrl;
            return true;
          }
          return false;
        },
        50,
        200,
      );

      if (!newDraftUrl) {
        newDraftUrl = window.location.href;
        console.warn(
          "Could not find UUID in URL, using current URL:",
          newDraftUrl,
        );
      }

      group.draftUrl = newDraftUrl;
      const preview = buildPreviewUrl(newDraftUrl);
      group.charts.forEach((chart) => {
        chart.draftUrl = newDraftUrl;
        chart.previewUrl = preview;
      });

      updateStatus("New draft saved! Proceeding with populate...", 27);
      await wait(1000);
    }

    updateStatus("Checking Edit Mode...", 12);
    let isEditModeActive = false;
    let editHost = null;

    await waitForCondition(
      () => {
        if (
          findElementDeep(
            'kat-button[data-component-id="cancel-content-edit-button"]',
          )
        ) {
          isEditModeActive = true;
          return true;
        }
        editHost = findElementDeep(
          'kat-button[data-component-id="edit-project-button"]',
        );
        if (editHost) return true;
        return false;
      },
      40,
      200,
    );

    if (!isEditModeActive && editHost) {
      updateStatus("Entering Edit Mode...", 14);
      clickKatalButton(editHost);

      const cancelBtn = await waitForElement(
        'kat-button[data-component-id="cancel-content-edit-button"]',
        10000,
      );
      if (!cancelBtn) {
        console.warn(
          "A-Plus Publisher: Cancel edit button did not appear after clicking Edit.",
        );
      } else {
        isEditModeActive = true;
      }
    } else if (isEditModeActive) {
      updateStatus("Edit Mode already active.", 14);
    } else {
      updateStatus("Neither Edit nor Cancel button found. Proceeding...", 14);
    }
    checkStopped();

    if (group.contentTitle) {
      updateStatus("Setting A+ Content Title...", 18);
      let contentNameInput =
        findElementDeep('input[part="input"][label*="Content name"]') ||
        findElementDeep('input[part="input"][aria-label*="Content name"]');
      if (contentNameInput) {
        await fillKatalInput(contentNameInput, group.contentTitle);
      }
    }
  }

  async function locateTargetModule(
    chart,
    processedCounts,
    allowRecreation = false,
  ) {
    const moduleId = chart.moduleId || "module-5";
    const modSchema = chart.moduleSchema || { name: "Comparison Chart" };
    const typeIndex = processedCounts[moduleId] || 0;

    const existingModules = findAllElementsDeep(
      'div[data-component-id="editor-module"]',
    );

    let matchingModules = [];

    const nameLower = String(modSchema.name || "").toLowerCase();
    const shortLower = String(modSchema.shortName || "").toLowerCase();

    for (const moduleEl of existingModules) {
      // 1. Precise Match: Use data-module-id if present
      const specificModuleWrap = moduleEl.querySelector(
        `div[data-module-id="${moduleId}"]`,
      );
      if (specificModuleWrap) {
        matchingModules.push(moduleEl);
        continue;
      }

      // 2. Fallback Match: Check specific headers to avoid matching stray internal text
      const headerEl = moduleEl.querySelector(
        '.css-1vgtg10, [class*="title"], kat-label',
      );
      let textToMatch = "";
      if (headerEl) {
        textToMatch = (headerEl.textContent || "").toLowerCase();
      } else {
        textToMatch = (moduleEl.textContent || "").toLowerCase();
      }

      if (
        textToMatch.includes(nameLower) ||
        (shortLower && textToMatch.includes(shortLower))
      ) {
        matchingModules.push(moduleEl);
      }
    }

    console.log(
      `Locate Module: Type=${moduleId}, TargetIndex=${typeIndex}, MatchesFound=${matchingModules.length}`,
    );

    if (matchingModules[typeIndex]) {
      const existingEl = matchingModules[typeIndex];

      if (moduleId !== "module-5" && allowRecreation) {
        updateStatus(`Deleting existing ${modSchema.name} to recreate...`, 28);
        const removeBtn = findElementDeep(
          '[data-component-id="remove-module-button"]',
          existingEl,
        );
        if (removeBtn) {
          const btnTarget =
            removeBtn.querySelector('a[role="button"]') || removeBtn;
          btnTarget.click();

          updateStatus("Confirming deletion...", 28);
          const confirmBtn = await waitForElement(
            'kat-button[data-component-id="confirm-modal-primary-button"]',
            3000,
          );
          if (confirmBtn) {
            clickKatalButton(confirmBtn);
          } else {
            console.warn(
              "A-Plus Publisher: Confirmation modal not found after clicking remove.",
            );
          }

          await wait(1500); // Give it time to be removed from the DOM
        } else {
          console.warn(
            `A-Plus Publisher: Could not find remove button for ${modSchema.name}. Attempting to proceed with existing.`,
          );
          return {
            module: existingEl,
            wasRecreated: false,
            alreadyExisted: true,
          };
        }
      } else {
        return {
          module: existingEl,
          wasRecreated: false,
          alreadyExisted: true,
        };
      }
    }

    const currentTotalCount = findAllElementsDeep(
      'div[data-component-id="editor-module"]',
    ).length;
    if (currentTotalCount >= 5) {
      throw new Error(
        `Draft Full: Draft already has 5 modules. Cannot add new ${modSchema.name}.`,
      );
    }

    updateStatus(
      `${modSchema.name} not found at index ${typeIndex}. Adding...`,
      30,
    );
    await createAplusModule(moduleId);

    const newModule = await waitForModuleContainerAtIndex(
      moduleId,
      modSchema,
      typeIndex,
    );
    return { module: newModule, wasRecreated: false, alreadyExisted: false };
  }

  async function waitForModuleContainerAtIndex(
    moduleId,
    modSchema,
    index,
    timeout = 10000,
  ) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const existingModules = findAllElementsDeep(
        'div[data-component-id="editor-module"]',
      );
      let matchingModules = [];
      if (moduleId === "module-5") {
        const comp = findElementDeep('div[data-component-id="comparison"]');
        if (comp) matchingModules.push(comp);
      } else {
        const nameLower = String(modSchema.name || "").toLowerCase();
        const shortLower = String(modSchema.shortName || "").toLowerCase();
        for (const moduleEl of existingModules) {
          const text = (moduleEl.textContent || "").toLowerCase();
          if (
            text.includes(nameLower) ||
            (shortLower && text.includes(shortLower))
          ) {
            matchingModules.push(moduleEl);
          }
        }
      }

      if (matchingModules[index]) {
        return matchingModules[index];
      }
      await wait(200);
    }
    return null;
  }

  /**
   * Clicks the native "Clear" button for all 6 comparison chart columns.
   * DOM structure per column (inside the module):
   *   div[style*="width: 16.6667%"]
   *     div > kat-button[variant="tertiary"]>Clear</kat-button>
   *     div[data-component-id="product-asin-{N}"]
   *
   * This wipes ASIN, title, image, and highlight data for each column,
   * giving us a clean slate to re-enter fresh data without deleting
   * and re-adding the entire module.
   */
  async function clearAllComparisonColumns(module) {
    for (let col = 1; col <= 6; col++) {
      checkStopped();
      const asinContainer = module.querySelector(
        `[data-component-id="product-asin-${col}"]`,
      );
      if (!asinContainer) continue;

      // The Clear button is a sibling kat-button inside the same column wrapper
      const columnWrapper = asinContainer.parentElement;
      if (!columnWrapper) continue;

      const buttons = columnWrapper.querySelectorAll("kat-button");
      let clearBtn = null;
      for (const btn of buttons) {
        const txt = (btn.innerText || btn.textContent || "")
          .trim()
          .toLowerCase();
        if (txt === "clear") {
          clearBtn = btn;
          break;
        }
      }

      if (clearBtn) {
        updateStatus(`Clearing Column ${col}...`, 30 + col);
        clickKatalButton(clearBtn);
        await wait(500);
      }
    }
  }

  async function prepareModuleStructure(module, chart) {
    const moduleId = chart.moduleId || "module-5";
    if (moduleId !== "module-5") {
      return;
    }

    const modSchema = chart.moduleSchema || { name: "Comparison Chart" };
    const attributeRows = chart.attributes || [];

    let existingMetrics = module.querySelectorAll(
      '[data-component-id^="comparison-metric-"]',
    );
    let existingMetricsCount = existingMetrics.length;

    if (existingMetricsCount > attributeRows.length) {
      const excessCount = existingMetricsCount - attributeRows.length;
      updateStatus(`Removing ${excessCount} excess metric row(s)...`, 56);
      for (let k = existingMetricsCount - 1; k >= attributeRows.length; k--) {
        checkStopped();
        const metricEl = existingMetrics[k];
        const rowContainer =
          metricEl.closest('div[style*="width: 16.6667%"]')?.parentElement ||
          metricEl.parentElement;
        let removeBtn = null;
        if (rowContainer) {
          const rowBtns = rowContainer.querySelectorAll("kat-button");
          for (const btn of rowBtns) {
            const txt = (btn.innerText || btn.textContent || "")
              .trim()
              .toLowerCase();
            if (
              txt.includes("remove") ||
              txt.includes("delete") ||
              txt === "×" ||
              txt === "x"
            ) {
              removeBtn = btn;
              break;
            }
          }
          if (!removeBtn) {
            removeBtn = rowContainer.querySelector(
              'kat-button[aria-label*="remove" i], kat-button[aria-label*="delete" i]',
            );
          }
          if (!removeBtn && rowBtns.length > 0) {
            removeBtn = rowBtns[rowBtns.length - 1]; // fallback last button
          }
        }
        if (removeBtn) {
          clickKatalButton(removeBtn);
          await wait(500);
        }
      }

      existingMetrics = module.querySelectorAll(
        '[data-component-id^="comparison-metric-"]',
      );
      existingMetricsCount = existingMetrics.length;
    }

    if (existingMetricsCount < attributeRows.length) {
      let addBtn = null;
      const btns = module.querySelectorAll("kat-button");
      for (const b of btns) {
        if (b.innerText.trim().toLowerCase() === "add metric") {
          addBtn = b;
          break;
        }
      }
      if (addBtn) {
        const addCount = attributeRows.length - existingMetricsCount;
        updateStatus(`Adding ${addCount} metric row(s)...`, 58);
        for (let k = 0; k < addCount; k++) {
          addBtn.click();
          await waitForElementsCount(
            '[data-component-id^="comparison-metric-"]',
            existingMetricsCount + k + 1,
            module,
          );
        }
      }
    }
  }

  async function startAutomation(data) {
    let group = data.group;
    if (!group && data.chart) {
      group = {
        draftUrl: data.chart.draftUrl || null,
        contentTitle: data.chart.contentTitle || data.chart.name || "New Draft",
        charts: [data.chart],
      };
    }
    if (!group || !group.charts || group.charts.length === 0) {
      updateStatus("No charts to process.", 0);
      return;
    }

    const processedCounts = {};

    try {
      updateStatus("Accessing draft...", 10);
      await accessDraft(group);
      checkStopped();

      for (let index = 0; index < group.charts.length; index++) {
        const chart = group.charts[index];
        window.currentAutomationChart = chart;
        updateStatus(
          `Processing chart ${index + 1}/${group.charts.length}: ${chart.name}...`,
          20,
        );

        try {
          const moduleId = chart.moduleId || "module-5";
          const isComparison = moduleId === "module-5";
          const modSchema = chart.moduleSchema || { name: "Comparison Chart" };

          updateStatus(`Locating module ${modSchema.name}...`, 25);
          const locateResult = await locateTargetModule(
            chart,
            processedCounts,
            true,
          );
          let module = locateResult.module;
          const alreadyExisted = locateResult.alreadyExisted;

          if (!module) {
            throw new Error(
              `Failed to locate or add module ${modSchema.name}.`,
            );
          }

          module.scrollIntoView({ behavior: "smooth", block: "center" });
          module.setAttribute("tabindex", "-1");
          module.focus();
          await wait(500);

          if (isComparison) {
            // ── Clear All 6 Columns if the module already existed ──────
            // This wipes existing ASIN data, titles, images etc. via the
            // native "Clear" button Amazon provides for each column.
            if (alreadyExisted) {
              updateStatus("Clearing existing column data...", 30);
              await clearAllComparisonColumns(module);
              await wait(1000);
            }

            updateStatus("Setting Chart Checkboxes...", 35);
            const checkboxStates = buildCheckboxStateMap(chart);
            const allCheckboxes = module.querySelectorAll(
              'kat-checkbox[data-component-id="checkbox"]',
            );
            const limit = Math.min(checkboxStates.length, allCheckboxes.length);
            for (let ci = 0; ci < limit; ci++) {
              checkStopped();
              await toggleKatalCheckbox(allCheckboxes[ci], checkboxStates[ci]);
            }

            updateStatus("Populating ASINs...", 40);
            for (let i = 0; i < 6; i++) {
              checkStopped();
              const colIndex = i + 1;
              if (chart.asins && chart.asins[i]) {
                await fillContainerInput(
                  module,
                  `[data-component-id="product-asin-${colIndex}"]`,
                  chart.asins[i],
                );
              }
            }

            updateStatus("Waiting for ASIN validation...", 44);
            await wait(2500);
            updateStatus("Saving Draft to lock in ASINs...", 45);
            const interimSaveBtn = findElementDeep(
              'kat-button[data-component-id="save-content-button"]',
            );
            if (interimSaveBtn) {
              const oldModule = module;
              await clickSaveAndVerify(interimSaveBtn);

              await waitForCondition(() => !oldModule.isConnected, 20, 200);
              await wait(1000);

              const reLocated = await locateTargetModule(
                chart,
                processedCounts,
                false,
              );
              module = reLocated.module;
              if (!module) {
                throw new Error(
                  `${modSchema.name} module lost after saving draft.`,
                );
              }
            }

            updateStatus("Preparing Metric Rows...", 55);
            await prepareModuleStructure(module, chart);

            module = await ensureModuleConnection(
              module,
              chart,
              processedCounts,
              modSchema,
            );

            updateStatus("Populating Metrics...", 60);
            const attributeRows = chart.attributes || [];
            for (let i = 0; i < attributeRows.length; i++) {
              checkStopped();
              module = await ensureModuleConnection(
                module,
                chart,
                processedCounts,
                modSchema,
              );

              const attr = attributeRows[i];
              const metricIndex = i + 1;
              const metricContainer = module.querySelector(
                `[data-component-id="comparison-metric-${metricIndex}"]`,
              );

              if (metricContainer) {
                await fillContainerInput(
                  module,
                  `[data-component-id="comparison-metric-${metricIndex}"]`,
                  attr.name,
                );

                const columnDiv =
                  metricContainer.closest('div[style*="width: 16.6667%"]') ||
                  metricContainer.parentElement;
                const row = columnDiv.parentElement;
                const cells = Array.from(row.children).filter(
                  (child) => child !== columnDiv,
                );

                const cellLimit = Math.min(
                  (attr.values || []).length,
                  cells.length,
                  (chart.asins || []).length,
                );
                for (let j = 0; j < cellLimit; j++) {
                  const cell = cells[j];
                  const val = attr.values[j];
                  if (val === undefined || val === null) continue;

                  const dropdown = cell.querySelector("kat-dropdown");
                  if (dropdown) {
                    await handleMetricValue(cell, dropdown, val);
                  }
                }
              }
            }

            updateStatus("Populating Product Column Titles...", 91);
            for (let i = 0; i < 6; i++) {
              checkStopped();
              module = await ensureModuleConnection(
                module,
                chart,
                processedCounts,
                modSchema,
              );
              const colIndex = i + 1;
              if (chart.titles && chart.titles[i]) {
                await fillContainerInput(
                  module,
                  `[data-component-id="product-title-${colIndex}"]`,
                  chart.titles[i],
                );
              }
            }
          } else {
            updateStatus(`Populating fields for ${modSchema.name}...`, 45);
            await populateGenericModule(module, chart, modSchema);
          }

          processedCounts[moduleId] = (processedCounts[moduleId] || 0) + 1;

          updateStatus(`Chart ${chart.name} Populated. Saving Draft...`, 95);
          const saveBtn = findElementDeep(
            'kat-button[data-component-id="save-content-button"]',
          );
          if (saveBtn) {
            await clickSaveAndVerify(saveBtn);
            await wait(1000);
          }

          const finalUrl = window.location.href;
          if (finalUrl) {
            chart.draftUrl = finalUrl;
            chart.previewUrl = buildPreviewUrl(finalUrl);

            if (finalUrl.includes("/content/")) {
              group.draftUrl = finalUrl;
              group.charts.forEach((c) => {
                if (!c.draftUrl) {
                  c.draftUrl = finalUrl;
                  c.previewUrl = buildPreviewUrl(finalUrl);
                }
              });
            }
          }

          updateStatus(`Chart ${chart.name} Complete!`, 100);
        } catch (chartError) {
          console.error(`Error on chart ${chart.name}:`, chartError);
          chart.error = chartError.message;
          updateStatus(`Error on ${chart.name}: ${chartError.message}`, 0);

          if (chartError.message === "Automation stopped by user.") {
            throw chartError;
          }
          await wait(2000);
        } finally {
          // Cleanup routine to ensure clean slate for next chart in the group
          const modals = findAllElementsDeep("kat-modal");
          for (const modal of modals) {
            if (
              modal.getAttribute("visible") === "true" ||
              modal.hasAttribute("visible") ||
              modal.style.display !== "none"
            ) {
              console.warn(
                "A-Plus Publisher: Cleaning up stuck modal in finally block.",
              );
              const dismissBtn =
                findElementDeep(
                  'kat-button[data-component-id="confirm-modal-dismiss-button"]',
                  modal,
                ) ||
                findElementDeep(
                  'kat-button[data-component-id="modal-close-button"]',
                  modal,
                ) ||
                findElementDeep('button[aria-label="Close"]', modal) ||
                findElementDeep("kat-button.modal-close-button", modal);
              if (dismissBtn) {
                clickKatalButton(dismissBtn);
              } else {
                document.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "Escape",
                    bubbles: true,
                  }),
                );
              }
              await wait(500);
            }
          }
        }
      }

      updateStatus("Group completed. Finishing session...", 98);
      await wait(3000);
      chrome.runtime.sendMessage({
        type: "GROUP_COMPLETED",
        data: { charts: group.charts },
      });
    } catch (globalError) {
      console.error("Global Session Error:", globalError);
      updateStatus(
        globalError.message === "Automation stopped by user."
          ? "Automation stopped by user."
          : `Session Error: ${globalError.message}`,
        0,
      );

      if (globalError.message === "Automation stopped by user.") {
        group.charts.forEach((c) => {
          if (c.error === undefined && c.draftUrl === undefined) {
            c.error = "Stopped by user.";
          }
        });
      }
      chrome.runtime.sendMessage({
        type: "GROUP_COMPLETED",
        data: { charts: group.charts },
      });
    }
  }

  async function clickSaveAndVerify(saveBtn, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
      checkStopped();

      const savePromise = new Promise((resolve) => {
        window._networkSaveCompleteResolver = resolve;
        // Fallback timeout in case the network request is missed or takes too long (15s)
        setTimeout(() => resolve(false), 15000);
      });

      clickKatalButton(saveBtn);

      updateStatus("Waiting for save to complete...", 90);
      const networkSuccess = await savePromise;
      window._networkSaveCompleteResolver = null;

      if (networkSuccess) {
        return true;
      }

      // Fallback: Check DOM for success alert just in case the network event missed it
      const successAlert = findElementDeep(
        'div[data-component-id="messages-list"] kat-alert[variant="success"]',
      );
      if (successAlert) {
        return true;
      }

      if (i < maxRetries) {
        updateStatus(
          `Save not confirmed. Retrying save... (${i + 1}/${maxRetries})`,
          95,
        );
        await wait(1500); // Wait before retrying
      }
    }
    console.warn(
      "A-Plus Publisher: Save draft did not complete after retries.",
    );
    return false;
  }

  async function handleMetricValue(cell, dropdown, value) {
    const valStr = String(value).trim().toLowerCase();
    const isCheckmark = ["check", "true", "checkmark", "✔", "✓"].includes(
      valStr,
    );
    const isNoCheckmark = ["false", "n"].includes(valStr);

    if (isCheckmark) {
      await selectKatalDropdownOption(dropdown, "✔");
    } else if (
      isNoCheckmark ||
      valStr === "" ||
      valStr === "none" ||
      valStr === "(none)"
    ) {
      await selectKatalDropdownOption(dropdown, "");
    } else {
      // Assume Text
      await selectKatalDropdownOption(dropdown, "null");
      const input = await waitForElement(
        'kat-input[data-component-id="input"], kat-input',
        3000,
        cell,
      );
      if (input) {
        await fillKatalInput(input, value);
      }
    }
  }

  async function fillKatalInput(el, value) {
    if (!el || value === undefined) return;

    const tagName = el.tagName.toLowerCase();
    const nativeInput =
      tagName === "input" || tagName === "textarea"
        ? el
        : el.querySelector("input") || el.shadowRoot?.querySelector("input");

    const currentFromEl = el.value || el.getAttribute("value") || "";
    const currentFromNative = nativeInput ? nativeInput.value || "" : "";
    const currentValue = currentFromNative || currentFromEl;

    if (String(currentValue).trim() === String(value).trim()) {
      return;
    }

    // Universal React 16+ Value Setter Hack
    const setReactValue = (target, val) => {
      const valueSetter = Object.getOwnPropertyDescriptor(target, "value")?.set;
      const prototype = Object.getPrototypeOf(target);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(
        prototype,
        "value",
      )?.set;

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(target, val);
      } else if (valueSetter) {
        valueSetter.call(target, val);
      } else {
        target.value = val;
      }
    };

    if (nativeInput) {
      nativeInput.focus();
      await wait(50);

      // 1. Select existing text
      nativeInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          code: "KeyA",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      nativeInput.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "a",
          code: "KeyA",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      try {
        nativeInput.select();
      } catch (_) {}
      await wait(30);

      // 2. Dispatch a paste event
      try {
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        });
        pasteEvent.clipboardData.setData("text/plain", value);
        nativeInput.dispatchEvent(pasteEvent);
      } catch (err) {}

      // 3. Try native insertion
      let success = false;
      try {
        success = document.execCommand("insertText", false, value);
      } catch (err) {}

      // 4. Force React value update on the native input
      if (!success) setReactValue(nativeInput, value);

      nativeInput.dispatchEvent(new Event("input", { bubbles: true }));
      nativeInput.dispatchEvent(new Event("change", { bubbles: true }));
      nativeInput.blur();
    }

    // 5. CRITICAL: Force React value update on the outer kat-input wrapper!
    // If React is bound to the kat-input (which is standard for A+ web components),
    // mutating the inner input is not enough to update React's internal state.
    if (el !== nativeInput) {
      el.focus();
      setReactValue(el, value);
      el.setAttribute("value", value);

      // Dispatch standard events
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));

      // Dispatch Katal custom events
      el.dispatchEvent(
        new CustomEvent("input", { bubbles: true, detail: { value } }),
      );
      el.dispatchEvent(
        new CustomEvent("change", { bubbles: true, detail: { value } }),
      );
      el.blur();
    }

    await wait(200);
  }

  async function selectKatalDropdownOption(dropdown, label) {
    if (!dropdown) return;

    const currentValue = dropdown.value || dropdown.getAttribute("value") || "";
    if (String(currentValue).trim() === String(label).trim()) {
      return;
    }

    console.log(`Selecting dropdown option: ${label}`);
    dropdown.focus();

    // Amazon's kat-dropdown often uses a 'value' that maps to the label or an ID
    // We try to set the value first
    dropdown.value = label;
    dropdown.dispatchEvent(
      new CustomEvent("change", { bubbles: true, detail: { value: label } }),
    );

    // If it's a true web component, it might need to open the menu
    // But usually for A+ editor, dispatching 'change' with the label works if the state is bound.

    await wait(200);
  }

  async function locateModuleContainer(chart, mod) {
    // Find all editor modules
    const existingModules = findAllElementsDeep(
      'div[data-component-id="editor-module"]',
    );
    if (existingModules.length === 0) return null;

    // If comparison chart (module-5), it has a specific component ID
    if (chart.moduleId === "module-5") {
      const comp = findElementDeep('div[data-component-id="comparison"]');
      if (comp) return comp;
    }

    const nameLower = String(mod.name || "").toLowerCase();
    const shortLower = String(mod.shortName || "").toLowerCase();

    for (const moduleEl of existingModules) {
      // Check if this module header/text contains the name or shortName
      const text = (moduleEl.textContent || "").toLowerCase();
      if (
        text.includes(nameLower) ||
        (shortLower && text.includes(shortLower))
      ) {
        return moduleEl;
      }
    }

    // No match found — return null so caller can create the correct module
    return null;
  }

  async function waitForModuleContainer(chart, modSchema, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const container = await locateModuleContainer(chart, modSchema);
      if (container) return container;
      await wait(200);
    }
    return null;
  }

  async function createAplusModule(moduleId) {
    updateStatus("Looking for Add Module button...", 25);
    const addBtn =
      findElementDeep(
        'div[data-component-id="add-module-button"] div[role="button"] span',
      ) ||
      findElementDeep('div[data-component-id="add-module-button"]') ||
      findElementDeep('[data-component-id="add-module-button"]') ||
      findByText("Add Module") ||
      findByText("Add a Module");

    if (addBtn) {
      addBtn.click();
      await wait(1000); // Give it a second to trigger opening the modal

      updateStatus("Waiting for module picker modal...", 28);
      const modal = await waitForElement(
        '[data-component-id="add-module-modal"]',
        8000,
      );
      if (!modal) {
        updateStatus(
          "Error: Module picker modal did not open. The page layout may have changed.",
          28,
        );
        throw new Error(
          "Module picker modal (add-module-modal) did not open in time. Try refreshing the A+ draft page.",
        );
      }

      updateStatus(`Selecting module ${moduleId}...`, 30);
      const moduleBtn =
        modal.querySelector(`[data-component-id="${moduleId}"]`) ||
        modal.querySelector(
          `div[role="button"][data-component-id="${moduleId}"]`,
        ) ||
        (await waitForElement(
          `[data-component-id="${moduleId}"]`,
          5000,
          modal,
        ));

      if (moduleBtn) {
        moduleBtn.click();
        await wait(2000);
      } else {
        updateStatus(
          `Error: Module "${moduleId}" not found in the picker modal.`,
          30,
        );
        throw new Error(
          `Module button for ${moduleId} not found in the modal. This module type may not be available for your account.`,
        );
      }
    } else {
      updateStatus("Error: 'Add Module' button not found on this page.", 25);
      throw new Error(
        "Add Module button not found. Ensure you are on an A+ Content draft editing page.",
      );
    }
  }

  async function populateGenericModule(moduleContainer, chart, mod) {
    const populatedInputs = new Set();

    for (const field of mod.fields) {
      checkStopped();
      if (field.type === "image") continue;

      const isRepeating = field.repeat && field.repeat > 1;
      const repeatCount = isRepeating ? field.repeat : 1;

      // Ensure dynamic rows exist for lists and collections before trying to fill them
      if (field.type === "list" || field.type === "collection") {
        await prepareDynamicRows(moduleContainer, chart, field, repeatCount);
      }

      for (let r = 0; r < repeatCount; r++) {
        const val = isRepeating
          ? chart.fields[field.key]
            ? chart.fields[field.key][r] || ""
            : ""
          : chart.fields[field.key] || "";

        // Resolve componentId
        let resolvedId = field.componentId || "";
        if (isRepeating && resolvedId.includes("{i}")) {
          resolvedId = resolvedId.replace("{i}", r + 1);
        }

        if (!resolvedId) {
          console.warn(
            `A-Plus Publisher: Field ${field.label} missing componentId. Skipping.`,
          );
          continue;
        }

        // Locate the exact container for this specific input
        let container = null;
        if (field.type === "list") {
          // For lists, resolvedId is the parent list container (e.g. 'list' or 'list2').
          // We need to target the specific list item container.
          const listContainer = findElementDeep(
            `[data-component-id="${resolvedId}"]`,
            moduleContainer,
          );
          if (listContainer) {
            container = findElementDeep(
              `[data-component-id="list-item-${r + 1}"]`,
              listContainer,
            );
          }
        } else if (
          field.type === "collection" &&
          chart.moduleId === "module-16-tech-specs"
        ) {
          // For tech specs, the fields don't have {i}. We rely on node lists inside the collection container.
          const techSpecsContainer = findElementDeep(
            `[data-component-id="tech-specs"]`,
            moduleContainer,
          );
          if (techSpecsContainer) {
            const elements = techSpecsContainer.querySelectorAll(
              `[data-component-id="${resolvedId}"]`,
            );
            if (elements.length > r) {
              container = elements[r];
            }
          }
        } else {
          container = findElementDeep(
            `[data-component-id="${resolvedId}"]`,
            moduleContainer,
          );
        }

        if (!container) {
          console.warn(
            `A-Plus Publisher: Container for ${resolvedId} at index ${r} not found in DOM.`,
          );
          continue;
        }

        // If componentKey is provided, narrow down within container
        let targetEl = container;
        if (field.componentKey) {
          // It could be that the container itself has the componentKey
          if (
            container.getAttribute("data-component-key") === field.componentKey
          ) {
            targetEl = container;
          } else {
            const keyMatch = findElementDeep(
              `[data-component-key="${field.componentKey}"]`,
              container,
            );
            if (keyMatch) targetEl = keyMatch;
          }
        }

        // Now locate the actual native input element within targetEl
        let targetInput = null;
        const tag = targetEl.tagName.toLowerCase();
        if (
          tag === "kat-input" ||
          tag === "kat-textarea" ||
          tag === "input" ||
          tag === "textarea"
        ) {
          targetInput = targetEl;
        } else {
          const possibleInputs = findAllElementsDeep(
            "kat-input, kat-textarea, input, textarea",
            targetEl,
          ).filter((el) => {
            const type = el.getAttribute("type") || "";
            if (
              type === "checkbox" ||
              type === "radio" ||
              type === "file" ||
              type === "submit" ||
              type === "button"
            ) {
              return false;
            }
            if (el.closest("kat-dropdown") || el.closest("kat-button")) {
              return false;
            }
            return true;
          });

          if (possibleInputs.length > 0) {
            // Usually the first matching input inside the container is the correct one
            targetInput = possibleInputs[0];
          }
        }

        if (targetInput && !populatedInputs.has(targetInput)) {
          populatedInputs.add(targetInput);
          const logLabel = isRepeating
            ? `${field.label} ${r + 1}`
            : field.label;
          updateStatus(`Populating ${logLabel}...`, 45);
          await fillKatalInput(targetInput, val);
        } else {
          console.warn(
            `A-Plus Publisher: Input element for ${resolvedId} not found or already populated.`,
          );
        }
      }
    }
  }

  async function prepareDynamicRows(moduleContainer, chart, field, maxItems) {
    // Determine how many actual items the user provided for this field
    let providedCount = 0;
    if (chart.fields && chart.fields[field.key]) {
      const data = chart.fields[field.key];
      if (Array.isArray(data)) {
        providedCount = data.filter((v) => String(v).trim() !== "").length;
      } else if (String(data).trim() !== "") {
        providedCount = 1;
      }
    }

    if (providedCount === 0) return;
    const requiredItems = Math.min(providedCount, maxItems);

    if (field.type === "list") {
      const listContainer = findElementDeep(
        `[data-component-id="${field.componentId}"]`,
        moduleContainer,
      );
      if (!listContainer) return;

      for (let i = 0; i < requiredItems; i++) {
        const currentCount = listContainer.querySelectorAll(
          '[data-component-id^="list-item-"]',
        ).length;
        if (currentCount >= requiredItems) break;

        const addBtn = findByText("Add bullet point", listContainer);
        if (addBtn) {
          clickKatalButton(addBtn);
          await wait(300);
        } else {
          break; // Button not found, stop trying
        }
      }
    } else if (
      field.type === "collection" &&
      chart.moduleId === "module-16-tech-specs"
    ) {
      const techSpecsContainer = findElementDeep(
        `[data-component-id="tech-specs"]`,
        moduleContainer,
      );
      if (!techSpecsContainer) return;

      for (let i = 0; i < requiredItems; i++) {
        // Amazon uses spec-key without index for module 16 tech specs
        const currentCount = techSpecsContainer.querySelectorAll(
          '[data-component-id="spec-key"]',
        ).length;
        if (currentCount >= requiredItems) break;

        const addBtn = findByText("Add specification", techSpecsContainer);
        if (addBtn) {
          clickKatalButton(addBtn);
          await wait(300);
        } else {
          break; // Button not found, stop trying
        }
      }
    }
  }

  async function ensureModuleConnection(
    currentModule,
    chart,
    processedCounts,
    modSchema,
  ) {
    if (currentModule && currentModule.isConnected) return currentModule;
    const reLocated = await locateTargetModule(chart, processedCounts, false);
    if (!reLocated.module) throw new Error(`${modSchema.name} module lost.`);
    return reLocated.module;
  }

  async function fillContainerInput(parent, containerSelector, value) {
    const container = parent.querySelector(containerSelector);
    if (container && value !== undefined && value !== null && value !== "") {
      const input =
        container.querySelector('kat-input[data-component-id="input"]') ||
        container.querySelector("kat-input");
      if (input) {
        await fillKatalInput(input, value);
      }
    }
  }

  function clickKatalButton(katBtn) {
    if (!katBtn) return;
    const innerBtn =
      (katBtn.shadowRoot || katBtn).querySelector('button[class="button"]') ||
      (katBtn.shadowRoot || katBtn).querySelector("button") ||
      katBtn;
    innerBtn.click();
  }

  async function waitForCondition(
    conditionFn,
    maxAttempts = 40,
    interval = 250,
  ) {
    for (let i = 0; i < maxAttempts; i++) {
      checkStopped();
      if (conditionFn()) return true;
      await wait(interval);
    }
    return false;
  }

  function updateStatus(status, progress) {
    chrome.runtime.sendMessage({
      type: "AUTOMATION_STATUS",
      status,
      progress,
    });
  }

  function findElementDeep(selector, root = document) {
    // ⚡ Bolt Optimization: Try native querySelector first
    let el = root.querySelector ? root.querySelector(selector) : null;
    if (el) return el;

    // ⚡ Bolt Optimization: Avoid O(N) Array.shift()
    const queue = [root];
    let queueIdx = 0;

    while (queueIdx < queue.length) {
      const current = queue[queueIdx++];
      if (!current) continue;

      if (current.shadowRoot) {
        el = current.shadowRoot.querySelector(selector);
        if (el) return el;
        queue.push(current.shadowRoot);
      }

      // ⚡ Bolt Optimization: Use native engine instead of manual JS children loop
      if (current.querySelectorAll) {
        const descendants = current.querySelectorAll("*");
        for (let i = 0; i < descendants.length; i++) {
          const child = descendants[i];
          if (child.shadowRoot) {
            el = child.shadowRoot.querySelector(selector);
            if (el) return el;
            queue.push(child.shadowRoot);
          }
        }
      }
    }
    return null;
  }

  function findAllElementsDeep(selector, root = document) {
    const results = [];
    const queue = [root];
    let queueIdx = 0; // ⚡ Bolt Optimization: Avoid O(N) Array.shift()

    while (queueIdx < queue.length) {
      const current = queue[queueIdx++];
      if (!current) continue;

      // ⚡ Bolt Optimization: Batch matches per DOM layer. Trees are disjoint so no duplicates!
      if (current.querySelectorAll) {
        const matches = current.querySelectorAll(selector);
        for (let i = 0; i < matches.length; i++) {
          results.push(matches[i]); // Replaces O(R^2) .includes() check
        }

        // Native traversal to find shadow boundaries
        const descendants = current.querySelectorAll("*");
        for (let i = 0; i < descendants.length; i++) {
          if (descendants[i].shadowRoot) {
            queue.push(descendants[i].shadowRoot);
          }
        }
      }

      if (current.shadowRoot) {
        queue.push(current.shadowRoot);
      }
    }
    return results;
  }

  function findByText(text, root = document) {
    const lowerText = text.toLowerCase();
    let bestMatch = null;

    function traverse(node) {
      if (!node) return;

      const tag = node.tagName ? node.tagName.toLowerCase() : "";
      if (tag) {
        // Read textContent first (extremely cheap, no layout reflow)
        const txt = (node.textContent || "").trim().toLowerCase();
        if (txt.includes(lowerText)) {
          if (
            tag === "button" ||
            tag === "kat-button" ||
            node.getAttribute("role") === "button" ||
            tag === "span" ||
            tag === "div" ||
            tag === "a" ||
            tag === "kat-label" ||
            tag === "label"
          ) {
            // Match innerText only for layout-level validation
            const exactTxt = (node.innerText || node.textContent || "")
              .trim()
              .toLowerCase();
            if (exactTxt.includes(lowerText)) {
              if (
                !bestMatch ||
                exactTxt.length <
                  (bestMatch.innerText || bestMatch.textContent || "").trim()
                    .length
              ) {
                bestMatch = node;
              }
            }
          }
        }
      }

      if (node.shadowRoot) {
        traverse(node.shadowRoot);
      }

      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        traverse(children[i]);
      }
    }

    traverse(root);
    return bestMatch;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForElement(selector, timeout = 5000, parent = document) {
    return new Promise((resolve) => {
      const existing = findElementDeep(selector, parent);
      if (existing) return resolve(existing);

      let timer = null;
      const observer = new MutationObserver(() => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          const el = findElementDeep(selector, parent);
          if (el) {
            observer.disconnect();
            clearTimeout(timeoutId);
            resolve(el);
          }
        }, 50);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function waitForElementsCount(
    selector,
    count,
    parent = document,
    timeout = 5000,
  ) {
    return new Promise((resolve) => {
      const check = () => parent.querySelectorAll(selector).length >= count;
      if (check()) return resolve(true);

      let timer = null;
      const observer = new MutationObserver(() => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          if (check()) {
            observer.disconnect();
            clearTimeout(timeoutId);
            resolve(true);
          }
        }, 50);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeout);
    });
  }

  /**
   * Builds a flat 9-element boolean array mapping to the chart module's checkboxes.
   * DOM order of kat-checkbox[data-component-id="checkbox"] in the module:
   *   [0] Highlight Column 1 (Base Product)
   *   [1] Highlight Column 2 (Competitor 1)
   *   [2] Highlight Column 3 (Competitor 2)
   *   [3] Highlight Column 4 (Competitor 3)
   *   [4] Highlight Column 5 (Competitor 4)
   *   [5] Highlight Column 6 (Competitor 5)
   *   [6] Show Reviews
   *   [7] Show Prices
   *   [8] Show Add To Cart Button
   */
  function buildCheckboxStateMap(chart) {
    const states = [];

    // Indices 0-5: Highlight per column (pad to 6 with false)
    for (let i = 0; i < 6; i++) {
      states.push(
        chart.highlightColumn && typeof chart.highlightColumn[i] !== "undefined"
          ? !!chart.highlightColumn[i]
          : false,
      );
    }

    // Index 6: Show Reviews
    states.push(chart.showReviews !== undefined ? !!chart.showReviews : true);
    // Index 7: Show Prices
    states.push(chart.showPrices !== undefined ? !!chart.showPrices : true);
    // Index 8: Show Add To Cart Button
    states.push(
      chart.showAddToCart !== undefined ? !!chart.showAddToCart : true,
    );

    return states;
  }

  async function toggleKatalCheckbox(checkbox, shouldBeChecked) {
    if (!checkbox) return;

    // The real interactive element is div[part="checkbox-check"] inside the kat-checkbox.
    // It carries aria-checked="true"/"false" and is the reliable click target.
    const checkDiv =
      (checkbox.shadowRoot || checkbox).querySelector(
        'div[part="checkbox-check"]',
      ) || checkbox.querySelector('div[part="checkbox-check"]');

    if (checkDiv) {
      const isCurrentlyChecked =
        checkDiv.getAttribute("aria-checked") === "true";
      if (isCurrentlyChecked !== shouldBeChecked) {
        checkDiv.click();
        await wait(200);
      }
    } else {
      // Fallback: try the outer element directly (shouldn't normally happen)
      const isCurrentlyChecked =
        checkbox.getAttribute("aria-checked") === "true" ||
        checkbox.checked === true ||
        checkbox.hasAttribute("checked");
      if (isCurrentlyChecked !== shouldBeChecked) {
        checkbox.click();
        await wait(200);
      }
    }
  }

  // ── Alt Text Prefill Helper for Manual/Semi-automated Image Uploads ──
  let lastClickedAltText = "";

  document.addEventListener(
    "click",
    (event) => {
      try {
        const chart = window.currentAutomationChart;
        if (!chart || !chart.fields || !chart.moduleSchema) return;

        let target = event.target;
        let imageSlotEl = null;
        while (target && target !== document.body) {
          const compId = target.getAttribute("data-component-id");
          if (
            compId &&
            (compId.includes("image") || compId === "companyLogo")
          ) {
            imageSlotEl = target;
            break;
          }
          target = target.parentElement;
        }

        if (!imageSlotEl) return;

        const clickedId = imageSlotEl.getAttribute("data-component-id");
        const mod = chart.moduleSchema;

        for (const field of mod.fields) {
          if (field.type !== "image") continue;

          if (field.repeat && field.repeat > 1) {
            for (let r = 0; r < field.repeat; r++) {
              const resolvedId = field.componentId.replace("{i}", r + 1);
              if (resolvedId === clickedId) {
                const altKey = `${field.key}_alt`;
                const altVal = chart.fields[altKey]
                  ? chart.fields[altKey][r] || ""
                  : "";
                lastClickedAltText = altVal;
                console.log(
                  `A-Plus Publisher: Registered Alt Text for slot ${clickedId}: "${altVal}"`,
                );
                return;
              }
            }
          } else {
            if (field.componentId === clickedId) {
              const altKey = `${field.key}_alt`;
              const altVal = chart.fields[altKey] || "";
              lastClickedAltText = altVal;
              console.log(
                `A-Plus Publisher: Registered Alt Text for slot ${clickedId}: "${altVal}"`,
              );
              return;
            }
          }
        }
      } catch (e) {
        console.warn("A-Plus Publisher: Alt text tracking error ignored:", e);
      }
    },
    true,
  );

  function tryFillAltTextInModal(modal) {
    try {
      if (!lastClickedAltText) return;

      const altInput =
        modal.querySelector('[data-component-id="image-keywords"] kat-input') ||
        modal.querySelector('kat-input[placeholder*="alt" i]') ||
        modal.querySelector('kat-input[data-component-id="input"]');

      if (altInput) {
        altInput.value = lastClickedAltText;
        altInput.dispatchEvent(new Event("input", { bubbles: true }));
        altInput.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(
          `A-Plus Publisher: Auto-filled Alt Text: "${lastClickedAltText}"`,
        );
      }
    } catch (e) {
      console.warn("A-Plus Publisher: Failed to fill alt text, skipping:", e);
    }
  }

  const modalObserver = new MutationObserver((mutations) => {
    try {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const modal =
              node.querySelector('[data-component-id="image-modal"]') ||
              (node.getAttribute("data-component-id") === "image-modal"
                ? node
                : null);
            if (modal) {
              setTimeout(() => tryFillAltTextInModal(modal), 300);
            }
          }
        } else if (mutation.type === "attributes") {
          const target = mutation.target;
          if (
            target.nodeType === Node.ELEMENT_NODE &&
            target.getAttribute("data-component-id") === "image-modal" &&
            target.getAttribute("visible") === "true"
          ) {
            setTimeout(() => tryFillAltTextInModal(target), 300);
          }
        }
      }
    } catch (e) {
      console.warn("A-Plus Publisher: Modal observer error ignored:", e);
    }
  });

  modalObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["visible", "class", "style"],
  });
} // End of window.aPlusAutomationLoaded check
