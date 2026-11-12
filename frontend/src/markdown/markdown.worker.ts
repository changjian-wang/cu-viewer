import { MarkdownWorkerHost } from "./workerHost";

const host = new MarkdownWorkerHost(response => self.postMessage(response));
self.addEventListener("message", (event: MessageEvent<unknown>) => {
    void host.handle(event.data);
});
