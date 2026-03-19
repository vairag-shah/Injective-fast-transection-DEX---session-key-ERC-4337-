import { useState } from "react";
import { ethers } from "ethers";
import { ENTRYPOINT, SMART_ACCOUNT_FACTORY, VAULT_ADDRESS, factoryAbi, smartAccountAbi, vaultAbi } from "../lib/contracts";
import { buildUserOp, hashUserOp } from "../lib/userOp";
import { pollOrderStatus, submitUserOp } from "../lib/injective";

export type TradeResult = {
    userOpHash: string;
    txHash: string | null;
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
                ethers.parseUnits(params.qty.toString(), 6),
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

            const submitted = await submitUserOp(userOp);
            let status = "pending";
            let txHash: string | null = null;

            for (let i = 0; i < 30 && status !== "confirmed"; i++) {
                await new Promise((r) => setTimeout(r, 2000));
                const polled = await pollOrderStatus(submitted.userOpHash);
                status = polled.status;
                txHash = polled.txHash;
            }

            return { userOpHash: submitted.userOpHash, txHash };
        } finally {
            setPending(false);
        }
    }

    return { pending, submitTrade };
}
