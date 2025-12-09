const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTCollateralLendingIntegrated – Full Coverage", function () {
  let lending, nft, token;
  let owner, borrower, lender, other;

  const ZERO = ethers.ZeroAddress;

  before(async () => {
    [owner, borrower, lender, other] = await ethers.getSigners();

    const TestNFT = await ethers.getContractFactory("TestNFT");
    nft = await TestNFT.deploy();
    await nft.waitForDeployment();

    const TestToken = await ethers.getContractFactory("TestToken");
    token = await TestToken.deploy();
    await token.waitForDeployment();

    const Lending = await ethers.getContractFactory("NFTCollateralLendingIntegrated");
    lending = await Lending.deploy(owner.address);
    await lending.waitForDeployment();
  });

  async function mintNFT(to, id) {
    const tx = await nft.mint(to.address, id);
    await tx.wait();
  }

  // -------------------------------------------------------
  // BASIC POSITIVE FLOW (Already Passed)
  // -------------------------------------------------------
  it("Should mint NFT, fund and repay (ETH)", async () => {
    await mintNFT(borrower, 1);
    await nft.connect(borrower).approve(lending.target, 1);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      1,
      ZERO,
      ethers.parseEther("1"),
      10,
      3600,
      0
    );

    await lending.connect(lender).fundLoan(1, {
      value: ethers.parseEther("1"),
    });

    const repayAmount = await lending.computeRepayAmount(1);

    await lending.connect(borrower).repayLoan(1, {
      value: repayAmount,
    });

    expect(await nft.ownerOf(1)).to.equal(borrower.address);
  });

  // -------------------------------------------------------
  // 1️⃣ Borrower cannot fund own loan
  // -------------------------------------------------------
  it("Should prevent borrower from funding their own loan", async () => {
    await mintNFT(borrower, 10);
    await nft.connect(borrower).approve(lending.target, 10);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      10,
      ZERO,
      ethers.parseEther("2"),
      10,
      3600,
      0
    );

    await expect(
      lending.connect(borrower).fundLoan(2, { value: ethers.parseEther("2") })
    ).to.be.revertedWith("BorrowerCannotFundOwnLoan");
  });

  // -------------------------------------------------------
  // 2️⃣ Fund Loan fails if insufficient ERC20 approval
  // -------------------------------------------------------
  it("Should revert if lender has insufficient ERC20 allowance", async () => {
    await mintNFT(borrower, 20);
    await nft.connect(borrower).approve(lending.target, 20);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      20,
      token.target,
      ethers.parseEther("50"),
      10,
      3600,
      0
    );

    await token.mint(lender.address, ethers.parseEther("50"));

    await expect(
      lending.connect(lender).fundLoan(3) // no ERC20 approval
    ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
  });

  // -------------------------------------------------------
  // 3️⃣ Cannot create loan with invalid parameters
  // -------------------------------------------------------
  it("Should prevent invalid loan creation (zero interest/duration)", async () => {
    await mintNFT(borrower, 30);
    await nft.connect(borrower).approve(lending.target, 30);

    await expect(
      lending.connect(borrower).createLoanRequest(
        nft.target,
        30,
        ZERO,
        ethers.parseEther("1"),
        0,
        3600,
        0
      )
    ).to.be.revertedWith("InvalidInterest");

    await expect(
      lending.connect(borrower).createLoanRequest(
        nft.target,
        30,
        ZERO,
        ethers.parseEther("1"),
        10,
        0,
        0
      )
    ).to.be.revertedWith("InvalidDuration");
  });

  // -------------------------------------------------------
  // 4️⃣ Cannot repay non-funded loan
  // -------------------------------------------------------
  it("Should revert repay before loan is funded", async () => {
    await mintNFT(borrower, 40);
    await nft.connect(borrower).approve(lending.target, 40);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      40,
      ZERO,
      ethers.parseEther("1"),
      10,
      3600,
      0
    );

    await expect(
      lending.connect(borrower).repayLoan(4, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("LoanNotFunded");
  });

  // -------------------------------------------------------
  // 5️⃣ Double funding should revert
  // -------------------------------------------------------
  it("Should revert if loan is already funded", async () => {
    await mintNFT(borrower, 50);
    await nft.connect(borrower).approve(lending.target, 50);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      50,
      ZERO,
      ethers.parseEther("1"),
      10,
      3600,
      0
    );

    await lending.connect(lender).fundLoan(5, {
      value: ethers.parseEther("1"),
    });

    await expect(
      lending.connect(other).fundLoan(5, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("AlreadyFunded");
  });

  // -------------------------------------------------------
  // 6️⃣ Early liquidation must fail
  // -------------------------------------------------------
  it("Should prevent liquidation before expiry", async () => {
    await mintNFT(borrower, 60);
    await nft.connect(borrower).approve(lending.target, 60);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      60,
      ZERO,
      ethers.parseEther("1"),
      10,
      3600,
      0
    );

    await lending.connect(lender).fundLoan(6, {
      value: ethers.parseEther("1"),
    });

    await expect(
      lending.connect(lender).liquidateLoan(6)
    ).to.be.revertedWith("NotExpired");
  });

  // -------------------------------------------------------
  // 7️⃣ Cancel before funding
  // -------------------------------------------------------
  it("Should allow borrower to cancel before funding", async () => {
    await mintNFT(borrower, 70);
    await nft.connect(borrower).approve(lending.target, 70);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      70,
      ZERO,
      ethers.parseEther("1"),
      10,
      3600,
      0
    );

    await lending.connect(borrower).cancelLoan(7);

    const loan = await lending.loans(7);
    expect(loan.status).to.equal(4); // Cancelled
  });

  // -------------------------------------------------------
  // 8️⃣ Unauthorized repay should fail
  // -------------------------------------------------------
  it("Should block a non-borrower from repaying loan", async () => {
    await mintNFT(borrower, 80);
    await nft.connect(borrower).approve(lending.target, 80);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      80,
      ZERO,
      ethers.parseEther("1"),
      10,
      3600,
      0
    );

    await lending.connect(lender).fundLoan(8, {
      value: ethers.parseEther("1"),
    });

    const repayAmount = await lending.computeRepayAmount(8);

    await expect(
      lending.connect(other).repayLoan(8, { value: repayAmount })
    ).to.be.revertedWith("NotBorrower");
  });

  // -------------------------------------------------------
  // 9️⃣ Marketplace NFT cannot be liquidated
  // -------------------------------------------------------
  it("Should prevent liquidation of marketplace NFTs", async () => {
    await lending.setMarketplaceNFT(nft.target, true);

    await mintNFT(borrower, 90);

    await lending.connect(borrower).createLoanRequest(
      nft.target,
      90,
      ZERO,
      ethers.parseEther("1"),
      10,
      3600,
      0
    );

    await lending.connect(lender).fundLoan(9, {
      value: ethers.parseEther("1"),
    });

    await ethers.provider.send("evm_increaseTime", [4000]);
    await ethers.provider.send("evm_mine");

    await expect(
      lending.connect(lender).liquidateLoan(9)
    ).to.be.revertedWith("MarketplaceNFTNoLiquidation");
  });

  // -------------------------------------------------------
  // 🔟 Owner-only: setMarketplaceNFT
  // -------------------------------------------------------
  it("Should restrict setMarketplaceNFT to owner only", async () => {
    await expect(
      lending.connect(borrower).setMarketplaceNFT(nft.target, false)
    ).to.be.revertedWithCustomError(lending, "OwnableUnauthorizedAccount");
  });
});
