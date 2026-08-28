//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFT is ERC721 {
    uint private nextId;

    event Mint(address to, uint tokenId);

    constructor() ERC721("MyNFT", "MNFT") {}

    function mint(address to) external {
        uint tokenId = nextId ++;
       
        _safeMint(to, tokenId);
        emit Mint(to, tokenId);
    }
}