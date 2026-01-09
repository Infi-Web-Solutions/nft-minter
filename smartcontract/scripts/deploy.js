const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
};

async function main() {
  const startTime = Date.now();
  
  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}  NFT MARKETPLACE - PRODUCTION DEPLOYMENT${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}\n`);

  try {
    // Get network information
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = network.chainId;
    const networkName = network.name;
    
    console.log(`${colors.yellow}Network Information:${colors.reset}`);
    console.log(`  Network: ${networkName} (Chain ID: ${chainId})`);
    console.log(`  Deployer: ${deployer.address}`);
    
    // Get deployer balance
    const balance = await ethers.provider.getBalance(deployer.address);
    const balanceInEth = ethers.formatEther(balance);
    console.log(`  Balance: ${balanceInEth} ETH\n`);

    // Check if balance is sufficient
    if (balance < ethers.parseEther("0.1")) {
      console.log(`${colors.red}⚠️  WARNING: Low balance! You may not have enough to deploy and call functions.${colors.reset}\n`);
    }

    // Get gas price (with fallback for different ethers versions)
    let gasPrice = null;
    try {
      gasPrice = await ethers.provider.getGasPrice();
    } catch (e) {
      try {
        const feeData = await ethers.provider.getFeeData();
        gasPrice = feeData.gasPrice;
      } catch (e2) {
        console.log(`  Gas Price: Unable to fetch (not critical)\n`);
      }
    }
    
    if (gasPrice) {
      console.log(`${colors.yellow}Gas Information:${colors.reset}`);
      console.log(`  Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} gwei\n`);
    }

    console.log(`${colors.yellow}Deployment Starting...${colors.reset}`);
    
    // Get the contract factory
    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    
    // Deploy the contract
    console.log("  Deploying contract to blockchain...");
    const nftMarketplace = await NFTMarketplace.deploy();
    
    // Wait for deployment to finish
    const deploymentTx = nftMarketplace.deploymentTransaction();
    console.log(`  Transaction Hash: ${deploymentTx.hash}`);
    
    await nftMarketplace.waitForDeployment();
    
    const address = await nftMarketplace.getAddress();
    const deploymentTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`${colors.green}✓ Deployment successful!${colors.reset}\n`);

    // Verify contract state
    console.log(`${colors.yellow}Contract Verification:${colors.reset}`);
    console.log(`  Name: ${await nftMarketplace.name()}`);
    console.log(`  Symbol: ${await nftMarketplace.symbol()}`);
    console.log(`  Owner: ${await nftMarketplace.owner()}`);
    console.log(`  Marketplace Fee: ${await nftMarketplace.marketplaceFee()} basis points (2.5%)`);
    console.log(`  Contract Paused: ${await nftMarketplace.paused()}\n`);

    // Get deployment receipt for gas used
    let receipt = null;
    try {
      receipt = await ethers.provider.getTransactionReceipt(deploymentTx.hash);
    } catch (e) {
      // Receipt not available yet
    }
    
    if (receipt && gasPrice) {
      console.log(`${colors.yellow}Gas Usage:${colors.reset}`);
      console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
      const gasCost = receipt.gasUsed * gasPrice;
      console.log(`  Gas Cost: ${ethers.formatEther(gasCost)} ETH\n`);
    }

    // Display final information
    console.log(`${colors.bright}${colors.green}DEPLOYMENT SUMMARY${colors.reset}`);
    console.log(`${colors.blue}${"─".repeat(50)}${colors.reset}`);
    console.log(`${colors.bright}Contract Address:${colors.reset} ${address}`);
    console.log(`${colors.bright}Network:${colors.reset} ${networkName} (Chain ${chainId})`);
    console.log(`${colors.bright}Deployer:${colors.reset} ${deployer.address}`);
    console.log(`${colors.bright}Deployment Time:${colors.reset} ${deploymentTime}s`);
    console.log(`${colors.blue}${"─".repeat(50)}${colors.reset}\n`);

    // Save deployment info to file
    const deploymentInfo = {
      network: networkName,
      chainId: chainId,
      contractAddress: address,
      contractName: "NFTMarketplace",
      deployer: deployer.address,
      deploymentTime: new Date().toISOString(),
      deploymentTimeMs: deploymentTime,
      owner: await nftMarketplace.owner(),
      marketplaceFee: (await nftMarketplace.marketplaceFee()).toString(),
      transactionHash: deploymentTx.hash,
    };

    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    // Save to file with custom JSON replacer to handle BigInt
    const filename = path.join(deploymentsDir, `${networkName}-deployment.json`);
    fs.writeFileSync(
      filename, 
      JSON.stringify(deploymentInfo, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }, 2)
    );
    console.log(`${colors.green}✓ Deployment info saved to: ${filename}${colors.reset}\n`);

    // Save contract ABI to file
    const abiDir = path.join(__dirname, "../abi");
    if (!fs.existsSync(abiDir)) {
      fs.mkdirSync(abiDir, { recursive: true });
    }
    const abiPath = path.join(abiDir, "NFTMarketplace.json");
    fs.writeFileSync(
      abiPath, 
      JSON.stringify(NFTMarketplace.interface.formatJson(), (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }, 2)
    );
    console.log(`${colors.green}✓ Contract ABI saved to: ${abiPath}${colors.reset}\n`);

    // Print next steps
    console.log(`${colors.bright}${colors.yellow}NEXT STEPS:${colors.reset}`);
    console.log(`  1. Copy the contract address: ${colors.bright}${address}${colors.reset}`);
    console.log(`  2. Update your frontend .env file with this address`);
    console.log(`  3. Update backend configuration with this address`);
    console.log(`  4. Set up Etherscan verification (optional):`);
    console.log(`     npx hardhat verify --network ${networkName} ${address}`);
    console.log(`  5. Run integration tests to verify functionality`);
    console.log(`  6. Monitor contract events on block explorer\n`);

    // Print block explorer link
    const explorerUrl = getExplorerUrl(chainId, address);
    if (explorerUrl) {
      console.log(`${colors.yellow}View on Block Explorer:${colors.reset}`);
      console.log(`  ${explorerUrl}\n`);
    }

    console.log(`${colors.bright}${colors.green}✓ DEPLOYMENT COMPLETE - Ready for production!${colors.reset}\n`);
    console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}\n`);

    return {
      address,
      owner: await nftMarketplace.owner(),
      network: networkName,
      chainId,
    };

  } catch (error) {
    console.log(`\n${colors.red}✗ DEPLOYMENT FAILED${colors.reset}\n`);
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
    
    if (error.message.includes("insufficient funds")) {
      console.log(`\n${colors.yellow}Solution:${colors.reset} Your account has insufficient funds to deploy.`);
      console.log(`  Get testnet ETH from a faucet and try again.`);
    } else if (error.message.includes("nonce")) {
      console.log(`\n${colors.yellow}Solution:${colors.reset} There may be a nonce issue.`);
      console.log(`  Try clearing your local nonce or waiting a moment and retrying.`);
    }
    
    process.exit(1);
  }
}

/**
 * Get block explorer URL based on chain ID
 */
function getExplorerUrl(chainId, address) {
  const explorers = {
    1: `https://etherscan.io/address/${address}`,
    5: `https://goerli.etherscan.io/address/${address}`,
    11155111: `https://sepolia.etherscan.io/address/${address}`,
    137: `https://polygonscan.com/address/${address}`,
    80001: `https://mumbai.polygonscan.com/address/${address}`,
    56: `https://bscscan.com/address/${address}`,
    97: `https://testnet.bscscan.com/address/${address}`,
    43113: `https://testnet.snowtrace.io/address/${address}`,
    43114: `https://snowtrace.io/address/${address}`,
    250: `https://ftmscan.com/address/${address}`,
    4002: `https://testnet.ftmscan.com/address/${address}`,
  };
  return explorers[chainId] || null;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 