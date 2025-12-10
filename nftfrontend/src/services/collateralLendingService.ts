import { ethers } from 'ethers';

// ABI for NFTCollateralLendingIntegrated
const COLLATERAL_LENDING_ABI = [
  "function createLoanRequest(address nftContract, uint256 tokenId, address currency, uint256 principal, uint256 interestBps, uint256 duration, uint256 maxLTV) external returns (uint256)",
  "function fundLoan(uint256 loanId) external payable",
  "function repayLoan(uint256 loanId) external payable",
  "function liquidateLoan(uint256 loanId) external",
  "function cancelLoan(uint256 loanId) external",
  "function loans(uint256 loanId) external view returns (address nftContract, uint256 tokenId, address borrower, address lender, address currency, uint256 principal, uint256 interestBps, uint256 duration, uint256 startTime, uint8 status, uint256 maxLTV, bool isMarketplaceNFT)",
  "function computeRepayAmount(uint256 loanId) external view returns (uint256)",
  "event LoanRequested(uint256 indexed loanId, address indexed borrower, address nftContract, uint256 tokenId, address currency, uint256 principal, uint256 interestBps, uint256 duration, bool isMarketplaceNFT)",
  "event LoanFunded(uint256 indexed loanId, address indexed lender)",
  "event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 repayAmount)",
  "event LoanLiquidated(uint256 indexed loanId, address indexed lender)",
  "event LoanCancelled(uint256 indexed loanId, address indexed borrower)"
];

// ERC721 ABI for approval
// ERC721 ABI for approval
const ERC721_ABI = [
  "function approve(address to, uint256 tokenId) external",
  "function setApprovalForAll(address operator, bool approved) external",
  "function getApproved(uint256 tokenId) external view returns (address)",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
  "function ownerOf(uint256 tokenId) external view returns (address)"
];

// Placeholder address - REPLACE WITH ACTUAL DEPLOYED ADDRESS
export const COLLATERAL_CONTRACT_ADDRESS = "0x6c963e6EfBAe88Db30272202a9e6352ab7Ecb56e";

export enum LoanStatus {
  Requested = 0,
  Funded = 1,
  Repaid = 2,
  Liquidated = 3,
  Cancelled = 4
}

export interface LoanDetails {
  loanId: number;
  nftContract: string;
  tokenId: number;
  borrower: string;
  lender: string;
  currency: string;
  principal: string; // formatted in ETH
  interestBps: number;
  duration: number;
  startTime: number;
  status: LoanStatus;
  maxLTV: number;
  isMarketplaceNFT: boolean;
}

export class CollateralLendingService {
  private contract: ethers.Contract | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  async initialize(provider: ethers.BrowserProvider, address: string = COLLATERAL_CONTRACT_ADDRESS) {
    this.provider = provider;
    this.signer = await provider.getSigner();
    this.contract = new ethers.Contract(address, COLLATERAL_LENDING_ABI, this.signer);
  }

  private checkInitialized() {
    if (!this.contract || !this.signer) {
      throw new Error('CollateralLendingService not initialized. Call initialize() first.');
    }
  }

  // Get NFT Owner on-chain
  async getNFTOwner(nftContractAddress: string, tokenId: string): Promise<string> {
    this.checkInitialized();
    const nftContract = new ethers.Contract(nftContractAddress, ERC721_ABI, this.provider); // Use provider for read-only
    return await nftContract.ownerOf(tokenId);
  }

  // Approve NFT transfer
  async approveNFT(nftContractAddress: string, tokenId: string) {
    this.checkInitialized();
    const nftContract = new ethers.Contract(nftContractAddress, ERC721_ABI, this.signer);
    const tx = await nftContract.approve(COLLATERAL_CONTRACT_ADDRESS, tokenId);
    return await tx.wait();
  }

  // Create Loan Request
  async createLoanRequest(
    nftContract: string,
    tokenId: string,
    principalETH: string,
    interestBps: number,
    durationSeconds: number,
    maxLTV: number = 5000 // 50%
  ) {
    this.checkInitialized();
    const principalWei = ethers.parseEther(principalETH);
    
    // Currency address(0) for ETH
    const currency = ethers.ZeroAddress;

    const tx = await this.contract!.createLoanRequest(
      nftContract,
      tokenId,
      currency,
      principalWei,
      interestBps,
      durationSeconds,
      maxLTV
    );
    
    const receipt = await tx.wait();
    
    // Parse event to get loanId
    const event = receipt.logs.find((log: any) => {
        try {
            return this.contract!.interface.parseLog(log)?.name === 'LoanRequested';
        } catch (e) {
            return false;
        }
    });
    
    if (event) {
        const parsedLog = this.contract!.interface.parseLog(event);
        return parsedLog?.args[0]; // loanId
    }
    
    return null;
  }

  // Fund Loan
  async fundLoan(loanId: number, amountETH: string) {
    this.checkInitialized();
    const amountWei = ethers.parseEther(amountETH);
    const tx = await this.contract!.fundLoan(loanId, { value: amountWei });
    return await tx.wait();
  }

  // Repay Loan
  async repayLoan(loanId: number, repayAmountETH: string) {
    this.checkInitialized();
    const amountWei = ethers.parseEther(repayAmountETH);
    const tx = await this.contract!.repayLoan(loanId, { value: amountWei });
    return await tx.wait();
  }

  // Liquidate Loan
  async liquidateLoan(loanId: number) {
    this.checkInitialized();
    const tx = await this.contract!.liquidateLoan(loanId);
    return await tx.wait();
  }

  // Get Loan Details
  async getLoanDetails(loanId: number): Promise<LoanDetails> {
    this.checkInitialized();
    const loan = await this.contract!.loans(loanId);
    
    return {
      loanId,
      nftContract: loan.nftContract,
      tokenId: Number(loan.tokenId),
      borrower: loan.borrower,
      lender: loan.lender,
      currency: loan.currency,
      principal: ethers.formatEther(loan.principal),
      interestBps: Number(loan.interestBps),
      duration: Number(loan.duration),
      startTime: Number(loan.startTime),
      status: Number(loan.status) as LoanStatus,
      maxLTV: Number(loan.maxLTV),
      isMarketplaceNFT: loan.isMarketplaceNFT
    };
  }

  // Compute Repay Amount
  async computeRepayAmount(loanId: number): Promise<string> {
    this.checkInitialized();
    const amountWei = await this.contract!.computeRepayAmount(loanId);
    return ethers.formatEther(amountWei);
  }
}

export const collateralLendingService = new CollateralLendingService();
