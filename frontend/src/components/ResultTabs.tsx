import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ResultTab, ResultView } from "../model/resultViews";

interface ResultTabsProps {
    tabs: readonly ResultTab[];
    view: ResultView | undefined;
    baseId: string;
    panelId: string;
    onViewChange: (view: ResultView) => void;
}

function displayedTabs(tabs: readonly ResultTab[], view: ResultView | undefined, count: number): ResultTab[] {
    const shown = tabs.slice(0, Math.max(1, count));
    const active = tabs.find(tab => tab.id === view);
    if (active && !shown.includes(active)) shown[shown.length - 1] = active;
    return shown;
}

function focusTab(tab: HTMLButtonElement | null | undefined): void {
    if (!tab) return;
    tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function ResultTabs({ tabs, view, baseId, panelId, onViewChange }: ResultTabsProps) {
    const bar = useRef<HTMLElement>(null);
    const more = useRef<HTMLButtonElement>(null);
    const tabRefs = useRef<Partial<Record<ResultView, HTMLButtonElement | null>>>({});
    const menuRefs = useRef<Partial<Record<ResultView, HTMLButtonElement | null>>>({});
    const focusedTab = useRef<ResultView | undefined>(undefined);
    const focusRequested = useRef(false);
    const menuStart = useRef<"first" | "last">("first");
    const [visibleCount, setVisibleCount] = useState(tabs.length);
    const [menuOpen, setMenuOpen] = useState(false);
    const shown = useMemo(() => displayedTabs(tabs, view, visibleCount), [tabs, view, visibleCount]);
    const overflow = useMemo(() => tabs.filter(tab => !shown.includes(tab)), [tabs, shown]);
    const menuId = `${baseId}-more-menu`;

    useLayoutEffect(() => {
        const element = bar.current;
        const trigger = more.current;
        if (!element || !trigger) return;
        const measure = (): void => {
            const width = element.getBoundingClientRect().width;
            if (width === 0) return;
            const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
            const widths = new Map(tabs.map(tab => {
                const button = tabRefs.current[tab.id];
                if (!button) throw new Error(`The ${tab.label} result tab is unavailable for measurement.`);
                return [tab, button.getBoundingClientRect().width] as const;
            }));
            const totalWidth = (values: readonly ResultTab[]): number =>
                values.reduce((total, tab) => total + widths.get(tab)!, 0) + Math.max(0, values.length - 1) * gap;
            let count = tabs.length;
            if (totalWidth(tabs) > width) {
                const menuWidth = trigger.getBoundingClientRect().width + gap;
                do {
                    count -= 1;
                } while (count > 1 && totalWidth(displayedTabs(tabs, view, count)) + menuWidth > width);
            }
            setVisibleCount(count);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        observer.observe(trigger);
        for (const tab of Object.values(tabRefs.current)) {
            if (tab) observer.observe(tab);
        }
        return () => observer.disconnect();
    }, [tabs, view]);

    useLayoutEffect(() => {
        if (view && (focusRequested.current || (focusedTab.current && focusedTab.current !== view))) {
            focusTab(tabRefs.current[view]);
            focusRequested.current = false;
        }
    }, [view]);

    useLayoutEffect(() => {
        if (!menuOpen) return;
        const item = menuStart.current === "last" ? overflow.at(-1) : overflow[0];
        if (item) menuRefs.current[item.id]?.focus();
        else {
            setMenuOpen(false);
            if (view) focusTab(tabRefs.current[view]);
        }
    }, [menuOpen, overflow, view]);

    useEffect(() => {
        if (!menuOpen) return;
        const document = bar.current?.ownerDocument;
        if (!document) return;
        const dismiss = (event: PointerEvent): void => {
            if (event.target instanceof Node && !bar.current?.contains(event.target)) setMenuOpen(false);
        };
        document.addEventListener("pointerdown", dismiss);
        return () => document.removeEventListener("pointerdown", dismiss);
    }, [menuOpen]);

    const selectView = (next: ResultView): void => {
        setMenuOpen(false);
        focusRequested.current = next !== view;
        onViewChange(next);
        if (next === view) focusTab(tabRefs.current[next]);
    };
    const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ResultView): void => {
        const index = tabs.findIndex(tab => tab.id === current);
        let next: ResultTab | undefined;
        if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
        else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === "Home") next = tabs[0];
        else if (event.key === "End") next = tabs.at(-1);
        if (!next) return;
        event.preventDefault();
        selectView(next.id);
    };
    const onMenuKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ResultView): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen(false);
            more.current?.focus();
            return;
        }
        const index = overflow.findIndex(tab => tab.id === current);
        let next: ResultTab | undefined;
        if (event.key === "ArrowDown") next = overflow[(index + 1) % overflow.length];
        else if (event.key === "ArrowUp") next = overflow[(index - 1 + overflow.length) % overflow.length];
        else if (event.key === "Home") next = overflow[0];
        else if (event.key === "End") next = overflow.at(-1);
        if (!next) return;
        event.preventDefault();
        menuRefs.current[next.id]?.focus();
    };

    return <header className="cu-result-tabs" ref={bar} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
    }}>
        <div className="cu-result-tablist" role="tablist" aria-label="Result views">
            {tabs.map(tab => <button
                key={tab.id}
                ref={element => { tabRefs.current[tab.id] = element; }}
                id={`${baseId}-${tab.id}`}
                type="button"
                role="tab"
                aria-controls={panelId}
                aria-selected={view === tab.id}
                aria-hidden={shown.includes(tab) ? undefined : true}
                tabIndex={view === tab.id ? 0 : -1}
                className={[view === tab.id ? "is-active" : "", shown.includes(tab) ? "" : "cu-result-tab-hidden"].filter(Boolean).join(" ") || undefined}
                onClick={() => selectView(tab.id)}
                onKeyDown={event => onTabKeyDown(event, tab.id)}
                onFocus={() => { focusedTab.current = tab.id; }}
                onBlur={() => { focusedTab.current = undefined; }}
            >{tab.label}</button>)}
        </div>
        <div className={`cu-result-tab-overflow${overflow.length ? "" : " cu-result-tab-hidden"}`}
            aria-hidden={overflow.length ? undefined : true}>
            <button
                ref={more}
                id={`${baseId}-more`}
                type="button"
                className="cu-result-tab-more"
                aria-label="More result views"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                onClick={() => { menuStart.current = "first"; setMenuOpen(open => !open); }}
                onKeyDown={event => {
                    if (event.key === "Escape" && menuOpen) {
                        event.preventDefault();
                        event.stopPropagation();
                        setMenuOpen(false);
                        return;
                    }
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    menuStart.current = event.key === "ArrowUp" ? "last" : "first";
                    if (menuOpen) {
                        const item = menuStart.current === "last" ? overflow.at(-1) : overflow[0];
                        if (item) menuRefs.current[item.id]?.focus();
                    } else setMenuOpen(true);
                }}
            ><span aria-hidden="true">...</span></button>
            {menuOpen && overflow.length > 0 && <div
                id={menuId} className="cu-result-tab-menu" role="menu" aria-labelledby={`${baseId}-more`}
            >
                {overflow.map(tab => <button key={tab.id} type="button" role="menuitem" tabIndex={-1}
                    ref={element => { menuRefs.current[tab.id] = element; }}
                    onClick={() => selectView(tab.id)}
                    onKeyDown={event => onMenuKeyDown(event, tab.id)}
                >{tab.label}</button>)}
            </div>}
        </div>
    </header>;
}
