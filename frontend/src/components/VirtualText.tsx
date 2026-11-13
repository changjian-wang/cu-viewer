import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MARKDOWN_FRAGMENT_CHARACTERS, textBoundary } from "../markdown/model";

export function VirtualText({ text, label, className, viewportRef, renderText }: {
    text: string; label: string; className: string; viewportRef?: RefObject<HTMLDivElement | null>;
    renderText?: (text: string, offset: number) => ReactNode;
}) {
    const ownViewport = useRef<HTMLDivElement>(null);
    const scroll = viewportRef ?? ownViewport;
    const count = Math.max(1, Math.ceil(text.length / MARKDOWN_FRAGMENT_CHARACTERS));
    const segment = (index: number): string => {
        const start = textBoundary(text, index * MARKDOWN_FRAGMENT_CHARACTERS);
        const end = textBoundary(text, Math.min(text.length, (index + 1) * MARKDOWN_FRAGMENT_CHARACTERS));
        return text.slice(start, end);
    };
    const content = (index: number): ReactNode => {
        const fragment = segment(index);
        return renderText ? renderText(fragment, textBoundary(text, index * MARKDOWN_FRAGMENT_CHARACTERS)) : fragment;
    };
    const virtualizer = useVirtualizer<HTMLDivElement, HTMLPreElement>({
        count,
        getScrollElement: () => scroll.current,
        estimateSize: index => Math.max(32, segment(index).split("\n")
            .reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / 75)), 0) * 20),
        overscan: 1,
        useAnimationFrameWithResizeObserver: true,
    });
    return <div ref={scroll} className="cu-rich-result-scroll" role="region" aria-label={label} tabIndex={0}>
        {count === 1 ? <pre className={className}>{content(0)}</pre> :
            <div className="cu-virtual-text-space" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map(item => <pre key={item.index} ref={virtualizer.measureElement}
                    data-index={item.index} className={`${className} cu-virtual-text-block`}
                    style={{ transform: `translateY(${item.start}px)` }}>{content(item.index)}</pre>)}
            </div>}
    </div>;
}
