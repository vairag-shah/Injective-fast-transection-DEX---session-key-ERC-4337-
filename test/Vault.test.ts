import { expect } from "chai";
import { ethers } from "hardhat";

describe("Vault", function () {
    it("debits native balance and emits trade request", async function () {
        const [owner, user, smart] = await ethers.getSigners();

        const Vault = await ethers.getContractFactory("Vault");
        const vault = await Vault.deploy(owner.address);
        await vault.waitForDeployment();

        await user.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("2") });
        expect(await vault.getBalance(user.address, ethers.ZeroAddress)).to.eq(ethers.parseEther("2"));

        await vault.setApprovedSmartAccount(smart.address, true);
        const pair = ethers.keccak256(ethers.toUtf8Bytes("INJ/USDT"));
        const tradeQty = ethers.parseEther("1");

        await expect(vault.connect(smart).executeTrade(user.address, pair, tradeQty, 0))
            .to.emit(vault, "TradeRequested");

        expect(await vault.getBalance(user.address, ethers.ZeroAddress)).to.eq(ethers.parseEther("1"));
    });
});
