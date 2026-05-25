import { getModuleById } from "./modules.js";

/**
 * SandboxRenderer
 * Emulates the official Amazon A+ Comparison Chart widget.
 * Features:
 * - Real-time desktop/mobile simulation toggle.
 * - Dynamic cell editing with direct source data updates.
 * - Real-time character limit linting with amber alerts for truncation risk (>250 chars).
 */
export const SandboxRenderer = {
    // Current active global view mode ('desktop' or 'mobile')
    globalViewMode: 'desktop',

    setGlobalViewMode(mode) {
        this.globalViewMode = mode;
    },

    getGlobalViewMode() {
        return this.globalViewMode;
    },

    /**
     * Checks if a comparison metric cell value exceeds standard Amazon display limits
     * @param {string} value 
     * @returns {object} { isOverlimit: boolean, reason: string, count: number }
     */
    checkTruncation(value) {
        if (!value) return { isOverlimit: false };
        const cleanVal = String(value).trim();
        if (cleanVal.toLowerCase() === '✔' || cleanVal.toLowerCase() === 'yes' || cleanVal.toLowerCase() === 'no') {
            return { isOverlimit: false };
        }
        const charCount = cleanVal.length;

        if (charCount > 250) {
            return {
                isOverlimit: true,
                reason: `${charCount} chars (max 250 recommended)`,
                count: charCount
            };
        }
        return { isOverlimit: false };
    },

    /**
     * Render the Live Sandbox
     * @param {HTMLElement} container - Target sandbox element
     * @param {object} chart - Chart data structure
     * @param {function} onUpdateCell - Callback for cell changes: (type, rowIdx, colIdx, value) => {}
     */
    render(container, chart, onUpdateCell) {
        if (!container) return;
        container.textContent = '';
        container.className = 'sandbox-container';

        // Add Sandbox Section Header
        const header = document.createElement('div');
        header.className = 'sandbox-header-container';

        const title = document.createElement('div');
        title.className = 'sandbox-header-title';
        title.textContent = `Live Emulation: ${this.globalViewMode === 'desktop' ? '🖥 Desktop Grid' : '📱 Mobile Swiper'}`;
        header.appendChild(title);
        container.appendChild(header);

        if (this.globalViewMode === 'desktop') {
            this.renderDesktop(container, chart, onUpdateCell);
        } else {
            this.renderMobile(container, chart, onUpdateCell);
        }
    },

    renderDesktop(container, chart, onUpdateCell) {
        const moduleId = chart.moduleId || "module-5";
        if (moduleId !== "module-5") {
            this.renderGenericModule(container, chart, onUpdateCell, "desktop");
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'amazon-desktop-grid';

        const table = document.createElement('table');
        table.className = 'aplus-table';

        const thead = document.createElement('thead');
        const trProductHeader = document.createElement('tr');

        // Top Left Blank Corner header
        const thCorner = document.createElement('th');
        thCorner.className = 'metric-col-header';
        thCorner.textContent = 'Product Comparison';
        trProductHeader.appendChild(thCorner);

        // Product Columns
        chart.asins.forEach((asin, colIdx) => {
            const isBase = colIdx === 0;
            const th = document.createElement('th');

            // Image box simulation
            const imgBox = document.createElement('div');
            imgBox.className = 'aplus-product-img-box';
            imgBox.textContent = isBase ? '📦' : '🏷️';

            // Title text
            const titleText = document.createElement('div');
            titleText.className = 'aplus-product-title-text';
            titleText.textContent = chart.titles[colIdx] || `Product ${colIdx}`;
            titleText.title = chart.titles[colIdx] || '';

            // ASIN badge
            const asinBadge = document.createElement('div');
            asinBadge.className = 'aplus-product-asin-badge';
            asinBadge.textContent = asin || 'NO-ASIN';

            th.append(imgBox, titleText, asinBadge);
            trProductHeader.appendChild(th);
        });

        thead.appendChild(trProductHeader);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        // Optional Toggles: Ratings Row
        if (chart.showReviews) {
            const trReviews = document.createElement('tr');
            const tdLabel = document.createElement('td');
            tdLabel.className = 'metric-name-cell';
            tdLabel.textContent = 'Customer Reviews';
            trReviews.appendChild(tdLabel);

            chart.asins.forEach((_, colIdx) => {
                const td = document.createElement('td');
                td.innerHTML = `<span style="color:#febd69; font-size: 14px;">★★★★☆</span> <span style="font-size:11px; color:#565959;">(4.${5 - (colIdx % 2)})</span>`;
                trReviews.appendChild(td);
            });
            tbody.appendChild(trReviews);
        }

        // Optional Toggles: Prices Row
        if (chart.showPrices) {
            const trPrices = document.createElement('tr');
            const tdLabel = document.createElement('td');
            tdLabel.className = 'metric-name-cell';
            tdLabel.textContent = 'Price';
            trPrices.appendChild(tdLabel);

            chart.asins.forEach((_, colIdx) => {
                const td = document.createElement('td');
                td.innerHTML = `<span style="font-weight: 700; color: #b12704; font-size:14px;">$${(19.99 + colIdx * 10).toFixed(2)}</span>`;
                trPrices.appendChild(td);
            });
            tbody.appendChild(trPrices);
        }

        // Comparison Attributes
        chart.attributes.forEach((attr, rowIdx) => {
            const tr = document.createElement('tr');

            const tdLabel = document.createElement('td');
            tdLabel.className = 'metric-name-cell';
            tdLabel.textContent = attr.name || `Metric ${rowIdx + 1}`;
            tr.appendChild(tdLabel);

            chart.asins.forEach((_, colIdx) => {
                const td = document.createElement('td');
                const val = attr.values[colIdx] || '';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'metric-input';
                input.value = val;
                input.style.width = '100%';
                input.style.textAlign = 'center';
                input.style.border = '1px solid transparent';
                input.style.background = 'transparent';

                // Truncation check
                const check = this.checkTruncation(val);
                if (check.isOverlimit) {
                    input.classList.add('truncation-warning');
                    input.title = `Truncation Risk: ${check.reason}`;

                    const warn = document.createElement('div');
                    warn.className = 'sandbox-cell-error';
                    warn.textContent = `⚠️ Too long!`;
                    td.appendChild(input);
                    td.appendChild(warn);
                } else {
                    td.appendChild(input);
                }

                // Double click to edit in-place
                input.addEventListener('focus', () => {
                    input.style.border = '1px solid var(--border)';
                    input.style.background = 'var(--bg-card)';
                });

                input.addEventListener('blur', (e) => {
                    input.style.border = '1px solid transparent';
                    input.style.background = 'transparent';

                    const newVal = e.target.value;
                    onUpdateCell('metric', rowIdx, colIdx, newVal);
                });

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        // Optional Toggles: Add to Cart Row
        if (chart.showAddToCart) {
            const trCart = document.createElement('tr');
            const tdLabel = document.createElement('td');
            tdLabel.className = 'metric-name-cell';
            tdLabel.textContent = 'Add to Cart';
            trCart.appendChild(tdLabel);

            chart.asins.forEach((_, colIdx) => {
                const td = document.createElement('td');
                td.innerHTML = `<button style="background:#ffd814; border:1px solid #fcd200; border-radius:100px; padding:4px 10px; font-size:11px; cursor:pointer; font-weight:500; color:#0f1111; box-shadow: 0 2px 5px rgba(213,217,217,.5);">Add to Cart</button>`;
                trCart.appendChild(td);
            });
            tbody.appendChild(trCart);
        }

        table.appendChild(tbody);
        grid.appendChild(table);
        container.appendChild(grid);
    },

    renderMobile(container, chart, onUpdateCell) {
        const moduleId = chart.moduleId || "module-5";
        if (moduleId !== "module-5") {
            this.renderGenericModule(container, chart, onUpdateCell, "mobile");
            return;
        }

        const swipe = document.createElement('div');
        swipe.className = 'amazon-mobile-swipe';

        chart.asins.forEach((asin, colIdx) => {
            const isBase = colIdx === 0;
            const card = document.createElement('div');
            card.className = 'aplus-mobile-card';

            const header = document.createElement('div');
            header.className = 'aplus-mobile-card-header';

            const imgBox = document.createElement('div');
            imgBox.className = 'aplus-product-img-box';
            imgBox.textContent = isBase ? '📦' : '🏷️';

            const title = document.createElement('div');
            title.className = 'aplus-product-title-text';
            title.textContent = chart.titles[colIdx] || `Product ${colIdx}`;

            const asinBadge = document.createElement('div');
            asinBadge.className = 'aplus-product-asin-badge';
            asinBadge.textContent = asin || 'NO-ASIN';

            header.append(imgBox, title, asinBadge);
            card.appendChild(header);

            // Toggles and specs
            const specs = document.createElement('div');
            specs.className = 'aplus-mobile-specs';

            if (chart.showReviews) {
                const row = document.createElement('div');
                row.className = 'aplus-mobile-spec-row';
                row.innerHTML = `<span class="aplus-mobile-spec-name">Reviews</span>
                                 <span class="aplus-mobile-spec-value" style="color:#febd69;">★★★★☆ (4.${5 - (colIdx % 2)})</span>`;
                specs.appendChild(row);
            }

            if (chart.showPrices) {
                const row = document.createElement('div');
                row.className = 'aplus-mobile-spec-row';
                row.innerHTML = `<span class="aplus-mobile-spec-name">Price</span>
                                 <span class="aplus-mobile-spec-value" style="font-weight:700; color:#b12704;">$${(19.99 + colIdx * 10).toFixed(2)}</span>`;
                specs.appendChild(row);
            }

            // Specs values list
            chart.attributes.forEach((attr, rowIdx) => {
                const row = document.createElement('div');
                row.className = 'aplus-mobile-spec-row';

                const name = document.createElement('span');
                name.className = 'aplus-mobile-spec-name';
                name.textContent = attr.name || `Metric ${rowIdx + 1}`;

                const val = attr.values[colIdx] || '';
                const valInput = document.createElement('input');
                valInput.type = 'text';
                valInput.className = 'metric-input';
                valInput.value = val;
                valInput.style.border = '1px solid transparent';
                valInput.style.background = 'transparent';
                valInput.style.width = '100%';
                valInput.style.fontSize = '12px';

                // Truncation Check
                const check = this.checkTruncation(val);
                if (check.isOverlimit) {
                    valInput.classList.add('truncation-warning');
                    valInput.title = `Truncation Risk: ${check.reason}`;

                    const warn = document.createElement('span');
                    warn.className = 'sandbox-cell-error';
                    warn.textContent = `⚠️ Too long!`;
                    row.append(name, valInput, warn);
                } else {
                    row.append(name, valInput);
                }

                // Input editing bindings
                valInput.addEventListener('focus', () => {
                    valInput.style.border = '1px solid var(--border)';
                    valInput.style.background = 'var(--bg-card)';
                });

                valInput.addEventListener('blur', (e) => {
                    valInput.style.border = '1px solid transparent';
                    valInput.style.background = 'transparent';
                    onUpdateCell('metric', rowIdx, colIdx, e.target.value);
                });

                specs.appendChild(row);
            });

            if (chart.showAddToCart) {
                const row = document.createElement('div');
                row.className = 'aplus-mobile-spec-row';
                row.style.textAlign = 'center';
                row.style.marginTop = '4px';
                row.innerHTML = `<button style="background:#ffd814; border:1px solid #fcd200; border-radius:100px; padding:5px 12px; font-size:11px; cursor:pointer; font-weight:500; color:#0f1111; width:100%;">Add to Cart</button>`;
                specs.appendChild(row);
            }

            card.appendChild(specs);
            swipe.appendChild(card);
        });

        container.appendChild(swipe);
    },

    renderGenericModule(container, chart, onUpdateCell, mode) {
        const mod = getModuleById(chart.moduleId);
        if (!mod) {
            const errDiv = document.createElement('div');
            errDiv.className = 'sandbox-error';
            errDiv.style.color = 'var(--error)';
            errDiv.style.padding = '10px';
            errDiv.textContent = `Module type ${chart.moduleId} not found.`;
            container.appendChild(errDiv);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = `amazon-generic-preview ${mode}-view`;
        wrapper.style.padding = mode === 'desktop' ? '15px' : '10px';
        wrapper.style.border = '1px solid var(--border)';
        wrapper.style.borderRadius = '8px';
        wrapper.style.background = 'var(--bg-card)';
        wrapper.style.marginTop = '10px';

        const badge = document.createElement('div');
        badge.style.display = 'inline-block';
        badge.style.padding = '3px 8px';
        badge.style.background = 'var(--bg-tag)';
        badge.style.color = 'var(--primary)';
        badge.style.borderRadius = '4px';
        badge.style.fontSize = '11px';
        badge.style.fontWeight = 'bold';
        badge.style.marginBottom = '10px';
        badge.textContent = `${mod.name} (${chart.moduleId})`;
        wrapper.appendChild(badge);

        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'preview-fields-layout';
        fieldsContainer.style.display = 'flex';
        fieldsContainer.style.flexDirection = 'column';
        fieldsContainer.style.gap = '12px';

        const createEditableText = (fieldKey, repeatIndex, initialVal, isTextarea, label) => {
            const textSpan = document.createElement('div');
            textSpan.className = 'editable-preview-text';
            textSpan.style.cursor = 'pointer';
            textSpan.style.minHeight = isTextarea ? '40px' : '20px';
            textSpan.style.borderBottom = '1px dashed var(--border)';
            textSpan.style.padding = '4px';
            textSpan.style.borderRadius = '3px';
            textSpan.style.whiteSpace = 'pre-wrap';
            textSpan.style.fontSize = isTextarea ? '12px' : '13px';
            if (!isTextarea) {
                textSpan.style.fontWeight = label.toLowerCase().includes('header') || label.toLowerCase().includes('title') ? 'bold' : 'normal';
            }

            if (!String(initialVal || '').trim()) {
                textSpan.style.color = 'var(--text-muted)';
                textSpan.style.fontStyle = 'italic';
                textSpan.textContent = `Click to edit ${label}...`;
            } else {
                textSpan.style.color = 'var(--text)';
                textSpan.textContent = initialVal;
            }

            textSpan.addEventListener('click', () => {
                const currentVal = textSpan.style.fontStyle === 'italic' ? '' : textSpan.textContent;
                const input = document.createElement(isTextarea ? 'textarea' : 'input');
                input.className = 'preview-edit-input';
                input.value = currentVal;
                input.style.width = '100%';
                input.style.padding = '6px';
                input.style.boxSizing = 'border-box';
                input.style.border = '1px solid var(--primary)';
                input.style.borderRadius = '4px';
                input.style.background = 'var(--bg)';
                input.style.color = 'var(--text)';
                if (isTextarea) {
                    input.style.minHeight = '65px';
                    input.style.resize = 'vertical';
                }

                const finishEdit = () => {
                    const newVal = input.value.trim();
                    if (newVal !== currentVal) {
                        onUpdateCell('field', fieldKey, repeatIndex, newVal);
                    } else {
                        if (!newVal) {
                            textSpan.style.color = 'var(--text-muted)';
                            textSpan.style.fontStyle = 'italic';
                            textSpan.textContent = `Click to edit ${label}...`;
                        } else {
                            textSpan.style.color = 'var(--text)';
                            textSpan.style.fontStyle = 'normal';
                            textSpan.textContent = newVal;
                        }
                        input.replaceWith(textSpan);
                    }
                };

                input.addEventListener('blur', finishEdit);
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !isTextarea) {
                        input.blur();
                    }
                    if (e.key === 'Escape') {
                        input.value = currentVal;
                        input.blur();
                    }
                });

                textSpan.replaceWith(input);
                input.focus();
            });

            return textSpan;
        };

        const hasRepeat = mod.fields.some(f => f.repeat && f.repeat > 1);

        if (hasRepeat) {
            const maxRepeat = Math.max(...mod.fields.map(f => f.repeat || 1));
            
            mod.fields.forEach(field => {
                if (!field.repeat || field.repeat <= 1) {
                    const fDiv = document.createElement('div');
                    fDiv.style.marginBottom = '8px';
                    
                    const fLabel = document.createElement('div');
                    fLabel.style.fontSize = '10px';
                    fLabel.style.color = 'var(--text-muted)';
                    fLabel.style.fontWeight = 'bold';
                    fLabel.style.textTransform = 'uppercase';
                    fLabel.textContent = field.label;
                    fDiv.appendChild(fLabel);

                    if (field.type === 'image') {
                        const imgBox = document.createElement('div');
                        imgBox.style.height = '50px';
                        imgBox.style.background = 'var(--bg)';
                        imgBox.style.border = '1px dashed var(--border)';
                        imgBox.style.display = 'flex';
                        imgBox.style.alignItems = 'center';
                        imgBox.style.justifyContent = 'center';
                        imgBox.style.color = 'var(--text-muted)';
                        imgBox.style.fontSize = '11px';
                        imgBox.textContent = `📷 ${field.label} placeholder`;
                        fDiv.appendChild(imgBox);
                    } else {
                        const val = chart.fields[field.key] || '';
                        fDiv.appendChild(createEditableText(field.key, null, val, field.type === 'textarea', field.label));
                    }
                    fieldsContainer.appendChild(fDiv);
                }
            });

            const gridDiv = document.createElement('div');
            gridDiv.style.display = 'grid';
            gridDiv.style.gridTemplateColumns = mode === 'desktop' ? `repeat(${Math.min(maxRepeat, 4)}, 1fr)` : '1fr';
            gridDiv.style.gap = '12px';

            for (let i = 0; i < maxRepeat; i++) {
                const colDiv = document.createElement('div');
                colDiv.style.border = '1px solid var(--border)';
                colDiv.style.borderRadius = '6px';
                colDiv.style.padding = '8px';
                colDiv.style.background = 'var(--bg)';

                const blockTitle = document.createElement('div');
                blockTitle.style.fontSize = '11px';
                blockTitle.style.fontWeight = 'bold';
                blockTitle.style.color = 'var(--primary)';
                blockTitle.style.marginBottom = '6px';
                blockTitle.textContent = `Block ${i + 1}`;
                colDiv.appendChild(blockTitle);

                mod.fields.forEach(field => {
                    if (field.repeat && field.repeat > 1) {
                        const fDiv = document.createElement('div');
                        fDiv.style.marginBottom = '6px';

                        if (field.type === 'image') {
                            const imgBox = document.createElement('div');
                            imgBox.style.height = '80px';
                            imgBox.style.background = 'var(--bg-card)';
                            imgBox.style.border = '1px dashed var(--border)';
                            imgBox.style.display = 'flex';
                            imgBox.style.alignItems = 'center';
                            imgBox.style.justifyContent = 'center';
                            imgBox.style.color = 'var(--text-muted)';
                            imgBox.style.fontSize = '10px';
                            imgBox.style.marginBottom = '4px';
                            imgBox.textContent = `📷 ${field.label}`;
                            fDiv.appendChild(imgBox);
                        } else {
                            const valArray = chart.fields[field.key] || [];
                            const val = valArray[i] || '';
                            fDiv.appendChild(createEditableText(field.key, i, val, field.type === 'textarea', `${field.label} ${i + 1}`));
                        }
                        colDiv.appendChild(fDiv);
                    }
                });
                gridDiv.appendChild(colDiv);
            }
            fieldsContainer.appendChild(gridDiv);
        } else {
            mod.fields.forEach(field => {
                const fDiv = document.createElement('div');
                fDiv.style.marginBottom = '8px';

                const fLabel = document.createElement('div');
                fLabel.style.fontSize = '10px';
                fLabel.style.color = 'var(--text-muted)';
                fLabel.style.fontWeight = 'bold';
                fLabel.style.textTransform = 'uppercase';
                fLabel.textContent = field.label;
                fDiv.appendChild(fLabel);

                if (field.type === 'image') {
                    const imgBox = document.createElement('div');
                    imgBox.style.height = '100px';
                    imgBox.style.background = 'var(--bg)';
                    imgBox.style.border = '1px dashed var(--border)';
                    imgBox.style.display = 'flex';
                    imgBox.style.alignItems = 'center';
                    imgBox.style.justifyContent = 'center';
                    imgBox.style.color = 'var(--text-muted)';
                    imgBox.style.fontSize = '11px';
                    imgBox.textContent = `📷 Image Box (${field.label})`;
                    fDiv.appendChild(imgBox);
                } else if (field.type === 'boolean') {
                    const val = !!chart.fields[field.key];
                    const toggleSpan = document.createElement('span');
                    toggleSpan.textContent = val ? 'ON ✅' : 'OFF ❌';
                    toggleSpan.style.cursor = 'pointer';
                    toggleSpan.style.fontSize = '11px';
                    toggleSpan.style.fontWeight = 'bold';
                    toggleSpan.addEventListener('click', () => {
                        onUpdateCell('field', field.key, null, !val);
                    });
                    fDiv.appendChild(toggleSpan);
                } else {
                    const val = chart.fields[field.key] || '';
                    fDiv.appendChild(createEditableText(field.key, null, val, field.type === 'textarea', field.label));
                }

                fieldsContainer.appendChild(fDiv);
            });
        }

        wrapper.appendChild(fieldsContainer);
        container.appendChild(wrapper);
    }
};
