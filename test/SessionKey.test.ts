import { expect } from "chai";
import { ethers } from "hardhat";

describe("SessionKey", function () {
    it("creates and validates key policy", async function () {
        const [owner, key] = await ethers.getSigners();
        const SessionKey = await ethers.getContractFactory("SessionKey");
        const session = await SessionKey.deploy(owner.address);
        await session.waitForDeployment();

        const pair = ethers.keccak256(ethers.toUtf8Bytes("INJ/USDT"));

        await session.createSessionKey(key.address, 3600, 500_000000, [pair]);

        expect(await session.isValidSessionKey(key.address, pair, 100_000000)).to.eq(true);
        expect(await session.isValidSessionKey(key.address, pair, 900_000000)).to.eq(false);

        await session.revokeSessionKey(key.address);
        expect(await session.isValidSessionKey(key.address, pair, 1)).to.eq(false);
    });
});
