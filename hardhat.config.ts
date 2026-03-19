import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.23",
                settings: {
                    optimizer: { enabled: true, runs: 200 }
                }
            }
        ]
    },
    networks: {
        hardhat: {},
        injective_testnet: {
            url: process.env.INEVM_RPC_URL || "",
            chainId: Number(process.env.INEVM_CHAIN_ID || 1439),
            accounts: process.env.DEPLOYER_PRIVATE_KEY
                ? [process.env.DEPLOYER_PRIVATE_KEY]
                : []
        },
        inEvmTestnet: {
            url: process.env.INEVM_RPC_URL || "",
            chainId: Number(process.env.INEVM_CHAIN_ID || 1439),
            accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    }
};

export default config;
