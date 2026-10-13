import type { Components, UrlTransform } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export const MAX_MARKDOWN_CHARACTERS = 1_000_000;

const safeUrlTransform: UrlTransform = (url, key) => {
    if (key !== "href") return null;
    const value = url.trim();
    if (value.startsWith("#")) return value;
    try {
        const protocol = new URL(value).protocol.toLowerCase();
        return protocol === "http:" || protocol === "https:" || protocol === "mailto:" ? value : null;
    } catch {
        return null;
    }
};

const markdownComponents = {
    a: ({ href, children }) => href
        ? <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
        : <span>{children}</span>,
    img: ({ alt }) => <span className="cu-markdown-image-omitted">Image omitted{alt ? `: ${alt}` : ""}</span>,
    table: ({ children }) => <div className="cu-markdown-table-scroll"><table>{children}</table></div>,
} satisfies Components;

interface MarkdownPaneProps {
    markdown: string | undefined;
}

export function MarkdownPane({ markdown }: MarkdownPaneProps) {
    if (markdown === undefined) {
        return <div className="cu-state">
            <h2>No Markdown returned</h2>
            <p>This content item does not include a nonempty Markdown result.</p>
        </div>;
    }
    if (markdown.length > MAX_MARKDOWN_CHARACTERS) {
        return <div className="cu-state cu-result-limit" role="alert">
            <h2>Markdown is too large to render</h2>
            <p>{markdown.length.toLocaleString("en-US")} characters exceeds the {MAX_MARKDOWN_CHARACTERS.toLocaleString("en-US")}-character viewer limit.</p>
        </div>;
    }
    if (markdown.trim().length === 0) {
        return <div className="cu-state">
            <h2>No Markdown returned</h2>
            <p>This content item does not include a nonempty Markdown result.</p>
        </div>;
    }
    return <div className="cu-rich-result-scroll">
        <article className="cu-markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeRaw, { tagfilter: true }], [rehypeSanitize, defaultSchema]]}
                components={markdownComponents}
                urlTransform={safeUrlTransform}
            >{markdown}</ReactMarkdown>
        </article>
    </div>;
}
