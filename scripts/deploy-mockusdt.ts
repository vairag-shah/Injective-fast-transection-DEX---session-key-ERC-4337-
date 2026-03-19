import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying MockUSDT with:", deployer.address);

    const feeData = await ethers.provider.getFeeData();
    const minFee = ethers.parseUnits("1", "gwei");
    const overrides = {
        maxFeePerGas: feeData.maxFeePerGas && feeData.maxFeePerGas > minFee ? feeData.maxFeePerGas : minFee,
        maxPriorityFeePerGas:
            feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minFee
                ? feeData.maxPriorityFeePerGas
                : minFee
    };

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const mock = await MockUSDT.deploy(overrides);
    await mock.waitForDeployment();

    console.log("MOCK_USDT_CONTRACT=", await mock.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
