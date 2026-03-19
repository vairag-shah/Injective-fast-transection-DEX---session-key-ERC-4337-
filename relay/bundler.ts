import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const bundlerUrl = process.env.PIMLICO_BUNDLER_URL || "";
const entryPoint = process.env.ENTRYPOINT || "";

type RpcResponse<T> = { result?: T; error?: { message: string } };

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    if (!bundlerUrl) {
        throw new Error("PIMLICO_BUNDLER_URL not configured");
    }

    const res = await fetch(bundlerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method,
            params
        })
    });

    const json = (await res.json()) as RpcResponse<T>;
    if (json.error) {
        throw new Error(json.error.message);
    }

    return json.result as T;
}

export async function sendUserOperation(userOp: unknown): Promise<string> {
    return rpcCall<string>("eth_sendUserOperation", [userOp, entryPoint]);
}

export async function getUserOperationReceipt(userOpHash: string): Promise<any> {
    return rpcCall<any>("eth_getUserOperationReceipt", [userOpHash]);
}
