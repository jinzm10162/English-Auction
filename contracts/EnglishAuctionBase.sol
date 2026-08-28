//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./interface/IEnglishAuction.sol";


abstract contract EnglishAuctionBase is IEnglishAuction {
    struct Auction {
        uint tokenId;

        address seller;
        uint96 currentPrice;

        address nftAddr;
        uint40 startTime;
        uint40 endTime;
        
        address highestBidder;
    }

    struct Refund {
        address bidder;
        uint value;
    }

    Auction[] public auctions;
    mapping(uint nftIndex => Refund) internal refund;
    mapping(uint nftIndex => State) internal state;
    mapping(address => uint) public balance;
    
    modifier nftExists(uint nftIndex) {
        if(nftIndex >= auctions.length) revert InvalidNFTIndex();
        _;
    }
}