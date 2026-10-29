import { useRef, useState } from "react";

export function ResizeHandle({ label, value, min, max, step, defaultValue, onChange, className = "" }: {
    label: string; value: number; min: number; max: number; step: number; defaultValue: number;
    onChange: (value: number) => void; className?: string;
}) {
    const drag = useRef<{ start: number; value: number } | null>(null);
    const [active, setActive] = useState(false);
    const bound = (next: number): number => Math.min(max, Math.max(min, next));
    const finish = (): void => { drag.current = null; setActive(false); };
    return <div role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={Math.round(value)}
        aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} tabIndex={0}
        className={`cu-resizer ${className}${active ? " is-resizing" : ""}`}
        onDoubleClick={() => onChange(bound(defaultValue))}
        onKeyDown={event => {
            if (event.key === "Escape" && drag.current) {
                event.preventDefault(); event.stopPropagation();
                onChange(bound(drag.current.value)); finish();
            } else if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
                event.preventDefault(); event.stopPropagation();
                onChange(event.key === "Home" ? min : event.key === "End" ? max :
                    bound(value + (event.key === "ArrowLeft" ? -step : step)));
            }
        }}
        onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            drag.current = { start: event.clientX, value };
            event.currentTarget.setPointerCapture(event.pointerId);
            setActive(true);
        }}
        onPointerMove={event => {
            if (drag.current) onChange(bound(drag.current.value + event.clientX - drag.current.start));
        }}
        onPointerUp={finish} onLostPointerCapture={finish}
        onPointerCancel={() => { if (drag.current) onChange(bound(drag.current.value)); finish(); }}
    />;
}
