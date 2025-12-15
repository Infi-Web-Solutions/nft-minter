const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("FeeManager", function () {
  let feeManager;
  let admin, other, treasury, treasury2;

  beforeEach(async () => {
    [admin, other, treasury, treasury2] = await ethers.getSigners();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await upgrades.deployProxy(
      FeeManager,
      [
        admin.address,
        250,     // marketplace bps
        1000,    // lending bps
        300,     // leasing bps
        treasury.address
      ],
      { kind: "uups", initializer: "initialize" }
    );
    await feeManager.waitForDeployment();
  });

  it("initializes correctly", async () => {
    expect(await feeManager.marketplaceFeeBps()).to.equal(250);
    expect(await feeManager.lendingAprBps()).to.equal(1000);
    expect(await feeManager.leasingFeeBps()).to.equal(300);
    expect(await feeManager.treasury()).to.equal(treasury.address);
  });

  it("allows admin to set fees within bounds", async () => {
    await feeManager.connect(admin).setMarketplaceFeeBps(500);
    expect(await feeManager.marketplaceFeeBps()).to.equal(500);

    await feeManager.connect(admin).setLendingAprBps(1500);
    expect(await feeManager.lendingAprBps()).to.equal(1500);

    await feeManager.connect(admin).setLeasingFeeBps(400);
    expect(await feeManager.leasingFeeBps()).to.equal(400);
  });

  it("rejects fees above caps", async () => {
    await expect(feeManager.connect(admin).setMarketplaceFeeBps(2001)).to.be.revertedWith("market fee too high");
    await expect(feeManager.connect(admin).setLendingAprBps(20001)).to.be.revertedWith("apr too high");
    await expect(feeManager.connect(admin).setLeasingFeeBps(2001)).to.be.revertedWith("lease fee too high");
  });

  it("only admin can set values", async () => {
    await expect(feeManager.connect(other).setMarketplaceFeeBps(300)).to.be.revertedWithCustomError(feeManager, "AccessControlUnauthorizedAccount");
    await expect(feeManager.connect(other).setTreasury(treasury2.address)).to.be.revertedWithCustomError(feeManager, "AccessControlUnauthorizedAccount");
  });

  it("prevents zero treasury", async () => {
    await expect(feeManager.connect(admin).setTreasury(ethers.ZeroAddress)).to.be.revertedWith("zero address");
  });

  it("calcBps works", async () => {
    expect(await feeManager.calcBps(10000, 250)).to.equal(250);
    expect(await feeManager.calcBps(1_000_000, 1000)).to.equal(100000);
  });

  it("pauses setters when paused", async () => {
    await feeManager.connect(admin).pause();
    await expect(feeManager.connect(admin).setMarketplaceFeeBps(300)).to.be.revertedWithCustomError(feeManager, "EnforcedPause");
    await feeManager.connect(admin).unpause();
    await feeManager.connect(admin).setMarketplaceFeeBps(300);
    expect(await feeManager.marketplaceFeeBps()).to.equal(300);
  });

  it("only pauser can pause/unpause", async () => {
    await expect(feeManager.connect(other).pause()).to.be.revertedWithCustomError(feeManager, "AccessControlUnauthorizedAccount");
    await feeManager.connect(admin).pause();
    await expect(feeManager.connect(other).unpause()).to.be.revertedWithCustomError(feeManager, "AccessControlUnauthorizedAccount");
    await feeManager.connect(admin).unpause();
  });
});

