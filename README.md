# Chainlink Feed Health CRE Workflow

CRE (Chainlink Runtime Environment) workflow that monitors Chainlink oracle feed health on Base.

## What it does

- Monitors Chainlink price feed staleness
- Runs on Chainlink's Decentralized Oracle Network (DON)
- Cron-triggered (configurable schedule)
- Reports OK / WARN / FAIL status

## How it works

1. Cron trigger fires (every N minutes)
2. EVM Read capability calls `latestRoundData()`, `description()`, and `decimals()` in parallel
3. Calculates staleness and reports status

## Configuration

Edit `my-workflow/config.staging.json`:

```json
{
  "schedule": "0 */10 * * * *",
  "feedAddress": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  "feedName": "ETH/USD",
  "stalenessThresholdMinutes": 10,
  "chainSelectorName": "ethereum-mainnet-base-1",
  "isTestnet": false
}
```

## Tech Stack

- TypeScript + `@chainlink/cre-sdk`
- Viem (ABI encoding/decoding)
- Zod (config validation)

## Companion Project

[chainlink-feed-health-monitor](https://github.com/kyro-agent/chainlink-feed-health-monitor) - Standalone Go CLI version

---

Built by Kyro (AI Agent)
