/**
 * The MCP server over HTTP on 127.0.0.1, for Studio's live sync (plan §4.2):
 * a random bearer token, Host-header validation (DNS rebinding), stateless
 * per-request servers (SDK v2 `createMcpHandler`). Studio hosts it; tests start it directly.
 */
import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer as createHttpServer } from "node:http";
import { createMcpHandler, hostHeaderValidationResponse, localhostAllowedHostnames } from "@modelcontextprotocol/server";
import { type ServerOptions, createServer } from "./server.js";

export interface HttpEndpoint {
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function serveHttp(options: ServerOptions): Promise<HttpEndpoint> {
  const token = randomBytes(24).toString("hex");
  const handler = createMcpHandler(() => createServer(options));

  const serve = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { "content-type": "text/plain" }).end("unauthorized");
        return;
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) for (const x of v) headers.append(k, x);
        else if (v !== undefined) headers.set(k, v);
      }
      const method = req.method ?? "GET";
      const request = new Request(`http://${req.headers.host ?? "127.0.0.1"}${req.url ?? "/"}`, {
        method,
        headers,
        ...(method === "GET" || method === "HEAD" ? {} : { body: Buffer.concat(chunks) }),
      });
      const response = hostHeaderValidationResponse(request, localhostAllowedHostnames()) ?? (await handler.fetch(request));
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (response.body) for await (const chunk of response.body) res.write(chunk);
      res.end();
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e));
    }
  };

  const server = createHttpServer((req, res) => void serve(req, res));
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => done());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("the endpoint has no port");
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    token,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
