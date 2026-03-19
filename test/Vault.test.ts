import { expect } from "chai";
import { ethers } from "hardhat";

describe("Vault", function () {
    it("handles deposits and emits trade request", async function () {
        const [owner, user, smart] = await ethers.getSigners();

        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        const token = await MockUSDT.deploy();
        await token.waitForDeployment();

        const Vault = await ethers.getContractFactory("Vault");
        const vault = await Vault.deploy(owner.address);
        await vault.waitForDeployment();

        await token.transfer(user.address, 200_000000);
        await token.connect(user).approve(await vault.getAddress(), 200_000000);
        await vault.connect(user).deposit(await token.getAddress(), 200_000000);

        expect(await vault.getBalance(user.address, await token.getAddress())).to.eq(200_000000);

        await vault.setApprovedSmartAccount(smart.address, true);
        const pair = ethers.keccak256(ethers.toUtf8Bytes("INJ/USDT"));

        await expect(vault.connect(smart).executeTrade(user.address, pair, 10_000000, 0))
            .to.emit(vault, "TradeRequested");
    });
});
