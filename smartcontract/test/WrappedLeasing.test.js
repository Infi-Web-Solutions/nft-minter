const { expect } = require("chai");
const { ethers , upgrades } = require("hardhat");

describe("WrappedLeasing", function () {
    let owner, renter, admin, other;
    let nft, wrapped, feeManager;

    beforeEach(async function () {
        [owner, renter, admin, other] = await ethers.getSigners();

        // Deploy mock ERC721 (original NFT)
        const MockNFT = await ethers.getContractFactory("TestNFTS");
        nft = await MockNFT.deploy();
        await nft.mint(owner.address, 1);

        // Deploy FeeManager
        const FeeManager = await ethers.getContractFactory("FeeManager");
        feeManager = await upgrades.deployProxy(FeeManager, [admin.address, 0, 0, 0, owner.address]);

        // Deploy WrappedLeasing (Upgradeable pattern)
        const Wrapped = await ethers.getContractFactory("WrappedLeasing");
        wrapped = await upgrades.deployProxy(
            Wrapped,
            [admin.address, feeManager.target],
            { initializer: "initialize" }
        );
    });

    // -------------------------
    // 1. WRAP
    // -------------------------
    it("should wrap original NFT and mint wNFT", async function () {
        await nft.connect(owner).approve(wrapped.target, 1);

        const tx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            1000,
            "ipfs://metadata",
            owner.address,
            { value: 0 }
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(l => l.fragment && l.fragment.name === "Wrapped");
        const wId = event.args.wId;

        // Check mapping entry
        const info = await wrapped.getWrapped(wId);
        expect(info.originalNft).to.equal(nft.target);
        expect(info.originalTokenId).to.equal(1);
        expect(info.owner).to.equal(owner.address);
        expect(info.active).to.equal(true);

        // wNFT minted to renter
        expect(await wrapped.ownerOf(wId)).to.equal(renter.address);

        // Original NFT transferred to contract
        expect(await nft.ownerOf(1)).to.equal(wrapped.target);
    });

    // -------------------------
    // 2. UNWRAP (by owner)
    // -------------------------
    it("should unwrap and return NFT to owner", async function () {
        await nft.connect(owner).approve(wrapped.target, 1);

        const wrapTx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            1000,
            "",
            { value: 0 }
        );
        const wrapRcpt = await wrapTx.wait();
        const wId = wrapRcpt.logs.find(l => l.fragment && l.fragment.name === "Wrapped").args.wId;

        await wrapped.connect(owner).unwrap(wId);

        const info = await wrapped.getWrapped(wId);
        expect(info.active).to.equal(false);

        // renter must have lost wNFT
        await expect(wrapped.ownerOf(wId)).to.be.reverted;

        // owner gets original back
        expect(await nft.ownerOf(1)).to.equal(owner.address);
    });

    it("blocks wrap when paused", async function () {
        await wrapped.connect(admin).pause();
        await nft.connect(owner).approve(wrapped.target, 1);
        await expect(
            wrapped.connect(owner).wrap(
                nft.target,
                1,
                renter.address,
                100,
                "",
                owner.address,
                { value: 0 }
            )
        ).to.be.revertedWithCustomError(wrapped, "EnforcedPause");
    });

    it("takes fee when set", async function () {
        await feeManager.connect(admin).setLeasingFeeBps(500); // 5%
        await nft.connect(owner).approve(wrapped.target, 1);
        const duration = 1000;
        const fee = (BigInt(duration) * 500n) / 10000n;
        await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            duration,
            "",
            owner.address,
            { value: fee }
        );
    });

    it("force expires after grace and returns NFT", async function () {
        await feeManager.connect(admin).setLeasingFeeBps(0);
        await wrapped.connect(admin).setGracePeriod(2);

        await nft.connect(owner).approve(wrapped.target, 1);
        const wrapTx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            1, // 1s duration
            "",
            owner.address,
            { value: 0 }
        );
        const rcpt = await wrapTx.wait();
        const wId = rcpt.logs.find(l => l.fragment && l.fragment.name === "Wrapped").args.wId;

        // wait past expiry + grace
        await ethers.provider.send("evm_increaseTime", [5]);
        await ethers.provider.send("evm_mine");

        await wrapped.connect(other).forceExpire(wId);
        expect(await nft.ownerOf(1)).to.equal(owner.address);
    });

    // -------------------------
    // 3. UNWRAP AFTER EXPIRY
    // -------------------------
    it("should allow renter to unwrap after lease expiry", async function () {
        await nft.connect(owner).approve(wrapped.target, 1);

        const wrapTx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            1, // 1 second duration
            "",
            owner.address,
            { value: 0 }
        );
        const txRcpt = await wrapTx.wait();
        const wId = txRcpt.logs.find(l => l.fragment.name === "Wrapped").args.wId;

        // increase time so lease expires
        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");

        // renter can unwrap after expiry
        await wrapped.connect(renter).unwrap(wId);

        // NFT returned to owner
        expect(await nft.ownerOf(1)).to.equal(owner.address);
    });

    // -------------------------
    // 4. UNWRAP BY ADMIN
    // -------------------------
    it("should allow admin to unwrap", async function () {
        await nft.connect(owner).approve(wrapped.target, 1);

        const wrapTx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            1000,
            "",
            owner.address,
            { value: 0 }
        );
        const rcpt = await wrapTx.wait();
        const wId = rcpt.logs.find(l => l.fragment.name === "Wrapped").args.wId;

        await wrapped.connect(admin).unwrap(wId);

        expect(await nft.ownerOf(1)).to.equal(owner.address);
    });

    // -------------------------
    // 5. BLOCK TRANSFER AFTER EXPIRY
    // -------------------------
    it("should block transferring wNFT after expiry", async function () {
        await nft.connect(owner).approve(wrapped.target, 1);

        const wrapTx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            1,
            "",
            owner.address,
            { value: 0 }
        );

        const rcpt = await wrapTx.wait();
        const wId = rcpt.logs.find(l => l.fragment.name === "Wrapped").args.wId;

        // fast forward time
        await ethers.provider.send("evm_increaseTime", [3]);
        await ethers.provider.send("evm_mine");

        await expect(
            wrapped.connect(renter).transferFrom(renter.address, other.address, wId)
        ).to.be.revertedWith("lease expired");
    });

    // -------------------------
    // 6. ALLOW TRANSFER BEFORE EXPIRY
    // -------------------------
    it("should allow transferring wNFT before expiry", async function () {
        await nft.connect(owner).approve(wrapped.target, 1);

        const wrapTx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            1000,
            "",
            owner.address,
            { value: 0 }
        );
        const rcpt = await wrapTx.wait();
        const wId = rcpt.logs.find(l => l.fragment.name === "Wrapped").args.wId;

        await wrapped.connect(renter).transferFrom(renter.address, other.address, wId);

        expect(await wrapped.ownerOf(wId)).to.equal(other.address);
    });

    // -------------------------
    // 7. EXTEND LEASE
    // -------------------------
    it("should allow admin to extend lease", async function () {
        await nft.connect(owner).approve(wrapped.target, 1);

        const wrapTx = await wrapped.connect(owner).wrap(
            nft.target,
            1,
            renter.address,
            100,
            "",
            owner.address,
            { value: 0 }
        );
        const rcpt = await wrapTx.wait();
        const wId = rcpt.logs.find(l => l.fragment.name === "Wrapped").args.wId;

        const infoBefore = await wrapped.getWrapped(wId);

        await wrapped.connect(admin).extendLease(wId, 500);

        const infoAfter = await wrapped.getWrapped(wId);
        expect(infoAfter.validUntil).to.equal(infoBefore.validUntil + BigInt(500));
    });

    // -------------------------
    // 8. FEE MANAGER TEST (if fee > 0)
    // -------------------------
    it("should revert if fee not paid when required", async function () {
        // Set fee to non-zero
        await feeManager.connect(admin).setLeasingFeeBps(1000); // 10%

        await nft.connect(owner).approve(wrapped.target, 1);

        await expect(
            wrapped.connect(owner).wrap(
                nft.target,
                1,
                renter.address,
                1000,
                "",
                owner.address,
                { value: 0 } // no fee
            )
        ).to.be.revertedWith("insufficient fee");
    });
});
