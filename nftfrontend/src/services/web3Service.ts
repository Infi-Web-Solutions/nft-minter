import { ethers } from 'ethers';
import { NETWORK_CONFIG, CONTRACT_ADDRESS, switchToSepoliaNetwork } from '@/config';

// Smart contract ABI (you'll need to import this from your compiled contract)
const NFT_MARKETPLACE_ABI = [
  // Basic ERC721 functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  
  // Marketplace functions
  "function mintNFT(string name, string description, string imageURI, string category, uint256 royaltyPercentage, string collectionName) external returns (uint256)",
  "function listNFT(uint256 tokenId, uint256 price, bool isAuction, uint256 auctionDuration) external",
  "function buyNFT(uint256 tokenId) external payable",
  "function placeBid(uint256 tokenId) external payable",
  "function endAuction(uint256 tokenId) external",
  "function delistNFT(uint256 tokenId) external",
  
  // View functions
  "function getNFTMetadata(uint256 tokenId) external view returns (tuple(string name, string description, string imageURI, string category, uint256 royaltyPercentage, string collectionName))",
  "function getListing(uint256 tokenId) external view returns (tuple(address seller, uint256 price, bool isAuction, uint256 auctionEndTime, uint256 currentBid, address highestBidder))",
  "function getUserNFTs(address user) external view returns (uint256[])",
  "function getUserListings(address user) external view returns (uint256[])",
  
  // Events
  "event NFTMinted(uint256 indexed tokenId, address indexed creator, string tokenURI, uint256 royaltyPercentage)",
  "event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price, bool isAuction)",
  "event NFTSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)",
  "event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount)",
  "event AuctionEnded(uint256 indexed tokenId, address indexed winner, uint256 finalPrice)"
];

export interface NFTMetadata {
  name: string;
  description: string;
  imageURI: string;
  category: string;
  royaltyPercentage: number;
  collectionName: string;
}

export interface Listing {
  seller: string;
  price: string;
  isAuction: boolean;
  auctionEndTime: string;
  currentBid: string;
  highestBidder: string;
}

export class Web3Service {
  private contract: ethers.Contract | null = null;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  async initialize(provider: ethers.BrowserProvider) {
    // First, ensure we're on Sepolia network
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(NETWORK_CONFIG.chainIdDecimal)) {
      const switched = await switchToSepoliaNetwork();
      if (!switched) {
        throw new Error('Please switch to the Sepolia Test Network to continue.');
      }
      // Get fresh provider after network switch
      provider = new ethers.BrowserProvider(window.ethereum);
    }

    this.provider = provider;
    this.signer = await provider.getSigner();
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_MARKETPLACE_ABI, this.signer);
  }

  // Check if service is initialized and on correct network
  private async checkInitialized() {
    if (!this.contract || !this.signer) {
      throw new Error('Web3Service not initialized. Call initialize() first.');
    }

    // Verify we're still on Sepolia
    const network = await this.provider!.getNetwork();
    if (network.chainId !== BigInt(NETWORK_CONFIG.chainIdDecimal)) {
      throw new Error('Please switch to the Sepolia Test Network to continue.');
    }
  }

  // Get contract instance
  getContract() {
    this.checkInitialized();
    return this.contract!;
  }

  // Get signer
  getSigner() {
    this.checkInitialized();
    return this.signer!;
  }

  // Mint a new NFT
  async mintNFT(
    name: string,
    description: string,
    imageURI: string,
    category: string,
    royaltyPercentage: number,
    collectionName: string
  ): Promise<ethers.ContractTransactionResponse> {
    this.checkInitialized();
    
    const tx = await this.contract!.mintNFT(
      name,
      description,
      imageURI,
      category,
      royaltyPercentage,
      collectionName
    );
    
    return tx;
  }

  // List an NFT for sale
  async listNFT(
    tokenId: number,
    price: string, // in ETH
    isAuction: boolean = false,
    auctionDuration: number = 0
  ): Promise<ethers.ContractTransactionResponse> {
    this.checkInitialized();
    
    const priceInWei = ethers.parseEther(price);
    
    const tx = await this.contract!.listNFT(
      tokenId,
      priceInWei,
      isAuction,
      auctionDuration
    );
    
    return tx;
  }

  // Check if user has sufficient balance
  async checkBalance(price: string): Promise<boolean> {
    this.checkInitialized();
    
    const priceInWei = ethers.parseEther(price);
    const balance = await this.provider!.getBalance(await this.signer!.getAddress());
    
    return balance >= priceInWei;
  }

  // Buy an NFT
  async buyNFT(tokenId: number, price: string): Promise<ethers.ContractTransactionResponse> {
    this.checkInitialized();
    
    const priceInWei = ethers.parseEther(price);
    
    // Check balance before proceeding
    const hasBalance = await this.checkBalance(price);
    if (!hasBalance) {
      throw new Error("Insufficient balance to complete this purchase");
    }
    
    const tx = await this.contract!.buyNFT(tokenId, { value: priceInWei });
    
    return tx;
  }

  // Place a bid on an auction
  async placeBid(tokenId: number, bidAmount: string): Promise<ethers.ContractTransactionResponse> {
    this.checkInitialized();
    
    const bidInWei = ethers.parseEther(bidAmount);
    
    const tx = await this.contract!.placeBid(tokenId, { value: bidInWei });
    
    return tx;
  }

  // End an auction
  async endAuction(tokenId: number): Promise<ethers.ContractTransactionResponse> {
    this.checkInitialized();
    
    const tx = await this.contract!.endAuction(tokenId);
    
    return tx;
  }

  // Delist an NFT
  async delistNFT(tokenId: number): Promise<ethers.ContractTransactionResponse> {
    this.checkInitialized();
    
    const tx = await this.contract!.delistNFT(tokenId);
    
    return tx;
  }

  // Get NFT metadata
  async getNFTMetadata(tokenId: number): Promise<NFTMetadata> {
    this.checkInitialized();
    
    const metadata = await this.contract!.getNFTMetadata(tokenId);
    
    return {
      name: metadata[0],
      description: metadata[1],
      imageURI: metadata[2],
      category: metadata[3],
      royaltyPercentage: Number(metadata[4]),
      collectionName: metadata[5]
    };
  }

  // Get listing information
  async getListing(tokenId: number): Promise<Listing> {
    this.checkInitialized();
    
    const listing = await this.contract!.getListing(tokenId);
    
    return {
      seller: listing[0],
      price: ethers.formatEther(listing[1]),
      isAuction: listing[2],
      auctionEndTime: listing[3].toString(),
      currentBid: ethers.formatEther(listing[4]),
      highestBidder: listing[5]
    };
  }

  // Get user's NFTs
  async getUserNFTs(userAddress: string): Promise<number[]> {
    this.checkInitialized();
    
    const tokenIds = await this.contract!.getUserNFTs(userAddress);
    
    return tokenIds.map((id: bigint) => Number(id));
  }

  // Get user's listings
  async getUserListings(userAddress: string): Promise<number[]> {
    this.checkInitialized();
    
    const tokenIds = await this.contract!.getUserListings(userAddress);
    
    return tokenIds.map((id: bigint) => Number(id));
  }

  // Get contract info
  async getContractInfo() {
    this.checkInitialized();
    
    const name = await this.contract!.name();
    const symbol = await this.contract!.symbol();
    
    return {
      name,
      symbol,
      address: CONTRACT_ADDRESS,
      network: await this.provider!.getNetwork()
    };
  }

  // Wait for transaction
  async waitForTransaction(tx: ethers.ContractTransactionResponse) {
    const receipt = await tx.wait();
    return receipt;
  }

  // Format error message
  formatError(error: any): string {
    if (error.code === 'ACTION_REJECTED') {
      return 'Transaction was rejected by user';
    }
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return 'Insufficient funds for transaction';
    }
    
    if (error.message) {
      return error.message;
    }
    
    return 'An unknown error occurred';
  }
}

// Create singleton instance
export const web3Service = new Web3Service(); 