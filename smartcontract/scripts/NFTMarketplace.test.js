const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTMarketplace", function () {
  let nftMarketplace;
  let owner;
  let creator;
  let buyer;
  let bidder;
  let addrs;

  beforeEach(async function () {
    [owner, creator, buyer, bidder, ...addrs] = await ethers.getSigners();
    
    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    nftMarketplace = await NFTMarketplace.deploy();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await nftMarketplace.owner()).to.equal(owner.address);
    });

    it("Should have correct marketplace fee", async function () {
      expect(await nftMarketplace.marketplaceFee()).to.equal(250); // 2.5%
    });

    it("Should have correct name and symbol", async function () {
      expect(await nftMarketplace.name()).to.equal("NFTMarketplace");
      expect(await nftMarketplace.symbol()).to.equal("NFTM");
    });
  });

  describe("NFT Minting", function () {
    it("Should mint NFT successfully", async function () {
      const tx = await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500, // 5% royalty
        "Test Collection"
      );

      expect(await nftMarketplace.ownerOf(1)).to.equal(creator.address);
      expect(await nftMarketplace.tokenURI(1)).to.equal("https://example.com/image.jpg");
    });

    it("Should create collection when minting", async function () {
      await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500,
        "Test Collection"
      );

      const collection = await nftMarketplace.getCollection("Test Collection");
      expect(collection.name).to.equal("Test Collection");
      expect(collection.creator).to.equal(creator.address);
    });

    it("Should fail with empty name", async function () {
      await expect(
        nftMarketplace.mintNFT(
          "",
          "Test Description",
          "https://example.com/image.jpg",
          "art",
          500,
          "Test Collection"
        )
      ).to.be.revertedWith("Name cannot be empty");
    });

    it("Should fail with empty image URI", async function () {
      await expect(
        nftMarketplace.mintNFT(
          "Test NFT",
          "Test Description",
          "",
          "art",
          500,
          "Test Collection"
        )
      ).to.be.revertedWith("Image URI cannot be empty");
    });

    it("Should fail with royalty > 10%", async function () {
      await expect(
        nftMarketplace.mintNFT(
          "Test NFT",
          "Test Description",
          "https://example.com/image.jpg",
          "art",
          1100, // 11%
          "Test Collection"
        )
      ).to.be.revertedWith("Royalty cannot exceed 10%");
    });
  });

  describe("NFT Listing", function () {
    let tokenId;

    beforeEach(async function () {
      await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500,
        "Test Collection"
      );
      tokenId = 1; // First token ID is 1
    });

    it("Should list NFT for fixed price", async function () {
      const price = ethers.parseEther("1.0");
      
      await nftMarketplace.connect(creator).listNFT(tokenId, price, false, 0);
      
      const listing = await nftMarketplace.getListing(tokenId);
      expect(listing.isActive).to.be.true;
      expect(listing.price).to.equal(price);
      expect(listing.isAuction).to.be.false;
    });

    it("Should list NFT for auction", async function () {
      const price = ethers.parseEther("1.0");
      const duration = 3600; // 1 hour
      
      await nftMarketplace.connect(creator).listNFT(tokenId, price, true, duration);
      
      const listing = await nftMarketplace.getListing(tokenId);
      expect(listing.isActive).to.be.true;
      expect(listing.isAuction).to.be.true;
      expect(listing.auctionEndTime).to.be.gt(0);
    });

    it("Should fail if not token owner", async function () {
      const price = ethers.parseEther("1.0");
      
      await expect(
        nftMarketplace.connect(buyer).listNFT(tokenId, price, false, 0)
      ).to.be.revertedWith("Not the token owner");
    });

    it("Should fail if already listed", async function () {
      const price = ethers.parseEther("1.0");
      
      await nftMarketplace.connect(creator).listNFT(tokenId, price, false, 0);
      
      await expect(
        nftMarketplace.connect(creator).listNFT(tokenId, price, false, 0)
      ).to.be.revertedWith("NFT already listed");
    });
  });

  describe("NFT Buying", function () {
    let tokenId;
    let price;

    beforeEach(async function () {
      await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500,
        "Test Collection"
      );
      tokenId = 1; // First token ID is 1
      price = ethers.parseEther("1.0");
      await nftMarketplace.connect(creator).listNFT(tokenId, price, false, 0);
    });

    it("Should buy NFT successfully", async function () {
      await nftMarketplace.connect(buyer).buyNFT(tokenId, { value: price });
      
      expect(await nftMarketplace.ownerOf(tokenId)).to.equal(buyer.address);
      
      const listing = await nftMarketplace.getListing(tokenId);
      expect(listing.isActive).to.be.false;
    });

    it("Should fail with incorrect price", async function () {
      const wrongPrice = ethers.parseEther("0.5");
      
      await expect(
        nftMarketplace.connect(buyer).buyNFT(tokenId, { value: wrongPrice })
      ).to.be.revertedWith("Incorrect price");
    });

    it("Should fail if buyer is seller", async function () {
      await expect(
        nftMarketplace.connect(creator).buyNFT(tokenId, { value: price })
      ).to.be.revertedWith("Cannot buy your own NFT");
    });
  });

  describe("Auction Bidding", function () {
    let tokenId;
    let price;

    beforeEach(async function () {
      await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500,
        "Test Collection"
      );
      tokenId = 1; // First token ID is 1
      price = ethers.parseEther("1.0");
      await nftMarketplace.connect(creator).listNFT(tokenId, price, true, 3600);
    });

    it("Should place bid successfully", async function () {
      const bidAmount = ethers.parseEther("1.5");
      
      await nftMarketplace.connect(bidder).placeBid(tokenId, { value: bidAmount });
      
      const listing = await nftMarketplace.getListing(tokenId);
      expect(listing.highestBid).to.equal(bidAmount);
      expect(listing.highestBidder).to.equal(bidder.address);
    });

    it("Should fail with bid lower than current bid", async function () {
      const bidAmount1 = ethers.parseEther("1.5");
      const bidAmount2 = ethers.parseEther("1.0");
      
      await nftMarketplace.connect(bidder).placeBid(tokenId, { value: bidAmount1 });
      
      await expect(
        nftMarketplace.connect(addrs[0]).placeBid(tokenId, { value: bidAmount2 })
      ).to.be.revertedWith("Bid must be higher than current bid");
    });

    it("Should fail if bidder is seller", async function () {
      const bidAmount = ethers.parseEther("1.5");
      
      await expect(
        nftMarketplace.connect(creator).placeBid(tokenId, { value: bidAmount })
      ).to.be.revertedWith("Cannot bid on your own auction");
    });
  });

  describe("Auction Ending", function () {
    let tokenId;
    let price;

    beforeEach(async function () {
      await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500,
        "Test Collection"
      );
      tokenId = 1; // First token ID is 1
      price = ethers.parseEther("1.0");
      await nftMarketplace.connect(creator).listNFT(tokenId, price, true, 10); // 10 second duration
    });

    it("Should end auction successfully", async function () {
      const bidAmount = ethers.parseEther("1.5");
      
      // Place bid immediately after listing
      await nftMarketplace.connect(bidder).placeBid(tokenId, { value: bidAmount });
      
      // Wait for auction to end
      await ethers.provider.send("evm_increaseTime", [11]);
      await ethers.provider.send("evm_mine");
      
      await nftMarketplace.endAuction(tokenId);
      
      expect(await nftMarketplace.ownerOf(tokenId)).to.equal(bidder.address);
    });
  });

  describe("NFT Delisting", function () {
    let tokenId;

    beforeEach(async function () {
      await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500,
        "Test Collection"
      );
      tokenId = 1; // First token ID is 1
    });

    it("Should delist NFT successfully", async function () {
      const price = ethers.parseEther("1.0");
      await nftMarketplace.connect(creator).listNFT(tokenId, price, false, 0);
      
      await nftMarketplace.connect(creator).delistNFT(tokenId);
      
      const listing = await nftMarketplace.getListing(tokenId);
      expect(listing.isActive).to.be.false;
    });

    it("Should fail if not the seller", async function () {
      const price = ethers.parseEther("1.0");
      await nftMarketplace.connect(creator).listNFT(tokenId, price, false, 0);
      
      await expect(
        nftMarketplace.connect(buyer).delistNFT(tokenId)
      ).to.be.revertedWith("Not the token owner");
    });
  });

  describe("View Functions", function () {
    let tokenId;

    beforeEach(async function () {
      await nftMarketplace.connect(creator).mintNFT(
        "Test NFT",
        "Test Description",
        "https://example.com/image.jpg",
        "art",
        500,
        "Test Collection"
      );
      tokenId = 1; // First token ID is 1
    });

    it("Should return user NFTs", async function () {
      const userNFTs = await nftMarketplace.getUserNFTs(creator.address);
      expect(userNFTs).to.include(BigInt(tokenId));
    });

    it("Should return NFT metadata", async function () {
      const metadata = await nftMarketplace.getNFTMetadata(tokenId);
      expect(metadata.name).to.equal("Test NFT");
      expect(metadata.creator).to.equal(creator.address);
      expect(metadata.royaltyPercentage).to.equal(500);
    });

    it("Should return collection", async function () {
      const collection = await nftMarketplace.getCollection("Test Collection");
      expect(collection.name).to.equal("Test Collection");
      expect(collection.creator).to.equal(creator.address);
    });
  });

  describe("Admin Functions", function () {
    it("Should update marketplace fee", async function () {
      await nftMarketplace.updateMarketplaceFee(300); // 3%
      expect(await nftMarketplace.marketplaceFee()).to.equal(300);
    });

    it("Should fail to update fee if not owner", async function () {
      await expect(
        nftMarketplace.connect(buyer).updateMarketplaceFee(300)
      ).to.be.revertedWithCustomError(nftMarketplace, "OwnableUnauthorizedAccount");
    });

    it("Should fail to update fee > 10%", async function () {
      await expect(
        nftMarketplace.updateMarketplaceFee(1100)
      ).to.be.revertedWith("Fee cannot exceed 10%");
    });
  });
}); 