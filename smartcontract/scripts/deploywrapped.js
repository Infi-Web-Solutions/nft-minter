const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying contracts with:", deployer.address);

  // -------------------------
  // 1. Deploy FeeManager
  // -------------------------
  const FeeManager = await ethers.getContractFactory("FeeManager");
  const feeManager = await FeeManager.deploy();
  await feeManager.waitForDeployment();

  console.log("📌 FeeManager deployed at:", feeManager.target);

  // -------------------------
  // 2. Deploy WrappedLeasing (UUPS Proxy)
  // -------------------------
  const WrappedLeasing = await ethers.getContractFactory("WrappedLeasing");

  const wrappedLeasing = await upgrades.deployProxy(
    WrappedLeasing,
    [
      deployer.address,  // admin address
      feeManager.target  // FeeManager address
    ],
    {
      initializer: "initialize",
      kind: "uups"
    }
  );

  await wrappedLeasing.waitForDeployment();

  console.log("🎉 WrappedLeasing Proxy deployed at:", wrappedLeasing.target);

  const implAddress = await upgrades.erc1967.getImplementationAddress(wrappedLeasing.target);
  console.log("🧩 Implementation deployed at:", implAddress);

  console.log("\n🔥 Deployment Completed Successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
