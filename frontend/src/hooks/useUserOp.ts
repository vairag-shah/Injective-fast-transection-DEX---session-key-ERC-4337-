import { useState } from "react";
import { ethers } from "ethers";
import { ENTRYPOINT, SMART_ACCOUNT_FACTORY, VAULT_ADDRESS, factoryAbi, smartAccountAbi, vaultAbi } from "../lib/contracts";
import { buildUserOp, hashUserOp } from "../lib/userOp";
import { pollOrderStatus, submitUserOp } from "../lib/injective";

export type TradeResult = {
    userOpHash: string;
    txHash: string | null;
    status: "pending" | "confirmed";
};

export function useUserOp() {
    const [pending, setPending] = useState(false);

    async function submitTrade(params: {
        eoaProvider: ethers.BrowserProvider;
        pair: string;
        qty: number;
        side: 0 | 1;
        sessionPrivateKey: string;
    }): Promise<TradeResult> {
        setPending(true);
        try {
            const signer = await params.eoaProvider.getSigner();
            const owner = await signer.getAddress();

            const factory = new ethers.Contract(SMART_ACCOUNT_FACTORY, factoryAbi, signer);
            let smartAccountAddress: string = await factory.accountOf(owner);
            if (smartAccountAddress === ethers.ZeroAddress) {
                const tx = await factory.createAccount(owner);
                await tx.wait();
                smartAccountAddress = await factory.accountOf(owner);
            }

            const smartInterface = new ethers.Interface(smartAccountAbi);
            const vaultInterface = new ethers.Interface(vaultAbi);
            const pairHash = ethers.keccak256(ethers.toUtf8Bytes(params.pair));

            const tradeData = vaultInterface.encodeFunctionData("executeTrade", [
                owner,
                pairHash,
                ethers.parseUnits(params.qty.toString(), 18),
                params.side
            ]);

            const callData = smartInterface.encodeFunctionData("execute", [VAULT_ADDRESS, 0, tradeData]);
            const smartAccount = new ethers.Contract(smartAccountAddress, smartAccountAbi, signer);
            const nonce: bigint = await smartAccount.nonce();

            const userOp = await buildUserOp({
                sender: smartAccountAddress,
                nonce,
                callData
            });

            const wallet = new ethers.Wallet(params.sessionPrivateKey);
            const digest = hashUserOp(userOp, ENTRYPOINT, Number(import.meta.env.VITE_CHAIN_ID || 2424));
            const signature = await wallet.signMessage(ethers.getBytes(digest));
            userOp.signature = signature;

            const submitted = await submitUserOp({
                ...userOp,
                user: owner,
                pair: params.pair,
                qty: params.qty.toString(),
                side: params.side
            });
            let status: "pending" | "confirmed" = "pending";
            let txHash: string | null = null;

            // Quick best-effort poll for already-mined transactions without blocking UX.
            try {
                const polled = await pollOrderStatus(submitted.userOpHash);
                if (polled.status === "confirmed") {
                    status = "confirmed";
                    txHash = polled.txHash;
                }
            } catch {
                // Ignore transient poll errors; background confirmation handles eventual consistency.
            }

            return { userOpHash: submitted.userOpHash, txHash, status };
        } finally {
            setPending(false);
        }
    }

    return { pending, submitTrade };
}
