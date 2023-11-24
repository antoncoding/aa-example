import { BigNumber, constants, ethers, utils } from 'ethers'
import { addresses } from '../addresses';
import { signReceiveWithAuth } from "../sigUtils"
import withdrawalHelperAbi from "../abi/withdraw-helper.json";
import usdcAbi from "../abi/usdc.json";

// dot env
import dotenv from 'dotenv'
dotenv.config()

const RPC_URL = process.env.LYRA_TESTNET_RPC!

const OWNER_PK = process.env.OWNER_PRIVATE_KEY!

const networkConfig = addresses.lyraTestnet

// This will be connected wallet in Metamask
const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const user = new ethers.Wallet(OWNER_PK, provider);


// contract instances
const helper = new ethers.Contract(networkConfig.withdrawalHelper, withdrawalHelperAbi, user);

/**
 * npx ts-node examples/l2/withdraw-fast-connector.ts
 * 
 */
async function run() {
  console.log('Withdraw USDC from Lyra Chain', user.address)
  console.log('NetworkID:\t', (await (provider.getNetwork())).chainId)


  const usdc = new ethers.Contract(networkConfig.usdc, usdcAbi, user.provider)
  const balance = await usdc.balanceOf(user.address)
  console.log('USDC Balance:\t', utils.formatUnits(balance, 6), 'USDC')

  const amount = '50000000';
  console.log('Withdrawing:\t', utils.formatUnits(amount, 6), 'USDC')

  // whole tx
  const minGas = '500000'

  const feeInUSDC = await helper.getFeeUSDC(networkConfig.fastConnector, minGas)
  console.log('Fee in USDC:\t', utils.formatUnits(feeInUSDC, 6), 'USDC')
  
  // these txs should be batched

  const allowance = await usdc.allowance(user.address, networkConfig.withdrawalHelper)
  if (allowance <  amount ) {
    // 1. approve
    const tx1 = await usdc.connect(user).approve(networkConfig.withdrawalHelper, balance)
    console.log('Approving...\t', tx1.hash)
  }

  // 2. withdraw
  const tx = await helper.connect(user).withdrawToL1(amount, user.address, networkConfig.fastConnector, minGas)
  console.log('Withdraw Tx:\t', tx.hash)
}


run();