/**
 * scripts/excel-utils.js
 * Excel parsing and generation utilities for A-Plus Publisher
 */

import { MODULE_REGISTRY, getModuleById } from "./modules.js";

/**
 * Creates an Excel cell object with styles
 */
export function makeCell(value, style = {}, type = null) {
  const cellObj = { v: value };
  if (type) cellObj.t = type;
  else
    cellObj.t =
      typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : "s";

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

/**
 * Generates an Excel template based on the selected modules
 */
export function generateTemplate(selectedModuleIds) {
  if (typeof XLSX === "undefined") {
    alert("XLSX library not loaded. Check script imports.");
    return;
  }

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

  const modulesToGenerate =
    selectedModuleIds && selectedModuleIds.length > 0
      ? selectedModuleIds.map((id) => getModuleById(id)).filter(Boolean)
      : [getModuleById("module-5")];

  const workbook = XLSX.utils.book_new();

  // Instructions sheet
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
      makeCell("Standard Fields (Row 7-8)", styles.sideLabel),
      makeCell(
        "Content Title and Draft URL are global for a module block. Keep them empty to auto-generate a Draft.",
        styles.descText,
      ),
    ],
    [
      makeCell("Toggles (TRUE/FALSE)", styles.sideLabel),
      makeCell(
        "For settings like 'Show Reviews', type TRUE or FALSE in the designated cells.",
        styles.descText,
      ),
    ],
    [
      makeCell("Repetitive Fields", styles.sideLabel),
      makeCell(
        "If a module has blocks (e.g. 4 images), fill them from left to right as Columns.",
        styles.descText,
      ),
    ],
    [
      makeCell("Multiple Instances", styles.sideLabel),
      makeCell(
        "To publish 5 charts of the same module type, simply copy-paste the entire module block downward on the same sheet. Leave 2-3 empty rows between blocks.",
        styles.descText,
      ),
    ],
  ];
  const instrWs = XLSX.utils.aoa_to_sheet(instrData);
  instrWs["!cols"] = [{ wch: 30 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, instrWs, "Instructions");

  // Generate a sheet per module
  // Group by module ID to handle multiple instances on one sheet if selected
  const sheetsMap = {};

  modulesToGenerate.forEach((mod) => {
    if (!sheetsMap[mod.id]) {
      sheetsMap[mod.id] = {
        mod: mod,
        data: [],
        cols: [
          { wch: 25 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
        ],
      };
    }
  });

  Object.values(sheetsMap).forEach((sheetInfo) => {
    const mod = sheetInfo.mod;
    const wsData = sheetInfo.data;
    const isComparison = mod.id === "module-5";

    // Add empty space before block if not first
    if (wsData.length > 0) {
      wsData.push([
        makeCell("", styles.docEmpty),
        makeCell("", styles.docEmpty),
      ]);
      wsData.push([
        makeCell("", styles.docEmpty),
        makeCell("", styles.docEmpty),
      ]);
    }

    // Header Block
    wsData.push([makeCell(`${mod.name} Data`, styles.docTitle)]);
    wsData.push([makeCell(`Module Type: ${mod.id}`, styles.docSub)]);
    wsData.push([makeCell("", styles.docEmpty)]);

    wsData.push([
      makeCell("Field Name", styles.tblHeader),
      makeCell("Value", styles.tblHeader),
    ]);
    wsData.push([
      makeCell("Content Title", styles.sideLabel),
      makeCell("", styles.normalCol),
    ]);
    wsData.push([
      makeCell("Draft URL", styles.sideLabel),
      makeCell("", styles.normalCol),
    ]);

    if (isComparison) {
      wsData.push([makeCell("", styles.docEmpty)]);
      // Comparison Configuration
      wsData.push([
        makeCell("Configuration", styles.tblHeader),
        makeCell("Base Product", styles.tblHeader),
        makeCell("Competitor 1", styles.tblHeader),
        makeCell("Competitor 2", styles.tblHeader),
        makeCell("Competitor 3", styles.tblHeader),
        makeCell("Competitor 4", styles.tblHeader),
        makeCell("Competitor 5", styles.tblHeader),
      ]);
      wsData.push([
        makeCell("Highlight Column", styles.sideLabel),
        makeCell(false, styles.configVal, "b"),
        makeCell(false, styles.configVal, "b"),
        makeCell(false, styles.configVal, "b"),
        makeCell(false, styles.configVal, "b"),
        makeCell(false, styles.configVal, "b"),
        makeCell(false, styles.configVal, "b"),
      ]);
      wsData.push([
        makeCell("Show Reviews", styles.sideLabel),
        makeCell(true, styles.configVal, "b"),
      ]);
      wsData.push([
        makeCell("Show Prices", styles.sideLabel),
        makeCell(true, styles.configVal, "b"),
      ]);
      wsData.push([
        makeCell("Show Add To Cart", styles.sideLabel),
        makeCell(true, styles.configVal, "b"),
      ]);

      // Comparison Data
      wsData.push([makeCell("", styles.docEmpty)]);
      wsData.push([
        makeCell("Products", styles.tblHeader),
        makeCell("Base Product", styles.tblHeader),
        makeCell("Competitor 1", styles.tblHeader),
        makeCell("Competitor 2", styles.tblHeader),
        makeCell("Competitor 3", styles.tblHeader),
        makeCell("Competitor 4", styles.tblHeader),
        makeCell("Competitor 5", styles.tblHeader),
      ]);
      wsData.push([
        makeCell("ASIN", styles.sideLabel),
        makeCell("", styles.highlightCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ]);
      wsData.push([
        makeCell("Product Title", styles.sideLabel),
        makeCell("", styles.highlightCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
        makeCell("", styles.normalCol),
      ]);
      wsData.push([makeCell("", styles.docEmpty)]);

      wsData.push([
        makeCell("Comparison Metrics", styles.tblHeader),
        makeCell("Base Product", styles.tblHeader),
        makeCell("Competitor 1", styles.tblHeader),
        makeCell("Competitor 2", styles.tblHeader),
        makeCell("Competitor 3", styles.tblHeader),
        makeCell("Competitor 4", styles.tblHeader),
        makeCell("Competitor 5", styles.tblHeader),
      ]);
      for (let m = 1; m <= 5; m++) {
        wsData.push([
          makeCell(`Metric ${m} Name`, styles.sideLabel),
          makeCell("", styles.highlightCol),
          makeCell("", styles.normalCol),
          makeCell("", styles.normalCol),
          makeCell("", styles.normalCol),
          makeCell("", styles.normalCol),
          makeCell("", styles.normalCol),
        ]);
      }
    } else {
      // Generic Module Layout
      wsData.push([makeCell("", styles.docEmpty)]);
      const hasRepeat = mod.fields.some((f) => f.repeat && f.repeat > 1);

      if (hasRepeat) {
        const maxRepeat = Math.max(...mod.fields.map((f) => f.repeat || 1));
        const headerRow = [makeCell("Field Details", styles.tblHeader)];
        for (let i = 1; i <= maxRepeat; i++) {
          headerRow.push(makeCell(`Block ${i}`, styles.tblHeader));
        }
        wsData.push(headerRow);

        mod.fields.forEach((field) => {
          if (field.repeat && field.repeat > 1) {
            const row = [makeCell(field.label, styles.sideLabel)];
            for (let i = 1; i <= maxRepeat; i++) {
              row.push(makeCell("", styles.normalCol));
            }
            wsData.push(row);
          } else {
            const row = [makeCell(field.label, styles.sideLabel)];
            row.push(makeCell("", styles.normalCol));
            wsData.push(row);
          }
        });
      } else {
        wsData.push([
          makeCell("Field Details", styles.tblHeader),
          makeCell("Value", styles.tblHeader),
        ]);
        mod.fields.forEach((field) => {
          wsData.push([
            makeCell(field.label, styles.sideLabel),
            makeCell(
              field.type === "boolean" ? false : "",
              field.type === "boolean" ? styles.configVal : styles.normalCol,
              field.type === "boolean" ? "b" : "s",
            ),
          ]);
        });
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = sheetInfo.cols;
    let sheetName = mod.shortName || mod.id;
    if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  XLSX.writeFile(workbook, `A-Plus-Template-${timestamp}.xlsx`);
}

/**
 * Parses an uploaded Excel file and returns structured chart data
 */
export async function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const parsedCharts = [];

        workbook.SheetNames.forEach((sheetName) => {
          if (sheetName.toLowerCase() === "instructions") return;
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
          });

          let currentChart = null;
          let inMetrics = false;
          let currentModuleId = "module-5";

          // Process rows based on exact cell contents to detect sections
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const colA = String(row[0] || "").trim();

            if (colA.toLowerCase().includes("module type:")) {
              currentModuleId = colA.split(":")[1].trim();
            }

            if (colA === "Content Title") {
              if (currentChart) parsedCharts.push(currentChart);
              currentChart = {
                name: String(row[1] || "").trim(),
                contentTitle: String(row[1] || "").trim(),
                draftUrl: "",
                moduleId: currentModuleId,
                status: "Pending",
              };

              if (currentModuleId === "module-5") {
                currentChart = {
                  ...currentChart,
                  highlightColumn: [false, false, false, false, false, false],
                  showReviews: true,
                  showPrices: true,
                  showAddToCart: true,
                  asins: [],
                  titles: [],
                  attributes: [],
                };
              } else {
                currentChart.fields = {};
              }
              inMetrics = false;
            } else if (currentChart && colA === "Draft URL") {
              currentChart.draftUrl = String(row[1] || "").trim();
            } else if (currentChart && currentChart.moduleId === "module-5") {
              // Module 5 (Comparison) Parsing logic
              if (colA === "Highlight Column") {
                for (let c = 1; c <= 6; c++) {
                  currentChart.highlightColumn[c - 1] =
                    String(row[c]).trim().toLowerCase() === "true" ||
                    String(row[c]).trim() === "1";
                }
              } else if (colA === "Show Reviews") {
                currentChart.showReviews =
                  String(row[1]).trim().toLowerCase() !== "false";
              } else if (colA === "Show Prices") {
                currentChart.showPrices =
                  String(row[1]).trim().toLowerCase() !== "false";
              } else if (colA === "Show Add To Cart") {
                currentChart.showAddToCart =
                  String(row[1]).trim().toLowerCase() !== "false";
              } else if (colA === "ASIN") {
                for (let c = 1; c <= 6; c++) {
                  currentChart.asins.push(String(row[c] || "").trim());
                }
              } else if (colA === "Product Title") {
                for (let c = 1; c <= 6; c++) {
                  currentChart.titles.push(String(row[c] || "").trim());
                }
              } else if (colA === "Comparison Metrics") {
                inMetrics = true;
              } else if (
                inMetrics &&
                colA &&
                !colA.includes("Base Product") &&
                row.length > 0
              ) {
                const metricName = colA;
                const vals = [];
                for (let c = 1; c <= 6; c++) {
                  vals.push(String(row[c] || "").trim());
                }
                const hasData = vals.some((v) => v !== "");
                if (hasData || metricName) {
                  currentChart.attributes.push({
                    name: metricName,
                    values: vals,
                  });
                }
              }
            } else if (currentChart) {
              // Generic Module Parsing Logic
              const modRef = getModuleById(currentChart.moduleId);
              if (modRef && colA) {
                const fieldDef = modRef.fields.find(
                  (f) => f.label.toLowerCase() === colA.toLowerCase(),
                );

                if (fieldDef) {
                  if (fieldDef.repeat && fieldDef.repeat > 1) {
                    const vals = [];
                    for (let c = 1; c <= fieldDef.repeat; c++) {
                      vals.push(String(row[c] || "").trim());
                    }
                    currentChart.fields[fieldDef.key] = vals;
                  } else if (fieldDef.type === "boolean") {
                    currentChart.fields[fieldDef.key] =
                      String(row[1]).trim().toLowerCase() === "true" ||
                      String(row[1]).trim() === "1";
                  } else {
                    currentChart.fields[fieldDef.key] = String(
                      row[1] || "",
                    ).trim();
                  }
                }
              }
            }
          }

          if (currentChart) {
            parsedCharts.push(currentChart);
          }
        });

        resolve(parsedCharts.filter((c) => c && c.moduleId));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Downloads all charts as an Excel file
 */
export function downloadAllChartsAsExcel(charts) {
  if (!charts || charts.length === 0) return;
  if (typeof XLSX === "undefined") {
    alert("XLSX library not loaded. Check script imports.");
    return;
  }

  const workbook = XLSX.utils.book_new();

  // Re-use logic to create sheets per module type
  // This is a simplified extraction of the sidepanel.js logic
  const sheetsMap = {};

  charts.forEach((chart) => {
    const mod = getModuleById(chart.moduleId) || getModuleById("module-5");
    if (!sheetsMap[mod.id]) {
      sheetsMap[mod.id] = {
        mod: mod,
        data: [],
        cols: [
          { wch: 25 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
        ],
      };
    }
    const sheetInfo = sheetsMap[mod.id];
    const wsData = sheetInfo.data;

    // Add spaces between charts
    if (wsData.length > 0) {
      wsData.push([]);
      wsData.push([]);
    }

    // Header
    wsData.push([chart.name]);
    wsData.push([`Module Type: ${chart.moduleId}`]);
    wsData.push(["Content Title", chart.contentTitle]);
    wsData.push(["Draft URL", chart.draftUrl || ""]);

    if (chart.moduleId === "module-5") {
      wsData.push([]);
      wsData.push([
        "Configuration",
        "Base Product",
        "Competitor 1",
        "Competitor 2",
        "Competitor 3",
        "Competitor 4",
        "Competitor 5",
      ]);
      wsData.push(["Highlight Column", ...(chart.highlightColumn || [])]);
      wsData.push(["Show Reviews", chart.showReviews]);
      wsData.push(["Show Prices", chart.showPrices]);
      wsData.push(["Show Add To Cart", chart.showAddToCart]);

      wsData.push([]);
      wsData.push([
        "Products",
        "Base Product",
        "Competitor 1",
        "Competitor 2",
        "Competitor 3",
        "Competitor 4",
        "Competitor 5",
      ]);
      wsData.push(["ASIN", ...(chart.asins || [])]);
      wsData.push(["Product Title", ...(chart.titles || [])]);

      wsData.push([]);
      wsData.push([
        "Comparison Metrics",
        "Base Product",
        "Competitor 1",
        "Competitor 2",
        "Competitor 3",
        "Competitor 4",
        "Competitor 5",
      ]);
      if (chart.attributes) {
        chart.attributes.forEach((attr) => {
          wsData.push([attr.name, ...attr.values]);
        });
      }
    } else {
      wsData.push([]);
      wsData.push(["Field Name", "Value"]);
      if (chart.fields) {
        Object.keys(chart.fields).forEach((key) => {
          const fieldDef = mod.fields.find((f) => f.key === key);
          if (fieldDef) {
            if (Array.isArray(chart.fields[key])) {
              wsData.push([fieldDef.label, ...chart.fields[key]]);
            } else {
              wsData.push([fieldDef.label, chart.fields[key]]);
            }
          }
        });
      }
    }
  });

  Object.values(sheetsMap).forEach((sheetInfo) => {
    const ws = XLSX.utils.aoa_to_sheet(sheetInfo.data);
    ws["!cols"] = sheetInfo.cols;
    let sheetName = sheetInfo.mod.shortName || sheetInfo.mod.id;
    if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  XLSX.writeFile(workbook, `A-Plus-Export-${timestamp}.xlsx`);
}
