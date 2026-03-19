import { run } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function verify(address: string, args: unknown[]) {
    if (!address) return;
    try {
        await run("verify:verify", {
            address,
            constructorArguments: args
        });
    } catch (error) {
        console.error(`verify failed for ${address}`, error);
    }
}

async function main() {
    const entryPoint = process.env.ENTRYPOINT || "";

    await verify(process.env.SESSION_KEY_CONTRACT || "", [process.env.DEPLOYER_ADDRESS || ""]);
    await verify(process.env.VAULT_CONTRACT || "", [process.env.DEPLOYER_ADDRESS || ""]);
    await verify(process.env.PAYMASTER_CONTRACT || "", [entryPoint, process.env.DEPLOYER_ADDRESS || ""]);
    await verify(process.env.SMART_ACCOUNT_FACTORY || "", [entryPoint, process.env.SESSION_KEY_CONTRACT || ""]);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
