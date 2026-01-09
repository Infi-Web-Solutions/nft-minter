const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("LeasingMarketplace", function () {
  let feeManager, wrapped, market, nft;
  let admin, owner, renter, treasury, other;

  const leasingFeeBps = 300; // 3%
  const customPlatformBps = 200; // 2%
  const customWrapBps = 100;     // 1%
  const customDepositBps = 4000; // 40%

  const fastForward = async (seconds) => {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  };

  beforeEach(async () => {
    [admin, owner, renter, treasury, other] = await ethers.getSigners();

    // Deploy mocks
    const TestNFT = await ethers.getContractFactory("TestNFT");
    nft = await TestNFT.deploy();
    await nft.waitForDeployment();

    // FeeManager (UUPS)
    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await upgrades.deployProxy(
      FeeManager,
      [
        admin.address,
        200,          // marketplace fee (not used here)
        1000,         // lending apr (not used here)
        leasingFeeBps,
        treasury.address
      ],
      { kind: "uups", initializer: "initialize" }
    );
    await feeManager.waitForDeployment();

    // WrappedLeasing (UUPS)
    const WrappedLeasing = await ethers.getContractFactory("WrappedLeasing");
    wrapped = await upgrades.deployProxy(
      WrappedLeasing,
      [admin.address, feeManager.target],
      { kind: "uups", initializer: "initialize" }
    );
    await wrapped.waitForDeployment();

    // LeasingMarketplace (UUPS)
    const LeasingMarketplace = await ethers.getContractFactory("LeasingMarketplace");
    market = await upgrades.deployProxy(
      LeasingMarketplace,
      [admin.address, feeManager.target, wrapped.target],
      { kind: "uups", initializer: "initialize" }
    );
    await market.waitForDeployment();
  });

  it("lists, rents, refunds deposit, and withdraws balances", async () => {
    // Mint and approve
    await nft.mint(owner.address, 1);
    await nft.connect(owner).approve(market.target, 1);

    const pricePerSecond = ethers.parseEther("0.0001"); // rent rate
    const minDuration = 3600; // 1 hour
    const maxDuration = 7200; // 2 hours
    const duration = 4000;    // within range

    // List
    await market.connect(owner).listForRent(nft.target, 1, pricePerSecond, minDuration, maxDuration);
    const ls = await market.listings(1);
    expect(ls.owner).to.equal(owner.address);
    expect(ls.status).to.equal(1); // Active

    // Rent
    const rentAmount = pricePerSecond * BigInt(duration);
    const deposit = rentAmount / 2n;
    const platformFee = (rentAmount * BigInt(leasingFeeBps)) / 10000n;
    const wrapFee = (BigInt(duration) * BigInt(leasingFeeBps)) / 10000n; // mirrors contract calc
    const total = rentAmount + deposit + platformFee + wrapFee;

    const tx = await market.connect(renter).rent(1, duration, { value: total });
    const receipt = await tx.wait();
    const rentedEvent = receipt.logs.find((log) => log.fragment && log.fragment.name === "LeaseRented");
    expect(rentedEvent).to.not.be.undefined;

    const rental = await market.rentals(1);
    expect(rental.renter).to.equal(renter.address);
    expect(rental.deposit).to.equal(deposit);

    // Owner and treasury balances recorded
    expect(await market.pendingBalances(owner.address)).to.equal(rentAmount);
    expect(await market.pendingBalances(treasury.address)).to.equal(platformFee);

    // Fast forward past expiry
    await fastForward(duration + 10);

    // Renter claims deposit
    await market.connect(renter).refundDeposit(1);
    expect(await market.pendingBalances(renter.address)).to.equal(deposit);

    // Withdrawals
    const ownerBalBefore = await ethers.provider.getBalance(owner.address);
    await market.connect(owner).withdraw();
    const ownerBalAfter = await ethers.provider.getBalance(owner.address);
    expect(ownerBalAfter).to.be.gt(ownerBalBefore);

    const renterBalBefore = await ethers.provider.getBalance(renter.address);
    await market.connect(renter).withdraw();
    const renterBalAfter = await ethers.provider.getBalance(renter.address);
    expect(renterBalAfter).to.be.gt(renterBalBefore);

    const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
    await market.connect(treasury).withdraw();
    const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryBalAfter).to.be.gt(treasuryBalBefore);
  });

  it("allows owner/admin to cancel before renting", async () => {
    await nft.mint(owner.address, 2);
    await nft.connect(owner).approve(market.target, 2);

    await market.connect(owner).listForRent(nft.target, 2, ethers.parseEther("0.0001"), 100, 200);
    await market.connect(owner).cancelListing(1);

    const ls = await market.listings(1);
    expect(ls.status).to.equal(3); // Cancelled
    expect(await nft.ownerOf(2)).to.equal(owner.address);
  });

  it("rejects rent if duration out of range", async () => {
    await nft.mint(owner.address, 3);
    await nft.connect(owner).approve(market.target, 3);

    await market.connect(owner).listForRent(nft.target, 3, ethers.parseEther("0.0001"), 100, 200);
    await expect(
      market.connect(renter).rent(1, 50, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("duration out of range");
  });

  it("respects configurable fees and deposit bps", async () => {
    await nft.mint(owner.address, 4);
    await nft.connect(owner).approve(market.target, 4);

    // Keep wrap fee aligned to FeeManager leasing bps to avoid underpayment
    await market.connect(admin).setFees(customPlatformBps, leasingFeeBps);
    await market.connect(admin).setDepositBps(customDepositBps);

    const pricePerSecond = ethers.parseEther("0.0002");
    const duration = 3000;

    await market.connect(owner).listForRent(nft.target, 4, pricePerSecond, 1000, 4000);

    const rentAmount = pricePerSecond * BigInt(duration);
    const deposit = (rentAmount * BigInt(customDepositBps)) / 10000n;
    const platformFee = (rentAmount * BigInt(customPlatformBps)) / 10000n;
    const wrapFee = (BigInt(duration) * BigInt(leasingFeeBps)) / 10000n; // pay enough for WrappedLeasing fee
    const total = rentAmount + deposit + platformFee + wrapFee;

    await market.connect(renter).rent(1, duration, { value: total });

    expect(await market.pendingBalances(owner.address)).to.equal(rentAmount);
    expect(await market.pendingBalances(treasury.address)).to.equal(platformFee);
  });

  it("getTotalCost matches rent calculation", async () => {
    await nft.mint(owner.address, 5);
    await nft.connect(owner).approve(market.target, 5);
    const pricePerSecond = ethers.parseEther("0.0002");
    const duration = 2000;
    await market.connect(owner).listForRent(nft.target, 5, pricePerSecond, 1000, 4000);

    const res = await market.getTotalCost(1, duration); // listingId = 1 in this test scope
    const rentAmount = pricePerSecond * BigInt(duration);
    const deposit = rentAmount / 2n; // default 50%
    const platformFee = (rentAmount * BigInt(leasingFeeBps)) / 10000n;
    const wrapFee = (BigInt(duration) * BigInt(leasingFeeBps)) / 10000n;
    const total = rentAmount + deposit + platformFee + wrapFee;

    expect(res[0]).to.equal(rentAmount);
    expect(res[1]).to.equal(deposit);
    expect(res[2]).to.equal(platformFee);
    expect(res[3]).to.equal(wrapFee);
    expect(res[4]).to.equal(total);
  });

  it("emergencyWithdraw returns NFT when not rented", async () => {
    await nft.mint(owner.address, 6);
    await nft.connect(owner).approve(market.target, 6);
    await market.connect(owner).listForRent(nft.target, 6, ethers.parseEther("0.0001"), 100, 200);

    await market.connect(admin).emergencyWithdraw(1, owner.address); // listingId = 1 in this test scope
    expect(await nft.ownerOf(6)).to.equal(owner.address);
  });

  it("pauses rent/list when paused", async () => {
    await market.connect(admin).pause();
    await expect(
      market.connect(owner).listForRent(nft.target, 5, ethers.parseEther("0.0001"), 100, 200)
    ).to.be.revertedWithCustomError(market, "EnforcedPause");
  });
});

