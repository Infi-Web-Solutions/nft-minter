# NFT Marketplace Smart Contract

A comprehensive NFT marketplace smart contract built with Solidity and Hardhat, supporting minting, buying, selling, auctions, royalties, and collections.

## Features

### 🎨 NFT Minting
- Mint new NFTs with metadata (name, description, image URI, category)
- Set royalty percentages (0-10%)
- Create and manage collections
- Automatic collection creation on first NFT mint

### 💰 Marketplace Functions
- **Fixed Price Sales**: List NFTs for immediate purchase
- **Auctions**: Create time-limited auctions with bidding
- **Automatic Fee Distribution**: Marketplace fees (2.5%) and creator royalties
- **Bid Management**: Automatic refunds for outbid users

### 🏛️ Collections
- Group NFTs into collections
- Track collection creators and metadata
- View all NFTs in a collection

### 👑 Royalties
- Creator royalties on secondary sales
- Configurable royalty percentages
- Automatic royalty distribution

### 🔍 View Functions
- Get user's owned NFTs
- Get user's listings
- Get NFT metadata
- Get collection details
- Get listing information

## Contract Structure

### Main Contract: `NFTMarketplace.sol`

**Inherits from:**
- `ERC721`: Standard NFT functionality
- `ERC721URIStorage`: URI storage for NFT metadata
- `ReentrancyGuard`: Protection against reentrancy attacks
- `Ownable`: Access control for admin functions

**Key Structs:**
```solidity
struct Listing {
    address seller;
    uint256 price;
    bool isActive;
    bool isAuction;
    uint256 auctionEndTime;
    uint256 startingPrice;
    uint256 highestBid;
    address highestBidder;
}

struct Collection {
    string name;
    string description;
    address creator;
    uint256[] tokenIds;
    bool exists;
}

struct NFTMetadata {
    string name;
    string description;
    string imageURI;
    string category;
    uint256 royaltyPercentage;
    address creator;
    uint256 createdAt;
    string collection;
}
```

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Git

### 1. Install Dependencies
```bash
cd smartcontract
npm install
```

### 2. Environment Setup
Create a `.env` file in the smartcontract directory:
```env
PRIVATE_KEY=your_private_key_here
TESTNET_URL=https://sepolia.infura.io/v3/your_project_id
MAINNET_URL=https://mainnet.infura.io/v3/your_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### 3. Compile Contracts
```bash
npm run compile
```

### 4. Run Tests
```bash
npm test
```

### 5. Deploy Contract

**Local Development:**
```bash
# Start local node
npx hardhat node

# Deploy to local network
npm run deploy
```

**Testnet Deployment:**
```bash
npm run deploy:testnet
```

**Mainnet Deployment:**
```bash
npm run deploy:mainnet
```

## Contract Functions

### NFT Minting
```solidity
function mintNFT(
    string memory name,
    string memory description,
    string memory imageURI,
    string memory category,
    uint256 royaltyPercentage,
    string memory collectionName
) external returns (uint256)
```

### Listing Functions
```solidity
// List NFT for fixed price or auction
function listNFT(
    uint256 tokenId,
    uint256 price,
    bool isAuction,
    uint256 auctionDuration
) external

// Buy NFT (fixed price)
function buyNFT(uint256 tokenId) external payable

// Place bid on auction
function placeBid(uint256 tokenId) external payable

// End auction
function endAuction(uint256 tokenId) external

// Delist NFT
function delistNFT(uint256 tokenId) external
```

### View Functions
```solidity
// Get user's NFTs
function getUserNFTs(address user) external view returns (uint256[] memory)

// Get user's listings
function getUserListings(address user) external view returns (uint256[] memory)

// Get collection details
function getCollection(string memory collectionName) external view returns (Collection memory)

// Get NFT metadata
function getNFTMetadata(uint256 tokenId) external view returns (NFTMetadata memory)

// Get listing details
function getListing(uint256 tokenId) external view returns (Listing memory)
```

### Admin Functions
```solidity
// Update marketplace fee (owner only)
function updateMarketplaceFee(uint256 newFee) external

// Withdraw marketplace fees (owner only)
function withdrawFees() external
```

## Frontend Integration

### 1. Install Web3 Dependencies
In your frontend project:
```bash
npm install ethers@6.8.1 @web3-react/core @web3-react/injected-connector
```

### 2. Contract ABI
After compilation, the ABI will be available in `artifacts/contracts/NFTMarketplace.sol/NFTMarketplace.json`

### 3. Contract Address
After deployment, update your frontend with the deployed contract address.

### 4. Example Integration
```javascript
import { ethers } from 'ethers';
import NFTMarketplaceABI from './NFTMarketplace.json';

const contractAddress = 'YOUR_DEPLOYED_CONTRACT_ADDRESS';
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
const contract = new ethers.Contract(contractAddress, NFTMarketplaceABI.abi, signer);

// Mint NFT
const mintNFT = async (name, description, imageURI, category, royaltyPercentage, collectionName) => {
  try {
    const tx = await contract.mintNFT(name, description, imageURI, category, royaltyPercentage, collectionName);
    await tx.wait();
    console.log('NFT minted successfully!');
  } catch (error) {
    console.error('Error minting NFT:', error);
  }
};

// List NFT for sale
const listNFT = async (tokenId, price, isAuction, auctionDuration) => {
  try {
    const priceInWei = ethers.utils.parseEther(price.toString());
    const tx = await contract.listNFT(tokenId, priceInWei, isAuction, auctionDuration);
    await tx.wait();
    console.log('NFT listed successfully!');
  } catch (error) {
    console.error('Error listing NFT:', error);
  }
};

// Buy NFT
const buyNFT = async (tokenId, price) => {
  try {
    const priceInWei = ethers.utils.parseEther(price.toString());
    const tx = await contract.buyNFT(tokenId, { value: priceInWei });
    await tx.wait();
    console.log('NFT purchased successfully!');
  } catch (error) {
    console.error('Error buying NFT:', error);
  }
};
```

## Gas Optimization

The contract includes several gas optimization features:
- Efficient storage patterns
- Batch operations where possible
- Optimized loops and conditionals
- Minimal storage writes

## Security Features

- **Reentrancy Protection**: Prevents reentrancy attacks
- **Access Control**: Owner-only functions for admin operations
- **Input Validation**: Comprehensive parameter validation
- **Safe Transfers**: Proper handling of ETH transfers
- **Bid Refunds**: Automatic refunds for outbid users

## Events

The contract emits events for all major operations:
- `NFTMinted`: When a new NFT is minted
- `NFTListed`: When an NFT is listed for sale
- `NFTSold`: When an NFT is sold
- `AuctionCreated`: When an auction is created
- `BidPlaced`: When a bid is placed
- `AuctionEnded`: When an auction ends
- `NFTDelisted`: When an NFT is delisted
- `CollectionCreated`: When a collection is created
- `RoyaltyPaid`: When royalties are distributed

## Testing

Run the comprehensive test suite:
```bash
npm test
```

The test suite covers:
- Contract deployment
- NFT minting
- Listing and delisting
- Buying and selling
- Auction functionality
- View functions
- Admin functions
- Error cases

## Deployment Networks

### Local Development
- **Network**: Hardhat Network
- **Chain ID**: 1337
- **RPC URL**: http://127.0.0.1:8545

### Testnet (Sepolia)
- **Network**: Sepolia Testnet
- **Chain ID**: 11155111
- **RPC URL**: https://sepolia.infura.io/v3/YOUR_PROJECT_ID

### Mainnet
- **Network**: Ethereum Mainnet
- **Chain ID**: 1
- **RPC URL**: https://mainnet.infura.io/v3/YOUR_PROJECT_ID

## License

This project is licensed under the MIT License.

## Support

For questions or issues:
1. Check the test files for usage examples
2. Review the contract comments for detailed explanations
3. Open an issue on the repository

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

---

**Note**: This smart contract is designed to work with the NFT marketplace frontend. Make sure to update the frontend with the deployed contract address and ABI after deployment. 