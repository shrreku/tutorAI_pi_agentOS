#!/usr/bin/env node
/**
 * Forwards OpenRouter API traffic from Docker containers via host.docker.internal.
 * Docker Desktop on macOS often cannot reach Cloudflare-hosted endpoints (e.g. openrouter.ai)
 * while the host can. Run this on the host during local docker-compose dev.
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const listenHost = process.env.OPENROUTER_HOST_PROXY_HOST ?? "127.0.0.1";
const listenPort = Number(process.env.OPENROUTER_HOST_PROXY_PORT ?? 8787);
const targetOrigin = (process.env.OPENROUTER_PROXY_TARGET ?? "https://openrouter.ai").replace(
  /\/+$/,
  "",
);

function forwardRequest(clientReq, clientRes) {
  const incomingPath = clientReq.url ?? "/";
  const targetUrl = new URL(incomingPath, `${targetOrigin}/`);

  const headers = { ...clientReq.headers, host: targetUrl.host };
  delete headers["proxy-connection"];

  const upstream = https.request(
    targetUrl,
    {
      method: clientReq.method,
      headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );

  upstream.on("error", (error) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "application/json" });
      clientRes.end(
        JSON.stringify({
          error: {
            message: `OpenRouter host proxy upstream failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        }),
      );
      return;
    }
    clientRes.end();
  });

  clientReq.pipe(upstream);
}

const server = http.createServer(forwardRequest);
server.listen(listenPort, listenHost, () => {
  console.log(
    `[openrouter-host-proxy] listening on http://${listenHost}:${listenPort} -> ${targetOrigin}`,
  );
});
