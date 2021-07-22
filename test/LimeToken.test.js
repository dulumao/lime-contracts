require("dotenv").config();

const truffleAssert = require("truffle-assertions");

const LimeToken = artifacts.require("LimeToken");
const TokenFarm = artifacts.require("TokenFarm");
const BEP20 = artifacts.require("MockBEP20");

const PancakeRouter = require("../abis/PancakeRouter.json");
const PancakeFactory = require("../abis/PancakeFactory.json");

const { OPERATOR_ADDRESS } = process.env;

const tokens = (amount) => {
  return web3.utils.toWei(amount);
};

const ADDRESSES = {
  pancakeRouter: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3",
  pancakeFactory: "0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc",
  BUSD: "0x78867bbeef44f2326bf8ddd1941a4439382ef2a7",
  USDT: "0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684",
  WBNB: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  ETH: "0x8babbb98678facc7342735486c851abd7a0d17ca",
};

contract("LimeToken", ([owner, whale, alice, bob, dev]) => {
  before(async () => {
    limeToken = await LimeToken.deployed();
    tokenFarm = await TokenFarm.deployed();
    busdToken = await BEP20.at(ADDRESSES.BUSD);
    usdtToken = await BEP20.at(ADDRESSES.USDT);
    wbnbToken = await BEP20.at(ADDRESSES.WBNB);
    pancakeRouter = new web3.eth.Contract(PancakeRouter, ADDRESSES.pancakeRouter);
    pancakeFactory = new web3.eth.Contract(PancakeFactory, ADDRESSES.pancakeFactory);

    console.log(web3.utils.fromWei(await web3.eth.getBalance(owner)));

    await pancakeRouter.methods
      .swapExactETHForTokens("0", [ADDRESSES.WBNB, ADDRESSES.USDT], owner, Date.now() + 1e12)
      .send({
        from: owner,
        value: tokens("0.1"),
      });

    await pancakeRouter.methods
      .swapExactETHForTokens("0", [ADDRESSES.WBNB, ADDRESSES.BUSD], owner, Date.now() + 1e12)
      .send({
        from: owner,
        value: tokens("0.1"),
      });

    await limeToken.approve(ADDRESSES.pancakeRouter, tokens("10000000"), { from: owner });
    await busdToken.approve(ADDRESSES.pancakeRouter, tokens("1000000"), { from: owner });
    await wbnbToken.approve(ADDRESSES.pancakeRouter, tokens("1000000"), { from: owner });
    await usdtToken.approve(ADDRESSES.pancakeRouter, tokens("1000000"), { from: owner });

    console.log((await busdToken.balanceOf(owner)).toString());
    console.log((await wbnbToken.balanceOf(owner)).toString());
    console.log((await usdtToken.balanceOf(owner)).toString());
    console.log((await limeToken.balanceOf(owner)).toString());

    console.log("Approvals succeeded");
  });

  it("allows the owner to provide liquidity", async () => {
    await pancakeRouter.methods
      .addLiquidity(
        limeToken.address,
        ADDRESSES.BUSD,
        tokens("1000"), // more than 5%
        tokens("20"),
        tokens("0"),
        tokens("0"),
        owner,
        Date.now() + 1e12
      )
      .send({ from: owner });
  });
});
