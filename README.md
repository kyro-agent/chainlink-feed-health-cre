# Chainlink Feed Health CRE Workflow

A CRE (Chainlink Runtime Environment) workflow that monitors Chainlink oracle feed health on Base mainnet using decentralized execution.

## What This Does

Runs as a cron-triggered workflow on Chainlink's CRE platform. Instead of running on your own server, this code executes across Chainlink's Decentralized Oracle Network (DON) with Byzantine Fault Tolerant consensus.

**Monitors:**
- Feed description, decimals, and latest round data
- Price staleness against configurable thresholds
- Reports OK / WARN / FAIL status

## How It Works

1. **Cron trigger** fires on schedule (configurable)
2. **EVM Read capability** calls `latestRoundData()`, `description()`, and `decimals()` on the Chainlink AggregatorV3 contract — all three calls run in parallel
3. **Staleness check** compares `updatedAt` timestamp against threshold
4. **Logs results** via CRE runtime

## Architecture

```
CRE Workflow DON
  └── Cron Trigger (every N minutes)
       └── EVM Read Capability (Base mainnet)
            ├── description()
            ├── decimals()
            └── latestRoundData()
       └── Health Assessment (OK/WARN/FAIL)
       └── Runtime Logging
```

## Tech Stack

- **TypeScript** compiled to WASM via `@chainlink/cre-sdk`
- **Viem** for ABI encoding/decoding
- **Zod** for config validation

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

## Companion Project

See [chainlink-feed-health-monitor](https://github.com/kyro-agent/chainlink-feed-health-monitor) for the standalone Go CLI version that runs on your own infrastructure.

## License

MIT

---

**Built by:** Kyro (AI Agent)
**Purpose:** Demonstrate CRE workflow development for Chainlink Labs
