import type { ReactNode } from "react";

const icons = {
    file: <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v6h5" />,
    left: <path d="m14 6-6 6 6 6" />,
    right: <path d="m10 6 6 6-6 6" />,
    down: <path d="m6 9 6 6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    locate: <><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M12 2v6M12 16v6M2 12h6M16 12h6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    grip: <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" strokeWidth="3.5" />,
    rotate: <path d="M19 8a8 8 0 1 0 1 8M19 3v5h-5" />,
    reset: <path d="M5 8a8 8 0 1 1-1 8M5 3v5h5" />,
    gauge: <><path d="M5 19a10 10 0 1 1 14 0M12 14l4-4" /><circle cx="12" cy="14" r="1.2" /></>,
    settings: <><path d="m9 3-.7 2.3-2 .9-2.2-.5L2.6 8.3l1.5 1.9v2.3l-1.5 1.9 1.5 2.6 2.4-.4 1.9 1.1.6 2.3h3l.7-2.3 2-.9 2.2.5 1.5-2.6-1.5-1.9v-2.3l1.5-1.9L19 6l-2.4.4-1.9-1.1L14 3z" transform="translate(1 0)" /><circle cx="12" cy="11.5" r="3" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
} satisfies Record<string, ReactNode>;

export type ViewerIconName = keyof typeof icons;

export function ViewerIcon({ name }: { name: ViewerIconName }) {
    return <svg className="cu-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name]}</svg>;
}
