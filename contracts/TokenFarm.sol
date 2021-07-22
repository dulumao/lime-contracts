// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./LimeToken.sol";

interface ITokenFarm {

    struct Pool {
        uint256 poolSize;
        uint256 limePerBlock;
        bool taxFree;
        // The actual token to be staked
        IERC20 token;
    }
    struct UserInfo {
        uint256 stakedAmount;
        uint256 stakeBlock;
        uint256 debt;
    }
    // Events
    event Deposit(
        address indexed user,
        uint256 indexed poolIndex,
        uint256 amount
    );
    event Withdrawal(
        address indexed user,
        uint256 indexed poolIndex,
        uint256 amount
    );

    /**
     * @dev Deposit `_amount` tokens in the pool `_poolIndex` for harvesting.
     * Calls transferRewardsToDebt to store the current rewards.
     * Calls transferFrom in the desired token.
     * Increases taxed(`_amount`) from poolSize
     * Charge 0.9% tax on it (if not tax-free pool)
     */
    function depositTokens(uint256 _amount, uint128 _poolIndex)
        external
        returns (bool);

    /**
     * @dev Withdraw `_amount` tokens from the harvesting pool `_poolIndex`.
     * Calls transferRewardsToDebt to store the current rewards
     * Reduces `_amount` from poolSize
     * Charge 3.5% tax on it (if not tax-free pool)
     */
    function withdrawTokens(uint256 _amount, uint128 _poolIndex)
        external
        returns (bool);

    /**
     * @dev Harvest the earned tokens in the pool `_poolIndex`, which are:
     * UserInfo.debt + calculateAmount(pool, holdings)
     * Can only be called on harvesting periods
     */
    function harvestLimes(uint128 _poolIndex) external;

    /**
     * @dev Create a pool with the token `_token`
     * Determine if the pool charges taxes with `_taxFree`
     * Determine how much LIME it's multiplied with the block delta with `_limePerBlock`
     * Can only be called by the owner
     */
    function createPool(
        IERC20 _token,
        uint256 _limePerBlock,
        bool _taxFree
    ) external;


    /**
    //  * @dev Function that calls `setExcludedFromAntiWhale` in
    //  * LimeToken so liquidity can be added without trouble.
    //  * 1. Calculates the address of the pair using `getPairFor`
    //  * 2. Excludes the address from the anti-whale system
    //  */
    // function prepareTokenForLiquidity(
    //     address factory,
    //     address token
    // ) external;


    /**
     * @dev Function that transfers rewards to debt in the pool `poolIndex`
     * creating a "Checkpoint", meaning that the earned tokens are now
     * fixed.
     */
    function checkpoint(
        uint128 _poolIndex
    ) external;


    /**
     * @dev View function to check if harvesting is enabled
     * Will check if the timestamp is divisible by 7 days
     */
    function isHarvestingPeriod() external view returns (bool);

    /**
     * @dev View function to check how many pools there are
     */
    function totalPools() external view returns (uint256);

    /**
     * @dev View function to check how much stake a user has in
     * the pool `_poolIndex`
     */
    function userStakeInPool(uint128 _poolIndex) external view returns (uint256);

    /**
     * @dev View function to check how much LIME the user would receive
     * if they harvested in the moment
     * in the pool `_poolIndex`
     */
    function userAvailableHarvest(uint128 _poolIndex)
        external
        view
        returns (uint256);

    /**
     * @dev View function to check the pool size of `_poolIndex`
     */
    function getPoolSize(uint128 _poolIndex) external view returns (uint256);

    /**

     * @dev View function to get the pools
     */
    function getPools() external view returns (Pool[] memory);
}

contract TokenFarm is Ownable, ITokenFarm{

    string public name = "LIME Token Farm";

    // The LIME token
    LimeToken public limeToken;

    // Owner and dev addresses
    address public dev;

    Pool[] public pools;

    // holdings stores how many tokens are staked by each user
    // mapping(poolIndex => mapping(userAddress => UserInfo))

    mapping(uint256 => mapping(address => UserInfo)) public holdings;

    modifier onHarvestingPeriod() {
        require(
            block.timestamp % 14 days < 1 days,
            "LIME_FARM: Not in harvesting period"
        );
        _;
    }

    constructor(address _dev, LimeToken _limeToken) {
        limeToken = _limeToken;
        dev = _dev;
    }

    function createPool(
        IERC20 _token,
        uint256 _limePerBlock,
        bool _taxFree
    ) external override onlyOwner {
        pools.push(
            Pool({
                poolSize: 0,
                token: _token,
                limePerBlock: _limePerBlock,
                taxFree: _taxFree
            })
        );
    }

    function depositTokens(uint256 _amount, uint128 _poolIndex)
        external
        override
        returns (bool)
    {
        require(_amount > 0, "LIME_FARM: Amount must be greater than 0");

        Pool storage pool = pools[_poolIndex];
        UserInfo storage _userInfo = holdings[_poolIndex][address(msg.sender)];

        if (_userInfo.stakedAmount > 0) {
            // Store current rewards as debt and reset the block
            transferRewardsToDebt(_poolIndex);
        } else {
            _userInfo.stakeBlock = block.number;
        }

        // Transfer the tokens to the contract
        pool.token.transferFrom(address(msg.sender), address(this), _amount);
        uint256 amountToDeposit;

        if (pool.taxFree) {
            amountToDeposit = _amount;
        } else {
            // Dev commission (0.9% in deposits)
            pool.token.transfer(dev, _amount * 90 / 10000 );
            // Save the remaining amount deposited
            amountToDeposit = _amount * 9910 / 10000;
        }

        _userInfo.stakedAmount += amountToDeposit;

        pools[_poolIndex].poolSize += 
            amountToDeposit;

        emit Deposit(address(msg.sender), _poolIndex, amountToDeposit);

        return true;
    }

    function withdrawTokens(uint256 _amount, uint128 _poolIndex)
        external
        override
        returns (bool)
    {
        Pool storage pool = pools[_poolIndex];
        UserInfo storage _userInfo = holdings[_poolIndex][address(msg.sender)];

        // Amount shouldn't be 0 and the user needs to have the balance
        require(
            _amount > 0 && _userInfo.stakedAmount >= _amount,
            "LIME_FARM: Invalid withdrawal amount"
        );

        transferRewardsToDebt(_poolIndex);

        _userInfo.stakedAmount -= _amount;
        pool.poolSize -= _amount;

        if (pool.taxFree) {
            pool.token.transfer(address(msg.sender), _amount);
        } else {
            // Dev comission (3.5% in withdrawals)
            pool.token.transfer(dev, _amount / 1000 * 35);
            pool.token.transfer(
                address(msg.sender),
                _amount / 1000 * 965
            );
        }


        emit Withdrawal(address(msg.sender), _poolIndex, _amount);

        return true;
    }

    function harvestLimes(uint128 _poolIndex) external override onHarvestingPeriod {
        Pool storage pool = pools[_poolIndex];
        UserInfo storage _userInfo = holdings[_poolIndex][address(msg.sender)];

        uint256 debt = _userInfo.debt;
        uint256 lastRewards = calculateRewards(
            block.number - _userInfo.stakeBlock,
            pool.limePerBlock,
            _userInfo.stakedAmount,
            pool.poolSize
        );

        // Reset the block and debt
        _userInfo.stakeBlock = block.number;
        _userInfo.debt = 0;

        limeToken.mint(address(msg.sender), debt + lastRewards);
    }

    function checkpoint(
        uint128 _poolIndex
    ) external override {
        transferRewardsToDebt(_poolIndex);
    }


    /**
     * @dev Internal function that checks the user staked amount,
     * calculates the rewards for it and stores them as debt. Then it
     * resets the stakeBlock to the current block number.
     */
    function transferRewardsToDebt(uint128 _poolIndex) internal {
        Pool storage pool = pools[_poolIndex];
        UserInfo storage _userInfo = holdings[_poolIndex][address(msg.sender)];
        uint256 rewards = calculateRewards(
            block.number - _userInfo.stakeBlock,
            pool.limePerBlock,
            _userInfo.stakedAmount,
            pool.poolSize
        );
        _userInfo.debt += rewards;
        _userInfo.stakeBlock = block.number;
    }

    /**
     * @dev Pure function that calculates how much LIME the user needs to get.
     * Amount = blocks holded * LIME per block * (stake / poolSize)
     *
     */
    function calculateRewards(
        uint256 _blocksHolded,
        uint256 _limePerBlock,
        uint256 _stake,
        uint256 _poolSize
    ) internal pure returns (uint256) {
        require(
            _stake <= _poolSize,
            "LIME_FARM: Invalid rewards calculation"
        );
        if (_poolSize < 1 ether){
            return _blocksHolded
                * _limePerBlock;
        } 
        return
            _blocksHolded
                 * _limePerBlock
                 * (_stake / (_poolSize / 1 ether))
                 / 1 ether;
    }

    // function prepareTokenForLiquidity(
    //     address factory,
    //     address token
    // ) external override onlyOwner {
    //     address pair = limeToken.getPairFor(factory, token);
    //     limeToken.setExcludedFromAntiWhale(pair, true);
    // }

    // --------- VIEW FUNCTIONS -----------

    function isHarvestingPeriod() external override view returns (bool) {
        return block.timestamp % 14 days < 1 days;
    }

    function userStakeInPool(uint128 _poolIndex)
        external
        override
        view
        returns (uint256)
    {
        return holdings[_poolIndex][address(msg.sender)].stakedAmount;
    }

    function userAvailableHarvest(uint128 _poolIndex)
        external
        view
        override
        returns (uint256)
    {
        UserInfo storage _userInfo = holdings[_poolIndex][address(msg.sender)];
        Pool storage _poolInfo = pools[_poolIndex];

        uint256 additionalRewards;

        if( _userInfo.stakedAmount > 0 ){
            additionalRewards = calculateRewards(
                block.number - _userInfo.stakeBlock,
                _poolInfo.limePerBlock,
                _userInfo.stakedAmount,
                _poolInfo.poolSize
            );
        }
        else{
            additionalRewards = 0;
        }
        return _userInfo.debt + additionalRewards;

    }

    function totalPools() external view override returns (uint256) {
        return pools.length;
    }

    function getPoolSize(uint128 _poolIndex) external view override returns (uint256) {
        return pools[_poolIndex].poolSize;
    }

    function getPools() external view override returns (Pool[] memory) {
        return pools;
    }
}
