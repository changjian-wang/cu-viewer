import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { LoadedSource } from "../source/source";
import type { ReviewSettings } from "../interaction/reviewFields";
import { HighlightSettings } from "./HighlightSettings";
import { HighlightLegend } from "./HighlightLegend";
import { getFileIconName, ViewerIcon } from "./ViewerIcon";

export function SourceToolbar({ source, toolbarRef, settings, summaryId, onSettings, onControlFocus, children, labelMode = false,
    fieldReview = false, comparisonAvailable = false }: {
    labelMode?: boolean;
    fieldReview?: boolean;
    comparisonAvailable?: boolean;
    source: LoadedSource | null;
    toolbarRef: RefObject<HTMLElement | null>; settings: ReviewSettings; onSettings: (settings: ReviewSettings) => void;
    summaryId: string;
    onControlFocus: (target?: HTMLElement) => void;
    children?: ReactNode;
}) {
    const id = useId();
    const [overlay, setOverlay] = useState<"settings" | "legend" | null>(null);
    useEffect(() => { setOverlay(null); }, [labelMode]);
    const settingsButton = useRef<HTMLButtonElement>(null), legendButton = useRef<HTMLButtonElement>(null);
    const close = (restore: boolean): void => {
        if (restore) (overlay === "legend" ? legendButton : settingsButton).current?.focus({ preventScroll: true });
        setOverlay(null);
    };
    const image = source?.kind === "image" ? source.pages[0] : undefined;
    const summary = source ? `${source.name} · ${image ? `${image.width} × ${image.height} px` : `PDF · ${source.pages.length} pages`}` : "Source document";
    const fileIcon = getFileIconName(source?.name);
    return <>
        <footer className="cu-source-toolbar cu-source-toolbar-bottom" role="group" aria-label="Source document toolbar"
            ref={toolbarRef} onClickCapture={() => onControlFocus()}
            onKeyDown={event => {
                if (event.key === "Escape" && overlay) { event.preventDefault(); event.stopPropagation(); close(true); }
            }}>
            <div className="cu-source-identity">
                <div className="cu-source-file-info">
                    <div className="cu-file-name"><span className="cu-file-icon" aria-hidden="true" data-file-icon={fileIcon}><ViewerIcon name={fileIcon} /></span>
                        <strong title={summary}>{source?.name ?? "Source document"}</strong></div>
                </div>
            </div>
            <span className="cu-visually-hidden" id={summaryId} aria-label="Source information">{summary}</span>
            {children}
            <div className="cu-source-utilities">
                <HighlightLegend id={`${id}-legend`} buttonRef={legendButton} settings={settings} onChange={onSettings} open={overlay === "legend"}
                    labelMode={labelMode}
                    fieldReview={fieldReview} comparisonAvailable={comparisonAvailable}
                    onToggle={() => setOverlay(overlay === "legend" ? null : "legend")} onClose={close} />
                {!labelMode && <button type="button" className="cu-icon-button" ref={settingsButton} aria-label="Source settings" aria-haspopup="dialog"
                    title="Source settings" aria-expanded={overlay === "settings"} onClick={() => setOverlay(overlay === "settings" ? null : "settings")}><ViewerIcon name="settings" /></button>}
            </div>
            {!labelMode && overlay === "settings" && settingsButton.current && <HighlightSettings anchor={settingsButton.current}
                settings={settings} onChange={onSettings} onClose={close} />}
        </footer>
    </>;
}
