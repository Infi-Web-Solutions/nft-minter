// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title NFTMarketplace
 * @dev A comprehensive NFT marketplace with minting, buying, selling, auctions, and royalties
 */
contract NFTMarketplace is ERC721, ReentrancyGuard, Ownable {
    using Strings for uint256;

    // Events
    event NFTMinted(uint256 indexed tokenId, address indexed creator, string tokenURI, uint256 royaltyPercentage);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price, bool isAuction);
    event NFTSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 startingPrice, uint256 duration);
    event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event AuctionEnded(uint256 indexed tokenId, address indexed winner, uint256 finalPrice);
    event NFTDelisted(uint256 indexed tokenId, address indexed seller);
    event CollectionCreated(string indexed collectionName, address indexed creator);
    event RoyaltyPaid(uint256 indexed tokenId, address indexed creator, uint256 amount);

    // Structs
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

    // State variables
    uint256 private _tokenIds;
    
    uint256 public marketplaceFee = 250; // 2.5% (250 basis points)
    uint256 public constant BASIS_POINTS = 10000;
    
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => NFTMetadata) public nftMetadata;
    mapping(string => Collection) public collections;
    mapping(address => uint256[]) public userNFTs;
    mapping(address => uint256[]) public userListings;
    mapping(uint256 => bool) public tokenExists;
    mapping(uint256 => string) private _tokenURIs;

    // Modifiers
    modifier tokenExistsModifier(uint256 tokenId) {
        require(tokenExists[tokenId], "NFT does not exist");
        _;
    }

    modifier onlyTokenOwner(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");
        _;
    }

    modifier listingExists(uint256 tokenId) {
        require(listings[tokenId].isActive, "NFT not listed for sale");
        _;
    }

    modifier auctionActive(uint256 tokenId) {
        require(listings[tokenId].isAuction, "Not an auction");
        require(block.timestamp < listings[tokenId].auctionEndTime, "Auction ended");
        _;
    }

    constructor() ERC721("NFTMarketplace", "NFTM") Ownable(msg.sender) {}

    /**
     * @dev Mint a new NFT
     * @param name NFT name
     * @param description NFT description
     * @param imageURI Image URI
     * @param category NFT category (art, gaming, music, etc.)
     * @param royaltyPercentage Royalty percentage (0-1000 = 0-10%)
     * @param collectionName Collection name
     */
    function mintNFT(
        string memory name,
        string memory description,
        string memory imageURI,
        string memory category,
        uint256 royaltyPercentage,
        string memory collectionName
    ) external returns (uint256) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(imageURI).length > 0, "Image URI cannot be empty");
        require(royaltyPercentage <= 1000, "Royalty cannot exceed 10%");

        _tokenIds++;
        uint256 newTokenId = _tokenIds;

        // Create or update collection
        if (bytes(collections[collectionName].name).length == 0) {
            collections[collectionName] = Collection({
                name: collectionName,
                description: "",
                creator: msg.sender,
                tokenIds: new uint256[](0),
                exists: true
            });
            emit CollectionCreated(collectionName, msg.sender);
        }

        // Add token to collection
        collections[collectionName].tokenIds.push(newTokenId);

        // Store metadata
        nftMetadata[newTokenId] = NFTMetadata({
            name: name,
            description: description,
            imageURI: imageURI,
            category: category,
            royaltyPercentage: royaltyPercentage,
            creator: msg.sender,
            createdAt: block.timestamp,
            collection: collectionName
        });

        // Mint the NFT
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, imageURI);
        
        tokenExists[newTokenId] = true;
        userNFTs[msg.sender].push(newTokenId);

        emit NFTMinted(newTokenId, msg.sender, imageURI, royaltyPercentage);
        
        return newTokenId;
    }

    /**
     * @dev List an NFT for sale
     * @param tokenId The NFT token ID
     * @param price The sale price in wei
     * @param isAuction Whether this is an auction listing
     * @param auctionDuration Duration of auction in seconds (if auction)
     */
    function listNFT(
        uint256 tokenId,
        uint256 price,
        bool isAuction,
        uint256 auctionDuration
    ) external tokenExistsModifier(tokenId) onlyTokenOwner(tokenId) {
        require(price > 0, "Price must be greater than 0");
        require(!listings[tokenId].isActive, "NFT already listed");
        require(ownerOf(tokenId) == msg.sender, "Not the token owner");

        if (isAuction) {
            require(auctionDuration > 0, "Auction duration must be greater than 0");
            require(auctionDuration <= 7 days, "Auction duration cannot exceed 7 days");
        }

        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            isActive: true,
            isAuction: isAuction,
            auctionEndTime: isAuction ? block.timestamp + auctionDuration : 0,
            startingPrice: isAuction ? price : 0,
            highestBid: 0,
            highestBidder: address(0)
        });

        userListings[msg.sender].push(tokenId);

        emit NFTListed(tokenId, msg.sender, price, isAuction);
        
        if (isAuction) {
            emit AuctionCreated(tokenId, msg.sender, price, auctionDuration);
        }
    }

    /**
     * @dev Buy an NFT (fixed price sale)
     * @param tokenId The NFT token ID
     */
    function buyNFT(uint256 tokenId) external payable nonReentrant listingExists(tokenId) {
        Listing storage listing = listings[tokenId];
        require(!listing.isAuction, "This is an auction, use placeBid instead");
        require(msg.value == listing.price, "Incorrect price");
        require(msg.sender != listing.seller, "Cannot buy your own NFT");

        address seller = listing.seller;
        uint256 price = listing.price;

        // Calculate fees
        uint256 marketplaceFeeAmount = (price * marketplaceFee) / BASIS_POINTS;
        uint256 royaltyAmount = (price * nftMetadata[tokenId].royaltyPercentage) / BASIS_POINTS;
        uint256 sellerAmount = price - marketplaceFeeAmount - royaltyAmount;

        // Transfer NFT
        _transfer(seller, msg.sender, tokenId);

        // Update user mappings
        _removeFromUserNFTs(seller, tokenId);
        userNFTs[msg.sender].push(tokenId);
        _removeFromUserListings(seller, tokenId);

        // Clear listing
        delete listings[tokenId];

        // Transfer payments
        payable(seller).transfer(sellerAmount);
        payable(owner()).transfer(marketplaceFeeAmount);
        
        if (royaltyAmount > 0) {
            payable(nftMetadata[tokenId].creator).transfer(royaltyAmount);
            emit RoyaltyPaid(tokenId, nftMetadata[tokenId].creator, royaltyAmount);
        }

        emit NFTSold(tokenId, seller, msg.sender, price);
    }

    /**
     * @dev Place a bid on an auction
     * @param tokenId The NFT token ID
     */
    function placeBid(uint256 tokenId) external payable nonReentrant auctionActive(tokenId) {
        Listing storage listing = listings[tokenId];
        require(msg.sender != listing.seller, "Cannot bid on your own auction");
        require(msg.value > listing.highestBid, "Bid must be higher than current bid");
        require(msg.value >= listing.startingPrice, "Bid must be at least starting price");

        // Refund previous highest bidder
        if (listing.highestBidder != address(0)) {
            payable(listing.highestBidder).transfer(listing.highestBid);
        }

        listing.highestBid = msg.value;
        listing.highestBidder = msg.sender;

        emit BidPlaced(tokenId, msg.sender, msg.value);
    }

    /**
     * @dev End an auction and transfer NFT to winner
     * @param tokenId The NFT token ID
     */
    function endAuction(uint256 tokenId) external nonReentrant listingExists(tokenId) {
        Listing storage listing = listings[tokenId];
        require(listing.isAuction, "Not an auction");
        require(block.timestamp >= listing.auctionEndTime, "Auction not ended yet");

        address seller = listing.seller;
        address winner = listing.highestBidder;
        uint256 finalPrice = listing.highestBid;

        if (winner != address(0)) {
            // Calculate fees
            uint256 marketplaceFeeAmount = (finalPrice * marketplaceFee) / BASIS_POINTS;
            uint256 royaltyAmount = (finalPrice * nftMetadata[tokenId].royaltyPercentage) / BASIS_POINTS;
            uint256 sellerAmount = finalPrice - marketplaceFeeAmount - royaltyAmount;

            // Transfer NFT
            _transfer(seller, winner, tokenId);

            // Update user mappings
            _removeFromUserNFTs(seller, tokenId);
            userNFTs[winner].push(tokenId);
            _removeFromUserListings(seller, tokenId);

            // Transfer payments
            payable(seller).transfer(sellerAmount);
            payable(owner()).transfer(marketplaceFeeAmount);
            
            if (royaltyAmount > 0) {
                payable(nftMetadata[tokenId].creator).transfer(royaltyAmount);
                emit RoyaltyPaid(tokenId, nftMetadata[tokenId].creator, royaltyAmount);
            }

            emit NFTSold(tokenId, seller, winner, finalPrice);
        }

        emit AuctionEnded(tokenId, winner, finalPrice);
        delete listings[tokenId];
    }

    /**
     * @dev Delist an NFT from marketplace
     * @param tokenId The NFT token ID
     */
    function delistNFT(uint256 tokenId) external onlyTokenOwner(tokenId) listingExists(tokenId) {
        Listing storage listing = listings[tokenId];
        require(listing.seller == msg.sender, "Not the seller");

        // Refund highest bidder if auction
        if (listing.isAuction && listing.highestBidder != address(0)) {
            payable(listing.highestBidder).transfer(listing.highestBid);
        }

        _removeFromUserListings(msg.sender, tokenId);
        delete listings[tokenId];

        emit NFTDelisted(tokenId, msg.sender);
    }

    /**
     * @dev Get all NFTs owned by a user
     * @param user The user address
     * @return Array of token IDs
     */
    function getUserNFTs(address user) external view returns (uint256[] memory) {
        return userNFTs[user];
    }

    /**
     * @dev Get all listings by a user
     * @param user The user address
     * @return Array of token IDs
     */
    function getUserListings(address user) external view returns (uint256[] memory) {
        return userListings[user];
    }

    /**
     * @dev Get collection details
     * @param collectionName The collection name
     * @return Collection struct
     */
    function getCollection(string memory collectionName) external view returns (Collection memory) {
        return collections[collectionName];
    }

    /**
     * @dev Get NFT metadata
     * @param tokenId The NFT token ID
     * @return NFTMetadata struct
     */
    function getNFTMetadata(uint256 tokenId) external view tokenExistsModifier(tokenId) returns (NFTMetadata memory) {
        return nftMetadata[tokenId];
    }

    /**
     * @dev Get listing details
     * @param tokenId The NFT token ID
     * @return Listing struct
     */
    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return listings[tokenId];
    }

    /**
     * @dev Update marketplace fee (owner only)
     * @param newFee New fee in basis points
     */
    function updateMarketplaceFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee cannot exceed 10%");
        marketplaceFee = newFee;
    }

    /**
     * @dev Withdraw marketplace fees (owner only)
     */
    function withdrawFees() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Helper functions
    function _removeFromUserNFTs(address user, uint256 tokenId) internal {
        uint256[] storage userTokens = userNFTs[user];
        for (uint256 i = 0; i < userTokens.length; i++) {
            if (userTokens[i] == tokenId) {
                userTokens[i] = userTokens[userTokens.length - 1];
                userTokens.pop();
                break;
            }
        }
    }

    function _removeFromUserListings(address user, uint256 tokenId) internal {
        uint256[] storage userTokens = userListings[user];
        for (uint256 i = 0; i < userTokens.length; i++) {
            if (userTokens[i] == tokenId) {
                userTokens[i] = userTokens[userTokens.length - 1];
                userTokens.pop();
                break;
            }
        }
    }

    // Token URI functions
    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal {
        _tokenURIs[tokenId] = _tokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenExists[tokenId], "URI query for nonexistent token");
        return _tokenURIs[tokenId];
    }
}
