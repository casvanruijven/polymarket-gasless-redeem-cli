examples/poll.ts
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { RelayerTransactionState } from "../src/types";
import { RelayClient } from "../src/client";

dotenvConfig({ path: resolve(__dirname, "../.env") });


async function main() {

    console.log(`Starting...`);
    
    const relayerUrl = `${process.env.RELAYER_URL}`;
    const chainId = parseInt(`${process.env.CHAIN_ID}`);
    const client = new RelayClient(relayerUrl, chainId);

    // const states = [RelayerTransactionState.STATE_EXECUTED.valueOf(), RelayerTransactionState.STATE_CONFIRMED.valueOf()];
    const states = [RelayerTransactionState.STATE_CONFIRMED.valueOf()];
    const resp = await client.pollUntilState("0190e61a-bb93-7c3f-88e2-e29e1c569fb1", states);
    console.log(resp);

}

main();

examples/approve.ts
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { RelayClient, Transaction } from "../src";
import { encodeFunctionData, prepareEncodeFunctionData, createWalletClient, Hex, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { BuilderApiKeyCreds, BuilderConfig } from "@polymarket/builder-signing-sdk";

dotenvConfig({ path: resolve(__dirname, "../.env") });

const erc20Abi = [
    {
        "constant": false,"inputs": 
        [{"name": "_spender","type": "address"},{"name": "_value","type": "uint256"}],
        "name": "approve",
        "outputs": [{"name": "","type": "bool"}],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

const erc20 = prepareEncodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
});

function createUsdcApproveTxn(
    token: string,
    spender: string,
): Transaction {
    const calldata = encodeFunctionData({...erc20, args: [spender, maxUint256]});
    return {
        to: token,
        data: calldata,
        value: "0",
    }
}

async function main() {
    console.log(`Starting...`);
    
    const relayerUrl = `${process.env.RELAYER_URL}`;
    const chainId = parseInt(`${process.env.CHAIN_ID}`);

    const pk = privateKeyToAccount(`${process.env.PK}` as Hex);
    const wallet = createWalletClient({account: pk, chain: polygon, transport: http(`${process.env.RPC_URL}`)});

    const builderCreds: BuilderApiKeyCreds = {
        key: `${process.env.BUILDER_API_KEY}`,
        secret: `${process.env.BUILDER_SECRET}`,
        passphrase: `${process.env.BUILDER_PASS_PHRASE}`,
    };
    const builderConfig = new BuilderConfig({
        localBuilderCreds: builderCreds
    });
    const client = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

    const usdc = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const ctf = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
    const txn = createUsdcApproveTxn(usdc, ctf);

    const resp = await client.execute([txn, txn], "approve USDC on CTF");
    const t = await resp.wait();
    console.log(t);

}

main();

examples/approveProxy.ts
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { RelayClient, RelayerTxType, Transaction } from "../src";
import { encodeFunctionData, prepareEncodeFunctionData, createWalletClient, Hex, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { BuilderApiKeyCreds, BuilderConfig } from "@polymarket/builder-signing-sdk";

dotenvConfig({ path: resolve(__dirname, "../.env") });

const erc20Abi = [
    {
        "constant": false,"inputs": 
        [{"name": "_spender","type": "address"},{"name": "_value","type": "uint256"}],
        "name": "approve",
        "outputs": [{"name": "","type": "bool"}],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

const erc20 = prepareEncodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
});

function createUsdcApproveTxn(
    token: string,
    spender: string,
): Transaction {
    const calldata = encodeFunctionData({...erc20, args: [spender, maxUint256]});
    return {
        to: token,
        data: calldata,
        value: "0",
    }
}

async function main() {
    console.log(`Starting...`);
    
    const relayerUrl = `${process.env.RELAYER_URL}`;
    const chainId = parseInt(`${process.env.CHAIN_ID}`);

    const pk = privateKeyToAccount(`${process.env.PK}` as Hex);
    const wallet = createWalletClient({account: pk, chain: polygon, transport: http(`${process.env.RPC_URL}`)});

    const builderCreds: BuilderApiKeyCreds = {
        key: `${process.env.BUILDER_API_KEY}`,
        secret: `${process.env.BUILDER_SECRET}`,
        passphrase: `${process.env.BUILDER_PASS_PHRASE}`,
    };
    const builderConfig = new BuilderConfig({
        localBuilderCreds: builderCreds
    });
    // Set RelayerTxType to PROXY to create Proxy Transactions
    const client = new RelayClient(relayerUrl, chainId, wallet, builderConfig, RelayerTxType.PROXY);

    const usdc = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const ctf = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
    const txn = createUsdcApproveTxn(usdc, ctf);

    const resp = await client.execute([txn, txn], "approve USDC on CTF");
    const t = await resp.wait();
    console.log(t);

}

main();

examples/getTransaction.ts
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { RelayClient } from "../src/client";

dotenvConfig({ path: resolve(__dirname, "../.env") });


async function main() {

    console.log(`Starting...`);
    
    const relayerUrl = `${process.env.RELAYER_URL}`;
    const chainId = parseInt(`${process.env.CHAIN_ID}`);
    const client = new RelayClient(relayerUrl, chainId);

    const resp = await client.getTransaction("0191580c-6472-7266-beda-4deaebe46705");
    console.log(resp);

}

main();

examples/getTransactions.ts
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { RelayClient } from "../src/client";

dotenvConfig({ path: resolve(__dirname, "../.env") });


async function main() {

    console.log(`Starting...`);
    
    const relayerUrl = `${process.env.RELAYER_URL}`;
    const chainId = parseInt(`${process.env.CHAIN_ID}`);

    const client = new RelayClient(relayerUrl, chainId);

    const resp = await client.getTransactions();
    console.log(resp);

}

main();

examples/redeem.ts
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { RelayClient, Transaction } from "../src";
import { encodeFunctionData, prepareEncodeFunctionData, createWalletClient, Hex, http, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { BuilderApiKeyCreds, BuilderConfig } from "@polymarket/builder-signing-sdk";

dotenvConfig({ path: resolve(__dirname, "../.env") });


const ctfRedeemAbi = [
    {
        "constant":false,
        "inputs":
        [
            {"name":"collateralToken","type":"address"},
            {"name":"parentCollectionId","type":"bytes32"},
            {"name":"conditionId","type":"bytes32"},
            {"name":"indexSets","type":"uint256[]"}
        ],
        "name":"redeemPositions",
        "outputs":[],
        "payable":false,
        "stateMutability":"nonpayable",
        "type":"function"
    }
];

const nrAdapterRedeemAbi = [
    {
        "inputs":
        [
            {"internalType":"bytes32","name":"_conditionId","type":"bytes32"},
            {"internalType":"uint256[]","name":"_amounts","type":"uint256[]"}
        ],
        "name":"redeemPositions",
        "outputs":[],
        "stateMutability":"nonpayable",
        "type":"function"
    }
];

const ctf = prepareEncodeFunctionData({
    abi: ctfRedeemAbi,
    functionName: "redeemPositions",
});

const nrAdapter = prepareEncodeFunctionData({
    abi: nrAdapterRedeemAbi,
    functionName: "redeemPositions",
});


function createCtfRedeemTxn(
    contract: string,
    conditionId: string,
    collateral: string,
): Transaction {
    const calldata = encodeFunctionData({...ctf, args: [collateral, zeroHash, conditionId, [1, 2]]});
    return {
            to: contract,
            data: calldata,
            value: "0",
    }
}

function createNrAdapterRedeemTxn(
    contract: string,
    conditionId: string,
    redeemAmounts: bigint[],
): Transaction {
    const calldata = encodeFunctionData({...nrAdapter, args: [conditionId, redeemAmounts]});
    return {
            to: contract,
            data: calldata,
            value: "0",
        }
}

async function main() {
    console.log(`Starting...`);
    
    const relayerUrl = `${process.env.RELAYER_URL}`;
    const chainId = parseInt(`${process.env.CHAIN_ID}`);

    const pk = privateKeyToAccount(`${process.env.PK}` as Hex);
    const wallet = createWalletClient({account: pk, chain: polygon, transport: http(`${process.env.RPC_URL}`)});

    const builderCreds: BuilderApiKeyCreds = {
        key: `${process.env.BUILDER_API_KEY}`,
        secret: `${process.env.BUILDER_SECRET}`,
        passphrase: `${process.env.BUILDER_PASS_PHRASE}`,
    };
    const builderConfig = new BuilderConfig({
        localBuilderCreds: builderCreds
    });
    const client = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

    // Set your values here
    const negRisk = false;
    const conditionId = "0x...."; // conditionId to redeem
    
    // amounts to redeem per outcome, only necessary for neg risk
    // Must be an array of length 2 with:
    // the first element being the amount of yes tokens to redeem and
    // the second element being the amount of no tokens to redeem
    const redeemAmounts = [BigInt(111000000), BigInt(0)];

    const usdc = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const ctf = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
    const negRiskAdapter = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

    const txn = negRisk ? createNrAdapterRedeemTxn(negRiskAdapter, conditionId, redeemAmounts) :
        createCtfRedeemTxn(ctf, conditionId, usdc);
    
    const resp = await client.execute([txn], "redeem");
    const t = await resp.wait();
    console.log(t);

}

main();


github docs:

builder-relayer-client
TypeScript client library for interacting with Polymarket relayer infrastructure

Installation
pnpm install @polymarket/builder-relayer-client
Quick Start
Basic Setup
import { createWalletClient, Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";

const relayerUrl = process.env.POLYMARKET_RELAYER_URL;
const chainId = parseInt(process.env.CHAIN_ID);

const account = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const wallet = createWalletClient({
  account,
  chain: polygon,
  transport: http(process.env.RPC_URL)
});

// Initialize the client with SAFE transaction type (default)
const client = new RelayClient(relayerUrl, chainId, wallet);

// Or initialize with PROXY transaction type
const proxyClient = new RelayClient(relayerUrl, chainId, wallet, undefined, RelayerTxType.PROXY);
Transaction Types
The client supports two transaction types via the RelayerTxType enum:

RelayerTxType.SAFE (default): Executes transactions through for a Gnosis Safe
RelayerTxType.PROXY: Executes transactions for a Polymarket Proxy wallet
The transaction type is specified as the last parameter when creating a RelayClient instance. All examples use the Transaction type - the client automatically converts transactions to the appropriate format (SafeTransaction or ProxyTransaction) based on the RelayerTxType you've configured.

With Local Builder Authentication
import { BuilderApiKeyCreds, BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayerTxType } from "@polymarket/builder-relayer-client";

const builderCreds: BuilderApiKeyCreds = {
  key: process.env.BUILDER_API_KEY,
  secret: process.env.BUILDER_SECRET,
  passphrase: process.env.BUILDER_PASS_PHRASE,
};

const builderConfig = new BuilderConfig({
  localBuilderCreds: builderCreds
});

// Initialize with SAFE transaction type (default)
const client = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

// Or initialize with PROXY transaction type
const proxyClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig, RelayerTxType.PROXY);
With Remote Builder Authentication
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayerTxType } from "@polymarket/builder-relayer-client";

const builderConfig = new BuilderConfig(
  {
    remoteBuilderConfig: {
      url: "http://localhost:3000/sign",
      token: `${process.env.MY_AUTH_TOKEN}`
    }
  },
);

// Initialize with SAFE transaction type (default)
const client = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

// Or initialize with PROXY transaction type
const proxyClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig, RelayerTxType.PROXY);
Examples
Execute ERC20 Approval Transaction
import { encodeFunctionData, prepareEncodeFunctionData, maxUint256 } from "viem";
import { Transaction, RelayerTxType } from "@polymarket/builder-relayer-client";

const erc20Abi = [
  {
    "constant": false,
    "inputs": [
      {"name": "_spender", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const erc20 = prepareEncodeFunctionData({
  abi: erc20Abi,
  functionName: "approve",
});

function createApprovalTransaction(
  tokenAddress: string,
  spenderAddress: string
): Transaction {
  const calldata = encodeFunctionData({
    ...erc20,
    args: [spenderAddress, maxUint256]
  });
  return {
    to: tokenAddress,
    data: calldata,
    value: "0"
  };
}

// Initialize client with SAFE transaction type (default)
const safeClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

// Or initialize with PROXY transaction type
const proxyClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig, RelayerTxType.PROXY);

// Execute the approval - works with both SAFE and PROXY
const approvalTx = createApprovalTransaction(
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
  "0x4d97dcd97ec945f40cf65f87097ace5ea0476045"  // CTF
);

// Using SAFE client
const safeResponse = await safeClient.execute([approvalTx], "usdc approval on the CTF");
const safeResult = await safeResponse.wait();
console.log("Safe approval completed:", safeResult.transactionHash);

// Using PROXY client
const proxyResponse = await proxyClient.execute([approvalTx], "usdc approval on the CTF");
const proxyResult = await proxyResponse.wait();
console.log("Proxy approval completed:", proxyResult.transactionHash);
Deploy Safe Contract
Note: Safe deployment is only available for RelayerTxType.SAFE. Proxy wallets are deployed automatically on its first transaction.

// Initialize client with SAFE transaction type (default)
const client = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

const response = await client.deploy();
const result = await response.wait();

if (result) {
  console.log("Safe deployed successfully!");
  console.log("Transaction Hash:", result.transactionHash);
  console.log("Safe Address:", result.proxyAddress);
} else {
  console.log("Safe deployment failed");
}
Redeem Positions
CTF (ConditionalTokensFramework) Redeem
import { encodeFunctionData, prepareEncodeFunctionData, zeroHash } from "viem";
import { Transaction, RelayerTxType } from "@polymarket/builder-relayer-client";

const ctfRedeemAbi = [
  {
    "constant": false,
    "inputs": [
      {"name": "collateralToken", "type": "address"},
      {"name": "parentCollectionId", "type": "bytes32"},
      {"name": "conditionId", "type": "bytes32"},
      {"name": "indexSets", "type": "uint256[]"}
    ],
    "name": "redeemPositions",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const ctf = prepareEncodeFunctionData({
  abi: ctfRedeemAbi,
  functionName: "redeemPositions",
});

function createCtfRedeemTransaction(
  ctfAddress: string,
  collateralToken: string,
  conditionId: string
): Transaction {
  const calldata = encodeFunctionData({
    ...ctf,
    args: [collateralToken, zeroHash, conditionId, [1, 2]]
  });
  return {
    to: ctfAddress,
    data: calldata,
    value: "0"
  };
}

// Initialize client with SAFE transaction type (default)
const safeClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

// Or initialize with PROXY transaction type
const proxyClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig, RelayerTxType.PROXY);

// Execute the redeem - works with both SAFE and PROXY
const ctfAddress = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const conditionId = "0x..."; // Your condition ID

const redeemTx = createCtfRedeemTransaction(ctfAddress, usdcAddress, conditionId);

// Using SAFE client
const safeResponse = await safeClient.execute([redeemTx], "redeem positions");
const safeResult = await safeResponse.wait();
console.log("Safe redeem completed:", safeResult.transactionHash);

// Using PROXY client
const proxyResponse = await proxyClient.execute([redeemTx], "redeem positions");
const proxyResult = await proxyResponse.wait();
console.log("Proxy redeem completed:", proxyResult.transactionHash);
NegRisk Adapter Redeem
import { encodeFunctionData, prepareEncodeFunctionData } from "viem";
import { Transaction, RelayerTxType } from "@polymarket/builder-relayer-client";

const nrAdapterRedeemAbi = [
  {
    "inputs": [
      {"internalType": "bytes32", "name": "_conditionId", "type": "bytes32"},
      {"internalType": "uint256[]", "name": "_amounts", "type": "uint256[]"}
    ],
    "name": "redeemPositions",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const nrAdapter = prepareEncodeFunctionData({
  abi: nrAdapterRedeemAbi,
  functionName: "redeemPositions",
});

function createNrAdapterRedeemTransaction(
  adapterAddress: string,
  conditionId: string,
  redeemAmounts: bigint[] // [yesAmount, noAmount]
): Transaction {
  const calldata = encodeFunctionData({
    ...nrAdapter,
    args: [conditionId, redeemAmounts]
  });
  return {
    to: adapterAddress,
    data: calldata,
    value: "0"
  };
}

// Initialize client with SAFE transaction type (default)
const safeClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig);

// Or initialize with PROXY transaction type
const proxyClient = new RelayClient(relayerUrl, chainId, wallet, builderConfig, RelayerTxType.PROXY);

// Execute the redeem - works with both SAFE and PROXY
const negRiskAdapter = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";
const conditionId = "0x..."; // Your condition ID
const redeemAmounts = [BigInt(111000000), BigInt(0)]; // [yes tokens, no tokens]

const redeemTx = createNrAdapterRedeemTransaction(negRiskAdapter, conditionId, redeemAmounts);

// Using SAFE client
const safeResponse = await safeClient.execute([redeemTx], "redeem positions");
const safeResult = await safeResponse.wait();
console.log("Safe redeem completed:", safeResult.transactionHash);

// Using PROXY client
const proxyResponse = await proxyClient.execute([redeemTx], "redeem positions");
const proxyResult = await proxyResponse.wait();
console.log("Proxy redeem completed:", proxyResult.transactionHash);


