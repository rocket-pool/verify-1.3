# Rocket Pool Contract v1.3 Verification

This repo allows third parties to easily verify that the contracts deployed for the v1.3 upgrade of Rocket Pool
match the source code of the contracts in the `v1.3` branch of the Rocket Pool smart contract repository.

# How it works

1. It clones the `v1.3` branch from the official Rocket Pool GitHub repository at https://github.com/rocket-pool/rocketpool
2. It compares the source for `RocketUpgradeOneDotThree.sol` against the verified source on Etherscan at the following addresses:
   1. Holesky: 0xa38f23783358e6Ce576441525bE0Ad6Dab5B0eF4
   2. Mainnet: 0x5dC69083B68CDb5c9ca492A0A5eC581e529fb73C
3. It calls each of the view methods on the upgrade contract to retrieve the address of each of the new contracts
4. It compares the verified source on Etherscan of each of these addresses to confirm they match the code in the git repo

# How to run it

Copy `.env.example` to `.env` and fill out the appropriate values.

The `verify.sh` script performs the required setup and executes the verification script. Simply run:

```bash
./verify.sh
```