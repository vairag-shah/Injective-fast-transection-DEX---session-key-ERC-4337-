import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying Vault with:", deployer.address);

    const feeData = await ethers.provider.getFeeData();
    const minFee = ethers.parseUnits("1", "gwei");
    const overrides = {
        maxFeePerGas: feeData.maxFeePerGas && feeData.maxFeePerGas > minFee ? feeData.maxFeePerGas : minFee,
        maxPriorityFeePerGas:
            feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minFee
                ? feeData.maxPriorityFeePerGas
                : minFee
    };

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy(deployer.address, overrides);
    await vault.waitForDeployment();

    console.log("VAULT_CONTRACT=", await vault.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
