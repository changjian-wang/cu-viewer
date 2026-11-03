import { PROFILES, documentBase } from "../prototype/fixtures.mjs";
import { leafFields, sourceSelection, displayValue, escapeHtml, formatThreshold, validThreshold } from "../prototype/model.mjs";

const byId = id => document.getElementById(id);
const viewport = byId("viewport"), paper = byId("paper");
const profiles = new Map(PROFILES.map(profile => [profile.id, profile]));
const categories = [
    ["field", "Field value", "#E8F5E9", "At or above threshold"],
    ["table", "Table value", "#E8F1FF", "At or above threshold"],
    ["lowField", "Low-confidence field", "#FCE8E6", "Below threshold"],
    ["lowTable", "Low-confidence table value", "#FFE8EC", "Below threshold"],
    ["unavailable", "Confidence unavailable", "#F1F3F5", "No score was supplied"],
];
const state = {
    profile: PROFILES[0], page: 1, zoom: 1, fit: "page", rotation: 0, selected: null, region: 0,
    threshold: 0.7, showFields: true, showTables: true, highlightLow: true,
    categories: Object.fromEntries(categories.map(([key]) => [key, true])), overlay: null,
};
// Same Fluent 16 Regular glyphs already licensed in the repository's third-party notices.
const pdfPath = "M2.5 10C3.32843 10 4 10.6716 4 11.5C4 12.3284 3.32843 13 2.5 13H2V14.5C2 14.7761 1.77614 15 1.5 15C1.22386 15 1 14.7761 1 14.5V10.5C1 10.2239 1.22386 10 1.5 10H2.5ZM2 12H2.5C2.77614 12 3 11.7761 3 11.5C3 11.2239 2.77614 11 2.5 11H2V12ZM6 10C6.82843 10 7.5 10.6716 7.5 11.5V13.5C7.5 14.3284 6.82843 15 6 15H5C4.72386 15 4.5 14.7761 4.5 14.5V10.5C4.5 10.2239 4.72386 10 5 10H6ZM5.5 14H6C6.27614 14 6.5 13.7761 6.5 13.5V11.5C6.5 11.2239 6.27614 11 6 11H5.5V14ZM11 10C11.2761 10 11.5 10.2239 11.5 10.5C11.5 10.7761 11.2761 11 11 11H9.5V12H10.5C10.7761 12 11 12.2239 11 12.5C11 12.7761 10.7761 13 10.5 13H9.5V14.5C9.5 14.7761 9.27614 15 9 15C8.72386 15 8.5 14.7761 8.5 14.5V10.5C8.5 10.2239 8.72386 10 9 10H11ZM9.58984 1C9.97984 1 10.3704 1.16043 10.6504 1.44043L13.5596 4.34961C13.8396 4.62961 14 5.02016 14 5.41016V13C14 14.1 13.1 15 12 15H10.4131C10.4685 14.8435 10.5 14.6755 10.5 14.5V14H12C12.55 14 13 13.55 13 13V6H10.5C9.67 6 9 5.33 9 4.5V2H6C5.45 2 5 2.45 5 3V9C4.61513 9 4.26547 9.1464 4 9.38477V3C4 1.9 4.9 1 6 1H9.58984ZM10 4.5C10 4.78 10.22 5 10.5 5H12.79L10 2.20996V4.5Z";
const imagePath = "M11.5 5.50207C11.5 6.0555 11.0514 6.50414 10.4979 6.50414C9.94449 6.50414 9.49585 6.0555 9.49585 5.50207C9.49585 4.94864 9.94449 4.5 10.4979 4.5C11.0514 4.5 11.5 4.94864 11.5 5.50207ZM2 4.5C2 3.11929 3.11929 2 4.5 2H11.5C12.8807 2 14 3.11929 14 4.5V11.5C14 12.8807 12.8807 14 11.5 14H4.5C3.11929 14 2 12.8807 2 11.5V4.5ZM4.5 3C3.67157 3 3 3.67157 3 4.5V11.5C3 11.7316 3.05248 11.9509 3.1462 12.1467L6.79796 8.49499C7.46185 7.8311 8.53823 7.8311 9.20212 8.49499L12.8538 12.1467C12.9475 11.9509 13 11.7316 13 11.5V4.5C13 3.67157 12.3284 3 11.5 3H4.5ZM12.1467 12.8538L8.49501 9.2021C8.22164 8.92873 7.77843 8.92873 7.50506 9.2021L3.85333 12.8538C4.04914 12.9475 4.26844 13 4.5 13H11.5C11.7316 13 11.9509 12.9475 12.1467 12.8538Z";

function selection() {
    return state.selected ? sourceSelection(state.selected, state.page) : { fields: [], regions: [], pages: [] };
}

function closePanel(restore = false) {
    const previous = state.overlay;
    state.overlay = null;
    for (const name of ["settings", "legend"]) {
        byId(`${name}-panel`).hidden = true;
        byId(`${name}-button`).setAttribute("aria-expanded", "false");
    }
    if (restore && previous) byId(`${previous}-button`).focus({ preventScroll: true });
}

function togglePanel(name) {
    const wasOpen = state.overlay === name;
    closePanel();
    if (wasOpen) return;
    state.overlay = name;
    byId(`${name}-panel`).hidden = false;
    byId(`${name}-button`).setAttribute("aria-expanded", "true");
    byId(`${name}-panel`).querySelector(name === "settings" ? "input" : "button").focus({ preventScroll: true });
}

function renderStatus() {
    const selected = selection(), group = state.selected && state.selected.kind !== "value";
    const multiple = !group && selected.regions.length > 1;
    byId("source-status").hidden = !state.selected;
    byId("region-navigation").hidden = !multiple;
    byId("group-count").hidden = !group;
    byId("group-page").hidden = !group || selected.pages.length <= 1;
    const regionsHere = selected.regions.filter(item => item.region.page === state.page).length;
    const label = state.selected?.name ?? "";
    const detail = group ? `${selected.fields.length} fields - ${regionsHere} regions on p.${state.page}` :
        `${regionsHere} regions on p.${state.page} - Location ${state.region + 1} of ${selected.regions.length}`;
    byId("selection-name").textContent = selected.regions.length ? label : `${label}: no source region`;
    byId("selection-name").title = selected.regions.length ? `${label}: ${detail}` : byId("selection-name").textContent;
    byId("selection-description").textContent = selected.regions.length ? `${label}: ${detail}` : byId("selection-name").textContent;
    byId("group-count").textContent = `${selected.fields.length} fields`;
    byId("group-count").title = detail;
    byId("group-page").replaceChildren(...selected.pages.map(page => new Option(`Page ${page}`, String(page))));
    byId("group-page").value = String(state.page);
    byId("group-page").title = detail;
    byId("location").textContent = `${state.region + 1} / ${selected.regions.length}`;
    byId("location").title = detail;
    byId("previous-region").disabled = state.region <= 0;
    byId("next-region").disabled = state.region >= selected.regions.length - 1;
}

function renderLegend() {
    for (const [key, label, , normalDescription] of categories) {
        const table = key === "table" || key === "lowTable", low = key.startsWith("low");
        const reason = key === "unavailable" ? !state.showFields && !state.showTables ? "Enable field or table highlights in settings." : "" :
            !(table ? state.showTables : state.showFields) ? `Enable Show ${table ? "table" : "field"} highlights in settings.` :
                low && !state.highlightLow ? "Enable Show low confidence highlight in settings." : "";
        const button = byId(`category-${key}`);
        button.disabled = Boolean(reason);
        button.setAttribute("aria-pressed", String(state.categories[key]));
        const description = !state.highlightLow && (key === "field" || key === "table") ?
            "All scored values while low-confidence highlight is off" : normalDescription;
        button.querySelector("small").textContent = reason || description;
        button.title = `${label}. ${description}. ${reason || "Toggle this category of source highlights."}`;
    }
}

function renderDocument() {
    const size = state.profile.pages[state.page - 1];
    if (!size) throw new Error("The requested prototype page is not present.");
    const width = state.rotation % 180 ? size.height : size.width, height = state.rotation % 180 ? size.width : size.height;
    if (state.fit) state.zoom = Math.min(3, state.fit === "width" ? (viewport.clientWidth - 64) / width :
        Math.min((viewport.clientWidth - 64) / width, (viewport.clientHeight - 60) / height));
    const transform = ["", `translate(${size.height} 0) rotate(90)`, `translate(${size.width} ${size.height}) rotate(180)`,
        `translate(0 ${size.width}) rotate(270)`][state.rotation / 90];
    const selected = new Set(selection().fields.map(field => field.id));
    const values = leafFields(state.profile.fields).map(field => field.regions.filter(region => region.page === state.page).map((region, index) => {
        const table = field.extraction === "table", low = field.confidence !== undefined && field.confidence < state.threshold && state.highlightLow;
        const key = field.confidence === undefined ? "unavailable" : low ? table ? "lowTable" : "lowField" : table ? "table" : "field";
        const color = categories.find(([name]) => name === key)[2];
        const fill = (table ? state.showTables : state.showFields) && state.categories[key] ? color : "transparent";
        const text = field.sourceTexts?.[index] ?? field.sourceText ?? displayValue(field);
        return `<g class="source-value" data-field="${escapeHtml(field.id)}">
            <rect class="source-fill" x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" fill="${fill}"/>
            <text x="${region.x + 2}" y="${region.y + region.height * 0.76}" fill="#243447" font-family="Arial, sans-serif"
                font-size="${field.fontSize ?? 12}" font-weight="${field.fontWeight ?? 400}">${escapeHtml(text)}</text>
            ${selected.has(field.id) ? `<rect class="selection-outline" x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}"/>` : ""}
        </g>`;
    }).join("")).join("");
    paper.style.width = `${width * state.zoom}px`;
    paper.style.height = `${height * state.zoom}px`;
    paper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Synthetic ${state.profile.kind} document page ${state.page}">
        <g transform="${transform}">${documentBase(state.profile, state.page)}${values}</g></svg>`;
    byId("zoom").querySelector('[value="current"]').textContent = `${Math.round(state.zoom * 100)}%`;
    byId("zoom").value = "current";
    byId("zoom").title = state.fit ? `Fit ${state.fit}` : "Manual zoom";
    byId("zoom-in").disabled = state.zoom >= 3;
    byId("zoom-out").disabled = state.zoom <= 0.25;
    const image = state.profile.kind === "image";
    for (const id of ["previous-page", "page-number", "page-total", "next-page"]) byId(id).hidden = image;
    byId("image-navigation").hidden = !image;
    byId("page-number").value = String(state.page);
    byId("page-total").textContent = `/ ${state.profile.pages.length}`;
    byId("previous-page").disabled = state.page === 1;
    byId("next-page").disabled = state.page === state.profile.pages.length;
    renderStatus();
    renderLegend();
}

function setPage(number) {
    state.page = number;
    byId("page-error").hidden = true;
    byId("page-number").setAttribute("aria-invalid", "false");
    renderDocument();
    viewport.scrollTo(0, 0);
}

function setZoom(value, pointer) {
    const frame = paper.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
    const anchor = pointer ?? { x: bounds.x + viewport.clientWidth / 2, y: bounds.y + viewport.clientHeight / 2 };
    const fraction = { x: (anchor.x - frame.x) / frame.width, y: (anchor.y - frame.y) / frame.height };
    state.fit = null; state.zoom = Math.max(0.25, Math.min(3, value));
    renderDocument();
    const next = paper.getBoundingClientRect();
    viewport.scrollLeft += next.x + fraction.x * next.width - anchor.x;
    viewport.scrollTop += next.y + fraction.y * next.height - anchor.y;
}

function chooseExample() {
    const fields = leafFields(state.profile.fields), choice = byId("example").value;
    state.region = 0;
    state.selected = choice === "none" ? null : choice === "ungrounded" ? fields.find(field => !field.regions.length && !field.missing) :
        choice === "multiple" ? fields.find(field => field.regions.length > 1) ?? fields[0] : choice === "group" ?
            { id: "/prototype-group", name: `${state.profile.id === "invoice" ? "Invoice" : "Receipt"}DetailsWithLongGroupedFieldName`,
                kind: "object", children: state.profile.fields.slice(0, 4) } :
            fields.find(field => field.id === "/VendorName") ?? fields[0];
    if (state.selected) {
        const pages = selection().pages;
        if (pages.length && !pages.includes(state.page)) state.page = pages[0];
    }
    renderDocument();
}

for (const [key, label, color] of categories) {
    const item = document.createElement("li");
    item.innerHTML = `<button type="button" id="category-${key}" class="legend-category" aria-label="${label}" aria-pressed="true">
        <span class="swatch" aria-hidden="true" style="background:${color}"></span><span><strong>${label}</strong><small></small></span></button>`;
    byId("legend-items").append(item);
    item.querySelector("button").addEventListener("click", () => { state.categories[key] = !state.categories[key]; renderDocument(); });
}
for (const button of document.querySelectorAll("[data-width]")) button.addEventListener("click", () => {
    document.querySelector(".source-pane").style.setProperty("--source-width", `${button.dataset.width}px`);
    byId("width-caption").textContent = `${button.dataset.width}px source pane`;
    for (const control of document.querySelectorAll("[data-width]")) control.setAttribute("aria-pressed", String(control === button));
});
byId("height").addEventListener("change", event => document.querySelector(".source-pane").style.setProperty("--source-height", `${event.target.value}px`));
function renderFilename() {
    const filename = byId("long-name").checked ? `customer-financial-documents-final-review-copy-2026-11-03.${state.profile.kind === "pdf" ? "pdf" : "png"}` : state.profile.name;
    byId("filename").textContent = filename;
    byId("filename").title = `${filename} - ${state.profile.kind === "pdf" ? `${state.profile.pages.length} pages` : "Image - single page"}`;
    byId("file-icon").classList.toggle("image", state.profile.kind === "image");
    byId("file-icon").innerHTML = `<svg viewBox="0 0 16 16" focusable="false"><path d="${state.profile.kind === "pdf" ? pdfPath : imagePath}"/></svg>`;
}
byId("sample").addEventListener("change", event => {
    const profile = profiles.get(event.target.value);
    if (!profile) throw new Error("Unknown prototype document.");
    closePanel(); state.profile = profile; state.page = 1; state.rotation = 0; state.fit = "page";
    const hasUngrounded = leafFields(profile.fields).some(field => !field.regions.length && !field.missing);
    byId("example").querySelector('[value="ungrounded"]').disabled = !hasUngrounded;
    if (!hasUngrounded && byId("example").value === "ungrounded") byId("example").value = "none";
    renderFilename(); chooseExample(); viewport.scrollTo(0, 0);
});
byId("long-name").addEventListener("change", renderFilename);
byId("example").addEventListener("change", chooseExample);
byId("previous-page").addEventListener("click", () => setPage(state.page - 1));
byId("next-page").addEventListener("click", () => setPage(state.page + 1));
byId("page-number").addEventListener("change", event => {
    const valid = /^[1-9]\d*$/.test(event.target.value) && Number(event.target.value) <= state.profile.pages.length;
    byId("page-error").hidden = valid;
    event.target.setAttribute("aria-invalid", String(!valid));
    if (valid) setPage(Number(event.target.value));
});
byId("page-number").addEventListener("keydown", event => {
    if (event.key === "Enter") event.currentTarget.dispatchEvent(new Event("change"));
});
for (const [id, delta] of [["previous-region", -1], ["next-region", 1]]) byId(id).addEventListener("click", () => {
    state.region += delta;
    setPage(selection().regions[state.region].region.page);
    (byId(id).disabled ? byId(delta === 1 ? "previous-region" : "next-region") : byId(id)).focus({ preventScroll: true });
});
byId("group-page").addEventListener("change", event => setPage(Number(event.target.value)));
byId("zoom-out").addEventListener("click", () => setZoom(state.zoom / 1.25));
byId("zoom-in").addEventListener("click", () => setZoom(state.zoom * 1.25));
byId("zoom").addEventListener("change", event => {
    if (["page", "width"].includes(event.target.value)) { state.fit = event.target.value; renderDocument(); viewport.scrollTo(0, 0); }
    else setZoom(Number(event.target.value));
});
byId("rotate").addEventListener("click", () => { state.rotation = (state.rotation + 90) % 360; renderDocument(); viewport.scrollTo(0, 0); });
viewport.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    setZoom(state.zoom * Math.exp(-delta * 0.0015), { x: event.clientX, y: event.clientY });
}, { passive: false });
viewport.addEventListener("click", event => {
    const id = event.target.closest("[data-field]")?.dataset.field;
    state.selected = id ? leafFields(state.profile.fields).find(field => field.id === id) : null;
    state.region = 0;
    byId("example").value = state.selected ? state.selected.regions.length > 1 ? "multiple" : "single" : "none";
    renderDocument();
});
for (const name of ["settings", "legend"]) byId(`${name}-button`).addEventListener("click", () => togglePanel(name));
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => closePanel(true));
document.addEventListener("pointerdown", event => {
    if (state.overlay && !byId(`${state.overlay}-panel`).contains(event.target) &&
        !byId(`${state.overlay}-button`).contains(event.target)) closePanel();
});
document.addEventListener("focusin", event => {
    if (state.overlay && !byId(`${state.overlay}-panel`).contains(event.target) &&
        !byId(`${state.overlay}-button`).contains(event.target)) closePanel();
});
document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (state.overlay) closePanel(true);
    else { state.selected = null; state.region = 0; byId("example").value = "none"; byId("page-error").hidden = true; renderDocument(); }
});
byId("threshold").addEventListener("input", event => {
    const value = Number(event.target.value), valid = event.target.value.trim() !== "" && validThreshold(value);
    event.target.setAttribute("aria-invalid", String(!valid));
    byId("threshold-error").hidden = valid;
    if (!valid) return;
    state.threshold = value;
    byId("threshold-hint").querySelector("strong").textContent = formatThreshold(value);
    renderDocument();
});
for (const [id, key] of [["show-fields", "showFields"], ["show-tables", "showTables"], ["highlight-low", "highlightLow"]]) {
    byId(id).addEventListener("change", event => { state[key] = event.target.checked; renderDocument(); });
}
window.addEventListener("error", event => {
    byId("prototype-error").textContent = `Prototype error: ${event.message}`;
    byId("prototype-error").hidden = false;
});
new ResizeObserver(() => { if (state.fit) renderDocument(); }).observe(viewport);
renderFilename();
renderDocument();
