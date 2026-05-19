// scripts/automation.js

if (typeof window.aPlusAutomationLoaded === 'undefined') {
    window.aPlusAutomationLoaded = true;
    console.log("A-Plus Publisher: Automation Engine (Katal Edition) Loaded");

    window.isStopped = false;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "PING") {
            sendResponse({ status: "ready" });
            return;
        } else if (message.type === "EXECUTE_AUTOMATION") {
            window.isStopped = false;
            startAutomation(message.data);
        } else if (message.type === "STOP_EXECUTION") {
            window.isStopped = true;
        }
    });


    function checkStopped() {
        if (window.isStopped) throw new Error("Automation stopped by user.");
    }

    async function startAutomation(data) {
        const { chart } = data;

        updateStatus(`Starting Automation for ${chart.name}...`, 10);

        try {
            updateStatus("Waiting for page to fully load...", 11);
            // Wait up to 30 seconds for the main editor tab to appear to ensure SPA is fully loaded
            await waitForElement('kat-tab[data-component-id="content-details-tab-edit"]', 30000);
            checkStopped();

            // Check for Edit Mode
            updateStatus("Checking Edit Mode...", 12);
            let isEditModeActive = false;
            let editHost = null;

            // Poll for up to 8 seconds (40 attempts * 200ms) for either Edit button or Cancel button (indicating already in Edit Mode)
            for (let attempt = 0; attempt < 40; attempt++) {
                checkStopped();
                if (findElementDeep('kat-button[data-component-id="cancel-content-edit-button"]')) {
                    isEditModeActive = true;
                    break;
                }
                editHost = findElementDeep('kat-button[data-component-id="edit-project-button"]');
                if (editHost) {
                    break;
                }
                await wait(200);
            }

            if (!isEditModeActive && editHost) {
                updateStatus("Entering Edit Mode...", 14);
                // Seek nested button[class="button"] or button inside shadowRoot / light DOM
                let editBtn = (editHost.shadowRoot || editHost).querySelector('button[class="button"]')
                    || editHost.querySelector('button[class="button"]')
                    || (editHost.shadowRoot || editHost).querySelector('button')
                    || editHost;

                editBtn.click();

                // Wait for the cancel button to confirm transition to Edit Mode is complete
                const cancelBtn = await waitForElement('kat-button[data-component-id="cancel-content-edit-button"]', 10000);
                if (!cancelBtn) {
                    console.warn("A-Plus Publisher: Cancel edit button did not appear after clicking Edit.");
                } else {
                    isEditModeActive = true;
                }
            } else if (isEditModeActive) {
                updateStatus("Edit Mode already active.", 14);
            } else {
                updateStatus("Neither Edit nor Cancel button found. Proceeding...", 14);
            }
            checkStopped();

            checkStopped();

            updateStatus("Locating Comparison Chart...", 20);
            let module = findElementDeep('div[data-component-id="comparison"]');

            if (!module) {
                updateStatus("Chart not found. Attempting to add...", 30);
                await createComparisonChartModule();
                module = await waitForElement('div[data-component-id="comparison"]', 5000);
            }

            if (!module) throw new Error("Comparison Chart module not found on page.");

            // Shift focus and visual view to the Comparison Chart module container
            module.scrollIntoView({ behavior: 'smooth', block: 'center' });
            module.setAttribute('tabindex', '-1');
            module.focus();
            await new Promise(r => setTimeout(r, 500)); // Brief pause to let transition complete

            // 0. Populate ALL Checkboxes (Highlight 1-6 + Show Reviews/Prices/Cart)
            // The chart module has exactly 9 kat-checkbox elements in DOM order:
            //   [0-5] Highlight checkbox for columns 1-6
            //   [6]   Show Reviews
            //   [7]   Show Prices
            //   [8]   Show Add To Cart Button
            updateStatus("Setting Chart Checkboxes...", 35);

            // Build the 9-element boolean state map from parsed data
            const checkboxStates = buildCheckboxStateMap(chart);
            const allCheckboxes = module.querySelectorAll('kat-checkbox[data-component-id="checkbox"]');

            updateStatus(`Found ${allCheckboxes.length} checkboxes, applying ${checkboxStates.length} states...`, 36);
            const limit = Math.min(checkboxStates.length, allCheckboxes.length);
            for (let ci = 0; ci < limit; ci++) {
                checkStopped();
                await toggleKatalCheckbox(allCheckboxes[ci], checkboxStates[ci]);
            }

            // 1. Populate Header Fields (ASINs only; Product Titles are deferred to the end)
            updateStatus("Populating ASINs...", 40);
            for (let i = 0; i < 6; i++) {
                checkStopped();
                const index = i + 1;

                // ASIN
                if (chart.asins && chart.asins[i]) {
                    const asinContainer = module.querySelector(`[data-component-id="product-asin-${index}"]`);
                    if (asinContainer) {
                        const input = asinContainer.querySelector('kat-input[data-component-id="input"]') || asinContainer.querySelector('kat-input');
                        await fillKatalInput(input, chart.asins[i]);
                    }
                }

                // Note: Highlight checkboxes are now handled in the unified checkbox map above (step 0).

                // Clear competitor column if not needed (to avoid leftover data from previous draft runs)
                if (index > 1 && (!chart.asins || !chart.asins[i])) {
                    const asinContainer = module.querySelector(`[data-component-id="product-asin-${index}"]`);
                    if (asinContainer) {
                        let competitorCol = asinContainer.parentElement;
                        let clearBtn = null;
                        // Climb up the DOM tree to find the column container holding the clear button
                        for (let depth = 0; depth < 5; depth++) {
                            if (!competitorCol || competitorCol === module) break;
                            clearBtn = competitorCol.querySelector('kat-button');
                            if (clearBtn) break;
                            competitorCol = competitorCol.parentElement;
                        }

                        if (competitorCol) {
                            const input = asinContainer.querySelector('kat-input');
                            // Only click clear if the column is currently populated to optimize performance
                            if (clearBtn && input && input.value) {
                                updateStatus(`Clearing leftover Column ${index}...`, 42);
                                clearBtn.click();
                                await new Promise(r => setTimeout(r, 600));
                            }
                        }
                    }
                }
            }

            // 2. Populate Attributes (Metrics)
            updateStatus("Preparing Metric Rows...", 55);
            const attributeRows = chart.attributes || [];

            // Ensure we have enough metric rows created
            const existingMetricsCount = module.querySelectorAll('[data-component-id^="comparison-metric-"]').length;
            if (existingMetricsCount < attributeRows.length) {
                let addBtn = null;
                const btns = module.querySelectorAll('kat-button');
                for (const b of btns) {
                    if (b.innerText.trim().toLowerCase() === 'add metric') {
                        addBtn = b;
                        break;
                    }
                }
                if (addBtn) {
                    const addCount = attributeRows.length - existingMetricsCount;
                    updateStatus(`Adding ${addCount} metric row(s)...`, 58);
                    for (let k = 0; k < addCount; k++) {
                        addBtn.click();
                        await waitForElementsCount('[data-component-id^="comparison-metric-"]', existingMetricsCount + k + 1, module);
                    }
                }
            }

            updateStatus("Populating Metrics...", 60);
            for (let i = 0; i < attributeRows.length; i++) {
                checkStopped();
                const attr = attributeRows[i];
                const metricIndex = i + 1;
                const metricContainer = module.querySelector(`[data-component-id="comparison-metric-${metricIndex}"]`);

                if (metricContainer) {
                    // Fill Metric Name
                    const nameInput = metricContainer.querySelector('kat-input[data-component-id="input"]') || metricContainer.querySelector('kat-input');
                    await fillKatalInput(nameInput, attr.name);

                    // Find the row (parent of the metric name container is the column, parent of that is the row)
                    const columnDiv = metricContainer.closest('div[style*="width: 16.6667%"]') || metricContainer.parentElement;
                    const row = columnDiv.parentElement;
                    const cells = Array.from(row.children).filter(child => child !== columnDiv);

                    // Limit cell population strictly to the number of active ASIN columns specified in Excel
                    const limit = Math.min((attr.values || []).length, cells.length, (chart.asins || []).length);
                    for (let j = 0; j < limit; j++) {
                        const cell = cells[j];
                        const val = attr.values[j];

                        if (val === undefined || val === null) continue;

                        // Each cell has a kat-dropdown to select type (Text, Checkmark, etc.)
                        const dropdown = cell.querySelector('kat-dropdown');
                        if (dropdown) {
                            await handleMetricValue(cell, dropdown, val);
                        }
                    }
                }
                updateStatus(`Populating Metrics (${i + 1}/${attributeRows.length})...`, 60 + (i / attributeRows.length) * 30);
            }

            // 3. Populate All Titles (Product Titles & A+ Content Title) after all table metrics are inserted
            updateStatus("Populating Product Column Titles...", 91);
            for (let i = 0; i < 6; i++) {
                checkStopped();
                const index = i + 1;

                // Title
                if (chart.titles && chart.titles[i]) {
                    const titleContainer = module.querySelector(`[data-component-id="product-title-${index}"]`);
                    if (titleContainer) {
                        const input = titleContainer.querySelector('kat-input[data-component-id="input"]') || titleContainer.querySelector('kat-input');
                        await fillKatalInput(input, chart.titles[i]);
                    }
                }
            }

            if (chart.contentTitle) {
                checkStopped();
                updateStatus("Setting A+ Content Title...", 93);
                let contentNameInput = findElementDeep('kat-input[unique-id="katal-id-0"]') ||
                    findElementDeep('kat-input[label*="Content name" i]') ||
                    findElementDeep('kat-input[label*="Name" i]') ||
                    findElementDeep('kat-input[label*="Title" i]') ||
                    findElementDeep('#aplus-content-name') ||
                    findElementDeep('input[placeholder*="Content name" i]') ||
                    findElementDeep('input[placeholder*="content name" i]');

                if (!contentNameInput) {
                    // Fallback to searching label text and grabbing sibling input
                    const labelEl = findByText("Content name") || findByText("Content Name") || findByText("Content name :");
                    if (labelEl) {
                        const container = labelEl.closest('div') || labelEl.parentElement;
                        if (container) {
                            contentNameInput = container.querySelector('kat-input') || container.querySelector('input');
                        }
                    }
                }

                if (contentNameInput) {
                    await fillKatalInput(contentNameInput, chart.contentTitle);
                }
            }

            checkStopped();

            updateStatus(`Chart ${chart.name} Populated. Saving Draft...`, 95);
            const saveBtn = findElementDeep('kat-button[data-component-id="save-content-button"]');
            if (saveBtn) {
                saveBtn.click();
                // Wait a few seconds for the save to register before moving on
                await wait(3000);
            }

            updateStatus(`Chart ${chart.name} Complete!`, 100);
            chrome.runtime.sendMessage({ type: "CHART_COMPLETED", data: { chart: chart } });
        } catch (error) {
            console.error("Automation Error:", error);
            updateStatus(error.message === "Automation stopped by user." ? "Automation stopped by user." : `Error on ${chart.name}: ${error.message}`, 0);

            // If it wasn't a stop signal, we normally continue to next chart.
            // But if stopped, we just halt.
            if (error.message !== "Automation stopped by user.") {
                chrome.runtime.sendMessage({ type: "CHART_COMPLETED" });
            }
        }
    }

    async function handleMetricValue(cell, dropdown, value) {
        const valStr = String(value).trim().toLowerCase();
        const isCheckmark = ["check", "true", "checkmark", "✔", "✓"].includes(valStr);
        const isNoCheckmark = ["false", "n"].includes(valStr);

        if (isCheckmark) {
            await selectKatalDropdownOption(dropdown, "✔");
        } else if (isNoCheckmark || valStr === "" || valStr === "none" || valStr === "(none)") {
            await selectKatalDropdownOption(dropdown, "");
        } else {
            // Assume Text
            await selectKatalDropdownOption(dropdown, "null");
            const input = await waitForElement('kat-input[data-component-id="input"], kat-input', 3000, cell);
            if (input) {
                await fillKatalInput(input, value);
            }
        }
    }

    async function fillKatalInput(el, value) {
        if (!el || value === undefined) return;

        const currentValue = el.value || el.getAttribute('value') || "";
        if (String(currentValue).trim() === String(value).trim()) {
            return;
        }

        el.focus();

        // 1. Clear existing value first to force clean replacement in React/Katal internal store
        el.value = "";
        el.setAttribute('value', "");
        el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: "" } }));
        el.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { value: "" } }));

        const internalInput = el.querySelector('input') || el.shadowRoot?.querySelector('input');
        if (internalInput) {
            internalInput.focus();
            internalInput.value = "";
            internalInput.dispatchEvent(new Event('input', { bubbles: true }));
            internalInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await wait(50);

        // 2. Populate new value
        el.value = value;
        el.setAttribute('value', value);
        el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value } }));
        el.dispatchEvent(new CustomEvent('input', { bubbles: true, detail: { value } }));

        if (internalInput) {
            internalInput.value = value;
            internalInput.dispatchEvent(new Event('input', { bubbles: true }));
            internalInput.dispatchEvent(new Event('change', { bubbles: true }));
            internalInput.blur();
        }

        el.blur();
        await wait(150);
    }

    async function selectKatalDropdownOption(dropdown, label) {
        if (!dropdown) return;

        const currentValue = dropdown.value || dropdown.getAttribute('value') || "";
        if (String(currentValue).trim() === String(label).trim()) {
            return;
        }

        console.log(`Selecting dropdown option: ${label}`);
        dropdown.focus();

        // Amazon's kat-dropdown often uses a 'value' that maps to the label or an ID
        // We try to set the value first
        dropdown.value = label;
        dropdown.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: label } }));

        // If it's a true web component, it might need to open the menu
        // But usually for A+ editor, dispatching 'change' with the label works if the state is bound.

        await wait(200);
    }

    async function createComparisonChartModule() {
        updateStatus("Looking for Add Module button...", 25);
        const addBtn = findElementDeep('div[data-component-id="add-module-button"] div[role="button"] span')
            || findElementDeep('div[data-component-id="add-module-button"]')
            || findElementDeep('[data-component-id="add-module-button"]')
            || findByText('Add Module')
            || findByText('Add a Module');

        if (addBtn) {
            addBtn.click();
            await wait(1000); // Give it a second to trigger opening the modal

            updateStatus("Waiting for module picker modal...", 28);
            const modal = await waitForElement('[data-component-id="add-module-modal"]', 8000);
            if (!modal) {
                throw new Error("Module picker modal (add-module-modal) did not open in time.");
            }

            updateStatus("Selecting Standard Comparison Chart...", 30);
            // Search scoped to the modal first, then globally
            const moduleBtn = modal.querySelector('[data-component-id="module-5"]')
                || modal.querySelector('div[role="button"][data-component-id="module-5"]')
                || await waitForElement('[data-component-id="module-5"]', 5000, modal);

            if (moduleBtn) {
                moduleBtn.click();
                // Wait for the modal to close and the module to render on the page
                await wait(2000);
            } else {
                throw new Error("Comparison chart module (module-5) not found in the modal.");
            }
        } else {
            throw new Error("Add module button not found.");
        }
    }

    function updateStatus(status, progress) {
        chrome.runtime.sendMessage({
            type: "AUTOMATION_STATUS",
            status,
            progress
        });
    }

    function findElementDeep(selector, root = document) {
        // Try the standard querySelector first (covers light DOM instantly)
        let el = root.querySelector(selector);
        if (el) return el;

        // Optimized linear traversal visiting each node and shadowRoot exactly once
        const queue = [root];
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;

            if (current.shadowRoot) {
                el = current.shadowRoot.querySelector(selector);
                if (el) return el;
                queue.push(current.shadowRoot);
            }

            const children = current.children || [];
            for (let i = 0; i < children.length; i++) {
                queue.push(children[i]);
            }
        }
        return null;
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
                    if (tag === 'button' || tag === 'kat-button' || node.getAttribute('role') === 'button' || tag === 'span' || tag === 'div' || tag === 'a' || tag === 'kat-label' || tag === 'label') {
                        // Match innerText only for layout-level validation
                        const exactTxt = (node.innerText || node.textContent || "").trim().toLowerCase();
                        if (exactTxt.includes(lowerText)) {
                            if (!bestMatch || exactTxt.length < (bestMatch.innerText || bestMatch.textContent || "").trim().length) {
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
        return new Promise(resolve => setTimeout(resolve, ms));
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

    function waitForElementsCount(selector, count, parent = document, timeout = 5000) {
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
                chart.highlightColumn && typeof chart.highlightColumn[i] !== 'undefined'
                    ? !!chart.highlightColumn[i]
                    : false
            );
        }

        // Index 6: Show Reviews
        states.push(chart.showReviews !== undefined ? !!chart.showReviews : true);
        // Index 7: Show Prices
        states.push(chart.showPrices !== undefined ? !!chart.showPrices : true);
        // Index 8: Show Add To Cart Button
        states.push(chart.showAddToCart !== undefined ? !!chart.showAddToCart : true);

        return states;
    }

    async function toggleKatalCheckbox(checkbox, shouldBeChecked) {
        if (!checkbox) return;

        // The real interactive element is div[part="checkbox-check"] inside the kat-checkbox.
        // It carries aria-checked="true"/"false" and is the reliable click target.
        const checkDiv = (checkbox.shadowRoot || checkbox).querySelector('div[part="checkbox-check"]')
            || checkbox.querySelector('div[part="checkbox-check"]');

        if (checkDiv) {
            const isCurrentlyChecked = checkDiv.getAttribute('aria-checked') === 'true';
            if (isCurrentlyChecked !== shouldBeChecked) {
                checkDiv.click();
                await wait(200);
            }
        } else {
            // Fallback: try the outer element directly (shouldn't normally happen)
            const isCurrentlyChecked = checkbox.getAttribute('aria-checked') === 'true'
                || checkbox.checked === true
                || checkbox.hasAttribute('checked');
            if (isCurrentlyChecked !== shouldBeChecked) {
                checkbox.click();
                await wait(200);
            }
        }
    }

} // End of window.aPlusAutomationLoaded check
