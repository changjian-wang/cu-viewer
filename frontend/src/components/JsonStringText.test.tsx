// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { JsonStringText } from "./JsonStringText";

afterEach(cleanup);

describe("JSON string syntax colors", () => {
    it("colors HTML and comments as text, with escapes taking precedence inside quoted attributes", () => {
        const literal = JSON.stringify('<table title="2 > 1"><tr><td>A</td></tr></table><!-- PageBreak -->\r\n\t"quoted" C:\\temp');
        const { container } = render(<JsonStringText text={literal} />);
        expect(screen.getByRole("region", { name: "Full JSON string" }).textContent).toBe(literal);
        const tags = [...container.querySelectorAll(".cu-json-syntax-tag")].map(node => node.textContent);
        expect(tags).toContain("<table title=");
        expect(tags).toContain("2 > 1");
        expect(tags.join("")).toContain("</table><!-- PageBreak -->");
        const escapes = [...container.querySelectorAll(".cu-json-syntax-escape")].map(node => node.textContent).join("");
        for (const escape of ['\\"', "\\r", "\\n", "\\t", "\\\\"]) expect(escapes).toContain(escape);
        expect(container.querySelector("table, tr, td")).toBeNull();
    });

    it.each([
        ["\n", "\\n"],
        [String.raw`\n`, "\\\\"],
        ["\ud800", "\\ud800"],
    ])("recognizes escape boundaries in %j without changing the displayed literal", (value, escape) => {
        const literal = JSON.stringify(value);
        const { container } = render(<JsonStringText text={literal} />);
        expect(container.querySelector(".cu-json-syntax-escape")?.textContent).toBe(escape);
        expect(screen.getByRole("region", { name: "Full JSON string" }).textContent).toBe(literal);
    });

    it("leaves comparisons and incomplete tags intact while recovering at a nested tag", () => {
        const literal = JSON.stringify("1 < 2; <broken <b>safe</b> <unfinished");
        const { container } = render(<JsonStringText text={literal} />);
        expect([...container.querySelectorAll(".cu-json-syntax-tag")].map(node => node.textContent)).toEqual(["<b>", "</b>"]);
        expect(screen.getByRole("region", { name: "Full JSON string" }).textContent).toBe(literal);
    });
});
