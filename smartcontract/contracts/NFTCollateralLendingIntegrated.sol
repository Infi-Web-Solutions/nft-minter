// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IWrappedLeasing {
    function getLeaseStatus(uint256 wId) external view returns (bool isActive, uint256 timeRemaining);
}

/**
 * @title NFTCollateralLendingIntegrated
 * @dev Lending contract supporting marketplace NFTs and other ERC721 NFTs
 */
contract NFTCollateralLendingIntegrated is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10000;

    enum LoanStatus { Requested, Funded, Repaid, Liquidated, Cancelled }

    struct Loan {
        address nftContract;
        uint256 tokenId;
        address borrower;
        address lender;
        address currency;     // address(0) for ETH
        uint256 principal;
        uint256 interestBps;
        uint256 duration;
        uint256 startTime;
        LoanStatus status;
        uint256 maxLTV;
        bool isMarketplaceNFT;
    }

    uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans;

    mapping(address => uint256) public pendingETHWithdrawals;
    mapping(address => mapping(address => uint256)) public pendingERC20Withdrawals;

    // Optional whitelist for trusted NFTs
    mapping(address => bool) public nftWhitelist;
    bool public useWhitelist = false;

    // Marketplace NFTs approved automatically
    mapping(address => bool) public marketplaceNFTs;

    // Wrapped Leasing contracts
    mapping(address => bool) public wrappedLeasingContracts;

    // Events
    event LoanRequested(uint256 indexed loanId, address indexed borrower, address nftContract, uint256 tokenId, address currency, uint256 principal, uint256 interestBps, uint256 duration, bool isMarketplaceNFT);
    event LoanCancelled(uint256 indexed loanId, address indexed borrower);
    event LoanFunded(uint256 indexed loanId, address indexed lender);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 repayAmount);
    event LoanLiquidated(uint256 indexed loanId, address indexed lender);
    event WithdrawnETH(address indexed user, uint256 amount);
    event WithdrawnERC20(address indexed user, address indexed token, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {
        nextLoanId = 1;
    }


    /* ==========================
       NFT & Whitelist Management
       ========================== */
    function setWhitelist(address nft, bool allowed) external onlyOwner {
        nftWhitelist[nft] = allowed;
    }

    function enableWhitelist(bool enable) external onlyOwner {
        useWhitelist = enable;
    }

    function setMarketplaceNFT(address nft, bool isMarketplace) external onlyOwner {
        marketplaceNFTs[nft] = isMarketplace;
    }

    function setWrappedLeasingContract(address nft, bool isWrapped) external onlyOwner {
        wrappedLeasingContracts[nft] = isWrapped;
    }

    /* ==========================
       Internal helpers
       ========================== */
    function _safeSendETH(address to, uint256 amount) internal returns (bool) {
        if (amount == 0) return true;
        (bool sent,) = payable(to).call{value: amount, gas: 23000}("");
        if (sent) return true;
        pendingETHWithdrawals[to] += amount;
        return false;
    }

    function _safeSendERC20(address token, address to, uint256 amount) internal returns (bool) {
        if (amount == 0) return true;
        IERC20(token).safeTransfer(to, amount);
        return true;
    }

    /* ==========================
       Core functions
       ========================== */
    function createLoanRequest(
        address nftContract,
        uint256 tokenId,
        address currency,
        uint256 principal,
        uint256 interestBps,
        uint256 duration,
        uint256 maxLTV
    ) external nonReentrant returns (uint256) {
        require(principal > 0, "Principal > 0");
        require(duration > 0, "InvalidDuration");
        require(interestBps > 0, "InvalidInterest");
        require(interestBps <= BASIS_POINTS * 5, "Interest too high");

        if (useWhitelist) {
            require(nftWhitelist[nftContract], "NFT not whitelisted");
        }

        // Check if it's a wrapped lease and verify duration
        if (wrappedLeasingContracts[nftContract]) {
            (bool isActive, uint256 timeRemaining) = IWrappedLeasing(nftContract).getLeaseStatus(tokenId);
            require(isActive, "Lease not active");
            require(timeRemaining >= duration, "Lease expires before loan");
        }

        bool isMarketNFT = marketplaceNFTs[nftContract];

        // For non-marketplace NFTs, borrower must approve
        if (!isMarketNFT) {
            IERC721(nftContract).safeTransferFrom(msg.sender, address(this), tokenId);
        }

        uint256 loanId = nextLoanId++;
        loans[loanId] = Loan({
            nftContract: nftContract,
            tokenId: tokenId,
            borrower: msg.sender,
            lender: address(0),
            currency: currency,
            principal: principal,
            interestBps: interestBps,
            duration: duration,
            startTime: 0,
            status: LoanStatus.Requested,
            maxLTV: maxLTV,
            isMarketplaceNFT: isMarketNFT
        });

        emit LoanRequested(loanId, msg.sender, nftContract, tokenId, currency, principal, interestBps, duration, isMarketNFT);
        return loanId;
    }

    function cancelLoan(uint256 loanId) external nonReentrant {
        Loan storage L = loans[loanId];
        require(L.status == LoanStatus.Requested, "Not cancellable");
        require(L.borrower == msg.sender, "Only borrower");

        // Return NFT if not marketplace NFT
        if (!L.isMarketplaceNFT) {
            IERC721(L.nftContract).safeTransferFrom(address(this), L.borrower, L.tokenId);
        }

        L.status = LoanStatus.Cancelled;
        emit LoanCancelled(loanId, msg.sender);
    }

    function fundLoan(uint256 loanId) external payable nonReentrant {
        Loan storage L = loans[loanId];
        require(L.status == LoanStatus.Requested, "AlreadyFunded");
        require(L.borrower != msg.sender, "BorrowerCannotFundOwnLoan");

        L.lender = msg.sender;
        L.startTime = block.timestamp;
        L.status = LoanStatus.Funded;

        if (L.currency == address(0)) {
            require(msg.value == L.principal, "Send ETH");
            _safeSendETH(L.borrower, L.principal);
        } else {
            require(msg.value == 0, "Do not send ETH");
            IERC20(L.currency).safeTransferFrom(msg.sender, address(this), L.principal);
            _safeSendERC20(L.currency, L.borrower, L.principal);
        }

        emit LoanFunded(loanId, msg.sender);
    }

    function repayLoan(uint256 loanId) external payable nonReentrant {
        Loan storage L = loans[loanId];
        require(L.status == LoanStatus.Funded, "LoanNotFunded");
        require(msg.sender == L.borrower, "NotBorrower");

        uint256 interestAmount = (L.principal * L.interestBps) / BASIS_POINTS;
        uint256 repayAmount = L.principal + interestAmount;

        if (L.currency == address(0)) {
            require(msg.value == repayAmount, "Send full ETH");
            _safeSendETH(L.lender, repayAmount);
        } else {
            IERC20(L.currency).safeTransferFrom(msg.sender, address(this), repayAmount);
            _safeSendERC20(L.currency, L.lender, repayAmount);
        }

        if (!L.isMarketplaceNFT) {
            IERC721(L.nftContract).safeTransferFrom(address(this), L.borrower, L.tokenId);
        }

        L.status = LoanStatus.Repaid;
        emit LoanRepaid(loanId, msg.sender, repayAmount);
    }

    function liquidateLoan(uint256 loanId) external nonReentrant {
        Loan storage L = loans[loanId];
        require(L.status == LoanStatus.Funded, "LoanNotActive");
        require(msg.sender == L.lender, "NotLender");
        require(block.timestamp > L.startTime + L.duration, "NotExpired");
        require(!L.isMarketplaceNFT, "MarketplaceNFTNoLiquidation");

        // NFT remains with marketplace for marketplace NFTs
        if (!L.isMarketplaceNFT) {
            IERC721(L.nftContract).safeTransferFrom(address(this), L.lender, L.tokenId);
        }

        L.status = LoanStatus.Liquidated;
        emit LoanLiquidated(loanId, msg.sender);
    }

    /* ==========================
       Withdraw helpers
       ========================== */
    function withdrawETH() external nonReentrant {
        uint256 amount = pendingETHWithdrawals[msg.sender];
        require(amount > 0, "No ETH to withdraw");
        pendingETHWithdrawals[msg.sender] = 0;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH withdraw failed");
        emit WithdrawnETH(msg.sender, amount);
    }

    function withdrawERC20(address token) external nonReentrant {
        uint256 amount = pendingERC20Withdrawals[msg.sender][token];
        require(amount > 0, "No ERC20 to withdraw");
        pendingERC20Withdrawals[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit WithdrawnERC20(msg.sender, token, amount);
    }

    /* ==========================
       Views
       ========================== */
    function computeRepayAmount(uint256 loanId) external view returns (uint256) {
        Loan storage L = loans[loanId];
        return L.principal + ((L.principal * L.interestBps) / BASIS_POINTS);
    }

    /* ==========================
       Safety / Receiver hooks
       ========================== */
    receive() external payable {}
    fallback() external payable {}
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}