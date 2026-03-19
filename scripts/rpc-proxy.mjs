#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";

const upstream = process.env.RPC_PROXY_UPSTREAM || "https://k8s.testnet.json-rpc.injective.network/";
const port = Number(process.env.RPC_PROXY_PORT || 8547);

const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
    }

    let body = "";
    req.on("data", (chunk) => {
        body += chunk;
    });

    req.on("end", () => {
        const curl = spawn("curl", [
            "-sS",
            "-H",
            "content-type: application/json",
            "--data-binary",
            "@-",
            upstream
        ]);

        let out = "";
        let err = "";

        curl.stdout.on("data", (d) => {
            out += d.toString();
        });

        curl.stderr.on("data", (d) => {
            err += d.toString();
        });

        curl.on("close", (code) => {
            if (code !== 0) {
                res.statusCode = 502;
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ error: `upstream curl failed: ${err || code}` }));
                return;
            }

            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(out || "{}");
        });

        curl.stdin.write(body);
        curl.stdin.end();
    });
});

server.listen(port, "127.0.0.1", () => {
    console.log(`RPC proxy listening on http://127.0.0.1:${port} -> ${upstream}`);
});
