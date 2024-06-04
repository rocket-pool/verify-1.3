const ethers = require('ethers')
const fetch = require('node-fetch')
const fs = require('fs')
require('colors')
const Diff = require('diff')
require('dotenv').config()

const etherscanApiKey = process.env.ETHERSCAN_API_KEY

// Mapping of view method names to which contract they should point to
const contractMap = {
  rocketNetworkSnapshots: 'RocketNetworkSnapshots',
  rocketNetworkVoting: 'RocketNetworkVoting',
  rocketDAOProtocolSettingsProposals: 'RocketDAOProtocolSettingsProposals',
  rocketDAOProtocolVerifier: 'RocketDAOProtocolVerifier',
  rocketDAOSecurity: 'RocketDAOSecurity',
  rocketDAOSecurityActions: 'RocketDAOSecurityActions',
  rocketDAOSecurityProposals: 'RocketDAOSecurityProposals',
  rocketDAOProtocolSettingsSecurity: 'RocketDAOProtocolSettingsSecurity',
  rocketDAOProtocolProposal: 'RocketDAOProtocolProposal',
  newRocketDAOProtocol: 'RocketDAOProtocol',
  newRocketDAOProtocolProposals: 'RocketDAOProtocolProposals',
  newRocketNetworkPrices: 'RocketNetworkPrices',
  newRocketNodeDeposit: 'RocketNodeDeposit',
  newRocketNodeManager: 'RocketNodeManager',
  newRocketNodeStaking: 'RocketNodeStaking',
  newRocketClaimDAO: 'RocketClaimDAO',
  newRocketDAOProtocolSettingsRewards: 'RocketDAOProtocolSettingsRewards',
  newRocketMinipoolManager: 'RocketMinipoolManager',
  newRocketRewardsPool: 'RocketRewardsPool',
  newRocketNetworkBalances: 'RocketNetworkBalances',
  newRocketDAOProtocolSettingsNetwork: 'RocketDAOProtocolSettingsNetwork',
  newRocketDAOProtocolSettingsAuction: 'RocketDAOProtocolSettingsAuction',
  newRocketDAOProtocolSettingsDeposit: 'RocketDAOProtocolSettingsDeposit',
  newRocketDAOProtocolSettingsInflation: 'RocketDAOProtocolSettingsInflation',
  newRocketDAOProtocolSettingsMinipool: 'RocketDAOProtocolSettingsMinipool',
  newRocketDAOProtocolSettingsNode: 'RocketDAOProtocolSettingsNode',
  newRocketMerkleDistributorMainnet: 'RocketMerkleDistributorMainnet',
}

// Create new ethers provider
const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC)

// Set parameter per network
let upgradeAddress, etherscanApiUrl
switch (process.env.NETWORK) {
  case 'holesky':
    upgradeAddress = '0xa38f23783358e6Ce576441525bE0Ad6Dab5B0eF4'
    etherscanApiUrl = 'https://api-holesky.etherscan.io'
    break
  case 'mainnet':
    upgradeAddress = '0x5dC69083B68CDb5c9ca492A0A5eC581e529fb73C'
    etherscanApiUrl = 'https://api.etherscan.io'
    break
  default:
    console.error(`Invalid network ${process.env.NETWORK}`)
    process.exit(1)
}

// Prints diff between a and d with console colors
function printDiff (a, b) {
  const diff = Diff.diffChars(a, b)

  diff.forEach((part) => {
    const color = part.added ? 'green' : part.removed ? 'red' : 'grey'
    process.stderr.write(part.value[color])
  })

  console.log()
}

let lastRequestTime

// Gets verified sources from etherscan (thanks Patches)
async function getVerifiedSources (address) {
  const url = `${etherscanApiUrl}/api?module=contract&action=getsourcecode&address=${address}&apikey=${etherscanApiKey}`

  // etherscan api rate limits to 5 calls per second. Wait 0.22 seconds between calls.
  var now = new Date()
  if (lastRequestTime != undefined && now - lastRequestTime < 220) {
    await new Promise((resolve) => {
      setTimeout(resolve, now - lastRequestTime)
    })
  }
  lastRequestTime = new Date()
  const response = await fetch(url)
  const data = await response.json()

  if (data.message !== 'OK') {
    console.error(
      '❌ Something went wrong getting verified source from etherscan')
    console.log(data)
    process.exit(1)
  }

  if (data.result[0].SourceCode.startsWith('{{')) {
    return JSON.parse(data.result[0].SourceCode.slice(1, -1))
  }

  // If the response isn't json, it's the plain text source of the contract
  return data.result[0].SourceCode
}

async function verifyTruffleArtifact (contractName, address) {
  // Grab the verified source from etherscan
  const source = await getVerifiedSources(address)

  // Load in the preamble
  const preamble = fs.readFileSync('rocketpool/scripts/preamble.sol')

  if (source.sources !== undefined) {
    // Loop over verified sources
    for (const path in source.sources) {

      let expectedSource

      if (path[0] === '@') {
        // Load third party dependency from node_modules in the git repo
        expectedSource = fs.readFileSync(`rocketpool/node_modules/${path}`).
          toString()
      } else {
        // Construct the expected source by adding the preamble to the source file from the git repo
        expectedSource = preamble +
          fs.readFileSync(`rocketpool/${path}`).toString()
      }

      // Updates were made to some contracts on Goerli after initial verification. They have to be ignored because you cannot reverify
      // contract on Etherscan after the initial verification
      if (
        process.env.NETWORK === 'holesky' &&
        (
          (
            (
              contractName == 'RocketDAOProtocolVerifier' ||
              contractName == 'RocketDAOProtocolProposal' ||
              contractName == 'RocketDAOProtocolProposals'
            )
            &&
            (
              path ===
              'contracts/interface/dao/protocol/RocketDAOProtocolVerifierInterface.sol' ||
              path ===
              'contracts/interface/network/RocketNetworkVotingInterface.sol'
            )
          )
        )
      ) {
        continue
      }

      const actualSource = source.sources[path].content

      // Compare the two
      if (expectedSource !== actualSource) {
        console.error(
          `❌ Unexpected source file ${path} found at ${address} for ${contractName}`.red)
        printDiff(expectedSource, actualSource)
        process.exit(1)
      }
    }
  } else {
    // All Rocket Pool contracts have multiple source files so error if only a single was returned
    console.error(
      `❌ Unexpected source found at ${address} for ${contractName}`.red)
    process.exit(1)
  }

  console.log(`✔️Verified contract at ${address} matches ${contractName}`.green)
}

async function go () {
  // Verify the upgrade contract itself
  await verifyTruffleArtifact('RocketUpgradeOneDotThree', upgradeAddress)

  // Construct ABI and contract instance to call all the view methods on upgrade contract
  const upgradeAbi = ['function locked() view returns(bool)']
  for (const method in contractMap) {
    upgradeAbi.push(`function ${method}() view returns (address)`)
  }
  const contract = new ethers.Contract(upgradeAddress, upgradeAbi, provider)

  // Loop over methods, call them and then verify the address they return has correct verified source code
  for (const method in contractMap) {
    const address = await contract[method]()
    await verifyTruffleArtifact(contractMap[method], address)
  }

  const locked = await contract.locked()

  if (!locked) {
    console.error(`❌ Upgrade contract is not locked`.red)
    process.exit(1)
  } else {
    // If we made it here then it was successful (failures exit early)
    console.log('✔ Verification successful'.green)
  }
}

go()
