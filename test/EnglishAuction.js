const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    loadFixture, 
    time,
    impersonateAccount,
    setBalance
} = require("@nomicfoundation/hardhat-network-helpers");

describe("EnglishAuction合约测试", ()=>{
    let owner, owner2, owner3;
    let englishAuction, nft, callAuction, seller, impersonateSigner;

    before(async()=>{
        [
            owner, owner2, owner3
        ] = await ethers.getSigners();
    });

    async function Deploy() {
        const EnglishAuction = await ethers.getContractFactory("EnglishAuction");
        const NFT = await ethers.getContractFactory("NFT");
        const CallAuction = await ethers.getContractFactory("CallAuction");
        const Seller = await ethers.getContractFactory("Seller");
        const englishAuction = await EnglishAuction.deploy();
        const nft = await NFT.deploy();
        const callAuction = await CallAuction.deploy();
        const seller = await Seller.deploy();

        const address = await seller.getAddress();
        const depositValue = ethers.parseEther("1");
    
        await impersonateAccount(address);
        const impersonateSigner = await ethers.getSigner(address);
        await setBalance(address, depositValue);
        return { englishAuction, nft, callAuction, seller, impersonateSigner};
    }

    beforeEach(async()=>{
        ({ englishAuction, nft, callAuction, seller, impersonateSigner } = await loadFixture(Deploy));
    });

    async function getEvmTime() {
        const blockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        return BigInt(block.timestamp);
    }

    function getEncodeData(startTime, endTime, price = 100n) {
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const encodeData = abiCoder.encode(
            ["uint40", "uint40", "uint96"],
            [startTime, endTime, price]
        );
        return encodeData;
    }
    
    async function CreatAuction(isWait, from, encodeData, to, tokenId = 0n) {
        await nft.mint(from);
        const tx = await nft[
            "safeTransferFrom(address,address,uint256,bytes)"
        ](from, to, tokenId, encodeData);
        
        if(isWait) await tx.wait(); 

        return tx;
    }

    describe("#onERC721Received", ()=>{
        it("fail: 非NFT合约调用", async()=>{
            const auctionAddress = await englishAuction.getAddress();
            const creatAuction = callAuction
            .call(auctionAddress, owner.address, owner.address, 2, "0x");
            
            await expect(creatAuction).to.be.
            revertedWithCustomError(
                englishAuction, "InvalidNFT"
            );
        });

        it("fail: EOA账户调用", async()=>{
            const creatAuction = englishAuction
            .onERC721Received(owner.address, owner.address, 2, "0x");
            
            await expect(creatAuction).to.be.
            revertedWithCustomError(
                englishAuction, "InvalidNFT"
            );
        });

        it("fail: data.length !=96", async()=>{
            const address = await englishAuction.getAddress();
            await expect(
                CreatAuction(false, owner.address, "0x1234", address)
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidData" 
            );
        });

        it("fail: startTime<block.timestamp+bufferTime", async()=>{
            const time = await getEvmTime();
            const startTime = time - 10n;
            const endTime = time + 100n;
            const data = getEncodeData(startTime, endTime);
            const address = await englishAuction.getAddress();
            await expect(
                CreatAuction(false, owner.address, data, address)
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidTime"
            );
        });
        
        it("fail: startTime>=endTime", async()=>{
            const bufferTime = BigInt(10*60);
            const startTime = await getEvmTime() + 20n + bufferTime;
            const endTime = await getEvmTime() + 10n;
            const data = getEncodeData(startTime, endTime);
            const address = await englishAuction.getAddress();
            await expect(
                CreatAuction(false, owner.address, data, address)
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidTime"
            );
        });

        it("fail: price=0", async()=>{
            const bufferTime = BigInt(10*60);
            const startTime = await getEvmTime() + 10n + bufferTime;
            const endTime = await getEvmTime() + 100n + bufferTime;
            const data = getEncodeData(startTime, endTime, 0n);
            const address = await englishAuction.getAddress();
            await expect(
                CreatAuction(false, owner, data, address)
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidPrice"
            );
        });

        it("success: NFT合约合法数据转移NFT", async()=>{
            const bufferTime = BigInt(10*60);
            const startTime = await getEvmTime() + 10n + bufferTime;
            const endTime = await getEvmTime() + 100n + bufferTime;
            const data = getEncodeData(startTime, endTime);
            const address = await englishAuction.getAddress();
            const nftAddress = await nft.getAddress();
            
            await expect(
                CreatAuction(false, owner.address, data, address)
            ).to.emit(
                englishAuction, "AuctionCreated"
            ).withArgs(
                owner.address,
                nftAddress,
                0,
                0,
                startTime,
                endTime,
                100n,
                owner.address
            );

            expect(await englishAuction.auctions(0n)).to.be.deep.equal([
                0n,
                owner.address,
                100n,
                nftAddress,
                startTime,
                endTime,
                ethers.ZeroAddress
            ]);
        });
    });

    describe("#nftExists", ()=>{
        const nftExistsFunc = [
            {funcName: "bid", getArgs: ()=>[5]},
            {funcName: "settle", getArgs: ()=>[6]},
            {funcName: "nftState", getArgs: ()=>[7]}
        ];

        nftExistsFunc.forEach(({funcName, getArgs})=>{
           it(`fail: ${funcName}不存在NFT序号`, async()=>{
                await expect(
                    englishAuction[funcName](...getArgs())
                ).to.be.revertedWithCustomError(
                    englishAuction, "InvalidNFTIndex"
                );
            })
        });
    });

    async function NotStarted() {
        const bufferTime = BigInt(10*60);
        const startTime = await getEvmTime() + 100n + bufferTime;
        const endTime = await getEvmTime() + 1000n + bufferTime;
        const data = getEncodeData(startTime, endTime);
        const address = await englishAuction.getAddress();

        await CreatAuction(true, owner.address, data, address);
    }

    async function Ongoing() {
        const bufferTime = BigInt(10*60);
        const startTime = await getEvmTime() + 100n + bufferTime;
        const endTime = await getEvmTime() + 1000n + bufferTime;
        const data = getEncodeData(startTime, endTime);
        const address = await englishAuction.getAddress();

        await CreatAuction(true, owner.address, data, address);
        await time.increase(800n);
    }

    async function Ended() {
        const bufferTime = BigInt(10*60);
        const startTime = await getEvmTime() + 100n + bufferTime;
        const endTime = await getEvmTime() + 1000n + bufferTime;
        const data = getEncodeData(startTime, endTime);
        const address = await englishAuction.getAddress();

        await CreatAuction(true, owner.address, data, address);
        await time.increase(1700n);
    }

    async function Sold() {
        await Ongoing();
        await englishAuction.connect(owner2).bid(0n, {value: 100n});
        await time.increase(1700n);
        await englishAuction.settle(0n);
    }

    async function Unsold() {
        await Ended();
        await englishAuction.settle(0n);
    }

    describe("nftState", async()=>{
        it("success: startTime>block.timestamp",async()=>{
            await NotStarted();

            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(0n);
        });

        it("success: startTime<=block.timestamp<endTime", async()=>{
            await Ongoing();

            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(1n);
        });

        it("success: block.timestamp>=endTime,且没有结算", async()=>{
            await Ended();
            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(2n);
        });

        it("success: NFT成交之后",async()=>{
            await Sold();
            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(3n);
        });

        it("success: NFT流拍之后",async()=>{
            await Unsold();
            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(4n);
        });
    });

    describe("#bid", ()=>{
        it("fail: 状态是NotStarted", async()=>{
            await NotStarted();

            await expect(
                englishAuction.connect(owner2).bid(0n, {value: 200n})
            ).to.be.revertedWithCustomError(
                englishAuction, "NotStarted"
            );
        });

        it("fail: 状态是Ended", async()=>{
            await Ended();

            await expect(
                englishAuction.connect(owner2).bid(0n, {value: 200n})
            ).to.be.revertedWithCustomError(
                englishAuction, "Ended"
            );
        })

        it("fail: 状态是Sold", async()=>{
            await Sold();

            await expect(
                englishAuction.connect(owner2).bid(0n, {value: 200n})
            ).to.be.revertedWithCustomError(
                englishAuction, "Ended"
            );
        });

        it("fail: 状态是Unsold", async()=>{
            await Unsold();

            await expect(
                englishAuction.connect(owner2).bid(0n, {value: 200n})
            ).to.be.revertedWithCustomError(
                englishAuction, "Ended"
            );
        });

        it("fail: seller竞价", async()=>{
            await Ongoing();

            await expect(
                englishAuction.bid(0n, {value: 800n})
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidBid"
            );
        });

        it("fail: msg.value<startPrice", async()=>{
            await Ongoing();

            await expect(
                englishAuction.connect(owner2).bid(0n, {value: 80n})
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidBid"
            );
        });

        it("fail: 首次出价之后的出价<currentPrice + startPrice*10%", async()=>{
            await Ongoing();

            await englishAuction.connect(owner2).bid(0n, {value: 100n});
            await expect(
                englishAuction.connect(owner3).bid(0n, {value: 101n})
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidBid"
            );
        });

        it("success: 合法首次出价", async()=>{
            await Ongoing();

            await expect(
                englishAuction.connect(owner2).bid(0n, {value: 100n})
            ).to.emit(englishAuction, "Bid").withArgs(0n, owner2.address, 100n);

            const auction = await englishAuction.auctions(0n);
            expect(auction.currentPrice).to.equal(100n);
            expect(auction.highestBidder).to.equal(owner2.address);
        });

        it("success: 合法首次出价之后的出价", async()=>{
            await Ongoing();
            await englishAuction.connect(owner2).bid(0n, {value: 100n});
            await expect(
                englishAuction.connect(owner2).bid(0n, {value: 110n})
            ).to.emit(englishAuction, "Bid").withArgs(0n, owner2.address, 110n);

            const auction = await englishAuction.auctions(0n);
            expect(auction.currentPrice).to.equal(110n);
            expect(auction.highestBidder).to.equal(owner2.address);

            expect(await englishAuction.balance(owner2.address)).to.equal(100n);
        });
    });

    describe("#settle", ()=>{
        it("fail: 状态是NotStarted", async()=>{
            await NotStarted();

            await expect(
                englishAuction.settle(0n)
            ).to.be.revertedWithCustomError(
                englishAuction, "NotStarted"
            );
        });

        it("fail: 状态是Ongoing", async()=>{
            await Ongoing();

            await expect(
                englishAuction.settle(0n)
            ).to.be.revertedWithCustomError(
                englishAuction, "NotOver"
            );
        });

        it("fail: 状态是Sold", async()=>{
            await Sold();

            await expect(
                englishAuction.settle(0n)
            ).to.be.revertedWithCustomError(
                englishAuction, "Disposed"
            );
        });

        it("fail: 状态是Unsolde", async()=>{
            await Unsold();

            await expect(
                englishAuction.settle(0n)
            ).to.be.revertedWithCustomError(
                englishAuction, "Disposed"
            );
        });

        it("success: 合法状态成交且给seller转账成功", async()=>{
            await Ongoing();
            await englishAuction.connect(owner2).bid(0n, {value: 100n});
            await time.increase(1700n);

            const address = await englishAuction.getAddress();
            
            const tx = englishAuction.settle(0n);
            await expect(tx).to.emit(englishAuction, "Sold")
            .withArgs(0n, owner2.address, 100n).and.to.emit(
                nft, "Transfer"
            ).withArgs(address, owner2.address, 0n)
           
            await expect(tx).to.changeEtherBalances(
                [owner, englishAuction],
                [100n, -100n]
            );

            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(3n);


            expect(
                await nft.ownerOf(0n)
            ).to.equal(owner2.address);
        });

        it("success: 合法状态成交且给seller转账失败", async()=>{
            const bufferTime = BigInt(10*60);
            const startTime = await getEvmTime() + 100n + bufferTime;
            const endTime = await getEvmTime() + 1000n + bufferTime;
            const data = getEncodeData(startTime, endTime);
            const auctionAddress = await englishAuction.getAddress();
            const sellerAddress = await seller.getAddress();

            await nft.mint(sellerAddress);
            const tx1 = await nft.connect(impersonateSigner)[
                "safeTransferFrom(address,address,uint256,bytes)"
            ](sellerAddress, auctionAddress, 0n, data);
            await tx1.wait(); 

            await time.increase(800n);

            await englishAuction.connect(owner2).bid(0n, {value: 100n});
            await time.increase(900n);
            
            const tx2 = englishAuction.settle(0n);
            await expect(tx2).to.emit(englishAuction, "Sold")
            .withArgs(0n, owner2.address, 100n).and.to.emit(
                nft, "Transfer"
            ).withArgs(auctionAddress, owner2.address, 0n);

            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(3n);

            expect(
                await englishAuction.balance(sellerAddress)
            ).to.equal(100n);

            expect(
                await nft.ownerOf(0n)
            ).to.equal(owner2.address);
        });

        it("success: 合法状态流拍", async()=>{
            await Ended();
            const address = await englishAuction.getAddress();

            await expect(
                englishAuction.settle(0n)
            ).to.emit(englishAuction, "Unsold")
            .withArgs(0n).and.to.emit(
                nft, "Transfer"
            ).withArgs(address, owner.address, 0n);

            expect(
                await englishAuction.nftState.staticCall(0n)
            ).to.equal(4n);

            expect(
                await nft.ownerOf(0n)
            ).to.equal(owner.address);
        });
    });

    describe("#withdraw", ()=>{
        it("fall: 余额为零", async()=>{
            await expect(
                englishAuction.connect(owner2).withdraw()
            ).to.be.revertedWithCustomError(
                englishAuction, "InvalidWithdrawal"
            );
        });

        it("fail: seller提取结算转账失败的资金提取失败", async()=>{
            const bufferTime = BigInt(10*60);
            const startTime = await getEvmTime() + 100n + bufferTime;
            const endTime = await getEvmTime() + 1000n + bufferTime;
            const data = getEncodeData(startTime, endTime);
            const auctionAddress = await englishAuction.getAddress();
            const sellerAddress = await seller.getAddress();

            await nft.mint(sellerAddress);
            const tx1 = await nft.connect(impersonateSigner)[
                "safeTransferFrom(address,address,uint256,bytes)"
            ](sellerAddress, auctionAddress, 0n, data);
            await tx1.wait(); 

            await time.increase(800n);

            await englishAuction.connect(owner2).bid(0n, {value: 100n});
            await time.increase(900n);
            
            await englishAuction.settle(0n);

            await expect(
                englishAuction.connect(impersonateSigner).withdraw()
            ).to.be.revertedWithCustomError(
                englishAuction, "WithdrawFailed"
            );
        });

        it("success: bidder提取所有结算后nft的资金", async()=>{
            await Ongoing();
            await englishAuction.connect(owner2).bid(0n, {value: 100n});
            await englishAuction.connect(owner2).bid(0n, {value: 110n});
            await time.increase(1700n);
            await englishAuction.settle(0n);

            const tx = englishAuction.connect(owner2).withdraw();

            await expect(tx).to.emit(englishAuction, "Withdraw")
            .withArgs(owner2.address, 100n);

            await expect(tx).to.changeEtherBalances(
                [owner2, englishAuction],
                [100n, -100n]
            );
        });

        it("success: seller提取结算转账失败的资金", async()=>{
            const bufferTime = BigInt(10*60);
            const startTime = await getEvmTime() + 100n + bufferTime;
            const endTime = await getEvmTime() + 1000n + bufferTime;
            const data = getEncodeData(startTime, endTime);
            const auctionAddress = await englishAuction.getAddress();
            const sellerAddress = await seller.getAddress();

            await nft.mint(sellerAddress);
            const tx1 = await nft.connect(impersonateSigner)[
                "safeTransferFrom(address,address,uint256,bytes)"
            ](sellerAddress, auctionAddress, 0n, data);
            await tx1.wait(); 

            await time.increase(800n);

            await englishAuction.connect(owner2).bid(0n, {value: 100n});
            await time.increase(900n);
            
            await englishAuction.settle(0n);

            await seller.change(true);

            const tx = englishAuction.connect(impersonateSigner).withdraw();

            await expect(tx).to.emit(englishAuction, "Withdraw")
            .withArgs(sellerAddress, 100n);

            await expect(tx).to.changeEtherBalances(
                [seller, englishAuction],
                [100n, -100n]
            );
        });
    });
});