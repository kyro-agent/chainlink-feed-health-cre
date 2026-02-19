// Feed Health Monitor - CRE Workflow
// Reads Chainlink price feed data on Base mainnet via CRE's EVM Read capability
// Checks staleness and logs health status

import { cre, Runner, type Runtime, type CronPayload, getNetwork } from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult, zeroAddress } from "viem";
import { encodeCallMsg, bytesToHex, LAST_FINALIZED_BLOCK_NUMBER } from "@chainlink/cre-sdk";
import { z } from "zod";

type Config = {
  schedule: string;
  feedAddress: string;
  feedName: string;
  stalenessThresholdMinutes: number;
  chainSelectorName: string;
  isTestnet: boolean;
};

// Zod schema for config validation
const configSchema = z.object({
  schedule: z.string(),
  feedAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "feedAddress must be a valid Ethereum address"),
  feedName: z.string(),
  stalenessThresholdMinutes: z.number().positive("stalenessThresholdMinutes must be a positive number"),
  chainSelectorName: z.string(),
  isTestnet: z.boolean(),
});

// Chainlink AggregatorV3Interface ABI (the real contract interface)
const LATEST_ROUND_DATA_ABI = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const DESCRIPTION_ABI = [
  {
    name: "description",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const DECIMALS_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

function onCronTrigger(runtime: Runtime<Config>, _payload: CronPayload) {
  try {
    const config = runtime.config;

    // Validate config
    configSchema.parse(config);

    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log(`Feed Health Monitor: ${config.feedName}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Connect to network via CRE's EVM capability
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: config.chainSelectorName,
      isTestnet: config.isTestnet,
    });

    if (!network) {
      throw new Error(`Network not found: ${config.chainSelectorName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
    const feedAddr = config.feedAddress as `0x${string}`;

    // Step 1: Prepare all EVM calls
    runtime.log("[Step 1] Preparing EVM calls...");
    
    const descCallData = encodeFunctionData({
      abi: DESCRIPTION_ABI,
      functionName: "description",
    });

    const decimalsCallData = encodeFunctionData({
      abi: DECIMALS_ABI,
      functionName: "decimals",
    });

    const roundCallData = encodeFunctionData({
      abi: LATEST_ROUND_DATA_ABI,
      functionName: "latestRoundData",
    });

    // Start all three calls in parallel (don't call .result() yet)
    const descPromise = evmClient.callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: feedAddr,
        data: descCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    });

    const decimalsPromise = evmClient.callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: feedAddr,
        data: decimalsCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    });

    const roundPromise = evmClient.callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: feedAddr,
        data: roundCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    });

    // Step 2: Resolve all calls in parallel
    runtime.log("[Step 2] Executing parallel EVM calls...");
    
    const descResult = descPromise.result();
    const decimalsResult = decimalsPromise.result();
    const roundResult = roundPromise.result();

    const description = decodeFunctionResult({
      abi: DESCRIPTION_ABI,
      functionName: "description",
      data: bytesToHex(descResult.data),
    }) as string;

    runtime.log(`  Feed: ${description}`);

    const decimals = decodeFunctionResult({
      abi: DECIMALS_ABI,
      functionName: "decimals",
      data: bytesToHex(decimalsResult.data),
    }) as number;

    runtime.log(`  Decimals: ${decimals}`);

    const [roundId, answer, _startedAt, updatedAt, _answeredInRound] = decodeFunctionResult({
      abi: LATEST_ROUND_DATA_ABI,
      functionName: "latestRoundData",
      data: bytesToHex(roundResult.data),
    }) as [bigint, bigint, bigint, bigint, bigint];

    // Step 3: Calculate health
    const price = Number(answer) / Math.pow(10, decimals);
    const updatedAtDate = new Date(Number(updatedAt) * 1000);
    const now = new Date();
    const stalenessMs = now.getTime() - updatedAtDate.getTime();
    const stalenessMinutes = stalenessMs / 60000;
    const thresholdMinutes = config.stalenessThresholdMinutes;

    let status: string;
    if (stalenessMinutes < thresholdMinutes) {
      status = "OK";
    } else if (stalenessMinutes < thresholdMinutes * 3) {
      status = "WARN";
    } else {
      status = "FAIL";
    }

    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log(`  Feed:      ${description}`);
    runtime.log(`  Price:     $${price.toFixed(2)}`);
    runtime.log(`  Round ID:  ${roundId}`);
    runtime.log(`  Updated:   ${updatedAtDate.toISOString()}`);
    runtime.log(`  Staleness: ${stalenessMinutes.toFixed(1)} minutes`);
    runtime.log(`  Status:    ${status}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const summary = `${config.feedName}: ${status} (${price.toFixed(2)}, ${stalenessMinutes.toFixed(1)}m stale)`;
    runtime.log(summary);
    return summary;
  } catch (error) {
    runtime.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
