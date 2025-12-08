// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract TestERC721 is ERC721 {
    uint256 public nextId;

    constructor() ERC721("TestNFT", "TNFT") {}

    function mint(address to) external returns (uint256) {
        uint256 tokenId = ++nextId;
        _mint(to, tokenId);
        return tokenId;
    }
}
