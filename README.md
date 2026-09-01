# English Auction

An on-chain English auction for ERC-721 tokens, built with Hardhat.

Sellers list an NFT by transferring it into the auction contract; bidders compete with ascending bids until the deadline; the winner receives the NFT and the seller receives the proceeds. Refunds and failed payouts go through a withdrawal pattern rather than being pushed out during settlement.

---

## Overview

**Listing.** There is no `createAuction` function. An auction is opened by sending the NFT to the contract with `safeTransferFrom(seller, auction, tokenId, data)`, where `data` is `abi.encode(startTime, endTime, startPrice)`. The `onERC721Received` hook checks that the caller is a contract, that it advertises ERC-721 support through ERC-165, and only then records the auction. Transfer and listing become a single atomic step.

**Bidding.** The first bid must be at least `startPrice`. Every bid after that must be at least 10% above the current price. When a bid is outbid, the previous amount is credited to that bidder's balance instead of being sent back immediately.

**Settlement.** After `endTime`, anyone can call `settle`. With no bids the NFT returns to the seller and the auction is marked `Unsold`. With a winning bid the NFT goes to the highest bidder and the proceeds are sent to the seller. If that transfer fails — a contract seller with no `receive`, for example — the amount is credited to the seller's balance instead, so a seller cannot block settlement.

**Withdrawals.** `withdraw` pays out an account's accumulated balance: outbid refunds, and seller proceeds that could not be delivered. The balance is zeroed before the transfer.

### States

```
NotStarted ──▶ Ongoing ──▶ Ended ──┬──▶ Sold     (had a bid)
                                   └──▶ Unsold   (no bids)
```

`Ongoing` and `Ended` are derived from block timestamps. `Sold` and `Unsold` are terminal and stored.

### Checks applied at listing

| Rule | Reason |
|---|---|
| `startTime > block.timestamp + 10 minutes` | Buffer so an auction cannot open in the block it is created |
| `endTime > startTime` | Non-empty bidding window |
| `startPrice != 0` | A zero reserve makes the 10% increment meaningless |
| `data.length == 96` | Exactly three ABI-encoded parameters |
| ERC-165 check for `0x80ac58cd` | Rejects tokens that are not ERC-721 |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```shell
git clone https://github.com/jinzm10162/English-Auction.git
cd English-Auction
npm install
```

### Usage

```shell
npx hardhat compile         # compile contracts
npm test                    # run the test suite
npx hardhat node            # start a local node
REPORT_GAS=true npm test    # run tests with a gas report
```

---

## Tests

```
35 passing
```

The suite covers each entry point and the state machine around it:

| Block | Coverage |
|---|---|
| `#onERC721Received` | Listing validation: non-contract callers, non-ERC-721 tokens, malformed `data`, invalid time windows, zero start price |
| `#nftExists` | Out-of-range auction indexes |
| `#nftState` | Transitions across `startTime` / `endTime`, and terminal states |
| `#bid` | Seller self-bidding, bids below the reserve, bids below the 10% increment, refund crediting on outbid |
| `#settle` | Every state guard, the sold and unsold paths, and a seller that rejects the payout |
| `#withdraw` | Empty balance, successful payout, and a withdrawer that rejects the transfer |

Solidity test doubles live in `contracts/test-helpers/`: a plain ERC-721, a seller contract that refuses ETH, and a contract-based caller. They exist only to drive the tests and are not part of any deployment.

---

## Project Structure

```
contracts/
├── EnglishAuction.sol            Listing, bidding, settlement, withdrawal
├── EnglishAuctionBase.sol        Storage layout and shared modifiers
├── interface/
│   └── IEnglishAuction.sol       External interface, events, custom errors
└── test-helpers/
    ├── NFT.sol                   Minimal ERC-721
    ├── Seller.sol                Seller that rejects incoming ETH
    └── CallAuction.sol           Contract-based caller

test/
└── EnglishAuction.js             35 tests
```

Solidity `0.8.24`, EVM `cancun`, optimizer enabled at 200 runs.

---

## Notes

Unaudited learning project. Do not deploy to mainnet or use with real funds.

## License

MIT
