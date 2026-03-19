import { ethers } from "ethers";

export type BuiltUserOp = {
    sender: string;
    nonce: string;
    initCode: string;
    callData: string;
    accountGasLimits: string;
    preVerificationGas: string;
    gasFees: string;
    paymasterAndData: string;
    signature: string;
};

export async function buildUserOp(params: {
    sender: string;
    nonce: bigint;
    callData: string;
    paymasterAndData?: string;
}): Promise<BuiltUserOp> {
    const callGasLimit = 500000n;
    const verificationGasLimit = 200000n;
    const maxFeePerGas = ethers.parseUnits("2", "gwei");
    const maxPriorityFeePerGas = ethers.parseUnits("1", "gwei");

    const accountGasLimits = ethers.zeroPadValue(ethers.toBeHex(callGasLimit), 16) + ethers.zeroPadValue(ethers.toBeHex(verificationGasLimit), 16).slice(2);
    const gasFees = ethers.zeroPadValue(ethers.toBeHex(maxFeePerGas), 16) + ethers.zeroPadValue(ethers.toBeHex(maxPriorityFeePerGas), 16).slice(2);

    return {
        sender: params.sender,
        nonce: ethers.toBeHex(params.nonce),
        initCode: "0x",
        callData: params.callData,
        accountGasLimits,
        preVerificationGas: ethers.toBeHex(120000),
        gasFees,
        paymasterAndData: params.paymasterAndData || "0x",
        signature: "0x"
    };
}

export function hashUserOp(userOp: BuiltUserOp, entryPoint: string, chainId: number) {
    const enc = ethers.AbiCoder.defaultAbiCoder().encode(
        [
            "address",
            "uint256",
            "bytes32",
            "bytes32",
            "bytes32",
            "uint256",
            "bytes32",
            "bytes32",
            "address",
            "uint256"
        ],
        [
            userOp.sender,
            userOp.nonce,
            ethers.keccak256(userOp.initCode),
            ethers.keccak256(userOp.callData),
            ethers.keccak256(userOp.accountGasLimits),
            userOp.preVerificationGas,
            ethers.keccak256(userOp.gasFees),
            ethers.keccak256(userOp.paymasterAndData),
            entryPoint,
            chainId
        ]
    );

    return ethers.keccak256(enc);
}
