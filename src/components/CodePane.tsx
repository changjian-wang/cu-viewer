import { useState } from "react";
import type { ReactNode } from "react";
import { createLowlight } from "lowlight";
import python from "highlight.js/lib/languages/python";
import csharp from "highlight.js/lib/languages/csharp";
import javascript from "highlight.js/lib/languages/javascript";
import { codeSample } from "../internal/codeSamples";
import type { CodeLanguage } from "../internal/codeSamples";
import type { CuApiVersion } from "../internal/types";
import { CopyButton } from "./CopyButton";

const languages: { id: CodeLanguage; label: string }[] = [
    { id: "python", label: "Python" }, { id: "csharp", label: "C#" }, { id: "javascript", label: "JavaScript" },
];

const highlighter = createLowlight({ python, csharp, javascript });
type SyntaxNode = ReturnType<typeof highlighter.highlight>["children"][number];

function syntaxNode(node: SyntaxNode, index: number): ReactNode {
    if (node.type === "text") return node.value;
    if (node.type !== "element" || node.tagName !== "span") throw new Error("Unsupported code highlighting node.");
    const classes = node.properties.className;
    const className = Array.isArray(classes) ? classes.filter(value => typeof value === "string").join(" ") : undefined;
    return <span key={index} className={className}>{node.children.map(syntaxNode)}</span>;
}

export function CodePane({ analyzerId, apiVersion }: { analyzerId: string; apiVersion: CuApiVersion }) {
    const [language, setLanguage] = useState<CodeLanguage>("python");
    const code = codeSample(language, analyzerId, apiVersion);
    const highlighted = highlighter.highlight(language, code);
    return <div className="cu-rich-result-scroll cu-code-pane">
        <h2>Analyze SDK example</h2>
        <p>Read-only example. Replace the endpoint, key and file URL placeholders and run it outside the Viewer. Nothing is executed here.</p>
        <div className="cu-code-controls">
            <div role="group" aria-label="Code language">{languages.map(item => <button
                key={item.id} type="button" aria-pressed={language === item.id}
                onClick={() => setLanguage(item.id)}>{item.label}</button>)}</div>
            <CopyButton value={code} label="Copy SDK sample" />
        </div>
        <pre aria-label={`${languages.find(item => item.id === language)?.label} SDK sample`}>
            <code>{highlighted.children.map(syntaxNode)}</code>
        </pre>
    </div>;
}
