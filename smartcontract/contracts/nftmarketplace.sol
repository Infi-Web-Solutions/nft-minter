// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title NFTMarketplace
 * @dev A comprehensive NFT marketplace with minting, buying, selling, auctions, and royalties
 */
contract NFTMarketplace is ERC721, ReentrancyGuard, Pausable, Ownable {
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
    event ExternalNFTListed(address indexed nftContract, uint256 indexed tokenId, address indexed seller, uint256 price);
    event ExternalNFTSold(address indexed nftContract, uint256 indexed tokenId, address indexed seller, address buyer, uint256 price);
    event ExternalNFTDelisted(address indexed nftContract, uint256 indexed tokenId, address indexed seller);
    event MetadataUpdated(uint256 indexed tokenId, string name, string description, string metadataURI);
    event CollectionUpdated(string indexed collectionName, string description);
    event CollaboratorAdded(string indexed collectionName, address indexed collaborator);
    event CollaboratorRemoved(string indexed collectionName, address indexed collaborator);

    
    struct Listing {// Structs
        address seller;
        uint256 price;
        bool isActive;
        bool isAuction;
        uint256 auctionEndTime;
        uint256 startingPrice;
        uint256 highestBid;
        address highestBidder;
    }

    struct ExternalListing {
        address seller;
        uint256 price;
        bool isActive;
    }

    struct Collection {
        string name;
        string description;
        address creator;
        address[] collaborators;
        uint256[] tokenIds;
        bool exists;
        uint256 createdAt;
    }

    struct NFTMetadata {
        string name;
        string description;
        string metadataURI;  // IPFS hash or external JSON URI
        string category;
        uint256 royaltyPercentage;
        address creator;
        uint256 createdAt;
        string collection;
        bool exists;
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
    mapping(address => mapping(uint256 => ExternalListing)) public externalListings;
    mapping(address => mapping(string => bool)) public collectionAccess;  // Access control

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
     * @param metadataURI Metadata URI (IPFS hash or JSON URL)
     * @param category NFT category (art, gaming, music, etc.)
     * @param royaltyPercentage Royalty percentage (0-1000 = 0-10%)
     * @param collectionName Collection name
     */
    function mintNFT(
        string memory name,
        string memory description,
        string memory metadataURI,
        string memory category,
        uint256 royaltyPercentage,
        string memory collectionName
    ) external whenNotPaused returns (uint256) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(metadataURI).length > 0, "Metadata URI cannot be empty");
        require(bytes(description).length > 0, "Description cannot be empty");
        require(royaltyPercentage <= 1000, "Royalty cannot exceed 10%");
        require(bytes(category).length > 0, "Category cannot be empty");

        _tokenIds++;
        uint256 newTokenId = _tokenIds;

        // Create or update collection with access control
        if (!collections[collectionName].exists) {
            collections[collectionName] = Collection({
                name: collectionName,
                description: "",
                creator: msg.sender,
                collaborators: new address[](0),
                tokenIds: new uint256[](0),
                exists: true,
                createdAt: block.timestamp
            });
            collectionAccess[msg.sender][collectionName] = true;
            emit CollectionCreated(collectionName, msg.sender);
        } else {
            // Verify access to collection
            require(
                collections[collectionName].creator == msg.sender || collectionAccess[msg.sender][collectionName],
                "No permission to mint in this collection"
            );
        }

        // Add token to collection
        collections[collectionName].tokenIds.push(newTokenId);

        // Store metadata with validation
        nftMetadata[newTokenId] = NFTMetadata({
            name: name,
            description: description,
            metadataURI: metadataURI,
            category: category,
            royaltyPercentage: royaltyPercentage,
            creator: msg.sender,
            createdAt: block.timestamp,
            collection: collectionName,
            exists: true
        });

        // Mint the NFT
        _safeMint(msg.sender, newTokenId);
        
        tokenExists[newTokenId] = true;
        userNFTs[msg.sender].push(newTokenId);

        emit NFTMinted(newTokenId, msg.sender, metadataURI, royaltyPercentage);
        
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
    ) external tokenExistsModifier(tokenId) onlyTokenOwner(tokenId) whenNotPaused {
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
    function buyNFT(uint256 tokenId) external payable nonReentrant listingExists(tokenId) whenNotPaused {
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
    function placeBid(uint256 tokenId) external payable nonReentrant auctionActive(tokenId) whenNotPaused {
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
    function endAuction(uint256 tokenId) external nonReentrant listingExists(tokenId) whenNotPaused {
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
    function delistNFT(uint256 tokenId) external onlyTokenOwner(tokenId) listingExists(tokenId) whenNotPaused {
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
        require(nftMetadata[tokenId].exists, "Metadata does not exist");
        return nftMetadata[tokenId];
    }

    /**
     * @dev Update NFT metadata (creator only)
     * @param tokenId The NFT token ID
     * @param name New name
     * @param description New description
     * @param metadataURI New metadata URI
     */
    function updateNFTMetadata(
        uint256 tokenId,
        string memory name,
        string memory description,
        string memory metadataURI
    ) external tokenExistsModifier(tokenId) whenNotPaused {
        require(nftMetadata[tokenId].creator == msg.sender, "Only creator can update metadata");
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(description).length > 0, "Description cannot be empty");
        require(bytes(metadataURI).length > 0, "Metadata URI cannot be empty");
        require(!listings[tokenId].isActive, "Cannot update listed NFT");

        nftMetadata[tokenId].name = name;
        nftMetadata[tokenId].description = description;
        nftMetadata[tokenId].metadataURI = metadataURI;

        emit MetadataUpdated(tokenId, name, description, metadataURI);
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

    /**
     * @dev Update collection description (creator only)
     * @param collectionName The collection name
     * @param description New description
     */
    function updateCollectionDescription(
        string memory collectionName,
        string memory description
    ) external whenNotPaused {
        require(collections[collectionName].exists, "Collection does not exist");
        require(collections[collectionName].creator == msg.sender, "Only creator can update collection");
        require(bytes(description).length > 0, "Description cannot be empty");

        collections[collectionName].description = description;
        emit CollectionUpdated(collectionName, description);
    }

    /**
     * @dev Add collaborator to collection (creator only)
     * @param collectionName The collection name
     * @param collaborator The collaborator address
     */
    function addCollaborator(
        string memory collectionName,
        address collaborator
    ) external whenNotPaused {
        require(collections[collectionName].exists, "Collection does not exist");
        require(collections[collectionName].creator == msg.sender, "Only creator can add collaborators");
        require(collaborator != address(0), "Invalid collaborator address");
        require(!collectionAccess[collaborator][collectionName], "Already a collaborator");

        collections[collectionName].collaborators.push(collaborator);
        collectionAccess[collaborator][collectionName] = true;
        emit CollaboratorAdded(collectionName, collaborator);
    }

    /**
     * @dev Remove collaborator from collection (creator only)
     * @param collectionName The collection name
     * @param collaborator The collaborator address
     */
    function removeCollaborator(
        string memory collectionName,
        address collaborator
    ) external whenNotPaused {
        require(collections[collectionName].exists, "Collection does not exist");
        require(collections[collectionName].creator == msg.sender, "Only creator can remove collaborators");
        require(collectionAccess[collaborator][collectionName], "Not a collaborator");

        // Remove from collaborators array
        address[] storage collab = collections[collectionName].collaborators;
        for (uint256 i = 0; i < collab.length; i++) {
            if (collab[i] == collaborator) {
                collab[i] = collab[collab.length - 1];
                collab.pop();
                break;
            }
        }

        collectionAccess[collaborator][collectionName] = false;
        emit CollaboratorRemoved(collectionName, collaborator);
    }

    /**
     * @dev Get collection collaborators
     * @param collectionName The collection name
     * @return Array of collaborator addresses
     */
    function getCollaborators(string memory collectionName) external view returns (address[] memory) {
        require(collections[collectionName].exists, "Collection does not exist");
        return collections[collectionName].collaborators;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /* ==========================
       External NFT Support
       ========================== */
    function listExternalNFT(address nftContract, uint256 tokenId, uint256 price) external nonReentrant whenNotPaused {
        require(price > 0, "Price > 0");
        require(!externalListings[nftContract][tokenId].isActive, "Already listed");
        
        // Transfer NFT to marketplace
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        externalListings[nftContract][tokenId] = ExternalListing({
            seller: msg.sender,
            price: price,
            isActive: true
        });

        emit ExternalNFTListed(nftContract, tokenId, msg.sender, price);
    }

    function buyExternalNFT(address nftContract, uint256 tokenId) external payable nonReentrant whenNotPaused {
        ExternalListing storage listing = externalListings[nftContract][tokenId];
        require(listing.isActive, "Not listed");
        require(msg.value == listing.price, "Incorrect price");

        address seller = listing.seller;
        uint256 price = listing.price;

        // Calculate fee (only marketplace fee for external NFTs, no royalties tracked)
        uint256 feeAmount = (price * marketplaceFee) / BASIS_POINTS;
        uint256 sellerAmount = price - feeAmount;

        // Transfer NFT to buyer
        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);

        // Clear listing
        delete externalListings[nftContract][tokenId];

        // Payments
        payable(seller).transfer(sellerAmount);
        payable(owner()).transfer(feeAmount);

        emit ExternalNFTSold(nftContract, tokenId, seller, msg.sender, price);
    }

    function cancelExternalListing(address nftContract, uint256 tokenId) external nonReentrant whenNotPaused {
        ExternalListing storage listing = externalListings[nftContract][tokenId];
        require(listing.isActive, "Not listed");
        require(listing.seller == msg.sender, "Not seller");

        // Return NFT
        IERC721(nftContract).transferFrom(address(this), msg.sender, tokenId);

        delete externalListings[nftContract][tokenId];
        emit ExternalNFTDelisted(nftContract, tokenId, msg.sender);
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
    /**
     * @dev Returns the Uniform Resource Identifier (URI) for a token (ERC721Metadata compliant)
     * @param tokenId The NFT token ID
     * @return The metadata URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenExists[tokenId] && nftMetadata[tokenId].exists, "URI query for nonexistent token");
        return nftMetadata[tokenId].metadataURI;
    }
}
