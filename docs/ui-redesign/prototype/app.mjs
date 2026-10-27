import {
    PALETTE, DEFAULT_SETTINGS, PreferenceError, validThreshold, formatThreshold, sourceColor, valueColor,
    displayValue, confidenceLabel, confidenceDescription, copyValue, fieldSummary, paneWidth,
    allFields, leafFields, sourceSelection, orderedFields, matchingFieldIds,
    moveField, moveFieldBy, readPreferences, writePreferences, resetPreferences,
    clampZoom, rotatedSize, escapeHtml,
} from "./model.mjs";
import { PROFILES, documentBase } from "./fixtures.mjs";

const byId = id => document.getElementById(id);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const viewport = byId("source-viewport");
const paper = byId("paper");
const stage = byId("document-stage");
const results = byId("result-content");
const flyover = byId("flyover");
const dragPreview = byId("drag-preview");
const workspace = document.querySelector(".workspace");
const valueMenu = byId("value-menu");
const state = {
    profile: PROFILES[0], settings: { ...DEFAULT_SETTINGS }, order: {}, page: 1, zoom: 1, fit: "page",
    rotation: 0, tab: "fields", expanded: new Set(), query: "", lowOnly: false,
    selectedId: null, previewId: null, regionIndex: 0, previewRegion: 0, flyoverDismissed: false,
    persistenceBlocked: false, drag: null, focusedId: null, inspectedId: null, viewScroll: {},
};
let fieldsById = new Map();
let previewTimer;
let panGesture = null;
let lastFlyoverSignature = "";
let resizeGesture = null;
let valueMenuTrigger = null;
let copyFeedbackVersion = 0;
let restoringResultFocus = false;

function announce(message) {
    byId("live-status").textContent = message;
}

function fieldById(id) {
    const field = fieldsById.get(id);
    if (!field) throw new Error(`The requested prototype field does not exist: ${id}`);
    return field;
}

function selectedFieldIds() {
    if (!state.selectedId) return new Set();
    return new Set(sourceSelection(fieldById(state.selectedId), state.page).fields.map(field => field.id));
}

function fieldCaption(field) {
    let parentPath = field.id.slice(0, field.id.lastIndexOf("/"));
    while (parentPath) {
        const parent = fieldsById.get(parentPath);
        if (parent) {
            const row = parent.kind === "table" ? ` [${Number(field.id.slice(parentPath.length + 1).split("/")[0]) + 1}]` : "";
            return `${parent.name}${row} / ${field.name}`;
        }
        parentPath = parentPath.slice(0, parentPath.lastIndexOf("/"));
    }
    return field.name;
}

function fieldTooltip(field) {
    return `${fieldCaption(field)}: ${displayValue(field)}\n${confidenceDescription(field, state.settings)}\n${field.regions.length ?
        `Source: page ${[...new Set(field.regions.map(region => region.page))].join(", ")}` : "No source region supplied"}`;
}

function captureResultView() {
    return {
        top: results.scrollTop, left: results.scrollLeft,
        tables: Object.fromEntries([...results.querySelectorAll("[data-table-id]")].map(element =>
            [element.dataset.tableId, element.scrollLeft])),
    };
}

function syncLayout() {
    const width = paneWidth(workspace.clientWidth, state.settings.paneRatio);
    workspace.style.setProperty("--source-width", `${width}px`);
    const space = state.settings.layout === "three" ? 83 : 100;
    workspace.style.setProperty("--name-width", `${state.settings.fieldRatio * space}%`);
    workspace.style.setProperty("--value-width", `${(1 - state.settings.fieldRatio) * space}%`);
    const pane = byId("pane-resizer");
    const available = workspace.clientWidth - 8;
    pane.setAttribute("aria-valuemin", String(Math.floor(Math.max(0.3, 570 / available) * 100)));
    pane.setAttribute("aria-valuemax", String(Math.ceil(Math.min(0.7, (available - 440) / available) * 100)));
    pane.setAttribute("aria-valuenow", String(Math.round(width / available * 100)));
    pane.setAttribute("aria-valuetext", `Document ${Math.round(width / available * 100)} percent`);
    byId("column-resizer")?.setAttribute("aria-valuenow", String(Math.round(state.settings.fieldRatio * 100)));
    positionFlyover();
}

function primaryFieldControls() {
    return [...results.querySelectorAll(".field-name-button:not(:disabled), .cell-value")];
}

function syncFieldFocus(id = state.focusedId) {
    const controls = primaryFieldControls();
    const active = controls.find(button => button.dataset.id === id) ??
        controls.find(button => button.dataset.id === state.selectedId) ?? controls[0];
    state.focusedId = active?.dataset.id ?? null;
    for (const button of controls) button.tabIndex = button === active ? 0 : -1;
}

function updateInspector() {
    const inspector = byId("value-inspector");
    inspector.hidden = !state.inspectedId || !["fields", "tables"].includes(state.tab);
    if (inspector.hidden) return;
    const field = fieldById(state.inspectedId);
    byId("inspector-title").textContent = fieldCaption(field);
    byId("inspector-value").textContent = displayValue(field);
    byId("inspector-confidence").textContent = confidenceDescription(field, state.settings);
    byId("copy-inspected").disabled = field.missing;
}

function inspectField(id, focus = false) {
    const field = fieldById(id);
    if (field.kind !== "value") return;
    if (state.inspectedId !== id) copyFeedbackVersion++;
    state.inspectedId = id;
    byId("copy-error").hidden = true;
    updateInspector();
    if (focus) byId("inspector-value").focus();
    announce(`Full value for ${fieldCaption(field)}. ${confidenceDescription(field, state.settings)}.`);
}

function closeInspector() {
    copyFeedbackVersion++;
    const id = state.inspectedId;
    const heldFocus = byId("value-inspector").contains(document.activeElement);
    state.inspectedId = null;
    updateInspector();
    if (heldFocus && id) {
        results.querySelector(`.field-name-button[data-id="${CSS.escape(id)}"], .cell-value[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    }
}

function clearSelection() {
    copyFeedbackVersion++;
    const sourceControlFocused = document.activeElement === byId("clear-selection");
    clearTimeout(previewTimer);
    closeValueMenu(false);
    state.selectedId = null;
    state.previewId = null;
    state.regionIndex = 0;
    state.inspectedId = null;
    state.flyoverDismissed = true;
    byId("copy-error").hidden = true;
    hideFlyover(true);
    renderResults();
    state.previewId = null;
    state.flyoverDismissed = true;
    hideFlyover(true);
    updateActiveOutlines();
    updateRegionControls();
    if (sourceControlFocused) viewport.focus({ preventScroll: true });
    announce("Selection cleared. Source page, zoom and rotation are unchanged.");
}

function valueMenuButton(field) {
    return `<button type="button" class="icon-button value-menu-trigger" data-action="value-menu" data-id="${escapeHtml(field.id)}"
        aria-label="Value actions for ${escapeHtml(fieldCaption(field))}" aria-haspopup="menu" aria-expanded="false"
        aria-controls="value-menu" title="Locate, view full value or copy">${icon("more")}</button>`;
}

function closeValueMenu(restoreFocus = true) {
    valueMenu.hidden = true;
    if (restoreFocus && valueMenuTrigger?.isConnected) valueMenuTrigger.focus({ preventScroll: true });
    valueMenuTrigger?.setAttribute("aria-expanded", "false");
    valueMenuTrigger = null;
    delete valueMenu.dataset.fieldId;
}

function openValueMenu(id, trigger) {
    const field = fieldById(id);
    closeSettings(false);
    closeDocumentMenu(false);
    closeValueMenu(false);
    state.flyoverDismissed = true;
    clearPreview();
    valueMenuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    valueMenu.dataset.fieldId = id;
    valueMenu.setAttribute("aria-label", `Value actions for ${fieldCaption(field)}`);
    const page = sourceSelection(field, state.page).page;
    byId("value-menu-locate").disabled = page === undefined;
    byId("value-menu-locate").querySelector("span").textContent = page === undefined ? "No source region" : `Locate on page ${page}`;
    byId("value-menu-copy").disabled = field.missing;
    valueMenu.hidden = false;
    const bounds = trigger.getBoundingClientRect();
    valueMenu.style.left = `${Math.max(8, Math.min(bounds.right - valueMenu.offsetWidth, innerWidth - valueMenu.offsetWidth - 8))}px`;
    valueMenu.style.top = `${Math.max(8, Math.min(bounds.bottom + 5, innerHeight - valueMenu.offsetHeight - 8))}px`;
    valueMenu.querySelector("button:not(:disabled)").focus();
}

function moveMenuFocus(event, menu, dismiss) {
    if (event.key === "Tab") {
        dismiss();
        return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...menu.querySelectorAll("button:not(:disabled)")];
    const index = buttons.indexOf(event.target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
        (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
}

async function copyField(id) {
    const field = fieldById(id);
    const caption = fieldCaption(field);
    const feedbackVersion = ++copyFeedbackVersion;
    const selectionAtRequest = state.selectedId;
    const inspectionAtRequest = state.inspectedId;
    const isCurrentRequest = () => feedbackVersion === copyFeedbackVersion &&
        fieldsById.get(id) === field && state.selectedId === selectionAtRequest &&
        state.inspectedId === inspectionAtRequest;
    if (field.missing) {
        announce(`${field.name} was not returned. There is no value to copy.`);
        return;
    }
    try {
        if (!navigator.clipboard?.writeText) throw new DOMException("Clipboard access is not available in this browser.", "NotSupportedError");
        await navigator.clipboard.writeText(copyValue(field));
        if (!isCurrentRequest()) return;
        byId("copy-error").hidden = true;
        announce(`${caption} copied.`);
    } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        if (!isCurrentRequest()) {
            console.warn(`Superseded copy failed for ${caption}.`, error);
            return;
        }
        inspectField(id);
        byId("copy-error").textContent = `Copy failed: ${error.message} Select the full value above and copy it manually.`;
        byId("copy-error").hidden = false;
        announce(byId("copy-error").textContent);
    }
}

function localStorageForPrototype() {
    try {
        return window.localStorage;
    } catch (error) {
        throw new PreferenceError(`Browser preferences are unavailable: ${error.message}`);
    }
}

function storageError(error) {
    if (!(error instanceof PreferenceError)) throw error;
    state.persistenceBlocked = true;
    byId("storage-error-text").textContent = `${error.message} Changes remain usable but are not being saved.`;
    byId("storage-error").hidden = false;
    byId("save-state").textContent = "Not saved - browser preferences need attention";
    announce(error.message);
}

function persist() {
    if (state.persistenceBlocked) return false;
    try {
        writePreferences(localStorageForPrototype(), state.profile.schemaId, state.settings, state.order);
        byId("save-state").textContent = "Saved in this browser";
        return true;
    } catch (error) {
        storageError(error);
        return false;
    }
}

function loadProfile(id) {
    const profile = PROFILES.find(item => item.id === id);
    if (!profile) throw new Error("Choose one of the provided example documents.");
    copyFeedbackVersion++;
    clearTimeout(previewTimer);
    state.profile = profile;
    fieldsById = new Map(allFields(profile.fields).map(field => [field.id, field]));
    Object.assign(state, {
        settings: { ...DEFAULT_SETTINGS }, order: {}, page: 1, zoom: 1, fit: "page", rotation: 0,
        expanded: new Set(profile.expanded), selectedId: null, previewId: null, regionIndex: 0,
        query: "", lowOnly: false, persistenceBlocked: false, flyoverDismissed: false,
        focusedId: null, inspectedId: null, viewScroll: {},
    });
    hideFlyover(true);
    byId("storage-error").hidden = true;
    byId("save-state").textContent = "Preferences stay in this browser";
    try {
        const saved = readPreferences(localStorageForPrototype(), profile.schemaId);
        state.settings = saved.settings;
        state.order = saved.order;
    } catch (error) {
        storageError(error);
    }
    byId("profile-select").value = id;
    byId("field-search").value = "";
    byId("source-name").textContent = profile.name;
    byId("source-kind").textContent = profile.kind === "pdf" ? "PDF" : "IMAGE";
    byId("source-caption").textContent = profile.kind === "pdf" ? "Illustrative PDF pages" : "Illustrative image view";
    byId("page-total").textContent = profile.pages.length;
    byId("page-error").hidden = true;
    lastFlyoverSignature = "";
    byId("copy-error").hidden = true;
    syncSettings();
    closeSettings(false);
    closeDocumentMenu(false);
    syncLayout();
    renderResults();
    renderSource();
    fitDocument("page");
    viewport.scrollTop = 0;
    results.scrollTop = 0;
    if (!state.persistenceBlocked) announce(`${profile.label}. Simulated source and extracted values; no files are uploaded.`);
}

function syncSettings() {
    byId("threshold-input").value = formatThreshold(state.settings.threshold);
    byId("threshold-input").removeAttribute("aria-invalid");
    byId("threshold-error").hidden = true;
    byId("threshold-label").textContent = formatThreshold(state.settings.threshold);
    byId("show-fields").checked = state.settings.showFields;
    byId("show-tables").checked = state.settings.showTables;
    byId("highlight-low").checked = state.settings.highlightLow;
}

function orderedLeaves(fields = state.profile.fields, parentId = "$root") {
    return orderedFields(fields, parentId, state.order).flatMap(field =>
        field.kind === "object" ? orderedLeaves(field.children, field.id) :
            field.kind === "table" ? field.rows.flat() : [field]);
}

function navigationFields() {
    const matches = matchingFieldIds(state.profile.fields, state.query, state.lowOnly, state.settings);
    return orderedLeaves().filter(field => matches.has(field.id));
}

function chip(field) {
    const color = valueColor(field, state.settings);
    return `<span class="value-chip${field.missing ? " missing" : ""}"${color ?
        ` style="background:${color.background};color:${color.text}"` : ""}>${escapeHtml(displayValue(field))}</span>`;
}

function locateButton(field) {
    const selection = sourceSelection(field, state.page);
    if (!selection.pages.length) return "";
    const target = selection.page;
    const elsewhere = target !== state.page;
    const group = field.kind !== "value";
    const label = group ? `Locate all ${selection.fields.length} fields in ${field.name} on page ${target}` :
        `Go to page ${target} for ${field.name}`;
    const title = group ? `Locate the whole group. Source pages: ${selection.pages.join(", ")}` :
        `${elsewhere ? "Jump to" : "Locate on"} page ${target}`;
    return `<button type="button" class="locate-button${elsewhere ? " is-other-page" : ""}"
        data-action="locate" data-id="${escapeHtml(field.id)}" aria-pressed="${state.selectedId === field.id}"
        aria-label="${escapeHtml(label)}" title="${escapeHtml(title)}">${icon("locate")}<span>p.${target}</span>
        ${group && selection.pages.length > 1 ? `<span class="page-count">/ ${selection.pages.length} pages</span>` : ""}</button>`;
}

function tableMarkup(field, { filter = true, rowNumbers = true } = {}) {
    const selectedIds = selectedFieldIds();
    const matches = filter ? matchingFieldIds(state.profile.fields, state.query, state.lowOnly, state.settings) : null;
    const rows = field.rows.map((row, index) => ({ row, index })).filter(({ row }) =>
        !matches || row.some(cell => matches.has(cell.id)));
    if (!rows.length) return `<p class="empty-state">No matching rows in this table.</p>`;
    return `<table class="items-table" aria-label="${escapeHtml(field.name)}">
        <thead><tr>${rowNumbers ? '<th scope="col">#</th>' : ""}${field.columns.map(column =>
        `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(({ row, index }) => `<tr>${rowNumbers ? `<td class="row-index">${index + 1}</td>` : ""}${row.map(cell =>
        `<td><div class="cell-content" data-inspect-id="${escapeHtml(cell.id)}"><button type="button" class="cell-value" data-action="select" data-id="${escapeHtml(cell.id)}" tabindex="-1"
            data-inspect-id="${escapeHtml(cell.id)}" aria-pressed="${selectedIds.has(cell.id)}"
            aria-label="${escapeHtml(`${field.name}, row ${index + 1}, ${cell.name}: ${displayValue(cell)}`)}"
            aria-describedby="description-${encodeURIComponent(cell.id)}" aria-keyshortcuts="F2"
            title="${escapeHtml(fieldTooltip(cell))}">${chip(cell)}</button>${valueMenuButton(cell)}</div>
            <span id="description-${encodeURIComponent(cell.id)}" class="sr-only">${escapeHtml(confidenceDescription(cell, state.settings))}. Press F2 for full value details.</span></td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function fieldRows(fields, parentId = "$root", depth = 0,
    matches = matchingFieldIds(state.profile.fields, state.query, state.lowOnly, state.settings)) {
    const filtering = Boolean(state.query.trim() || state.lowOnly);
    const selectedIds = selectedFieldIds();
    const selectedRoot = state.selectedId ? fieldById(state.selectedId) : null;
    return orderedFields(fields, parentId, state.order).filter(field =>
        leafFields([field]).some(item => matches.has(item.id))).map(field => {
        const group = field.kind !== "value";
        const expanded = filtering || state.expanded.has(field.id);
        const selected = state.selectedId === field.id || selectedIds.has(field.id) ||
            (group && !expanded && state.selectedId?.startsWith(`${field.id}/`));
        const groupMember = selectedRoot && selectedRoot.kind !== "value" && selectedRoot.id !== field.id &&
            field.id.startsWith(`${selectedRoot.id}/`);
        const confidence = confidenceLabel(field, state.settings);
        const action = group ? "toggle" : "select";
        const label = group ? `${expanded ? "Collapse" : "Expand"} ${field.name}` : `Select ${field.name}`;
        const rowId = `field-${encodeURIComponent(field.id).replaceAll("%", "_")}`;
        return `<tr data-row-id="${escapeHtml(field.id)}" data-parent-id="${escapeHtml(parentId)}"
            data-inspect-id="${escapeHtml(field.id)}" class="${group ? "group-row " : ""}${selected ? "is-selected " : ""}${group && state.selectedId === field.id ? "is-group-selected " : ""}${groupMember ? "is-group-member" : ""}">
            <td><div class="field-name-content" style="--depth:${depth}">
                <button type="button" class="drag-handle" data-action="drag" data-id="${escapeHtml(field.id)}"
                    aria-label="Reorder ${escapeHtml(field.name)}" title="${filtering ? "Clear search and filters to reorder" : "Drag to reorder; Alt + Up / Down"}"
                    ${filtering ? "disabled" : ""}>${icon("grip")}</button>
                ${group ? `<button type="button" class="expand-button" data-action="toggle" data-id="${escapeHtml(field.id)}"
                    aria-label="${escapeHtml(label)}" aria-expanded="${expanded}"
                    ${field.kind === "table" && expanded ? `aria-controls="${rowId}-children"` : ""}
                    ${filtering ? 'disabled title="Automatically expanded while filtering"' : ""}>${icon(expanded ? "down" : "right")}</button>` : '<span class="expand-spacer"></span>'}
                <button type="button" class="field-name-button" data-action="${action}" data-id="${escapeHtml(field.id)}"
                    ${group ? `aria-expanded="${expanded}"` : `aria-pressed="${selectedIds.has(field.id)}"`}
                    ${group ? "" : `aria-describedby="description-${encodeURIComponent(field.id)}" aria-keyshortcuts="F2"`}
                    ${group && filtering ? "disabled" : ""}
                    title="${escapeHtml(group ? `${field.name}\n${field.id}` : fieldTooltip(field))}">${escapeHtml(field.name)}</button>
                ${field.kind === "table" ? `<span class="field-count">[${field.rows.length}]</span>` : ""}
                ${group && state.selectedId === field.id ? `<span class="group-selection-count">${selectedIds.size} selected</span>` : ""}
            </div></td>
            <td><div class="field-value-content">${group ? `<span class="summary-value">${escapeHtml(displayValue(field))}</span>` :
            `<button type="button" class="field-value-button" data-action="select" data-id="${escapeHtml(field.id)}" tabindex="-1"
                aria-label="${escapeHtml(`Select value of ${fieldCaption(field)}`)}" aria-describedby="description-${encodeURIComponent(field.id)}"
                title="${escapeHtml(fieldTooltip(field))}" aria-pressed="${selectedIds.has(field.id)}">${chip(field)}</button>`}
                ${group ? `<span class="group-value-actions">${locateButton(field)}</span>` : valueMenuButton(field)}</div>
                ${group ? "" : `<span id="description-${encodeURIComponent(field.id)}" class="sr-only">${escapeHtml(confidenceDescription(field, state.settings))}. Press F2 for full value details.</span>`}</td>
            ${state.settings.layout === "three" ? `<td>${group ? "" : `<span class="confidence-value${field.confidence === undefined ? " unavailable" : ""}"
                aria-label="${escapeHtml(`Confidence ${confidence}`)}">${confidence}</span>`}</td>` : ""}
        </tr>${expanded && field.kind === "object" ?
            fieldRows(field.children, field.id, depth + 1, matches) :
            expanded && field.kind === "table" ?
                `<tr id="${rowId}-children" class="detail-row"><td colspan="${state.settings.layout === "three" ? 3 : 2}"><div class="inline-table-wrap" data-table-id="${escapeHtml(field.id)}">${tableMarkup(field)}</div></td></tr>` : ""}`;
    }).join("");
}

function rawField(field) {
    if (field.kind === "object") return { type: "object", valueObject: Object.fromEntries(field.children.map(child => [child.name, rawField(child)])) };
    if (field.kind === "table") return { type: "array", valueArray: field.rows.map(row =>
        ({ type: "object", valueObject: Object.fromEntries(row.map(cell => [cell.name, rawField(cell)])) })) };
    return {
        type: field.value === null ? "null" : typeof field.value,
        ...(field.missing ? {} : { value: field.value }),
        ...(field.confidence === undefined ? {} : { confidence: field.confidence }),
        ...(field.regions.length ? { regions: field.regions } : {}),
    };
}

function markdownMarkup(markdown) {
    return markdown.split("\n").map(line => {
        const safe = escapeHtml(line).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        if (line.startsWith("# ")) return `<h1>${safe.slice(2)}</h1>`;
        if (line.startsWith("## ")) return `<h2>${safe.slice(3)}</h2>`;
        if (line.startsWith("- ")) return `<p>${safe.slice(2)}</p>`;
        if (line.startsWith("_")) return `<p class="markdown-note">${safe.replace(/^_|_$/g, "")}</p>`;
        return line ? `<p>${safe}</p>` : "";
    }).join("");
}

function alternateMarkup() {
    if (state.tab === "tables") {
        const tables = allFields(state.profile.fields).filter(field => field.kind === "table");
        return `<section class="alternate-view"><h2>Tables</h2><p>Select a cell to locate its source. Business row order is unchanged.</p>
            ${tables.map(field => `<h3>${escapeHtml(field.name)} <span class="field-count">${field.rows.length} rows</span></h3>
                <div class="inline-table-wrap" data-table-id="${escapeHtml(field.id)}">${tableMarkup(field, { filter: false })}</div>`).join("")}</section>`;
    }
    if (state.tab === "markdown") return `<section class="alternate-view"><h2>Markdown</h2><p>A read-only preview of the illustrative saved result.</p>
        <div class="markdown-preview">${markdownMarkup(state.profile.markdown)}</div></section>`;
    return `<section class="alternate-view"><h2>Result</h2><p>Illustrative input data, not a live Content Understanding response. Display order never changes this data.</p>
        <span class="sample-label">Simulated fixture</span><div class="json-tree"><details open><summary>fields {${state.profile.fields.length}}</summary>
        ${state.profile.fields.map(field => `<details><summary>${escapeHtml(field.name)} <span class="field-count">${field.kind}</span></summary>
            <pre>${escapeHtml(JSON.stringify(rawField(field), null, 2))}</pre></details>`).join("")}
        </details></div></section>`;
}

function renderResults({ focusId, focusAction, viewPosition = captureResultView() } = {}) {
    closeValueMenu(false);
    const active = document.activeElement?.closest("[data-action][data-id]");
    const restoreId = focusId ?? active?.dataset.id;
    const restoreAction = focusAction ?? active?.dataset.action;
    const fieldsView = state.tab === "fields";
    byId("fields-controls").hidden = !fieldsView;
    byId("reset-order").hidden = !fieldsView;
    byId("result-panel").setAttribute("aria-labelledby", `tab-${state.tab}`);
    for (const button of document.querySelectorAll("[data-tab]")) {
        const selected = button.dataset.tab === state.tab;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    }
    byId("layout-two").setAttribute("aria-pressed", String(state.settings.layout === "two"));
    byId("layout-three").setAttribute("aria-pressed", String(state.settings.layout === "three"));
    byId("low-filter").setAttribute("aria-pressed", String(state.lowOnly));
    const counts = fieldSummary(state.profile.fields, state.query, state.lowOnly, state.settings);
    byId("field-summary").textContent = state.query.trim() || state.lowOnly ?
        `${counts.matched} of ${counts.total} fields` : `${counts.total} fields / ${counts.missing} not returned`;
    byId("field-summary").title = `${counts.returned} returned values, ${counts.missing} not returned, ${counts.low} below threshold. Table cells are counted individually.`;
    byId("low-count").textContent = counts.low;
    const selected = state.selectedId ? fieldById(state.selectedId) : null;
    byId("inspect-selected").disabled = !selected || selected.kind !== "value";
    byId("reorder-hint").textContent = fieldsView ?
        (state.query.trim() || state.lowOnly ? "F2: full value / Clear filters to reorder" : "Up / Down: browse / Enter: locate / F2: details") :
        "Read-only illustrative result";
    if (fieldsView) {
        const rows = fieldRows(state.profile.fields);
        results.innerHTML = rows ? `<table class="fields-table${state.settings.layout === "three" ? " with-confidence" : ""}" aria-label="Extracted fields">
            <colgroup><col class="name-column"><col class="value-column">${state.settings.layout === "three" ? '<col class="confidence-column">' : ""}</colgroup>
            <thead><tr><th scope="col">Field<div id="column-resizer" class="column-resizer" role="separator" tabindex="0"
                aria-label="Resize field and value columns" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70"
                aria-valuenow="${Math.round(state.settings.fieldRatio * 100)}" title="Drag to resize columns; Left / Right to adjust; double-click to reset"></div></th><th scope="col">Value</th>${state.settings.layout === "three" ? '<th scope="col">Confidence</th>' : ""}</tr></thead>
            <tbody>${rows}</tbody></table>` :
            `<div class="empty-state"><h3>No matching fields</h3><p>Try a different name or value, or clear the filters.</p><button type="button" data-action="clear-filters">Clear filters</button></div>`;
    } else results.innerHTML = alternateMarkup();
    updateInspector();
    syncLayout();
    syncFieldFocus();
    results.scrollTop = viewPosition.top;
    results.scrollLeft = viewPosition.left;
    for (const table of results.querySelectorAll("[data-table-id]")) table.scrollLeft = viewPosition.tables[table.dataset.tableId] ?? 0;
    if (restoreId && restoreAction) {
        restoringResultFocus = true;
        try {
            const control = results.querySelector(`[data-action="${CSS.escape(restoreAction)}"][data-id="${CSS.escape(restoreId)}"]`);
            if (control && getComputedStyle(control).visibility === "hidden") {
                const context = control.closest("[data-inspect-id]");
                if (context) {
                    context.tabIndex = -1;
                    context.focus({ preventScroll: true });
                }
            }
            control?.focus({ preventScroll: true });
        } finally {
            restoringResultFocus = false;
        }
    }
    const available = navigationFields();
    const index = available.findIndex(field => field.id === state.selectedId);
    byId("field-position").textContent = selected && selected.kind !== "value" ?
        `${sourceSelection(selected, state.page).fields.length} selected` :
        index < 0 ? `${available.length} fields` : `${index + 1} / ${available.length} fields`;
    byId("previous-field").disabled = !available.length || index === 0;
    byId("next-field").disabled = !available.length || index === available.length - 1;
}

function sourceVisible(field) {
    return state.tab === "fields" || (state.tab === "tables" && field.extraction === "table");
}

function activeFieldId() {
    return state.previewId ?? state.selectedId;
}

function updateActiveOutlines() {
    const selectedIds = selectedFieldIds();
    for (const node of paper.querySelectorAll("[data-source-id]")) {
        const visible = sourceVisible(fieldById(node.dataset.sourceId));
        const selected = selectedIds.has(node.dataset.sourceId) && visible;
        const preview = node.dataset.sourceId === state.previewId && visible;
        node.classList.toggle("is-selected", selected);
        node.classList.toggle("is-preview", preview);
        node.classList.toggle("is-active", selected || preview);
    }
}

function renderSource() {
    const page = state.profile.pages[state.page - 1];
    const dimensions = rotatedSize(page, state.rotation);
    const transform = {
        0: "", 90: `translate(${page.height} 0) rotate(90)`,
        180: `translate(${page.width} ${page.height}) rotate(180)`,
        270: `translate(0 ${page.width}) rotate(270)`,
    }[state.rotation];
    const overlays = leafFields(state.profile.fields).flatMap(field =>
        field.regions.flatMap((region, index) => {
            if (region.page !== state.page) return [];
            const color = sourceVisible(field) ? sourceColor(field, state.settings) : null;
            const content = field.sourceTexts?.[index] ?? field.sourceText ?? displayValue(field);
            const interactive = sourceVisible(field);
            return `<g ${interactive ? `data-source-id="${escapeHtml(field.id)}" data-region-index="${index}"
                tabindex="0" role="button" aria-label="${escapeHtml(`${field.name}: ${content}`)}"` : ""}>
                <rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" rx="2"
                    fill="${color?.background ?? "transparent"}"/>
                <text x="${region.x + 4}" y="${region.y + region.height / 2}" dominant-baseline="central"
                    font-family="Arial, sans-serif" font-size="${field.fontSize ?? (field.extraction === "table" ? 11 : 12.5)}"
                    font-weight="${field.fontWeight ?? 400}" fill="${color?.text ?? "#263444"}">${escapeHtml(content)}</text>
                ${interactive ? `<rect class="source-outline" x="${region.x - 1}" y="${region.y - 1}"
                    width="${region.width + 2}" height="${region.height + 2}" rx="2"/>` : ""}
            </g>`;
        })).join("");
    paper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimensions.width} ${dimensions.height}"
        role="group" aria-label="${escapeHtml(`${state.profile.kind === "pdf" ? "Illustrative PDF" : "Illustrative image"}, page ${state.page}`)}">
        <g transform="${transform}"><rect width="${page.width}" height="${page.height}" fill="#fff"/>
            ${documentBase(state.profile, state.page)}${overlays}</g></svg>`;
    paper.dataset.sourceKind = state.profile.kind;
    paper.dataset.page = state.page;
    updatePaperSize();
    updateActiveOutlines();
    byId("page-number").value = state.page;
    byId("previous-page").disabled = state.page === 1;
    byId("next-page").disabled = state.page === state.profile.pages.length;
    updateRegionControls();
    positionFlyover();
}

function updatePaperSize() {
    const dimensions = rotatedSize(state.profile.pages[state.page - 1], state.rotation);
    paper.style.width = `${dimensions.width * state.zoom}px`;
    paper.style.height = `${dimensions.height * state.zoom}px`;
    stage.style.width = `${Math.max(viewport.clientWidth, dimensions.width * state.zoom + 64)}px`;
    byId("zoom-select").options[0].textContent = `${Math.round(state.zoom * 100)}%`;
    byId("zoom-select").value = "custom";
    byId("zoom-out").disabled = state.zoom <= 0.25;
    byId("zoom-in").disabled = state.zoom >= 3;
    paper.dataset.zoom = String(state.zoom);
    paper.dataset.rotation = String(state.rotation);
}

function zoomTo(value, anchor = null, fit = null) {
    const dimensions = rotatedSize(state.profile.pages[state.page - 1], state.rotation);
    const bounds = viewport.getBoundingClientRect();
    const before = paper.getBoundingClientRect();
    const clientX = anchor?.x ?? bounds.left + viewport.clientWidth / 2;
    const clientY = anchor?.y ?? bounds.top + viewport.clientHeight / 2;
    const x = Math.max(0, Math.min(dimensions.width, (clientX - before.left) / state.zoom));
    const y = Math.max(0, Math.min(dimensions.height, (clientY - before.top) / state.zoom));
    state.zoom = clampZoom(value);
    state.fit = fit;
    updatePaperSize();
    viewport.scrollLeft = paper.offsetLeft + x * state.zoom - (clientX - bounds.left);
    viewport.scrollTop = paper.offsetTop + y * state.zoom - (clientY - bounds.top);
    positionFlyover();
}

function fitDocument(mode) {
    const dimensions = rotatedSize(state.profile.pages[state.page - 1], state.rotation);
    const width = (viewport.clientWidth - 64) / dimensions.width;
    const height = (viewport.clientHeight - 60) / dimensions.height;
    zoomTo(mode === "width" ? width : Math.min(width, height), null, mode);
    viewport.scrollLeft = Math.max(0, (stage.clientWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = 0;
    positionFlyover(true);
}

function currentSourceNode(field) {
    const index = state.previewId === field.id ? state.previewRegion : state.regionIndex;
    return paper.querySelector(`[data-source-id="${CSS.escape(field.id)}"][data-region-index="${index}"]`);
}

function hideFlyover(resetSpace = false) {
    flyover.hidden = true;
    if (resetSpace) stage.style.setProperty("--flyover-space", "0px");
    for (const node of paper.querySelectorAll('[aria-describedby="flyover"]')) node.removeAttribute("aria-describedby");
}

function positionFlyover(ensureSpace = false) {
    const id = activeFieldId();
    if (!id || state.flyoverDismissed || state.drag || resizeGesture || panGesture?.moved) {
        hideFlyover();
        return;
    }
    const field = fieldById(id);
    const node = field.kind === "value" && sourceVisible(field) ? currentSourceNode(field) : null;
    const bounds = viewport.getBoundingClientRect();
    let target = node?.getBoundingClientRect();
    if (!target || target.bottom <= bounds.top || target.top >= bounds.bottom ||
        target.right <= bounds.left || target.left >= bounds.right) {
        hideFlyover();
        return;
    }
    const color = sourceColor(field, { ...state.settings, showFields: true, showTables: true }) ?? PALETTE.unavailable;
    const confidence = confidenceLabel(field, state.settings);
    const signature = `${id}|${color.background}|${confidence}`;
    if (lastFlyoverSignature !== signature) {
        lastFlyoverSignature = signature;
        flyover.innerHTML = `<div class="flyover-heading" title="${escapeHtml(fieldCaption(field))}">${escapeHtml(fieldCaption(field))}</div>
            <div class="flyover-body"><span class="flyover-value">${escapeHtml(displayValue(field))}</span>
            <span class="flyover-score${field.confidence === undefined ? " unavailable" : ""}"
                style="color:${color.text}" aria-label="Confidence ${confidence}" title="Confidence: ${confidence}">
                ${field.confidence === undefined ? "" : icon("gauge")}${confidence}</span></div>`;
        flyover.style.setProperty("--flyover-background", color.background);
    }
    flyover.style.left = `${viewport.scrollLeft + 12}px`;
    flyover.style.top = `${viewport.scrollTop + 12}px`;
    flyover.hidden = false;
    flyover.querySelector(".flyover-body").style.maxHeight = `${Math.min(112, Math.max(48, viewport.clientHeight - 72))}px`;
    if (ensureSpace && state.previewId === null) {
        const requiredBottom = target.bottom - bounds.top + viewport.scrollTop + 12 + flyover.offsetHeight + 12;
        const naturalBottom = Math.max(viewport.clientHeight, paper.offsetTop + paper.offsetHeight + 30);
        stage.style.setProperty("--flyover-space", `${Math.max(0, Math.ceil(requiredBottom - naturalBottom))}px`);
        target = node.getBoundingClientRect();
        const overflow = target.bottom + 12 + flyover.offsetHeight - (bounds.top + viewport.clientHeight - 12);
        if (overflow > 0) viewport.scrollTop += overflow;
        target = node.getBoundingClientRect();
    }
    if (target.bottom + 12 + flyover.offsetHeight > bounds.top + viewport.clientHeight - 12) {
        hideFlyover();
        return;
    }
    for (const element of paper.querySelectorAll('[aria-describedby="flyover"]')) element.removeAttribute("aria-describedby");
    node.setAttribute("aria-describedby", "flyover");
    const rawLeft = target.left - bounds.left + viewport.scrollLeft;
    const left = Math.max(viewport.scrollLeft + 12,
        Math.min(rawLeft, viewport.scrollLeft + viewport.clientWidth - flyover.offsetWidth - 12));
    const top = target.bottom - bounds.top + viewport.scrollTop + 12;
    flyover.style.left = `${left}px`;
    flyover.style.top = `${top}px`;
    flyover.style.setProperty("--arrow-left", `${Math.max(12, Math.min(flyover.offsetWidth - 22,
        target.left + Math.min(target.width / 2, 36) - bounds.left + viewport.scrollLeft - left - 4))}px`);
}

function updateRegionControls() {
    const field = state.selectedId ? fieldById(state.selectedId) : null;
    const group = field && field.kind !== "value";
    byId("clear-selection").hidden = !field;
    byId("group-source-controls").hidden = !group;
    byId("source-help").hidden = Boolean(group);
    byId("source-caption").hidden = Boolean(group);
    if (group) {
        const selection = sourceSelection(field, state.page);
        const currentRegions = selection.regions.filter(item => item.region.page === state.page);
        byId("group-source-name").textContent = field.name;
        byId("group-source-name").title = `${field.name}: all descendant fields selected`;
        byId("group-source-count").textContent = `${selection.fields.length} fields / ${currentRegions.length} source regions on this page`;
        const pages = selection.pages.includes(state.page) ? selection.pages :
            [...selection.pages, state.page].sort((a, b) => a - b);
        byId("group-source-page").innerHTML = pages.map(page =>
            `<option value="${page}">p.${page}${selection.pages.includes(page) ? "" : " (no group source)"}</option>`).join("");
        byId("group-source-page").value = state.page;
        byId("group-source-page").disabled = pages.length < 2;
    }
    const count = field?.kind === "value" ? field.regions.length : 0;
    byId("region-controls").hidden = count < 2;
    byId("region-label").textContent = `Region ${state.regionIndex + 1} / ${count}`;
    byId("previous-region").disabled = state.regionIndex <= 0;
    byId("next-region").disabled = state.regionIndex >= count - 1;
}

function clearPreview() {
    clearTimeout(previewTimer);
    state.previewId = null;
    updateActiveOutlines();
    positionFlyover();
}

function previewField(id, regionIndex) {
    clearTimeout(previewTimer);
    if (state.drag || resizeGesture || panGesture?.moved) return;
    const field = fieldById(id);
    if (field.kind !== "value") {
        clearPreview();
        return;
    }
    if (id === state.selectedId && (regionIndex === undefined || regionIndex === state.regionIndex)) {
        state.flyoverDismissed = false;
        clearPreview();
        return;
    }
    const index = regionIndex ?? field.regions.findIndex(region => region.page === state.page);
    if (index < 0 || field.regions[index]?.page !== state.page) {
        clearPreview();
        return;
    }
    state.previewId = id;
    state.previewRegion = index;
    state.flyoverDismissed = false;
    updateActiveOutlines();
    positionFlyover();
}

function leavePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(clearPreview, 160);
}

function goToPage(pageNumber, { announceChange = true } = {}) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > state.profile.pages.length) {
        byId("page-error").textContent = `Enter a whole page number from 1 to ${state.profile.pages.length}.`;
        byId("page-error").hidden = false;
        byId("page-number").setAttribute("aria-invalid", "true");
        return false;
    }
    byId("page-error").hidden = true;
    byId("page-number").removeAttribute("aria-invalid");
    state.page = pageNumber;
    state.previewId = null;
    hideFlyover(true);
    if (state.selectedId && fieldById(state.selectedId).kind === "value") {
        const available = fieldById(state.selectedId).regions.findIndex(region => region.page === pageNumber);
        if (available >= 0) state.regionIndex = available;
    }
    renderSource();
    renderResults();
    viewport.scrollTop = 0;
    if (state.selectedId && fieldById(state.selectedId).kind !== "value") revealSelected();
    if (announceChange) announce(`Page ${pageNumber} of ${state.profile.pages.length}. Zoom and rotation are unchanged.`);
    return true;
}

function revealSelected() {
    if (!state.selectedId) return;
    const field = fieldById(state.selectedId);
    const nodes = field.kind === "value" ? [currentSourceNode(field)].filter(Boolean) :
        [...paper.querySelectorAll("[data-source-id].is-selected")];
    if (!nodes.length) return;
    const bounds = viewport.getBoundingClientRect();
    const regions = nodes.map(node => node.getBoundingClientRect());
    const target = {
        left: Math.min(...regions.map(region => region.left)),
        right: Math.max(...regions.map(region => region.right)),
        top: Math.min(...regions.map(region => region.top)),
        bottom: Math.max(...regions.map(region => region.bottom)),
    };
    if (target.right - target.left > viewport.clientWidth - 40 || target.left < bounds.left + 20) {
        viewport.scrollLeft += target.left - bounds.left - 20;
    } else if (target.right > bounds.left + viewport.clientWidth - 20) viewport.scrollLeft += target.right - bounds.left - viewport.clientWidth + 20;
    if (target.bottom - target.top > viewport.clientHeight - 40 || target.top < bounds.top + 20) {
        viewport.scrollTop += target.top - bounds.top - 20;
    } else if (target.bottom > bounds.top + viewport.clientHeight - 20) viewport.scrollTop += target.bottom - bounds.top - viewport.clientHeight + 20;
    positionFlyover(true);
}

function revealResultField(id) {
    const target = results.querySelector(`[data-row-id="${CSS.escape(id)}"]`) ??
        results.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!target) return false;
    const bounds = results.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const header = results.querySelector(".fields-table > thead")?.getBoundingClientRect().height ?? 0;
    if (rect.top < bounds.top + header + 4) results.scrollTop -= bounds.top + header + 4 - rect.top;
    else if (rect.bottom > bounds.bottom - 8) results.scrollTop += rect.bottom - bounds.bottom + 8;
    const table = target.closest(".inline-table-wrap");
    if (table) {
        const frame = table.getBoundingClientRect();
        if (rect.left < frame.left + 4) table.scrollLeft -= frame.left + 4 - rect.left;
        else if (rect.right > frame.right - 4) table.scrollLeft += rect.right - frame.right + 4;
    }
    return true;
}

function selectField(id, { regionIndex } = {}) {
    clearTimeout(previewTimer);
    const field = fieldById(id);
    copyFeedbackVersion++;
    hideFlyover(true);
    const group = field.kind !== "value";
    const selection = sourceSelection(field, state.page);
    state.selectedId = field.id;
    state.previewId = null;
    state.flyoverDismissed = false;
    state.regionIndex = group ? 0 : regionIndex ?? Math.max(0, field.regions.findIndex(region => region.page === state.page));
    if (group) state.inspectedId = null;
    else if (state.inspectedId) state.inspectedId = field.id;
    byId("copy-error").hidden = true;
    for (const ancestor of allFields(state.profile.fields).filter(item => item.kind !== "value")) {
        if (field.id.startsWith(`${ancestor.id}/`)) state.expanded.add(ancestor.id);
    }
    const region = group ? undefined : field.regions[state.regionIndex];
    const targetPage = group ? selection.page : region?.page;
    if (targetPage !== undefined && targetPage !== state.page) goToPage(targetPage, { announceChange: false });
    renderResults();
    const resultVisible = revealResultField(field.id);
    const filterNotice = !resultVisible && (state.query.trim() || state.lowOnly) ?
        " This field is hidden by the current result filters." : "";
    updateActiveOutlines();
    updateRegionControls();
    if (group) {
        hideFlyover();
        revealSelected();
        const pageSources = selection.regions.filter(item => item.region.page === state.page).length;
        const matches = matchingFieldIds(state.profile.fields, state.query, state.lowOnly, state.settings);
        const hiddenFields = selection.fields.some(item => !matches.has(item.id));
        announce(`${field.name}: all ${selection.fields.length} descendant fields selected. ${pageSources} source regions on page ${state.page}.` +
            (selection.pages.length > 1 ? ` Source pages: ${selection.pages.join(", ")}.` : "") +
            (!selection.regions.length ? " No source regions were supplied." : "") +
            (hiddenFields ? " Selection includes descendants hidden by the current filters." : "") + filterNotice);
    } else if (!region) {
        hideFlyover();
        announce(`${field.name}: ${displayValue(field)}. No source region was supplied.${filterNotice}`);
    } else if (region.page !== state.page) {
        hideFlyover();
        announce(`${field.name}: source page ${region.page} is unavailable.${filterNotice}`);
    } else {
        revealSelected();
        announce(`${field.name}: ${displayValue(field)}. Page ${region.page}, confidence ${confidenceLabel(field, state.settings)}.${filterNotice}`);
    }
}

function navigateField(direction) {
    const available = navigationFields();
    const group = state.selectedId && fieldById(state.selectedId).kind !== "value";
    const selectedIds = selectedFieldIds();
    const index = available.findIndex(field => group ? selectedIds.has(field.id) : field.id === state.selectedId);
    const target = index < 0 ? (direction > 0 ? 0 : available.length - 1) :
        index + (group && direction > 0 ? 0 : direction);
    if (target < 0 || target >= available.length) return;
    selectField(available[target].id);
}

function openSettings() {
    clearPreview();
    closeValueMenu(false);
    closeDocumentMenu(false);
    byId("settings-panel").hidden = false;
    byId("settings-button").setAttribute("aria-expanded", "true");
    byId("threshold-input").focus();
}

function closeSettings(restoreFocus = true) {
    const wasOpen = !byId("settings-panel").hidden;
    byId("settings-panel").hidden = true;
    byId("settings-button").setAttribute("aria-expanded", "false");
    if (wasOpen && restoreFocus) byId("settings-button").focus();
}

function changeTab(tab) {
    if (!["fields", "tables", "markdown", "result"].includes(tab)) throw new Error("Unknown result view.");
    state.viewScroll[state.tab] = captureResultView();
    state.tab = tab;
    state.previewId = null;
    state.flyoverDismissed = true;
    renderResults({ viewPosition: state.viewScroll[tab] ?? { top: 0, left: 0, tables: {} } });
    renderSource();
    announce(`${tab[0].toUpperCase()}${tab.slice(1)} view. Previous result position and source view are preserved.`);
}

function rotateDocument() {
    state.rotation = (state.rotation + 90) % 360;
    renderSource();
    if (state.fit) fitDocument(state.fit);
    else revealSelected();
    announce(`Document rotated to ${state.rotation} degrees.`);
}

function closeDocumentMenu(restoreFocus = true) {
    const wasOpen = !byId("document-menu").hidden;
    byId("document-menu").hidden = true;
    byId("document-more").setAttribute("aria-expanded", "false");
    if (wasOpen && restoreFocus) byId("document-more").focus();
}

function openDocumentMenu() {
    closeSettings(false);
    closeValueMenu(false);
    byId("document-menu").hidden = false;
    byId("document-more").setAttribute("aria-expanded", "true");
    byId("document-menu").querySelector("button").focus();
}

function updateLayoutRatio(kind, ratio) {
    state.settings[kind === "pane" ? "paneRatio" : "fieldRatio"] = Math.max(0.3, Math.min(0.7, ratio));
    syncLayout();
}

function startResize(element, kind, event) {
    if (event.button !== 0 || resizeGesture || state.drag) return;
    event.preventDefault();
    closeDocumentMenu(false);
    closeValueMenu(false);
    clearPreview();
    element.focus();
    resizeGesture = {
        kind, element, pointerId: event.pointerId,
        initial: state.settings[kind === "pane" ? "paneRatio" : "fieldRatio"],
        startX: event.clientX,
        startRatio: kind === "pane" ?
            Number.parseFloat(workspace.style.getPropertyValue("--source-width")) / (workspace.clientWidth - 8) :
            state.settings.fieldRatio,
    };
    document.body.classList.add("is-resizing");
    hideFlyover();
    element.setPointerCapture(event.pointerId);
}

function finishResize(cancel = false) {
    if (!resizeGesture) return;
    const gesture = resizeGesture;
    resizeGesture = null;
    if (cancel) updateLayoutRatio(gesture.kind, gesture.initial);
    document.body.classList.remove("is-resizing");
    if (gesture.element.hasPointerCapture(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId);
    positionFlyover();
    if (cancel) announce("Resizing cancelled.");
    else {
        const saved = persist();
        announce(`${gesture.kind === "pane" ? "Pane" : "Column"} widths updated.${saved ? " Saved in this browser." : " Changes are not saved."}`);
    }
}

function resizeWithKey(element, kind, event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const ratio = kind === "pane" ?
        Number.parseFloat(workspace.style.getPropertyValue("--source-width")) / (workspace.clientWidth - 8) :
        state.settings.fieldRatio;
    const next = event.key === "Home" ? 0.3 : event.key === "End" ? 0.7 :
        ratio + (event.key === "ArrowRight" ? 0.02 : -0.02);
    updateLayoutRatio(kind, next);
    element.focus();
    persist();
}

function focusAdjacentField(direction) {
    const controls = primaryFieldControls();
    const focused = document.activeElement?.closest("[data-id]");
    const index = controls.findIndex(button => button.dataset.id === (focused?.dataset.id ?? state.focusedId));
    const next = controls[Math.max(0, Math.min(controls.length - 1, index + direction))];
    if (!next) return;
    syncFieldFocus(next.dataset.id);
    next.focus({ preventScroll: true });
    revealResultField(next.dataset.id);
}

function clearFilters() {
    state.query = "";
    state.lowOnly = false;
    byId("field-search").value = "";
    renderResults();
    announce("Search and low-confidence filter cleared.");
}

byId("profile-select").addEventListener("change", event => loadProfile(event.target.value));
byId("settings-button").addEventListener("click", () => byId("settings-panel").hidden ? openSettings() : closeSettings());
byId("close-settings").addEventListener("click", () => closeSettings());
byId("document-more").addEventListener("click", () => byId("document-menu").hidden ? openDocumentMenu() : closeDocumentMenu());
byId("document-menu").addEventListener("click", event => {
    const button = event.target.closest("[data-document-action]");
    if (!button) return;
    closeDocumentMenu();
    const action = button.dataset.documentAction;
    if (action === "rotate") rotateDocument();
    else if (action === "fit-page" || action === "fit-width") fitDocument(action === "fit-page" ? "page" : "width");
    else if (action === "reset-layout") {
        state.settings.paneRatio = DEFAULT_SETTINGS.paneRatio;
        state.settings.fieldRatio = DEFAULT_SETTINGS.fieldRatio;
        syncLayout();
        persist();
    } else throw new Error(`Unknown document action: ${action}`);
});
for (const [menu, dismiss] of [[byId("document-menu"), closeDocumentMenu], [valueMenu, closeValueMenu]]) {
    menu.addEventListener("keydown", event => moveMenuFocus(event, menu, dismiss));
    menu.addEventListener("focusout", event => {
        if (!menu.hidden && !menu.contains(event.relatedTarget)) dismiss(false);
    });
}
valueMenu.addEventListener("click", event => {
    const button = event.target.closest("[data-value-action]");
    if (!button || button.disabled) return;
    const id = valueMenu.dataset.fieldId;
    const action = button.dataset.valueAction;
    closeValueMenu();
    if (action === "locate") selectField(id);
    else if (action === "inspect") inspectField(id, true);
    else if (action === "copy") void copyField(id);
    else throw new Error(`Unknown value action: ${action}`);
});
byId("clear-selection").addEventListener("click", clearSelection);
byId("pane-resizer").addEventListener("pointerdown", event => startResize(event.currentTarget, "pane", event));
byId("pane-resizer").addEventListener("keydown", event => resizeWithKey(event.currentTarget, "pane", event));
byId("pane-resizer").addEventListener("dblclick", () => {
    updateLayoutRatio("pane", DEFAULT_SETTINGS.paneRatio);
    persist();
});
document.addEventListener("pointermove", event => {
    if (!resizeGesture || resizeGesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (resizeGesture.kind === "pane") {
        const bounds = workspace.getBoundingClientRect();
        updateLayoutRatio("pane", resizeGesture.startRatio + (event.clientX - resizeGesture.startX) / (bounds.width - 8));
    } else {
        const bounds = results.querySelector(".fields-table").getBoundingClientRect();
        updateLayoutRatio("column", resizeGesture.startRatio +
            (event.clientX - resizeGesture.startX) / (bounds.width * (state.settings.layout === "three" ? 0.83 : 1)));
    }
});
document.addEventListener("pointerup", event => {
    if (resizeGesture?.pointerId === event.pointerId) finishResize();
});
document.addEventListener("pointercancel", () => finishResize(true));
document.addEventListener("lostpointercapture", event => {
    if (resizeGesture?.pointerId === event.pointerId) finishResize(true);
});
byId("close-inspector").addEventListener("click", closeInspector);
byId("inspect-selected").addEventListener("click", () => {
    if (state.selectedId) inspectField(state.selectedId, true);
});
byId("copy-inspected").addEventListener("click", () => {
    if (state.inspectedId) void copyField(state.inspectedId);
});
byId("threshold-input").addEventListener("input", event => {
    const value = event.target.valueAsNumber;
    if (!validThreshold(value)) {
        event.target.setAttribute("aria-invalid", "true");
        byId("threshold-error").textContent = "Enter a number from 0 to 1. The last valid threshold is still applied.";
        byId("threshold-error").hidden = false;
        return;
    }
    event.target.removeAttribute("aria-invalid");
    byId("threshold-error").hidden = true;
    state.settings.threshold = value;
    byId("threshold-label").textContent = formatThreshold(value);
    renderResults();
    renderSource();
    persist();
    announce(`Threshold ${formatThreshold(value)} applied. Scores exactly at the threshold are not low confidence.`);
});
for (const [id, setting] of [["show-fields", "showFields"], ["show-tables", "showTables"], ["highlight-low", "highlightLow"]]) {
    byId(id).addEventListener("change", event => {
        state.settings[setting] = event.target.checked;
        renderResults();
        renderSource();
        persist();
        announce(`${event.target.closest("label").textContent.trim()}: ${event.target.checked ? "on" : "off"}. Extracted values are unchanged.`);
    });
}
for (const [id, layout] of [["layout-two", "two"], ["layout-three", "three"]]) {
    byId(id).addEventListener("click", () => {
        state.settings.layout = layout;
        renderResults();
        persist();
        announce(layout === "two" ? "Two columns. Press F2 on a field for its full value and confidence." : "Three columns. Confidence is displayed with secondary visual weight.");
    });
}
byId("field-search").addEventListener("input", event => {
    state.query = event.target.value;
    clearPreview();
    renderResults();
    results.scrollTop = 0;
});
byId("low-filter").addEventListener("click", () => {
    state.lowOnly = !state.lowOnly;
    clearPreview();
    renderResults();
    results.scrollTop = 0;
    announce(state.lowOnly ? "Showing values below the confidence threshold. Reordering is paused while filtering." : "Showing all values.");
});
byId("previous-field").addEventListener("click", () => navigateField(-1));
byId("next-field").addEventListener("click", () => navigateField(1));
byId("previous-page").addEventListener("click", () => goToPage(state.page - 1));
byId("next-page").addEventListener("click", () => goToPage(state.page + 1));
byId("page-number").addEventListener("change", event => goToPage(event.target.value.trim() === "" ? NaN : Number(event.target.value)));
byId("page-number").addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        goToPage(event.target.value.trim() === "" ? NaN : Number(event.target.value));
    }
});
byId("zoom-in").addEventListener("click", () => zoomTo(state.zoom * 1.2));
byId("zoom-out").addEventListener("click", () => zoomTo(state.zoom / 1.2));
byId("zoom-select").addEventListener("change", event => {
    if (event.target.value === "fit-page") fitDocument("page");
    else if (event.target.value === "fit-width") fitDocument("width");
    else if (event.target.value !== "custom") zoomTo(Number(event.target.value));
});
byId("rotate").addEventListener("click", rotateDocument);
byId("group-source-page").addEventListener("change", event => {
    const field = state.selectedId ? fieldById(state.selectedId) : null;
    const targetPage = Number(event.target.value);
    if (!field || field.kind === "value" || !sourceSelection(field, state.page).pages.includes(targetPage)) {
        announce("Choose an existing source page for the selected group.");
        updateRegionControls();
        return;
    }
    goToPage(targetPage);
});
for (const [id, direction] of [["previous-region", -1], ["next-region", 1]]) {
    byId(id).addEventListener("click", () => {
        if (state.selectedId && fieldById(state.selectedId).kind === "value") {
            selectField(state.selectedId, { regionIndex: state.regionIndex + direction });
        }
    });
}
byId("reset-order").addEventListener("click", () => {
    state.order = {};
    renderResults();
    const saved = persist();
    announce(`Original field order restored.${saved ? " Saved in this browser." : " Changes are not saved."}`);
});
byId("reset-preferences").addEventListener("click", () => {
    try {
        resetPreferences(localStorageForPrototype(), state.profile.schemaId);
        state.persistenceBlocked = false;
        state.settings = { ...DEFAULT_SETTINGS };
        state.order = {};
        byId("storage-error").hidden = true;
        syncSettings();
        renderResults();
        renderSource();
        const saved = persist();
        if (saved) announce("Saved preferences reset. Default highlighting and field order restored.");
    } catch (error) {
        storageError(error);
    }
});

results.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) {
        const row = event.target.closest("[data-row-id]");
        if (row && fieldById(row.dataset.rowId).kind === "value") selectField(row.dataset.rowId);
        return;
    }
    const { action, id } = button.dataset;
    if (action === "toggle") {
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        renderResults({ focusId: id, focusAction: "toggle" });
    } else if (action === "select" || action === "locate") selectField(id);
    else if (action === "value-menu") openValueMenu(id, button);
    else if (action === "clear-filters") clearFilters();
    else if (action === "drag") announce("Drag this handle within its group, or use Alt + Up / Down to reorder.");
    else throw new Error(`Unknown prototype action: ${action}`);
});
results.addEventListener("pointerover", event => {
    const target = event.target.closest("[data-inspect-id]");
    if (target) previewField(target.dataset.inspectId);
    else leavePreview();
});
results.addEventListener("pointerout", event => {
    const from = event.target.closest("[data-inspect-id]");
    const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest("[data-inspect-id]") : null;
    if (from !== to) leavePreview();
});
results.addEventListener("focusin", event => {
    const target = event.target.closest("[data-inspect-id]");
    if (target) {
        syncFieldFocus(target.dataset.inspectId);
        if (!restoringResultFocus) previewField(target.dataset.inspectId);
    }
});
results.addEventListener("focusout", event => {
    const from = event.target.closest("[data-inspect-id]");
    const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest("[data-inspect-id]") : null;
    if (from !== to) leavePreview();
});
results.addEventListener("keydown", event => {
    if (event.target.id === "column-resizer") {
        resizeWithKey(event.target, "column", event);
        return;
    }
    const inspected = event.target.closest("[data-inspect-id]");
    const field = inspected ? fieldById(inspected.dataset.inspectId) : null;
    if (field?.kind === "value" && event.shiftKey && event.key === "F10") {
        event.preventDefault();
        const trigger = results.querySelector(`.value-menu-trigger[data-id="${CSS.escape(field.id)}"]`);
        if (trigger) openValueMenu(field.id, trigger);
        return;
    }
    if (field?.kind === "value" && event.key === "F2") {
        event.preventDefault();
        inspectField(field.id, true);
        return;
    }
    if (field?.kind === "value" && (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
        event.preventDefault();
        void copyField(field.id);
        return;
    }
    if (inspected && !event.altKey && !event.ctrlKey && !event.metaKey &&
        ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        focusAdjacentField(event.key === "ArrowDown" ? 1 : -1);
        return;
    }
    const handle = event.target.closest(".drag-handle");
    if (!handle || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const id = handle.dataset.id;
    const next = moveFieldBy(state.profile.fields, state.order, id, event.key === "ArrowUp" ? -1 : 1);
    if (next === state.order) {
        announce(`${fieldById(id).name} is already at the ${event.key === "ArrowUp" ? "start" : "end"} of its group.`);
        return;
    }
    state.order = next;
    renderResults({ focusId: id, focusAction: "drag" });
    const saved = persist();
    announce(`${fieldById(id).name} moved ${event.key === "ArrowUp" ? "up" : "down"}.${saved ? " Order saved." : " Order is not saved."}`);
});
function clearDragFeedback() {
    dragPreview.hidden = true;
    for (const row of results.querySelectorAll(".is-dragging, .drop-before, .drop-after")) {
        row.classList.remove("is-dragging", "drop-before", "drop-after");
    }
}

function cancelPointerDrag() {
    if (!state.drag) return;
    const pointerId = state.drag.pointerId;
    state.drag = null;
    if (results.hasPointerCapture(pointerId)) results.releasePointerCapture(pointerId);
    clearDragFeedback();
    announce("Field reordering cancelled.");
}

results.addEventListener("pointerdown", event => {
    const column = event.target.closest("#column-resizer");
    if (column) {
        startResize(column, "column", event);
        return;
    }
    const handle = event.target.closest(".drag-handle");
    if (!handle || event.button !== 0 || handle.disabled) return;
    event.preventDefault();
    handle.focus();
    clearPreview();
    hideFlyover();
    const row = handle.closest("[data-row-id]");
    state.drag = {
        id: handle.dataset.id, parentId: row.dataset.parentId, pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY, moved: false, invalidAlerted: false,
    };
    results.setPointerCapture(event.pointerId);
});
results.addEventListener("pointermove", event => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY) > 4) state.drag.moved = true;
    if (!state.drag.moved) return;
    event.preventDefault();
    for (const row of results.querySelectorAll(".drop-before, .drop-after")) row.classList.remove("drop-before", "drop-after");
    results.querySelector(`[data-row-id="${CSS.escape(state.drag.id)}"]`).classList.add("is-dragging");
    dragPreview.textContent = fieldById(state.drag.id).name;
    dragPreview.hidden = false;
    dragPreview.style.left = `${event.clientX + 14}px`;
    dragPreview.style.top = `${event.clientY + 12}px`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-row-id]");
    if (!target || target.dataset.parentId !== state.drag.parentId) {
        dragPreview.dataset.invalid = "true";
        if (!state.drag.invalidAlerted) announce("Only sibling fields can be reordered. Drop within the same group.");
        state.drag.invalidAlerted = true;
        return;
    }
    state.drag.invalidAlerted = false;
    dragPreview.dataset.invalid = "false";
    const bounds = target.getBoundingClientRect();
    target.classList.add(event.clientY < bounds.top + bounds.height / 2 ? "drop-before" : "drop-after");
    const resultBounds = results.getBoundingClientRect();
    if (event.clientY > resultBounds.bottom - 36) results.scrollTop += 9;
    if (event.clientY < resultBounds.top + 36) results.scrollTop -= 9;
});
results.addEventListener("pointerup", event => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const gesture = state.drag;
    const source = gesture.id;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-row-id]");
    state.drag = null;
    results.releasePointerCapture(event.pointerId);
    clearDragFeedback();
    if (!gesture.moved) {
        announce("Drag this handle within its group, or use Alt + Up / Down to reorder.");
        return;
    }
    if (!target) {
        announce("Drop on a sibling field row to reorder.");
        return;
    }
    const bounds = target.getBoundingClientRect();
    try {
        const order = moveField(state.profile.fields, state.order, source, target.dataset.rowId,
            event.clientY < bounds.top + bounds.height / 2 ? "before" : "after");
        if (order === state.order) {
            announce("Field order is unchanged.");
            return;
        }
        state.order = order;
        renderResults({ focusId: source, focusAction: "drag" });
        const saved = persist();
        announce(`${fieldById(source).name} reordered.${saved ? " Order saved in this browser." : " Order is not saved."}`);
    } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        renderResults();
        announce(error.message);
    }
});
results.addEventListener("pointercancel", cancelPointerDrag);
results.addEventListener("lostpointercapture", cancelPointerDrag);
results.addEventListener("dblclick", event => {
    if (event.target.closest("#column-resizer")) {
        updateLayoutRatio("column", DEFAULT_SETTINGS.fieldRatio);
        persist();
    }
});

viewport.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * multiplier));
    zoomTo(state.zoom * Math.exp(-delta * 0.002), { x: event.clientX, y: event.clientY });
}, { passive: false });
viewport.addEventListener("scroll", () => positionFlyover(), { passive: true });
viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("#flyover")) return;
    const target = event.target.closest("[data-source-id]");
    panGesture = {
        pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, moved: false,
        targetId: target?.dataset.sourceId, regionIndex: Number(target?.dataset.regionIndex ?? 0),
        blankDocument: !target && Boolean(event.target.closest("#document-stage")),
    };
    viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener("pointermove", event => {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - panGesture.x;
    const dy = event.clientY - panGesture.y;
    if (Math.hypot(dx, dy) > 4) panGesture.moved = true;
    if (!panGesture.moved) return;
    viewport.classList.add("is-panning");
    viewport.scrollLeft = panGesture.scrollLeft - dx;
    viewport.scrollTop = panGesture.scrollTop - dy;
    hideFlyover();
});
viewport.addEventListener("pointerup", event => {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    const gesture = panGesture;
    panGesture = null;
    viewport.classList.remove("is-panning");
    viewport.releasePointerCapture(event.pointerId);
    if (!gesture.moved && gesture.targetId) selectField(gesture.targetId, { regionIndex: gesture.regionIndex });
    else if (!gesture.moved && gesture.blankDocument) clearSelection();
});
for (const name of ["pointercancel", "lostpointercapture"]) {
    viewport.addEventListener(name, () => {
        panGesture = null;
        viewport.classList.remove("is-panning");
    });
}
paper.addEventListener("pointerover", event => {
    const target = event.target.closest("[data-source-id]");
    if (target) previewField(target.dataset.sourceId, Number(target.dataset.regionIndex));
    else leavePreview();
});
paper.addEventListener("pointerout", event => {
    const from = event.target.closest("[data-source-id]");
    const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest("[data-source-id]") : null;
    if (from !== to) leavePreview();
});
paper.addEventListener("focusin", event => {
    const target = event.target.closest("[data-source-id]");
    if (target) previewField(target.dataset.sourceId, Number(target.dataset.regionIndex));
});
paper.addEventListener("focusout", event => {
    const from = event.target.closest("[data-source-id]");
    const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest("[data-source-id]") : null;
    if (from !== to) leavePreview();
});
paper.addEventListener("keydown", event => {
    const target = event.target.closest("[data-source-id]");
    if (target && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        selectField(target.dataset.sourceId, { regionIndex: Number(target.dataset.regionIndex) });
    }
});
viewport.addEventListener("keydown", event => {
    if (event.target !== viewport || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    viewport.scrollBy({
        left: event.key === "ArrowLeft" ? -40 : event.key === "ArrowRight" ? 40 : 0,
        top: event.key === "ArrowUp" ? -40 : event.key === "ArrowDown" ? 40 : 0,
    });
});
flyover.addEventListener("pointerenter", () => clearTimeout(previewTimer));
flyover.addEventListener("pointerleave", leavePreview);
flyover.addEventListener("pointerdown", event => event.stopPropagation());

document.querySelector(".result-tabs").addEventListener("click", event => {
    const button = event.target.closest("[data-tab]");
    if (button) changeTab(button.dataset.tab);
});
document.querySelector(".result-tabs").addEventListener("keydown", event => {
    const tabs = [...document.querySelectorAll("[data-tab]")];
    const index = tabs.indexOf(event.target);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
        (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    changeTab(tabs[next].dataset.tab);
    tabs[next].focus();
});
document.addEventListener("click", event => {
    if (!valueMenu.hidden && !valueMenu.contains(event.target) && !valueMenuTrigger?.contains(event.target)) {
        closeValueMenu(false);
    }
    if (!byId("settings-panel").hidden && !byId("settings-panel").contains(event.target) &&
        !byId("settings-button").contains(event.target)) closeSettings(false);
    if (!byId("document-menu").hidden && !byId("document-menu").contains(event.target) &&
        !byId("document-more").contains(event.target)) closeDocumentMenu(false);
});
document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (resizeGesture) {
        finishResize(true);
        return;
    }
    if (state.drag) {
        cancelPointerDrag();
        return;
    }
    if (!valueMenu.hidden) closeValueMenu();
    else if (!byId("document-menu").hidden) closeDocumentMenu();
    else if (!byId("settings-panel").hidden) closeSettings();
    else if (!byId("value-inspector").hidden) {
        closeInspector();
        state.flyoverDismissed = true;
        clearPreview();
        hideFlyover();
    } else if (state.selectedId) clearSelection();
    else {
        state.flyoverDismissed = true;
        clearPreview();
        hideFlyover();
    }
});
results.addEventListener("scroll", () => closeValueMenu(false), { capture: true, passive: true });
window.addEventListener("resize", () => closeValueMenu(false));

new ResizeObserver(() => {
    if (state.fit) fitDocument(state.fit);
    else {
        updatePaperSize();
        positionFlyover();
    }
}).observe(viewport);
new ResizeObserver(syncLayout).observe(workspace);

loadProfile("invoice");
