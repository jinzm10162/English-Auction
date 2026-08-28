//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract Seller is IERC721Receiver {
    address _operator;
    address _from;
    uint _tokenId;
    bytes _data;

    bool _switch;

    modifier Switch() {
        require(_switch);
        _;
    }

    function change(bool a) external {
        _switch = a;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4) {
        _operator = operator;
        _from = from;
        _tokenId = tokenId;
        _data = data;

        return this.onERC721Received.selector;
    }

    receive() external payable Switch {}
}