import type { CuApiVersion } from "./types";

export type CodeLanguage = "python" | "csharp" | "javascript";

export function codeSample(language: CodeLanguage, analyzerId: string, apiVersion: CuApiVersion): string {
    if (!analyzerId.trim()) throw new Error("Code samples require a nonempty analyzer ID.");
    const analyzer = JSON.stringify(analyzerId);
    const version = JSON.stringify(apiVersion);
    const preview = apiVersion === "2026-06-01-preview";
    if (language === "python") return `# Install: python -m pip install azure-ai-contentunderstanding==${preview ? "1.2.0b3" : "1.1.0"} azure-identity
import json
from azure.ai.contentunderstanding import ContentUnderstandingClient
from azure.ai.contentunderstanding.models import AnalysisInput
from azure.core.credentials import AzureKeyCredential
from azure.identity import DefaultAzureCredential

endpoint = "{{CONTENT_UNDERSTANDING_ENDPOINT}}"
key = "{{CONTENT_UNDERSTANDING_KEY}}"
file_url = "{{FILE_URL}}"
analyzer_id = ${analyzer}
api_version = ${version}

credential = AzureKeyCredential(key) if key and key != "{{CONTENT_UNDERSTANDING_KEY}}" else DefaultAzureCredential()
with ContentUnderstandingClient(endpoint=endpoint, credential=credential, api_version=api_version) as client:
    poller = client.begin_analyze(analyzer_id=analyzer_id, inputs=[AnalysisInput(url=file_url)])
    result = poller.result()
    print(json.dumps(result.as_dict(), indent=2))
`;
    if (language === "csharp") return `// Install: dotnet add package Azure.AI.ContentUnderstanding --version ${preview ? "1.2.0-beta.3" : "1.1.0"}
// Install: dotnet add package Azure.Identity
using System;
using Azure;
using Azure.AI.ContentUnderstanding;
using Azure.Identity;
using System.ClientModel.Primitives;

string endpoint = "{{CONTENT_UNDERSTANDING_ENDPOINT}}";
string key = "{{CONTENT_UNDERSTANDING_KEY}}";
string fileUrl = "{{FILE_URL}}";
string analyzerId = ${analyzer};
var options = new ContentUnderstandingClientOptions(
    ContentUnderstandingClientOptions.ServiceVersion.${preview ? "V2026_06_01_Preview" : "V2025_11_01"});
var client = key.Length > 0 && key != "{{CONTENT_UNDERSTANDING_KEY}}"
    ? new ContentUnderstandingClient(new Uri(endpoint), new AzureKeyCredential(key), options)
    : new ContentUnderstandingClient(new Uri(endpoint), new DefaultAzureCredential(), options);

Operation<AnalysisResult> operation = await client.AnalyzeAsync(
    WaitUntil.Completed, analyzerId,
    inputs: new[] { new AnalysisInput { Uri = new Uri(fileUrl) } });
Console.WriteLine(ModelReaderWriter.Write(operation.Value).ToString());
`;
    return `// Install: npm install @azure/ai-content-understanding@${preview ? "1.2.0-beta.3" : "1.1.0"} @azure/identity @azure/core-auth
// Save as sample.mjs and run outside the Viewer.
import { ContentUnderstandingClient } from "@azure/ai-content-understanding";
import { AzureKeyCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";

const endpoint = "{{CONTENT_UNDERSTANDING_ENDPOINT}}";
const key = "{{CONTENT_UNDERSTANDING_KEY}}";
const fileUrl = "{{FILE_URL}}";
const analyzerId = ${analyzer};
const apiVersion = ${version};
const credential = key && key !== "{{CONTENT_UNDERSTANDING_KEY}}"
    ? new AzureKeyCredential(key) : new DefaultAzureCredential();
const client = new ContentUnderstandingClient(endpoint, credential, { apiVersion });
const poller = client.analyze(analyzerId, [{ url: fileUrl }]);
const result = await poller.pollUntilDone();
console.log(JSON.stringify(result, null, 2));
`;
}
