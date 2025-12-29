const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("LeasingMarketplace Fixed-Duration", function () {
  let feeManager, wrapped, market, nft;
  let admin, owner, renter, treasury, other;

  const leasingFeeBps = 300; // 3%
  const customPlatformBps = 200; // 2%
  const customDepositBps = 5000; // 50%

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

    // Setup fees
    await market.connect(admin).setFees(customPlatformBps, leasingFeeBps);
  });

  it("lists with a fixed expiration window", async () => {
    await nft.mint(owner.address, 1);
    await nft.connect(owner).approve(market.target, 1);

    const pricePerSecond = ethers.parseEther("0.0001");
    const minDuration = 600;  // 10 mins
    const maxDuration = 3600; // 1 hour window

    const tx = await market.connect(owner).listForRent(nft.target, 1, pricePerSecond, minDuration, maxDuration);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'LeaseListed');
    const listingId = event.args[0];

    const ls = await market.listings(listingId);
    const block = await ethers.provider.getBlock("latest");

    expect(ls.status).to.equal(1); // Active
    expect(ls.listingExpiresAt).to.equal(BigInt(block.timestamp) + BigInt(maxDuration));
  });

  it("prevents rental exceeding the listing window", async () => {
    await nft.mint(owner.address, 2);
    await nft.connect(owner).approve(market.target, 2);

    const maxDuration = 3600;
    const tx = await market.connect(owner).listForRent(nft.target, 2, ethers.parseEther("0.0001"), 600, maxDuration);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'LeaseListed');
    const listingId = event.args[0];

    // Fast forward 30 mins (1800s)
    await fastForward(1800);

    // Try to rent for 40 mins (2400s) -> 1800 + 2400 = 4200 > 3600
    // Should fail
    const duration = 2400;
    // We expect this to fail due to duration, so we don't need accurate cost (it would revert anyway)
    await expect(
      market.connect(renter).rent(0, duration, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("exceeds listing window");

    // Rent for 20 mins (1200s) -> 1800 + 1200 = 3000 < 3600
    // Should pass
    const validDuration = 1200;
    const validCost = await market.getTotalCost(0, validDuration);
    await market.connect(renter).rent(0, validDuration, { value: validCost.totalRequired });

    const rental = await market.rentals(0);
    expect(rental.wId).to.be.gt(0);
  });

  it("relistRemaining updates maxDuration correctly", async () => {
    await nft.mint(owner.address, 3);
    await nft.connect(owner).approve(market.target, 3);

    // List for 1 hour
    // List for 1 hour
    const tx = await market.connect(owner).listForRent(nft.target, 3, ethers.parseEther("0.0001"), 600, 3600);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'LeaseListed');
    const listingId = event.args[0];

    // Rent for 10 mins
    const duration = 600;
    const cost = await market.getTotalCost(listingId, duration);
    await market.connect(renter).rent(listingId, duration, { value: cost.totalRequired });

    const rentalEvent = (await market.queryFilter("LeaseRented"))[0];
    const wId = rentalEvent.args.wId;

    // Fast forward past rental expiry
    await fastForward(600 + 10);

    // Unwrap wNFT
    await wrapped.connect(renter).unwrap(wId);

    // Relist remaining
    await market.relistRemaining(listingId);

    const ls = await market.listings(listingId);
    expect(ls.status).to.equal(1); // Active
    // Should have approx 50 mins left (3600 - 600 - small buffer)
    // We can check if it's strictly less than original maxDuration
    expect(ls.maxDuration).to.be.lt(3600);
    expect(ls.maxDuration).to.be.gt(2000);
  });

  it("finishExpiredListing returns NFT to owner", async () => {
    await nft.mint(owner.address, 4);
    await nft.connect(owner).approve(market.target, 4);

    const tx = await market.connect(owner).listForRent(nft.target, 4, ethers.parseEther("0.0001"), 600, 1800);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'LeaseListed');
    const listingId = event.args[0]; // or event.args.listingId

    let lsInitial = await market.listings(listingId);
    expect(lsInitial.status).to.equal(1); // Active

    // Fast forward past 30 mins
    await fastForward(1800 + 100);

    const lsBefore = await market.listings(listingId);

    // Call finishExpiredListing
    await market.finishExpiredListing(listingId);

    const ls = await market.listings(listingId);
    expect(ls.status).to.equal(4); // Completed/Cancelled
    expect(await nft.ownerOf(4)).to.equal(owner.address);
  });
});
