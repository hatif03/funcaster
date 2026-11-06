// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {RevenueRouter} from "../RevenueRouter.sol";
import {MockEIP3009USDC} from "./mocks/MockEIP3009USDC.sol";

/// @notice Compact independent acceptance of the Studio-generated contract.
/// All vm keys and minted tokens are disposable local test fixtures.
contract CommerceBasicTest is Test {
    RevenueRouter router;
    MockEIP3009USDC token;
    address creator;
    address platform;
    address venue;
    address referral;
    address payer;
    uint256 constant PAYER_KEY = 16;
    bytes32 constant ROOM = keccak256("ROOM01");
    function setUp() public {
        vm.warp(1_000_000);
        creator=vm.addr(12); platform=vm.addr(13); venue=vm.addr(14); referral=vm.addr(15); payer=vm.addr(PAYER_KEY);
        token=new MockEIP3009USDC(); router=new RevenueRouter(address(token),platform,address(this)); token.mint(payer,10000e6);
    }
    function reg(bytes32 version,uint256 price) internal {
        router.registerVersion(version,creator,price,venue,referral,1000,10000,new RevenueRouter.Collaborator[](0));
    }
    function pay(bytes32 version,uint256 serial,bool slots) internal {
        RevenueRouter.PayRequest memory r=RevenueRouter.PayRequest(bytes32(serial),version,payer,ROOM,false,slots,slots,block.timestamp-1,block.timestamp+300);
        (uint8 pv,bytes32 pr,bytes32 ps)=vm.sign(PAYER_KEY,router.hashPassPermit(r));
        bytes32 body=keccak256(abi.encode(token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),payer,address(router),router.getVersion(version).price,r.validAfter,r.validBefore,r.paymentId));
        bytes32 digest=keccak256(abi.encodePacked("\x19\x01",token.DOMAIN_SEPARATOR(),body));
        (uint8 av,bytes32 ar,bytes32 ass)=vm.sign(PAYER_KEY,digest);
        router.pay(r,abi.encodePacked(pr,ps,pv),av,ar,ass);
    }
    function claim(uint256 key) internal {
        address recipient=vm.addr(key);uint256 deadline=block.timestamp+300;
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,router.hashClaimPermit(recipient,router.claimNonces(recipient),deadline));
        router.claim(recipient,deadline,abi.encodePacked(r,s,v));
    }
    function retryPay(bytes32 version,uint256 serial) external { pay(version,serial,false); }
    function blockedClaim() external { claim(12); }
    function test_FreeBandGrossSlotsAndConservation() public {
        reg(bytes32(uint256(1)),1e6);pay(bytes32(uint256(1)),1,true);
        assertEq(router.credit(creator),800000);assertEq(router.credit(platform),0);assertEq(router.credit(venue),100000);assertEq(router.credit(referral),100000);
        assertEq(router.totalCredited(),token.balanceOf(address(router)));assertTrue(router.hasActivePass(bytes32(uint256(1)),ROOM,payer));
    }
    function test_PerCreatorCrossVersionThresholdAnd70101010() public {
        reg(bytes32(uint256(1)),100e6);for(uint256 n=1;n<=10;n++)pay(bytes32(uint256(1)),n,false);
        reg(bytes32(uint256(2)),1e6);uint256 prior=router.credit(creator);pay(bytes32(uint256(2)),11,true);
        assertEq(router.credit(creator)-prior,700000);assertEq(router.credit(platform),100000);assertEq(router.credit(venue),100000);assertEq(router.credit(referral),100000);
        assertEq(router.lifetimeGross(creator),1001e6);assertEq(router.totalCredited(),token.balanceOf(address(router)));
    }
    function test_PartialThresholdAndPaymentReplay() public {
        reg(bytes32(uint256(1)),100e6);for(uint256 n=1;n<=9;n++)pay(bytes32(uint256(1)),n,false);
        reg(bytes32(uint256(2)),99500000);pay(bytes32(uint256(2)),10,false);
        reg(bytes32(uint256(3)),1e6);pay(bytes32(uint256(3)),11,false);assertEq(router.credit(platform),50000);
        vm.expectRevert(RevenueRouter.PaymentAlreadyProcessed.selector);this.retryPay(bytes32(uint256(3)),11);
    }
    function test_BlockedRecipientNeverBlocksIndependentClaim() public {
        reg(bytes32(uint256(1)),1e6);pay(bytes32(uint256(1)),1,true);token.blocklist(creator);
        vm.expectRevert();this.blockedClaim();assertEq(router.credit(creator),800000);assertEq(router.claimNonces(creator),0);
        claim(14);assertEq(token.balanceOf(venue),100000);assertEq(router.credit(venue),0);assertEq(router.claimNonces(venue),1);assertEq(router.credit(creator),800000);
    }
}
