import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const [deployer] = await ethers.getSigners();
    const entryPoint = process.env.ENTRYPOINT;

    if (!entryPoint) {
        throw new Error("ENTRYPOINT is required in env");
    }

    console.log("Deploying with:", deployer.address);

    const feeData = await ethers.provider.getFeeData();
    const minFee = ethers.parseUnits("1", "gwei");
    const overrides = {
        maxFeePerGas: feeData.maxFeePerGas && feeData.maxFeePerGas > minFee ? feeData.maxFeePerGas : minFee,
        maxPriorityFeePerGas:
            feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minFee
                ? feeData.maxPriorityFeePerGas
                : minFee
    };

    const Paymaster = await ethers.getContractFactory("Paymaster");
    const paymaster = await Paymaster.deploy(entryPoint, deployer.address, overrides);
    await paymaster.waitForDeployment();

    const SessionKey = await ethers.getContractFactory("SessionKey");
    const sessionKey = await SessionKey.deploy(deployer.address, overrides);
    await sessionKey.waitForDeployment();

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy(deployer.address, overrides);
    await vault.waitForDeployment();

    const SmartAccountFactory = await ethers.getContractFactory("SmartAccountFactory");
    const factory = await SmartAccountFactory.deploy(entryPoint, await sessionKey.getAddress(), overrides);
    await factory.waitForDeployment();

    console.log("SESSION_KEY_CONTRACT=", await sessionKey.getAddress());
    console.log("VAULT_CONTRACT=", await vault.getAddress());
    console.log("PAYMASTER_CONTRACT=", await paymaster.getAddress());
    console.log("SMART_ACCOUNT_FACTORY=", await factory.getAddress());

    console.log("\nNext:");
    console.log("1) Set relay in Vault");
    console.log("2) addStake + deposit on Paymaster");
    console.log("3) Start relay + frontend");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
