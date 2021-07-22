require("dotenv").config({ path: "../.env" });
const tokens = (amount) => {
  return web3.utils.toWei(amount);
};
const PancakeRouter = require("../abis/PancakeRouter.json");
const PancakeFactory = require("../abis/PancakeFactory.json");
const TokenFarm = artifacts.require("TokenFarm");
const LimeToken = artifacts.require("LimeToken");
const BEP20 = artifacts.require("MockBEP20");
const BN = require("bn.js");

const { OPERATOR_ADDRESS } = process.env;
const ADDRESSES = {
  pancakeRouter: "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3",
  pancakeFactory: "0xb7926c0430afb07aa7defde6da862ae0bde767bc",
  BUSD: "0x78867bbeef44f2326bf8ddd1941a4439382ef2a7",
  USDT: "0x7ef95a0fee0dd31b22626fa2e10ee6a223f8a684",
  WBNB: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  ETH: "0x8babbb98678facc7342735486c851abd7a0d17ca",
};

module.exports = async (cb) => {
  // perform actions
  const tokenFarm = await TokenFarm.deployed();
  const limeToken = await LimeToken.deployed();
  const busdToken = await BEP20.at(ADDRESSES.BUSD);
  const usdtToken = await BEP20.at(ADDRESSES.USDT);
  const wbnbToken = await BEP20.at(ADDRESSES.WBNB);
  const pancakeRouter = new web3.eth.Contract(PancakeRouter, ADDRESSES.pancakeRouter);
  const pancakeFactory = new web3.eth.Contract(PancakeFactory, ADDRESSES.pancakeFactory);

  // await pancakeRouter.methods
  //   .swapExactETHForTokens(0, [ADDRESSES.WBNB, ADDRESSES.USDT], OPERATOR_ADDRESS, Date.now() + 1e12)
  //   .send({
  //     from: OPERATOR_ADDRESS,
  //     value: tokens("0.1"),
  //   });

  // await pancakeRouter.methods
  //   .swapExactETHForTokens(
  //     "0",
  //     [ADDRESSES.WBNB, ADDRESSES.BUSD],
  //     OPERATOR_ADDRESS,
  //     Date.now() + 1e12
  //   )
  //   .send({
  //     from: OPERATOR_ADDRESS,
  //     value: tokens("0.1"),
  //   });

  await limeToken.approve(ADDRESSES.pancakeRouter, tokens("10000000"));
  await busdToken.approve(ADDRESSES.pancakeRouter, tokens("1000000"), { from: OPERATOR_ADDRESS });
  await wbnbToken.approve(ADDRESSES.pancakeRouter, tokens("1000000"), { from: OPERATOR_ADDRESS });
  await usdtToken.approve(ADDRESSES.pancakeRouter, tokens("1000000"), { from: OPERATOR_ADDRESS });

  console.log((await busdToken.balanceOf(OPERATOR_ADDRESS)).toString());
  console.log((await wbnbToken.balanceOf(OPERATOR_ADDRESS)).toString());
  console.log((await usdtToken.balanceOf(OPERATOR_ADDRESS)).toString());
  console.log((await limeToken.balanceOf(OPERATOR_ADDRESS)).toString());

  console.log("Approvals succeeded");

  console.log("*** ANTI WHALE ***");
  console.log((await limeToken.isExcludedFromAntiWhale(ADDRESSES.pancakeRouter)).toString());
  console.log((await limeToken.isExcludedFromAntiWhale(ADDRESSES.pancakeFactory)).toString());

  await pancakeRouter.methods
    .addLiquidity(
      limeToken.address,
      ADDRESSES.BUSD,
      tokens("1000"),
      tokens("20"),
      tokens("0"),
      tokens("0"),
      OPERATOR_ADDRESS,
      Date.now() + 1e12
    )
    .send({ from: OPERATOR_ADDRESS });

  console.log("First liquidity added");
  await pancakeRouter.methods
    .addLiquidity(
      limeToken.address,
      ADDRESSES.USDT,
      tokens("1000"),
      tokens("20"),
      "0",
      "0",
      OPERATOR_ADDRESS,
      Date.now() + 1e12
    )
    .send({ from: OPERATOR_ADDRESS });
  console.log("Second liquidity added");

  await pancakeRouter.methods
    .addLiquidityETH(limeToken.address, tokens("2000"), "0", "0", OPERATOR_ADDRESS, 1e12)
    .send({ from: OPERATOR_ADDRESS, value: tokens("0.1") });

  console.log("Liquidity succeedd");
  const busdPair = await pancakeFactory.methods.getPair(limeToken.address, ADDRESSES.BUSD).call();
  const usdtPair = await pancakeFactory.methods.getPair(limeToken.address, ADDRESSES.USDT).call();
  const bnbPair = await pancakeFactory.methods.getPair(limeToken.address, ADDRESSES.WBNB).call();

  console.log(busdPair);
  console.log(usdtPair);
  console.log(bnbPair);

  // BUSD/LIME LP
  await tokenFarm.createPool(busdPair, tokens("10"), false);

  // BNB/LIME LP
  await tokenFarm.createPool(bnbPair, tokens("7.5"), true);

  // USDT/LIME LP
  await tokenFarm.createPool(usdtPair, tokens("5.5"), false);

  // BUSD
  await tokenFarm.createPool(ADDRESSES.BUSD, tokens("9.75"), false);

  cb();
};
