import { expect } from "chai";
import { ethers } from "hardhat";

describe("SmartAccount", function () {
    it("allows owner to configure session key store and session keys", async function () {
        const [owner, key] = await ethers.getSigners();

        const SessionKey = await ethers.getContractFactory("SessionKey");
        const session = await SessionKey.deploy(owner.address);
        await session.waitForDeployment();

        const SmartAccount = await ethers.getContractFactory("SmartAccount");
        const account = await SmartAccount.deploy(owner.address, owner.address);
        await account.waitForDeployment();

        await session.setAuthorizedCaller(await account.getAddress(), true);
        await account.setSessionKeyStore(await session.getAddress());

        const pair = ethers.keccak256(ethers.toUtf8Bytes("INJ/USDT"));
        await account.createSessionKey(key.address, 3600, 500_000000, [pair]);

        expect(await session.isValidSessionKey(key.address, pair, 100_000000)).to.eq(true);
    });

    it("restricts execute to entrypoint", async function () {
        const [owner, other] = await ethers.getSigners();

        const SmartAccount = await ethers.getContractFactory("SmartAccount");
        const account = await SmartAccount.deploy(owner.address, owner.address);
        await account.waitForDeployment();

        await expect(account.connect(other).execute(other.address, 0, "0x")).to.be.revertedWith("only entrypoint");
    });
});
