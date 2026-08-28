//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../EnglishAuction.sol";
import "./NFT.sol";
contract CallAuction {
    constructor() payable{}

    function call(
        address target,
        address operator,
        address from,
        uint tokenId,
        bytes calldata data
    ) external {
        IERC721Receiver(target).onERC721Received(
            operator,
            from,
            tokenId,
            data
        );
    }
}