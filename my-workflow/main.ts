import { cre, Runner, type Runtime, type CronPayload, getNetwork } from "@chainlink/cre-sdk";
import { encodeFunctionData, decodeFunctionResult, zeroAddress } from "viem";
import { encodeCallMsg, bytesToHex, LAST_FINALIZED_BLOCK_NUMBER } from "@chainlink/cre-sdk";
import { z } from "zod";

const configSchema = z.object({
  schedule: z.string(),
  feedAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  feedName: z.string(),
  stalenessThresholdMinutes: z.number().positive(),
  chainSelectorName: z.string(),
  isTestnet: z.boolean(),
});

type Config = z.infer<typeof configSchema>;

const AGGREGATOR_V3_ABI = {
  latestRoundData: [
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
  ] as const,
  description: [
    {
      name: "description",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: "", type: "string" }],
    },
  ] as const,
  decimals: [
    {
      name: "decimals",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: "", type: "uint8" }],
    },
  ] as const,
};

function onCronTrigger(runtime: Runtime<Config>, _payload: CronPayload) {
  const config = configSchema.parse(runtime.config);

  runtime.log(`Feed Health Monitor: ${config.feedName}`);

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

  const descData = encodeFunctionData({
    abi: AGGREGATOR_V3_ABI.description,
    functionName: "description",
  });

  const decimalsData = encodeFunctionData({
    abi: AGGREGATOR_V3_ABI.decimals,
    functionName: "decimals",
  });

  const roundData = encodeFunctionData({
    abi: AGGREGATOR_V3_ABI.latestRoundData,
    functionName: "latestRoundData",
  });

  const descPromise = evmClient.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to: feedAddr, data: descData }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  });

  const decimalsPromise = evmClient.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to: feedAddr, data: decimalsData }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  });

  const roundPromise = evmClient.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to: feedAddr, data: roundData }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  });

  const description = decodeFunctionResult({
    abi: AGGREGATOR_V3_ABI.description,
    functionName: "description",
    data: bytesToHex(descPromise.result().data),
  }) as string;

  const decimals = decodeFunctionResult({
    abi: AGGREGATOR_V3_ABI.decimals,
    functionName: "decimals",
    data: bytesToHex(decimalsPromise.result().data),
  }) as number;

  const [roundId, answer, , updatedAt] = decodeFunctionResult({
    abi: AGGREGATOR_V3_ABI.latestRoundData,
    functionName: "latestRoundData",
    data: bytesToHex(roundPromise.result().data),
  }) as [bigint, bigint, bigint, bigint, bigint];

  const price = Number(answer) / 10 ** decimals;
  const updatedAtDate = new Date(Number(updatedAt) * 1000);
  const stalenessMinutes = (Date.now() - updatedAtDate.getTime()) / 60000;
  const threshold = config.stalenessThresholdMinutes;

  const status =
    stalenessMinutes < threshold ? "OK" : stalenessMinutes < threshold * 3 ? "WARN" : "FAIL";

  runtime.log(`Feed:      ${description}`);
  runtime.log(`Price:     $${price.toFixed(2)}`);
  runtime.log(`Round ID:  ${roundId}`);
  runtime.log(`Updated:   ${updatedAtDate.toISOString()}`);
  runtime.log(`Staleness: ${stalenessMinutes.toFixed(1)} minutes`);
  runtime.log(`Status:    ${status}`);

  return `${config.feedName}: ${status} ($${price.toFixed(2)}, ${stalenessMinutes.toFixed(1)}m)`;
}

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
