import { AIProvider } from './ai-provider.js';

export function setupAIGenerator(setParsedData, renderPreview, validateInputs) {
    // --- Settings UI ---
    const platformSelect = document.getElementById('aiPlatformSelect');
    const saveBtn = document.getElementById('saveSettingsBtn');

    // OpenAI Elements
    const openaiRow = document.getElementById('openaiKeyRow');
    const openaiModelRow = document.getElementById('openaiModelRow');
    const openaiCustomRow = document.getElementById('openaiCustomRow');
    const openaiKey = document.getElementById('openaiKeyInput');
    const openaiModelSelect = document.getElementById('openaiModelSelect');
    const openaiCustomInput = document.getElementById('openaiCustomInput');

    // Gemini Elements
    const geminiRow = document.getElementById('geminiKeyRow');
    const geminiModelRow = document.getElementById('geminiModelRow');
    const geminiCustomRow = document.getElementById('geminiCustomRow');
    const geminiKey = document.getElementById('geminiKeyInput');
    const geminiModelSelect = document.getElementById('geminiModelSelect');
    const geminiCustomInput = document.getElementById('geminiCustomInput');

    // Claude Elements
    const claudeRow = document.getElementById('claudeKeyRow');
    const claudeModelRow = document.getElementById('claudeModelRow');
    const claudeCustomRow = document.getElementById('claudeCustomRow');
    const claudeKey = document.getElementById('claudeKeyInput');
    const claudeModelSelect = document.getElementById('claudeModelSelect');
    const claudeCustomInput = document.getElementById('claudeCustomInput');

    function updateKeyVisibility() {
        const platform = platformSelect.value;

        openaiRow.classList.toggle('hidden', platform !== 'openai');
        openaiModelRow.classList.toggle('hidden', platform !== 'openai');
        openaiCustomRow.classList.toggle('hidden', platform !== 'openai' || openaiModelSelect.value !== 'custom');

        geminiRow.classList.toggle('hidden', platform !== 'gemini');
        geminiModelRow.classList.toggle('hidden', platform !== 'gemini');
        geminiCustomRow.classList.toggle('hidden', platform !== 'gemini' || geminiModelSelect.value !== 'custom');

        claudeRow.classList.toggle('hidden', platform !== 'claude');
        claudeModelRow.classList.toggle('hidden', platform !== 'claude');
        claudeCustomRow.classList.toggle('hidden', platform !== 'claude' || claudeModelSelect.value !== 'custom');
    }

    if (platformSelect) {
        platformSelect.addEventListener('change', updateKeyVisibility);
        openaiModelSelect.addEventListener('change', updateKeyVisibility);
        geminiModelSelect.addEventListener('change', updateKeyVisibility);
        claudeModelSelect.addEventListener('change', updateKeyVisibility);

        // Load Settings
        chrome.storage.local.get(['aiSettings'], (result) => {
            const settings = result.aiSettings || { aiPlatform: 'openai', openai: {}, gemini: {}, claude: {} };
            platformSelect.value = settings.aiPlatform || 'openai';

            // Load OpenAI
            openaiKey.value = settings.openai?.key || '';
            const oModel = settings.openai?.model || 'gpt-4o';
            if (['gpt-4o', 'gpt-4o-mini'].includes(oModel)) {
                openaiModelSelect.value = oModel;
            } else if (oModel) {
                openaiModelSelect.value = 'custom';
                openaiCustomInput.value = oModel;
            }

            // Load Gemini
            geminiKey.value = settings.gemini?.key || '';
            const gModel = settings.gemini?.model || 'gemini-2.0-flash';
            if (['gemini-2.0-flash', 'gemini-2.5-pro'].includes(gModel)) {
                geminiModelSelect.value = gModel;
            } else if (gModel) {
                geminiModelSelect.value = 'custom';
                geminiCustomInput.value = gModel;
            }

            // Load Claude
            claudeKey.value = settings.claude?.key || '';
            const cModel = settings.claude?.model || 'claude-3-5-sonnet-20241022';
            if (['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'].includes(cModel)) {
                claudeModelSelect.value = cModel;
            } else if (cModel) {
                claudeModelSelect.value = 'custom';
                claudeCustomInput.value = cModel;
            }

            updateKeyVisibility();
        });

        saveBtn.addEventListener('click', () => {
            const settings = {
                aiPlatform: platformSelect.value,
                openai: {
                    key: openaiKey.value,
                    model: openaiModelSelect.value === 'custom' ? openaiCustomInput.value : openaiModelSelect.value
                },
                gemini: {
                    key: geminiKey.value,
                    model: geminiModelSelect.value === 'custom' ? geminiCustomInput.value : geminiModelSelect.value
                },
                claude: {
                    key: claudeKey.value,
                    model: claudeModelSelect.value === 'custom' ? claudeCustomInput.value : claudeModelSelect.value
                }
            };
            chrome.storage.local.set({ aiSettings: settings }, () => {
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Saved!';
                setTimeout(() => { saveBtn.textContent = originalText; }, 2000);
            });
        });
    }

    // --- AI Generator UI ---
    const dropzone = document.getElementById('aiDropzone');
    const fileInput = document.getElementById('aiFileInput');
    const mappingUI = document.getElementById('aiMappingUI');
    const sheetSelect = document.getElementById('aiSheetSelect');
    const headerRowInput = document.getElementById('aiHeaderRow');
    const generateBtn = document.getElementById('generateChartBtn');

    const mapSelects = {
        asin: document.getElementById('mapAsin'),
        title: document.getElementById('mapTitle'),
        bullets: document.getElementById('mapBullets'),
        desc: document.getElementById('mapDesc'),
        specs: document.getElementById('mapSpecs'),
        category: document.getElementById('mapCategory')
    };

    let currentWorkbook = null;
    let currentSheetData = null; // raw 2D array from sheet

    if (dropzone) {
        dropzone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFile(file);
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-active');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-active');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-active');
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
    }

    function handleFile(file) {
        // Sentinel Security Fix: Prevent DoS by limiting file size (10MB)
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            alert('File is too large. Please upload a file smaller than 10MB to prevent memory issues.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            currentWorkbook = XLSX.read(data, { type: 'array' });

            sheetSelect.textContent = '';
            currentWorkbook.SheetNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sheetSelect.appendChild(opt);
            });

            if (currentWorkbook.SheetNames.length > 0) {
                loadSheet(currentWorkbook.SheetNames[0]);
                mappingUI.classList.remove('hidden');
                dropzone.style.display = 'none'; // hide dropzone once loaded
            }
        };
        reader.readAsArrayBuffer(file);
    }

    if (sheetSelect) {
        sheetSelect.addEventListener('change', (e) => {
            loadSheet(e.target.value);
        });

        headerRowInput.addEventListener('change', () => {
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

        Object.values(mapSelects).forEach(select => {
            const currentVal = select.value;
            select.textContent = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '--Select/Ignore--';
            select.appendChild(defaultOpt);
            headers.forEach((h, idx) => {
                const opt = document.createElement('option');
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
                if (text.includes('asin') && !mapSelects.asin.value) mapSelects.asin.value = idx;
                if (text.includes('title') && !mapSelects.title.value) mapSelects.title.value = idx;
                if (text.includes('bullet') && !mapSelects.bullets.value) mapSelects.bullets.value = idx;
                if (text.includes('desc') && !mapSelects.desc.value) mapSelects.desc.value = idx;
                if (text.includes('spec') && !mapSelects.specs.value) mapSelects.specs.value = idx;
                if ((text.includes('category') || text.includes('department')) && !mapSelects.category.value) mapSelects.category.value = idx;
            });
        }
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const asinCol = mapSelects.asin.value;
            const titleCol = mapSelects.title.value;

            if (asinCol === '' || titleCol === '') {
                alert('ASIN and Title columns must be mapped.');
                return;
            }

            let headerRowIdx = parseInt(headerRowInput.value) - 1;
            if (isNaN(headerRowIdx) || headerRowIdx < 0) headerRowIdx = 0;

            const allProducts = [];

            for (let i = headerRowIdx + 1; i < currentSheetData.length; i++) {
                const row = currentSheetData[i];
                if (!row || !row[asinCol]) continue; // Skip empty rows or rows without ASIN

                const asin = String(row[asinCol]).trim();
                const title = String(row[titleCol] || '').trim();
                if (!asin) continue;

                const pd = { ASIN: asin, Title: title };
                if (mapSelects.bullets.value !== '') pd.Bullets = row[mapSelects.bullets.value];
                if (mapSelects.desc.value !== '') pd.Description = row[mapSelects.desc.value];
                if (mapSelects.specs.value !== '') pd.Specifications = row[mapSelects.specs.value];
                if (mapSelects.category.value !== '') pd.Category = row[mapSelects.category.value];

                allProducts.push(pd);
            }

            if (allProducts.length < 2) {
                alert('Need at least 2 products to identify opportunities.');
                return;
            }

            generateBtn.disabled = true;
            const originalText = generateBtn.textContent;
            generateBtn.textContent = 'Analyzing Opportunities...';

            try {
                const result = await new Promise((resolve) => {
                    chrome.storage.local.get(['aiSettings'], (res) => resolve(res));
                });
                const settings = result.aiSettings || { aiPlatform: 'openai', openai: {}, gemini: {}, claude: {} };

                const opportunities = await AIProvider.identifyOpportunities(allProducts, settings);

                console.log("Identified opportunities:", opportunities);

                // Show opportunities UI
                const opportunitiesUI = document.getElementById('aiOpportunitiesUI');
                const mappingUIDiv = document.getElementById('aiMappingUI');
                const oppList = document.getElementById('aiOppList');
                const oppText = document.getElementById('aiOppText');

                if (opportunitiesUI && mappingUIDiv && oppList) {
                    mappingUIDiv.classList.add('hidden');
                    opportunitiesUI.classList.remove('hidden');

                    oppList.textContent = '';
                    oppText.textContent = `Found ${opportunities.length} ASIN grouping opportunities!`;

                    if (opportunities.length === 0) {
                        const empty = document.createElement('div');
                        empty.style.textAlign = 'center';
                        empty.style.padding = '1rem';
                        empty.style.color = 'var(--text-muted)';
                        empty.style.fontSize = '0.8rem';
                        empty.textContent = 'No logical groupings found. Try adjusting your data or using another file.';
                        oppList.appendChild(empty);
                    } else {
                        opportunities.forEach((opp, idx) => {
                            const card = document.createElement('div');
                            card.className = 'opp-group-card';

                            const header = document.createElement('div');
                            header.className = 'opp-group-header';

                            const title = document.createElement('div');
                            title.className = 'opp-group-title';
                            title.textContent = opp.groupName;

                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.checked = true;
                            checkbox.dataset.idx = idx;
                            checkbox.setAttribute('aria-label', `Select group: ${opp.groupName}`);

                            header.append(title, checkbox);

                            const asinList = document.createElement('div');
                            asinList.className = 'opp-asin-list';

                            opp.asins.forEach(asin => {
                                const chip = document.createElement('span');
                                chip.className = 'opp-asin-chip';
                                chip.textContent = asin;
                                asinList.appendChild(chip);
                            });

                            card.append(header, asinList);
                            oppList.appendChild(card);
                        });
                    }

                    // Wire Proceed Button
                    const proceedBtn = document.getElementById('proceedGenerateBtn');
                    if (proceedBtn) {
                        // Disable proceed if no groups are selected (Palette UX fix)
                        const updateProceedState = () => {
                            const selected = oppList.querySelectorAll('input[type="checkbox"]:checked');
                            proceedBtn.disabled = selected.length === 0;
                            proceedBtn.style.opacity = selected.length === 0 ? '0.5' : '1';
                            proceedBtn.style.cursor = selected.length === 0 ? 'not-allowed' : 'pointer';
                        };

                        oppList.addEventListener('change', updateProceedState);
                        updateProceedState(); // Run once to set initial state

                        proceedBtn.onclick = async () => {
                            const selectedCheckboxes = oppList.querySelectorAll('input[type="checkbox"]:checked');
                            const selectedIdxs = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.idx));

                            const selectedGroups = selectedIdxs.map(idx => opportunities[idx]);

                            if (selectedGroups.length === 0) {
                                alert('Please select at least one group to proceed.');
                                return;
                            }

                            proceedBtn.disabled = true;
                            proceedBtn.textContent = 'Generating Charts...';

                            try {
                                await generateChartsForGroups(selectedGroups, allProducts, settings, setParsedData, renderPreview, validateInputs);
                                // Reset UI
                                opportunitiesUI.classList.add('hidden');
                                mappingUIDiv.classList.remove('hidden');
                                const dropzone = document.getElementById('aiDropzone');
                                if (dropzone) dropzone.style.display = 'block';
                                const fileInput = document.getElementById('aiFileInput');
                                if (fileInput) fileInput.value = '';
                            } catch (err) {
                                alert(`Error generating charts: ${err.message}`);
                            } finally {
                                proceedBtn.disabled = false;
                                proceedBtn.textContent = 'Proceed to Generate Charts';
                            }
                        };
                    }
                }

            } catch (error) {
                console.error(error);
                alert('Error identifying opportunities: ' + error.message);
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = originalText;
            }
        });
    }

    async function generateChartsForGroups(groups, allProducts, settings, setParsedData, renderPreview, validateInputs) {
        const productMap = {};
        allProducts.forEach(p => productMap[p.ASIN] = p);

        const validChunks = groups.map(g => {
            return g.asins.map(asin => productMap[asin]).filter(Boolean);
        }).filter(chunk => chunk.length >= 2);

        if (validChunks.length === 0) {
            throw new Error('No valid chunks with at least 2 products.');
        }

        const settledResults = await Promise.allSettled(validChunks.map(async (chunk) => {
            const metricsArray = await AIProvider.generateChart(chunk, settings);

            const asinsList = chunk.map(p => p.ASIN);
            const titlesList = chunk.map(p => p.Title);

            const baseAsin = asinsList[0];
            const sheetName = validChunks.length > 1
                ? `AI Chart - ${baseAsin}`
                : "AI Generated Chart";

            return {
                name: sheetName,
                contentTitle: `AI Comp - ${baseAsin}`,
                draftUrl: "",
                previewUrl: "",
                asins: asinsList,
                highlightColumn: asinsList.map((_, i) => i === 0),
                showReviews: true,
                showPrices: true,
                showAddToCart: true,
                titles: titlesList,
                attributes: metricsArray.map(m => {
                    const values = asinsList.map(asin => m.values[asin] || "");
                    return { name: m.metricName, values: values };
                })
            };
        }));

        const chartsArray = settledResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        const failedCount = settledResults.filter(r => r.status === 'rejected').length;
        if (failedCount > 0) {
            const firstError = settledResults.find(r => r.status === 'rejected')?.reason;
            console.warn(`${failedCount} chart chunk(s) failed:`, firstError);
            if (chartsArray.length === 0) {
                throw new Error(`All ${failedCount} chart generation(s) failed: ${firstError?.message}`);
            }
            alert(`⚠️ ${failedCount} of ${validChunks.length} chart(s) failed to generate and were skipped. ${chartsArray.length} chart(s) were saved successfully.`);
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
