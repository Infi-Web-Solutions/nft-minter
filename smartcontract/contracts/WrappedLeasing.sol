// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 WrappedLeasing (Upgradeable, UUPS)
 - Wrap original NFT into a time-limited wNFT
 - Stores original nft address + tokenId in mapping
 - Prevents unwrap with arbitrary tokenId
 - Prevent transfer after expiry (unless burn)
*/

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./FeeManager.sol";

contract WrappedLeasing is ERC721URIStorageUpgradeable, ReentrancyGuardUpgradeable, AccessControlUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    struct WrappedInfo {
        address originalNft;
        uint256 originalTokenId;
        address owner;
        uint256 validUntil;
        bool active;
    }

    FeeManager public feeManager;
    uint256 public wCounter;
    mapping(uint256 => WrappedInfo) public wrapped;
    uint256 public pendingTreasury;
    uint256 public gracePeriod; // seconds after expiry before forceExpire is allowed

    event Wrapped(uint256 indexed wId, address indexed owner, address nft, uint256 tokenId, uint256 validUntil);
    event Unwrapped(uint256 indexed wId);
    event LeaseExtended(uint256 indexed wId, uint256 newValidUntil);
    event FeeRouted(address indexed treasury, uint256 amount, bool paid);
    event LeaseForceExpired(uint256 indexed wId, address indexed caller);

    function initialize(address admin_, address feeManager_) external initializer {
        __ERC721_init("Wrapped Lease NFT", "wNFTM");
        __ERC721URIStorage_init();
        __ReentrancyGuard_init();
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(ADMIN_ROLE, admin_);
        feeManager = FeeManager(payable(feeManager_));
        gracePeriod = 1 days;
    }

    function wrap(address nft, uint256 tokenId, address renter, uint256 durationSeconds, string calldata metadataURI, address originalOwner) external payable nonReentrant whenNotPaused returns (uint256) {
        require(renter != address(0), "invalid renter");
        require(originalOwner != address(0), "invalid originalOwner");
        require(durationSeconds > 0, "duration>0");

        // If wrapping a wNFT (nested wrap), ensure duration does not exceed parent lease
        if (nft == address(this)) {
            (bool isActive, uint256 timeRemaining) = getLeaseStatus(tokenId);
            require(isActive, "lease not active");
            // Enforce that sub-lease is strictly shorter than parent lease
            require(durationSeconds < timeRemaining, "duration must be less than parent lease");
        }

        // fee handling: the caller passes msg.value which should include the service fee.
        // If durationSeconds was incorrectly used as base for bps, we should at least route all msg.value
        uint256 fee = msg.value; 
        if (fee > 0) {
            address treasury = feeManager.treasury();
            (bool sent, ) = payable(treasury).call{value: fee}("");
            if (!sent) {
                pendingTreasury += fee;
            }
            emit FeeRouted(treasury, fee, sent);
        }

        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);

        wCounter++;
        uint256 wId = wCounter;
        uint256 validUntil = block.timestamp + durationSeconds;

        wrapped[wId] = WrappedInfo({ originalNft: nft, originalTokenId: tokenId, owner: originalOwner, validUntil: validUntil, active: true });

        _safeMint(renter, wId);
        if (bytes(metadataURI).length > 0) {
            _setTokenURI(wId, metadataURI);
        }

        emit Wrapped(wId, originalOwner, nft, tokenId, validUntil);
        return wId;
    }

    function unwrap(uint256 wId) external nonReentrant whenNotPaused {
        WrappedInfo storage info = wrapped[wId];
        require(info.active, "not active");
        require(msg.sender == info.owner || block.timestamp > info.validUntil || hasRole(ADMIN_ROLE, msg.sender), "not allowed");

        info.active = false;

        // burn wNFT
        _burn(wId);

        // return original NFT to owner
        IERC721(info.originalNft).transferFrom(address(this), info.owner, info.originalTokenId);

        emit Unwrapped(wId);
    }

    // extend lease (only admin for safety)
    function extendLease(uint256 wId, uint256 extraSeconds) external onlyRole(ADMIN_ROLE) whenNotPaused {
        WrappedInfo storage info = wrapped[wId];
        require(info.active, "not active");
        require(extraSeconds > 0, "invalid extension");
        info.validUntil += extraSeconds;
        emit LeaseExtended(wId, info.validUntil);
    }

    /// Force expire after grace period; returns NFT to original owner and burns wNFT
    function forceExpire(uint256 wId) external whenNotPaused {
        WrappedInfo storage info = wrapped[wId];
        require(info.active, "not active");
        require(block.timestamp > info.validUntil + gracePeriod, "grace not passed");

        info.active = false;
        _burn(wId);
        IERC721(info.originalNft).transferFrom(address(this), info.owner, info.originalTokenId);

        emit LeaseForceExpired(wId, msg.sender);
    }

    // prevent transfers if lease expired - override transferFrom (safeTransferFrom calls transferFrom internally)
    function transferFrom(address from, address to, uint256 tokenId) public virtual override(ERC721Upgradeable, IERC721) whenNotPaused {
        if (from != address(0) && to != address(0)) {
            WrappedInfo storage info = wrapped[tokenId];
            // Only enforce lease active/not-expired if NOT transferring back to original owner
            if (to != info.owner) {
                require(info.active, "not active");
                require(block.timestamp <= info.validUntil, "lease expired");
            }
        }
        super.transferFrom(from, to, tokenId);
    }

    // Expose wrapped mapping as a single-struct getter for external callers
    function getWrapped(uint256 wId) external view returns (WrappedInfo memory) {
        return wrapped[wId];
    }

    // Lease status helper
    function getStatus(uint256 wId) external view returns (bool active, bool expired, uint256 validUntil, address originalOwner, address currentRenter) {
        WrappedInfo memory info = wrapped[wId];
        active = info.active;
        validUntil = info.validUntil;
        expired = block.timestamp > info.validUntil;
        originalOwner = info.owner;
        currentRenter = active && _ownerOf(wId) != address(0) ? ownerOf(wId) : address(0);
    }

    // supportsInterface: resolve diamond inheritance between ERC721URIStorageUpgradeable and AccessControlUpgradeable
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721URIStorageUpgradeable, AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function setFeeManager(address newManager) external onlyRole(ADMIN_ROLE) {
        feeManager = FeeManager(payable(newManager));
    }

    function setGracePeriod(uint256 newGrace) external onlyRole(ADMIN_ROLE) {
        require(newGrace <= 30 days, "grace too long");
        gracePeriod = newGrace;
    }

    // Helper to check lease status
    function getLeaseStatus(uint256 wId) public view returns (bool isActive, uint256 timeRemaining) {
        WrappedInfo memory info = wrapped[wId];
        if (!info.active) return (false, 0);
        if (block.timestamp > info.validUntil) return (true, 0); // Active but expired
        return (true, info.validUntil - block.timestamp);
    }

    // Allow contract to receive NFTs via safeTransferFrom
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function withdrawPendingTreasury() external {
        uint256 amt = pendingTreasury;
        require(amt > 0, "no pending");
        pendingTreasury = 0;
        address treasury = feeManager.treasury();
        (bool sent, ) = payable(treasury).call{value: amt}("");
        require(sent, "treasury withdraw failed");
        emit FeeRouted(treasury, amt, true);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}
}
