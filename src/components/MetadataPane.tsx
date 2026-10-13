import { CopyButton } from "./CopyButton";

export function MetadataPane({ metadata }: { metadata: Readonly<Record<string, string>> }) {
    return <div className="cu-rich-result-scroll cu-metadata-pane">
        <table aria-label="Returned metadata">
            <thead><tr><th scope="col">Key</th><th scope="col">Value</th><th scope="col">Copy</th></tr></thead>
            <tbody>{Object.entries(metadata).map(([key, value]) => <tr key={key}>
                <th scope="row">{key}</th><td>{value === "" ? '"" (empty string)' : value}</td>
                <td><CopyButton value={value} label={`Copy metadata ${key}`} /></td>
            </tr>)}</tbody>
        </table>
    </div>;
}
