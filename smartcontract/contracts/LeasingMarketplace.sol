// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./WrappedLeasing.sol";
import "./FeeManager.sol";

/**
 * @title LeasingMarketplace
 * @dev Custodial NFT leasing marketplace that wraps NFTs into time-bound wNFTs.
 *      - Lists require custodial transfer to this contract.
 *      - Renters pay rent + platform fee + deposit; deposit refunded to renter after expiry.
 *      - Pull-payment accounting for owner/treasury/renter refunds.
 */
contract LeasingMarketplace is ReentrancyGuardUpgradeable, AccessControlUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    enum ListingStatus { None, Active, Rented, Cancelled, Completed }

    struct LeaseListing {
        address owner;
        address nft;
        uint256 tokenId;
        uint256 pricePerSecond;
        uint256 minDuration;
        uint256 maxDuration;
        ListingStatus status;
    }

    struct RentalInfo {
        address renter;
        uint256 wId;
        uint256 deposit;      // held for renter
        uint256 rentAmount;   // owed to owner
        uint256 expiresAt;    // block timestamp when lease ends
    }

    FeeManager public feeManager;
    WrappedLeasing public wrappedContract;

    uint16 public platformFeeBps; // defaults to feeManager.leasingFeeBps if 0
    uint16 public wrapFeeBps;     // defaults to feeManager.leasingFeeBps if 0
    uint16 public depositBps;     // deposit percentage of rent; default 5000 = 50%

    uint256 public listingCounter;
    mapping(uint256 => LeaseListing) public listings;
    mapping(uint256 => RentalInfo) public rentals;

    // Balances for pull-payments: owner proceeds, treasury fees, renter deposit refunds
    mapping(address => uint256) public pendingBalances;

    event LeaseListed(
        uint256 indexed listingId,
        address indexed owner,
        address nft,
        uint256 tokenId,
        uint256 pricePerSecond,
        uint256 minDuration,
        uint256 maxDuration
    );
    event LeaseCancelled(uint256 indexed listingId);
    event LeaseRented(
        uint256 indexed listingId,
        address indexed renter,
        uint256 wId,
        uint256 rentPaid,
        uint256 depositHeld,
        uint256 expiresAt
    );
    event DepositRefunded(uint256 indexed listingId, address indexed to, uint256 amount);
    event LeaseCompleted(uint256 indexed listingId, uint256 wId);
    event ProceedsWithdrawn(address indexed to, uint256 amount);
    event EmergencyWithdraw(address indexed operator, address indexed to, address indexed nft, uint256 tokenId, uint256 listingId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin_, address feeManager_, address wrapped_) external initializer {
        __ReentrancyGuard_init();
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(ADMIN_ROLE, admin_);
        feeManager = FeeManager(payable(feeManager_));
        wrappedContract = WrappedLeasing(wrapped_);
        platformFeeBps = 0; // use feeManager.leasingFeeBps by default
        wrapFeeBps = 0;     // use feeManager.leasingFeeBps by default
        depositBps = 5000;  // 50%
    }

    /// List NFT for rent (custodial)
    /// Supports both regular NFTs and wNFTs (wrapped NFTs)
    function listForRent(
        address nft,
        uint256 tokenId,
        uint256 pricePerSecond,
        uint256 minDuration,
        uint256 maxDuration
    ) external nonReentrant whenNotPaused {
        IERC721 token = IERC721(nft);
        require(token.ownerOf(tokenId) == msg.sender, "not owner");
        require(pricePerSecond > 0, "price>0");
        require(minDuration > 0 && maxDuration >= minDuration, "bad duration");

        // If listing a wNFT, validate it's active and not expired
        if (nft == address(wrappedContract)) {
            (bool isActive, uint256 timeRemaining) = wrappedContract.getLeaseStatus(tokenId);
            require(isActive, "wNFT not active");
            require(timeRemaining > 0, "wNFT expired");
            // Borrower (current holder) can list their wNFT
            // msg.sender already verified as owner via token.ownerOf check above
        }

        // Custody the NFT
        token.transferFrom(msg.sender, address(this), tokenId);

        listingCounter++;
        listings[listingCounter] = LeaseListing({
            owner: msg.sender, // For wNFTs, this is the borrower (current wNFT holder)
            nft: nft,
            tokenId: tokenId,
            pricePerSecond: pricePerSecond,
            minDuration: minDuration,
            maxDuration: maxDuration,
            status: ListingStatus.Active
        });

        emit LeaseListed(listingCounter, msg.sender, nft, tokenId, pricePerSecond, minDuration, maxDuration);
    }

    /// Cancel listing before it is rented
    /// Returns NFT/wNFT back to the lister (borrower for wNFTs)
    function cancelListing(uint256 listingId) external nonReentrant whenNotPaused {
        LeaseListing storage ls = listings[listingId];
        require(ls.status == ListingStatus.Active, "not active");
        require(ls.status != ListingStatus.Rented, "already rented");
        require(ls.owner == msg.sender || hasRole(ADMIN_ROLE, msg.sender), "not allowed");

        ls.status = ListingStatus.Cancelled;
        
        // Return NFT/wNFT to the lister
        // For wNFTs, this returns it to the borrower who listed it
        IERC721(ls.nft).transferFrom(address(this), ls.owner, ls.tokenId);
        
        emit LeaseCancelled(listingId);
    }

    /// Rent an active listing; pays rent + platform fee + deposit; mints wrapped lease to renter
    /// Handles both regular NFTs and wNFTs
    function rent(uint256 listingId, uint256 durationSeconds) external payable nonReentrant whenNotPaused {
        LeaseListing storage ls = listings[listingId];
        require(ls.status == ListingStatus.Active, "not rentable");
        require(durationSeconds >= ls.minDuration && durationSeconds <= ls.maxDuration, "duration out of range");
        require(msg.sender != ls.owner, "owner cannot rent");

        uint256 rentAmount = ls.pricePerSecond * durationSeconds;
        uint16 platformBps = platformFeeBps == 0 ? feeManager.leasingFeeBps() : platformFeeBps;
        uint16 wrapBps = wrapFeeBps == 0 ? feeManager.leasingFeeBps() : wrapFeeBps;
        uint256 deposit = feeManager.calcBps(rentAmount, depositBps);
        uint256 platformFee = feeManager.calcBps(rentAmount, platformBps);
        uint256 wrapFee = feeManager.calcBps(durationSeconds, wrapBps);

        uint256 totalRequired = rentAmount + deposit + platformFee + wrapFee;
        require(msg.value >= totalRequired, "insufficient payment");

        // Transition state early
        ls.status = ListingStatus.Rented;

        // Approve wrapped contract to move the NFT
        IERC721(ls.nft).approve(address(wrappedContract), ls.tokenId);

        // Mint wrapped lease to renter
        // For both wNFT and regular NFT listings, original owner is ls.owner (borrower for wNFTs, NFT owner for regular NFTs)
        uint256 wId = wrappedContract.wrap{value: wrapFee}(ls.nft, ls.tokenId, msg.sender, durationSeconds, "", ls.owner);

        uint256 expiresAt = block.timestamp + durationSeconds;
        rentals[listingId] = RentalInfo({
            renter: msg.sender,
            wId: wId,
            deposit: deposit,
            rentAmount: rentAmount,
            expiresAt: expiresAt
        });

        // Accounting: owner gets rent, treasury gets fee, renter deposit held
        pendingBalances[ls.owner] += rentAmount;
        pendingBalances[feeManager.treasury()] += platformFee;

        // Refund excess if any
        uint256 excess = msg.value - totalRequired;
        if (excess > 0) {
            (bool ok, ) = msg.sender.call{value: excess}("");
            require(ok, "excess refund failed");
        }

        emit LeaseRented(listingId, msg.sender, wId, rentAmount, deposit, expiresAt);
    }

    /// Renter claims deposit back after lease expiry; requires lease to be inactive/expired
    function refundDeposit(uint256 listingId) external nonReentrant {
        RentalInfo storage r = rentals[listingId];
        require(r.wId != 0, "no rental");
        require(r.deposit > 0, "refunded");
        require(block.timestamp >= r.expiresAt, "not expired");

        WrappedLeasing.WrappedInfo memory info = wrappedContract.getWrapped(r.wId);
        require(!info.active || block.timestamp >= info.validUntil, "lease active");

        uint256 amt = r.deposit;
        r.deposit = 0;
        pendingBalances[r.renter] += amt;

        emit DepositRefunded(listingId, r.renter, amt);
        // mark lifecycle completion
        LeaseListing storage ls = listings[listingId];
        if (ls.status == ListingStatus.Rented) {
            ls.status = ListingStatus.Completed;
            emit LeaseCompleted(listingId, r.wId);
        }
    }

    /// Withdraw any owed balance (owner proceeds, treasury fees, renter deposit refunds)
    function withdraw() external nonReentrant {
        uint256 amt = pendingBalances[msg.sender];
        require(amt > 0, "no balance");
        pendingBalances[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amt}("");
        require(ok, "withdraw failed");
        emit ProceedsWithdrawn(msg.sender, amt);
    }

    // Admin setters
    function setWrapped(address newWrapped) external onlyRole(ADMIN_ROLE) {
        wrappedContract = WrappedLeasing(newWrapped);
    }

    function setFeeManager(address newManager) external onlyRole(ADMIN_ROLE) {
        feeManager = FeeManager(payable(newManager));
    }

    function setFees(uint16 newPlatformBps, uint16 newWrapBps) external onlyRole(ADMIN_ROLE) {
        require(newPlatformBps <= 3000 && newWrapBps <= 3000, "fee too high");
        platformFeeBps = newPlatformBps;
        wrapFeeBps = newWrapBps;
    }

    function setDepositBps(uint16 newDepositBps) external onlyRole(ADMIN_ROLE) {
        require(newDepositBps <= 10000, "deposit too high");
        depositBps = newDepositBps;
    }

    /// Admin emergency withdrawal for non-rented listings (custody recovery)
    function emergencyWithdraw(uint256 listingId, address to) external onlyRole(ADMIN_ROLE) nonReentrant {
        LeaseListing storage ls = listings[listingId];
        require(ls.status != ListingStatus.Rented, "cannot withdraw rented");
        require(ls.status != ListingStatus.None, "invalid listing");
        address recipient = to == address(0) ? ls.owner : to;

        ls.status = ListingStatus.Cancelled;
        IERC721(ls.nft).transferFrom(address(this), recipient, ls.tokenId);
        emit EmergencyWithdraw(msg.sender, recipient, ls.nft, ls.tokenId, listingId);
    }

    /// View helper: total cost breakdown for a listing and duration
    function getTotalCost(uint256 listingId, uint256 durationSeconds) external view returns (
        uint256 rentAmount,
        uint256 deposit,
        uint256 platformFee,
        uint256 wrapFee,
        uint256 totalRequired
    ) {
        LeaseListing storage ls = listings[listingId];
        require(ls.status == ListingStatus.Active, "not rentable");
        require(durationSeconds >= ls.minDuration && durationSeconds <= ls.maxDuration, "duration out of range");

        rentAmount = ls.pricePerSecond * durationSeconds;
        uint16 platformBps = platformFeeBps == 0 ? feeManager.leasingFeeBps() : platformFeeBps;
        uint16 wrapBps = wrapFeeBps == 0 ? feeManager.leasingFeeBps() : wrapFeeBps;
        deposit = feeManager.calcBps(rentAmount, depositBps);
        platformFee = feeManager.calcBps(rentAmount, platformBps);
        wrapFee = feeManager.calcBps(durationSeconds, wrapBps);
        totalRequired = rentAmount + deposit + platformFee + wrapFee;
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}
}

