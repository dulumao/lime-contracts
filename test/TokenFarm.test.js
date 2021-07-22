require("dotenv").config();
const BN = require("bn.js");

const {
  takeSnapshot,
  revertToSnapShot,
  tokens,
  advanceTimeAndBlock,
  advanceUntilHarvesting,
  tokensBN,
  advanceTime,
  advanceBlocks,
} = require("./utils");

const truffleAssert = require("truffle-assertions");

const LimeToken = artifacts.require("LimeToken");
const TokenFarm = artifacts.require("TokenFarm");
const MockBEP20 = artifacts.require("MockBEP20");

const DAY_SECONDS = 86400;

contract("TokenFarm", async ([deployer, investor, otherInvestor]) => {
  beforeEach(async () => {
    snapshot = await takeSnapshot();
    snapshotId = snapshot.result;
  });

  before(async () => {
    limeToken = await LimeToken.deployed();
    tokenFarm = await TokenFarm.deployed();
    token1 = await MockBEP20.new();
    token2 = await MockBEP20.new();
    token3 = await MockBEP20.new();
  });

  afterEach(async () => {
    await revertToSnapShot(snapshotId);
  });

  it("Indicates the harvesting period correctly", async () => {
    let periodCount = 0;

    for (let i = 0; i < 28; i++) {
      const isHarvestingPeriod = await tokenFarm.isHarvestingPeriod();

      if (isHarvestingPeriod) {
        periodCount++;
      }

      await advanceTimeAndBlock(DAY_SECONDS); // advance one day
    }

    // There should be 2 harvesting periods in 28 days
    assert.equal(periodCount, 2);
  });

  it("Denies access to non-owners", async () => {
    await truffleAssert.reverts(
      tokenFarm.createPool(token1.address, tokens("1"), false, {
        from: investor,
      }),
      "Ownable: caller is not the owner"
    );
  });

  it("Creates pools correctly", async () => {
    const totalPoolsBefore = await tokenFarm.totalPools();
    assert.equal(totalPoolsBefore, 0);

    await tokenFarm.createPool(token1.address, tokens("1"), false);
    await tokenFarm.createPool(token2.address, tokens("1"), false);
    await tokenFarm.createPool(token3.address, tokens("1"), false);

    const totalPoolsAfter = await tokenFarm.totalPools();
    assert.equal(totalPoolsAfter.toNumber(), 3);
  });

  it("Deposits the tokens correctly", async () => {
    // First give the investor some money
    await token1.transfer(investor, tokens("100"));
    await token2.transfer(investor, tokens("1000"));
    await token2.transfer(otherInvestor, tokens("1000"));

    const investorBalanceStart1 = await token1.balanceOf(investor);
    const investorBalanceStart2 = await token2.balanceOf(investor);
    const otherInvestorBalance = await token2.balanceOf(otherInvestor);

    // Make sure they recieved it
    assert.equal(investorBalanceStart1, tokens("100"));
    assert.equal(investorBalanceStart2, tokens("1000"));
    assert.equal(otherInvestorBalance, tokens("1000"));

    // Create the pools
    await tokenFarm.createPool(token1.address, tokens("1"), false);
    await tokenFarm.createPool(token2.address, tokens("1"), false);

    // Approve and deposit as the investor
    await token1.approve(tokenFarm.address, tokens("100"), {
      from: investor,
    });
    await token2.approve(tokenFarm.address, tokens("1000"), {
      from: investor,
    });
    await token2.approve(tokenFarm.address, tokens("1000"), {
      from: otherInvestor,
    });

    await tokenFarm.depositTokens(tokens("100"), 0, {
      from: investor,
    });
    await tokenFarm.depositTokens(tokens("600"), 1, {
      from: investor,
    });
    await tokenFarm.depositTokens(tokens("400"), 1, {
      from: investor,
    });
    await tokenFarm.depositTokens(tokens("1000"), 1, {
      from: otherInvestor,
    });

    // Test if the balace has been substracted
    const investorBalanceEnd1 = await token1.balanceOf(investor);
    const investorBalanceEnd2 = await token2.balanceOf(investor);
    const otherInvestorBalanceEnd = await token2.balanceOf(otherInvestor);

    assert.equal(investorBalanceEnd1, 0);
    assert.equal(investorBalanceEnd2, 0);
    assert.equal(otherInvestorBalanceEnd, 0);

    const investorPoolBalance1 = await tokenFarm.userStakeInPool(0, {
      from: investor,
    });
    const investorPoolBalance2 = await tokenFarm.userStakeInPool(1, {
      from: investor,
    });

    const poolSize = await tokenFarm.getPoolSize(1);

    assert.equal(poolSize, tokens("1982"));

    // There is balance and it's taxed correctly
    assert.equal(investorPoolBalance1, tokens("99.1"));
    assert.equal(investorPoolBalance2, tokens("991"));

    // There is balance and it's taxed correctly
    assert.equal(await token1.balanceOf(process.env.DEV_ADDRESS), tokens("0.9"));
    assert.equal(await token2.balanceOf(process.env.DEV_ADDRESS), tokens("18"));
  });

  it("Withdraws the tokens correctly", async () => {
    await tokenFarm.createPool(token1.address, tokens("1"), false);
    await token1.transfer(investor, tokens("1000"));
    await token1.transfer(otherInvestor, tokens("200"));
    await token1.approve(tokenFarm.address, tokens("1000"), { from: investor });
    await token1.approve(tokenFarm.address, tokens("200"), { from: otherInvestor });

    await tokenFarm.depositTokens(tokens("1000"), 0, { from: investor });
    await tokenFarm.depositTokens(tokens("200"), 0, { from: otherInvestor });

    await tokenFarm.withdrawTokens(tokens("100"), 0, { from: investor });
    const investorBalanceAfter = await token1.balanceOf(investor);
    const investorStakeAfter = await tokenFarm.userStakeInPool(0, { from: investor });
    const devBalanceAfter = await token1.balanceOf(process.env.DEV_ADDRESS);
    const poolSizeAfter = await tokenFarm.getPoolSize(0);

    assert.equal(investorBalanceAfter, tokens("96.5"));
    assert.equal(investorStakeAfter, tokens("891"));
    assert.equal(devBalanceAfter, tokens("14.3"));
    assert.equal(poolSizeAfter, tokens("1089.2"));
  });

  it("Prevents invalid deposits", async () => {
    await tokenFarm.createPool(token1.address, tokens("1"), false);
    await tokenFarm.createPool(token2.address, tokens("1"), false);

    // Try to deposit without the needed funds
    await truffleAssert.reverts(
      tokenFarm.depositTokens(tokens("10"), 0, {
        from: investor,
      }),
      "ERC20: transfer amount exceeds balance"
    );

    await token1.transfer(investor, tokens("100"));
    await token1.approve(tokenFarm.address, tokens("100"), { from: investor });

    await tokenFarm.depositTokens(1, 0, { from: investor });
    await truffleAssert.reverts(
      tokenFarm.withdrawTokens(1, 0, { from: investor }),

      "LIME_FARM: Invalid withdrawal amount"
    );

    // Cannot deposit 0 tokens
    await truffleAssert.reverts(
      tokenFarm.depositTokens(tokens("0"), 0, {
        from: investor,
      }),
      "LIME_FARM: Amount must be greater than 0"
    );

    // Try to deposit tokens in a non-exisitng pool
    try {
      await tokenFarm.depositTokens(tokens("100"), 10, {
        from: investor,
      });
    } catch (e) {}
  });

  it("Prevents invalid withdrawals", async () => {
    await token1.transfer(investor, tokens("1000"));
    await tokenFarm.createPool(token1.address, tokens("1"), false);

    // Try to withdraw in an existing pool without funds
    await truffleAssert.reverts(
      tokenFarm.withdrawTokens(tokens("10"), 0),
      "LIME_FARM: Invalid withdrawal amount"
    );

    // Try to withdraw in a non-existing pool
    try {
      await tokenFarm.withdrawTokens(tokens("10"), 5);
    } catch (e) {}

    await token1.approve(tokenFarm.address, tokens("1000"), {
      from: investor,
    });

    await tokenFarm.depositTokens(tokens("1000"), 0, { from: investor });
    await tokenFarm.withdrawTokens(tokens("500"), 0, { from: investor });
    await truffleAssert.reverts(
      tokenFarm.withdrawTokens(tokens("500"), 0),
      "LIME_FARM: Invalid withdrawal amount"
    );
  });

  it("Harvests tokens correctly", async () => {
    await tokenFarm.createPool(token1.address, tokens("100"), false);

    // Inital transfers and approvals
    await token1.transfer(investor, tokens("1000"));
    await token1.transfer(otherInvestor, tokens("10000"));
    await token1.approve(tokenFarm.address, tokens("1000"), {
      from: investor,
    });
    await token1.approve(tokenFarm.address, tokens("10000"), {
      from: otherInvestor,
    });

    await tokenFarm.depositTokens(tokens("1000"), 0, { from: investor });
    await tokenFarm.depositTokens(tokens("10000"), 0, { from: otherInvestor });

    await advanceBlocks(8);

    await tokenFarm.withdrawTokens(tokens("800"), 0, { from: investor });

    await advanceBlocks(19);

    await token1.approve(tokenFarm.address, tokens("50"), { from: investor });
    await tokenFarm.depositTokens(tokens("50"), 0, { from: investor });

    await advanceBlocks(18);

    await tokenFarm.withdrawTokens(tokens("240.55"), 0, { from: investor });

    await advanceUntilHarvesting(tokenFarm);

    await tokenFarm.harvestLimes(0, { from: investor });

    const poolSize = await tokenFarm.getPoolSize(0);
    const userStake = await tokenFarm.userStakeInPool(0, { from: investor });
    const userTokenBalance = await token1.balanceOf(investor);
    const devTokenBalance = await token1.balanceOf(process.env.DEV_ADDRESS);
    const userLimes = await limeToken.balanceOf(investor);

    assert(poolSize.eq(tokensBN("9910")), "Pool size is not correct");
    assert(userStake.eq(tokensBN("0")), "User stake is not correct");
    assert(userTokenBalance.eq(tokensBN("954.13075")), "User Token balance is not correct");
    assert(devTokenBalance.eq(tokensBN("135.86925")), "Dev Token balance is not correct");
    assert(
      userLimes.gt(tokensBN("175")) && userLimes.lt(tokensBN("177")),
      "User Limes balance is not correct"
    );
  });

  it("Denies harvesting in non-harvesting periods", async () => {
    await tokenFarm.createPool(token1.address, tokens("100"), false);
    await token1.transfer(investor, tokens("1000"));
    await token1.approve(tokenFarm.address, tokens("1000"), {
      from: investor,
    });
    await tokenFarm.depositTokens(tokens("1000"), 0, { from: investor });

    await advanceUntilHarvesting(tokenFarm);
    await advanceTime(DAY_SECONDS);

    await truffleAssert.reverts(
      tokenFarm.harvestLimes(0, { from: investor }),
      "LIME_FARM: Not in harvesting period"
    );
  });

  it("Creates tax-free pools", async () => {
    await tokenFarm.createPool(token1.address, tokens("100"), true);
    await token1.transfer(investor, tokens("1000"));
    await token1.approve(tokenFarm.address, tokens("1000"), {
      from: investor,
    });
    await tokenFarm.depositTokens(tokens("1000"), 0, { from: investor });
    const userStakeWhenDeposit = await tokenFarm.userStakeInPool(0, { from: investor });
    assert.equal(userStakeWhenDeposit, tokens("1000"));

    await tokenFarm.withdrawTokens(tokens("1000"), 0, { from: investor });
    const userBalance = await token1.balanceOf(investor);
    assert.equal(userBalance, tokens("1000"));
  });
  it("Indicates the harvesting amount correctly", async () => {
    await tokenFarm.createPool(token1.address, tokens("100"), false);

    // Inital transfers and approvals
    await token1.transfer(investor, tokens("1000"));
    await token1.approve(tokenFarm.address, tokens("1000"), {
      from: investor,
    });
    await token1.transfer(otherInvestor, tokens("10000"));
    await token1.approve(tokenFarm.address, tokens("10000"), {
      from: otherInvestor,
    });

    await tokenFarm.depositTokens(tokens("1000"), 0, { from: investor });
    await tokenFarm.depositTokens(tokens("10000"), 0, { from: otherInvestor });

    await advanceBlocks(18);

    await tokenFarm.withdrawTokens(tokens("900"), 0, { from: investor });

    await advanceBlocks(19);

    const availableHarvest = await tokenFarm.userAvailableHarvest(0, { from: investor });

    assert(availableHarvest.gt(tokensBN("199")) && availableHarvest.lt(tokensBN("201")));
  });

  it("Checkpoints the pool correctly", async () => {
    await tokenFarm.createPool(token1.address, tokens("100"), false);

    // Inital transfers and approvals
    await token1.transfer(investor, tokens("1000"));
    await token1.approve(tokenFarm.address, tokens("1000"), {
      from: investor,
    });
    await token1.transfer(otherInvestor, tokens("10000"));
    await token1.approve(tokenFarm.address, tokens("10000"), {
      from: otherInvestor,
    });

    await tokenFarm.depositTokens(tokens("1000"), 0, { from: investor });

    await advanceBlocks(20); // 20 blocks, earn rewards
    const availableHarvestBefore = await tokenFarm.userAvailableHarvest(0, { from: investor });
    assert(availableHarvestBefore.eq(tokensBN("2000")), "Before: Rewards not correct");

    // CHECKPOINT the available harvest
    await tokenFarm.checkpoint(0, { from: investor });

    await tokenFarm.depositTokens(tokens("10000"), 0, { from: otherInvestor });
    const availableHarvestAfter = await tokenFarm.userAvailableHarvest(0, { from: investor });
    assert(
      availableHarvestAfter.lt(tokensBN("2110")) && availableHarvestAfter.gt(tokensBN("2109")),
      "Before: Rewards not correct"
    );
  });
});
