//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./EnglishAuctionBase.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";


contract EnglishAuction is EnglishAuctionBase{
    bytes4 constant public IERC721_ID = 0x80ac58cd;
    uint constant public BUFFER_TIME = 10 minutes;
    
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4) {
        if(msg.sender.code.length == 0) revert InvalidNFT();
        try IERC165(msg.sender).supportsInterface(IERC721_ID) returns (bool res) {
            if(!res) revert InvalidNFT();
            _createAuction(from, msg.sender, tokenId, data, operator);
        } catch {
            revert InvalidNFT();
        }

        return this.onERC721Received.selector;
    }

    function bid(uint nftIndex) 
        external 
        payable 
        nftExists(nftIndex)
    {   
        State currentState = nftState(nftIndex);
        if(currentState == State.NotStarted) revert NotStarted();
        if(currentState != State.Ongoing) revert Ended();

        Auction storage auction = auctions[nftIndex];
        if(auction.seller == msg.sender) revert InvalidBid();
        if(msg.value < auction.currentPrice) revert InvalidBid();
        
        if(auction.highestBidder == address(0)) {
            auction.currentPrice = uint96(msg.value);
            auction.highestBidder = msg.sender;
            refund[nftIndex] = Refund(msg.sender, msg.value);

            emit Bid(nftIndex, msg.sender, msg.value);
            return;
        }

        uint minValue = auction.currentPrice/10 + auction.currentPrice;
        if(auction.currentPrice == 0) minValue = 1;
        if(msg.value < minValue) revert InvalidBid();

        auction.currentPrice =uint96(msg.value);
        auction.highestBidder = msg.sender;

        balance[refund[nftIndex].bidder] += refund[nftIndex].value;
        refund[nftIndex] = Refund(msg.sender, msg.value);

        emit Bid(nftIndex, msg.sender, msg.value);
    }

    function settle(uint nftIndex) 
        external
        nftExists(nftIndex)
    {
        State currentState = nftState(nftIndex);
        if(currentState == State.NotStarted) revert NotStarted();
        if(currentState == State.Ongoing) revert NotOver();
        if(currentState != State.Ended) revert Disposed();
        
        Auction memory auction = auctions[nftIndex];
        if(auction.highestBidder == address(0)){
            state[nftIndex] = State.Unsold;
            IERC721(auction.nftAddr).safeTransferFrom(
                address(this), auction.seller, auction.tokenId
            );
            
            emit Unsold(nftIndex);
            return;
        }

        state[nftIndex] = State.Sold;
        IERC721(auction.nftAddr).safeTransferFrom(
            address(this), auction.highestBidder, auction.tokenId
        );

        (bool success,) = auction.seller.call{value: auction.currentPrice}("");
        if(!success) balance[auction.seller] += auction.currentPrice;

        emit Sold(nftIndex, auction.highestBidder, auction.currentPrice);
    }


    function withdraw() external {
        if(balance[msg.sender] == 0) revert InvalidWithdrawal();
        uint _balance = balance[msg.sender];
        balance[msg.sender] = 0;

        (bool success,) = msg.sender.call{value: _balance}("");
        if(!success) revert WithdrawFailed();

        emit Withdraw(msg.sender, _balance);
    }

    function nftState(uint nftIndex) 
        public
        view
        nftExists(nftIndex)
        returns(State)
    {
        State currentState = state[nftIndex]; 

        if(currentState == State.Sold || currentState == State.Unsold) {
            return currentState;
        }
        
        Auction memory auction = auctions[nftIndex];
        uint startTime = auction.startTime;
        uint endTime = auction.endTime;
      
        if(block.timestamp >= startTime && block.timestamp < endTime) {
            currentState = State.Ongoing;
            return currentState;
        }
        
        if(block.timestamp >= endTime) {
            currentState = State.Ended;
            return currentState;
        }

        return currentState;
    }

    function _createAuction(
       address seller,
       address nftAddr,
       uint tokenId,
       bytes calldata data,
       address operator
    ) internal {
        if(data.length != 96) revert InvalidData();

        (uint40 startTime, uint40 endTime, uint96 startPrice) = abi.decode(
            data, 
            (uint40, uint40, uint96)
        );

        if(startTime <= block.timestamp + BUFFER_TIME) revert InvalidTime();
        if(endTime <= startTime) revert InvalidTime();
        if(startPrice == 0) revert InvalidPrice();

        auctions.push(Auction(
            tokenId,
            seller, 
            startPrice,
            nftAddr,
            startTime,
            endTime,
            address(0)
        ));
        emit AuctionCreated(
            seller,
            nftAddr,
            tokenId, 
            auctions.length -1,
            startTime, 
            endTime, 
            startPrice,
            operator
        );
    }
}