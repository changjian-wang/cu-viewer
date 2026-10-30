import { useId, useRef, useState } from "react";
import type { RefObject } from "react";
import type { LoadedSource } from "../source/source";
import type { ReviewSettings } from "../interaction/reviewFields";
import { HighlightSettings } from "./HighlightSettings";
import { HighlightLegend } from "./HighlightLegend";
import { getFileIconName, ViewerIcon } from "./ViewerIcon";

export function SourceToolbar({ source, toolbarRef, settings, summaryId, onSettings, onControlFocus }: {
    source: LoadedSource | null;
    toolbarRef: RefObject<HTMLElement | null>; settings: ReviewSettings; onSettings: (settings: ReviewSettings) => void;
    summaryId: string;
    onControlFocus: (target?: HTMLElement) => void;
}) {
    const id = useId();
    const [overlay, setOverlay] = useState<"settings" | "legend" | null>(null);
    const settingsButton = useRef<HTMLButtonElement>(null), legendButton = useRef<HTMLButtonElement>(null);
    const close = (restore: boolean): void => {
        if (restore) (overlay === "legend" ? legendButton : settingsButton).current?.focus({ preventScroll: true });
        setOverlay(null);
    };
    const image = source?.kind === "image" ? source.pages[0] : undefined;
    const summary = source ? `${source.name} · ${image ? `${image.width} × ${image.height} px` : `PDF · ${source.pages.length} pages`}` : "Source document";
    const fileIcon = getFileIconName(source?.name);
    return <>
        <header className="cu-source-toolbar" ref={toolbarRef} onClickCapture={() => onControlFocus()}
            onKeyDown={event => {
                if (event.key === "Escape" && overlay) { event.preventDefault(); event.stopPropagation(); close(true); }
            }}>
            <div className="cu-file-name"><span className="cu-file-icon" aria-hidden="true" data-file-icon={fileIcon}><ViewerIcon name={fileIcon} /></span>
                <strong title={summary}>{source?.name ?? "Source document"}</strong></div>
            <span className="cu-visually-hidden" id={summaryId} aria-label="Source information">{summary}</span>
            <HighlightLegend id={`${id}-legend`} buttonRef={legendButton} settings={settings} onChange={onSettings} open={overlay === "legend"}
                onToggle={() => setOverlay(overlay === "legend" ? null : "legend")} onClose={close} />
            <div className="cu-source-actions">
                <button type="button" className="cu-icon-button" ref={settingsButton} aria-label="Highlighting settings" aria-haspopup="dialog"
                    aria-expanded={overlay === "settings"} onClick={() => setOverlay(overlay === "settings" ? null : "settings")}><ViewerIcon name="settings" /></button>
            </div>
        </header>
        {overlay === "settings" && settingsButton.current && <HighlightSettings anchor={settingsButton.current}
            settings={settings} onChange={onSettings} onClose={close} />}
    </>;
}
