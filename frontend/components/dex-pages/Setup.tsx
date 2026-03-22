"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/navigation";
import {
    PAYMASTER_ADDRESS,
    SMART_ACCOUNT_FACTORY,
    VAULT_ADDRESS,
    factoryAbi,
    paymasterAbi,
    smartAccountAbi,
    vaultAbi
} from "@/lib/contracts";
import { useSessionKey } from "@/hooks/useSessionKey";
import InteractiveHoverButton from "@/components/ui/interactive-hover-button";

type DurationOption = 3600 | 86400;
type MaxOption = 100 | 500;

const PAIRS = ["INJ/USDT", "ETH/USDT"];
const REQUIRED_CHAIN_ID = 1439;

export default function Setup() {
    const router = useRouter();
    const { saveSession, remainingText, session } = useSessionKey();

    const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
    const [walletAddress, setWalletAddress] = useState("");
    const [step, setStep] = useState(1);
    const [duration, setDuration] = useState<DurationOption>(86400);
    const [maxTrade, setMaxTrade] = useState<MaxOption>(500);
    const [pairs, setPairs] = useState<string[]>(["INJ/USDT"]);
    const [depositAmount, setDepositAmount] = useState("0.1");
    const [sessionAddress, setSessionAddress] = useState("");
    const [stakeInj, setStakeInj] = useState("0.02");
    const [sponsorInj, setSponsorInj] = useState("0.10");
    const [fundingBusy, setFundingBusy] = useState(false);
    const [depositBusy, setDepositBusy] = useState(false);
    const [walletInjBalance, setWalletInjBalance] = useState("-");
    const [vaultInjBalance, setVaultInjBalance] = useState("-");
    const [balanceLoading, setBalanceLoading] = useState(false);

    const networkText = useMemo(() => (provider ? "inEVM Testnet" : "not connected"), [provider]);

    const refreshBalances = useCallback(
        async (nextProvider?: ethers.BrowserProvider, nextAddress?: string) => {
            const p = nextProvider || provider;
            const address = nextAddress || walletAddress;
            if (!p || !address) {
                return;
            }

            setBalanceLoading(true);
            try {
                const checksumAddress = ethers.getAddress(address);
                const [walletBal, vaultBal] = await Promise.all([
                    p.getBalance(checksumAddress),
                    new ethers.Contract(ethers.getAddress(VAULT_ADDRESS), vaultAbi, p).getBalance(checksumAddress, ethers.ZeroAddress)
                ]);
                setWalletInjBalance(Number(ethers.formatEther(walletBal)).toFixed(4));
                setVaultInjBalance(Number(ethers.formatEther(vaultBal)).toFixed(4));
            } catch (err) {
                console.warn("Failed to refresh balances", err);
                setWalletInjBalance("-");
                setVaultInjBalance("-");
            } finally {
                setBalanceLoading(false);
            }
        },
        [provider, walletAddress]
    );

    useEffect(() => {
        if (!provider || !walletAddress) {
            const eth = (window as any).ethereum;
            if (eth) {
                const p = new ethers.BrowserProvider(eth);
                p.listAccounts().then(accounts => {
                    if (accounts.length > 0) {
                        const addr = accounts[0].address;
                        setProvider(p);
                        setWalletAddress(addr);
                        refreshBalances(p, addr);
                    }
                }).catch(() => {});
            }
            return;
        }

        const id = setInterval(() => {
            refreshBalances().catch(() => {});
        }, 6000);

        return () => clearInterval(id);
    }, [provider, walletAddress, refreshBalances]);

    async function connectWallet() {
        const eth = (window as any).ethereum;
        if (!eth) {
            alert("MetaMask is required");
            return;
        }

        try {
            const next = new ethers.BrowserProvider(eth);
            await next.send("eth_requestAccounts", []);

            const network = await next.getNetwork();
            if (Number(network.chainId) !== REQUIRED_CHAIN_ID) {
                try {
                    await eth.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: "0x59F" }], 
                    });
                } catch (switchErr: any) {
                    if (switchErr.code === 4902) {
                        await eth.request({
                            method: "wallet_addEthereumChain",
                            params: [{
                                chainId: "0x59F",
                                chainName: "Injective EVM Testnet",
                                nativeCurrency: {
                                    name: "INJ",
                                    symbol: "INJ",
                                    decimals: 18
                                },
                                rpcUrls: ["https://k8s.testnet.json-rpc.injective.network"],
                                blockExplorerUrls: ["https://testnet.blockscout.injective.network"]
                            }]
                        });
                    }
                }
            }

            const signer = await next.getSigner();
            const address = await signer.getAddress();
            setProvider(next);
            setWalletAddress(address);
            setStep(2);
            await refreshBalances(next, address);

        } catch (err: any) {
            console.error("Connect failed:", err);
            alert(`Connection failed: ${err.message}`);
        }
    }

    async function depositUSDT() {
        if (!provider) {
            alert("Connect MetaMask first");
            return;
        }

        setDepositBusy(true);
        try {
            const signer = await provider.getSigner();
            const network = await provider.getNetwork();
            if (Number(network.chainId) !== REQUIRED_CHAIN_ID) {
                alert(`Wrong network!\n\nPlease switch MetaMask to:\nNetwork: Injective EVM Testnet\nChain ID: 1439\nRPC: https://k8s.testnet.json-rpc.injective.network`);
                return;
            }

            if (!VAULT_ADDRESS) {
                alert("NEXT_PUBLIC_VAULT_CONTRACT not set in frontend/.env");
                return;
            }

            const amount = depositAmount || "0.1";
            const tx = await signer.sendTransaction({
                to: ethers.getAddress(VAULT_ADDRESS),
                value: ethers.parseEther(amount),
                gasLimit: 100000,
            });

            await tx.wait();
            setStep(3);
            await refreshBalances(provider);
        } catch (err: any) {
            console.error("Deposit failed:", err);
            alert(`Deposit failed: ${err.message}`);
        } finally {
            setDepositBusy(false);
        }
    }

    async function configureSessionKey() {
        if (!provider) return;
        try {
            const signer = await provider.getSigner();
            const owner = await signer.getAddress();

            const factory = new ethers.Contract(
                SMART_ACCOUNT_FACTORY,
                factoryAbi,
                signer
            );

            let account: string = await factory.accountOf(owner);

            if (account === ethers.ZeroAddress) {
                const tx = await factory.createAccount(owner);
                await tx.wait();
                account = await factory.accountOf(owner);
            }

            if (account === ethers.ZeroAddress) {
                throw new Error("SmartAccount creation failed");
            }

            const ephemeral = ethers.Wallet.createRandom();
            const allowedPairHashes = pairs.map((p) =>
                ethers.keccak256(ethers.toUtf8Bytes(p))
            );

            const smartAccount = new ethers.Contract(
                account,
                [
                    "function owner() view returns (address)",
                    "function createSessionKey(address key, uint256 durationSeconds, uint256 maxTradeSize, bytes32[] calldata allowedPairs) external",
                    "function setSessionKeyStore(address) external"
                ],
                signer
            );

            const storedOwner = await smartAccount.owner();
            if (storedOwner.toLowerCase() !== owner.toLowerCase()) {
                throw new Error("Owner mismatch!");
            }

            const tx = await smartAccount.createSessionKey(
                ephemeral.address,
                duration,
                ethers.parseUnits(String(maxTrade), 6),
                allowedPairHashes
            );
            await tx.wait();

            const expiry = Date.now() + duration * 1000;
            saveSession({
                privateKey: ephemeral.privateKey,
                address: ephemeral.address,
                expiry,
                maxTradeSize: maxTrade,
                allowedPairs: pairs
            });

            setSessionAddress(ephemeral.address);
            setStep(4);
        } catch (err: any) {
            console.error("Session key failed:", err);
            alert(`Session key setup failed: ${err.message}`);
        }
    }

    async function addPaymasterStake() {
        if (!provider || !PAYMASTER_ADDRESS) return;
        setFundingBusy(true);
        try {
            const signer = await provider.getSigner();
            const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, signer);
            const tx = await paymaster.addStake(86400, {
                value: ethers.parseEther(stakeInj || "0")
            });
            await tx.wait();
            alert("Stake added");
        } catch (err: any) {
            alert(`Stake failed: ${err.message}`);
        } finally {
            setFundingBusy(false);
        }
    }

    async function depositPaymasterGas() {
        if (!provider || !PAYMASTER_ADDRESS) return;
        setFundingBusy(true);
        try {
            const signer = await provider.getSigner();
            const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, signer);
            const tx = await paymaster.depositToEntryPoint({
                value: ethers.parseEther(sponsorInj || "0")
            });
            await tx.wait();
            alert("Deposit funded");
        } catch (err: any) {
            alert(`Deposit failed: ${err.message}`);
        } finally {
            setFundingBusy(false);
        }
    }

    return (
        <div className="mx-auto max-w-6xl space-y-8 pb-20">
            {/* Header / Intro Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent/10 via-transparent to-transparent p-8 md:p-12">
                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
                        Vault <span className="text-accent">Setup</span>
                    </h1>
                    <p className="mt-4 text-lg text-muted-foreground">
                        Configure your secure trading session on Injective inEVM. 
                        Enable gasless, popup-free execution with a single setup flow.
                    </p>
                </div>
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
            </div>

            {/* Progress Stepper */}
            <div className="flex items-center justify-between px-2">
                {[1, 2, 3, 4].map((s) => (
                    <div key={s} className="flex flex-1 items-center last:flex-none">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                            step >= s ? "border-accent bg-accent text-white shadow-[0_0_15px_rgba(var(--accent),0.5)]" : "border-muted bg-muted/20 text-muted-foreground"
                        }`}>
                            {step > s ? "✓" : s}
                        </div>
                        {s < 4 && (
                            <div className={`mx-4 h-0.5 flex-1 transition-all ${step > s ? "bg-accent" : "bg-muted"}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                
                {/* STEP 1: Connect */}
                <div className={`glass-card p-6 flex flex-col ${step === 1 ? "ring-2 ring-accent/50" : "opacity-80"}`}>
                    <div className="mb-6 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-accent">01. Identity</span>
                        {step > 1 && <span className="text-accent">● Verified</span>}
                    </div>
                    <h3 className="text-xl font-bold">Connect Wallet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Connect your MetaMask to start.</p>
                    
                    <div className="mt-8 flex-1">
                        <InteractiveHoverButton
                            text="Connect Wallet"
                            loadingText="Connecting..."
                            successText="Connected"
                            onClick={() => connectWallet()}
                            classes="w-full h-12 text-sm font-semibold"
                        />
                    </div>
                    
                    <div className="mt-6 flex flex-col gap-2 rounded-xl bg-black/20 p-4 font-mono text-[11px]">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">ADDRESS</span>
                            <span className="truncate pl-4 text-foreground">{walletAddress || "Not Connected"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">NETWORK</span>
                            <span className="text-foreground">{networkText}</span>
                        </div>
                    </div>
                </div>

                {/* STEP 2: Deposit */}
                <div className={`glass-card p-6 flex flex-col ${step === 2 ? "ring-2 ring-accent/50" : "opacity-80"}`}>
                    <div className="mb-6 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-accent">02. Funding</span>
                        {step > 2 && <span className="text-accent">● Funded</span>}
                    </div>
                    <h3 className="text-xl font-bold">Vault Deposit</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Deposit native INJ to your vault.</p>

                    <div className="mt-8 space-y-4">
                        <div className="relative">
                            <input
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                className="w-full rounded-xl border border-muted-foreground/20 bg-black/40 px-4 py-3 font-mono text-lg focus:border-accent focus:outline-none"
                                placeholder="0.1"
                                disabled={step < 2}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">INJ</span>
                        </div>

                        <div className="flex flex-col gap-1.5 px-1">
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-muted-foreground">WALLET INJ</span>
                                <span className={balanceLoading ? "text-accent animate-pulse" : "text-foreground"}>
                                    {walletInjBalance}
                                </span>
                            </div>
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-muted-foreground">VAULT INJ</span>
                                <span className="text-foreground">{vaultInjBalance}</span>
                            </div>
                        </div>
                        
                        <InteractiveHoverButton
                            text="Deposit to Vault"
                            loadingText="Processing..."
                            successText="Deposited"
                            onClick={() => depositUSDT()}
                            disabled={depositBusy || step < 2}
                            classes="w-full h-12 text-sm font-semibold disabled:opacity-30"
                        />
                    </div>
                    
                    <div className="mt-6 flex items-center gap-2 rounded-lg bg-amber-400/10 p-3 text-[10px] text-amber-200/80">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] text-black font-bold">!</span>
                        <span>Depositing INJ enables the smart vault to execute trades.</span>
                    </div>
                </div>

                {/* STEP 3: Session Key */}
                <div className={`glass-card p-6 flex flex-col ${step === 3 ? "ring-2 ring-accent/50" : "opacity-80"}`}>
                    <div className="mb-6 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-accent">03. Policy</span>
                        {step > 3 && <span className="text-accent">● Configured</span>}
                    </div>
                    <h3 className="text-xl font-bold">Session Security</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Define limits for your session.</p>

                    <div className="mt-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground italic">DURATION</label>
                            <div className="flex gap-2">
                                {[3600, 86400].map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDuration(d as DurationOption)}
                                        className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${duration === d ? "bg-accent text-white" : "bg-black/40 text-muted-foreground hover:bg-black/60"}`}
                                    >
                                        {d === 3600 ? "1 HOUR" : "24 HOURS"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground italic">MAX TRADE (INJ)</label>
                            <div className="flex gap-2">
                                {[100, 500].map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => setMaxTrade(m as MaxOption)}
                                        className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${maxTrade === m ? "bg-accent text-white" : "bg-black/40 text-muted-foreground hover:bg-black/60"}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <InteractiveHoverButton
                            text="Generate Session Key"
                            loadingText="Syncing..."
                            successText="Key Active"
                            onClick={() => configureSessionKey()}
                            disabled={step < 3}
                            classes="w-full h-12 text-sm font-semibold disabled:opacity-30"
                        />
                    </div>
                </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 glass-card p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-8 rounded-lg bg-amber-400/20 flex items-center justify-center">
                            <span className="text-amber-400 font-bold text-lg">⚙</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">System Maintenance <span className="text-amber-200">(Sponsors Only)</span></h3>
                            <p className="text-sm text-muted-foreground">Configure the paymaster status.</p>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <label className="text-xs font-bold text-muted-foreground">STAKE AMOUNT</label>
                            </div>
                            <input
                                value={stakeInj}
                                onChange={(e) => setStakeInj(e.target.value)}
                                className="w-full rounded-xl border border-muted-foreground/10 bg-black/20 px-4 py-2 font-mono"
                                placeholder="0.02"
                            />
                            <InteractiveHoverButton
                                text="Stake Paymaster"
                                onClick={() => addPaymasterStake()}
                                disabled={fundingBusy}
                                classes="w-full h-10 text-xs border-amber-400/30 text-amber-200"
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <label className="text-xs font-bold text-muted-foreground">GAS DEPOSIT</label>
                            </div>
                            <input
                                value={sponsorInj}
                                onChange={(e) => setSponsorInj(e.target.value)}
                                className="w-full rounded-xl border border-muted-foreground/10 bg-black/20 px-4 py-2 font-mono"
                                placeholder="0.10"
                            />
                            <InteractiveHoverButton
                                text="Deposit Gas"
                                onClick={() => depositPaymasterGas()}
                                disabled={fundingBusy}
                                classes="w-full h-10 text-xs border-accent/30 text-accent"
                            />
                        </div>
                    </div>
                </div>

                <div className={`glass-card p-6 flex flex-col justify-between transition-all duration-500 ${step >= 4 ? "bg-accent/10 border-accent/40 scale-105" : "opacity-40 grayscale pointer-events-none"}`}>
                    <div>
                        <div className="mb-4 h-12 w-12 rounded-2xl bg-accent flex items-center justify-center text-white text-2xl animate-pulse">
                            ⚡
                        </div>
                        <h3 className="text-2xl font-bold">Ready to Trade</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                            Your session is active. Zero popups, zero friction.
                        </p>
                    </div>

                    <div className="mt-8 space-y-4">
                        <div className="font-mono text-[10px] space-y-1 bg-black/30 p-3 rounded-lg border border-white/5">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground uppercase">SESSION</span>
                                <span className="text-accent truncate pl-4">{sessionAddress || session?.address || "ACTIVE"}</span>
                            </div>
                            <div className="flex justify-between border-t border-white/5 pt-1 mt-1">
                                <span className="text-muted-foreground uppercase">REMAINING</span>
                                <span className="text-amber-400 font-bold">{remainingText}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => router.push("/trade")}
                            className="w-full rounded-2xl bg-accent py-4 font-bold text-white shadow-[0_4px_20px_rgba(var(--accent),0.4)] transition-all hover:scale-105 active:scale-95"
                        >
                            Enter Terminal →
                        </button>
                    </div>
                </div>
            </div>

            <p className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-50">
                Network: inEVM Testnet (1439) • Powered by Injective
            </p>
        </div>
    );
}