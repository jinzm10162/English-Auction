//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @title On-chain English auction for ERC-721 tokens
/// @notice Sellers escrow an NFT, bidders compete with ascending bids until a deadline, and the
/// winner takes the token while the seller takes the proceeds.
/// @dev There is no `createAuction` entry point. An auction is opened through `onERC721Received`:
/// the seller calls `safeTransferFrom(seller, auction, tokenId, data)` on their NFT with `data` set
/// to `abi.encode(uint40 startTime, uint40 endTime, uint96 startPrice)`. Escrow and listing are
/// therefore a single atomic step, and the contract never needs an approval of its own.
///
/// Value leaves through `withdraw` rather than being pushed during settlement. Outbid amounts are
/// credited rather than refunded on the spot, and proceeds that cannot be delivered to the seller
/// are credited too, so neither a reverting bidder nor a reverting seller can block an auction.
interface IEnglishAuction is IERC721Receiver {
    /// @notice Lifecycle of a single auction.
    /// @dev `Ongoing` and `Ended` are derived from the block timestamp on every read rather than
    /// written; only the terminal states are stored. An auction sits in `Ended` from its deadline
    /// until someone calls `settle`, which moves it to `Sold` or `Unsold` for good.
    enum State {
        NotStarted,
        Ongoing,
        Ended,
        Sold,
        Unsold
    }

    /// @notice Emitted when an NFT is escrowed and its auction registered.
    /// @param seller The account that owned the NFT and will receive the proceeds.
    /// @param nftAddr The ERC-721 contract the token belongs to.
    /// @param tokenId The escrowed token.
    /// @param nftIndex The auction's index, used by every other entry point.
    /// @param startTime When bidding opens.
    /// @param endTime When bidding closes.
    /// @param startPrice The reserve price the first bid must meet.
    /// @param operator The account that initiated the transfer, which may differ from the seller.
    event AuctionCreated(
        address seller,
        address indexed nftAddr,
        uint indexed tokenId,
        uint indexed nftIndex,
        uint startTime,
        uint endTime,
        uint startPrice,
        address operator
    );

    /// @notice Emitted on every accepted bid.
    /// @param nftIndex The auction bid on.
    /// @param bidder The new highest bidder.
    /// @param price The new highest price.
    event Bid(uint indexed nftIndex, address indexed bidder, uint price);

    /// @notice Emitted when an auction settles with a winner.
    /// @param nftIndex The auction settled.
    /// @param bidder The winner, who now holds the NFT.
    /// @param price The winning price.
    event Sold(uint indexed nftIndex, address indexed bidder, uint price);

    /// @notice Emitted when an auction settles with no bids and the NFT returns to the seller.
    /// @param nftIndex The auction settled.
    event Unsold(uint indexed nftIndex);

    /// @notice Emitted when an account withdraws its credited balance.
    /// @param withdrawer The account paid.
    /// @param value The amount paid out.
    event Withdraw(address indexed withdrawer, uint value);

    /// @notice Thrown when a listing opens too soon, or ends before it starts.
    /// @dev Bidding must open at least a fixed buffer after the escrow transaction, so an auction
    /// cannot be created and won inside the same block.
    error InvalidTime();

    /// @notice Thrown when a listing sets a reserve price of zero.
    error InvalidPrice();

    /// @notice Thrown when the caller of `onERC721Received` has no code, or does not report ERC-721
    /// support through ERC-165.
    error InvalidNFT();

    /// @notice Thrown when an auction index has never been assigned.
    error InvalidNFTIndex();

    /// @notice Thrown when the transfer payload is not exactly the three encoded listing parameters.
    error InvalidData();

    /// @notice Thrown when bidding on or settling an auction that has not opened yet.
    error NotStarted();

    /// @notice Thrown when bidding after the deadline.
    error Ended();

    /// @notice Thrown when the seller bids on their own auction, when a bid misses the reserve, or
    /// when it fails to clear the required increment over the standing bid.
    error InvalidBid();

    /// @notice Thrown when withdrawing with nothing credited.
    error InvalidWithdrawal();

    /// @notice Thrown when settling before the deadline has passed.
    error NotOver();

    /// @notice Thrown when settling an auction that has already been settled.
    error Disposed();

    /// @notice Thrown when the outbound transfer in `withdraw` fails, which reverts the call and
    /// leaves the balance untouched.
    error WithdrawFailed();

    /// @notice The current state of an auction.
    /// @dev Returns the stored terminal state if one was written, otherwise derives the state from
    /// the listing's time window. Reverts on an unknown index.
    /// @param nftIndex The auction to inspect.
    /// @return The auction's state.
    function nftState(uint nftIndex) external returns (State);

    /// @notice Places a bid, paying the amount as `msg.value`.
    /// @dev The first bid must reach the reserve price; every later bid must clear the standing
    /// price by at least ten percent, which keeps an auction from being dragged out by one-wei
    /// increments. The seller may not bid. The amount standing before this bid is credited to its
    /// bidder for later withdrawal rather than returned inline, so a bidder that rejects incoming
    /// ETH cannot block the auction by being outbid.
    /// @param nftIndex The auction to bid on.
    function bid(uint nftIndex) external payable;

    /// @notice Closes an auction once its deadline has passed. Callable by anyone.
    /// @dev With no bids the NFT returns to the seller and the auction becomes `Unsold`. With a
    /// winner the NFT goes to the highest bidder and the auction becomes `Sold`. Payment to the
    /// seller is attempted inline and credited to their balance if it fails, so a seller contract
    /// without a payable fallback cannot strand the NFT in escrow.
    /// @param nftIndex The auction to settle.
    function settle(uint nftIndex) external;

    /// @notice Pays out the caller's credited balance.
    /// @dev Covers both outbid amounts and seller proceeds that could not be delivered during
    /// settlement. The balance is zeroed before the transfer.
    function withdraw() external;
}
