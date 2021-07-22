require("dotenv").config({
  path: "../.env",
});

const Web3 = require("web3");
const web3 = new Web3();
// Deploying the two contracts in the same migration
// To transfer the supply and ownership
const LimeToken = artifacts.require("LimeToken");
const TokenFarm = artifacts.require("TokenFarm");
const MockBEP20 = artifacts.require("MockBEP20");

tokens = (amount) => {
  return web3.utils.toWei(amount);
};

module.exports = async (deployer, network) => {
  await deployer.deploy(LimeToken);
  const limeToken = await LimeToken.deployed();

  await deployer.deploy(TokenFarm, process.env.DEV_ADDRESS, limeToken.address);

  const tokenFarm = await TokenFarm.deployed();

  if (network == "development") {
    await deployer.deploy(MockBEP20);
  }

  if (network == "testnet") {
  }

  // Router
  await limeToken.setExcludedFromAntiWhale("0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3", true);
  // Factory
  await limeToken.setExcludedFromAntiWhale("0xb7926c0430afb07aa7defde6da862ae0bde767bc", true);
  await limeToken.setExcludedFromAntiWhale(process.env.OPERATOR_ADDRESS, true);
  await limeToken.transferOwnership(tokenFarm.address);
};
