const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTCollateralLendingIntegrated", function () {
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

  const mintNFT = async (to, id) => {
    const tx = await nft.mint(to.address, id);
    await tx.wait();
  };

  const fastForward = async (seconds) => {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  };

  describe("Happy path (ETH)", () => {
    it("mints, funds, and repays successfully", async () => {
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

      await lending.connect(lender).fundLoan(1, { value: ethers.parseEther("1") });

      const repayAmount = await lending.computeRepayAmount(1);
      await lending.connect(borrower).repayLoan(1, { value: repayAmount });

      expect(await nft.ownerOf(1)).to.equal(borrower.address);
    });
  });

  describe("Validation & permissions", () => {
    it("prevents borrower from funding their own loan", async () => {
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

    it("reverts ERC20 funding without allowance", async () => {
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

      await expect(lending.connect(lender).fundLoan(3)).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientAllowance"
      );
    });

    it("rejects invalid loan parameters", async () => {
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

    it("blocks repay before funding", async () => {
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

    it("prevents double funding", async () => {
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

      await lending.connect(lender).fundLoan(5, { value: ethers.parseEther("1") });

      await expect(
        lending.connect(other).fundLoan(5, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("AlreadyFunded");
    });

    it("prevents liquidation before expiry", async () => {
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

      await lending.connect(lender).fundLoan(6, { value: ethers.parseEther("1") });

      await expect(lending.connect(lender).liquidateLoan(6)).to.be.revertedWith("NotExpired");
    });

    it("allows borrower to cancel before funding", async () => {
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

    it("blocks non-borrower from repaying", async () => {
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

      await lending.connect(lender).fundLoan(8, { value: ethers.parseEther("1") });

      const repayAmount = await lending.computeRepayAmount(8);

      await expect(
        lending.connect(other).repayLoan(8, { value: repayAmount })
      ).to.be.revertedWith("NotBorrower");
    });
  });

  describe("Marketplace & liquidation rules", () => {
    it("prevents liquidation of marketplace NFTs", async () => {
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

      await lending.connect(lender).fundLoan(9, { value: ethers.parseEther("1") });

      await fastForward(4000);

      await expect(lending.connect(lender).liquidateLoan(9)).to.be.revertedWith(
        "MarketplaceNFTNoLiquidation"
      );
    });

    it("allows liquidation after expiry for non-marketplace NFTs", async () => {
      // Ensure this NFT is NOT marked as marketplace for this scenario
      await lending.setMarketplaceNFT(nft.target, false);

      await mintNFT(borrower, 100);
      await nft.connect(borrower).approve(lending.target, 100);

      await lending.connect(borrower).createLoanRequest(
        nft.target,
        100,
        ZERO,
        ethers.parseEther("1"),
        10,
        10, // short duration
        0
      );

      await lending.connect(lender).fundLoan(10, { value: ethers.parseEther("1") });

      await fastForward(20);

      await lending.connect(lender).liquidateLoan(10);

      expect(await nft.ownerOf(100)).to.equal(lender.address);
    });
  });

  describe("Ownership controls", () => {
    it("restricts setMarketplaceNFT to owner", async () => {
      await expect(
        lending.connect(borrower).setMarketplaceNFT(nft.target, false)
      ).to.be.revertedWithCustomError(lending, "OwnableUnauthorizedAccount");
    });
  });

  describe("Pause behavior", () => {
    it("blocks createLoanRequest when paused", async () => {
      await lending.connect(owner).pause();
      await mintNFT(borrower, 200);
      await nft.connect(borrower).approve(lending.target, 200);

      await expect(
        lending.connect(borrower).createLoanRequest(
          nft.target,
          200,
          ZERO,
          ethers.parseEther("1"),
          10,
          3600,
          0
        )
      ).to.be.revertedWithCustomError(lending, "EnforcedPause");

      // Clean up: unpause for subsequent tests
      await lending.connect(owner).unpause();
    });

    it("allows operations after unpause", async () => {
      await lending.connect(owner).pause();
      await lending.connect(owner).unpause();

      await mintNFT(borrower, 210);
      await nft.connect(borrower).approve(lending.target, 210);

      await lending.connect(borrower).createLoanRequest(
        nft.target,
        210,
        ZERO,
        ethers.parseEther("1"),
        10,
        3600,
        0
      );

      await lending.connect(lender).fundLoan(11, { value: ethers.parseEther("1") });
      const repayAmount = await lending.computeRepayAmount(11);
      await lending.connect(borrower).repayLoan(11, { value: repayAmount });
      expect(await nft.ownerOf(210)).to.equal(borrower.address);
    });
  });
});
