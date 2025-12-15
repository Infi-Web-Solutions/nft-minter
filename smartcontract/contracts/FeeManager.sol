// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract FeeManager is AccessControlUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    bytes32 public constant FEE_ADMIN = DEFAULT_ADMIN_ROLE;
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint16 private _marketplaceFeeBps;  
    uint16 private _lendingAprBps;       
    uint16 private _leasingFeeBps;       

    address public treasury;

    event MarketplaceFeeUpdated(uint16 bps);
    event LendingAprUpdated(uint16 bps);
    event LeasingFeeUpdated(uint16 bps);
    event TreasuryUpdated(address treasury);

    function initialize(address admin_, uint16 marketplaceFeeBps_, uint16 lendingAprBps_, uint16 leasingFeeBps_, address treasury_) external initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(FEE_ADMIN, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _setMarketplaceFeeBps(marketplaceFeeBps_);
        _setLendingAprBps(lendingAprBps_);
        _setLeasingFeeBps(leasingFeeBps_);
        require(treasury_ != address(0), "zero address");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setMarketplaceFeeBps(uint16 bps) external onlyRole(FEE_ADMIN) whenNotPaused { _setMarketplaceFeeBps(bps); }
    function setLendingAprBps(uint16 bps) external onlyRole(FEE_ADMIN) whenNotPaused { _setLendingAprBps(bps); }
    function setLeasingFeeBps(uint16 bps) external onlyRole(FEE_ADMIN) whenNotPaused { _setLeasingFeeBps(bps); }

    function _setMarketplaceFeeBps(uint16 bps) internal {
        require(bps <= 2000, "market fee too high");
        _marketplaceFeeBps = bps;
        emit MarketplaceFeeUpdated(bps);
    }
    function _setLendingAprBps(uint16 bps) internal {
        require(bps <= 20000, "apr too high");
        _lendingAprBps = bps;
        emit LendingAprUpdated(bps);
    }
    function _setLeasingFeeBps(uint16 bps) internal {
        require(bps <= 2000, "lease fee too high");
        _leasingFeeBps = bps;
        emit LeasingFeeUpdated(bps);
    }

    function setTreasury(address treasury_) public onlyRole(FEE_ADMIN) whenNotPaused {
        require(treasury_ != address(0), "zero address");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function marketplaceFeeBps() external view returns (uint16) { return _marketplaceFeeBps; }
    function lendingAprBps() external view returns (uint16) { return _lendingAprBps; }
    function leasingFeeBps() external view returns (uint16) { return _leasingFeeBps; }

    function calcBps(uint256 amount, uint16 bps) public pure returns (uint256) {
        return (amount * bps) / 10000;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Reject direct ETH transfers
    receive() external payable {
        revert("no direct eth");
    }

    function _authorizeUpgrade(address) internal override onlyRole(FEE_ADMIN) {}
}
